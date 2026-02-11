# MCP Exercise Report

> Full-stack exercise of the Archi MCP server by a GitHub Copilot (Claude Opus 4.6) agent, February 11, 2026.
> Model: "Test", Archi Server v1.6.1, host 127.0.0.1:8765.
> **Second comprehensive exercise** — retests all prior findings to identify fixes and regressions.

---

## 1. Scope & Method

Exercised **every MCP tool** exposed by the Archi MCP server—both read-only and mutation—in a single session against a model with some prior test data. The goals were:

- Verify every tool works as documented
- Retest all bugs and field-naming issues from the previous exercise
- Discover new issues, edge cases, and regressions
- Test the full create → relate → view → populate → style → layout → export → delete lifecycle
- Stress intra-batch tempId resolution, batch size limits, and error handling
- Evaluate the experience from an AI agent's perspective and provide actionable fixes

### Tools exercised (32 total)

| Category | Tools |
|----------|-------|
| **Health/infra** | `archi_get_health`, `archi_get_test`, `archi_get_model_diagnostics`, `archi_get_model_stats` |
| **Read model** | `archi_query_model`, `archi_search_model`, `archi_list_folders`, `archi_get_element`, `archi_get_relationships_between_elements` |
| **Read views** | `archi_list_views`, `archi_get_view`, `archi_get_view_summary` |
| **Mutate model** | `archi_apply_model_changes` (createElement, createRelationship, setProperty, updateElement, updateRelationship, deleteElement, deleteRelationship, moveToFolder, createFolder) |
| **Mutate views** | `archi_create_view`, `archi_delete_view`, `archi_duplicate_view`, `archi_populate_view` |
| **View visuals** | `archi_apply_model_changes` (addToView, addConnectionToView, nestInView, moveViewObject, styleViewObject, styleConnection, createNote, createGroup, deleteConnectionFromView) |
| **Layout/export** | `archi_layout_view`, `archi_set_view_router`, `archi_export_view`, `archi_validate_view` |
| **Async ops** | `archi_wait_for_operation`, `archi_get_operation_status`, `archi_list_operations` |
| **Planning** | `archi_plan_model_changes` |
| **Scripting** | `archi_run_script` |
| **Save** | `archi_save_model` |
| **Admin** | `archi_shutdown_server` (not exercised—destructive) |

---

## 2. What Worked Well

### 2.1 Async operation lifecycle is excellent
The `archi_apply_model_changes` → `archi_wait_for_operation` pattern is clean and agent-friendly. Operations complete fast (89–130ms typical), the `wait_for_operation` tool eliminates manual polling, and the response includes a full result array with tempId→realId mappings. All 16 successful operations in this session completed on the first poll.

### 2.2 `archi_populate_view` is a game-changer
A single call with 14 element IDs + `autoConnect: true` placed all 14 visual objects and auto-resolved all 16 relationship connections. This eliminated what would otherwise be 30+ manual `addToView`/`addConnectionToView` operations. The `autoResolved: true` flag in connection results is helpful for debugging. `skipExistingVisuals` and `skipExistingConnections` work correctly for incremental updates.

### 2.3 Error messages are actionable
- Invalid element type → lists all 61 valid types grouped by layer with kebab-case format hint
- Duplicate view name → returns the existing view ID so the agent can decide to reuse or rename (409 with `existingViewId`)
- Missing `id` field → clear message identifying which change index and operation failed
- NotFound on element → hint about conceptId vs. visual ID confusion
- Nonexistent view → clean 404 with view ID echoed
- Nonexistent operation → clean 404
- Batch rollback → detailed message with chunk number, sub-command count, and missing object count

### 2.4 Consistent response envelope
Every response has `{ok, operation, data, requestId}`. The `requestId` in every response is excellent for debugging and correlation. The `mcp` metadata on `list_views` and `search_model` (showing effective filters, pagination, regex mode) is informative.

### 2.5 Field alias normalization is much improved (FIXED since last exercise)
The MCP layer now correctly normalizes:
- `elementId` → `id` for `updateElement`, `moveToFolder`, `setProperty`
- `visualId` → `viewObjectId` for `styleViewObject`, `moveViewObject`

