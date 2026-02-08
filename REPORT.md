# archicli v0.1.0 — Blind Test Report

**Date:** 2026-02-08
**Tester:** Claude Code (automated blind test)
**Server:** Archi Model API Server v1.1.0 on `http://127.0.0.1:8765`
**Model:** Empty "(new model)" at start of test

## Executive Summary

archicli is a well-structured CLI with excellent help text, consistent JSON output, proper exit codes for most commands, and a solid BOM/tempId workflow. The core happy path (create elements, create relationships, set properties, add to views, export views) works correctly end-to-end. However, testing uncovered **4 bugs** and **6 improvement opportunities**.

---

## Bugs

### BUG-1: `createView` missing from BOM schema (SEVERITY: HIGH)

The `batch` help text documents `createView` as a valid BOM operation:

```
OPERATION TYPES (each object has an "op" field plus required fields):
  ...
  createView        name, [tempId, documentation]
```

But the BOM JSON schema (`src/schemas/bom.schema.json`) does **not** include `createView` in the `op` enum. Attempting to use it in a BOM file fails validation:

```
archicli verify view-bom.json
→ { "path": "/changes/0/op", "message": "must be equal to one of the allowed values" }

archicli batch apply view-bom.json --poll
→ { "code": "INVALID_BOM", ... }
```

**Workaround:** Use `archicli view create` CLI command instead, then hardcode the returned viewId into subsequent BOM files.

**Impact:** Breaks the documented single-BOM workflow where you create a view and populate it in one batch. Users must split into two steps (CLI view create, then BOM addToView), losing the tempId advantage.

**Fix:** Add `"createView"` to the `op` enum in `bom.schema.json` and add the corresponding conditional schema for its required fields (`name`).

---

### BUG-2: `view list` reports `connectionCount: 0` for views with connections (SEVERITY: MEDIUM)

After adding 3 connections to the "Application Architecture" view via `addConnectionToView`, `view list` still reports `connectionCount: 0`:

```json
{
  "name": "Application Architecture",
  "elementCount": 4,
  "connectionCount": 0   // ← should be 3
}
```

Meanwhile, `view get <id>` correctly returns all 3 connections in its `connections` array.

**Root cause:** This is a backend API issue (the CLI just passes through `/views` response). The `connectionCount` field in the `ViewSummary` type is not being calculated correctly by the jArchi server script.

---

### BUG-3: `--output` flag name clash between global and `view export` (SEVERITY: MEDIUM)

The global option `--output <format>` (json/text) collides with `view export`'s `-o, --output <path>` option.

```bash
# BROKEN: --output is consumed by global parser as format, not as file path
archicli view export <id> --output /path/to/file.png
→ file goes to temp dir; output formatted as text (if path looks like "text")

# WORKS: -o short form correctly targets the local option
archicli view export <id> -o /path/to/file.png
→ file saved to specified path
```

**Fix:** Rename the `view export` option to `--file` or `--dest` to avoid the clash. Alternatively, rename the global option to `--format`.

---

### BUG-4: Unknown subcommands exit 0 instead of 1 (SEVERITY: LOW)

```bash
archicli nonexistent          # → exit 1, error message ✓
archicli model nonexistent    # → exit 0, just prints help text ✗
archicli batch nonexistent    # → exit 0, just prints help text ✗
archicli view nonexistent     # → exit 0, just prints help text ✗
archicli ops nonexistent      # → exit 0, just prints help text ✗
```

Unknown top-level commands correctly exit 1 with an error. Unknown subcommands silently show help and exit 0. This breaks scripting patterns like `archicli model foo && echo "ok"`.

**Fix:** Configure Commander.js subcommand groups with `.exitOverride()` or a custom unknown-command handler that exits 1.

---

## Improvement Opportunities

### IMP-1: Help text lists fewer BOM ops than the schema supports

The `batch` help text documents 8 operation types:

```
createElement, createRelationship, setProperty, updateElement,
deleteElement, createView, addToView, addConnectionToView
```

But the actual schema supports **17** operation types:

```
createElement, createRelationship, updateElement, updateRelationship,
deleteElement, deleteRelationship, setProperty, moveToFolder,
createFolder, addToView, addConnectionToView, deleteConnectionFromView,
styleViewObject, styleConnection, moveViewObject, createNote, createGroup
```

The undocumented operations (`updateRelationship`, `deleteRelationship`, `moveToFolder`, `createFolder`, `deleteConnectionFromView`, `styleViewObject`, `styleConnection`, `moveViewObject`, `createNote`, `createGroup`) are potentially very useful — especially `styleViewObject` and `moveViewObject` for programmatic diagram layout. They should be documented in the help text.

### IMP-2: `--output text` format is barely more readable than JSON

