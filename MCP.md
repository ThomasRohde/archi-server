# MCP Agent Experience Report

> Field notes from an AI agent session building a **Software Engineering Business Capability Map** (35 elements, 28 relationships, 1 styled view) using the `archi-mcp` MCP tools. Written to inform improvements in the next coding session.

## Session Summary

**Task**: Create a Level 1 + Level 2 Business Capability Map for Software Engineering (Full SDLC).  
**Result**: Successfully created 7 L1 capabilities, 28 L2 sub-capabilities, 28 composition relationships, a color-coded nested view, exported PNG, and saved the model.  
**Total API calls**: ~20 tool invocations across read, mutation, styling, validation, and export.

---

## What Worked Well

### 1. Read-before-write workflow
The tool sequence `archi_get_health` → `archi_query_model` → `archi_get_model_stats` gave immediate confidence in model state before any mutations. The empty model was clearly surfaced (0 elements, 0 relationships, 1 default view).

### 2. Async operation model
`archi_apply_model_changes` + `archi_wait_for_operation` is a clean pattern. Operations completed quickly (1–38ms), and `tempId → realId` mapping in results made chaining straightforward.

### 3. Batch element + relationship creation
Creating L2 elements and their composition relationships in the same batch worked perfectly. `tempId` references within a single batch resolve correctly (e.g., `createElement` with `tempId: "cap-req-elicit"` followed by `createRelationship` targeting that tempId).

### 4. View validation
`archi_validate_view` provided a clean pass/fail signal with specific violation categories (orphaned connections, direction mismatches). Good for post-mutation confidence.

### 5. Parallel read calls
Independent read-only tools (`archi_get_health`, `archi_get_model_stats`, `archi_query_model`) could be called in parallel, reducing round trips.

### 6. `archi_populate_view` exists but wasn't needed
For more complex scenarios with pre-existing elements and auto-connecting relationships, `archi_populate_view` would save significant manual `addToView` + `addConnectionToView` work. Good to have.

---

## Bugs Found

### BUG 1: `moveViewObject` — `w`/`h` aliases are not normalized ~~(CRITICAL)~~ FIXED

**Tool description says**: `moveViewObject: viewId, viewObjectId (or visualId), x, y, w?, h?`
**API actually expects**: `width` and `height`
**What happens**: Agent sends `w: 230, h: 280` → these are silently ignored → element stays at default 120×55.

