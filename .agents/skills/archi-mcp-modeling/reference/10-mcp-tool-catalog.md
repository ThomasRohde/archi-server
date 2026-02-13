# Archi MCP Tool Catalog

Authoritative reference for every available Archi MCP tool: when to use it, required inputs, key outputs, and sequencing rules.

**Rule:** Do not improvise tool usage outside this catalog. If no structured tool can accomplish a task, use `archi_run_script` as a last resort.

---

## 1. Health and Discovery

### `archi_get_health`
- **When:** First call in every session, before any other tool.
- **Input:** None.
- **Output:** Server health, uptime, queue stats, model summary.
- **Action:** If unhealthy → stop and report. Do not proceed with mutations.

### `archi_get_model_stats`
- **When:** Estimating model scope and complexity.
- **Input:** None.
- **Output:** Counts by element type, relationship type, view type.
- **Use case:** "How big is this model?" / "What layers are populated?"

### `archi_query_model`
- **When:** Quick sample of model contents without a specific search target.
- **Input:** Optional `limit` (elements) and `relationshipLimit`.
- **Output:** Summary + sampled concepts with types and names.
- **Use case:** Getting oriented in an unfamiliar model.

---

## 2. Search and Element Inspection

### `archi_search_model`
- **When:** Locating existing elements/relationships by type, name, or property before creating new ones.
- **Input:** `type`, `namePattern` (regex), `propertyKey`/`propertyValue`, `caseSensitive`, `includeRelationships`, `limit`.
- **Output:** Matching concepts with IDs, types, names.
- **Critical rule:** Run this before any `createElement` to prevent duplicates.
- **Tip:** Use `namePattern` with regex alternation (`Customer|Client`) for fuzzy matching.

### `archi_get_element`
- **When:** Deep inspection of one specific concept — its full detail, relationships, and view appearances.
- **Input:** `elementId` (concept ID, not visual ID).
- **Output:** Element detail + all relationships + all views containing it.
- **Use case:** Understanding an element's role and connections before modifying or extending it.

### `archi_get_relationships_between_elements`
- **When:** Discovering existing links within a set of elements.
- **Input:** `elementIds` (2–200), optional `relationshipTypes` filter, `limit`.
- **Output:** Relationship rows with source/target/type.
- **Use case:** Before creating relationships — check what already exists to avoid duplicates.

### `archi_get_model_diagnostics`
- **When:** After mutations to check for orphans, ghosts, or rollback artifacts.
- **Input:** None.
- **Output:** Diagnostic warnings/errors.
- **Use case:** Post-mutation sanity check; audit workflows.

---

## 3. View Discovery and Inspection

### `archi_list_views`
- **When:** Finding views by name, type, or viewpoint before creating a new one.
- **Input:** `nameContains` or `exactName`, `type`, `viewpoint`, `limit`, `offset`, `sortBy`, `sortDirection`.
- **Output:** Filtered view list with IDs and metadata.
- **Tip:** Always check for existing views before creating — user may want to extend rather than duplicate.

### `archi_get_view_summary`
- **When:** Fast check of what concepts are on a view (visual-to-concept mappings, no geometry).
- **Input:** `viewId`, optional `includeConnections`.
- **Output:** Compact visual → concept mapping.
- **Use case:** Before adding elements to a view, check what's already there.

### `archi_get_view`
- **When:** Full view detail needed — coordinates, styles, connections, nesting.
- **Input:** `viewId`.
- **Output:** Complete view payload with all visual objects.
- **Use case:** Geometry-level repairs, style audits, precise placement planning.
- **Tip:** Prefer `archi_get_view_summary` when you only need concept coverage.

### `archi_validate_view`
- **When:** After adding/removing connections or elements on a view.
- **Input:** `viewId`.
- **Output:** Validation violations (broken connections, missing endpoints).
- **Critical rule:** Always run after view mutations before declaring completion.

### `archi_export_view`
- **When:** User requests PNG/JPG output of a view.
- **Input:** `viewId`, `format` (PNG/JPG), optional `outputPath`, `scale` (0.5–4), `margin`.
- **Output:** Export file path and metadata.

---

## 4. View Lifecycle and Layout

