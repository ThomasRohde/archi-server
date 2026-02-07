# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0](https://github.com/ThomasRohde/archi-server/compare/v1.2.0...v1.3.0) (2026-02-07)


### Features

* add archimate modeling capabilities and auditing prompts ([c35a625](https://github.com/ThomasRohde/archi-server/commit/c35a6257a9c732f01f9ffce4e09a6718c36a3183))
* archimate modeling skills ([41d3637](https://github.com/ThomasRohde/archi-server/commit/41d36372bbca74a42c4083197fdcc6cfa7f8ebf4))
* **tests:** add manual verification for duplicate detection feature ([c09097a](https://github.com/ThomasRohde/archi-server/commit/c09097a57a05aef6fd6c13e9c5404cba6d57d97b))

## [1.2.0](https://github.com/ThomasRohde/archi-server/compare/v1.1.0...v1.2.0) (2026-02-07)


### Features

* add release automation and commit linting ([609f936](https://github.com/ThomasRohde/archi-server/commit/609f93659f5479f7b68741317ee12d953b0ce98b))
* make standalone deleteElement use undoable manual cascade ([a1690cf](https://github.com/ThomasRohde/archi-server/commit/a1690cffbf42295394d122a22aba21f858bd1f1f))

## [1.1.0] - 2026-02-07

### Features
- Production-ready HTTP REST API server for Archi
- Comprehensive model query and modification endpoints
- Dynamic view creation and layout (Dagre algorithm)
- Full undo/redo support for all operations
- Real-time monitoring UI with operation logs
- Asynchronous operation queue with status tracking
- Script execution endpoint for custom jArchi code

### Security
- Rate limiting (200 requests/minute per IP)
- Request size limits (1MB max body size)
- Operation timeouts (60 second default)
- Input validation and type checking
- CORS origin controls
- Localhost-only binding by default

### API Endpoints
- `/health` - Server health and diagnostics
- `/model/query` - Query elements and relationships
- `/model/apply` - Batch create/update/delete operations
- `/model/search` - Search by name, type, or properties
- `/views` - List, create, update, delete views
- `/views/{id}/layout` - Apply automatic layout
- `/views/{id}/export` - Export views as images
- `/scripts/run` - Execute custom scripts
- `/ops/status` - Operation status tracking
- `/shutdown` - Graceful server shutdown

### Documentation
- Complete OpenAPI specification
- Comprehensive README with examples
- Development documentation in context/ folder
- Python and Node.js client examples

### Infrastructure
- Modular architecture with endpoint separation
- Efficient model snapshot caching
- Background operation processing
- Thread-safe queue management
- Graceful error handling and recovery

[1.1.0]: https://github.com/ThomasRohde/archi-server/releases/tag/v1.1.0
