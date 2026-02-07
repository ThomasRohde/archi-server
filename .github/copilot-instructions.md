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

## References

- **API Spec**: [openapi.yaml](../openapi.yaml)
- **Dev Guide**: [context/Script Development Guide for Agents.md](../context/Script%20Development%20Guide%20for%20Agents.md)
- **CLAUDE.md**: Additional runtime details and examples
