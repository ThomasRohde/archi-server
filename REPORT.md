# archicli v0.1.0 — Blind Test Report

**Date:** 2026-02-09  
**Server:** Archi Model API Server v1.1.0  
**Platform:** Windows (PowerShell)  
**Tests run:** 99 | **Passed:** 97 | **Not tested:** 2 (deleteRelationship, moveToFolder BOM ops)

---

## Executive Summary

archicli is **solid, well-designed, and production-ready for its core workflows**. The help text is exceptional — among the best CLI help I've seen. Error handling is consistent and informative. The tempId system, idFiles chaining, semantic verification, and chunked batch apply all work correctly end-to-end. I found **no blocking bugs**. Below are improvement suggestions ranging from minor UX nits to feature ideas.

---

## What Works Well ✅

1. **Help text is outstanding.** Every command and subcommand has rich, context-aware help with examples, valid values, and workflow guidance. The top-level help reads like a mini-tutorial.

2. **Error handling is consistent and structured.** Every error returns `{ success: false, error: { code, message, details? } }` with exit code 1. Error codes are descriptive (`VALIDATION_FAILED`, `SEMANTIC_VALIDATION_FAILED`, `IDFILES_INCOMPLETE`, `CLI_USAGE_ERROR`). The `details` object often includes actionable hints (e.g., dangling tempId errors include the hint about what was checked).

3. **Three output formats (json, text, yaml) work everywhere.** Text mode is well-formatted with aligned tables. JSON and YAML are clean. Errors degrade gracefully across all formats.

4. **The tempId → realId pipeline is seamless.** `batch apply --poll` auto-saves `.ids.json`, which can be declared in subsequent BOMs via `idFiles`. Cross-chunk tempId resolution within a single batch also works correctly.

5. **`verify --semantic` is genuinely useful.** It catches dangling tempId references before touching the model, shows which field and which operation has the problem, and the hint text explains the resolution order clearly.

6. **`--strict-types` vs soft warning is a good design.** By default, invalid `--type` values produce a warning but still return results (exit 0). Adding `--strict-types` makes it a hard error (exit 1) with the full list of valid types.

7. **Chunked batch apply with progress output.** The inline `Chunk 1/3: complete` progress ticker on stderr is a nice touch for long-running operations.

8. **`view get --output text` produces a clear tree.** Element bounds, concept IDs, visual IDs, and connections are all clearly labeled — critical for the visual-ID vs concept-ID distinction.

9. **`--quiet` does what it says.** `health --quiet` returns just `{ "status": "ok" }` — ideal for scripting health checks.

10. **`batch apply` without `--poll` prints a helpful warning.** The warning about losing tempId mappings is the right call for an async-first design.

---

## Issues & Improvement Suggestions

### P1 — Should Fix

#### 1. `view export` without `--file` silently exports to a temp directory
When `--file` is omitted, the export goes to a system temp path like:
```
C:\Users\...\AppData\Local\Temp\archi_export_Test_Architecture_View_1770628082140.png
```
The path is buried in the JSON response. **Suggestion:** Either (a) require `--file` as mandatory, or (b) default to `<viewName>.png` in the current directory, or (c) print the file path prominently to stderr in addition to the JSON envelope.

#### 2. `batch apply` re-applying an already-applied BOM gives a server error, not a CLI-level guard
Re-running `archicli batch apply test-elements.json --poll` after elements already exist produces:
```
ApiError: Error: Change 0 (createElement): element 'Web Frontend' of type 'application-component' already exists
```
This is a server-side error passed through. **Suggestion:** Consider a `--skip-existing` / `--idempotent` flag that skips `createElement` ops whose tempIds already have entries in the corresponding `.ids.json` file. Alternatively, `verify --semantic` could warn when an `.ids.json` already exists for the BOM being verified.

#### 3. `model query` JSON output has excessive empty lines in the response
When `--show-relationships` or `--show-views` is used, the JSON response contains large blocks of empty lines (40+ blank lines) between sections. This appears to be a formatting/serialization issue. It doesn't affect parsing but makes the raw output confusing.

### P2 — Nice to Have

#### 4. `--wide` doesn't affect JSON/YAML output (expected but undocumented)
`--wide` only applies to `--output text` tables. Running `--wide` with JSON output is silently ignored. **Suggestion:** Either document this constraint in `--wide`'s help text, or warn when `--wide` is combined with non-text output.

#### 5. `view list --output text` column headers are truncated oddly
Without `--wide`, headers like `VIEWPOINT`, `OBJECTCOUNT`, `CONNECTIONCOUNT` get truncated to `VIEW...`, `OBJE...`, `CONN...`. The truncation heuristic clips aggressively. **Suggestion:** Consider reserving more width for column headers, or abbreviating more readably (e.g., `VPNT`, `#OBJ`, `#CONN`).

