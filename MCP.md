# MCP Exercise Report

> Full-stack exercise of the Archi MCP server by a GitHub Copilot (Claude Opus 4.6) agent, February 11, 2026.
> Model: "Test" (empty at start), Archi Server v1.6.1, host 127.0.0.1:8765.

---

## 1. Scope & Method

Exercised **every MCP tool** exposed by the Archi MCP server—both read-only and mutation—in a single session against a fresh empty model. The goal was to:

- Verify that each tool works as documented
- Discover field-naming inconsistencies that cause agent confusion
- Test the full create → relate → view → populate → style → layout → export → delete lifecycle
- Stress intra-batch tempId resolution, error handling, and edge cases
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
The `archi_apply_model_changes` → `archi_wait_for_operation` pattern is clean and agent-friendly. Operations complete fast (<130ms typical), the `wait_for_operation` tool eliminates manual polling, and the response includes a full result array with tempId→realId mappings.

### 2.2 `archi_populate_view` is a game-changer
A single call with 8 element IDs + `autoConnect: true` placed all 8 visual objects and auto-resolved all 7 relationship connections. This eliminated what would otherwise be 15+ manual `addToView`/`addConnectionToView` operations. The `autoResolved: true` flag in connection results is helpful for debugging.

### 2.3 Error messages are actionable
- Invalid element type → lists all 61 valid types grouped by layer with kebab-case format hint
- Duplicate view name → returns the existing view ID so the agent can decide to reuse or rename
- Missing `id` field → clear message identifying which change index and operation failed
- NotFound on element → hint about conceptId vs. visual ID confusion

### 2.4 Consistent response envelope
Every response has `{ok, operation, data, requestId}`. The `requestId` in every response is excellent for debugging and correlation. The `mcp` metadata on list_views and search_model (showing effective filters, pagination, regex mode) is helpful.

### 2.5 View validation catches integrity issues
`archi_validate_view` checks for orphaned connections and direction mismatches—exactly what an agent needs after complex view modifications.

### 2.6 Intra-batch tempId cross-referencing works
Creating 2 elements + 2 relationships in one batch, where relationships reference tempIds from elements created in the same batch, works correctly. Mixed references (tempId for new element + realId for existing element) also work.

### 2.7 Search capabilities are thorough
Property-based search (`propertyKey`/`propertyValue`), type filtering, relationship type filtering via `get_relationships_between_elements`, and regex name patterns all work as expected. Case-insensitive mode is the default—good for agent use.

---

## 3. Bugs Found

### 3.1 CRITICAL: `archi_run_script` — `console.log` causes infinite recursion
**Reproduction:**
```javascript
console.log("Hello");
```
**Result:** `RangeError: Maximum call stack size exceeded` with the message duplicated hundreds of times in the output array before stack overflow.

**Impact:** The script tool is partially unusable for any script that does logging. The console interceptor appears to recursively call itself.

**Recommendation:** Fix the console intercept in the script execution wrapper. Ensure the intercepted `log`/`warn`/`error` functions use the *original* native method (save a reference before patching) and don't re-enter.

### 3.2 CRITICAL: `archi_run_script` — script return values are always `null`
**Reproduction:**
```javascript
var x = "hello";
x;
```
**Result:** `result: null` even though the expression evaluates to `"hello"`.

**Impact:** Scripts can't return data to the agent. The only mechanism for output is `console.log`, which is also broken (see 3.1).

**Recommendation:** Capture and return the last expression value from the script evaluation context. GraalVM's `Context.eval()` returns a `Value` — ensure it's serialized to JSON in the response `result` field.

### 3.3 MEDIUM: `archi_run_script` — `$("element")` fails without UI selection context
**Reproduction:**
```javascript
$("element").each(function(e) { /* ... */ });
```
**Error:** "Could not get the currently selected model."

Even `$("element", $.model)` fails with the same error. The error message suggests using `$.model.getLoadedModels().get(0)` but that also returns `null` for `result`.

**Impact:** The standard jArchi `$()` selector pattern—by far the most common scripting pattern—doesn't work via MCP.

**Recommendation:**
1. If feasible, auto-bind `$` to the currently loaded model in the MCP script context
2. At minimum, document the working alternative in the tool description (not just the error message)
3. Update the tool's `description` field to explicitly warn: "The `$()` selector requires UI context. Use structured tools instead, or access the model via Java EMF APIs."

