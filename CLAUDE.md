# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ArchiMate Model API Server** - A production-ready HTTP REST API server that runs inside Archi (an ArchiMate modeling tool) via the jArchi plugin. This exposes ArchiMate models for automation, integration, and programmatic access.

**Critical: The server-side scripts are NOT Node.js.** Scripts in `scripts/` run in GraalVM JavaScript inside the Archi JVM with Java interop. There is no npm, no package.json, and no Node.js modules in `scripts/`.

**Exception: `archicli/` IS a Node.js project** — a TypeScript CLI for the API (see [archicli/](archicli/) and the CLI section below).

## Running the Server

To test/run the server:

1. Open Archi (5.7+) with jArchi plugin (1.11+) installed
2. Open an ArchiMate model
3. **Open at least one view from the model** (required for undo/redo support via command stack)
4. Run the script from Archi's Scripts menu: `Model API Server`
5. The monitor dialog will open and server starts on `http://localhost:8765`

Test with: `curl http://localhost:8765/health`

## Development Environment

### JavaScript Runtime: GraalVM NOT Node.js

**Key differences from Node.js:**
- Use `load(__DIR__ + "path/file.js")` NOT `require()`
- `__DIR__` includes trailing path separator
- No npm packages or node_modules
- Java classes accessible via `Java.type("full.class.Name")`
- Java class extension via `Java.extend(JavaClass)`

### Available Globals

- `$` - jArchi collection constructor for working with ArchiMate elements
- `$.model` or `model` - Currently open ArchiMate model
- `shell` - Eclipse SWT Shell (parent window)
- `__DIR__` - Script directory with trailing slash
- `__FILE__` - Full script path
- `console` - Logging (show with `console.show()`)
- `window` - Dialog utilities

### Module Loading Pattern

Files are loaded via `load()` and expose exports to global scope:

```javascript
load(__DIR__ + "lib/core/swtImports.js");  // Exposes swtImports global
const { SWT, GridDataFactory } = swtImports;
```

**Module loading order matters** - dependencies must be loaded first.

## Architecture Overview

### Entry Point

- `scripts/Model API Server.ajs` - Main server script, loads all dependencies and starts HTTP server

### Core Infrastructure (`scripts/lib/core/`)

- **serverCore.js** - HTTP server wrapper around `com.sun.net.httpserver.HttpServer` with rate limiting, security headers, CORS, request/response handling
- **undoableCommands.js** - Wraps model operations in SWT Command pattern for undo/redo support (Ctrl+Z)
- **requireModel.js** - Model selection/validation utility
- **swtImports.js** - Centralized Java type imports for SWT/JFace classes

### Server Modules (`scripts/lib/server/`)

- **serverConfig.js** - Centralized configuration (port, rate limits, timeouts, CORS, etc.)
- **operationQueue.js** - Async operation queue with `Display.timerExec` processor, timeout handling, status tracking
- **modelSnapshot.js** - Efficient read-only model serialization for query endpoints
- **operationValidation.js** - ArchiMate type validation for operations
- **folderCache.js** - Cached folder lookups for performance
- **loggingQueue.js** - Thread-safe logging queue with batch flush to UI
- **monitorUI.js** - SWT dialog for server monitoring and logs
- **layoutDagreHeadless.js** - Dagre graph layout for automatic view arrangement
- **apiEndpoints.js** - Facade that loads and exports all endpoint modules

### Endpoint Modules (`scripts/lib/server/endpoints/`)

Each endpoint module handles specific API routes:
- **healthEndpoints.js** - `/health`, `/test`, `/shutdown`
- **modelEndpoints.js** - `/model/query`, `/model/plan`, `/model/apply`, `/model/search`, `/model/save`, `/model/element/{id}`
- **viewEndpoints.js** - `/views/*` endpoints (list, get, create, delete, export, layout, etc.)
- **operationEndpoints.js** - `/ops/status` for async operation polling
- **scriptEndpoints.js** - `/scripts/run` for executing jArchi code via API

## Critical Threading Architecture

**All model operations MUST run on the SWT Display thread.** The server uses this pattern:

```
External HTTP Client → Java HttpServer (thread pool)
                          ↓
                    Display.asyncExec/timerExec
                          ↓
                    SWT Display Thread
                          ↓
                Model Operations (via undoableCommands)
```

- **Synchronous endpoints** (e.g., `/model/query`) use `Display.asyncExec()` with blocking wait
- **Asynchronous endpoints** (e.g., `/model/apply`) return operation ID immediately, processing happens via `operationQueue` using `Display.timerExec()`
- **operationQueue** batches operations and processes them on Display thread at ~50ms intervals

## Java Interop Patterns

### Calling Superclass Methods

**CRITICAL:** `Java.super(this)` does NOT work in GraalVM. Use this pattern:

```javascript
const ExtendedDialog = Java.extend(TitleAreaDialog);
const dialogWrapper = {
    dialog: new ExtendedDialog(shell, {
        configureShell: function(newShell) {
            // Reference the outer wrapper to access dialog
            Java.super(dialogWrapper.dialog).configureShell(newShell);
            newShell.setText("My Title");
        }
    })
};
```

### Implementing Java Interfaces

```javascript
const Runnable = Java.type("java.lang.Runnable");
const task = Java.extend(Runnable, {
    run: function() {
        // Implementation
    }
});
display.asyncExec(new task());
```

## Configuration