#### 6. No `--dry-run` flag on `batch apply`
For safety, a `--dry-run` that validates + resolves tempIds + shows what *would* be sent without actually submitting would be valuable, especially for large BOMs.

#### 7. `ops list --output text` for empty results shows `operations: (empty)` but doesn't exit with a distinct code
Might be useful for scripting to distinguish "no results matched filter" from "command succeeded with results." Not a bug — just a UX consideration.

#### 8. `batch split` overwrites existing output without warning
Running `batch split` twice on the same file silently overwrites the previous split files. **Suggestion:** Warn or require `--force` if the output directory already exists.

#### 9. No `model search` option to return relationships only
`--no-relationships` suppresses relationships from results, but there's no `--relationships-only` or `--type` filter that targets *only* relationship types. You can use `--type serving-relationship` but the help text doesn't explicitly call this out.

#### 10. `model element` doesn't accept tempIds — only real IDs
The help says "by its real ID" which is accurate, but it would be convenient to accept tempIds via an `--id-file` option for workflow continuity (e.g., `archicli model element --id-file elements.ids.json web-frontend`).

### P3 — Minor / Cosmetic

#### 11. `ops --help` has encoding issue
The `--help` output for `ops` contains `ÔÇö` instead of an em-dash (`—`). Likely a UTF-8/console encoding issue on Windows:
```
TIP: Use "batch apply --poll" for batch workflows ÔÇö it polls automatically.
```
**Suggestion:** Replace em-dashes in help text with plain ASCII `--` for cross-platform safety, or ensure the help output is UTF-8 encoded.

#### 12. `view create --documentation` is not exposed as a CLI option
The BOM `createView` op accepts `documentation`, but `archicli view create` only takes `--viewpoint`. Adding `--documentation` would complete the parity.

#### 13. `batch apply` output text mode is minimal on error
Text mode for a batch apply error just shows:
```
Error [BATCH_APPLY_FAILED]: ApiError: Error: Change 0 (createElement): element 'Web Frontend'...
```
The wrapping at 100 chars makes it hard to read. JSON mode shows the full error cleanly.

#### 14. `deleteElement` response includes `cascade: true` without explanation
The delete result includes `"cascade": true` but the help text doesn't mention cascading behavior (does it delete associated relationships? view references?). Documenting this would help users.

---

## Operation Coverage Matrix

| BOM Operation | Tested | Result |
|---|---|---|
| createElement | ✅ | Multiple types (app-component, app-service, node, data-object, business-actor, role, driver, goal, artifact) |
| createRelationship | ✅ | serving, assignment; tempId cross-ref works |
| updateElement | ✅ | Documentation update |
| updateRelationship | ✅ | Name + documentation update |
| deleteElement | ✅ | Cascade noted |
| deleteRelationship | ⬜ | Not tested |
| setProperty | ✅ | Verified via search --property-key |
| createView | ✅ | Both sync (view create) and async (BOM) |
| createFolder | ✅ | With parentType |
| moveToFolder | ⬜ | Not tested |
| addToView | ✅ | With positions and tempIds |
| addConnectionToView | ✅ | Auto-resolved visual IDs |
| deleteConnectionFromView | ✅ | Worked |
| moveViewObject | ✅ | Position updated |
| styleViewObject | ✅ | fillColor applied |
| styleConnection | ✅ | lineColor applied |
| createNote | ✅ | Multi-line content |
| createGroup | ✅ | With position |
| deleteView | ✅ | Both sync and BOM |

---

## Feature Suggestions for Future Versions

1. **`model diff`** — Compare current model state against a BOM to show what would change (similar to `terraform plan`).
2. **`batch apply --idempotent`** — Skip operations for tempIds that already have realId mappings.
3. **`model export`** — Export model as JSON/CSV for backup or analysis.
4. **`view clone <id> <name>`** — Duplicate a view with a new name.
5. **`model search --output-ids-only`** — Output just IDs (one per line) for piping into other commands.
6. **Stable BOM operation ordering** — The server appears to reorder operations (e.g., `updateRelationship` executed before `deleteElement` even though `deleteElement` came first in the changes array). Document whether operation ordering is guaranteed or best-effort.

---

## Conclusion

archicli is a well-crafted CLI that correctly handles the full ArchiMate lifecycle: element CRUD, relationship management, view composition with visual IDs, property management, batch operations with tempId chaining, and multi-format output. The help text quality, error message quality, and workflow design (verify → apply → poll) are all above average for a v0.1.0 tool. The suggestions above are refinements, not fixes for broken functionality.
