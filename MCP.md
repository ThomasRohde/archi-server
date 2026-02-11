# MCP Exercise Report

This report documents exercising two MCP servers (Archi model server and GitHub MCP server), observations, and recommendations.

## Scope
- Performed only non-destructive reads (health, stats, listings, samples) to respect mutation safety.
- Servers exercised:
  - Archi MCP (Archi API) at 127.0.0.1:8765, model "Bank".
  - GitHub MCP Server (Actions API) against repo cli/cli.

## Archi MCP Results
- Health: status ok, version 1.6.1, host 127.0.0.1:8765, uptime ~189,604s, memory used ~156MB.
- Model summary: 183 elements, 294 relationships, 10 views; element types: 31; relationship types: 9.
- Top element types (counts): application-component 18, application-service 14, business-process 13, data-object 12, business-object 10, capability 8.
- Top relationship types: realization 101, serving 51, access 31, influence 29, assignment 30.
- Views (10):
  - Retail Bank Motivation And Capability View (motivation)
  - Retail Bank Business Operations View (business_process_cooperation)
  - Retail Bank Application Landscape View (application_cooperation)
  - Retail Bank Information Structure View (information_structure)
  - Retail Bank Layered Service Realization View (layered)
  - Retail Bank Technology Deployment View (technology)
  - Retail Bank Transformation Roadmap View (implementation_and_migration)
  - Customer-Facing Domain Cross-Layer View (layered)
  - Customer Banking Operations View (business_process_cooperation)
  - Credit And Risk Operations View (business_process_cooperation)
- Folders: Strategy, Business, Application, Technology & Physical, Motivation, Implementation & Migration, Other, Relations, Views.
- Sample elements retrieved (10): various Capabilities (Customer Onboarding, Deposits, Payments, Lending, Fraud, Collections, Analytics, Regulatory Reporting) and Value Streams (Acquire Customer, Serve Daily Banking).

## GitHub MCP Server Results (cli/cli)
- Workflows total: 19.
- Examples: Unit and Integration Tests, Lint, Code Scanning, PR Automation, Issue Automation, Deployment, Discussion Triage, Dependabot Updates, Go Vulnerability Check, Copilot coding agent, Copilot code review.

## Observations
- Archi MCP responses are consistent and include requestId; health and stats endpoints provide actionable system and model context.
- View and folder listings are fast and structured (names, types, counts), suitable for UI and automation.
- Query sampling via limits is useful to avoid overfetch; relationshipLimit helps keep payloads small.
- GitHub MCP server returns accurate workflow metadata with ids/paths; minimal data sufficient for CI dashboards.

## Recommendations
### API design & ergonomics
- Keep a consistent envelope (ok, operation, data, requestId) across all endpoints; this is already good.
- Standardize pagination across servers: use limit/offset or cursor (after) uniformly; expose perPage defaults and max.
- Provide minimal_output flags broadly to reduce payloads; offer rich/compact variants.
- Ensure strong typing in responses (e.g., enumerated viewpoint names, relationship types) and publish JSON Schemas.

### Stability & safety
- Distinguish transient network errors clearly (e.g., fetch failed vs server error) and include retriable hints.
- Maintain a clear read vs mutate contract; require explicit user confirmation for mutations and support dry-run/plan previews.
- Expose health/ready endpoints for orchestration and CI checks; include uptime and queue stats (already present).

### Pagination, filtering, search
- Offer caseSensitive and includeRelationships options consistently (Archi search already supports these).
- Add multi-field filters and server-side sorting where practical; document defaults.

### Diagnostics & observability
- Include timing metrics (server processing time) and rate-limit headers where applicable.
- Keep requestId in all responses; add correlationId support for cross-service tracing.

### Developer UX
- Provide official client packages and examples for common languages; include retry/backoff helpers.
- Document error codes and failure modes with remediation steps.
- Ship example scripts for typical tasks (list views, validate view, export view, workflow summaries).

### Archi-specific suggestions
- Add compact view summaries for quick element/connection counts (view_summary exists—continue to optimize).
- Provide auto-layout and router controls via API (present—document best practices and idempotency).
- Expand export options (PNG/JPG plus SVG/PDF) and allow naming templates.
- Enhance query_model with typed sampling presets (e.g., "capabilities", "services", "processes").

### GitHub MCP-specific suggestions
- Normalize Actions data to core fields (name, id, path, state, created/updated) and expose URL fields consistently (already done).
- Add convenience endpoints for latest run status per workflow and failed jobs logs (tools exist—document workflows).
- Support minimal_output for runs/jobs/artifacts and cursor pagination; include tail_lines parameters for logs.

## Next steps
- Extend exercise to view summaries, validations, and safe exports; add mutation tests with explicit user consent.
- Integrate retries and circuit-breakers in clients; build lightweight dashboards using these endpoints.

## Implemented agent UX improvements (February 11, 2026)
- Added `archi_wait_for_operation` to poll async operations until terminal state (`complete`/`error`) or timeout.
  - Benefit: agents can complete write flows in one tool call instead of hand-rolling polling loops.
- Updated `archi_get_operation_status` to accept both `operationId` and `opId`.
  - Benefit: avoids input mismatch when agents pass the identifier field name used in mutation responses.
- Upgraded `archi_list_views` with optional filtering/sorting/pagination arguments (`exactName`, `nameContains`, `type`, `viewpoint`, `limit`, `offset`, `sortBy`, `sortDirection`) and MCP pagination metadata.
  - Benefit: faster view discovery with lower context size, especially on large models.
- Added MCP resource `archi://agent/quickstart` with a read-first workflow and ID safety guidance.
  - Benefit: better discoverability for common tool sequences and fewer visual-id vs concept-id mistakes.
- Added additional tool-specific NotFound hints for ID misuse in relationship/view-population flows.
  - Benefit: clearer remediation when agents accidentally pass visual IDs where concept IDs are required.

### Validation
- Extended MCP contract tests to cover:
  - operation wait behavior (`archi_wait_for_operation`),
  - operation ID aliasing (`operationId` with `archi_get_operation_status`),
  - filtered/sorted/paginated view listing metadata,
  - quickstart resource availability/content.