The text formatter (`src/utils/output.ts`) formats top-level scalar keys as `key: value` but dumps nested objects/arrays as indented JSON. Example:

```
summary:
  {
    "elements": 4,
    "relationships": 3,
    "views": 2
  }
```

This is marginally better than raw JSON. Consider:
- A table format for lists (e.g., `model search`, `view list`)
- Flat key-path notation for nested objects (e.g., `server.port: 8765`)
- A `--output table` option using something like `cli-table3`

### IMP-3: `model search` silently accepts invalid type names

```bash
archicli model search --type bogus-type
→ success: true, results: [], total: 0
```

No warning that `bogus-type` isn't a recognized ArchiMate type. A typo like `application-componet` returns empty results with no hint about what went wrong.

**Suggestion:** Validate `--type` against the known ArchiMate type list and warn (or error) on unrecognized types. At minimum, add a `"warning"` field to the response.

### IMP-4: `model query` doesn't return folder structure despite help text promise

The help text says:
> "Get a model overview: element/relationship counts, **folder structure**, and sample elements."

The actual output only contains `summary` (counts) and `sample` (element list). No folder structure is present. Either implement it or update the help text.

### IMP-5: `verify` returns `success: true` with exit code 1 for invalid files

```json
{
  "success": true,
  "data": {
    "valid": false,
    "errors": [...]
  }
}
// exit code: 1
```

The `success: true` indicates the verify *operation* succeeded, while `data.valid: false` indicates the *file* is invalid. The exit code 1 correctly signals failure for scripting. However, the mixed signals (`success: true` + exit 1) may confuse JSON consumers.

**Suggestion:** Consider `success: false` when `valid: false`, or add documentation clarifying the semantics. Alternatively, add a `--strict` flag that makes `success` mirror `valid`.

### IMP-6: Empty BOM applies silently with no warning

```bash
archicli batch apply empty-bom.json --poll
→ { "totalChanges": 0, "chunks": 0, "results": [] }  # exit 0
```

While technically correct, a no-op apply is likely a user mistake. A warning message or `--warn-empty` flag would improve the experience.

---

## What Works Well

| Feature | Status | Notes |
|---------|--------|-------|
| `health` | Excellent | Clear output, good error when server is down |
| `verify` | Excellent | Catches missing fields, unknown ops, bad JSON, missing files |
| `batch apply --poll` | Excellent | Cross-chunk tempId resolution works perfectly |
| `batch split` | Excellent | Clean chunk files with index BOM; `includes` work on apply |
| `model query` | Good | Counts and samples returned correctly |
| `model search` | Good | Type, name regex, property key/value all work |
| `model element` | Excellent | Full detail including relationships and view membership |
| `view create` | Good | Creates view, returns ID |
| `view get` | Excellent | Full visual + connection detail with conceptId/visualId distinction |
| `view export` | Good | PNG/JPEG, scale, margin all work (via `-o`, not `--output`) |
| `ops status` | Good | Snapshot and `--poll` both work |
| `model apply` | Good | Low-level async works, `--poll` works |
| `--verbose` | Good | Shows HTTP method and URL for debugging |
| `--base-url` / `ARCHI_BASE_URL` | Good | Both override correctly with clear error on bad server |
| `--no-save-ids` | Good | Correctly suppresses .ids.json creation |
| `--save-ids <path>` | Good | Custom path works |
| `--resolve-names` | Excellent | Resolved element names to IDs seamlessly |
| `--dry-run` | Good | Shows chunk plan without touching model |
| tempId system | Excellent | Works across chunks, via idFiles, and with resolve-names |
| Error messages | Good | Structured `{ success, error: { code, message } }`, exit 1 |
| Help text | Excellent | Thorough, with examples, workflow guidance, and key concepts |

---

## Test Matrix

