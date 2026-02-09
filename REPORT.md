# archicli v0.1.0 — Blind Test Report

**Date:** 2026-02-09
**Tester:** Claude (automated blind test)
**Server:** Archi Model API Server v1.1.0 on `http://127.0.0.1:8765`
**Platform:** Windows (win32)

---

## Executive Summary

archicli is a well-designed CLI for programmatic ArchiMate model management. The core workflow (health → query → verify → batch apply → poll) works end-to-end. Help text is excellent — among the best I've seen for a CLI tool. The BOM system with tempIds, idFiles, includes, and chunking is thoughtfully engineered.

**Overall assessment:** Solid foundation with strong ergonomics. The bugs found are all in the "polish" category rather than core correctness. The primary areas for improvement are input validation gaps and text output formatting.

---

## Bugs

### BUG-1: `[object Object]` in `--output text` mode (multiple locations)

**Severity:** Medium
**Reproducers:**

```bash
# ops status text output shows "[object Object]" for the element field
archicli ops status <opId> --output text
# Shows: createElement  it-dept  id-...  IT Department  business-actor  [object Object]

# batch apply text output shows "[object Object]" for the result column
archicli batch apply file.json --poll --output text
# Shows: 1  1  op_...  complete  [object Object]  2026-...
```

**Root cause:** The text formatter (likely in `src/utils/output.ts`) doesn't handle nested objects/arrays when rendering table columns. It falls back to JS default `toString()` which produces `[object Object]`.

**Fix:** Either recursively format nested objects, omit them from text tables, or show a summary (e.g., "3 operations" instead of the full result array).

---

### BUG-2: `--chunk-size 0` silently falls back to default (100)

**Severity:** Low
**Reproducer:**

```bash
archicli batch apply file.json --dry-run --chunk-size 0
# Reports chunkSize: 100 with no warning
```

**Expected:** An error like `--chunk-size must be a positive integer, got '0'` (similar to the `--limit 0` validation that `model query` already implements).

---

### BUG-3: `--chunk-size` negative values silently clamped

**Severity:** Low
**Reproducer:**

```bash
archicli batch apply file.json --dry-run --chunk-size -1
# Reports chunkSize: 1 (clamped to minimum) with no warning
```

**Expected:** An error for invalid values. The `--limit` option on `model query` correctly rejects `0` with a clear error.

---

### BUG-4: `view export --scale` accepts values outside documented range

**Severity:** Low
**Reproducer:**

```bash
archicli view export <viewId> --scale 10
# Succeeds. Help says valid range is "0.5 to 4"
```

**Expected:** Reject values outside 0.5–4 with an error, or update the help text to reflect the actual accepted range.

---

### BUG-5: `view create --viewpoint` accepts arbitrary strings

**Severity:** Low
**Reproducer:**

```bash
archicli view create "Test" --viewpoint totally_made_up
# Succeeds with viewpoint: "totally_made_up"
```

**Expected:** Validate against known ArchiMate viewpoints (like `model search --type` validates and warns for unknown types), or at minimum show a warning.

---

### BUG-6: Semantic verify (`--semantic`) misses dangling tempId references

**Severity:** Medium
**Reproducer:**

```bash
# Create a BOM referencing nonexistent tempIds
cat > bad-refs.json << 'EOF'
{
  "version": "1.0",
  "changes": [
    {
      "op": "createRelationship",
      "type": "serving-relationship",
      "sourceId": "nonexistent-source",
      "targetId": "nonexistent-target",
      "tempId": "bad-rel"
    }
  ]
}
EOF

archicli verify bad-refs.json --semantic
# Reports valid: true, semantic: true

archicli batch apply bad-refs.json --poll
# Fails: "Cannot find source or target for relationship"
```

**Expected:** `--semantic` should detect that `nonexistent-source` and `nonexistent-target` are neither defined as tempIds earlier in the BOM, nor present in any loaded idFiles, nor valid real IDs (id-xxx format). The whole point of `--semantic` / `--preflight` is to catch these before hitting the server.

---

### BUG-7: `verify` does not validate `includes` file paths exist

**Severity:** Low
**Reproducer:**

```bash
cat > bad-include.json << 'EOF'
{
  "version": "1.0",
  "includes": ["nonexistent-part.json"]
}
EOF

archicli verify bad-include.json
# Reports valid: true

archicli batch apply bad-include.json --poll
# Fails: ENOENT: no such file or directory
```

**Expected:** `verify` should check that referenced include files exist on disk.

---

## Inconsistencies

### INC-1: Error format inconsistency

Some errors use the JSON envelope format:
```json
{
  "success": false,
  "error": { "code": "HEALTH_FAILED", "message": "..." },
  "metadata": { "timestamp": "..." }
}
```

Others use plain text (Commander.js defaults):
```
error: missing required argument 'id'
unknown command 'boguscommand'
Unknown output format 'yaml'. Valid formats: json, text
```

