# archicli Suggestions - Remaining Work

This document tracks the enhancement suggestions from the blind test report (REPORT.md) that were not implemented during the initial bug fix phase.

**Status as of 2026-02-09:**
- All critical bugs (BUG-1 through BUG-7) have been fixed ✓
- Inconsistencies (INC-1, INC-2) have been addressed ✓
- Suggestions (SUG-1 through SUG-7) remain as future enhancements

---

## Priority Ranking

Based on user impact and development effort:

1. **SUG-5** (High Priority) - `--poll` default behavior
2. **SUG-2** (Medium Priority) - BOM schema validation strictness
3. **SUG-6** (Medium Priority) - List valid viewpoints in help (partially done)
4. **SUG-1** (Low Priority) - Text table truncation
5. **SUG-4** (Low Priority) - Better auto-detect hints
6. **SUG-7** (Low Priority) - `ops list` command
7. **SUG-3** (Low Priority) - Relationship counts in `model query`

---

## SUG-5: `batch apply` without `--poll` should warn by default

**Priority:** HIGH
**Effort:** LOW
**Impact:** Prevents common user mistakes

### Problem
Nearly every use case requires `--poll` for:
- tempId resolution across chunks
- ID mapping and `.ids.json` file generation
- Confirmation that operations actually completed

Omitting `--poll` is almost always a mistake - users get an operation ID but no results.

### Recommended Solution
**Option A (Conservative):** Print warning when `--poll` is omitted:
```typescript
if (!options.poll) {
  console.warn('Warning: Running without --poll. Operation results will not be tracked. Use --poll to wait for completion and save ID mappings.');
}
```

**Option B (Breaking Change):** Make `--poll` the default, add `--no-poll` flag:
```typescript
.option('--poll', 'poll until completion (default)', true)
.option('--no-poll', 'submit and return immediately')
```

### Implementation
- **File:** `archicli/src/commands/batch/apply.ts`
- **Location:** After option parsing, before submission (around line 260)
- **Lines:** ~5 lines for Option A

---

## SUG-2: Extra/unknown fields in BOM silently accepted

**Priority:** MEDIUM
**Effort:** MEDIUM
**Impact:** Prevents silent typos and authoring errors

### Problem
The BOM schema accepts unknown fields without warning:
```json
{
  "version": "1.0",
  "randomExtraField": true,
  "changes": [
    { "op": "createElement", "type": "goal", "name": "X", "extraProp": "ignored" }
  ]
}
```

This can mask typos like `documention` instead of `documentation`.

### Recommended Solution
**Option A (Strict):** Add `"additionalProperties": false` to all schema definitions
- Rejects unknown fields entirely
- Breaking change for users with extra fields

**Option B (Permissive):** Add validation warnings for unknown fields
- Check for extra keys in verify command
- Include warning in verification output
- Non-breaking

### Implementation
**For Option A:**
- **Files:** `archicli/src/schemas/bom.schema.json` and operation schemas
- **Change:** Add `"additionalProperties": false` to each object definition
- **Lines:** ~10 schema locations

**For Option B:**
- **File:** `archicli/src/commands/verify.ts`
- **Location:** After JSON schema validation (around line 240)
- **Logic:** Compare actual keys vs. schema-defined keys, warn on extras
- **Lines:** ~30 lines

---

## SUG-6: `view create` could list valid viewpoints in help

**Priority:** MEDIUM
**Effort:** LOW
**Impact:** Better discoverability

### Current Status
✓ Help text updated with examples: `(e.g., application_cooperation, layered, strategy)`
✓ Valid viewpoints defined in code constant `VALID_VIEWPOINTS`
✗ Full list not shown in help (only examples)

### Problem
`model search --help` lists all valid element/relationship types (excellent UX), but `view create --help` only shows a few examples. Users don't know all 22 valid viewpoint options without consulting documentation.

### Recommended Solution
Add viewpoint list to help text, similar to `model search`:

```typescript
.description(
  'Create a new ArchiMate view in the model\n\n' +
  'VALID VIEWPOINTS:\n' +
  '  Strategy:      strategy, capability, value_stream, outcome_realization\n' +
  '  Business:      organization, business_process_cooperation, product\n' +
  '  Application:   application_cooperation, application_usage, information_structure\n' +
  '  Technology:    technology, technology_usage, physical\n' +
  '  Cross-layer:   layered, implementation_and_deployment, service_realization\n' +
  '  Motivation:    motivation, goal_realization, requirements_realization\n' +
  '  Migration:     implementation_and_migration, migration, project\n\n' +
  'EXAMPLES:\n' +
  '  archicli view create "Application Overview" --viewpoint application_cooperation\n' +
  '  archicli view create "Technology Stack" --viewpoint layered'
)
```

### Implementation
- **File:** `archicli/src/commands/view/create.ts`
- **Location:** Line 33 (description)
- **Lines:** Update description text (~20 lines)

---

## SUG-1: Text output tables overflow with long values

