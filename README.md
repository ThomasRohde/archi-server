# ArchiMate Model API Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Archi](https://img.shields.io/badge/Archi-5.7%2B-blue)](https://www.archimatetool.com/)
[![jArchi](https://img.shields.io/badge/jArchi-1.11%2B-blue)](https://www.archimatetool.com/plugins/)
[![Version](https://img.shields.io/badge/version-1.1.0-green.svg)](https://github.com/ThomasRohde/archi-server/releases)

> A production-ready HTTP REST API server that runs inside Archi, exposing your ArchiMate models for automation, integration, and programmatic access.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Usage](#usage)
- [CLI (archicli)](#cli-archicli)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Security](#security)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [AI Agent Skills](#ai-agent-skills)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Features

- 🖥️ **CLI (archicli)** - TypeScript command-line tool for scripted and agent-driven workflows
- 🔄 **Model Automation** - Create, query, and modify elements programmatically
- 🔌 **External Integration** - Connect with Python, Node.js, or any HTTP client
- 📊 **View Generation** - Dynamically create and layout ArchiMate views
- 🎯 **API-First Design** - RESTful endpoints with JSON responses
- ✅ **Full Undo Support** - All operations are fully undoable (Ctrl+Z)
- 🔒 **Production Hardened** - Rate limiting, validation, and timeout protection
- 🚀 **Zero Dependencies** - Pure JArchi implementation with GraalVM JS
- 🤖 **AI Agent Skills** - Built-in skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [GitHub Copilot](https://code.visualstudio.com/docs/copilot) following the [Agent Skills](https://agentskills.io) standard

## Installation

### Prerequisites

- [Archi](https://www.archimatetool.com/) 5.7 or later
- [jArchi](https://www.archimatetool.com/plugins/) plugin 1.11 or later

### Quick Install

Clone this repository into your Archi scripts directory:

```bash
# Windows
git clone https://github.com/ThomasRohde/archi-server.git "%USERPROFILE%\Documents\Archi\scripts\archi-server"

# macOS/Linux
git clone https://github.com/ThomasRohde/archi-server.git ~/Documents/Archi/scripts/archi-server
```

Or download and extract the [latest release](https://github.com/ThomasRohde/archi-server/releases) to your Archi scripts folder.

## CLI (archicli)

`archicli` is a TypeScript CLI in the `archicli/` directory that provides a structured interface to the API server — designed for scripted workflows, AI agents, and CI/CD pipelines.

### Install

```bash
cd archicli
npm install
npm run build
npm link          # makes `archicli` available globally
```

### Quick start

```bash
archicli health                                  # verify server is running
archicli model query --show-relationships        # inspect model + relationship sample
archicli model search --type application-component
archicli model search --type application-component --strict-types
archicli model search --name ".*Service.*" --no-relationships
archicli verify changes.json                     # validate a BOM file
archicli verify changes.json --semantic          # semantic tempId checks
archicli batch apply changes.json                # apply atomically with polling + validation
archicli batch apply changes.json --fast          # fast mode: chunk-size 20
archicli batch apply changes.json --skip-existing
archicli view create "Application Overview" --viewpoint application_cooperation
archicli view delete id-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
archicli ops list                                # list recent operation IDs
```

### First-run onboarding

Use these commands when starting from an empty directory/model:

```bash
archicli init ./starter-bom
cd starter-bom
archicli doctor
archicli verify 01-elements.json --semantic
archicli batch apply 01-elements.json
archicli verify 02-view.json --semantic
archicli batch apply 02-view.json --layout
archicli view export --all --dir exports
```

### Bill of Materials (BOM) files

Changes are described in JSON BOM files. The `batch apply` command handles validation, chunking (default chunk-size 1 for atomic safety), polling, connection cross-validation, and tempId→realId persistence automatically. Use `--fast` for larger chunk sizes when speed matters.

Validation is strict: unknown top-level and operation fields are rejected. For `archicli verify` auto-detection, BOM files should include `version: "1.0"` and either a `changes` array or an `includes` array.

Numeric CLI options are also strict: invalid integers/floats are rejected (no silent coercion).
Examples: `--limit 1.5`, `--chunk-size -1`, `--margin abc`.

Use `archicli verify --semantic` for tempId preflight checks, and add `--resolve-names` to mirror `batch apply --resolve-names` behavior against a running server.
`--resolve-names` is concept-name lookup only; it cannot reconstruct visual IDs (`sourceVisualId`, `targetVisualId`).
By default, `verify --semantic` and `batch apply` fail when declared `idFiles` are missing/malformed; use
`--allow-incomplete-idfiles` only when you intentionally want best-effort behavior.

Example:

```json
{
  "version": "1.0",
  "description": "Create application layer",
  "includes": ["parts/elements.json"],
  "idFiles": ["previous.ids.json"],
  "changes": [
    { "op": "createElement", "type": "application-component", "name": "My Server", "tempId": "my-server" },
    { "op": "setProperty", "id": "my-server", "key": "status", "value": "active" },
    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "my-server", "targetId": "other-element" },
    { "op": "createView", "name": "Application Overview", "tempId": "app-view", "viewpoint": "application_cooperation" }
  ]
}
```

After apply completes, `changes.ids.json` is written containing all tempId→realId mappings for use in subsequent BOM files.
You can choose a custom output path with `--save-ids <path>`, for example:

```bash
archicli batch apply changes.json --save-ids out/my-mappings.ids.json
```

To skip polling and ID tracking, use `--no-poll` (not recommended for most workflows).

For idempotent re-runs, use `--skip-existing` to skip duplicate create operations and continue processing the rest of the BOM.

### Key concepts

| Concept | Description |
|---------|-------------|
| **tempId** | Friendly name assigned at authoring time (e.g. `"my-server"`). Resolved to a real Archi ID at runtime. Later ops in the same batch can reference earlier tempIds. |
| **Async mutations** | `/model/apply` is async — archicli polls automatically (use `--no-poll` to skip). |
| **Views vs elements** | Elements exist in the model tree independently. Views are diagrams; use `addToView` + `addConnectionToView` to populate them. |
| **Visual IDs** | `addToView` returns a `visualId` (diagram object) distinct from the element `conceptId`. `addConnectionToView` needs visual IDs. |
| **Nesting** | For compound elements (parent containing children), use `parentVisualId` on `addToView` to nest children inside a parent visual, or `nestInView` to reparent after placement. |

### All commands

```
archicli health                       Check server connectivity and model stats
archicli doctor                       Run preflight diagnostics (server/model/view readiness)
archicli init [dir]                   Bootstrap starter BOM templates in a target directory
archicli verify <file>                Validate BOM JSON before sending
archicli model query                  Model overview: counts + sample elements (optional relationship sample)
archicli model apply <file>           Submit a single apply payload (optionally poll)
archicli model search [options]       Search by type, name, or property (--strict-types available)
archicli model element <id>           Full detail for one element
archicli model save [--path <file>]   Save the current model to disk
archicli model stats                  Get model statistics by type
archicli batch apply <file>           Apply BOM atomically (chunk-size 1, polls, validates connections)
archicli batch apply <file> --fast    Apply BOM in fast mode (chunk-size 20, no validation)
archicli batch split <file>           Split large BOM into linked chunk files (--chunk-size)
archicli view list                    List all views
archicli view get <id>                View detail with visual object IDs
archicli view create <name> [options] Create view synchronously (invalid --viewpoint values are rejected)
archicli view export <id>             Export view as PNG/JPEG (--file or --output-file)
archicli view layout <id>             Auto-layout a view
archicli view delete <id>             Delete a view
archicli ops list                     List recent async operations
archicli ops status <opId> --poll     Poll async operation to completion
archicli folder list                  List model folders
archicli ids lookup <tempId>          Resolve tempId values from .ids.json files
archicli completion <shell>           Generate completion script (bash|zsh|fish|pwsh)
```

Use `archicli view create --help` for the full valid viewpoint list and examples.

### Shell completions

```bash
# Bash
archicli completion bash --raw > ~/.local/share/bash-completion/completions/archicli

# Zsh
archicli completion zsh --raw > ~/.zfunc/_archicli

# Fish
archicli completion fish --raw > ~/.config/fish/completions/archicli.fish

# PowerShell
archicli completion pwsh --raw > archicli-completion.ps1
```

Completion scripts include `model search --type` ArchiMate type value suggestions.

In `--output json` mode, command/usage errors (unknown command/flag, missing args, invalid global options) are emitted as JSON envelopes.
`--output yaml` is also supported. `--quiet` / `-q` prints data-only success payloads (no `{ success, data, metadata }` envelope).

Representative `--output json --quiet` shapes:

- `archicli health` -> `{ "status": "ok" }`
- `archicli batch apply <file>` -> `{ "operationIds": ["op_..."] }`
- `archicli ops status <opId>` -> `{ "operationId": "op_...", "status": "complete" }`

## Project Structure

The server is organized as follows:

```
archi-server/
├── scripts/
│   ├── Model API Server.ajs      # Main entry point
│   └── lib/
│       ├── core/                  # Core infrastructure
│       │   ├── requireModel.js
│       │   ├── serverCore.js
│       │   ├── swtImports.js
│       │   └── undoableCommands.js
│       ├── server/                # Server modules
│       │   ├── apiEndpoints.js
│       │   ├── folderCache.js
│       │   ├── layoutDagreHeadless.js
│       │   ├── loggingQueue.js
│       │   ├── modelSnapshot.js
│       │   ├── monitorUI.js
│       │   ├── operationQueue.js
│       │   ├── operationValidation.js
│       │   ├── serverConfig.js
│       │   └── endpoints/
│       │       ├── healthEndpoints.js
│       │       ├── modelEndpoints.js
│       │       ├── operationEndpoints.js
│       │       ├── scriptEndpoints.js
│       │       └── viewEndpoints.js
│       └── vendor/
│           └── dagre.min.js       # Layout engine
├── archicli/                      # TypeScript CLI (Node.js, npm install)
│   ├── src/
│   │   ├── cli.ts                 # Entry point
│   │   ├── index.ts               # Program factory
│   │   ├── commands/              # health, verify, batch, model, view, ops
│   │   ├── schemas/               # BOM JSON schema + validator
│   │   └── utils/                 # api, config, output, poll helpers
│   ├── package.json
│   └── tsconfig.json
├── openapi.yaml                   # API specification
└── README.md
```

## Usage

### Starting the Server

1. **Open Archi** with an ArchiMate model
2. **Open at least one view** from your model (required for undo support)
3. Navigate to **Scripts menu** → **Model API Server**

4. A **monitor dialog** appears showing server status and real-time logs
5. The API is now available at `http://localhost:8765`

### Quick Start

Verify the server is running:

```bash
# Using the CLI (recommended for scripting and agents)
archicli health
archicli model query
archicli model search --type application-component

# Or using curl directly
curl http://localhost:8765/health
curl -X POST http://localhost:8765/model/query \
  -H "Content-Type: application/json" \
  -d '{}'
curl http://localhost:8765/views
```

## API Reference

The server exposes a comprehensive REST API:

### Core Operations
- `GET /health` - Server health and diagnostics
- `POST /model/query` - Query model elements/relationships
- `POST /model/apply` - Modify model (create, update, delete)
- `POST /model/search` - Search by name, type, or properties (`includeRelationships` supported)

### View Management
- `GET /views` - List all views
- `POST /views` - Create new view
- `GET /views/{id}` - Get view details with all elements
- `DELETE /views/{id}` - Delete view
- `POST /views/{id}/layout` - Apply Dagre layout
- `POST /views/{id}/export` - Export as PNG/JPEG

### Script Execution
- `POST /scripts/run` - Execute custom JArchi code

### Administration
- `GET /ops/status?opId=...` - Check operation status
- `GET /ops/list` - List recent operations
- `POST /model/save` - Save model to disk
- `POST /shutdown` - Gracefully stop server

Full API documentation available in [openapi.yaml](openapi.yaml).

## Configuration

Customize server behavior by editing [scripts/lib/server/serverConfig.js](scripts/lib/server/serverConfig.js):

```javascript
{
    port: 8765,                       // Server port
    host: "127.0.0.1",                // Localhost only (security)
    rateLimitRpm: 200,                // Requests per minute per IP
    maxBodySizeBytes: 1048576,        // 1MB max request size
    operationTimeoutMs: 60000,        // 60s operation timeout
    corsOrigins: ["http://localhost:3000"],  // CORS allowlist
    enableDetailedErrors: true        // Include stack traces in errors
}
```

## Security

⚠️ **No Authentication** - This server has no built-in authentication mechanism

✅ **Localhost Only** - Binds to `127.0.0.1` by default (not accessible from network)

🔒 **Local Development** - Designed for local automation and development workflows

**Built-in Protection:**
- Rate limiting (200 requests/minute)
- Request size limits (1MB maximum)
- Operation timeouts (60 seconds)
- Input validation and type checking
- CORS origin controls

**For Production Use:** Add authentication middleware or run behind a reverse proxy with auth.

## Examples

### Automated Model Updates

Update element properties from external data sources:

```javascript
await fetch('http://localhost:8765/model/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        changes: [{
            op: 'updateElement',
            id: 'element-id',
            properties: { 'Status': 'Active', 'Owner': 'IT Team' }
        }]
    })
});
```

### Generate Views Programmatically

Create a new view with elements:

```javascript
const response = await fetch('http://localhost:8765/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        name: 'Generated Infrastructure View',
        type: 'archimate-diagram-model',
        folderId: 'folder-id'
    })
});
```

### Search and Query

Find elements by type and properties:

```javascript
const response = await fetch('http://localhost:8765/model/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        type: 'capability',
        properties: { 'Domain': 'Finance' }
    })
});
const capabilities = await response.json();
```

### Python Client

```python
import requests

BASE_URL = "http://localhost:8765"

# Health check
health = requests.get(f"{BASE_URL}/health").json()
print(f"Server status: {health['status']}")

# Query all capabilities
response = requests.post(
    f"{BASE_URL}/model/query",
    json={"query": "elements", "type": "capability"}
)
capabilities = response.json()['result']

for cap in capabilities:
    print(f"- {cap['name']} ({cap['id']})")
```

### Node.js Client

```javascript
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8765';

async function queryModel() {
    const response = await fetch(`${BASE_URL}/model/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: 'elements',
            type: 'application-component'
        })
    });
    
    const data = await response.json();
    console.log(`Found ${data.result.length} application components`);
    return data.result;
}

queryModel();
```


## Troubleshooting

### Server Won't Start

| Problem | Solution |
|---------|----------|
| "No model is open" | Open an ArchiMate model in Archi first |
| "No view is open" | Open at least one view (required for undo support) |
| "Port 8765 already in use" | Stop other server or change port in `serverConfig.js` |
| Script not in menu | Restart Archi or use Scripts → Refresh Scripts |

### API Errors

| Error Code | Cause | Solution |
|------------|-------|----------|
| 429 | Rate limit exceeded | Add delays between requests (max 200/min) |
| 413 | Request too large | Split operation or increase `maxBodySizeBytes` |
| 504 | Operation timeout | Optimize query or increase `operationTimeoutMs` |
| 400 | Invalid input | Check request format against API specification |

### Module Errors

**Problem:** "Cannot find lib/..." errors  
**Solution:** Verify all files are in correct relative paths. The `lib/` folder must be at `scripts/lib/`.

## AI Agent Skills

This project includes portable AI agent skills that enable automated ArchiMate modeling through the API. Skills follow the open [Agent Skills](https://agentskills.io) standard and work with both **Claude Code** and **GitHub Copilot**.

### Install from this repository

Install skills from `.agent/skills/` (including `archimate-modeling`) with:

```bash
npx skills add ThomasRohde/archi-server
```

## Development

### Architecture

- **Server Core** (`serverCore.js`) - HTTP server and routing
- **Operation Queue** (`operationQueue.js`) - Thread-safe operation execution
- **Undo Support** (`undoableCommands.js`) - SWT command wrapping
- **Model Snapshot** (`modelSnapshot.js`) - Efficient model serialization
- **API Endpoints** (`endpoints/*.js`) - Modular endpoint handlers

See [context/](context/) folder for detailed technical documentation.

### Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

Quick start:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Documentation

- **API Specification:** [openapi.yaml](openapi.yaml)
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **Contributing Guide:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Script Development Guide:** [context/Script Development Guide for Agents.md](context/Script%20Development%20Guide%20for%20Agents.md)
- **jArchi API Reference:** [context/jarchi-1.11-api-reference.md](context/jarchi-1.11-api-reference.md)
- **GraalJS Compatibility:** [context/graalJS-compatibility.md](context/graalJS-compatibility.md)
- **Agent Skills Standard:** [agentskills.io](https://agentskills.io)

## License

MIT License - See [LICENSE](LICENSE) for details.

## Support

- **Issues:** [GitHub Issues](https://github.com/ThomasRohde/archi-server/issues)
- **Discussions:** [Archi Forum](https://forum.archimatetool.com/)
- **jArchi Plugin:** [Official Documentation](https://www.archimatetool.com/plugins/)

## Acknowledgments

- Built for [Archi](https://www.archimatetool.com/) - Open Source ArchiMate Modelling Tool
- Powered by [jArchi](https://www.archimatetool.com/plugins/) scripting plugin
- Layout engine: [Dagre](https://github.com/dagrejs/dagre)

---

**Made with ❤️ for the ArchiMate community**
