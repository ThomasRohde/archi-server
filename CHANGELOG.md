# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0](https://github.com/ThomasRohde/archi-server/compare/v1.5.0...v1.6.0) (2026-02-10)


### Features

* enhance CLI command structure with detailed documentation and error handling ([208d6d9](https://github.com/ThomasRohde/archi-server/commit/208d6d9ee5bdf822a3241e8216e67e46ecdca1ca))


### Bug Fixes

* batch apply robustness — op-aligned chunking, post-exec ID capture, cross-validation ([621891d](https://github.com/ThomasRohde/archi-server/commit/621891d82babad9ae0452d070395f45f944e27c7))


### Maintenance

* apply local changes ([0e8dd30](https://github.com/ThomasRohde/archi-server/commit/0e8dd305e997ad0da7151ff2d2b2bc8ee809ff20))
* remove empty code change entries from changes log ([0c1a961](https://github.com/ThomasRohde/archi-server/commit/0c1a9612bac779e620b3d198acaace2f75ef1562))


### Code Refactoring

* **api:** remove unused PUT function and clean up server helper methods ([530a56c](https://github.com/ThomasRohde/archi-server/commit/530a56ca62753bc6c6401d62eec2d9b34f0f4a16))

## [1.5.0](https://github.com/ThomasRohde/archi-server/compare/v1.4.0...v1.5.0) (2026-02-10)


### Features

* **apply:** add safe mode option and reduce default chunk size for batch apply command ([aa50f2e](https://github.com/ThomasRohde/archi-server/commit/aa50f2ebce6f38f87cc63ff13ff4a8be9635c5d1))
* **cli:** implement client-side visual ID cross-validation for addConnectionToView operations ([e978938](https://github.com/ThomasRohde/archi-server/commit/e97893808c5641d06e5ba2aaa4d7477b619df3d5))
* **cli:** remove --poll option from batch apply commands for default atomic behavior ([e978938](https://github.com/ThomasRohde/archi-server/commit/e97893808c5641d06e5ba2aaa4d7477b619df3d5))
* **skills:** add skill-creator and consolidate archimate skills ([7c384cd](https://github.com/ThomasRohde/archi-server/commit/7c384cdfe36c4f779dfb5ce466b2a7a7255b3c98))
* **tests:** add server interaction helpers for model state management ([a85f0a3](https://github.com/ThomasRohde/archi-server/commit/a85f0a36ce6720c2b133fa7c285c5f46a880d5fc))
* **tests:** add smoke tests for CLI commands against live Archi server ([a85f0a3](https://github.com/ThomasRohde/archi-server/commit/a85f0a36ce6720c2b133fa7c285c5f46a880d5fc))
* **tests:** create fixture files for valid, invalid, and duplicate tempId BOMs ([a85f0a3](https://github.com/ThomasRohde/archi-server/commit/a85f0a36ce6720c2b133fa7c285c5f46a880d5fc))
* **tests:** implement CLI test harness for executing commands and parsing responses ([a85f0a3](https://github.com/ThomasRohde/archi-server/commit/a85f0a36ce6720c2b133fa7c285c5f46a880d5fc))
* **undoableCommands:** implement operation-aligned chunking and post-execution result refresh ([aa50f2e](https://github.com/ThomasRohde/archi-server/commit/aa50f2ebce6f38f87cc63ff13ff4a8be9635c5d1))


### Bug Fixes

* **api:** add retry logic for HTTP 429 responses during API requests ([e978938](https://github.com/ThomasRohde/archi-server/commit/e97893808c5641d06e5ba2aaa4d7477b619df3d5))
* **poll:** add retry logic for HTTP 429 responses during polling ([e978938](https://github.com/ThomasRohde/archi-server/commit/e97893808c5641d06e5ba2aaa4d7477b619df3d5))


### Documentation

* add batch execution and rollback recommendations ([aa50f2e](https://github.com/ThomasRohde/archi-server/commit/aa50f2ebce6f38f87cc63ff13ff4a8be9635c5d1))
* update batch-rollback-recommendations to reflect completion of all recommendations ([e978938](https://github.com/ThomasRohde/archi-server/commit/e97893808c5641d06e5ba2aaa4d7477b619df3d5))


### Maintenance

* add ArchiMate model for server ([df97ca4](https://github.com/ThomasRohde/archi-server/commit/df97ca4049ee6ab8d80dee6243f1edd89993e1f9))
* remove outdated model and integration documentation from README ([8c666a4](https://github.com/ThomasRohde/archi-server/commit/8c666a4103d61632feacfde53fa3f47b3b2f328f))
* **serverConfig:** lower maxSubCommandsPerBatch to 50 for improved stability ([aa50f2e](https://github.com/ThomasRohde/archi-server/commit/aa50f2ebce6f38f87cc63ff13ff4a8be9635c5d1))
* **tests:** configure Vitest for testing environment and timeout settings ([a85f0a3](https://github.com/ThomasRohde/archi-server/commit/a85f0a36ce6720c2b133fa7c285c5f46a880d5fc))


### Tests

* update tests to reflect changes in batch apply command and validation logic ([e978938](https://github.com/ThomasRohde/archi-server/commit/e97893808c5641d06e5ba2aaa4d7477b619df3d5))

## [1.4.0](https://github.com/ThomasRohde/archi-server/compare/v1.3.0...v1.4.0) (2026-02-09)


### Features

* **api:** add relationshipLimit to model query and return relationship samples ([a37ec51](https://github.com/ThomasRohde/archi-server/commit/a37ec5138cda61d55231ce519f2cc0aebd8e3d66))
* **api:** implement createView and deleteView operations in OpenAPI schema ([a37ec51](https://github.com/ThomasRohde/archi-server/commit/a37ec5138cda61d55231ce519f2cc0aebd8e3d66))
* **api:** implement operation listing functionality in operation queue ([5874646](https://github.com/ThomasRohde/archi-server/commit/58746460ad5effa55d76332d5aa075f20426a2ad))
* **api:** update OpenAPI schema to include nestInView operation ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))
* **archicli:** add command for listing recent operations with options for limit and status ([5874646](https://github.com/ThomasRohde/archi-server/commit/58746460ad5effa55d76332d5aa075f20426a2ad))
* **args:** add argument validation utilities for strict integer and bounded float parsing ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **batch:** add parseExistingIdFromError function and allow-empty option for batch apply command ([0a9017b](https://github.com/ThomasRohde/archi-server/commit/0a9017bbf1c082b66aaad8032bc45e83cddbb881))
* **batch:** enhance batch apply command with new reference ID fields and error handling ([9bbe4d6](https://github.com/ThomasRohde/archi-server/commit/9bbe4d6d467377132947bef955d5edffc8217d46))
* **batch:** enhance error handling and reporting for batch apply operations ([379b5e3](https://github.com/ThomasRohde/archi-server/commit/379b5e379625fec6c213f8e19488b18c3933a092))
* **bom.schema:** allow tempId in createFolder operations within BOM schema ([0a9017b](https://github.com/ThomasRohde/archi-server/commit/0a9017bbf1c082b66aaad8032bc45e83cddbb881))
* **bom:** implement BOM loading with diagnostics and duplicate temp ID detection ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **cli:** add Archi Command Line Interface documentation ([2102d08](https://github.com/ThomasRohde/archi-server/commit/2102d0892dc5c27f7ef2b9bd2d0a020dcfc27671))
* **cli:** implement view delete command for deleting views by ID ([a37ec51](https://github.com/ThomasRohde/archi-server/commit/a37ec5138cda61d55231ce519f2cc0aebd8e3d66))
* **commander:** introduce utility to identify Commander errors ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **config:** add wide option for disabling column truncation in output ([0a9017b](https://github.com/ThomasRohde/archi-server/commit/0a9017bbf1c082b66aaad8032bc45e83cddbb881))
* enhance CLI commands with improved error handling and validation ([9623f9e](https://github.com/ThomasRohde/archi-server/commit/9623f9eab2cf885e3e74771ca882c6a44a8a89cc))
* enhance command descriptions and validation for batch operations ([94518d7](https://github.com/ThomasRohde/archi-server/commit/94518d75d26a9bbf6ccf32dcddda63e6c579bcf8))
* enhance command descriptions and validation for view creation and batch operations ([d8ac38f](https://github.com/ThomasRohde/archi-server/commit/d8ac38fc359c1def519c7fec1c0cf1571bd1bddb))
* enhance command validation and error handling for batch operations and view creation ([dce0d88](https://github.com/ThomasRohde/archi-server/commit/dce0d88639664f18f2cee2d2d795ea60a9273a48))
* **folder:** introduce folder management commands for organizing model elements ([f846ba9](https://github.com/ThomasRohde/archi-server/commit/f846ba905ac39e055534120bd35dc98916446b6c))
* **health:** enhance health command output formatting for text mode ([0a9017b](https://github.com/ThomasRohde/archi-server/commit/0a9017bbf1c082b66aaad8032bc45e83cddbb881))
* **ids:** add command for looking up tempIds in .ids.json files ([f846ba9](https://github.com/ThomasRohde/archi-server/commit/f846ba905ac39e055534120bd35dc98916446b6c))
* **model:** add complete ArchiMate documentation model with relationships and views ([c126aa2](https://github.com/ThomasRohde/archi-server/commit/c126aa29eb9ddfcb839ff7d60c406f686fb9b6ba))
* **model:** add save command to persist model state ([f846ba9](https://github.com/ThomasRohde/archi-server/commit/f846ba905ac39e055534120bd35dc98916446b6c))
* **model:** include show-views option in model query command ([0a9017b](https://github.com/ThomasRohde/archi-server/commit/0a9017bbf1c082b66aaad8032bc45e83cddbb881))
* **model:** remove deprecated relationship and view definitions ([8b462f7](https://github.com/ThomasRohde/archi-server/commit/8b462f7b8aadb19e7ebf1e58919398937af86a66))
* **model:** update view creation to support viewpoint assignment ([8b462f7](https://github.com/ThomasRohde/archi-server/commit/8b462f7b8aadb19e7ebf1e58919398937af86a66))
* **openapi:** update API schema to include structured error details for operations ([379b5e3](https://github.com/ThomasRohde/archi-server/commit/379b5e379625fec6c213f8e19488b18c3933a092))
* **operations:** add endpoint to list recent async operations with filtering options ([5874646](https://github.com/ThomasRohde/archi-server/commit/58746460ad5effa55d76332d5aa075f20426a2ad))
* **output:** adjust table formatting based on wide mode configuration ([0a9017b](https://github.com/ThomasRohde/archi-server/commit/0a9017bbf1c082b66aaad8032bc45e83cddbb881))
* **settings:** add new Bash commands for archicli view and ls ([cc8da3e](https://github.com/ThomasRohde/archi-server/commit/cc8da3e2e66bcaa707eb6cc06a1eedd3940caa23))
* **tempIds:** implement temp ID resolution and substitution logic ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **tests:** add integration tests for /ops/list endpoint and its filtering capabilities ([5874646](https://github.com/ThomasRohde/archi-server/commit/58746460ad5effa55d76332d5aa075f20426a2ad))
* **tests:** add unit tests for nestInView and addToView with parentVisualId ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))
* **types:** add ArchiMate types constants for validation ([a37ec51](https://github.com/ThomasRohde/archi-server/commit/a37ec5138cda61d55231ce519f2cc0aebd8e3d66))
* update version to 1.3.0 and improve CLI functionality ([e11d12c](https://github.com/ThomasRohde/archi-server/commit/e11d12c0bd00b27a6c2538d63892da2ad690b291))
* **validation:** add validation for nestInView operation and parentVisualId in addToView ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))
* **verify:** add semantic validation checks for BOM and improve duplicate tempId detection ([379b5e3](https://github.com/ThomasRohde/archi-server/commit/379b5e379625fec6c213f8e19488b18c3933a092))
* **view:** add support for nesting visual objects with parentVisualId and nestInView operations ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))
* **view:** add viewpoint normalization and validation in server endpoints ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **view:** enhance view creation with viewpoint validation and error handling ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **view:** implement layout command for auto-arranging view elements ([f846ba9](https://github.com/ThomasRohde/archi-server/commit/f846ba905ac39e055534120bd35dc98916446b6c))
* **view:** improve view export command with scale and margin validation ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **view:** update view export command to handle text output format ([0a9017b](https://github.com/ThomasRohde/archi-server/commit/0a9017bbf1c082b66aaad8032bc45e83cddbb881))
* **workspaces:** add workspaces configuration for archicli ([d72220d](https://github.com/ThomasRohde/archi-server/commit/d72220d4571bc5498eea3054b21a82f7d9b789f6))


### Bug Fixes

* **api:** handle relationshipLimit in model query response ([a37ec51](https://github.com/ThomasRohde/archi-server/commit/a37ec5138cda61d55231ce519f2cc0aebd8e3d66))
* **batch:** correct tempId mapping logic for viewId and improve note/group ID handling ([3e66459](https://github.com/ThomasRohde/archi-server/commit/3e664591fd1f9ede3458a5d19296b2fb57fba830))
* **logging:** improve resilience of logging queue during UI inactivity ([f846ba9](https://github.com/ThomasRohde/archi-server/commit/f846ba905ac39e055534120bd35dc98916446b6c))
* **monitor:** implement heartbeat mechanism to prevent ghost window issue ([f846ba9](https://github.com/ThomasRohde/archi-server/commit/f846ba905ac39e055534120bd35dc98916446b6c))
* **openapi-ts:** correct plugin name and adjust postProcess configuration ([d869d6e](https://github.com/ThomasRohde/archi-server/commit/d869d6e59c9ee4658abf98bffbc98941c17f7710))
* **poll:** extend OperationErrorDetails interface for better error context ([379b5e3](https://github.com/ThomasRohde/archi-server/commit/379b5e379625fec6c213f8e19488b18c3933a092))
* **verify:** enhance validation for addConnectionToView direction consistency ([f846ba9](https://github.com/ThomasRohde/archi-server/commit/f846ba905ac39e055534120bd35dc98916446b6c))
* **viewEndpoints:** include parentId in element data for nested visual objects ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))
* **viewEndpoints:** include viewpoint in create view operation ([8b462f7](https://github.com/ThomasRohde/archi-server/commit/8b462f7b8aadb19e7ebf1e58919398937af86a66))
* **view:** ensure viewpoint is correctly retrieved in view get command ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **view:** handle errors consistently in view list command ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))


### Documentation

* add bug fix documentation for ghost window issue in monitor UI ([f846ba9](https://github.com/ThomasRohde/archi-server/commit/f846ba905ac39e055534120bd35dc98916446b6c))
* add initial report for archicli v0.1.0 testing ([a37ec51](https://github.com/ThomasRohde/archi-server/commit/a37ec5138cda61d55231ce519f2cc0aebd8e3d66))
* **cli:** add TypeScript CLI instructions and BOM file format details ([1091f09](https://github.com/ThomasRohde/archi-server/commit/1091f0983a6e1b242f2d2a2a67a5c8f72c037e59))
* **pattern:** update prompts to include nesting instructions for compound elements ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))
* **README:** document nesting behavior for compound elements in addToView ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))
* update output behavior in help text for clarity ([e766c2a](https://github.com/ThomasRohde/archi-server/commit/e766c2a67526b43941edf2ea860172faebfef452))
* **workflow:** clarify usage of parentVisualId and nestInView in workflow templates ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))


### Maintenance

* remove obsolete Archi CLI documentation and schema files ([4714105](https://github.com/ThomasRohde/archi-server/commit/4714105bdc0cb6b32d5dddf50a3bc505c2f955b5))
* remove outdated suggestion documents from the repository ([b28566d](https://github.com/ThomasRohde/archi-server/commit/b28566d5a99bef44b1ddb18746a08e5f225c955c))


### Code Refactoring

* **undoableCommands:** enhance addToView and nestInView command handling ([712b1e4](https://github.com/ThomasRohde/archi-server/commit/712b1e415a3da39782a7611f11e9163e9f2bbe80))


### Tests

* add unit tests for parseExistingIdFromError and BOM schema validation ([0a9017b](https://github.com/ThomasRohde/archi-server/commit/0a9017bbf1c082b66aaad8032bc45e83cddbb881))
* **api:** add tests for relationshipLimit in model query ([a37ec51](https://github.com/ThomasRohde/archi-server/commit/a37ec5138cda61d55231ce519f2cc0aebd8e3d66))
* **archicli:** add unit tests for batch apply --save-ids path resolution ([5874646](https://github.com/ThomasRohde/archi-server/commit/58746460ad5effa55d76332d5aa075f20426a2ad))
* **remediation:** add unit tests for archicli remediation helpers ([a37ec51](https://github.com/ThomasRohde/archi-server/commit/a37ec5138cda61d55231ce519f2cc0aebd8e3d66))

## [Unreleased]

### CLI

* add strict `idFiles` handling for `verify --semantic` and `batch apply` with `--allow-incomplete-idfiles` override
* add `model search --strict-types`, duplicate `--type` rejection, and client-side `--name` regex validation
* add `batch apply --skip-existing` for duplicate-create idempotent reruns
* add `view delete <id>` command
* add `model query --show-relationships --relationship-limit <n>`
* add global `--output yaml` and `--quiet` flags
* add `view export --output-file` alias
* standardize split flag naming to `--chunk-size` with deprecated `--size` alias
* improve `view get` text output readability and completion support for `model search --type` values

### Server/API

* extend `POST /model/query` to accept `relationshipLimit` and return sampled `relationships`
* align OpenAPI `ChangeOperation` mappings with `createView` and `deleteView`

### Schemas/Docs

* add `deleteView` support to BOM schema
* update CLI and README help text around sync/async behavior, polling caveats, and new flags

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