### `archi_create_view`
- **When:** Creating a new empty view.
- **Input:** `name`, optional `documentation`, `folder`.
- **Output:** New view ID.
- **⚠ Warning:** Omit `viewpoint` unless you know the exact supported key. Labels like "Application Usage" are rejected with ValidationError.

### `archi_duplicate_view`
- **When:** Creating a variant of an existing view.
- **Input:** `viewId`, optional `name`.
- **Output:** New view ID (copy of source).

### `archi_delete_view`
- **When:** User explicitly requests view removal.
- **Safety:** Destructive — always confirm intent first.

### `archi_set_view_router`
- **When:** Changing connection routing style.
- **Input:** `viewId`, `routerType` (`bendpoint` or `manhattan`).
- **Tip:** Use `manhattan` for clean orthogonal layouts in technical views.

### `archi_layout_view`
- **When:** Auto-arranging elements after additions or major structural changes.
- **Input:** `viewId`, `algorithm` (`dagre` or `sugiyama`), `rankdir` (TB/BT/LR/RL), `nodesep`, `ranksep`, `edgesep`, `marginx`, `marginy`.
- **Output:** Updated coordinates, count of positioned nodes.
- **Tip:** Use `LR` (left-to-right) for integration and flow views. Use `TB` (top-to-bottom) for layered/hierarchical views.
- **Critical rule:** Only call after `archi_wait_for_operation` has confirmed all addToView/addConnectionToView ops completed.

---

## 5. Core Mutation Tool

### `archi_apply_model_changes`
- **When:** Creating, updating, or deleting elements, relationships, and view objects.
- **Input:** Array of change operations (see operation families below).
- **Output:** `operationId` (async). Status is `queued` initially.
- **Critical:** Always call `archi_wait_for_operation` before any dependent operation.

#### Supported Operations

| Family | Operations |
|---|---|
| **Elements** | `createElement`, `createOrGetElement`, `updateElement`, `deleteElement`, `setProperty`, `moveToFolder` |
| **Relationships** | `createRelationship`, `createOrGetRelationship`, `updateRelationship`, `deleteRelationship` |
| **Folders** | `createFolder` |
| **View content** | `addToView`, `addConnectionToView`, `nestInView`, `moveViewObject`, `styleViewObject`, `styleConnection`, `deleteConnectionFromView`, `createNote`, `createGroup` |
| **Views** | `createView`, `deleteView` |

#### Request-Level Fields

| Field | Type | Default | Detail |
|---|---|---|---|
| **idempotencyKey** | string (1–128 chars, `[A-Za-z0-9:_-]+`) | — | Replay-safe key. Same key + same payload replays the cached result. Same key + different payload returns 409 conflict. 24h in-memory window. For chunked batches the MCP layer derives per-chunk keys as `${base}:chunk:${index}:of:${total}`. |
| **duplicateStrategy** | `error` \| `reuse` \| `rename` | `error` | Request-level default. Individual operations can override with `onDuplicate`. Precedence: `onDuplicate` (op) > `duplicateStrategy` (request) > `error`. |

#### Upsert Operations

##### `createOrGetElement`
- **When:** Creating an element that may already exist. Avoids search-then-create race condition.
- **Input:** `create` (same fields as `createElement`: type, name, tempId?, documentation?, folder?, properties?), `match` (type + name), optional `onDuplicate`.
- **Behavior by strategy:**
  - `error` (default) — fail if a matching element exists.
  - `reuse` — return the existing element's ID; skip creation.
  - `rename` — create a new element with a disambiguated name (e.g., "Customer (2)").
- **Output:** tempId resolves to either the new or the existing element ID. Result includes `reused: true` when an existing element was returned.

##### `createOrGetRelationship`
- **When:** Creating a relationship that may already exist between two elements.
- **Input:** `create` (same fields as `createRelationship`: type, sourceId, targetId, tempId?, name?, accessType?, strength?), `match` (type + sourceId + targetId, optional accessType/strength), optional `onDuplicate`.
- **⚠ `rename` is NOT supported** for relationships — only `error` or `reuse`.
- **Output:** tempId resolves to either the new or the existing relationship ID.

#### Key Usage Rules

