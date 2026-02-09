# archicli v0.1.0 — Blind Test Report

**Date:** 2026-02-09  
**Server:** Archi Model API Server v1.1.0  
**Platform:** Windows (PowerShell)  
**Tester:** Automated CLI exercise from scratch (empty model)

---

## Executive Summary

archicli is a well-designed, thoroughly thought-out CLI for programmatic ArchiMate model manipulation. The help text is excellent, error handling is consistent, and the core happy-path workflow (create elements → create relationships → populate views → export) works flawlessly. A handful of bugs and UX gaps were found during testing.

**Overall quality: High.** Most issues below are polish items, not blockers.

---

## Bugs

### BUG-1: `batch split --size` deprecated alias is completely broken
**Severity: Medium**

The `--size` flag (documented as a deprecated alias for `--chunk-size`) silently ignores the provided value and uses the default (100).

```
archicli batch split large-bom.json --size 2 --output-dir test-parts
# Result: chunkSize: 100, chunks: 1 (expected chunkSize: 2, chunks: 5)
```

The `--chunk-size 3` flag works correctly. The `--size` alias appears to be registered but doesn't pass through its value. **No deprecation warning is emitted either**, despite the help text claiming "a deprecation warning" would appear.

**Fix:** Wire `--size` to set the same internal value as `--chunk-size`, and emit a stderr deprecation warning when `--size` is used.

---

### BUG-2: `--skip-existing` doesn't propagate existing IDs into the tempId map
**Severity: High** (renders `--skip-existing` largely useless for real workflows)

When `--skip-existing` skips a `createElement` because the element already exists, the server error message includes the real ID (`already exists (id: id-xxx)`). However, that real ID is **not** injected into the tempId resolution map. Subsequent operations referencing the skipped tempId fail with "Cannot find source or target."

```
# elements.json has 5 creates + 4 relationships referencing those tempIds
archicli batch apply elements.json --poll --skip-existing
# All 5 creates skipped (exist), all 4 relationships FAIL because tempIds unresolved
```

**Expected:** When an element is skipped due to `--skip-existing`, parse the existing real ID from the error and add `tempId → realId` to the resolution map so downstream ops can reference it.

---

### BUG-3: `createFolder` schema doesn't allow `tempId`
**Severity: Medium**

The help text says _"Assign tempId on **any** create op"_ and the server result includes a `"tempId": null` field for `createFolder`. However, the BOM JSON schema rejects `tempId` on `createFolder` as an additional property.

```json
{ "op": "createFolder", "name": "My Folder", "parentType": "Business", "tempId": "my-folder" }
// Fails: "must NOT have additional properties"
```

Without `tempId` support, there's no way to reference a just-created folder in a subsequent `moveToFolder` within the same BOM — you'd need two separate apply runs.

**Fix:** Add `tempId` as an optional property to the `createFolder` schema entry.

---

## UX / Design Suggestions

### UX-1: `--output text` for `health` outputs YAML, not a table
**Priority: Low**

`--output text health` produces YAML-like key-value output, which is actually the same as `--output yaml` minus the `success`/`metadata` wrapper. For CLI consumers, a short one-liner summary might be more useful in text mode:

```
OK | Archi 1.1.0 | 5 elements, 4 relationships, 2 views | uptime 5m38s
```

Currently `text` and `yaml` for `health` are nearly identical in structure.

---

### UX-2: `model query` shows `views: N` in summary but doesn't list views
**Priority: Low**

The `model query` summary counts views but doesn't include them. To see views you must run `view list` separately. Consider adding a `--show-views` flag (analogous to `--show-relationships`) or including views by default since the count is usually small.

---

### UX-3: Empty BOM applies succeed silently (exit 0)
**Priority: Low**

`batch apply empty-bom.json --poll` exits 0 with a warning in the JSON body. This is arguably correct, but an empty BOM in a CI pipeline is likely a mistake. Consider offering `--fail-on-empty` or making it exit 1 when no changes are applied (with a flag like `--allow-empty` to opt out).

---

### UX-4: `view export` without `--file` writes to a temp directory
**Priority: Low**

When `--file` is omitted, the export goes to `%TEMP%\archi_export_<name>_<ts>.png`. This works, but the path isn't discoverable unless you read the JSON output. In `--output text` mode, consider printing just the file path for easy piping:

```
archicli --output text view export <id>
# → C:\Users\...\export.png
```

---

### UX-5: Text output tables truncate IDs aggressively
**Priority: Low**

In `--output text` mode, IDs are truncated to ~14 chars (`id-5617ea06a..`). Since IDs are the primary way to reference elements in subsequent commands, this truncation makes text output less useful for scripting. Consider a `--wide` or `--no-truncate` flag.

---

### UX-6: `verify` in text mode could be friendlier
**Priority: Low**

`archicli --output text verify file.json` still outputs structured data rather than a human sentence like "✓ file.json is valid (9 operations, schema: bom)". The JSON mode is fine for CI; text mode could be more readable.

---

## What Works Well

| Feature | Verdict |
|---|---|
| **Help text** | Excellent. Every command has thorough, example-rich help. The top-level help includes workflow guidance, key concepts, and all operation types. |
| **Error handling** | Consistent `{success: false, error: {code, message}}` envelope. Proper exit code 1 on all errors. Error messages are specific and actionable. |
| **Health check** | Returns comprehensive info (server, model counts, memory, ops queue). Good first command. |
| **BOM workflow** | `verify → batch apply --poll → .ids.json` pipeline works perfectly. TempId resolution across operations within a batch is solid. |
| **idFiles system** | Declaring `idFiles` in a BOM to load previous tempId→realId mappings works correctly. Missing idFiles are detected and reported. |
| **Semantic verification** | `verify --semantic` catches tempId reference issues before apply. `--resolve-names` integration works. |
| **batch split** | Correctly splits BOMs into chunks and generates an index file with `includes`. Applying the index file correctly merges changes from all chunks. |
| **View population** | addToView + addConnectionToView workflow works. Visual IDs vs concept IDs are clearly documented and handled correctly. |
| **Output formats** | JSON (default), text (tables/key-value), and YAML all work. `--quiet` mode produces minimal output. `--verbose` shows HTTP requests. |
| **Validation** | Malformed JSON, unknown ops, missing required fields, invalid viewpoints, invalid types — all caught with clear messages. |
| **Idempotency signals** | Server rejects duplicate creates with the existing ID in the error message, enabling idempotent pipelines (if BUG-2 is fixed). |
| **--resolve-names** | Allows referencing elements by name instead of ID — powerful for human-authored BOMs. |
| **--dry-run** | Shows what would be submitted without applying. |
| **Shell completion** | PowerShell completion script generated correctly. |
| **View export** | PNG and JPEG export with configurable scale and margin. Input validation on scale/margin ranges. |
| **Notes & Groups** | createNote and createGroup on views work correctly. |
| **deleteConnectionFromView** | Works to remove individual connections from a view without deleting the underlying relationship. |
| **Folder operations** | createFolder and moveToFolder work, though tempId support is missing (BUG-3). |

---

## Test Coverage Matrix