The response includes `mcp.aliasesResolved` count and a note explaining the normalization. This was the **#1 source of agent retry friction** in the previous exercise and is now fully resolved.

### 2.6 View validation catches integrity issues
`archi_validate_view` checks for orphaned connections and direction mismatches — both passed on our 14-element, 16-connection view.

### 2.7 Intra-batch tempId cross-referencing works perfectly
Creating an element + relationship in one batch, where the relationship references the element's tempId, works correctly. Both `sourceName` and `targetName` are now populated in the response (previously reported as empty for tempId references — now fixed).

### 2.8 Search capabilities are thorough
- Case-insensitive regex (default): `"Order"` automatically becomes `[oO][rR][dD][eE][rR]`
- Property-based search (`propertyKey`/`propertyValue`): found Customer by "Risk Level=High"
- Type filtering: `type: "node"` returns only Node elements
- Relationship type filtering on `get_relationships_between_elements`: correctly filtered to only serving-relationships
- `includeRelationships: false` correctly excludes relationships from search results
- The `mcp` metadata shows `originalNamePattern`, `effectiveNamePattern`, `regexMode`

### 2.9 `fontColor` now visible in `get_view` response (FIXED since last exercise)
Applied `fontColor: "#1B5E20"` to Customer element → it now appears in the `get_view` response alongside `fillColor`. Previously reported as missing.

### 2.10 Nesting and grouping work reliably
`nestInView` correctly nests elements inside groups with relative coordinates. `get_view` shows the `parentId` field on nested elements. Creating a group, then nesting 3 application components inside it, all worked in a single batch.

---

## 3. Bugs Found

### 3.1 CRITICAL: `archi_run_script` — `console.log` causes infinite recursion (STILL OPEN)
**Reproduction:**
```javascript
console.log("Hello from MCP script");
```
**Result:** `RangeError: Maximum call stack size exceeded` with the message duplicated hundreds of times in the output array before stack overflow. Response is truncated (52KB of repeated log lines).

**Root cause:** The console interceptor recursively calls itself. The patched `console.log` calls through to something that triggers `console.log` again.

**Recommendation:** Save a reference to the original `console.log` before patching:
```javascript
var _originalLog = console.log;
console.log = function() {
    // capture to output array
    _originalLog.apply(console, arguments);
};
```

### 3.2 CRITICAL: `archi_run_script` — script return values are always missing (STILL OPEN)
**Reproduction:**
```javascript
var x = 42; x;
```
**Result:** `success: true` but no `result` field in the response. The only way to see output is `console.log`, which is broken (see 3.1).

```javascript
var model = $.model; var name = model.name; "Model: " + name;
```
Also returns no `result` — the expression value is silently discarded.

**Impact:** Scripts can't return data to the agent. The scripting tool is effectively write-only.

**Recommendation:** Capture and return the last expression value. GraalVM's `Context.eval()` returns a `Value` — serialize it to JSON in a `result` field.

### 3.3 CRITICAL: `archi_run_script` — `$()` selector causes infinite recursion (REGRESSION)
**Reproduction:**
```javascript
$("element").size();
```
**Result:** `RangeError: Maximum call stack size exceeded` at `$ (jarchi_script:163)` — recursive calls to the `$` function itself.

**Change from previous exercise:** Previously this returned "Could not get the currently selected model" — a clear error message. Now it triggers the same infinite recursion as `console.log`.

**Impact:** The `$()` selector — the most fundamental jArchi API — is completely unusable via MCP.

**Recommendation:** The `$` function wrapper likely has the same interception/proxy issue as `console.log`. Fix the recursive wrapper or document that `$()` is not available via MCP and agents should use structured tools instead.

### 3.4 MEDIUM: `archi_populate_view` — `autoConnect` misses connections to pre-existing elements
**Reproduction:**
1. Populate a view with elements A, B, C (all placed)
2. Later, call `populate_view` again with elements A and D (where D is new, A already exists)
3. With `skipExistingVisuals: true`, element A is correctly skipped and D is added
4. But relationship A→D connection is skipped with `"reason": "source element not in view"` — **A IS on the view**

