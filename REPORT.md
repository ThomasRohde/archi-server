# archicli v0.1.0 — Blind Test Report

**Date:** 2026-02-08
**Tester:** Claude (automated blind test)
**Server:** Archi Model API Server v1.1.0 on http://127.0.0.1:8765
**Model:** Fresh (new model), exercised from empty through full CRUD lifecycle

---

## Executive Summary

archicli is well-designed with excellent help text, a solid BOM/tempId abstraction, and good error messages. The core happy path — create elements, create views, populate views — works correctly. However, there are several bugs that break key workflows, particularly around the tempId persistence pipeline and delete operations.

---

## Bugs — Critical

### 1. `createView` tempIds are NOT saved to `.ids.json`

**Impact:** Breaks the recommended multi-BOM workflow entirely.

When `batch apply --poll` completes, tempId-to-realId mappings are saved to `<file>.ids.json`. However, `createView` results use a `viewId` field (not `realId`), and the id-map logic doesn't extract it. This means a view created in `step1.json` cannot be referenced by tempId in `step2.json`.

**Repro:**
```
# views.json creates a view with tempId "app-view"
archicli batch apply views.json --poll
# views.ids.json does NOT contain "app-view" → missing mapping
# updates.json references "app-view" via idFiles → "Cannot find view: app-view"
```

**Note:** `addToView` visual IDs (`visualId` field) ARE saved correctly. Only `createView` and likely `createNote`/`createGroup` (which use `noteId`/`groupId`) are affected.

**Fix:** The id-map extraction should also check for `viewId`, `noteId`, and `groupId` fields, not just `realId` and `visualId`.

---

### 2. `-v` flag conflict: global `--verbose` shadows `model search --property-value`

**Impact:** Impossible to use the `-v` shorthand for property-value search.

The global `-v, --verbose` flag takes precedence over the subcommand's `-v, --property-value` flag. Running `archicli model search -v production` activates verbose HTTP logging and silently ignores the property value.

**Repro:**
```bash
archicli model search -v production
# Output: [POST] http://127.0.0.1:8765/model/search (verbose logging enabled)
# Criteria shows: propertyValue: null — the value was eaten by --verbose
```

**Fix:** Either remove the `-v` alias from `--property-value` on the search subcommand or from the global `--verbose`. Since `-v` for verbose is a strong unix convention, the search subcommand should use a different short alias (e.g., `-V` or `--prop-val`).

---

### 3. Deleted elements and relationships still exist after `deleteElement`/`deleteRelationship`

**Impact:** Delete operations appear to succeed but don't actually remove anything.

After `deleteElement` reports success with `"cascade": true`, the element is still returned by `model search` and `model element <id>`. Same for `deleteRelationship`. This was tested with elements and relationships created and deleted in the same batch.

**Repro:**
```json
{
  "changes": [
    { "op": "createElement", "type": "artifact", "name": "Temp", "tempId": "to-delete" },
    { "op": "deleteElement", "id": "to-delete" }
  ]
}
```
After apply: `archicli model element <realId>` still returns the element. `model search` still lists it. `health` still counts it.

**Note:** This may be a server-side (jArchi) issue rather than a CLI issue, but it should at minimum be documented. If the CLI can detect the inconsistency, it should warn.

---

### 4. `createFolder` requires `parentId` despite docs saying it's optional

**Impact:** Cannot create top-level folders.

The help text documents `createFolder name, [parentId]` where brackets indicate optional. But the server rejects `createFolder` without `parentId`: `"missing 'parentId' field"`.

**Repro:**
```json
{ "op": "createFolder", "name": "Application Layer" }
```
Error: `Change 0 (createFolder): missing 'parentId' field`

**Fix:** Either update the docs to show `parentId` as required, or fix the server to accept it as optional (defaulting to the model root).

---

## Bugs — Medium

### 5. `view list` reports `connectionCount: 0` for views that have connections

**Impact:** Misleading metadata in view listings.

The "Application Architecture" view had 4 connections added (confirmed by `view get` showing all connection objects), but `view list` consistently reports `connectionCount: 0`.

