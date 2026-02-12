# Quality Gates and Safety Checks

Run these checks before declaring completion.

## Gate 1: Semantic Correctness

- Element types align with intent (actor vs role, process vs function, service vs internal behavior).
- Relationship semantics are specific and directionally correct.
- Association is not used where a stronger typed relationship exists.

## Gate 2: Model Integrity

- No unexpected duplicates created.
- No orphan/ghost diagnostics after mutations.
- Relationship-heavy batches succeeded without rollback symptoms.

Use:
- `archi_search_model`
- `archi_get_model_diagnostics`
- `archi_list_operations` / `archi_get_operation_status`

## Gate 3: View Integrity

- All expected elements appear in target view.
- Connections reference visuals on that same view.
- View validation returns no blocking violations.

Use:
- `archi_get_view_summary`
- `archi_validate_view`
- `archi_get_view` (if geometry/debug required)

## Gate 4: Readability and Abstraction

- View focuses on one stakeholder concern.
- Detail level matches requested audience.
- Diagram complexity is manageable (roughly 20 elements target, ~40 upper bound).

## Gate 5: Persistence and Handoff

- Save only when user requested or workflow requires it.
- If exporting visuals, verify format/path.
- Provide explicit summary: what changed, where, and any unresolved risks.

Use:
- `archi_save_model`
- `archi_export_view`
