# Operation Recipes

Step-by-step sequences for common multi-step modeling tasks. Follow these recipes for deterministic, reliable execution.

---

## Recipe 1: Create Elements and Relationships

**Use when:** Building out a new domain, adding concepts to an existing model.

```
Step 1  archi_search_model      Search for existing elements by type/name to avoid duplicates.
Step 2  Plan batch              Determine which elements and relationships to create.
                                Assign a tempId to every new element and relationship.
Step 3  archi_apply_model_changes  Submit batch (≤8 ops). Within one batch, createRelationship
                                can reference tempIds from createElement in the same batch.
Step 4  archi_wait_for_operation   Collect resolved IDs (tempId → realId mapping).
Step 5  Repeat steps 3-4          If more than 8 operations, submit additional batches.
                                Use resolved realIds from prior batches for cross-references.
Step 6  archi_get_model_diagnostics  Verify no orphans or ghosts.
```

**Idempotent variant:** If repeated invocations should be safe (e.g., rerunnable pipelines), use `createOrGetElement`/`createOrGetRelationship` with `onDuplicate: reuse` instead of `createElement`/`createRelationship`. This eliminates the need for step 1 search and avoids duplicates even on retry. See Recipe 9.

**tempId naming convention:** Use descriptive prefixes for readability:
- Elements: `e-customer`, `e-order-service`, `e-payment-process`
- Relationships: `r-serves-customer`, `r-realizes-payment`
- Visuals: `v-customer`, `v-order-service`

---

## Recipe 2: Build a View from Existing Concepts

**Use when:** Creating a new diagram from elements that already exist in the model.

```
Step 1  archi_list_views           Check if a similar view already exists.
Step 2  archi_search_model         Gather element IDs for concepts to include.
Step 3  archi_create_view          Create the new view (omit viewpoint to avoid validation errors).
Step 4  archi_populate_view        Pass elementIds + viewId with autoConnect=true.
                                   This places elements and auto-connects existing relationships.
Step 5  archi_wait_for_operation   populate_view is async — MUST wait before layout.
Step 6  archi_set_view_router      Optional: set to 'manhattan' for clean orthogonal routing.
Step 7  archi_layout_view          Auto-arrange. Use rankdir='TB' for layered, 'LR' for flow.
Step 8  archi_validate_view        Check for broken connections.
Step 9  archi_export_view          Optional: export PNG/JPG if user requested.
```

---

## Recipe 3: Build a View from New Concepts (End-to-End)

**Use when:** User describes a scenario and expects both elements and a view.

```
Step 1   archi_search_model         Search broadly for reusable existing elements.
Step 2   archi_apply_model_changes  Create missing elements + relationships (batch ≤8).
Step 3   archi_wait_for_operation   Collect tempId → realId mappings.
Step 4   Repeat 2-3                 For additional batches if needed.
Step 5   archi_create_view          Create the target view.
Step 6   archi_apply_model_changes  addToView for all elements. Assign tempId to each visual.
                                    Use parentVisualId for nesting (e.g., node containing device).
Step 7   archi_wait_for_operation   Collect visual tempId → visual realId mappings.
Step 8   archi_apply_model_changes  addConnectionToView for relationships.
                                    Use sourceVisualId/targetVisualId from step 7 results.
Step 9   archi_wait_for_operation   Confirm connections placed.
Step 10  archi_set_view_router      Optional: 'manhattan' for technical views.
Step 11  archi_layout_view          Auto-arrange.
Step 12  archi_validate_view        Verify integrity.
Step 13  archi_get_model_diagnostics  Optional: broader model health check.
```

**Critical:** Steps 6-7 and 8-9 cannot be merged. You need visual IDs from addToView before you can create connections.

---

## Recipe 4: Repair or Extend an Existing View

**Use when:** Fixing broken connections, adding missing elements, or restyling.

```
Step 1  archi_get_view_summary     Quick concept coverage check. Note what's present/missing.
Step 2  archi_validate_view        Detect broken connections or violations.
Step 3  archi_get_view             Full detail only if geometry-level repair is needed.
Step 4  archi_apply_model_changes  Fix issues: add missing visuals, reconnect, restyle, move.
Step 5  archi_wait_for_operation   Confirm changes applied.
Step 6  archi_layout_view          Only if broad structural changes were made.
Step 7  archi_validate_view        Re-validate to confirm fixes.
```

---

## Recipe 5: Controlled Large Change Set (20+ operations)

**Use when:** Bulk creation of many elements, relationships, or view objects.

```
Step 1  Partition changes           Split into coherent chunks of ≤8 operations.
                                    Group by: elements first, then relationships, then view ops.
Step 2  For each chunk:
        a. archi_apply_model_changes  Submit chunk. All tempId references from prior chunks
                                      should use resolved realIds.
        b. archi_wait_for_operation   Confirm completion, collect new ID mappings.
        c. archi_get_model_diagnostics  Optional: check health after each chunk.
Step 3  On any failure:              STOP immediately. Do not continue with remaining chunks.
                                    Capture: failing chunk index, operation that failed,
                                    diagnostic output, and operation status detail.
                                    Report to user with remediation options.
Step 4  After all chunks complete:  Run final diagnostics and validation.
```

**Chunking strategy for view assembly:**
1. First batch: all `addToView` operations (get visual IDs).
2. Second batch: all `addConnectionToView` operations (using visual IDs from step 1).
3. Third batch: any `nestInView`, `moveViewObject`, `styleViewObject` operations.

---

## Recipe 6: Read-Only Model Audit

**Use when:** User wants quality assessment without changes.