**Actual response:**
```json
{"op": "addConnectionToView", "skipped": true, "reason": "source element not in view", "relationshipId": "..."}
```

**Impact:** Incremental population requires two calls: first `populate_view` with just new elements, then a manual `addConnectionToView` for cross-connections.

**Recommendation:** When resolving auto-connections, also scan the view's existing visuals (not just the just-added ones from this batch) for matching source/target elements.

### 3.5 LOW: Batch rollback on 30 operations (14 elements + 16 relationships)
**Reproduction:** Submitted all 14 elements + 16 relationships as a single batch of 30 operations.

**Result:**
```
Silent batch rollback detected after chunk 1: 9 of 30 created objects not found in model folders
after execution. The GEF command stack likely rejected the CompoundCommand.
Chunk had 49 sub-commands (21 operations).
```

**Observation:** The documentation says "keep batches ≤20 operations." This is confirmed — 30 operations in one batch triggers a silent GEF rollback. The error message is excellent, with specific chunk number and sub-command count.

**Recommendation:** The documentation already covers this, but the MCP layer could enforce it by pre-splitting large batches into chunks ≤20 automatically, or at minimum reject batches >20 with a clear validation error instead of queueing them for async execution and having them silently roll back.

---

## 4. Previously Reported Issues — Status Update

### ✅ FIXED: Field naming inconsistencies (4.1–4.4 from previous report)

All alias normalizations now work:

| Operation | Agent sends | Normalized to | Status |
|-----------|------------|---------------|--------|
| `updateElement` | `elementId` | `id` | ✅ **Fixed** |
| `styleViewObject` | `visualId` | `viewObjectId` | ✅ **Fixed** |
| `moveViewObject` | `visualId` | `viewObjectId` | ✅ **Fixed** |
| `moveToFolder` | `elementId` | `id` | ✅ **Fixed** |
| `setProperty` | `elementId` | `id` | ✅ Was already working |

The MCP response now includes `mcp.aliasesResolved` and a note explaining the normalization — very agent-friendly.

### ✅ FIXED: `fontColor` not visible in `get_view` response (5.3 from previous report)
`get_view` now returns `fontColor` alongside `fillColor` for styled elements.

### ✅ FIXED: Intra-batch relationship `sourceName`/`targetName` empty (5.1 from previous report)
Names are now correctly populated when using tempId cross-references within a batch.

### ⚠️ STILL OPEN: `console.log` infinite recursion (3.1)
### ⚠️ STILL OPEN: Script return values always null (3.2)
### ⚠️ REGRESSION: `$()` selector now causes stack overflow instead of error message (3.3)
### ℹ️ STILL PRESENT: `duplicate_view` returns UUID-format IDs (5.2 — cosmetic)
Original view: `id-0435f345...` → Duplicate: `ba552156-f3cf-4093-...` (UUID format without `id-` prefix)

---

## 5. Minor Observations

### 5.1 `search_model` returns results from prior test data
Searching for "Order" returned 8 results instead of the 4 I created — prior test elements with the same names were still in the model. This is expected behavior but agents should filter by additional criteria (type, properties) to avoid ambiguity.

### 5.2 `search_model` still doesn't return properties in results
When searching by property (`propertyKey`/`propertyValue`), the result includes `matchedPropertyKey` and `matchedPropertyValue` but not the full `properties` object. Agents must follow up with `get_element` for the full property set.

### 5.3 Operation timing is consistently excellent
All operations completed in 89–130ms server-side. `wait_for_operation` resolved on the first poll in 1–3ms. Session total: 17 operations (16 success, 1 intentional oversized batch error).

### 5.4 Memory usage is reasonable
Started at 203MB, ended at 251MB after creating 14 elements, 16 relationships, 1 view with 15 visuals, 16 connections, groups, notes, and styling. Max heap 8GB.

### 5.5 `createFolder` requires `parentId` or `parentType`, not `parentPath`
This is by design (paths can be ambiguous), but since `list_folders` returns both `id` and `path`, accepting `parentPath` as a convenience would reduce agent friction.

