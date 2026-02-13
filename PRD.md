# Product Requirements Document (PRD)

## Title
MCP Tooling Improvements for Architecture Modeling Workflows

## Date
February 13, 2026

## Author
Codex

## Status
Draft

## Summary
This PRD proposes improvements to the Archi MCP toolset used for model authoring, large-batch mutations, and view construction. The goal is to reduce orchestration overhead, improve reliability for high-volume operations, and make model outcomes more deterministic for both human users and agentic clients.

## Problem Statement
Current workflows are functional but inefficient for large, structured modeling tasks:

1. High call volume is required for hierarchical model creation.
2. Agents must manually orchestrate async lifecycle and tempId mapping across chunks.
3. View construction requires low-level visual operations and explicit nesting logic.
4. Diagnostics focus on structural integrity but provide limited semantic guidance.
5. There are limited idempotent operations for safe reruns and recovery.

## Goals

1. Reduce total MCP calls for common modeling workflows by at least 40%.
2. Increase first-pass success rate for large mutation jobs (100+ ops) to at least 98%.
3. Cut average model build time for capability maps by at least 50%.
4. Improve debuggability with deterministic, machine-actionable failure reasons.
5. Enable safe re-execution without duplicate creation.

## Non-Goals

1. Replacing the existing ArchiMate metamodel or semantics.
2. Changing Archi desktop UX outside MCP-exposed capabilities.
3. Building a full natural-language planner in this phase.

## Primary Users

1. AI agents performing automated architecture modeling.
2. Enterprise architects authoring and validating capability maps.
3. Tool integrators building higher-level workflows on MCP APIs.

## Key Use Cases

1. Create a multi-level capability hierarchy with strict MECE constraints.
2. Generate a single nested view from a hierarchy in one operation.
3. Safely rerun partially failed jobs without duplicates.
4. Validate semantic correctness beyond structural integrity.
5. Produce repeatable output for CI-like model generation pipelines.

## Proposed Improvements

### P0: High Priority

#### 1) Hierarchy Authoring API
Add a high-level operation, for example `createCapabilityHierarchy`, that creates elements, composition relationships, and optional nested view visuals from a single payload.

Required capabilities:
1. Accept tree input with names, docs, and properties.
2. Create missing concepts only, with configurable duplicate policy.
3. Optionally materialize into a target view with nesting and sizing policy.
4. Return full concept and visual mapping table.

Acceptance criteria:
1. A 3-level, 50+ node hierarchy can be created in one API call.
2. Returned mapping includes `conceptId`, `visualId`, and parent references.
3. Operation is replay-safe with configured idempotency key.

#### 2) First-Class Idempotency and Upsert
Add idempotency support and upsert semantics to mutation operations.

Required capabilities:
1. Request-level idempotency key.
2. `createOrGetElement` and `createOrGetRelationship` modes with matching keys.
3. Duplicate strategy options: `error`, `reuse`, `rename`.

Acceptance criteria:
1. Replaying identical payloads does not create duplicates.
2. Client can choose strict failure or automatic reuse.

#### 3) Deterministic Chunking and Failure Contracts
Make chunking behavior explicit and predictable for large batches.

Required capabilities:
1. Client-provided max chunk size hints.
2. Stable operation ordering guarantees.
3. Structured failure payloads with operation index, type, cause, and retryability.

Acceptance criteria:
1. Failed chunk is fully traceable to exact source operation.
2. Recoverable failures can be retried without re-running successful chunks.

#### 4) View Composition Helpers
Add higher-level view helpers to reduce low-level `addToView`/`nestInView` orchestration.

Required capabilities:
1. `populateHierarchyView` helper for recursive placement.
2. Grid/column layout presets for nested children.
3. Option to draw selected relationships automatically in-view.

Acceptance criteria:
1. Nested capability map can be generated from concept IDs in one call.
2. Parent-child nesting is consistent with model composition edges.

#### 5) Semantic Validation Gate
Extend diagnostics beyond orphan and connection checks.

Required capabilities:
1. Validate relationship semantics by layer/type rules.
2. Flag suspicious association overuse where typed relations exist.
3. Detect decomposition anti-patterns (cycles, mixed abstraction levels).

Acceptance criteria:
1. Semantic diagnostics include severity, rule ID, and remediation hint.
2. Validation can run as a pre-save gate.

### P1: Medium Priority

#### 6) Plan-Then-Apply Workflow Improvements
Upgrade planning endpoint to support full-batch dry runs.

Required capabilities:
1. Diff preview for creates/updates/deletes before mutation.
2. Risk score for likely duplicate collisions.
3. Estimated operation cost and chunk count.

Acceptance criteria:
1. Client can approve or reject a mutation plan without side effects.
2. Plan output aligns with final apply output schema.

#### 7) Relationship Visualization Controls
Allow explicit relationship rendering modes in views.

Required capabilities:
1. Render all, selected types, or none.
2. Auto-suppress duplicate/overlapping visual connections.
3. Attach routing preset per relationship family.

Acceptance criteria:
1. Generated views remain readable under high relationship density.
2. Duplicate connection rendering is prevented by default.

#### 8) Better Operation Observability
Add richer operation telemetry for long-running jobs.

Required capabilities:
1. Operation progress percentages and stage markers.
2. Optional event stream endpoint for status updates.
3. Per-operation timing breakdowns for bottleneck analysis.

Acceptance criteria:
1. Clients can show reliable progress bars.
2. Telemetry supports root-cause analysis for slow runs.

### P2: Nice to Have

#### 9) Template Catalog for Common Patterns
Provide built-in templates for common architecture artifacts.

Examples:
1. Capability hierarchy starter.
2. Application integration map.
3. Migration roadmap scaffold.

Acceptance criteria:
1. Template instantiation produces valid model and view artifacts.
2. Templates are parameterizable and versioned.

#### 10) Bulk Export and Snapshot Diff
Add native model snapshot and diff support.

Required capabilities:
1. Export model snapshot metadata before/after mutation.
2. Generate summary diff per element/relationship/view.

Acceptance criteria:
1. Clients can present concise change reports after apply.
2. Snapshot diffs are stable and machine-readable.

## API Considerations

1. Keep backward compatibility for existing operations.
2. Introduce new operations under explicit versioned names.
3. Reuse existing result envelope fields where possible.
4. Standardize schema for `errors`, `warnings`, `mappings`, and `metrics`.

## Success Metrics

1. Median MCP calls per large capability map run.
2. End-to-end completion time for modeled benchmark scenarios.
3. Duplicate creation rate after retries.
4. Percentage of runs requiring manual recovery.
5. Diagnostic signal quality measured by accepted remediation rate.

## Rollout Plan

1. Phase 1: Ship idempotency, deterministic failure contracts, and improved diagnostics.
2. Phase 2: Ship hierarchy authoring and view composition helpers.
3. Phase 3: Ship templates, snapshot diff, and event-stream telemetry.

## Risks and Mitigations

1. Risk: Higher-level helpers may hide semantics.
   Mitigation: Include expandable execution traces showing generated low-level operations.
2. Risk: Upsert matching may bind to wrong concepts.
   Mitigation: Require explicit matching keys and expose confidence diagnostics.
3. Risk: Added complexity in server implementation.
   Mitigation: Deliver features incrementally behind capability flags.

## Open Questions

1. Should idempotency keys be caller-provided only, or server-generated options too?
2. What uniqueness policy should be default for `capability` names?
3. Should semantic validation be blocking by default in `apply`?
4. Which event transport is preferred for operation streaming in MCP contexts?

