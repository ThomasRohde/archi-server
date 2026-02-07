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
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Security](#security)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Features

- 🔄 **Model Automation** - Create, query, and modify elements programmatically
- 🔌 **External Integration** - Connect with Python, Node.js, or any HTTP client
- 📊 **View Generation** - Dynamically create and layout ArchiMate views
- 🎯 **API-First Design** - RESTful endpoints with JSON responses
- ✅ **Full Undo Support** - All operations are fully undoable (Ctrl+Z)
- 🔒 **Production Hardened** - Rate limiting, validation, and timeout protection
- 🚀 **Zero Dependencies** - Pure JArchi implementation with GraalVM JS

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
├── context/                       # Development documentation
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
# Check server health
curl http://localhost:8765/health

# Query model elements
curl -X POST http://localhost:8765/model/query \
  -H "Content-Type: application/json" \
  -d '{"query": "elements"}'

# List views
curl http://localhost:8765/views
```

## API Reference

The server exposes a comprehensive REST API:

### Core Operations
- `GET /health` - Server health and diagnostics
- `POST /model/query` - Query model elements/relationships
- `POST /model/apply` - Modify model (create, update, delete)
- `POST /model/search` - Search by name, type, or properties

### View Management
- `GET /views` - List all views
- `POST /views` - Create new view
- `GET /views/{id}` - Get view details with all elements
- `DELETE /views/{id}` - Delete view
- `POST /views/{id}/layout` - Apply Dagre layout
- `POST /views/{id}/export` - Export as PNG/SVG

### Script Execution
- `POST /scripts/run` - Execute custom JArchi code

### Administration
- `GET /ops/status?opId=...` - Check operation status
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