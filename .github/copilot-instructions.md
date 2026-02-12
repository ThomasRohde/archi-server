# ArchiMate Model API Server - AI Agent Instructions

## Critical Context

**This runs GraalVM JavaScript inside Archi's JVM, NOT Node.js.** No npm, no require(), no Node APIs.

- Use `load(__DIR__ + "path/file.js")` to load modules (not require)
- `__DIR__` includes trailing slash: `load(__DIR__ + "lib/core/serverCore.js")`
- Module loading order matters—dependencies first (see [Model API Server.ajs](../scripts/Model%20API%20Server.ajs#L73-L83))
- Java classes via `Java.type("full.class.Name")`
- Available globals: `$` (jArchi), `$.model`, `shell` (SWT), `console`, `window`

## Architecture & Threading

**All model operations MUST run on SWT Display thread:**

```
HTTP Request → Java thread pool → Display.asyncExec/timerExec → SWT thread → undoableCommands
```

- **Sync endpoints** ([modelEndpoints.js](../scripts/lib/server/endpoints/modelEndpoints.js)): Use `Display.asyncExec()` with blocking wait (e.g., `/model/query`)
- **Async endpoints**: Return operation ID immediately, queue via [operationQueue.js](../scripts/lib/server/operationQueue.js) using `Display.timerExec()` (e.g., `/model/apply`)
- **undoableCommands.js**: All model mutations go through this for undo/redo support (Ctrl+Z)

Operations are batched and processed ~50ms intervals ([serverConfig.js](../scripts/lib/server/serverConfig.js#L52)).

## Project Structure

```
scripts/
├── Model API Server.ajs           # Entry point - load order defined here
└── lib/
    ├── core/                       # Infrastructure (load first)
    │   ├── serverCore.js           # HTTP server wrapper (rate limiting, CORS)
    │   ├── undoableCommands.js     # Undo/redo integration (2000 lines)
    │   ├── requireModel.js         # Model validation
    │   └── swtImports.js           # Java type imports
    ├── server/                     # Business logic
    │   ├── serverConfig.js         # ALL configuration (load before other server modules)
    │   ├── operationQueue.js       # Async operation processor
    │   ├── modelSnapshot.js        # Read-only model serialization
    │   ├── loggingQueue.js         # Thread-safe logging
    │   └── endpoints/              # API handlers (modular)
    └── vendor/
        └── dagre.min.js            # Layout engine
```

## Java Interop Patterns

### Java.super Issue (CRITICAL)

`Java.super(this)` doesn't work—use wrapper pattern:

```javascript
const ExtendedDialog = Java.extend(TitleAreaDialog);
const dialogWrapper = {
    dialog: new ExtendedDialog(shell, {
        configureShell: function(newShell) {
            Java.super(dialogWrapper.dialog).configureShell(newShell); // Reference wrapper
            newShell.setText("Title");
        }
    })
};
```

See [undoableCommands.js](../scripts/lib/core/undoableCommands.js#L1800-L1820) for examples.

### Implementing Interfaces

```javascript
const Runnable = Java.type("java.lang.Runnable");
const task = new (Java.extend(Runnable, {
    run: function() { /* implementation */ }
}))();
display.asyncExec(task);
```

## Configuration

**All settings in [serverConfig.js](../scripts/lib/server/serverConfig.js):**
- Port/host binding (default: 127.0.0.1:8765)
- Rate limits (200 req/min)
- Request body limits (1MB)
- Operation timeouts (60s)
- CORS origins (no wildcard)

Load serverConfig.js BEFORE other server modules.

## Common Patterns

### Adding Endpoints

1. Create handler in `lib/server/endpoints/` (e.g., [modelEndpoints.js](../scripts/lib/server/endpoints/modelEndpoints.js))
2. Export via [apiEndpoints.js](../scripts/lib/server/apiEndpoints.js)
3. Register in [Model API Server.ajs](../scripts/Model%20API%20Server.ajs) routing logic

### Async Operations

Queue via operationQueue ([example](../scripts/lib/server/endpoints/modelEndpoints.js#L400-L420)):

```javascript
const opDesc = operationQueue.createOperation(changes);
operationQueue.enqueue(opDesc);
res.body = { operationId: opDesc.id };
```

Client polls `/ops/status?opId=...` for completion.

### Undoable Commands

All mutations use [undoableCommands.js](../scripts/lib/core/undoableCommands.js):

```javascript
undoableCommands.createElement(model, {
    type: "business-actor",
    name: "Actor",
    properties: { key: "value" }
});
```

Batch operations for single undo:

```javascript
undoableCommands.executeBatch(model, "Batch Label", [
    { op: "createElement", type: "business-actor", name: "Alice" },
    { op: "createRelationship", type: "serving-relationship", sourceId: "...", targetId: "..." }
]);
```

## Testing

1. Open Archi 5.7+ with jArchi 1.11+
2. Open model + **open at least one view** (required for undo support)
3. Run from Scripts menu
4. Test: `curl http://localhost:8765/health`

## ArchiMate Modeling via API

This project includes AI agent skills (in `.claude/skills/`) that enable automated ArchiMate modeling through the API. These skills work with any AI agent that can run terminal commands.

### Quick API Modeling Workflow

```
1. curl -s http://localhost:8765/health                              # Verify server
2. curl -s -X POST http://localhost:8765/model/search ...            # Search existing
3. curl -s -X POST http://localhost:8765/model/apply ...             # Create elements + relationships
4. curl -s "http://localhost:8765/ops/status?opId=OP_ID"             # Poll for IDs
5. curl -s -X POST http://localhost:8765/views ...                   # Create view
6. curl -s -X POST http://localhost:8765/model/apply ...             # Add to view
7. curl -s "http://localhost:8765/ops/status?opId=OP_ID"             # Poll for visual IDs
8. curl -s -X POST http://localhost:8765/model/apply ...             # Add connections
9. curl -s -X POST http://localhost:8765/views/VIEW_ID/layout ...    # Auto-layout
10. curl -s -X POST http://localhost:8765/model/save                 # Save
```

### Key API Rules
- `/model/apply` is **async** — always poll `/ops/status?opId=...` for results
- Use `tempId` to track created elements; results map `tempId → realId`
- Within one batch, `createRelationship` can reference `tempId` from `createElement`
- `addConnectionToView` needs **visual object IDs** (from `addToView`), not concept IDs
- Connections are NOT auto-created when adding elements to a view
- For compound/nested elements, use `parentVisualId` on `addToView` to nest children inside a parent visual object, or use `nestInView` to reparent after placement
- **Keep batches ≤20 operations** when creating relationships to avoid silent GEF rollback. The server internally chunks large CompoundCommands and verifies persistence, but smaller batches are safer.
- Use `GET /model/diagnostics` to detect orphan/ghost objects after suspected rollbacks

### Available Skills (`.claude/skills/`)

Skills follow the [Agent Skills](https://agentskills.io) open standard and are auto-discovered by both Claude Code and GitHub Copilot.

- **archi-server-api** — Central API execution reference with CURL templates and workflows
- **archimate-modeling** — Element selection with API type mapping
- **archimate-relationships** — Relationship creation with direction conventions
- **archimate-patterns** — Executable pattern templates (microservices, CQRS, etc.)
- **archimate-quality** — Automated audit queries and fixes

### Claude Code Commands (`.claude/commands/`)
- **/element** — Select and create an ArchiMate element
- **/pattern** — Instantiate an architecture pattern with view
- **/view** — Create a view from existing or new elements
- **/audit** — Model quality audit with optional fixes

### Copilot Prompt Files (`.github/prompts/`)
- **/element** — Select and create an ArchiMate element
- **/pattern** — Instantiate an architecture pattern with view
- **/view** — Create a view from existing or new elements
- **/audit** — Model quality audit with optional fixes

### Claude Code Agent (`.claude/agents/`)
- **archimate-modeler** — Full modeling agent: analyze descriptions → create elements → build views

### Copilot Agent (`.github/agents/`)
- **@archimate-modeler** — Full modeling agent: analyze descriptions → create elements → build views

## archicli — TypeScript CLI (`archicli/`)

**`archicli/` IS a Node.js project** (unlike `scripts/` which is GraalVM). Use it instead of raw CURL for automation:

```bash
cd archicli && npm install && npm run build
archicli health                                    # verify server
archicli verify model/index.json                   # validate BOM schema
archicli batch apply model/index.json              # apply atomically (chunk-size 1, poll, validate)
archicli batch apply model/index.json --fast       # fast mode: chunk-size 20, no validation
```

### OpenAPI Source of Truth

- Use the root spec at `openapi.yaml` as the **only** OpenAPI source of truth.
- Do **not** create or update duplicate OpenAPI files in sub-packages.
- After any OpenAPI change, regenerate clients in both packages:
    - `cd archi-mcp && npm run codegen && npm run build`
    - `cd archicli && npm run codegen && npm run build`

### BOM File Format

```json
{
  "version": "1.0",
  "idFiles": ["01-elements.ids.json"],   // pre-load tempId→realId maps from previous runs
  "includes": ["parts/elements.json"],   // compose from sub-files
  "changes": [
    { "op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "e-customer" },
    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "e-svc", "targetId": "e-customer" },
    { "op": "addToView", "viewId": "v-main", "elementId": "e-customer", "tempId": "vis-cust" },
    { "op": "addToView", "viewId": "v-main", "elementId": "e-child", "tempId": "vis-child", "parentVisualId": "vis-cust" },
    { "op": "addConnectionToView", "viewId": "v-main", "relationshipId": "r1", "sourceVisualId": "vis-svc", "targetVisualId": "vis-cust" },
    { "op": "nestInView", "viewId": "v-main", "visualId": "vis-existing", "parentVisualId": "vis-cust", "x": 10, "y": 30 }
  ]
}
```

### Critical Rules

1. **Correctness-first defaults** — chunk-size 1, polling, and connection validation are ON by default
2. **tempIds resolve automatically**: within a batch, across chunks, and across files (via `idFiles`)
3. **Auto-saves `<file>.ids.json`** after apply — reference in `idFiles` of subsequent BOMs
4. **Verify first**: `archicli verify <file>` catches authoring errors before touching the model
5. **Example BOMs**: see `model/` directory for working examples
6. **Use `--fast`** for bulk creates where speed matters (e.g., 200 elements). Defaults back to chunk-size 20.
7. **Auto-retries on rate limits** (HTTP 429) with exponential backoff — no manual intervention needed.

### CLI Commands Reference

| Command | Purpose |
|---------|---------|
| `archicli health` | Check server connectivity |
| `archicli verify <file>` | Validate BOM/request JSON |
| `archicli batch apply <bom>` | Apply BOM (atomic, polls, validates) |
| `archicli batch apply <bom> --fast` | Apply BOM (chunk-size 20, fast) |
| `archicli batch split <bom>` | Split large BOM into linked files |
| `archicli model search` | Search elements by type/name/property |
| `archicli model query` | Model summary with counts |
| `archicli model element <id>` | Get element with relationships + views |
| `archicli ops status <id> --poll` | Poll async operation to completion |

## References

- **API Spec**: [openapi.yaml](../openapi.yaml)
- **Dev Guide**: [context/Script Development Guide for Agents.md](../context/Script%20Development%20Guide%20for%20Agents.md)
- **CLAUDE.md**: Additional runtime details and examples
- **archicli source**: [archicli/](../archicli/)