---

## 4. Field Naming Inconsistencies (Agent Confusion)

These caused validation failures on first attempt. Each required a retry after reading the error message.

### 4.1 `updateElement` requires `id`, not `elementId`
**What happened:** Sent `{"op": "updateElement", "elementId": "...", "name": "..."}` — got `missing 'id' field`.

**Inconsistency:** `setProperty` accepts `elementId` (and the MCP layer normalizes it to `id`). But `updateElement` doesn't. The MCP layer even logs `"aliasesResolved": 2` for `setProperty` but doesn't do the same for `updateElement`.

**Recommendation:** Either normalize `elementId` → `id` for all operations in the MCP layer, or use `id` consistently everywhere and document it clearly.

### 4.2 `styleViewObject` requires `viewObjectId`, not `visualId`
**What happened:** Sent `{"op": "styleViewObject", "visualId": "..."}` — got `missing 'viewObjectId' field`.

**Inconsistency:**
- `addToView` returns `visualId` in its result
- `nestInView` uses `visualId` and `parentVisualId`
- `get_view_summary` returns `visualId` for each element
- But `styleViewObject` requires `viewObjectId`

**Recommendation:** Accept both `visualId` and `viewObjectId` as aliases, or standardize on one name. Since `visualId` is used everywhere else, prefer that.

### 4.3 `moveViewObject` requires `viewObjectId`, not `visualId`
Same issue as 4.2 — the natural field name from view query results is `visualId`, but `moveViewObject` demands `viewObjectId`.

### 4.4 `moveToFolder` requires `id`, not `elementId`
**What happened:** Sent `{"op": "moveToFolder", "elementId": "..."}` — got `missing 'id' field`.

### 4.5 `createFolder` requires `parentId` or `parentType`, not `parentPath`
**What happened:** Sent `{"op": "createFolder", "parentPath": "Business"}` — got `must specify 'parentId' or 'parentType'`.

**Mitigation:** This is somewhat reasonable since paths could be ambiguous, but since `list_folders` returns both `id` and `path`, accepting `parentPath` would be convenient.

### Summary table of field naming issues

| Operation | Agent tried | Required | Suggested fix |
|-----------|-------------|----------|---------------|
| `updateElement` | `elementId` | `id` | Accept `elementId` as alias |
| `styleViewObject` | `visualId` | `viewObjectId` | Accept `visualId` as alias |
| `moveViewObject` | `visualId` | `viewObjectId` | Accept `visualId` as alias |
| `moveToFolder` | `elementId` | `id` | Accept `elementId` as alias |
| `createFolder` | `parentPath` | `parentId`/`parentType` | Optionally accept `parentPath` |

---

## 5. Minor Issues & Observations

### 5.1 Intra-batch relationship results have empty `sourceName`/`targetName`
When a `createRelationship` references a `tempId` from a `createElement` in the same batch, the response shows `"sourceName": ""` and `"targetName": ""`. The IDs resolve correctly, but names aren't backfilled from the just-created elements.

**Impact:** Low — the agent can look up names separately. But it makes the response less self-contained.

**Recommendation:** After resolving tempIds, backfill names from the batch's created elements before returning the result.

### 5.2 `duplicate_view` returns UUID-format IDs, not Archi-format IDs
Original view: `id-d35da3322c7b4eb7a9cba9c04830910e` (Archi format)
Duplicated view: `a9a78a65-5d9b-4d48-9581-390f4ac5e7c7` (UUID format)

Visual elements in the duplicate also use UUID format. This is likely an Archi/jArchi behavior, not a server bug, but it means ID format is inconsistent within the same model. Agents should be prepared for both formats.

### 5.3 `fontColor` applied via `styleViewObject` isn't visible in `get_view` response
After applying `fontColor: "#1B5E20"` to a view object, `get_view` shows `fillColor` but not `fontColor` in the element data. Either it's not persisted, not serialized, or uses a different field name on read.

### 5.4 `search_model` doesn't return properties in results
When searching by property (`propertyKey`/`propertyValue`), the matching result includes `matchedPropertyKey` and `matchedPropertyValue`, but doesn't include the full `properties` object. An agent wanting to read all properties must follow up with `get_element`.

