---
name: archi-mcp-modeling
description: 'Model and evolve ArchiMate architectures through the local Archi MCP server with semantically correct element and relationship choices. Use when asked to create/update Archi models, generate views, map capabilities to applications/technology, or apply migration roadmaps using safe async operations.'
license: Complete terms in LICENSE.txt
---

# Archi MCP Modeling Skill

Model ArchiMate content through the Archi MCP server with task-routed reference loading, explicit tool selection, and safe async mutation handling.

## When to Activate

| User intent | This skill applies |
|---|---|
| Create or update ArchiMate elements/relationships | Yes |
| Build an architecture view from requirements or patterns | Yes |
| Map strategy → capabilities → applications → technology | Yes |
| Model microservices, integration, cloud, or migration roadmaps | Yes |
| Audit model quality (orphans, duplicates, wrong relationships) | Yes |
| General Archi server admin (health, shutdown, config) | Partially — use tool catalog only |

## Prerequisites

1. Archi model is open in Archi 5.7+ with jArchi 1.11+.
2. Archi API server is running (`archi_get_health` returns healthy).
3. At least one view is open in the Archi editor (required for undo support).

## Task Routing — What to Load

**Always start by reading `reference/01-task-routing.md`.** It routes you to the minimum set of reference files needed for the current task. Do not load all references upfront — load only what the task requires.

| Reference file | When to load |
|---|---|
| `reference/01-task-routing.md` | **Always first** — determines what else to read |
| `reference/10-mcp-tool-catalog.md` | Before calling any MCP tool |
| `reference/20-modeling-playbook.md` | Before choosing element types, relationship types, or naming |
| `reference/30-operation-recipes.md` | For multi-step mutations, view assembly, or large batches |
| `reference/40-quality-gates.md` | Before declaring completion |

## Execution Contract

These rules are non-negotiable for every task:

1. **Read before write.** Always search/query existing model content before creating anything.
2. **Prefer upsert for idempotent workflows.** When a workflow may be re-invoked, use `createOrGetElement`/`createOrGetRelationship` with `onDuplicate: reuse` instead of search-then-create. Add `idempotencyKey` for full replay safety.
3. **Async awareness.** Every `archi_apply_model_changes` call returns an `operationId`. Call `archi_wait_for_operation` before any dependent operation (layout, validate, export, next batch).
3. **`archi_populate_view` is also async.** Wait for its `operationId` before layout or validation.
4. **tempId discipline.** Assign a `tempId` to every created element/relationship. Use resolved IDs from wait results for subsequent operations.
5. **Visual vs concept IDs.** `addConnectionToView` requires visual object IDs (from `addToView` results), never concept IDs.
6. **Batch size.** Keep mutation batches at ≤8 operations (the MCP layer auto-chunks larger batches but smaller is safer for relationship-heavy work).
7. **Parameter correctness.** Use `width`/`height` (not `w`/`h`) for `moveViewObject`. Use `content` (not `text`) for `createNote`.
8. **No viewpoint guessing.** When creating views, omit the `viewpoint` parameter unless you know the exact supported key. Plain labels like "Application Usage" cause validation errors.
9. **Confirm destructive ops.** Never delete elements, relationships, or views without explicit user intent.
10. **Ambiguity = ask.** Treat unclear requirements as blocking. Ask clarifying questions rather than guessing architecture intent.
11. **Relationship upsert limits.** `createOrGetRelationship` only supports `onDuplicate: error` or `reuse` — `rename` is invalid for relationships.

## Outcome Standard

A task is complete when:

- All created elements use semantically correct ArchiMate types
- Relationships have correct directionality and specificity (no lazy associations)
- Model diagnostics show no orphans or ghosts from the current session
- Views pass `archi_validate_view` with no blocking violations
- A clear summary states what changed and any unresolved uncertainties
- Model is saved only when explicitly requested

## Continuous Improvement

This skill is a living document. When you discover something new while using it — a gotcha, a corrected assumption, a better pattern, a tool behavior not documented here — **update the relevant reference file immediately** rather than just working around it.

Examples of things worth capturing:
- A tool parameter that behaves differently than documented (e.g., accepted values, error conditions)
- A relationship direction or element type choice that was wrong and had to be corrected
- A new recipe or workflow pattern that solved a problem not covered by existing recipes
- An API behavior change (new fields, deprecated options, changed defaults)
- A viewpoint key that is confirmed to work (or confirmed to fail)

**How to update:**
1. Identify the most relevant reference file for the learning.
2. Add the new information in the appropriate section, following the existing format.
3. If the learning contradicts existing content, replace the incorrect guidance — do not leave conflicting advice.
4. Keep additions concise and actionable. Prefer tables and rules over prose.

## External References

- [ArchiMate best practices and patterns](./reference/archimate-guide.md)
- [JArchi → ArchiMate type mapping](./reference/jarchi-archimate-mapping.md)
- [Allowed relationship matrix](./reference/allowed-relationships.md)
- [Archi API OpenAPI spec](../../../openapi.yaml)
- [Project-level runtime instructions](../../../.github/copilot-instructions.md)