# Batch Execution & Rollback — Issues and Recommendations

**Date**: 2026-02-09  
**Status**: **11/11 Complete** ✅ (All recommendations implemented)  
**Context**: Building a full ArchiMate model of archicli (80 elements, 123 relationships, 4 views) using `archicli batch apply` against the Model API Server.

---

## Issues Encountered

### Issue 1: Silent GEF Rollback on Relationship Batches

**Symptom**: Client chunks of 20 `createRelationship` operations would occasionally have entire server-side chunks silently rolled back by GEF. The server's post-execution verification caught this, but the 20 operations were lost.

**Root cause**: Each `createRelationship` generates 4–7 GEF sub-commands (set source, set target, set name, set documentation, set accessType, add to folder). A client chunk of 20 ops produces ~80–140 sub-commands. The server's `maxSubCommandsPerBatch` threshold (100) triggers server-side re-chunking, which splits the flat sub-command list at arbitrary boundaries — potentially cutting a single relationship's sub-commands across two GEF CompoundCommands. A half-built relationship in GEF is inconsistent, and the command stack rolls it back.

**Workaround applied**: `--chunk-size 1` (one operation per request).

### Issue 2: `accessType: 0` (Write) Causes GEF Rollback

**Symptom**: Three `access-relationship` operations with `accessType: 0` (WRITE) consistently failed with GEF rollback, even with `--chunk-size 1`. Changing to `accessType: 2` (ACCESS) succeeded.

**Root cause**: Unknown. Possibly a GEF/Archi validation constraint that rejects WRITE access type on certain element combinations, or an EMF enum mapping issue. The `EObjectFeatureCommand` might be passing an invalid enum literal for `accessType: 0`.

### Issue 3: TempId Cross-Mapping in Relationship Results

**Symptom**: After creating relationships in a batch, the tempId→realId mappings returned by the server had some relationship tempIds mapped to the wrong real IDs. Specifically, `r-real-view2` (intended: View Layout → View Mgmt) resolved to the relationship connecting View Export → View Mgmt, and vice versa.

**Root cause**: The `executeBatch()` function builds the `results` array during command construction (before `executeCommand()` runs). The `rel.getId()` is captured at construction time when the EMF object has been created but the CompoundCommand hasn't executed yet. If server-side chunking then rolls back and re-executes chunks, or if `rel.getId()` changes during execution, the pre-captured result is stale. Additionally, the `idMap[operation.tempId] = rel` mapping uses the EMF object reference which is valid, but the `rel.getId()` in the results array was captured at a different point in time.

**Impact**: Downstream `addConnectionToView` operations that reference these tempIds hit "Direction mismatch" errors because the resolved relationship ID doesn't match the visual objects' underlying concepts.

### Issue 4: Direction Mismatch False Positives  

**Symptom**: `addConnectionToView` operations failed with "Direction mismatch: visual elements do not match relationship source/target" even when the BOM file was correct.

**Root cause**: Cascading effect of Issue 3. The relationship tempIds in `all-ids.json` pointed to the wrong relationships, so when used as `relationshipId` in `addConnectionToView`, the server correctly rejected the mismatch between the relationship's endpoints and the visual objects.

---

## Recommendations

### ✅ R1: Operation-Aligned Server-Side Chunking (Critical)
**Status**: DONE — Implemented in `undoableCommands.js` (lines 1059, 1066, 2756, 2985, 2991, 3039+)  
**Implementation**: `opBoundaries` array tracks operation boundaries throughout phases 1-3; chunking logic respects boundaries

**Current**: `undoableCommands.js:2975` splits at flat sub-command index boundaries.

**Proposed**: Track operation boundaries in the sub-command list and never split mid-operation.

```javascript
// Instead of:
var chunkEnd = Math.min(cmdIndex + maxSubCmds, listSize);

// Track boundaries:
var opBoundaries = []; // indices where each logical operation starts
// ... populate during pass 1/2/3 ...
// Split only at operation boundaries
```

Each `createRelationship` adds 4–7 sub-commands. The chunking should accumulate whole operations until adding the next would exceed the threshold, then cut. This prevents half-built EMF objects from being committed in one chunk while their remaining setup lands in the next.

### ✅ R2: Per-Operation CompoundCommand for Relationships
**Status**: DONE — Implemented in `undoableCommands.js` (lines 1026, 1043, 3002+)  
**Implementation**: Added `granularity: "per-operation"` config option; splits at operation boundaries when enabled

**Current**: All operations in a batch share one CompoundCommand (or server-chunked CompoundCommands).

**Proposed**: Add a `granularity: "per-operation"` option that wraps each operation in its own CompoundCommand, executed and verified individually. This eliminates cross-operation rollback contamination.