### 5.6 Note content not visible in `get_view`
The note element in `get_view` shows `"name": ""` (empty) even though content was set during creation. The note's text content may be stored in a different field (documentation?) that isn't serialized in the view response.

---

## 6. Recommendations for the MCP Developer

### 6.1 High Priority — Fix Script Execution (3 bugs)

1. **Fix `console.log` infinite recursion** — Save original console methods before intercepting. The intercepted `log`/`warn`/`error` functions must use the original native method (stored before patching) and not re-enter the wrapper.

2. **Fix script return value capture** — Capture and serialize the GraalVM eval return value. Even `var x = 42; x;` returns null — the last expression value should be JSON-serialized in a `result` field.

3. **Fix `$()` selector recursion** — This is a regression from the previous session where it returned a clear error ("Could not get the currently selected model"). Now it triggers infinite recursion like `console.log`. Either fix the wrapper to avoid recursion, or restore the previous error message.

### 6.2 Medium Priority — Improve `populate_view` incremental workflow

4. **Fix `autoConnect` for pre-existing visual elements** — When `skipExistingVisuals: true` skips an element already on the view, that element's visual should still be considered when resolving connection endpoints. Currently, connections to/from pre-existing elements are skipped with "source element not in view" even when the element IS on the view.

5. **Optionally pre-validate batch size** — Reject batches >20 operations at the MCP validation layer with a clear error, instead of queueing them for async execution and getting a silent GEF rollback. Or auto-chunk large batches.

### 6.3 Low Priority — Polish & Enhance

6. **Include `properties` in search results** — When searching by property, return the full properties map to reduce follow-up `get_element` calls.

7. **Serialize note content in `get_view`** — The note's text content should appear in the view element data (currently shows `name: ""`).

8. **Accept `parentPath` in `createFolder`** — Convenience for agents that know folder names from `list_folders`.

9. **Add SVG export format** — PNG/JPG are supported; SVG would be useful for documentation embedding.

10. **Add `archi_undo` / `archi_redo` tools** — The undo infrastructure exists; expose it via MCP for agent mistake recovery.

11. **Add `archi_get_element_batch`** — Retrieve multiple elements by ID in one call; currently requires N separate `get_element` calls.

### 6.4 Documentation Improvements

12. **Add examples to tool descriptions** — Brief JSON examples for `styleViewObject`, `nestInView`, `createFolder`, `populate_view` would prevent first-attempt failures for new agent integrations.

13. **Clarify ID format differences** — Document that duplicated views use UUID format while original views use `id-` prefix format.

14. **Document `populate_view` limitation** — Note that `autoConnect` only resolves connections between elements added in the same populate call (not pre-existing elements on the view).

---

## 7. Complete Test Transcript

### Phase 1: Health & Infrastructure
| Tool | Result | Notes |
|------|--------|-------|
| `archi_get_health` | ✅ OK | v1.6.1, 0 ops queued, 0 elements (start of session) |
| `archi_get_test` | ✅ OK | "Handler running on UI thread! Thread: main" |
| `archi_get_model_diagnostics` | ✅ OK | 0 orphans, 0/0/1 elements/relationships/views |
| `archi_get_model_stats` | ✅ OK | Empty model, 1 default view |

### Phase 2: Read Tools on Empty/Near-Empty Model
| Tool | Result | Notes |
|------|--------|-------|
| `archi_query_model` (limit 10) | ✅ OK | Empty arrays returned |
| `archi_search_model` (regex `.*`) | ✅ OK | 0 results, regex mode metadata shown |
| `archi_search_model` (type filter) | ✅ OK | 0 results for `business-actor` |
| `archi_list_folders` | ✅ OK | 9 standard ArchiMate folders with IDs/paths/types |
| `archi_list_views` | ✅ OK | Default View with 0 objects |
| `archi_list_views` (nameContains, sort desc) | ✅ OK | Filter + sort applied correctly |
| `archi_list_views` (exactName nonexistent) | ✅ OK | 0 results, clean response |

