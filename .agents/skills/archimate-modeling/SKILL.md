---
name: archimate-modeling
description: ArchiMate enterprise architecture modeling using the archicli CLI tool. Use this skill when creating, modifying, querying, validating, or visualizing   ArchiMate models programmatically through the Archi Model API Server. Covers - BOM authoring, semantic preflight, batch apply workflows, idFiles chaining, model and view inspection, export operations, and ArchiMate best-practice application.
---

# ArchiMate Modeling with archicli

## Prerequisites

1. Run Archi (5.7+) with jArchi plugin.
2. Open an ArchiMate model with at least one view active.
3. Run `Model API Server` from the Scripts menu.
4. Use `http://127.0.0.1:8765` unless `ARCHI_BASE_URL` overrides it.

## Startup Checks

Run these first:

```bash
archicli doctor
archicli health
archicli model query --limit 20 --show-views --show-relationships
```

## Execution Rules

- Run `archicli verify <file> --semantic` before every `batch apply`.
- Do not pass `--poll` to `batch apply`; polling is already enabled by default.
- Use `--no-poll` only when intentionally managing operation IDs with `ops status`.
- Keep default atomic mode (`chunk-size 1`) for correctness-first runs.
- Use `--layout` when creating or heavily editing views.
- Use `--resolve-names` only for unresolved concept IDs. It does not resolve visual IDs.
- Expect empty BOMs to fail unless `--allow-empty` is set.
- Expect declared `idFiles` to be enforced unless `--allow-incomplete-idfiles` is set.
- Use `--fast` only when bulk throughput is more important than connection cross-validation.
- Follow ArchiMate quality guidance in [references/archimate-best-practices.md](references/archimate-best-practices.md).

## Core Workflow

### 1) Inspect current model state

```bash
archicli model query --limit 20 --show-views --show-relationships
archicli model search --type application-component --strict-types
archicli model search --name ".*Customer.*"
archicli model element <id>
archicli view list
archicli view get <view-id>
archicli folder list
```

### 2) Author a BOM

Use [references/bom-reference.md](references/bom-reference.md) for operation details.

Minimal example:

```json
{
  "version": "1.0",
  "description": "Create one application component",
  "changes": [
    {
      "op": "createElement",
      "type": "application-component",
      "name": "My App",
      "tempId": "ac-myapp"
    }
  ]
}
```

### 3) Validate the BOM

```bash
archicli verify my-bom.json --semantic
```

Use name fallback only when needed:

```bash
archicli verify my-bom.json --semantic --resolve-names
```

### 4) Apply the BOM

```bash
archicli batch apply my-bom.json --layout
```

`batch apply` writes `<file>.ids.json` automatically when tempIds resolve.

### 5) Reuse resolved IDs

```bash
archicli ids lookup ac-myapp --id-file my-bom.ids.json
```

### 6) Save the model

```bash
archicli model save
```

## BOM Authoring Checklist

### Operation ordering

- Create concepts first: `createElement`, `createRelationship`, `createFolder`, `createView`.
- Enrich concepts next: `updateElement`, `updateRelationship`, `setProperty`, `moveToFolder`.
- Place visuals after concepts: `addToView`, `nestInView`, `addConnectionToView`.
- Refine visuals last: `moveViewObject`, `styleViewObject`, `styleConnection`, `createNote`, `createGroup`, `deleteConnectionFromView`.

### TempId strategy

- Assign `tempId` on creation operations.
- Keep tempIds stable and descriptive across files.
- Chain BOM files with `idFiles` and generated `.ids.json` outputs.
- Keep one clear tempId namespace per domain/layer.

Recommended prefixes:

| Prefix | Meaning |
|--------|---------|
| `ba-` | business actor |
| `br-` | business role |
| `bp-` | business process |
| `bs-` | business service |
| `ac-` | application component |
| `as-` | application service |
| `do-` | data object |
| `nd-` | node |
| `ts-` | technology service |
| `cap-` | capability |
| `gl-` | goal |
| `rq-` | requirement |
| `wp-` | work package |
| `rel-` | relationship |
| `v-` | view |
| `vis-` | visual object |
| `note-` | note |
| `grp-` | group |
| `fld-` | folder |

### Concept IDs vs visual IDs

- `createElement` creates concept IDs (model tree IDs).
- `addToView` creates visual IDs (diagram object IDs).
- `addConnectionToView` consumes visual IDs, not element tempIds.
- `--resolve-names` cannot reconstruct missing visual IDs.

### Multi-BOM composition

Split large work into ordered BOM files and reuse prior mappings:

```text
model/
  01-elements.json
  02-relationships.json      # idFiles: ["01-elements.ids.json"]
  03-views.json              # idFiles: ["01-elements.ids.json", "02-relationships.ids.json"]
  04-styling.json            # idFiles: ["03-views.ids.json"]
```

Use `archicli batch split` when one BOM gets too large to maintain.

## View and Layout Operations

Create a view directly:

```bash
archicli view create "Application Landscape" --viewpoint application_cooperation
```

Layout and export:

```bash
archicli view layout <view-id> --rankdir LR
archicli view export <view-id> --format PNG --scale 2
archicli view export --all --dir ./exports
```

## Performance Modes

Default correctness mode:

```bash
archicli batch apply model.json
```

Throughput mode:

```bash
archicli batch apply model.json --fast
```

Use `--fast` only when you accept:

- chunk-size override to 20,
- disabled connection cross-validation,
- disabled submission throttle.

## Error Recovery

```bash
archicli ops list
archicli ops status <operation-id>
archicli ops status <operation-id> --poll
```

For partial-failure-tolerant runs:

```bash
archicli batch apply model.json --continue-on-error
```

For idempotent re-runs:

```bash
archicli batch apply model.json --skip-existing
```

## References

- [references/bom-reference.md](references/bom-reference.md) for BOM structure and operation fields.
- [references/archimate-best-practices.md](references/archimate-best-practices.md) for modeling quality rules.