**Recommendation:** Wrap all errors in the same JSON envelope format (when `--output json` is active) for consistent machine parsing. At minimum, ensure Commander.js errors produce the same structure.

---

### INC-2: Warning placement varies

Warnings sometimes appear as:
1. A `warning` field inside `data` (e.g., `model search` with unknown type)
2. A separate line on stderr before the JSON (e.g., `model search --property-value` without `--property-key`)

**Recommendation:** Standardize. Prefer including warnings in the JSON `data.warning` field and optionally printing to stderr for human visibility — but be consistent.

---

## Suggestions

### SUG-1: Text output tables overflow with long values

Long element names or documentation strings produce very wide tables in `--output text` mode that overflow terminal width.

**Recommendation:** Truncate long values (e.g., 50 chars with `...`) in table mode, or support `--wrap` / `--truncate` options.

---

### SUG-2: Extra/unknown fields in BOM silently accepted

```bash
# This passes verification:
{ "version": "1.0", "randomExtraField": true, "changes": [
  { "op": "createElement", "type": "goal", "name": "X", "extraProp": "ignored" }
]}
```

**Recommendation:** The BOM schema should use `additionalProperties: false` to reject unknown fields, or at minimum issue a warning. Silently ignoring extra fields can mask typos (e.g., `documention` instead of `documentation`).

---

### SUG-3: `model query` could show relationship count in element list

Currently `model query` returns elements but not relationships. A `--include-relationships` flag or a summary of relationship types would make the first-look overview more useful.

---

### SUG-4: Auto-detect schema for `verify` could hint at fixes

When auto-detection fails (e.g., missing `version` field), the error says:
```
Could not auto-detect schema. Use --schema to specify one of: bom
```

It could add: `"Hint: BOM files require a top-level 'version' field for auto-detection."`

---

### SUG-5: `batch apply` without `--poll` should warn by default

Since nearly every use case requires `--poll` (for tempId resolution, ID mapping, and confirmation), omitting it is almost always a mistake. Consider making `--poll` the default and requiring `--no-poll` to opt out, or at minimum printing a warning.

---

### SUG-6: `view create` could list valid viewpoints in help

The `model search --help` helpfully lists all valid ArchiMate element and relationship types. `view create --help` only says `"ArchiMate viewpoint (e.g. application_cooperation)"` without listing valid options.

---

### SUG-7: Missing `ops list` command

There is `ops status <opId>` to check a single operation, but no way to list all operations. This would be useful for:
- Debugging what happened in a session
- Finding lost operation IDs
- Monitoring overall queue state (beyond what `health` provides)

---

## What Works Well

1. **Help text quality** — Best-in-class. The main help, every subcommand, and inline documentation are thorough with practical examples. The "KEY CONCEPTS" section in the top-level help is particularly well done.

2. **BOM / tempId system** — The tempId → realId flow with automatic .ids.json persistence, cross-BOM `idFiles` referencing, and cross-chunk resolution is elegant and well thought out.

3. **Consistent JSON envelope** — `{ success, data, metadata }` makes programmatic consumption straightforward (aside from INC-1 edge cases).

4. **`--dry-run` mode** — Excellent for CI/CD pipelines and debugging BOM structure before mutating the model.

5. **`batch split`** — Smart utility for managing large change sets in version control.

6. **`--resolve-names`** — Allows natural references to existing elements by name rather than requiring ID lookups. Well-integrated fallback.

7. **Error messages from the server** — Clear and actionable (e.g., "Element not found", "Cannot find source or target for relationship").

8. **Exit codes** — Consistently 0 for success and 1 for failure. Correct for scripting.

9. **Verbose mode** — `--verbose` shows the HTTP request being made, useful for debugging.

10. **Unicode support** — Element names with non-ASCII characters work correctly.

11. **Warning for unknown types** — `model search --type bogus-type` warns without erroring, which is reasonable for forward-compatibility.

12. **Empty model handling** — All query/search commands gracefully handle an empty model with zero results rather than erroring.

---

## Test Coverage Matrix

