# archicli

TypeScript CLI for the Archi Model API Server. `archicli` is designed for scripted workflows, CI automation, and AI-agent-driven modeling against a running Archi instance.

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | >= 18.0.0 |
| Archi | 5.7+ |
| jArchi plugin | 1.11+ |
| Server script | `Model API Server.ajs` running |

Server defaults to `http://127.0.0.1:8765`. Override with `ARCHI_BASE_URL` or `--base-url`.

## Install

```bash
cd archicli
npm install
npm run build
npm link
```

After linking, `archicli` is available globally in your shell.

## Quick Start

```bash
archicli health
archicli doctor
archicli model query --show-relationships --relationship-limit 5
archicli model search --type application-component --strict-types
archicli verify changes.json --semantic
archicli batch apply changes.json
archicli ops list
```

## Global Options

These options are available on every command:

- `-u, --base-url <url>`: API base URL (default `http://127.0.0.1:8765` or `ARCHI_BASE_URL`)
- `--output <format>`: `json` (default), `text`, or `yaml`
- `-q, --quiet`: print data-only success output (no envelope metadata)
- `-v, --verbose`: add HTTP debug warnings in output metadata
- `-w, --wide`: disable text-table truncation for `--output text`

Usage and argument errors are emitted in the selected output mode.

### Quiet Output Contract

`--quiet` returns a data-only payload intended for shell scripting. It does not include the standard `{ success, data, metadata }` envelope.

Representative JSON shapes:

- `archicli --quiet health` → `{ "status": "ok" }`
- `archicli --quiet batch apply changes.json` → `{ "operationIds": ["op_..."] }`
- `archicli --quiet ops status <opId>` → `{ "operationId": "op_...", "status": "complete" }`

## BOM Workflow

Most write automation should use `batch apply`, which polls by default.

1. Author a BOM file.
2. Validate with `archicli verify <file> --semantic`.
3. Apply with `archicli batch apply <file>`.
4. Reuse generated `<file>.ids.json` mappings in later BOMs (`idFiles`).

Example BOM:

```json
{
  "version": "1.0",
  "description": "Create application layer",
  "changes": [
    { "op": "createElement", "type": "application-component", "name": "App", "tempId": "app-main" },
    { "op": "createElement", "type": "business-actor", "name": "User", "tempId": "user-main" },
    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "app-main", "targetId": "user-main", "tempId": "rel-serves" }
  ]
}
```

Useful apply flags:

- `--fast`: chunk-size 20, disables connection validation/throttle
- `--skip-existing`: idempotent re-apply behavior for duplicate creates
- `--layout`: auto-layout views created/populated in this run
- `--layout-algorithm <name>`: layout algorithm for `--layout` (`dagre` or `sugiyama`)
- `--continue-on-error`: keep processing independent chunks
- `--resolve-names`: resolve unresolved concept tempIds by exact name lookup (not visual IDs)

### All commands

```
archicli health                       Check server connectivity and health payload
archicli verify <file>                Validate JSON schema (and optional BOM semantics)
archicli model query                  Get model overview and sample data
archicli model apply <file>           Submit raw /model/apply payload from file
archicli model search                 Search by type/name/property filters
archicli model element <id>           Get one element (supports --id-file tempId resolution)
archicli model save                   Save current model (optional --path)
archicli model stats                  Get type-based model statistics
archicli batch apply <file>           Validate/flatten/apply BOM with chunking and polling options
archicli batch split <file>           Split BOM into chunk files and index BOM
archicli view list                    List views
archicli view get <id>                Get full view details (visual IDs, positions, connections)
archicli view create <name>           Create a view (optional viewpoint/folder/documentation)
archicli view export [id]             Export one view or --all views to PNG/JPEG/JPG
archicli view delete <id>             Delete a view
archicli view layout <id>             Auto-layout a view (--algorithm dagre|sugiyama)
archicli ops status <opId>            Get operation status or --poll to completion
archicli ops list                     List recent async operations
archicli folder list                  List folders (optional --type filter)
archicli ids lookup <tempId>          Resolve tempId across one or more .ids.json files
archicli doctor                       Run preflight readiness checks
archicli init [dir]                   Create starter BOM templates and workflow README
archicli completion <shell>           Generate shell completion script (bash|zsh|fish|pwsh)
```

Use `archicli <command> --help` for full argument and option details.

## Shell Completion

```bash
# bash
archicli completion bash --raw > ~/.local/share/bash-completion/completions/archicli

# zsh
archicli completion zsh --raw > ~/.zfunc/_archicli

# fish
archicli completion fish --raw > ~/.config/fish/completions/archicli.fish

# PowerShell
archicli completion pwsh --raw > archicli-completion.ps1
```

## Development

```bash
cd archicli
npm install
npm run codegen
npm run build
npm test
```

Available scripts:

- `npm run dev`: run CLI via `tsx src/cli.ts`
- `npm run codegen`: regenerate API client types from `../openapi.yaml`
- `npm run build`: compile TypeScript and copy JSON schemas to `dist/`
- `npm test`: run Vitest suite
- `npm run test:smoke`
- `npm run test:fixes`
- `npm run test:bulk`
- `npm run test:errors`
- `npm run test:bom`
