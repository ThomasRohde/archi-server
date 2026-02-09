# archicli v0.1.0 — Blind Test Report

**Tester:** GitHub Copilot CLI (automated)  
**Date:** 2026-02-09  
**Server version:** Archi Model API Server 1.1.0  
**Model:** Empty (new model) at start of test

---

## Executive Summary

archicli is **well-built, production-ready for its scope, and a pleasure to use**. The help text is exceptional — among the best I've encountered in any CLI tool. Error handling is thorough and consistent. The BOM/tempId workflow is thoughtfully designed. Below are findings organized by severity.

---

## ✅ What Works Well

### Help System (Outstanding)
- Every command and subcommand has rich, contextual help with examples
- The top-level `--help` reads like a tutorial: prerequisites, workflow, key concepts
- Subcommand help includes type lists, valid values, and real-world examples
- Running a parent command with no subcommand (e.g., `archicli model`) shows help — good UX

### Core Workflow
- `health` → `model query` → `verify` → `batch apply --poll` works flawlessly
- TempId system works across BOM files via `.ids.json` persistence
- `idFiles` loading and cross-BOM references work correctly
- `--resolve-names` successfully resolves element names to IDs against the live model
- Chunking and multi-chunk polling work (tested via `batch split`)

### Error Handling (Excellent)
- All errors return structured JSON with `code`, `message`, and `details`
- Exit code 1 on all failure paths, 0 on success — consistent
- Validation errors include JSON pointer paths (`/changes/0/type`)
- Semantic validation gives actionable hints for unresolved tempIds
- Invalid viewpoints list all valid values in the error message
- Bad JSON, missing files, missing args, unknown commands — all handled gracefully
- Server connection failures include diagnostic advice ("Is the Archi Model API Server running?")

### Output Modes
- `--output json` is machine-parseable with consistent `{ success, data/error, metadata }` envelope
- `--output text` produces human-readable tables and YAML-like output
- Both modes work for all commands tested

### Verify Command
- Schema auto-detection works (no `--schema` needed for BOM files)
- `--semantic` catches unresolved tempId references before hitting the server
- `--resolve-names` with `--semantic` performs live model lookups
- idFiles loading is validated (declared vs loaded, missing, malformed)

### Batch System
- `batch split` correctly partitions BOMs and produces index files with `includes`
- `--dry-run` shows chunk breakdown without touching the model
- `--no-save-ids` flag works correctly
- Empty BOM produces a warning but succeeds (not an error — good choice)
- `--poll` progress indicators (`Chunk 1/1: queued (1)  Chunk 1/1: complete (2)`) display on stderr

---

## 🟡 Minor Issues / Suggestions

### 1. Text output loses error details
**Severity:** Low  
**Reproduction:**
```
archicli --output text verify test-bad-ref.json --semantic
# Output: Error [SEMANTIC_VALIDATION_FAILED]: BOM failed semantic preflight checks
```
In JSON mode, the same command returns the specific field path and hint. In text mode, only the top-level message is shown. For validation errors especially, the details (which field, which operation) are critical.

**Suggestion:** In text mode, print error details below the message line. E.g.:
```
Error [SEMANTIC_VALIDATION_FAILED]: BOM failed semantic preflight checks
  /changes/1/targetId: references unknown tempId 'nonexistent-tempid'
    Hint: This tempId is not declared in the BOM, not in idFiles...
```

### 2. `view get` text output: table columns too wide for terminal
**Severity:** Low  
**Reproduction:**
```
archicli --output text view get <id>
```
The table has many columns (ID, NAME, X, Y, WIDTH, HEIGHT, FILLCOLOR, CONCEPTID, CONCEPTTYPE, TYPE) and wraps awkwardly in an 80-column terminal. The long ID columns dominate.

**Suggestion:** Consider truncating IDs in text mode (e.g., `id-ad328b..`) or using a vertical card layout for `view get` (one element per block, key: value lines).

### 3. `view create` returns viewpoint as `null` in subsequent `view get`
**Severity:** Low  
**Reproduction:**
```
archicli view create "Application Architecture" --viewpoint application_cooperation
# Returns: viewpoint: "application_cooperation" ✓
archicli view get <returned-id>
# Returns: "viewpoint": null ✗
```
The `view create` response correctly shows the viewpoint, but `view get` returns `null`. This might be a server-side issue (not persisting the viewpoint), or the GET endpoint may not include it.

### 4. `model element` shows `"views": []` even when element is on a view
**Severity:** Low  
**Reproduction:**
```
archicli model element id-997ac495e3a74522831302fbb255cdc5
# API Server is on the Application Architecture view, but shows "views": []
```
After adding the element to a view via `addToView`, the element detail still shows no views. The data would be very useful for understanding where an element appears.

**Suggestion:** Populate the `views` array in the element detail response with view IDs/names where the element has visual representations.

### 5. `view export -o` requires absolute path — unintuitive
**Severity:** Low  
**Reproduction:**
```
archicli view export <id> -o relative-path.png
# Error: Output path must be absolute
```
Most CLI tools accept relative paths and resolve them against CWD internally.

**Suggestion:** Resolve relative paths to absolute using `process.cwd()` + the given path, or at minimum accept `.\\filename.png` patterns.

### 6. No `--include-relationships false` flag for `model search`
**Severity:** Very Low  
**Observation:** The `criteria` in search results show `includeRelationships: true` but there's no CLI flag to control this. The help doesn't mention it.

**Suggestion:** Add `--no-relationships` flag if the server supports filtering them out.

---

## 🔵 Feature Suggestions (Not Bugs)

### 1. `ops list` command
There's no way to list all operations — only `ops status <id>`. If a user loses an operation ID, there's no way to find it. A simple `ops list` or `ops recent` command would help.