```javascript
// Server-side option
if (config.granularity === "per-operation") {
    for (var j = 0; j < operations.length; j++) {
        var opCompound = new CompoundCommand(operations[j].op + " " + j);
        // ... add sub-commands for just this operation ...
        executeCommand(model, opCompound);
        // ... verify ...
    }
}
```

**Trade-off**: Slower (each operation is a separate undo unit), but eliminates all batching-related rollback issues. Could be exposed as `POST /model/apply?granularity=per-operation` or as a server config option.

### ✅ R3: Capture Results After Execution, Not Before
**Status**: DONE — Implemented in `undoableCommands.js` (lines 3112-3140)  
**Implementation**: Post-execution refresh re-reads IDs from committed EMF objects; prevents stale tempId mappings

**Current**: `undoableCommands.js:1213` pushes to `results` during command construction (before `executeCommand()`):

```javascript
results.push({
    op: "createRelationship",
    tempId: operation.tempId,
    realId: rel.getId(),    // captured BEFORE execution
    ...
});
```

**Proposed**: Defer result building to after successful execution:

```javascript
// During construction, just collect pending results
pendingResults.push({
    op: "createRelationship",
    tempId: operation.tempId,
    emfObject: rel,     // reference, not ID
    ...
});

// After executeCommand(model, compound):
for (var r = 0; r < pendingResults.length; r++) {
    var pr = pendingResults[r];
    results.push({
        ...pr,
        realId: pr.emfObject.getId(),  // captured AFTER execution
        emfObject: undefined
    });
}
```

This ensures the realId is captured from the committed state, not the pre-execution construction state. If the ID changes during execution (unlikely but possible with EMF), the result will be correct.

### ✅ R4: Investigate `accessType: 0` GEF Rejection
**Status**: DONE — Fixed in `undoableCommands.js` (lines 1185-1193)  
**Implementation**: Replaced `EObjectFeatureCommand` with direct setter `rel.setAccessType()` in closure-based GEFCommand

The `EObjectFeatureCommand` for `accessType` passes a raw integer. GEF/EMF might expect an `EEnum` literal, not a Java integer. Check:

```javascript
// Current (line ~1187):
var accessCmdCreate = new EObjectFeatureCommand(
    "Set Access Type", rel, accessPkgCreate, operation.accessType
);

// Might need:
var AccessType = Java.type("com.archimatetool.model.impl.AccessRelationship");
var enumLiteral = IAccessRelationship.UNSPECIFIED_ACCESS; // or similar
```

Test all four access types (0=write, 1=read, 2=access, 3=readwrite) individually against various element pair combinations to find which triggers the rejection.

### ✅ R5: Client-Side Visual ID Cross-Validation in archicli
**Status**: DONE — Implemented in `archicli/src/utils/crossValidation.ts` and `archicli/src/commands/batch/apply.ts`  
**Implementation**: `--validate-connections` flag (auto-enabled with `--safe`) cross-validates `addConnectionToView` operations against relationship endpoints before submission; auto-swaps reversed direction with warning; fails on complete mismatch

Before submitting `addConnectionToView`, archicli should:

1. Resolve the `relationshipId` tempId to a realId
2. Call `GET /model/element/{realId}` to get the relationship's source/target
3. Resolve `sourceVisualId`/`targetVisualId` tempIds and look up which element each visual represents (from the element creation results)
4. Verify the relationship's source matches the source visual's element, and target matches target visual's element
5. If mismatched, try swapping and log a warning

This catches tempId cross-mapping issues before they reach the server.

### ✅ R6: Direction Auto-Fix Option on Server
**Status**: DONE — Implemented in `undoableCommands.js` (lines 1678, 1690)  
**Implementation**: Added `autoSwapDirection: true` option that swaps source/target on mismatch instead of failing

Add `"autoSwapDirection": true` option to `addConnectionToView` that, when a direction mismatch is detected, automatically swaps source/target visual IDs instead of failing:

```javascript
if (sourceElemId === relTargetId && targetElemId === relSourceId) {
    if (operation.autoSwapDirection) {
        // Swap and proceed
        var tmp = sourceVisual; sourceVisual = targetVisual; targetVisual = tmp;
    } else {
        throw new Error("Direction mismatch...");
    }
}
```

### ✅ R7: Richer Result Context for Debugging
**Status**: DONE — Implemented in `undoableCommands.js` (lines 1228, 1230)  
**Implementation**: Relationship results now include `sourceName` and `targetName` fields for auditability

Include source/target names in relationship creation results so callers can verify mappings:

```javascript
results.push({
    op: "createRelationship",
    tempId: operation.tempId,
    realId: rel.getId(),
    type: operation.type,
    source: source.getId(),
    sourceName: source.getName(),    // NEW
    target: target.getId(),
    targetName: target.getName()     // NEW
});
```