| Command | Tested | Result |
|---|---|---|
| `health` | ✅ | Pass |
| `health` (wrong URL) | ✅ | Proper error |
| `model query` | ✅ | Pass |
| `model query --show-relationships --limit --relationship-limit` | ✅ | Pass |
| `model search --type` | ✅ | Pass |
| `model search --name` (regex) | ✅ | Pass |
| `model search --property-key/--property-value` | ✅ | Pass |
| `model search --no-relationships` | ✅ | Pass |
| `model search --strict-types` (invalid) | ✅ | Correct exit 1 |
| `model search` (invalid type, no strict) | ✅ | Warning + exit 0 |
| `model search --limit` | ✅ | Pass |
| `model search` (combined type + name) | ✅ | Pass |
| `model element <id>` | ✅ | Pass |
| `model element` (bad id) | ✅ | Proper error |
| `model apply <file>` | ✅ | Pass (duplicate rejected properly) |
| `verify <file>` | ✅ | Pass |
| `verify --semantic` | ✅ | Pass |
| `verify --preflight` (alias) | ✅ | Pass |
| `verify --resolve-names` | ✅ | Pass |
| `verify --allow-incomplete-idfiles` | ✅ | Pass |
| `verify` (malformed JSON) | ✅ | Proper error |
| `verify` (unknown op) | ✅ | Proper error |
| `verify` (missing required field) | ✅ | Proper error |
| `verify` (nonexistent file) | ✅ | Proper error |
| `batch apply --poll` | ✅ | Pass |
| `batch apply --dry-run` | ✅ | Pass |
| `batch apply --skip-existing` | ⚠️ | **BUG-2** |
| `batch apply --no-save-ids` | ✅ | Pass (no .ids.json created) |
| `batch apply --save-ids <custom path>` | ✅ | Pass |
| `batch apply --resolve-names` | ✅ | Pass |
| `batch apply` (nonexistent file) | ✅ | Proper error |
| `batch apply` (empty BOM) | ✅ | Warning + exit 0 |
| `batch apply` (BOM with bad include) | ✅ | Proper error |
| `batch apply` (BOM with idFiles) | ✅ | Pass |
| `batch split --chunk-size` | ✅ | Pass |
| `batch split --size` (deprecated) | ❌ | **BUG-1** |
| `view list` | ✅ | Pass |
| `view get <id>` | ✅ | Pass |
| `view get` (bad id) | ✅ | Proper error |
| `view create <name>` | ✅ | Pass (sync) |
| `view create --viewpoint` (valid) | ✅ | Pass |
| `view create --viewpoint` (invalid) | ✅ | Proper error |
| `view delete <id>` | ✅ | Pass |
| `view delete` (bad id) | ✅ | Proper error |
| `view export` (PNG) | ✅ | Pass |
| `view export` (JPEG) | ✅ | Pass |
| `view export --scale --margin` | ✅ | Pass |
| `view export` (bad scale) | ✅ | Proper error |
| `view export` (bad margin) | ✅ | Proper error |
| `view export` (no --file) | ✅ | Temp path used |
| `view export` (bad id) | ✅ | Proper error |
| `ops list` | ✅ | Pass |
| `ops list --status --limit` | ✅ | Pass |
| `ops status <id>` | ✅ | Pass |
| `ops status` (bad id) | ✅ | Proper error |
| `completion pwsh` | ✅ | Pass |
| `completion` (invalid shell) | ✅ | Proper error |
| `--output json` | ✅ | Default, works |
| `--output text` | ✅ | Tables + key-value |
| `--output yaml` | ✅ | Works |
| `--quiet` | ✅ | Minimal output |
| `--verbose` | ✅ | Shows HTTP log |
| `--base-url` | ✅ | Works |
| `ARCHI_BASE_URL` env | ✅ | Works (error on bad URL) |
| `--version` | ✅ | 0.1.0 |
| No arguments | ✅ | Shows help |
| Unknown subcommand | ✅ | Proper error |
| Missing required args | ✅ | Proper error |

### BOM Operations Tested

| Op | Tested | Result |
|---|---|---|
| createElement | ✅ | Pass |
| createRelationship | ✅ | Pass |
| updateElement | ✅ | Pass |
| updateRelationship | ✅ | Pass |
| deleteElement | ✅ | Pass |
| deleteRelationship | ✅ | Pass |
| setProperty | ✅ | Pass |
| createView | ✅ | Pass (via BOM) |
| deleteView | ✅ | Pass (via BOM) |
| createFolder | ⚠️ | Works, but no tempId support (BUG-3) |
| moveToFolder | ✅ | Pass |
| addToView | ✅ | Pass |
| addConnectionToView | ✅ | Pass |
| deleteConnectionFromView | ✅ | Pass |
| moveViewObject | ✅ | Pass |
| styleViewObject | ✅ | Pass |
| styleConnection | ✅ | Pass |
| createNote | ✅ | Pass |
| createGroup | ✅ | Pass |

---

## Prioritized Action Items

1. **BUG-2 (High):** Fix `--skip-existing` to propagate existing IDs into tempId map
2. **BUG-1 (Medium):** Fix `--size` deprecated alias to actually pass through the value
3. **BUG-3 (Medium):** Add `tempId` to `createFolder` BOM schema
4. **UX-5 (Low):** Add `--wide`/`--no-truncate` flag for text output tables
5. **UX-1 (Low):** Make `--output text health` more concise/distinct from yaml
6. **UX-2 (Low):** Add view listing to `model query`
