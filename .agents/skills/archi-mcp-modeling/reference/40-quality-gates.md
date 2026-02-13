# Quality Gates

Run these checks before declaring any modeling task complete. Gates are ordered by priority — do not skip Gate 1 or Gate 2.

---

## Gate 1: Semantic Correctness (mandatory)

Verify that every element and relationship created in this session uses the correct ArchiMate semantics.

### Element type checks

| Check | How to verify |
|---|---|
| Active structure elements model performers, not behavior | Actor/Component/Node = who performs. Process/Function/Service = what is performed. |
| Behavior elements match temporal intent | Process = ordered sequence with outcome. Function = stable grouped behavior. Service = externally visible contract. |
| Passive structure matches information level | Business Object = conceptual. Data Object = logical/application. Artifact = physical/deployable. |
| No layer confusion | Microservices → `application-component`, not `technology-service`. Kubernetes cluster → `node`, not `application-component`. |

### Relationship checks

| Check | How to verify |
|---|---|
| No lazy associations | Every `association-relationship` should be examined — could a serving, realization, assignment, or composition replace it? |
| Serving direction correct | Arrow points **toward the consumer** (the served element). Provider → Consumer. |
| Realization direction correct | Concrete element → Abstract element. Process → Service. Artifact → Component. |
| Assignment links performer to behavior | Actor → Role, Role → Process, Component → Function. |
| Access has correct type | Read, Write, or ReadWrite specified when behavior accesses passive structure. |
| No strict layer violations | Business elements should not directly link to Technology elements without Application layer intermediation. |
| Cross-layer relationships are valid | Consult `allowed-relationships.md` if uncertain about a specific source→target combination. |

### Tools for verification

- `archi_search_model` — spot-check element types and names.
- `archi_get_element` — inspect specific elements and their relationships.
- `archi_get_relationships_between_elements` — check a cluster for relationship correctness.

---

## Gate 2: Model Integrity (mandatory)

Verify that mutations did not create orphans, duplicates, or ghosts.

| Check | Tool | What to look for |
|---|---|---|
| **No orphan elements** | `archi_get_model_diagnostics` | Elements that exist but are not connected or in any view |
| **No ghost objects** | `archi_get_model_diagnostics` | Visual objects referencing deleted concepts |
| **No unexpected duplicates** | `archi_search_model` by name | Multiple elements with the same or very similar name and type |
| **Batch completed cleanly** | `archi_get_operation_status` | All operations show `complete` status, no partial failures |
| **No rollback artifacts** | `archi_get_model_diagnostics` | GEF rollback can leave partially created objects |

### If diagnostics show problems

1. Report the exact diagnostic output to the user.
2. Do not attempt automatic fixes without user approval.
3. For orphans from the current session, offer to either connect them or delete them.
4. For duplicates, offer to merge (update references to point to the canonical element, then delete the duplicate).

---

## Gate 3: View Integrity (when views were created or modified)

| Check | Tool | What to look for |
|---|---|---|
| **All expected elements present** | `archi_get_view_summary` | Compare element list against what was requested |
| **All expected connections present** | `archi_get_view_summary` with `includeConnections=true` | Relationships should be visualized as connections |
| **No broken connections** | `archi_validate_view` | Connections referencing visuals not on the view |
| **No orphan visuals** | `archi_get_view_summary` | Visual objects not connected to anything (unless intentional grouping) |
| **Nesting correct** | `archi_get_view` (if nested elements used) | Children inside correct parent visual objects |

### Connection completeness check

After every view build, verify that **every relationship between elements on the view has a corresponding connection on the view**. Missing connections make the view incomplete and misleading.

```
1. Get element concept IDs from view summary.
2. archi_get_relationships_between_elements with those IDs.
3. Compare against connections in the view.
4. Any relationship without a visual connection → add it with addConnectionToView.
```

---

## Gate 4: Readability and Abstraction (when views were created)

| Check | Standard |
|---|---|
| **Single concern** | View serves one stakeholder concern or question. Not a kitchen-sink diagram. |
| **Element count** | ≤20 target, ≤40 absolute max. Split if over. |
| **Element density** | No element with 10+ connections in view. Decompose "god components." |
| **Abstraction consistency** | All elements at similar detail level. No strategic capabilities alongside deployment artifacts. |
| **Layout readability** | Auto-layout applied. Flow direction consistent (TB or LR, not mixed). |
| **Connection routing** | Manhattan for technical views. Bendpoint for organic/strategic views. |

### When to split a view

Split into multiple views if:
- Element count exceeds 30.
- The view serves multiple stakeholder groups with different concerns.
- The view spans more than 2 ArchiMate layers at inconsistent detail levels.
- A single element has more than 8 connections making the diagram unreadable.

---

## Gate 5: Naming Consistency (when elements were created)

| Check | Standard |
|---|---|
| **Title Case** | All element names use Title Case |
| **No type in name** | Don't name something "Payment Service Application Component" — let the tool show the type |
| **Convention by category** | Structural = noun phrase; Process = verb phrase; Service = noun/gerund; Capability = compound noun |
| **No abbreviations** | Unless domain-standard (API, CRM, ERP, GDPR are fine) |
| **Consistency with existing** | New elements follow the same naming pattern as existing elements of the same type in the model |

### Quick naming audit

```
archi_search_model type='<type>' limit=50
→ Scan returned names for pattern consistency.
→ Flag any that violate conventions.
```

---

## Gate 6: Persistence and Handoff (final step)

| Action | When |
|---|---|
| **Save model** | Only when user explicitly requests. Use `archi_save_model`. |
| **Export view** | Only when user explicitly requests. Verify format and path. |
| **Completion summary** | Always. Must include: |

### Required completion summary content

1. **What was created:** Element count by type, relationship count by type, view name(s).
2. **What was reused:** Elements that already existed and were referenced.
3. **View status:** Layout applied, validation result (pass/warnings).
4. **Unresolved concerns:** Any ambiguity in requirements, any semantic choices the user should review.
5. **Next steps:** Suggestions for follow-up (additional views, deeper decomposition, audits).

**Example:**
> Created 6 elements (3 application-component, 2 application-service, 1 data-object), 5 relationships (3 serving, 1 realization, 1 access), and view "Order Processing Integration". Layout applied (LR). Validation passed. Consider adding technology layer deployment mapping as a follow-up.
