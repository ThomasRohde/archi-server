# archi-mcp

TypeScript [Model Context Protocol](https://modelcontextprotocol.io/) server for the Archi Server API, generated from the root `../openapi.yaml` using `@hey-api/openapi-ts`. Compatible with GitHub Copilot, Claude Desktop, Codex, and any MCP client.

## What this includes

- MCP server code in this folder, with generated client sourced from the root API spec (`../openapi.yaml`).
- MCP tools covering health, model, operations, scripts, folders, and views endpoints.
- `stdio` MCP transport for local agent integration.

## Install

```bash
cd archi-mcp
npm install
npm run codegen
npm run build
```

## Global install on your laptop

From this repo:

```bash
cd archi-mcp
npm install
npm run build
npm install -g .
```

This installs two global commands:

- `archi-mcp-server`
- `archi-mcp`

For local development, you can also use:

```bash
cd archi-mcp
npm link
```

## Run

### stdio (default)

```bash
npm start
```

Global command:

```bash
archi-mcp-server
```

## Environment variables

- `ARCHI_API_BASE_URL` (default: `http://127.0.0.1:8765`)
- `ARCHI_API_TIMEOUT_MS` (default: `30000`)

## Key tool groups

Read-only tools:

- `archi_get_health`, `archi_get_test`, `archi_get_model_diagnostics`
- `archi_query_model`, `archi_plan_model_changes`, `archi_search_model`
- `archi_get_model_stats`, `archi_get_element`, `archi_list_folders`
- `archi_list_views` (supports filtering/sorting/pagination), `archi_get_view`, `archi_get_view_summary`, `archi_validate_view`
- `archi_get_relationships_between_elements`
- `archi_get_operation_status`, `archi_wait_for_operation`, `archi_list_operations`

Mutation tools:

- `archi_save_model`, `archi_apply_model_changes`, `archi_populate_view`, `archi_run_script`
- `archi_create_view`, `archi_delete_view`, `archi_export_view`
- `archi_duplicate_view`, `archi_set_view_router`, `archi_layout_view` (`algorithm`: `dagre` or `sugiyama`)
- `archi_shutdown_server`

## Agent UX additions

- `archi_wait_for_operation` removes client-side polling loops by waiting until an async operation reaches `complete`/`error` or timeout.
- `archi_get_operation_status` accepts both `operationId` and `opId` for compatibility, plus `summaryOnly`, `cursor`, and `pageSize` for compact paged reads.
- `archi_list_operations` supports `cursor` and `summaryOnly`, and returns `hasMore`/`nextCursor` for deterministic paging.
- Operation responses include additive metadata blocks: `digest`, `timeline`, `tempIdMap`, `tempIdMappings`, and `retryHints` (when applicable).
- `archi_list_views` supports name/type/viewpoint filtering plus pagination metadata to reduce context bloat.
- MCP resources `archi://server/defaults` (runtime config) and `archi://agent/quickstart` (recommended workflow) provide agent bootstrapping context.

## Correctness notes

- Async writes: prefer `archi_apply_model_changes` → `archi_wait_for_operation` as the default completion flow.
- Diagnostics/history reads: use `archi_get_operation_status` or `archi_list_operations` with `summaryOnly: true` first, then page full `result` rows only when needed.
- Export format: `archi_export_view` accepts `PNG/JPG/JPEG` and also normalizes lowercase `png/jpg/jpeg`.
- Geometry typing: `x`, `y`, `width`, and `height` must be numeric values (not quoted strings).
- Folder operations: `createFolder` supports `parentId`, `parentType`, or `parentFolder`; same-batch `moveToFolder.folderId` can reference a `createFolder` `tempId`.
- `archi_populate_view` may return `status: "no-op"` with no `operationId` when nothing needs to change.

### Operation response notes

- `digest` summarizes totals by op type, skip reasons, and integrity flags.
- `timeline` captures lifecycle events (`queued`, `processing`, `complete`, `failed`).
- `tempIdMap` and `tempIdMappings` retain deterministic tempId resolution across operation history.
- `retryHints` includes best-effort failed payload fragments to speed targeted retries.
 
## Prompt Templates (Modeling Activities)

The server also exposes reusable MCP prompts for common ArchiMate modeling workflows.
These prompts are guidance templates only; model mutations still happen through explicit tool calls.

- `archi_assess_current_state`: Baseline health, structure, diagnostics, and scoped findings before any changes.
- `archi_general_archimate_modeling`: Run a general-purpose ArchiMate workflow for scoped modeling, refinement, or analysis tasks.
- `archi_design_capability_map`: Design or refine capability maps with strategy traceability and optional heatmap guidance.
- `archi_model_business_application_alignment`: Build service-mediated alignment between business processes and applications.
- `archi_model_application_integration`: Model application integration with simple, service-based, or full-detail patterns.
- `archi_map_technology_deployment`: Map application components to artifacts, runtime platforms, nodes, and network context.
- `archi_plan_gap_analysis_roadmap`: Model baseline-target transitions with plateaus, gaps, work packages, and deliverables.
- `archi_run_model_quality_audit`: Run a read-only quality audit across naming, layering, relationships, and view hygiene.
- `archi_curate_and_export_view`: Validate, layout, route, and export a view for communication.

### Client flow

Use standard prompt calls from MCP clients:

1. `listPrompts`
2. `getPrompt({ name, arguments })`

Example (conceptual):

```ts
const { prompts } = await client.listPrompts();
const { messages } = await client.getPrompt({
  name: 'archi_assess_current_state',
  arguments: {
    scope: 'Customer Domain',
    focus: 'application',
    detailLevel: 'coherence',
  },
});
```

### Safety behavior

Prompt templates enforce read-first and validation-first modeling flow:

- inspect model state before proposing writes,
- treat missing/ambiguous inputs as blocking uncertainty and ask the user before planning,
- use the client question tool (or chat fallback) with 1-4 focused clarification questions,
- never run `archi_plan_model_changes` or mutation tools until uncertainty is resolved or the user explicitly allows assumptions,
- confirm intent before destructive actions,
- preserve ArchiMate semantics and relationship direction,
- avoid overloaded views and maintain naming discipline.

## Regenerate client

When API spec changes:

```bash
npm run codegen
npm run build
```
