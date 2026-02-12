# Archi MCP Tool Catalog (Explicit Usage)

Use this as the authoritative mapping of available Archi MCP tools, when to use them, and sequencing rules.

## 1) Health, Discovery, and Search

### `archi_get_health`
- Use when: first connectivity check before any modeling action.
- Input: none.
- Output: server/model summary and queue metrics.
- Next step: if unhealthy, stop and report.

### `archi_get_model_stats`
- Use when: estimating model scope and complexity.
- Input: none.
- Output: counts by element, relationship, and view type.

### `archi_query_model`
- Use when: quick sample of model contents.
- Input: optional element/relationship sample limits.
- Output: summary + sampled concepts.

### `archi_search_model`
- Use when: locating existing elements/relationships by type/name/property.
- Input: type, namePattern, case sensitivity, property filters.
- Output: candidate concepts for reuse.
- Rule: run before creating new elements to avoid duplicates.

### `archi_get_element`
- Use when: validating a specific concept and its relationships/views.
- Input: `elementId`.
- Output: full detail of one element.

### `archi_get_relationships_between_elements`
- Use when: discovering existing links in a selected set.
- Input: element IDs + optional relationship-type filter.
- Output: existing relationship rows.

### `archi_get_model_diagnostics`
- Use when: suspected rollback/orphan/ghost issues.
- Input: none.
- Output: diagnostic warnings/errors.

## 2) View Discovery and Inspection

### `archi_list_views`
- Use when: finding target views by name/type/viewpoint.
- Input: optional filters and pagination.
- Output: filtered view list.

### `archi_get_view_summary`
- Use when: fast inspection of concepts in a view.
- Input: `viewId`, includeConnections optional.
- Output: compact mappings concept↔visual.

### `archi_get_view`
- Use when: full geometry/style/connection details are needed.
- Input: `viewId`.
- Output: complete view payload.

### `archi_validate_view`
- Use when: checking view connection integrity after edits.
- Input: `viewId`.
- Output: validation violations.

### `archi_export_view`
- Use when: delivering PNG/JPG output.
- Input: `viewId`, format, optional output path/scale/margin.
- Output: export metadata/path.

## 3) View Lifecycle and Layout

### `archi_create_view`
- Use when: creating a new target view.
- Input: name + optional viewpoint/folder/documentation.
- Output: new view ID.
- Caution: viewpoint values are strict; omit viewpoint if uncertain.

### `archi_duplicate_view`
- Use when: varianting an existing view with similar structure.

### `archi_delete_view`
- Use when: user explicitly requests removal.
- Safety: destructive; confirm intent first.

### `archi_set_view_router`
- Use when: connection routing should be `bendpoint` or `manhattan`.

### `archi_layout_view`
- Use when: auto-layout after major additions.
- Input: rank direction and spacing options.
- Output: updated coordinates.

## 4) Core Mutation Tool

### `archi_apply_model_changes`
- Use when: creating/updating/deleting elements/relationships and editing view objects.
- Input: array of change operations.
- Output: async operation identifier and temp ID mapping on completion.

Supported operation families include:
- Elements: `createElement`, `updateElement`, `deleteElement`, `setProperty`, `moveToFolder`
- Relationships: `createRelationship`, `updateRelationship`, `deleteRelationship`
- Views: `createView`, `deleteView`, `addToView`, `addConnectionToView`, `nestInView`, `moveViewObject`, `styleViewObject`, `styleConnection`, `deleteConnectionFromView`, `createNote`, `createGroup`

Critical usage rules:
- Always wait for operation completion before dependent calls.
- Use `tempId` consistently to chain created IDs.
- `addConnectionToView` needs visual IDs, not concept IDs.
- For `moveViewObject`, prefer `width`/`height` keys.
- For `createNote`, use `content` (not `text`).

## 5) Async Operation Control

### `archi_wait_for_operation`
- Use when: blocking until async mutation completes.
- Input: `operationId` + optional timeout/poll interval.
- Output: terminal status + result payload.
- Preferred over manual polling loops.

### `archi_get_operation_status`
- Use when: single status check without waiting.

### `archi_list_operations`
- Use when: inspecting recent operation history and failures.

## 6) Higher-Level Placement Tool

### `archi_populate_view`
- Use when: adding many existing elements to a view and auto-connecting known relationships.
- Input: `viewId`, `elementIds`, autoConnect flags/filters.
- Output: placement and connection results.
- Rule: use when concepts already exist and rapid view population is desired.

## 7) Scripting and Administrative Tools

### `archi_run_script`
- Use when: structured tools cannot express required diagnostics or read tasks.
- Caution: execute carefully; prefer structured tools first.

### `archi_save_model`
- Use when: user requests persistence after successful validation.

### `archi_list_folders`
- Use when: locating destination folders for move/create operations.

### `archi_get_test`
- Use when: troubleshooting server thread wiring.

### `archi_shutdown_server`
- Use when: explicit admin shutdown requested.
- Safety: destructive to session availability.

### `archi_plan_model_changes`
- Use when: generating a non-mutating plan preview for simple create operations.
- Note: do not treat as execution.

## Canonical Sequence Patterns

- Read-only analysis: health → search/query → view summary/detail → diagnostics.
- Model mutation: search → apply changes → wait → validate/diagnostics → save.
- View build: list/create view → add visuals → add connections → layout/router → validate → export/save.