### 5.5 Operation timing is excellent
All operations completed in 100-130ms server-side. The `wait_for_operation` call typically resolved in 1-3ms on the first poll. This makes the agent workflow very snappy.

---

## 6. Recommendations for the MCP Developer

### 6.1 High Priority — Fix bugs

1. **Fix `console.log` infinite recursion in `archi_run_script`** — Save original `console` methods before intercepting
2. **Fix script return value capture** — Ensure GraalVM eval return value is serialized to response `result`
3. **Normalize field names** — Accept `elementId`/`visualId` as aliases everywhere, or document the canonical field per operation in the MCP tool descriptions

### 6.2 Medium Priority — Improve agent ergonomics

4. **Add field alias normalization for all `apply` operations** — The MCP layer already does this for `setProperty` (`elementId` → `id`); extend to `updateElement`, `moveToFolder`, `styleViewObject`, `moveViewObject`, etc.
5. **Backfill names in intra-batch relationship results** — Resolve `sourceName`/`targetName` from the batch's just-created elements
6. **Enrich `archi_run_script` tool description** — Explicitly warn about no UI context, no `$()` selector, and suggest structured tool alternatives
7. **Add `properties` to search results** — Include the full properties map when searching by property, to reduce follow-up calls

### 6.3 Low Priority — Polish & enhance

8. **Accept `parentPath` in `createFolder`** — Convenience for agents that know folder names from `list_folders`
9. **Add SVG export format** — PNG/JPG are supported; SVG would be useful for embedding in documentation
10. **Add `archi_undo` / `archi_redo` tools** — The undo infrastructure exists in `undoableCommands.js`; exposing it via MCP would let agents recover from mistakes without manual intervention
11. **Include `fontColor` in view serialization** — Currently only `fillColor` appears in `get_view` responses
12. **Add `archi_get_element_batch`** — Retrieve multiple elements by ID in one call; currently requires N separate `get_element` calls

### 6.4 Documentation improvements

13. **Document the canonical field name for every `apply` operation** — A table in the tool description or a linked reference showing exactly which fields each op requires
14. **Add examples to tool descriptions** — Brief JSON examples for the most confusing operations (`styleViewObject`, `nestInView`, `createFolder`) would prevent first-attempt failures
15. **Clarify ID formats** — Document that duplicated views use UUID format while original views use `id-` prefix format

---

## 7. Complete Test Transcript

### Phase 1: Health & Infrastructure
| Tool | Result | Notes |
|------|--------|-------|
| `archi_get_health` | OK | v1.6.1, uptime 51165s, 0 elements, 0 relationships, 1 view |
| `archi_get_test` | OK | Handler confirmed running on UI thread |
| `archi_get_model_diagnostics` | OK | No orphans |
| `archi_get_model_stats` | OK | Empty model with 1 default view |

### Phase 2: Model Queries (Empty Model)
| Tool | Result | Notes |
|------|--------|-------|
| `archi_query_model` | OK | Empty arrays with limit/relationshipLimit params |
| `archi_search_model` (regex `.*`) | OK | 0 results, shows regex mode metadata |
| `archi_search_model` (type filter) | OK | 0 results for `business-actor` |
| `archi_list_folders` | OK | 9 standard ArchiMate folders |

### Phase 3: Element CRUD
| Tool | Result | Notes |
|------|--------|-------|
| `createElement` × 8 | OK | All types: business-actor, business-process, business-service, application-component, technology-service, node |
| `createRelationship` × 7 | OK | Types: serving, assignment, realization |
| `get_element` | OK | Shows incoming/outgoing relationships |
| `get_relationships_between_elements` | OK | Correct filtering with relationship type filter |
| `setProperty` × 2 | OK | Custom properties set on Customer element |
| `updateElement` | FAIL then OK | Required `id` not `elementId` |
| `updateRelationship` | OK | Renamed a relationship |