| Rule | Detail |
|---|---|
| **tempId chaining** | Assign `tempId` to every created element/relationship. Within the same batch, `createRelationship` can reference a `tempId` from `createElement`. |
| **Visual IDs for connections** | `addConnectionToView` requires `sourceVisualId` and `targetVisualId` — these come from `addToView` results, not from concept IDs. |
| **Nesting** | Use `parentVisualId` on `addToView` to nest children, or `nestInView` to reparent after placement. |
| **moveViewObject params** | Use `width`/`height`, NOT `w`/`h`. Geometry fields must be numbers, not strings. |
| **createNote params** | Use `content`, NOT `text`. |
| **Batch size** | ≤8 operations per batch. The MCP layer auto-chunks larger batches across chunk boundaries, resolving tempIds. |
| **Connections not auto-created** | Adding elements to a view does NOT auto-create relationship connections. You must explicitly call `addConnectionToView`. |
| **Upsert vs search-first** | Prefer `createOrGetElement`/`createOrGetRelationship` with `onDuplicate: reuse` over manual search-then-create when you want idempotent creation. Use search-first when you need to inspect or selectively reuse existing elements. |

---

## 6. Async Operation Control

### `archi_wait_for_operation` ← **preferred**
- **When:** After every `archi_apply_model_changes` or `archi_populate_view` call.
- **Input:** `operationId`, optional `timeoutMs` (default 120000), `pollIntervalMs` (default 1000).
- **Output:** Terminal status (`complete`/`error`) + result payload with tempId → realId mappings.
- **Why preferred:** Blocks until done. No manual polling loop needed.

### `archi_get_operation_status`
- **When:** Single status check without blocking (e.g., progress reporting).
- **Input:** `operationId` or `opId`, optional `summaryOnly`, `cursor`, `pageSize`.

### `archi_list_operations`
- **When:** Inspecting recent operation history, debugging failures.
- **Input:** Optional `status` filter, `limit`, `cursor`, `summaryOnly`.

---

## 7. Bulk View Population

### `archi_populate_view`
- **When:** Adding many existing elements to a view and auto-connecting their known relationships.
- **Input:** `viewId`, `elementIds` (1–200), `autoConnect` (default true), optional `relationshipTypes` filter, `skipExistingVisuals`, `skipExistingConnections`.
- **Output:** `operationId` (async — **must wait before layout or validation**).
- **Use case:** Rapidly populating a view with pre-existing concepts rather than manual `addToView` calls.
- **Tip:** Set `autoConnect: true` to automatically visualize existing relationships between the placed elements.

---

## 8. Administrative and Scripting Tools

### `archi_save_model`
- **When:** User explicitly requests persistence after successful validation.
- **Input:** Optional `path` override.
- **Rule:** Never auto-save. Only on explicit request.

### `archi_list_folders`
- **When:** Finding destination folders for `moveToFolder` or `createFolder`.
- **Output:** Full folder hierarchy tree.

### `archi_run_script`
- **When:** No structured tool can accomplish the required task. Last resort.
- **Input:** `code` — GraalVM JavaScript executed inside Archi JVM.
- **Available helpers:** `model`, `findElements(type?)`, `findViews(name?)`, `findRelationships(type?)`, `$(selector)`.
- **⚠ Caution:** This runs arbitrary code on the model. Prefer structured tools for all routine operations.

### `archi_plan_model_changes`
- **When:** Generating a dry-run preview of a simple create operation.
- **Important:** This does NOT execute anything. Do not treat as a mutation.

### `archi_get_test`
- **When:** Troubleshooting server thread availability.

### `archi_shutdown_server`
- **Safety:** Destructive to session. Only on explicit admin request.

---

## Canonical Sequences

### Read-only analysis
```
health → search/query → get_element → view summary → diagnostics → report
```

### Model mutation
```
health → search (avoid duplicates) → apply changes → wait → validate/diagnostics → report
```

### View build (from existing concepts)
```
list views → create view → populate_view → wait → layout → validate → export/save
```

### View build (from new concepts)
```
search → apply (create elements + relationships) → wait (get IDs)
→ create view → apply (addToView) → wait (get visual IDs)
→ apply (addConnectionToView) → wait → layout → validate → export/save
```

### Full end-to-end
```
health → search → apply elements + rels → wait
→ create view → apply addToView → wait
→ apply addConnectionToView → wait
→ set router → layout → validate → diagnostics → report → save if requested
```