```
Step 1  archi_get_model_stats        Get overall model shape and counts.
Step 2  archi_query_model            Sample elements for naming/typing spot-checks.
Step 3  archi_search_model           Targeted searches for anti-patterns:
                                     - Search by type to check naming consistency within a type.
                                     - Search for elements with generic names.
Step 4  archi_get_relationships_between_elements  Check suspicious clusters for
                                     circular dependencies or missing links.
Step 5  archi_get_model_diagnostics  Check for orphans, ghosts, rollback artifacts.
Step 6  archi_list_views             Identify views. Run archi_validate_view on key views.
Step 7  Report:                      Summarize findings with severity, provide remediation steps.
                                     Do not apply fixes without explicit user approval.
```

---

## Recipe 7: Capability Map View

**Use when:** Building a structured capability overview with optional heat mapping.

```
Step 1  archi_search_model type='capability'  Find existing capabilities.
Step 2  archi_search_model type='goal'        Find goals that capabilities realize.
Step 3  Create missing capabilities and goals via archi_apply_model_changes.
Step 4  Create realization relationships (capability → goal, process → capability).
Step 5  archi_wait_for_operation.
Step 6  archi_create_view name='Capability Map'.
Step 7  archi_apply_model_changes: addToView for top-level capabilities.
        Use parentVisualId to nest sub-capabilities inside parent visual objects.
Step 8  archi_wait_for_operation → get visual IDs.
Step 9  archi_apply_model_changes: addConnectionToView for realization relationships.
Step 10 archi_wait_for_operation.
Step 11 archi_layout_view algorithm='dagre' rankdir='TB'.
Step 12 Optional: archi_apply_model_changes with styleViewObject to color-code
        capabilities by maturity (green=#00CC66, yellow=#FFCC00, red=#FF3333).
Step 13 archi_validate_view.
```

---

## Recipe 8: Migration Roadmap View

**Use when:** Modeling architecture transitions with plateaus, gaps, and work packages.

```
Step 1  Create plateaus: Baseline, Transition(s), Target.
Step 2  Create gap elements linking plateaus.
Step 3  Create work packages and deliverables.
Step 4  Create relationships:
        - plateau → [triggering] → plateau (timeline sequence)
        - gap → [association] → plateau pairs
        - work-package → [realizes] → deliverable
        - deliverable → [realizes] → plateau
Step 5  archi_wait_for_operation.
Step 6  Create view, add all elements, add connections.
Step 7  Layout with rankdir='LR' for timeline flow.
Step 8  Optional: style plateaus with distinct colors per state.
Step 9  Validate.
```

---

## Error Recovery

### Batch failure mid-sequence

1. Note the exact chunk number and operation that failed.
2. Run `archi_get_operation_status` with the failed `operationId` for error detail.
3. Run `archi_get_model_diagnostics` to check for partial application / orphans.
4. Report to user: what succeeded, what failed, what the model state is.
5. Do not retry the failed batch automatically — let the user decide.

### Rate limiting (HTTP 429)

The MCP layer handles automatic retry with exponential backoff. If you receive a 429 error directly, wait 30 seconds before retrying.

### Missing visual IDs for connections

If `addConnectionToView` fails because visual IDs don't exist:
1. Run `archi_get_view_summary` to check which visuals are actually on the view.
2. Verify you used the visual IDs from `addToView` wait results, not concept IDs.
3. If the element was never added to the view, add it first via `addToView`.

---

## Recipe 9: Idempotent / Upsert Creation

**Use when:** The same modeling workflow may be re-invoked (pipelines, retries, automation scripts) and must not create duplicates.

```
Step 1  Plan batch              Use createOrGetElement / createOrGetRelationship instead of
                                createElement / createRelationship. Assign tempIds as usual.
                                Set onDuplicate: 'reuse' on each operation (or set request-level
                                duplicateStrategy: 'reuse').
Step 2  archi_apply_model_changes  Submit batch. Include idempotencyKey for full replay safety.
                                Example: idempotencyKey='modeling-session-20260213-batch1'
Step 3  archi_wait_for_operation   Result includes reused:true on ops that matched existing
                                concepts. tempId → realId mapping works identically whether
                                the element was created or reused.
Step 4  Continue with view ops   Use resolved IDs for addToView / addConnectionToView as normal.
Step 5  On re-run:              If exact same idempotencyKey + payload is sent again, the server
                                replays the cached result (no model mutation). If the payload
                                differs, a 409 Idempotency Conflict is returned.
```

**Operation structure examples:**

```json
{
  "op": "createOrGetElement",
  "create": { "type": "application-component", "name": "Order Service", "tempId": "e-order" },
  "match": { "type": "application-component", "name": "Order Service" },
  "onDuplicate": "reuse"
}
```

```json
{
  "op": "createOrGetRelationship",
  "create": { "type": "serving-relationship", "sourceId": "e-order", "targetId": "e-customer", "tempId": "r-serves" },
  "match": { "type": "serving-relationship", "sourceId": "e-order", "targetId": "e-customer" },
  "onDuplicate": "reuse"
}
```

**When to use upsert vs search-first:**

| Scenario | Approach |
|---|---|
| Automation pipeline that may re-run | `createOrGetElement` + `reuse` + `idempotencyKey` |
| Interactive modeling with user review | Search first, then `createElement` for new concepts |
| Merging concepts from an external source | `createOrGetElement` + `reuse` to deduplicate against existing model |
| One-time bulk creation | `createElement` is sufficient (simpler syntax) |

**Key rules:**
- `createOrGetRelationship` does NOT support `onDuplicate: rename` — only `error` or `reuse`.
- `onDuplicate` on individual operations overrides the request-level `duplicateStrategy`.
- `idempotencyKey` has a 24h replay window. After that, the key expires and a new request with the same key is treated as fresh.
- Chunked batches: the MCP layer derives per-chunk keys as `${base}:chunk:${index}:of:${total}`.
3. If the element was never added to the view, add it first via `addToView`.