**Repro:**
```bash
archicli view list   # Shows connectionCount: 0 for populated views
archicli view get <viewId>  # Shows 4 connections in the connections array
```

---

### 6. `--property-value` without `--property-key` silently returns all results

**Impact:** Misleading search behavior.

Running `archicli model search --property-value production` returns all 24 elements/relationships without any warning. The property-value filter is silently ignored when no key is specified.

**Fix:** Warn or error when `--property-value` is used without `--property-key`.

---

### 7. `styleConnection` silently drops unrecognized style properties

**Impact:** User thinks styling was applied when it wasn't.

When passing both `lineColor` and `fontColor` to `styleConnection`, only `lineColor` appears in the `updated` array. No warning is emitted about `fontColor` being ignored.

**Repro:**
```json
{
  "op": "styleConnection",
  "viewId": "...",
  "connectionId": "...",
  "lineColor": "#0000ff",
  "fontColor": "#333333"
}
```
Result: `"updated": ["lineColor"]` — `fontColor` silently dropped.

---

## UX / Design Issues

### 8. `--output text` mode is not meaningfully different from JSON

The text output format renders top-level keys as `key: value` but nested objects and arrays are still printed as raw JSON blobs. This provides no real benefit over JSON mode and is arguably harder to read (mixed formats).

**Suggestion:** Either implement a proper table/flat format or remove text mode entirely. For an AI-focused CLI, JSON-only output is perfectly acceptable.

### 9. `archicli` with no command exits code 1; `archicli model` exits code 0

Showing help text is not an error condition. Both should exit 0 (or both exit 1 for consistency, though 0 is more conventional for help).

### 10. `model query` help says "folder structure" but response doesn't include it

The help text promises: *"Get a model overview: element/relationship counts, **folder structure**, and sample elements."* The actual response only contains `summary` and `sample` — no folder information.

### 11. No command to list or discover folder IDs

There is no `model folders` or `model tree` command. This makes `createFolder` (with `parentId`), `moveToFolder`, and the `--folder` option on `view create` essentially unusable without external knowledge of the folder structure.

**Suggestion:** Add `model folders` or `model tree` command that returns the folder hierarchy with IDs.

### 12. Server silently reorders operations within a batch

In a batch with `[updateRelationship, createElement, createRelationship, deleteRelationship]`, the results came back as `[createElement, updateRelationship, createRelationship, deleteRelationship]`. The server reordered ops without notice. While this may be intentional (dependency resolution), it should be documented since users may rely on ordering for side effects.

### 13. `view create` (CLI command) is synchronous, unlike other mutations

`archicli view create "Name"` returns the result immediately with no operationId. This is convenient but inconsistent with the help text that says "All model mutations are async." Either document this exception or make it consistently async.

---

## What Works Well

| Feature | Notes |
|---|---|
| **Help text** | Excellent — every command has thorough, example-rich help with ArchiMate domain context |
| **BOM + tempId system** | Core abstraction works reliably; intra-batch tempId resolution is solid |
| **`batch apply --poll`** | Seamless async-to-sync experience; chunking and polling work transparently |
| **`verify`** | Catches multiple validation errors at once with clear JSON paths |
| **`--dry-run`** | Useful for previewing what will be submitted |
| **`batch split`** | Clean split + index BOM generation with proper includes |
| **`includes` system** | Composable BOM files work correctly |
| **`--resolve-names`** | Name-based ID resolution works as a fallback |
| **`--save-ids` / `--no-save-ids`** | Flexible ID persistence control |
| **Error messages** | Structured JSON errors with meaningful codes and messages |
| **Connection errors** | Clear guidance when server is unreachable |
| **`view export`** | Works for PNG and JPEG; empty views export gracefully (286-byte image) |
| **`--verbose`** | Useful HTTP debugging output |
| **`ARCHI_BASE_URL` env var** | Works correctly as base-url override |
| **Combined search filters** | `--type` + `--name` composition works correctly |
| **Duplicate prevention** | Server rejects duplicate `createElement` by name+type with clear error |

---

## Test Inventory