**Location**: [server.ts line 2143](archi-mcp/src/server.ts#L2143) documents `w?`/`h?` but `normalizeApplyChanges()` (lines 1121–1265) has no `w→width` / `h→height` normalization. The Archi server's `undoableCommands.js` reads `operation.width` and `operation.height`.

**Impact**: High — every view layout operation that tries to resize using the documented aliases silently fails. The agent must discover this through trial and error (I wasted 2 tool calls before finding the correct field names).

**Resolution**: Added `w→width` / `h→height` normalization in `normalizeApplyChanges()` for `addToView`, `moveViewObject`, `createNote`, and `createGroup`. Updated tool descriptions to use `width? (or w)` / `height? (or h)`.

### BUG 2: `addToView` — same `w`/`h` alias problem ~~(HIGH)~~ FIXED

**Tool description says**: `addToView: viewId, elementId, tempId?, x?, y?, w?, h?, parentVisualId?`
**API actually expects**: `width` and `height`
**Same silent failure**: Elements created with `w: 200, h: 45` get default sizing.

**Resolution**: Fixed together with BUG 1 — same normalization handles all four operations.

### BUG 3: `createNote` — `text` alias is not normalized ~~(MEDIUM)~~ FIXED

**Tool description says**: `createNote: viewId, text, x?, y?, w?, h?, tempId?`
**API actually expects**: `content` (not `text`)
**What happens**: Agent sends `{ text: "..." }` → validation error: `missing 'content' field`.

**Location**: [server.ts line 2144](archi-mcp/src/server.ts#L2144)

**Impact**: Medium — at least this fails loudly (400 error) rather than silently, so the agent can recover in one retry. But it shouldn't need to.

**Resolution**: Added `text→content` normalization in `normalizeApplyChanges()` for `createNote`. Updated tool description to `content (or text)`. Note: the Archi server's `undoableCommands.js` already accepted both (`operation.content || operation.text`), so the MCP normalization ensures consistency.

### BUG 4: `createGroup` — ~~likely~~ same `w`/`h` ~~+ undocumented field issues~~ FIXED

**Tool description says**: `createGroup: viewId, name, x?, y?, w?, h?, tempId?`
~~**Likely same problem**: `w`/`h` won't be normalized; may also have `text`/`content` mismatch.~~

**Resolution**: Fixed together with BUG 1 — `w→width` / `h→height` normalization covers `createGroup`.

---

## Friction Points (Not Bugs, But Improvable)

### FRICTION 1: Default element sizing on `addToView` is too small

When adding elements to a view, the default size is 120×55, which is fine for a standalone element but too small when the element is a parent container with nested children. For capability map / nesting use cases, the agent must always follow `addToView` with `moveViewObject` to resize — doubling the number of operations.

**Suggestion**: Allow `addToView` to accept `width`/`height` and apply them at creation time (the `undoableCommands.js` code already has width/height support in the `addToView` handler — verify this). If it already works, the MCP tool description just needs to document the correct field names.

### FRICTION 2: `archi_run_script` has no model selection context — FIXED

Attempting to use script execution as a fallback for batch resizing failed because:
- `$("selector")` requires UI selection context that doesn't exist via API
- `$.model.find()` → `Unknown identifier: find` (API model object doesn't expose find)
- `$.model.getLoadedModels().get(0).find()` → CompoundCommand null context error

This means scripts can't be used as an escape hatch for operations the structured API doesn't cover well. The error message is helpful ("Prefer structured tools…"), but it would be better if scripts could access the model directly without UI context.

**Resolution**: The script preamble now pre-binds a `model` convenience variable (`var model = getModel()`) and auto-binds `$()` to the loaded model. Helper functions `getModel()`, `findElements(type)`, `findViews(name)`, `findRelationships(type)` are available in every script. The MCP tool description documents all helpers with examples. Error messages now advertise these helpers instead of only suggesting structured tools.

### FRICTION 3: `styleViewObject` `fontStyle` = "bold" was silently ignored — FIXED

When styling L1 capability containers, `fontStyle: "bold"` was included in the `styleViewObject` operation. The API returned `updated: ["fillColor"]` — it applied `fillColor` but silently dropped `fontStyle`.

**Root cause**: The Archi server uses `font` (not `fontStyle`), in format `"fontName|height|style"` (e.g., `"Arial|10|1"` for bold, where style constants are: 0=normal, 1=bold, 2=italic, 3=bold|italic). `fontStyle` was an undocumented field that didn't map to anything.

**Resolution**: Added `fontStyle→font` normalization in `normalizeApplyChanges()` that converts string values ("bold", "italic", "bold|italic") and integer SWT constants to the `"name|size|style"` font format. Updated tool description to document both `font?` (canonical) and `fontStyle?` (convenience alias) with valid values.

### FRICTION 4: No way to set view-level title or description visually

The capability map needed a title. The only option was `createNote`, which creates a free-floating text box. There's no concept of a view title/header element that stays anchored or styled differently. Minor, but worth noting for future view-building scenarios.

### FRICTION 5: Batching limits require manual operation splitting — FIXED

The 20-operation batch limit means the agent must manually split work across multiple `archi_apply_model_changes` calls. For this 35-element model, I needed 4 separate createElement+createRelationship batches plus 3 separate view-population batches. An auto-chunking feature in the MCP layer (splitting a larger batch internally, polling each chunk, and merging results) would reduce agent complexity significantly.

**Resolution**: The MCP layer now auto-chunks batches exceeding 20 operations. It splits into ≤20-op chunks, submits each sequentially, polls until complete, resolves tempIds across chunks, and returns merged results directly. The agent can submit up to 1000 operations in a single call without manual splitting. For auto-chunked batches, no separate `archi_wait_for_operation` call is needed.

---

## Tool Description Improvements

### Missing parameter documentation — FIXED

The `archi_apply_model_changes` tool description is the primary reference for agents. The following gaps have been addressed:

| Operation | Was | Fixed to |
|-----------|-----|----------|
| `moveViewObject` | `w?`/`h?` | `width? (or w)` / `height? (or h)`, `x?`/`y?` now marked optional |
| `addToView` | `w?`/`h?` | `width? (or w)` / `height? (or h)` |
| `createNote` | `text` | `content (or text)` |
| `createGroup` | `w?`/`h?` | `width? (or w)` / `height? (or h)` |
| `styleViewObject` | `fontStyle?` undocumented | Added `font?` (canonical) + `fontStyle?` (alias) with value docs |
| `styleViewObject` | `fillColor?` format undocumented | Documents `#rrggbb hex` |
| `styleViewObject` | `opacity`/`outlineOpacity` range undocumented | Documents `0-255` |
| `styleConnection` | `fontStyle?` (wrong — doesn't exist) | Replaced with `textPosition?` (actual field) |
| `styleConnection` | `lineWidth` range undocumented | Documents `1-3` |
| `styleConnection` | `lineColor`/`fontColor` format undocumented | Documents `#rrggbb hex` |

### ~~Suggested improved description for `moveViewObject`~~ — IMPLEMENTED

The tool description now reads:

```
- moveViewObject: viewId, viewObjectId (or visualId), x?, y?, width? (or w), height? (or h)
```

All four dimensions are optional; omitted values preserve current bounds. `x` and `y` are correctly marked as optional.

---

## Normalization Gaps Summary

The MCP server normalizes these aliases:
- `elementId` / `relationshipId` → `id` (for setProperty, updateElement, etc.)
- `visualId` → `viewObjectId` (for styleViewObject, moveViewObject)
- `viewConnectionId` → `connectionId` (for styleConnection, deleteConnectionFromView)
- `viewObjectId` → `visualId` (for nestInView — reverse direction)
- `w` → `width` (for addToView, moveViewObject, createNote, createGroup) — **NEW**
- `h` → `height` (for addToView, moveViewObject, createNote, createGroup) — **NEW**
- `text` → `content` (for createNote) — **NEW**
- `fontStyle` → `font` (for styleViewObject, converts "bold"/"italic" strings to font format) — **NEW**

---

## Recommended Fix Priority

1. ~~**P0 — Add `w→width`, `h→height` normalization**~~ ✅ DONE
2. ~~**P0 — Add `text→content` normalization**~~ ✅ DONE
3. ~~**P1 — Fix tool descriptions**~~ ✅ DONE
4. ~~**P1 — Document `fontStyle` valid values**~~ ✅ DONE

5. ~~**P2 — Consider auto-chunking** large batches in the MCP layer (split → sequential apply → merge results) to eliminate the agent-side batching complexity.~~ ✅ DONE

6. ~~**P2 — Improve `archi_run_script` model access** so scripts can access the loaded model without UI selection context.~~ ✅ DONE

---

## Workflow Pattern That Worked

For future reference, this is the optimal tool sequence for building a capability map:

```
1. archi_get_health + archi_query_model + archi_get_model_stats  (parallel, baseline)
2. archi_apply_model_changes  → createElement (L1 capabilities)
3. archi_wait_for_operation    → get realIds
4. archi_apply_model_changes  → createElement (L2) + createRelationship (composition) per L1 group
5. archi_wait_for_operation    → get realIds (repeat steps 4-5 per L1 group, ≤16 ops per batch)
6. archi_create_view           → get viewId
7. archi_apply_model_changes  → addToView (L1 as parents, L2 with parentVisualId)
8. archi_wait_for_operation    → get visualIds
9. archi_apply_model_changes  → moveViewObject with width/height to resize containers + children
10. archi_wait_for_operation
11. archi_apply_model_changes → styleViewObject (colors per L1 column) + createNote (title)
12. archi_wait_for_operation
13. archi_validate_view        → confirm clean
14. archi_export_view          → PNG
15. archi_save_model           → persist
```

Steps 7-10 could be eliminated if `addToView` properly accepted and applied `width`/`height` at creation time (verify whether the Archi server supports this — the agent-side friction is in the MCP layer documentation, not necessarily the underlying API).
