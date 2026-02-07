# PRD: Archi Node CLI (Runbook Executor)

## Document Control

- Product: `archi` Node.js CLI
- PRD version: `v1.0`
- Date: `2026-02-07`
- Owner: `archi-server`
- Status: Draft

## Problem Statement

Teams can call the Archi server API directly, but repeatable model automation is currently ad hoc:

- Scripts are hard to review and hard to standardize.
- Multi-step workflows are brittle and inconsistent.
- Validation is often done too late (after mutation attempts).

The runbook spec and schema now exist, but there is no production CLI that executes them consistently.

## Vision

Ship a Node.js CLI that executes runbooks deterministically with strong validation, clear error reporting, and CI-friendly behavior.

## Goals

1. Execute `archi-cli/v1alpha1` runbooks end-to-end.
2. Enforce schema + semantic validation before mutation by default.
3. Provide deterministic step execution semantics and clear diagnostics.
4. Work cross-platform (Windows/macOS/Linux) in local and CI environments.
5. Support human and agent authoring workflows equally well.

## Non-Goals (MVP)

1. Full interactive TUI.
2. Remote secret manager integrations.
3. Distributed execution across multiple hosts.
4. New DSL features beyond the current spec.

## Target Users

1. Architects automating model changes from templates/patterns.
2. CI pipelines validating and applying model updates.
3. AI agents generating and running runbooks with auditable outcomes.

## Success Metrics

1. `>= 95%` of runbooks in examples pass without manual edits.
2. `<= 2%` ambiguous/unclear failure reports in pilot feedback.
3. P50 execution overhead (excluding server time) under `250ms` per step.
4. Zero silent partial failures (all failures produce explicit step diagnostics).

## Scope

### MVP (v1.0)

1. Commands:
   - `archi runbook validate <file>`
   - `archi runbook run <file>`
2. Inputs:
   - YAML runbook file
   - Optional `--var key=value` (repeatable)
   - Optional `--var-file <json|yaml>`
3. Outputs:
   - Human-readable logs
   - Optional machine output with `--output json`
4. Step types:
   - `http`, `apply`, `wait`, `set`, `assert`, `foreach`, `parallel`, `script`
5. Validation:
   - JSON Schema validation (`archi-runbook.schema.json`)
   - Semantic checks (duplicate step IDs, script permission gate, invalid refs)
6. Reliability:
   - Timeouts, retries, expect assertions, fail-fast defaults

### Post-MVP (v1.1+)

1. `archi runbook lint <file>` with richer style rules.
2. Run resume/retry from failed step.
3. Structured artifacts (`--report <file>`).
4. Plugin hook points for custom steps.

## User Stories

1. As an architect, I run one YAML file and get a deterministic model change outcome.
2. As a CI engineer, I fail a pipeline immediately when schema or expectation checks fail.
3. As an AI agent, I can rely on stable expression rules and step outputs (`steps.<id>.out.*`).
4. As a reviewer, I can inspect logs and machine-readable execution reports.

## Functional Requirements

### CLI Interface

1. `archi --version` returns version and schema compatibility.
2. `archi runbook validate <file> [--strict] [--output json]`
3. `archi runbook run <file> [--var k=v]... [--var-file file] [--output json] [--max-parallel N]`

### Parsing and Validation

1. Parse YAML into JSON-compatible AST.
2. Validate against `archi-runbook.schema.json` using JSON Schema 2020-12.
3. Semantic checks:
   - Unique step IDs.
   - Valid references to `steps.<id>.out` and declared vars where statically possible.
   - Block `script` steps unless `spec.permissions.scripts: true`.

### Expression and Templating

1. Expression delimiter: `${{ ... }}`.
2. Language: JMESPath.
3. If whole string is one token, preserve native JSON type.
4. If mixed token + literal, stringify tokens and concatenate.
5. Unknown references fail step/runbook (no silent null behavior).

### Execution Engine

1. Sequential execution by default.
2. `when` evaluation controls step skip behavior.
3. Step context:
   - global: `vars`, `env`, `steps`
   - local aliases: `step`, `http`, `body`, `out`
4. Retry/timeout precedence:
   - step override > spec connection defaults > built-in defaults.
5. `expect` evaluated after request/step completion and before `outputs`.