### Phase 4: View Lifecycle
| Tool | Result | Notes |
|------|--------|-------|
| `archi_create_view` | OK | Layered viewpoint, with documentation |
| `archi_populate_view` (8 elements, autoConnect) | OK | 8 visuals + 7 connections auto-resolved in one call |
| `archi_layout_view` (dagre, TB) | OK | 8 nodes positioned in 79ms |
| `archi_set_view_router` (manhattan) | OK | Router changed from bendpoint |
| `archi_validate_view` | OK | No violations |
| `styleViewObject` × 2 | FAIL then OK | Required `viewObjectId` not `visualId` |
| `styleConnection` | OK | Line color and width set |
| `createNote` | OK | Note with multiline content |
| `createGroup` | OK | Group created on view |
| `nestInView` × 2 | OK | Two elements nested inside group |
| `moveViewObject` | FAIL then OK | Required `viewObjectId` not `visualId` |
| `deleteConnectionFromView` | OK | Connection removed from duplicate view |
| `archi_duplicate_view` | OK | Copy created (UUID-format ID) |
| `archi_export_view` (PNG, 2×) | OK | 31KB file exported |
| `archi_export_view` (JPG, 1×) | OK | 24KB file exported |
| `archi_delete_view` | OK | Duplicate deleted |

### Phase 5: Folder & Delete Operations
| Tool | Result | Notes |
|------|--------|-------|
| `createFolder` | FAIL then OK | Required `parentId` not `parentPath` |
| `moveToFolder` | FAIL then OK | Required `id` not `elementId` |
| `deleteRelationship` | OK | Relationship deleted |
| `deleteElement` | OK | Element deleted with `cascade: true` |

### Phase 6: Async & Planning
| Tool | Result | Notes |
|------|--------|-------|
| `archi_wait_for_operation` | OK | All 11 operations used this successfully |
| `archi_get_operation_status` (operationId) | OK | Both aliases work |
| `archi_get_operation_status` (opId) | OK | Same result |
| `archi_get_operation_status` (nonexistent) | 404 | Proper error |
| `archi_list_operations` | OK | History with timing metadata |
| `archi_plan_model_changes` | OK | Preview without mutation |

### Phase 7: Scripting
| Tool | Result | Notes |
|------|--------|-------|
| `archi_run_script` (console.log) | **BUG** | Infinite recursion / stack overflow |
| `archi_run_script` (return value) | **BUG** | Result always `null` |
| `archi_run_script` ($() selector) | **BUG** | No UI selection context |

### Phase 8: Duplicate Detection & Save
| Tool | Result | Notes |
|------|--------|-------|
| `archi_create_view` (duplicate name) | 409 | Good: returns existing view ID |
| `archi_search_model` (property filter) | OK | Found Customer by Risk Level=High |
| `archi_save_model` | OK | Model saved in 7ms |
| `archi_get_model_diagnostics` (post-ops) | OK | 9 elements, 7 relationships, 2 views, 0 orphans |

### Phase 9: Error Handling
| Scenario | Response | Quality |
|----------|----------|---------|
| Nonexistent element ID | 404 + hint about conceptId vs visualId | Excellent |
| Nonexistent view ID | 404 | Good |
| Invalid element type | 400 + full list of valid types | Excellent |
| Missing required field | 400 + specific field name + operation index | Good |
| Nonexistent operation ID | 404 | Good |
| Duplicate view name | 409 + existing view ID | Excellent |

---

## 8. Final Model State

After the exercise, the model contained:

- **9 elements** across 5 types: business-actor (2), business-service (2), business-process (2), application-component (2), node (1)
- **7 relationships** across 3 types: serving (4), realization (2), assignment (1)
- **2 views**: Default View (empty) + MCP Exercise View - Full Stack (9 visual objects, 5 connections, styled, with group and note)
- **0 orphans** — clean state confirmed by diagnostics

---

## 9. Agent Experience Summary

**Overall rating: 8/10** — The MCP server is remarkably capable for agent-driven ArchiMate modeling. The `populate_view` + `wait_for_operation` + intra-batch tempId pattern makes complex modeling workflows achievable in surprisingly few tool calls. The error messages are among the best I've seen in any MCP server.

**What would make it 10/10:**
1. Fix the 3 script execution bugs
2. Normalize field names (accept aliases) across all `apply` operations — the current inconsistency between `visualId`/`viewObjectId` and `elementId`/`id` is the #1 source of agent retry friction
3. Add inline JSON examples to tool descriptions for the 5 most confusing operations

**Calls required for a full model-to-view workflow:** 5 tool calls is the minimum (create elements → create relationships → create view → populate view → layout view). With styling, notes, groups, and export, 8-10 calls cover a complete professional-quality diagram. This is excellent compared to the 30+ raw API calls this would require.

---

## Appendix: Previous Exercise Notes

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