| Command | Tested | Works | Issues |
|---------|--------|-------|--------|
| `health` | Yes | Yes | — |
| `health --verbose` | Yes | Yes | — |
| `health --base-url <wrong>` | Yes | Yes | Good error |
| `health --output text` | Yes | Yes | — |
| `model query` | Yes | Yes | — |
| `model query --limit N` | Yes | Yes | — |
| `model query --limit 0` | Yes | Yes | Good error |
| `model query --output text` | Yes | Yes | — |
| `model search` (no filters) | Yes | Yes | — |
| `model search --type` | Yes | Yes | — |
| `model search --type <invalid>` | Yes | Yes | Warning |
| `model search --name` (regex) | Yes | Yes | — |
| `model search --property-key` | Yes | Yes | — |
| `model search --property-key --property-value` | Yes | Yes | — |
| `model search --property-value` (no key) | Yes | Yes | Warning |
| `model search --type + --name` (combined) | Yes | Yes | — |
| `model search --output text` | Yes | Yes | Wide tables |
| `model element <id>` | Yes | Yes | — |
| `model element <id> --output text` | Yes | Yes | — |
| `model element <nonexistent>` | Yes | Yes | Good error |
| `model apply <file>` (no --poll) | Yes | Yes | — |
| `model apply <file> --poll` | N/A | — | — |
| `verify <file>` | Yes | Yes | — |
| `verify <file> --schema bom` | Yes | Yes | — |
| `verify <file> --semantic` | Yes | Partial | BUG-6 |
| `verify <file> --preflight` | Yes | Yes | — |
| `verify <bad-json>` | Yes | Yes | Good error |
| `verify <missing-fields>` | Yes | Yes | Good error |
| `verify <unknown-op>` | Yes | Yes | Good error |
| `verify <nonexistent>` | Yes | Yes | Good error |
| `verify <missing-include>` | Yes | Partial | BUG-7 |
| `batch apply --poll` | Yes | Yes | — |
| `batch apply --dry-run` | Yes | Yes | — |
| `batch apply --chunk-size` | Yes | Partial | BUG-2, BUG-3 |
| `batch apply --no-save-ids` | Yes | Yes | — |
| `batch apply --save-ids <path>` | Yes | Yes | — |
| `batch apply --resolve-names` | Yes | Yes | — |
| `batch apply --output text` | Yes | Partial | BUG-1 |
| `batch apply <empty-changes>` | Yes | Yes | Good warning |
| `batch apply <nonexistent>` | Yes | Yes | Good error |
| `batch apply <bad-refs>` | Yes | Yes | Good error |
| `batch apply <includes>` | Yes | Yes | — |
| `batch split` | Yes | Yes | — |
| `batch split --size N` | Yes | Yes | — |
| `view list` | Yes | Yes | — |
| `view list --output text` | Yes | Yes | — |
| `view get <id>` | Yes | Yes | — |
| `view get <id> --output text` | Yes | Yes | — |
| `view get <nonexistent>` | Yes | Yes | Good error |
| `view create <name>` | Yes | Yes | — |
| `view create "" (empty)` | Yes | Yes | Good error |
| `view create --viewpoint <valid>` | Yes | Yes | — |
| `view create --viewpoint <invalid>` | Yes | Partial | BUG-5 |
| `view create (unicode name)` | Yes | Yes | — |
| `view export --format PNG` | Yes | Yes | — |
| `view export --format JPEG` | Yes | Yes | — |
| `view export --format GIF` | Yes | Yes | Good error |
| `view export --file <path>` | Yes | Yes | — |
| `view export --scale` | Yes | Partial | BUG-4 |
| `view export (temp file)` | Yes | Yes | — |
| `ops status <opId>` | Yes | Yes | — |
| `ops status <opId> --poll` | Yes | Yes | — |
| `ops status <opId> --output text` | Yes | Partial | BUG-1 |
| `ops status <nonexistent>` | Yes | Yes | Good error |
| `--version` | Yes | Yes | — |
| `--help` | Yes | Yes | — |
| `<unknown-command>` | Yes | Yes | INC-1 |
| env `ARCHI_BASE_URL` | Yes | Yes | — |

---

## BOM Operations Tested

| Operation | Tested | Works |
|-----------|--------|-------|
| createElement | Yes | Yes |
| createRelationship | Yes | Yes |
| updateElement | Yes | Yes |
| updateRelationship | Yes | Yes |
| deleteElement | Yes | Yes |
| deleteRelationship | Yes | Yes |
| setProperty | Yes | Yes |
| createView (via BOM) | N/T | — |
| createFolder | Yes | Yes |
| moveToFolder | N/T | — |
| addToView | Yes | Yes |
| addConnectionToView | Yes | Yes |
| deleteConnectionFromView | Yes | Yes |
| moveViewObject | Yes | Yes |
| styleViewObject | Yes | Yes |
| styleConnection | Yes | Yes |
| createNote | Yes | Yes |
| createGroup | Yes | Yes |

N/T = not tested in this session.

---

## Priority Ranking

If addressing these in order:

1. **BUG-6** (semantic verify misses dangling refs) — Defeats the purpose of `--semantic`
2. **BUG-1** (`[object Object]` in text output) — Visible to every text-mode user
3. **INC-1** (inconsistent error format) — Breaks scripts parsing JSON output
4. **SUG-2** (reject unknown BOM fields) — Prevents typo-based silent failures
5. **BUG-7** (verify doesn't check includes) — Easy fix, prevents runtime surprises
6. **SUG-5** (`--poll` should be default) — Reduces foot-gun surface
7. **BUG-2/3** (chunk-size validation) — Consistency with existing --limit validation
8. **BUG-4/5** (scale/viewpoint validation) — Minor polish
9. **SUG-1** (text table overflow) — UX polish
10. **SUG-6/7** (viewpoint list, ops list) — Feature additions