| Command | Tested | Result |
|---|---|---|
| `health` | Yes | Pass |
| `health --verbose` | Yes | Pass |
| `health --base-url <wrong>` | Yes | Pass (clear error) |
| `health --output text` | Yes | Pass (but text mode is poor) |
| `model query` | Yes | Pass (but no folder structure) |
| `model query --limit` | Yes | Pass |
| `model search` (no filters) | Yes | Pass |
| `model search --type` | Yes | Pass |
| `model search --name` | Yes | Pass |
| `model search --type + --name` | Yes | Pass |
| `model search --property-key` | Yes | Pass |
| `model search --property-key + --property-value` | Yes | Pass |
| `model search --property-value` (no key) | Yes | **Bug #6** |
| `model search -v` (short flag) | Yes | **Bug #2** |
| `model search --type bogus` | Yes | Pass (warning + empty result) |
| `model search --limit` | Yes | Pass |
| `model element <id>` | Yes | Pass |
| `model element <bad-id>` | Yes | Pass (clear error) |
| `model apply <file>` | Yes | Pass (returns operationId) |
| `model apply --poll` | Yes | Pass |
| `batch apply --poll` | Yes | Pass |
| `batch apply --dry-run` | Yes | Pass |
| `batch apply --no-save-ids` | Yes | Pass |
| `batch apply --save-ids <path>` | Yes | Pass |
| `batch apply --resolve-names` | Yes | Pass |
| `batch apply` (empty BOM) | Yes | Pass (warning) |
| `batch apply` (missing file) | Yes | Pass (clear error) |
| `batch apply` (includes system) | Yes | Pass |
| `batch split --size` | Yes | Pass |
| `verify` (valid BOM) | Yes | Pass |
| `verify` (invalid BOM) | Yes | Pass (multiple errors) |
| `verify` (non-JSON) | Yes | Pass (parse error) |
| `verify` (missing file) | Yes | Pass (ENOENT) |
| `view list` | Yes | **Bug #5** (connectionCount wrong) |
| `view get <id>` | Yes | Pass |
| `view get <bad-id>` | Yes | Pass (clear error) |
| `view create <name>` | Yes | Pass |
| `view create --documentation` | Yes | Pass |
| `view export --file (PNG)` | Yes | Pass |
| `view export --format JPEG` | Yes | Pass |
| `view export` (empty view) | Yes | Pass |
| `ops status <id>` | Yes | Pass |
| `ops status --poll` | Yes | Pass |
| `ops status <bad-id>` | Yes | Pass (clear error) |
| BOM: createElement | Yes | Pass |
| BOM: createRelationship | Yes | Pass |
| BOM: updateElement | Yes | Pass |
| BOM: updateRelationship | Yes | Pass |
| BOM: deleteElement | Yes | **Bug #3** (element persists) |
| BOM: deleteRelationship | Yes | **Bug #3** (relationship persists) |
| BOM: setProperty | Yes | Pass |
| BOM: createView | Yes | Pass (but **Bug #1** re tempId) |
| BOM: createFolder | Yes | **Bug #4** (parentId required) |
| BOM: addToView | Yes | Pass |
| BOM: addConnectionToView | Yes | Pass |
| BOM: deleteConnectionFromView | Yes | Pass |
| BOM: moveViewObject | Yes | Pass |
| BOM: styleViewObject | Yes | Pass |
| BOM: styleConnection | Yes | **Bug #7** (fontColor dropped) |
| BOM: createNote | Yes | Pass |
| BOM: createGroup | Yes | Pass |
| BOM: moveToFolder | Not tested | Blocked by Bug #4 |

---

## Recommended Priority

1. **Fix Bug #1** (createView tempId not saved) — breaks the primary multi-file workflow
2. **Fix Bug #2** (-v flag conflict) — confusing silent failure
3. **Investigate Bug #3** (delete not working) — may be server-side
4. **Fix Bug #4** (createFolder parentId) — docs vs behavior mismatch
5. **Add folder listing command** — needed to unblock folder operations
6. **Fix Bug #5** (connectionCount) and **Bug #6** (property-value without key)
7. **Improve text output mode** or remove it
