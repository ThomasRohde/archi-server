# Operation Recipes (How to Use Tools in Sequence)

Use these recipes for deterministic execution.

## Recipe 1: Add a New Capability Map Slice

1. `archi_search_model` for existing goal/capability/process/app components.
2. `archi_apply_model_changes` to create missing elements and relationships with temp IDs.
3. `archi_wait_for_operation` and collect resolved IDs.
4. `archi_list_views` to find target map, else `archi_create_view`.
5. `archi_apply_model_changes` with `addToView` for elements, then `addConnectionToView` for relationships.
6. `archi_wait_for_operation` then `archi_layout_view`.
7. `archi_validate_view` and `archi_get_model_diagnostics`.
8. `archi_save_model` if user requested persistence.

## Recipe 2: Build Application Integration View

1. `archi_search_model` for components/services/interfaces/data objects.
2. Create missing concepts via `archi_apply_model_changes`.
3. Wait via `archi_wait_for_operation`.
4. Create/find view (`archi_create_view` or `archi_list_views`).
5. Place visuals (`addToView`) and connect relationships (`addConnectionToView`).
6. Apply `archi_set_view_router` (`manhattan` for orthogonal layouts).
7. `archi_layout_view` with left-to-right rank for integration readability.
8. Validate and optionally export via `archi_export_view`.

## Recipe 3: Repair an Existing View

1. `archi_get_view_summary` to inspect concept coverage quickly.
2. `archi_validate_view` to detect broken connections.
3. `archi_get_view` when geometry-level repair is needed.
4. `archi_apply_model_changes` to move/style/nest and reconnect visuals.
5. `archi_wait_for_operation`, then `archi_layout_view` if broad structural changes were made.
6. Re-run `archi_validate_view`.

## Recipe 4: Controlled Large Change Set

1. Partition changes into coherent chunks (prefer ≤20 operations for relationship-heavy work).
2. For each chunk:
   - `archi_apply_model_changes`
   - `archi_wait_for_operation`
   - Optional `archi_get_model_diagnostics`
3. On any failure, stop and report exact failing chunk + operation context.
4. Continue only when prior chunk is complete and clean.

## Recipe 5: Read-Only Audit

1. `archi_get_model_stats` and `archi_query_model`.
2. `archi_search_model` for naming and type consistency checks.
3. `archi_get_relationships_between_elements` for suspicious clusters.
4. `archi_get_model_diagnostics` for orphans/ghosts.
5. Summarize issues and propose minimal remediation steps.