**Priority:** LOW
**Effort:** MEDIUM
**Impact:** Better UX for wide terminals

### Problem
Long element names, documentation, or property values produce very wide tables in `--output text` mode that overflow terminal width.

### Recommended Solution
**Option A:** Auto-truncate to terminal width or fixed limit (e.g., 50 chars):
```typescript
const cellToString = (val: unknown, maxWidth = 50): string => {
  // ... existing logic
  const str = String(val);
  return str.length > maxWidth ? str.substring(0, maxWidth - 3) + '...' : str;
};
```

**Option B:** Add CLI options `--truncate <n>` and/or `--wrap`:
```typescript
.option('--truncate <n>', 'truncate table cells to N characters')
.option('--wrap', 'wrap long values in table cells')
```

### Implementation
- **File:** `archicli/src/utils/output.ts`
- **Location:** `cellToString()` function (line 54)
- **Lines:** ~10-20 lines depending on approach
- **Consideration:** Need to preserve object/array formatting (`<object>`, `<array[N]>`)

---

## SUG-4: Auto-detect schema hints

**Priority:** LOW
**Effort:** LOW
**Impact:** Better error messages

### Problem
When schema auto-detection fails, the error is generic:
```
Could not auto-detect schema. Use --schema to specify one of: bom
```

This doesn't tell the user WHY auto-detection failed or what to fix.

### Recommended Solution
Add hints based on common failure modes:

```typescript
let hint = 'Could not auto-detect schema.';
if (!json.version) {
  hint += ' Hint: BOM files require a top-level "version" field for auto-detection.';
} else if (!json.changes && !json.includes) {
  hint += ' Hint: BOM files require either "changes" or "includes" array.';
}
hint += ' Use --schema to specify one of: bom';
```

### Implementation
- **File:** `archicli/src/commands/verify.ts`
- **Location:** Auto-detection logic (around line 210)
- **Lines:** ~10 lines

---

## SUG-7: Missing `ops list` command

**Priority:** LOW
**Effort:** HIGH
**Impact:** Debugging and monitoring capability

### Problem
There is `ops status <opId>` but no way to list all operations. Useful for:
- Debugging what happened in a session
- Finding lost operation IDs
- Monitoring overall queue state

### Recommended Solution
Add `ops list` command:

```bash
archicli ops list
# Output: table of recent operations with ID, status, timestamp, op count

archicli ops list --status complete
# Filter by status

archicli ops list --limit 50
# Limit results
```

### Implementation Challenges
**Server-side requirement:** The Archi Model API Server would need to implement `/ops` or `/ops/list` endpoint. Currently only `/ops/status/{id}` exists.

**Server-side changes needed:**
1. Store operation history in `operationQueue.js`
2. Add `/ops` endpoint in `operationEndpoints.js`
3. Return list with pagination/filtering

**CLI-side changes:**
1. Create `archicli/src/commands/ops/list.ts`
2. Add to ops command group
3. Format table output

### Recommendation
**Defer until server-side support is added.** This is a valuable feature but requires coordination with server development.

---

## SUG-3: `model query` relationship counts

**Priority:** LOW
**Effort:** MEDIUM
**Impact:** Enhanced query output

### Problem
`model query` returns element counts but no relationship information. Users can't see relationship distribution without running `model search`.

### Recommended Solution
**Option A:** Add relationship counts to existing output:
```json
{
  "elementCount": 45,
  "relationshipCount": 78,
  "viewCount": 5,
  "relationships": {
    "serving-relationship": 23,
    "composition-relationship": 18,
    "flow-relationship": 12,
    ...
  }
}
```

**Option B:** Add `--include-relationships` flag:
```bash
archicli model query --include-relationships
```

### Implementation Challenges
**Server-side:** The `/model/query` endpoint currently returns only element counts. Would need enhancement to include relationships.

**Alternatives:**
- CLI could make additional `/model/search` call for relationships (2 API calls)
- Update server `/model/query` to include relationship data

### Recommendation
**Defer or implement as client-side aggregation** using existing `/model/search` endpoint.

---

## Implementation Roadmap

### Phase 1: Quick Wins (Low effort, high impact)
1. **SUG-5** - Add `--poll` warning (~30 minutes)
2. **SUG-4** - Add auto-detect hints (~30 minutes)
3. **SUG-6** - Expand viewpoint help text (~15 minutes)

### Phase 2: Quality Improvements (Medium effort)
1. **SUG-2** - Add unknown field warnings (~2 hours)
2. **SUG-1** - Add table truncation (~1-2 hours)

### Phase 3: Future Features (High effort or server dependency)
1. **SUG-7** - `ops list` command (requires server work)
2. **SUG-3** - Relationship counts (requires server work or dual API calls)

---

## Notes

- All suggestions maintain backward compatibility
- No breaking changes required for Phase 1 and 2
- Phase 3 items may require server-side API changes
- Priority ranking based on user impact vs. implementation effort