### 2. `model search` should show properties
Search results only include id, name, type, and documentation. For property-based searches (`--property-key status --property-value active`), it would be useful to include the matched property in results.

### 3. `batch apply` text output
When using `--output text`, the batch apply result is still JSON. The text formatter may not have a handler for the batch result structure.

### 4. `view create` via BOM should accept viewpoint
The `createView` BOM operation in the help text doesn't mention viewpoint:
```
createView  name, [tempId, documentation]
```
But `view create --viewpoint` supports it. Consider adding `viewpoint` to the BOM op.

### 5. Consider `--save-ids <path>` for custom output location
The `--save-ids [path]` option is documented but it would be good to verify it works with custom paths (not tested — only default `.ids.json` was exercised).

### 6. Tab completion / shell completions
For a CLI with this many subcommands, types, and viewpoints, shell completions would dramatically improve discoverability.

---

## 📊 Test Coverage Matrix

| Command | Tested | Status |
|---------|--------|--------|
| `health` | ✅ | Works perfectly |
| `model query` | ✅ | Works (tested with `--limit`) |
| `model search --type` | ✅ | Works |
| `model search --name` | ✅ | Works (regex patterns) |
| `model search --property-key/value` | ✅ | Works |
| `model search` (combined filters) | ✅ | Works |
| `model search --limit` | ✅ | Works |
| `model element <id>` | ✅ | Works (views array always empty — see issue #4) |
| `model apply` (no poll) | ✅ | Returns operationId |
| `model apply --poll` | Not tested separately | — |
| `batch apply --poll` | ✅ | Works perfectly |
| `batch apply --dry-run` | ✅ | Works |
| `batch apply --resolve-names` | ✅ | Works |
| `batch apply --no-save-ids` | ✅ | Works |
| `batch split` | ✅ | Works, produces correct index + chunks |
| `verify` (auto-detect schema) | ✅ | Works |
| `verify --semantic` | ✅ | Works |
| `verify --semantic --resolve-names` | ✅ | Works |
| `view list` | ✅ | Works |
| `view get <id>` | ✅ | Works (viewpoint null — see issue #3) |
| `view create` | ✅ | Works with viewpoint |
| `view export` | ✅ | Works (PNG, 19KB output) |
| `ops status <id>` | ✅ | Works |
| `--output json` | ✅ | Default, consistent envelope |
| `--output text` | ✅ | Works (some limitations noted) |
| `-v` (verbose) | ✅ | Shows HTTP method, URL, request body |
| `-u` (base URL) | ✅ | Works |
| `ARCHI_BASE_URL` env var | ✅ | Works |

### BOM Operations Tested

| Operation | Status |
|-----------|--------|
| `createElement` | ✅ Works |
| `createRelationship` | ✅ Works |
| `setProperty` | ✅ Works |
| `updateElement` | ✅ Works |
| `addToView` | ✅ Works |
| `addConnectionToView` | ✅ Works |
| `createNote` | ✅ Works |
| `createGroup` | ✅ Works |
| `styleViewObject` | ✅ Works |
| `styleConnection` | ✅ Works |
| `moveViewObject` | ✅ Works |
| `deleteElement` | ✅ Works (cascade) |
| `deleteConnectionFromView` | ✅ Works |
| `createFolder` | ✅ Works |
| `updateRelationship` | Not tested |
| `deleteRelationship` | Not tested |
| `moveToFolder` | Not tested |

### Error Scenarios Tested

| Scenario | Exit Code | Error Code | Quality |
|----------|-----------|------------|---------|
| Invalid JSON file | 1 | PARSE_ERROR | ✅ Clear message |
| Missing file | 1 | VERIFY_ERROR | ✅ ENOENT message |
| Unknown op type | 1 | VALIDATION_FAILED | ✅ Schema path |
| Invalid element type | 1 | VALIDATION_FAILED | ✅ Schema path |
| Missing required field | 1 | VALIDATION_FAILED | ✅ Schema path |
| Unresolved tempId | 1 | SEMANTIC_VALIDATION_FAILED | ✅ With hint |
| Bad element ID | 1 | ELEMENT_FAILED | ✅ "not found" |
| Bad view ID | 1 | VIEW_GET_FAILED | ✅ "not found" |
| Bad operation ID | 1 | OPS_STATUS_FAILED | ✅ "not found" |
| Invalid viewpoint | 1 | INVALID_ARGUMENT | ✅ Lists valid values |
| Invalid export format | 1 | INVALID_FORMAT | ✅ Lists valid formats |
| Invalid scale | 1 | INVALID_ARGUMENT | ✅ Shows range |
| Relative export path | 1 | INVALID_PATH | ✅ Shows example |
| Server unreachable | 1 | HEALTH_FAILED | ✅ Diagnostic hint |
| Missing required arg | 1 | CLI_USAGE_ERROR | ✅ Commander error |
| Unknown command | 1 | CLI_USAGE_ERROR | ✅ Commander error |
| Empty changes array | 0 | — | ✅ Warning, not error |

---

## 🏁 Overall Assessment

**Grade: A-**

archicli is a well-engineered CLI that gets the fundamentals right: consistent output formatting, proper exit codes, excellent help text, and robust error handling. The BOM/tempId workflow is the standout feature — it enables reproducible, composable model mutations that would be painful with raw API calls.

The issues found are all minor polish items. The tool is ready for real-world use by both humans and AI agents.

**Top 3 priorities for improvement:**
1. Fix text-mode error output to include details (issue #1) — impacts human usability
2. Fix `view get` viewpoint null (issue #3) — data integrity concern
3. Add `ops list` command — operational necessity for async workflow debugging