All server configuration in `scripts/lib/server/serverConfig.js`:
- Port, host binding (default: 127.0.0.1:8765)
- Rate limiting (200 req/min by default)
- Request body size limits (1MB)
- Operation timeouts (60s)
- CORS origins
- Security headers

## archicli — TypeScript CLI

A standalone CLI for the API in `archicli/` (Node.js/TypeScript, Commander.js):

```bash
cd archicli && npm install && npm run build
# or: npm link → archicli globally
archicli health                              # verify server
archicli verify model/index.json            # validate BOM before apply
archicli batch apply model/index.json        # apply atomically (chunk-size 1, poll, validate)
archicli batch apply model/index.json --fast # fast mode: chunk-size 20, no validation
```

### BOM File Format (`model/` directory contains examples)

```json
{
  "version": "1.0",
  "description": "...",
  "idFiles": ["01-elements.ids.json"],       // pre-load tempId→realId maps
  "includes": ["parts/elements.json"],       // compose from sub-files
  "changes": [
    { "op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "e-customer" },
    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "e-service", "targetId": "e-customer", "tempId": "r1" },
    { "op": "addToView", "viewId": "v-main", "elementId": "e-customer", "tempId": "vis-customer" },
    { "op": "addToView", "viewId": "v-main", "elementId": "e-child", "tempId": "vis-child", "parentVisualId": "vis-customer" },
    { "op": "addConnectionToView", "viewId": "v-main", "relationshipId": "r1", "sourceVisualId": "vis-service", "targetVisualId": "vis-customer" },
    { "op": "nestInView", "viewId": "v-main", "visualId": "vis-existing", "parentVisualId": "vis-customer", "x": 10, "y": 30 }
  ]
}
```

### Critical CLI Rules

1. **Correctness-first defaults** — chunk-size 1, polling, and connection validation are ON by default
2. **tempIds are resolved automatically**: within a batch, across chunks, and across files (via `idFiles`)
3. **`batch apply` auto-saves `<file>.ids.json`** after completion — use in subsequent BOM files' `idFiles` array
4. **Use `--fast`** for bulk creates where speed matters. Defaults to chunk-size 20, no validation.
5. **Auto-retries on HTTP 429** with exponential backoff — atomic mode handles rate limits automatically
6. **`archicli verify`** validates JSON against schema before sending — run first to catch authoring errors

### Key Commands

| Command | Purpose |
|---------|---------|
| `archicli health` | Check server connectivity |
| `archicli verify <file>` | Validate BOM/request JSON |
| `archicli batch apply <bom>` | Apply BOM (atomic, polls, validates) |
| `archicli batch apply <bom> --fast` | Apply BOM (chunk-size 20, fast) |
| `archicli batch split <bom>` | Split large BOM into linked files |
| `archicli model search` | Search elements by type/name |
| `archicli model query` | Model summary |
| `archicli ops status <id> --poll` | Poll async operation |

## API Specification

Full OpenAPI 3.0 spec in `openapi.yaml` - use this as the definitive API reference.

## Common Patterns

### Adding a New Endpoint

1. Add handler to appropriate endpoint module in `scripts/lib/server/endpoints/`
2. Export handler from that module
3. Wire up in `apiEndpoints.js` facade
4. Add route in `Model API Server.ajs` using `addHandler()` or extend router functions
5. Update `openapi.yaml` with new endpoint spec

### Async vs Sync Endpoints

- **Use sync** (Display.asyncExec with CountDownLatch) for: queries, reads, quick operations
- **Use async** (operationQueue) for: mutations, long-running operations, batched changes

### Module Pattern

```javascript
(function() {
    "use strict";

    // Guard against double-loading
    if (typeof globalThis !== "undefined" && typeof globalThis.myModule !== "undefined") {
        return;
    }

    var myModule = {
        // Public API
    };

    // Expose to global
    if (typeof globalThis !== "undefined") {
        globalThis.myModule = myModule;
    }
})();
```

## Important jArchi Constraints

1. **No async/await** - GraalVM JavaScript is ES5-ish, use callbacks/CountDownLatch patterns
2. **Use string concatenation** - Not template literals: `"Error: " + msg` not `` `Error: ${msg}` ``
3. **Single argument to console methods** - `console.error("Error: " + err)` not `console.error("Error:", err)`
4. **Element names can be null/empty** - Always check: `element.name && element.name.trim() ? element.name : "-- unnamed --"`
5. **Dispose SWT resources** - Colors, fonts, images must be explicitly disposed in finally blocks
6. **No require()** - Use `load(__DIR__ + "path")`

## Testing

No automated test suite. Testing workflow:
1. Make changes to JavaScript files
2. In Archi, go to Scripts menu → Refresh Scripts (or restart Archi)
3. Run `Model API Server` script
4. Test endpoints with curl/Postman
5. Check console output in Archi (Window → Console)
6. Use Chrome DevTools for debugging (see `context/graalJS-compatibility.md`)

## Documentation Resources

Key docs in `context/` folder:
- **Script Development Guide for Agents.md** - Comprehensive jArchi/GraalVM guide
- **jarchi-1.11-api-reference.md** - jArchi API reference
- **graalJS-compatibility.md** - GraalVM JavaScript compatibility notes
- **java-interop.md** - Java interoperability patterns
- **All-Objects.md** - ArchiMate element types
- **Allowed relationships.md** - Valid ArchiMate relationship types

## Security Notes

- **No authentication** - Server binds to localhost only (127.0.0.1)
- Not designed for network exposure
- For local development/automation workflows only
- Built-in protections: rate limiting, request size limits, operation timeouts, CORS controls