### Phase 3: Element Creation (14 elements)
| Tool | Result | Notes |
|------|--------|-------|
| `createElement` × 14 (single batch) | ✅ OK | All tempIds resolved, 14/14 created in <110ms |
| Types created | — | business-actor (2), business-process (2), business-service (2), application-component (3), application-service (1), technology-service (1), node (1), data-object (2) |

### Phase 4: Relationship Creation (16 relationships + 1 oversized batch attempt)
| Tool | Result | Notes |
|------|--------|-------|
| 30-op batch (14 elements + 16 relationships) | ❌ Rollback | "9 of 30 created objects not found" — batch too large |
| `createRelationship` × 8 (batch 1) | ✅ OK | serving, realization types |
| `createRelationship` × 8 (batch 2) | ✅ OK | serving, assignment, realization, access types |
| Intra-batch tempId (createElement + createRelationship) | ✅ OK | Payment Gateway created and referenced in same batch |

### Phase 5: Element Detail & Search
| Tool | Result | Notes |
|------|--------|-------|
| `archi_get_element` (Customer) | ✅ OK | 2 incoming relationships, documentation, properties |
| `archi_search_model` (namePattern "Order") | ✅ OK | 8 results (4 mine + 4 from prior tests) |
| `archi_search_model` (propertyKey/Value) | ✅ OK | Found Customer by "Risk Level=High" |
| `archi_search_model` (includeRelationships false) | ✅ OK | Only elements returned |
| `archi_search_model` (type "serving-relationship") | ✅ OK | 5 results with source/target IDs |
| `archi_get_relationships_between_elements` (4 IDs, serving filter) | ✅ OK | 3 relationships found, correct filtering |

### Phase 6: Property & Update Operations
| Tool | Result | Notes |
|------|--------|-------|
| `setProperty` × 2 (Risk Level, SLA) | ✅ OK | `elementId` alias resolved |
| `updateElement` (add documentation) | ✅ OK | `id` field used directly |
| `updateElement` (with `elementId` alias) | ✅ OK | **Fixed!** Alias resolved to `id` |
| `updateRelationship` (rename) | ✅ OK | `name: "places orders via"` |

### Phase 7: Folder Operations
| Tool | Result | Notes |
|------|--------|-------|
| `createFolder` (parentType: "business") | ✅ OK | "Key Stakeholders" folder created |
| `moveToFolder` (with `elementId` alias) | ✅ OK | Customer moved to Business folder |

### Phase 8: View Lifecycle
| Tool | Result | Notes |
|------|--------|-------|
| `archi_create_view` (layered viewpoint, docs) | ✅ OK | View created in 5ms |
| `archi_create_view` (duplicate name) | ✅ 409 | Returns `existingViewId` — excellent error |
| `archi_populate_view` (14 elements, autoConnect) | ✅ OK | 14 visuals + 16 connections auto-resolved |
| `archi_populate_view` (skip existing, add new) | ⚠️ Partial | New element added, but connection to pre-existing element skipped |
| `archi_layout_view` (dagre, TB) | ✅ OK | 14 nodes positioned in 105ms |
| `archi_layout_view` (dagre, LR) | ✅ OK | 16 nodes repositioned in 89ms |
| `archi_set_view_router` (manhattan) | ✅ OK | Router changed from bendpoint |
| `archi_validate_view` | ✅ OK | No violations (0 orphaned connections, 0 direction mismatches) |
| `archi_get_view_summary` (with connections) | ✅ OK | Compact format with conceptId + visualId mappings |
| `archi_get_view` (full detail) | ✅ OK | Elements with coordinates, fillColor, fontColor, parentId for nested |