### HTTP Behavior

1. Use `spec.connection.baseUrl` + `request.path`.
2. Merge headers: default headers then step headers.
3. Query and body support expression expansion.
4. Capture response into:
   - `step.http.status`
   - `step.http.headers`
   - `step.http.body`

### `apply` Step

1. POST to `/model/apply` (or custom endpoint).
2. Extract operation ID from `operationIdFrom` (default `body.operationId`).
3. Poll `/ops/status` with `opId` until terminal status.
4. Final poll response replaces `step.http`.

### `wait` Step

1. Poll request until `until` is truthy.
2. Fail on `failWhen` truthy or timeout.

### `foreach` Step

1. Evaluate `items` expression to array.
2. For each item, set:
   - `vars.loop.index`
   - `vars.loop.<as>`

### `parallel` Step

1. Execute branches concurrently with `maxConcurrency`.
2. Branch `set` mutations are branch-local.
3. Store branch outputs under `steps.<parallelId>.branches.<name>`.

### Reporting and Exit Codes

1. Exit `0`: success.
2. Exit `1`: validation error.
3. Exit `2`: execution error.
4. Exit `3`: partial success with `continueOnError`.
5. JSON output includes per-step status, timings, errors, and outputs.

## Non-Functional Requirements

1. Runtime: Node.js `>= 20`.
2. Language: TypeScript.
3. Determinism: same input/context -> same execution plan/order.
4. Performance: support `>= 1000` step runbooks without memory pressure.
5. Security:
   - No implicit script execution.
   - Optional env allowlist (`--env-allow VAR1,VAR2`).
6. Observability:
   - Structured logs (`info`, `warn`, `error`, `debug`).
   - Request correlation with step IDs.

## Technical Architecture

1. `packages/cli`:
   - command parser
   - process lifecycle and output formatting
2. `packages/core`:
   - parser + validator
   - expression engine
   - execution engine
   - context store
3. `packages/http`:
   - HTTP client wrapper
   - retry/backoff/timeout policies
4. `packages/schema`:
   - bundled `archi-runbook.schema.json`

Execution pipeline:

1. Load runbook.
2. Schema validate.
3. Semantic validate.
4. Build immutable execution plan.
5. Execute steps and persist runtime context.
6. Emit summary/report and exit code.

## Dependencies (Proposed)

1. CLI: `commander`
2. YAML: `yaml`
3. Schema: `ajv` + `ajv-formats`
4. Expressions: `jmespath`
5. HTTP: Node `fetch` (undici)
6. Logging: `pino` (or minimal internal logger)
7. Tests: `vitest` + `nock` (or `msw` for node)

## Example Command UX

```bash
archi runbook validate archi-cli/create-view.runbook.yaml

archi runbook run archi-cli/create-view.runbook.yaml \
  --var viewName="Payments - Capability Map" \
  --output json
```

## Risks and Mitigations

1. Risk: Expression ambiguity and runtime surprises.
   - Mitigation: strict expression parser, fail-fast unknown refs, rich error paths.
2. Risk: Long polling runs and CI flakiness.
   - Mitigation: explicit timeout defaults and per-step overrides.
3. Risk: Parallel branch race semantics confusion.
   - Mitigation: define branch-local `vars` and document merge behavior.
4. Risk: Script endpoint misuse.
   - Mitigation: explicit permission gate + warning logs.

## Milestones

1. M1: Skeleton CLI + schema validation + `validate` command.
2. M2: Core step engine (`http`, `set`, `assert`) + reporting.
3. M3: Async features (`apply`, `wait`) + retries/timeouts.
4. M4: Control flow (`foreach`, `parallel`) + full integration tests.
5. M5: Release candidate + docs + examples.

## Acceptance Criteria

1. All step types execute according to `archi-cli-spec.md`.
2. `archi runbook validate` catches schema violations with precise file paths.
3. `archi runbook run` returns stable exit codes and machine-readable output.
4. Example runbook in spec executes against a running archi-server with expected outputs.

## Open Questions

1. Should `validate` optionally perform endpoint reachability checks (`--online`)?
2. Should run reports be persisted by default or only with `--report`?
3. Should non-terminal statuses in `/ops/status` be configurable per runbook globally?