| Test Case | Command | Result | Exit Code |
|-----------|---------|--------|-----------|
| Health (server up) | `health` | Pass | 0 |
| Health (server down) | `--base-url :9999 health` | Pass | 1 |
| Health (env var override) | `ARCHI_BASE_URL=:9999 health` | Pass | 1 |
| Verify valid BOM | `verify valid-bom.json` | Pass | 0 |
| Verify invalid BOM | `verify invalid-bom.json` | Pass (found errors) | 1 |
| Verify non-JSON | `verify not-json.txt` | Pass | 1 |
| Verify missing file | `verify nonexistent.json` | Pass | 1 |
| Verify no version | `verify no-version-bom.json` | Pass | 1 |
| Verify explicit schema | `verify x.json --schema bom` | Pass | 1 |
| Verify unknown schema | `verify x.json --schema foo` | Pass | 1 |
| Batch apply (happy path) | `batch apply valid-bom.json --poll` | Pass | 0 |
| Batch apply dry-run | `batch apply x.json --dry-run` | Pass | 0 |
| Batch apply invalid BOM | `batch apply invalid-bom.json` | Pass (rejected) | 1 |
| Batch apply empty BOM | `batch apply empty-bom.json` | Pass (no-op) | 0 |
| Batch apply multi-chunk | `batch apply x.json --poll --chunk-size 3` | Pass | 0 |
| Batch apply --no-save-ids | `batch apply x.json --poll --no-save-ids` | Pass (no file) | 0 |
| Batch apply --save-ids path | `batch apply x.json --poll --save-ids custom.json` | Pass | 0 |
| Batch apply --resolve-names | `batch apply x.json --poll --resolve-names` | Pass | 0 |
| Batch apply duplicate element | `batch apply large-bom.json` (2nd time) | Pass (rejected) | 1 |
| Batch split | `batch split large-bom.json --size 4` | Pass (3 chunks) | 0 |
| Batch apply split index | `batch apply index.json --poll` | Pass | 0 |
| Model query | `model query` | Pass | 0 |
| Model query --limit | `model query --limit 2` | Pass | 0 |
| Model search by type | `model search --type application-component` | Pass | 0 |
| Model search by name | `model search --name ".*API.*"` | Pass | 0 |
| Model search by property | `model search --property-key status --property-value active` | Pass | 0 |
| Model search by key only | `model search --property-key status` | Pass | 0 |
| Model search no filters | `model search` | Pass (returns all) | 0 |
| Model search --limit | `model search --limit 1` | Pass | 0 |
| Model search bad type | `model search --type bogus` | Pass (no warning) | 0 |
| Model element (valid ID) | `model element <id>` | Pass | 0 |
| Model element (invalid ID) | `model element id-nonexistent` | Pass | 1 |
| Model element (no arg) | `model element` | Pass | 1 |
| Model apply (no poll) | `model apply x.json` | Pass (returns opId) | 0 |
| Model apply --poll | `model apply x.json --poll` | Pass | 0 |
| Ops status (valid) | `ops status <opId>` | Pass | 0 |
| Ops status (invalid) | `ops status op_fake_123` | Pass | 1 |
| View list | `view list` | Pass* | 0 |
| View get | `view get <id>` | Pass | 0 |
| View get (invalid) | `view get id-nonexistent` | Pass | 1 |
| View create | `view create "Name"` | Pass | 0 |
| View create (viewpoint) | `view create "Name" --viewpoint x` | Pass | 0 |
| View export (PNG) | `view export <id>` | Pass | 0 |
| View export (JPEG) | `view export <id> --format JPEG` | Pass | 0 |
| View export (-o path) | `view export <id> -o path.png` | Pass | 0 |
| View export (--output path) | `view export <id> --output path.png` | **FAIL** (flag clash) | 0 |
| View export (invalid) | `view export id-nonexistent` | Pass | 1 |
| Output --output json | (default) | Pass | 0 |
| Output --output text | `--output text` (all commands) | Pass | 0 |
| Verbose | `--verbose` | Pass | 0 |
| Unknown top command | `archicli nonexistent` | Pass | 1 |
| Unknown subcommand | `archicli model nonexistent` | **FAIL** (exit 0) | 0 |
| BOM with createView op | `batch apply view-bom.json` | **FAIL** (schema) | 1 |
| BOM tempId across chunks | `batch apply x.json --chunk-size 3` | Pass | 0 |
| BOM idFiles cross-reference | `batch apply x.json` (with idFiles) | Pass | 0 |
| setProperty | via BOM | Pass | 0 |
| updateElement | via BOM | Pass | 0 |
| deleteElement | via BOM | Pass | 0 |
| addToView | via BOM | Pass | 0 |
| addConnectionToView | via BOM | Pass | 0 |

\* `view list` returns correct view data but `connectionCount` is always 0 (BUG-2).

---

## Recommendations (Priority Order)

1. **Fix BUG-1** — Add `createView` to BOM schema. This is a blocking issue for the documented single-BOM workflow.
2. **Fix BUG-3** — Rename `view export --output` to `--file` or `--dest` to avoid the global flag clash.
3. **Fix BUG-2** — Fix `connectionCount` in the backend `/views` endpoint.
4. **Address IMP-1** — Document the 9 undocumented BOM operations in help text.
5. **Address IMP-3** — Validate `--type` against known ArchiMate types.
6. **Fix BUG-4** — Make unknown subcommands exit 1.
7. **Address IMP-4** — Either add folder structure to `model query` or update help text.
8. **Address IMP-2** — Improve `--output text` formatting (tables for lists, flat keys for objects).