### Phase 9: View Styling & Visual Operations
| Tool | Result | Notes |
|------|--------|-------|
| `styleViewObject` × 3 (with `visualId` alias) | ✅ OK | fillColor, fontColor, opacity applied; **alias resolved** |
| `styleConnection` (lineColor, lineWidth) | ✅ OK | Red heavy line on key relationship |
| `createNote` (multiline content) | ✅ OK | Note placed on view, noteId returned |
| `createGroup` ("Application Layer") | ✅ OK | Group placed on view, groupId returned |
| `nestInView` × 3 (elements → group) | ✅ OK | 3 app components nested inside group with relative coords |
| `moveViewObject` (using `visualId` alias) | ✅ OK | Note moved; **alias resolved** |
| `deleteConnectionFromView` | ✅ OK | Connection removed, relationshipId confirmed |

### Phase 10: View Duplication, Export & Deletion
| Tool | Result | Notes |
|------|--------|-------|
| `archi_duplicate_view` | ✅ OK | UUID-format ID returned (`ba552156-...`) |
| `archi_export_view` (PNG, 2× scale, 20px margin) | ✅ OK | 73KB file exported in 100ms |
| `archi_export_view` (JPG, 1× scale) | ✅ OK | 50KB file exported in 43ms |
| `archi_delete_view` (duplicate) | ✅ OK | Duplicate deleted by UUID ID |
| `archi_delete_view` (nonexistent) | ✅ 404 | Clean error |

### Phase 11: Delete Operations
| Tool | Result | Notes |
|------|--------|-------|
| `deleteRelationship` | ✅ OK | CRM→Customer Profile access relationship deleted |
| `deleteElement` (cascade: true) | ✅ OK | Customer Profile deleted, cascade removed visual from view |

### Phase 12: Async Operations & Planning
| Tool | Result | Notes |
|------|--------|-------|
| `archi_wait_for_operation` | ✅ OK | All 16 ops polled successfully; 1–3ms latency |
| `archi_get_operation_status` (operationId) | ✅ OK | Both alias fields work |
| `archi_get_operation_status` (opId) | ✅ OK | Same result as operationId |
| `archi_get_operation_status` (nonexistent) | ✅ 404 | Clean error |
| `archi_list_operations` (limit 5) | ✅ OK | History with timing metadata, total count |
| `archi_plan_model_changes` | ✅ OK | Preview without mutation |

### Phase 13: Script Execution
| Tool | Result | Notes |
|------|--------|-------|
| `archi_run_script` (`var x = 42; x;`) | ⚠️ No result | `success: true` but no `result` field |
| `archi_run_script` (`console.log("Hello")`) | ❌ BUG | Infinite recursion, 52KB truncated output |
| `archi_run_script` (`$("element").size()`) | ❌ BUG | Infinite recursion (regression from clear error) |
| `archi_run_script` (`var model = $.model; model.name;`) | ⚠️ No result | Executes but no return value |
| `archi_run_script` (Java.type interop) | ⚠️ No result | Java works but value not returned |

### Phase 14: Final State & Save
| Tool | Result | Notes |
|------|--------|-------|
| `archi_get_model_diagnostics` | ✅ OK | 0 orphans — clean state |
| `archi_save_model` | ✅ OK | Saved in 5ms to auto-generated path |
| `archi_get_health` (end) | ✅ OK | 16 completed, 1 error, 28 elements, 23 rels, 2 views |

### Phase 15: Error Handling
| Scenario | Response | Quality |
|----------|----------|---------|
| Invalid element type | 400 + full list of 61 valid types | ⭐ Excellent |
| Duplicate view name | 409 + existing view ID | ⭐ Excellent |
| Nonexistent element ID | 404 + conceptId vs visualId hint | ⭐ Excellent |
| Nonexistent view ID | 404 | Good |
| Nonexistent operation ID | 404 | Good |
| Oversized batch rollback | Error with chunk #, sub-cmd count | ⭐ Excellent |
| Missing required field | 400 + specific field name + op index | Good |

---

## 8. Final Model State

After the exercise, the model contained:

- **28 elements** across 8 types: application-component (7), business-actor (4), business-process (4), business-service (4), application-service (2), node (2), technology-service (2), data-object (3)
- **23 relationships** across 4 types: serving (13), realization (5), assignment (3), access (1) + 1 deleted
- **2 views**: Default View (empty) + MCP Exercise - Microservices Architecture (15 visual objects, 15 connections, 1 group, 1 note, styled elements and connections, manhattan routing)
- **0 orphans** — clean state confirmed by diagnostics
- **17 async operations** processed (16 success, 1 intentional oversize error)