archicli's `--save-ids` could then write a richer `.ids.json` that includes element names, making it auditable.

### ✅ R8: archicli `--chunk-size` Default Should Be Lower
**Status**: DONE — Implemented in `archicli/src/commands/batch/apply.ts` (line 200)  
**Implementation**: Default changed from 20 to 10; keeps sub-command count well under server threshold

**Current default**: 20 operations per chunk.

**Proposed**: Default to 10 for relationship-heavy BOMs (or detect the operation mix and auto-adjust). 10 relationships × ~5 sub-commands = ~50, well under the server's 100 threshold.

Alternatively, add `--safe` flag that:
- Sets chunk-size to 1
- Enables verify between chunks  
- Enables auto-swap for direction mismatches

---

## Priority Matrix

| # | Recommendation | Impact | Effort | Priority | Status |
|---|---------------|--------|--------|----------|--------|
| R1 | Operation-aligned chunking | Eliminates most rollbacks | Medium | **P0** | ✅ **DONE** |
| R2 | Per-operation CompoundCommand | Eliminates all batch rollbacks | Medium | **P0** | ✅ **DONE** |
| R3 | Post-execution result capture | Eliminates tempId cross-mapping | Low | **P1** | ✅ **DONE** |
| R4 | accessType:0 investigation | Fixes write-access bug | Low | **P1** | ✅ **DONE** |
| R5 | Client-side visual cross-validation | Catches issues early | Medium | **P2** | ✅ **DONE** |
| R6 | Direction auto-fix option | Better UX | Low | **P2** | ✅ **DONE** |
| R7 | Richer result context | Debugging aid | Low | **P3** | ✅ **DONE** |
| R8 | Lower default chunk-size | Reduces exposure | Trivial | **P1** | ✅ **DONE** |

## Quick Wins

1. ✅ **Lower `maxSubCommandsPerBatch` to 50** in `serverConfig.js` — DONE (line 61)
2. ✅ **Lower archicli default `--chunk-size` to 10** — DONE (same as R8, line 200 of apply.ts)
3. ✅ **Add a `--safe` mode** to archicli that uses chunk-size 1 with verification — DONE (lines 233-301 of apply.ts)

---

## Summary

The core issue is that **the server-side GEF sub-command chunking is operation-unaware**. It treats the flat list of EMF/GEF commands as equal and splittable at any boundary, but a single logical operation (like `createRelationship`) consists of multiple tightly-coupled sub-commands that must execute atomically. When the split falls mid-operation, GEF detects an inconsistent model state and rolls back the chunk.

The secondary issue is that **result building happens before execution**, so if server-side chunking alters the execution semantics (rollback + re-execution, ID reassignment), the pre-built results become stale.

Both issues are fixable without major architectural changes — R1 and R3 are targeted surgical fixes to the existing `executeBatch()` function.

---

## Implementation Status (February 10, 2026)

### ✅ Completed (11/11 items)

**Server-side fixes** (`scripts/lib/core/undoableCommands.js`, 3441 lines):
- R1: Operation-aligned chunking via `opBoundaries` array
- R2: Per-operation granularity option (`granularity: "per-operation"`)
- R3: Post-execution result ID refresh (lines 3112-3140)
- R4: Direct `setAccessType()` setter instead of EObjectFeatureCommand
- R6: `autoSwapDirection: true` option for connection direction mismatch auto-fix
- R7: Relationship results include `sourceName` and `targetName` fields

**Server config** (`scripts/lib/server/serverConfig.js`):
- QW1: `maxSubCommandsPerBatch` lowered from 100 to 50

**CLI improvements** (`archicli/src/commands/batch/apply.ts`):
- R8/QW2: Default `--chunk-size` lowered from 20 to 10
- QW3: `--safe` flag (chunk-size 1 with verification and connection validation)
- R5: `--validate-connections` flag for client-side visual cross-validation

**Cross-validation utility** (`archicli/src/utils/crossValidation.ts`):
- Builds visual tempId → element ID map from BOM's `addToView` operations
- Fetches relationship details from server (with caching) to get source/target
- Verifies connection direction matches relationship endpoints
- Auto-swaps reversed source/target visual IDs with warning
- Fails early on complete endpoint mismatch

**Tests**: All unit tests passing (13 cross-validation tests + 107 existing)

### ✅ All Recommendations Complete

All 11 recommendations have been implemented. The R5 cross-validation adds a final layer of client-side defense:

- **`--validate-connections`** flag on `batch apply` enables pre-submission validation
- **`--safe` mode** now automatically enables connection validation
- Relationship endpoint verification prevents the cascading failures described in Issue 3 and Issue 4
- Auto-swap corrects reversed direction without user intervention
- Relationship details are cached to minimize API calls