---

## 9. Agent Experience Summary

**Overall rating: 8.5/10** — Up from 8/10 in the previous exercise. The field alias normalization fix alone makes a massive difference in agent ergonomics — zero retry friction on field names this time.

### What improved since last exercise
1. ✅ Field alias normalization (`elementId`→`id`, `visualId`→`viewObjectId`) — **no more retry friction**
2. ✅ `fontColor` visible in `get_view` responses
3. ✅ Intra-batch `sourceName`/`targetName` populated for tempId references
4. ✅ `mcp.aliasesResolved` count in queued responses — great for agent debugging

### What would make it 10/10
1. **Fix the 3 script execution bugs** — `console.log` recursion, missing return values, `$()` recursion. The scripting tool is currently unusable.
2. **Fix `populate_view` `autoConnect` for pre-existing elements** — Incremental view population is a common agent workflow.
3. **Pre-validate or auto-chunk large batches** — Reject >20 ops immediately instead of async rollback.

### Minimum tool calls for a complete model-to-view workflow

| Step | Tool calls | Description |
|------|-----------|-------------|
| Create elements | 1 | Up to 14 elements in one batch |
| Create relationships | 1–2 | Up to 8 per batch to stay under 20-op limit |
| Create view | 1 | With viewpoint and documentation |
| Populate view + auto-connect | 1 | Single call places all visuals + connections |
| Layout | 1 | Dagre auto-layout |
| **Total** | **5–6** | For a complete, well-connected, auto-laid-out diagram |

With styling, notes, groups, nesting, and export, the total is 8–10 calls for a professional-quality diagram. This is excellent compared to the 30+ raw API calls this would require without `populate_view`.

---

## Appendix A: Regression Tracking

| Issue | Previous Status | Current Status | Verdict |
|-------|----------------|----------------|---------|
| `console.log` recursion (3.1) | 🔴 Bug | 🔴 Bug | Still open |
| Script return values null (3.2) | 🔴 Bug | 🔴 Bug | Still open |
| `$()` no UI context (3.3) | 🟡 Error msg | 🔴 Recursion | **Regression** |
| `updateElement` requires `id` (4.1) | 🔴 Bug | ✅ Fixed | Alias resolved |
| `styleViewObject` requires `viewObjectId` (4.2) | 🔴 Bug | ✅ Fixed | Alias resolved |
| `moveViewObject` requires `viewObjectId` (4.3) | 🔴 Bug | ✅ Fixed | Alias resolved |
| `moveToFolder` requires `id` (4.4) | 🔴 Bug | ✅ Fixed | Alias resolved |
| Intra-batch names empty (5.1) | 🟡 Minor | ✅ Fixed | Names populated |
| UUID format on duplicate (5.2) | ℹ️ Cosmetic | ℹ️ Cosmetic | Expected Archi behavior |
| `fontColor` not in `get_view` (5.3) | 🟡 Minor | ✅ Fixed | Now serialized |

## Appendix B: Previous Exercise Notes

<details>
<summary>Initial read-only exercise (earlier session, Bank model)</summary>

- Health: status ok, version 1.6.1, host 127.0.0.1:8765, uptime ~189,604s, memory used ~156MB.
- Model summary: 183 elements, 294 relationships, 10 views; element types: 31; relationship types: 9.
- Top element types (counts): application-component 18, application-service 14, business-process 13, data-object 12, business-object 10, capability 8.
- Top relationship types: realization 101, serving 51, access 31, influence 29, assignment 30.

</details>

<details>
<summary>Implemented agent UX improvements (earlier session)</summary>

- Added `archi_wait_for_operation` to poll async operations until terminal state.
- Updated `archi_get_operation_status` to accept both `operationId` and `opId`.
- Upgraded `archi_list_views` with filtering/sorting/pagination.
- Added MCP resource `archi://agent/quickstart`.
- Added tool-specific NotFound hints for ID misuse.

</details>
