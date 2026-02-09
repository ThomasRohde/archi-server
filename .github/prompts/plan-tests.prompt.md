# Plan: archicli Live Server Integration Tests

**TL;DR** — Create a dedicated Vitest test suite in `archicli/__tests__/` that spawns the real CLI process against a live Archi server on an empty model. Tests cover: all CLI command smoke tests, FIXES.md regression cases (silent rollback, ghost detection, duplicate detection), and a stress-scale bulk modeling scenario (~200 elements, ~300 relationships, 6 views). Static JSON fixture BOMs drive the bulk tests. A shared test harness spawns `tsx src/cli.ts ...` and parses the JSON `CLIResponse` envelope.

**Steps**

## 1. Set up Vitest in archicli/ ✅ DONE

- Add `vitest` (^1.3.0) to devDependencies in `archicli/package.json`
- Create `archicli/vitest.config.ts` with:
  - `testTimeout: 300_000` (5 min — stress tests are slow)
  - `hookTimeout: 120_000`
  - Sequential execution (`pool: 'forks'`, `poolOptions.forks.singleThread: true`)
  - Include pattern: `__tests__/**/*.test.ts`
- Add scripts to `archicli/package.json`: `"test"`, `"test:smoke"`, `"test:fixes"`, `"test:bulk"`

## 2. Create test harness — `archicli/__tests__/helpers/cli.ts` ✅ DONE

A utility module that:
- Spawns `npx tsx src/cli.ts <args>` via `child_process.execFile` with `--output json` always appended
- Captures stdout/stderr, parses `CLIResponse<T>` from stdout
- Returns typed result: `{ success, data, error, metadata, exitCode, stderr }`
- Accepts `env` overrides (e.g. `ARCHI_BASE_URL`)
- Configurable timeout per invocation (default 60s)
- Helper: `cli('health')`, `cli('batch', 'apply', fixturePath, '--poll')`, etc.

## 3. Create test harness — `archicli/__tests__/helpers/server.ts` ✅ DONE

A utility module that:
- `ensureServer()` — checks `GET /health` via raw fetch, skips suite if unreachable
- `assertEmptyModel()` — calls `POST /model/query` and asserts zero elements (fails with clear message if model not empty)
- `getModelCounts()` — returns `{ elements, relationships, views }` from `/model/query`
- `cleanupAll()` — applies `deleteElement` with cascade for all elements found via `/model/search`, then deletes all views. Used in `afterAll` for cleanup *if* needed
- `waitForOperation(opId)` — polls `/ops/status` until complete (for raw API calls in helpers)

## 4. Create test harness — `archicli/__tests__/helpers/fixtures.ts` ✅ DONE

A utility module that:
- `fixtureDir` — resolves to `archicli/__tests__/fixtures/`
- `fixturePath(name)` — returns absolute path to named fixture
- `writeTempBom(changes, options?)` — writes a temporary BOM JSON to `os.tmpdir()` for programmatic tests, returns path
- `cleanupTempFiles()` — removes temp files after test

## 5. Create static fixture BOMs — `archicli/__tests__/fixtures/` ✅ DONE

19 fixture files generated via `generate-fixtures.mjs` (deterministic, re-runnable). All 16 valid BOMs pass `archicli verify`. Generator script kept for reproducibility.

| Fixture file | Purpose | Contents |
|---|---|---|
| `smoke-elements.json` | Smoke: create 3 elements | 1 business-actor, 1 application-component, 1 node |
| `smoke-relationships.json` | Smoke: create 2 relationships | serving + association referencing smoke-elements tempIds via idFiles |
| `smoke-view.json` | Smoke: create view + add elements | createView, 3× addToView, 2× addConnectionToView |
| `fix1-elements.json` | Bug 1 prerequisite: 10 elements | 10 business-layer elements (process, service, actor, role, object) |
| `fix1-large-relationships.json` | Bug 1: 35 relationships in single batch | All between fix1-elements via idFiles, tempIds for all |
| `fix4-elements.json` | Bug 4 prerequisite: 2 elements | 1 application-process + 1 data-object |
| `fix4-duplicate-access.json` | Bug 4: two access-relationships, different accessType | Same source/target, both `access-relationship` — accessType 1 (Read) vs 3 (ReadWrite) |
| `fix5-large-elements.json` | Bug 5: 40 elements in single batch | Mixed types: 12 business, 10 app, 8 tech, 6 motivation, 4 strategy/impl |
| `bulk-01-elements.json` | Stress: 200 elements | 15 strategy, 60 business, 50 application, 40 technology, 20 motivation, 15 implementation |
| `bulk-02-relationships.json` | Stress: 338 relationships | idFiles→bulk-01; within-layer + cross-layer relationships |
| `bulk-03-views.json` | Stress: 6 views + 125 visual objects + 114 connections | idFiles→bulk-01+bulk-02; grid-layout placement |
| `bulk-04-styling.json` | Stress: 27 style/note/group ops | styleViewObject, createNote, createGroup on bulk-03 views |
| `verify-valid.json` | Verify: well-formed BOM | 2 elements + 1 relationship |
| `verify-invalid-schema.json` | Verify: malformed BOM | Missing version, bad op types |
| `verify-duplicate-tempid.json` | Verify: duplicate tempIds | Two elements sharing same tempId |
| `includes-parent.json` | Includes: parent BOM | References `includes-child.json` via includes |
| `includes-child.json` | Includes: child BOM | Elements included from parent |
| `empty.json` | Edge: empty changes array | `{ "version": "1.0", "changes": [] }` |
| `skip-existing-round2.json` | Skip-existing: re-apply | Same elements as smoke-elements, tests --skip-existing |

## 6. Test suite: Smoke tests — `archicli/__tests__/smoke.test.ts` ✅ DONE

**Precondition**: Server running, empty model (checked in `beforeAll`).

Tests (each spawns CLI process):
1. `archicli health` — success, has `serverVersion`, `modelName`, `status: "running"`
2. `archicli model query` — returns counts all zero on empty model
3. `archicli model search --type business-actor` — returns empty results
4. `archicli folder list` — returns folder hierarchy
5. `archicli ops list` — returns (possibly empty) operations list
6. `archicli view list` — returns empty list
7. `archicli verify fixtures/verify-valid.json` — exits 0, success
8. `archicli verify fixtures/verify-invalid-schema.json` — exits non-zero, error with details
9. `archicli verify fixtures/verify-duplicate-tempid.json` — exits non-zero, duplicate detection
10. `archicli batch apply fixtures/smoke-elements.json --poll` — creates 3 elements, returns tempId→realId map, saves .ids.json
11. `archicli model query` — counts show 3 elements
12. `archicli model search --type business-actor --name <generated>` — finds created element
13. `archicli model element <realId>` — returns element details
14. `archicli batch apply fixtures/smoke-relationships.json --poll` — creates relationships using idFiles from step 10
15. `archicli batch apply fixtures/smoke-view.json --poll --layout` — creates view, adds elements, auto-layouts
16. `archicli view list` — shows 1 view
17. `archicli view get <viewId>` — returns view with elements and connections
18. `archicli view export <viewId>` — returns image data (or writes file)
19. `archicli view layout <viewId>` — re-layouts, succeeds
20. `archicli view delete <viewId>` — deletes view
21. `archicli model save` — saves model

Cleanup: `afterAll` deletes test elements via raw API.

## 7. Test suite: FIXES.md regression — `archicli/__tests__/fixes-regression.test.ts` ✅ DONE

**Precondition**: Server running, empty model.

**Bug 1 — Silent Batch Rollback** (describe block):
1. Create 10 elements via `batch apply` with `--poll --chunk-size 20` (safe, small batch)
2. Create 35 relationships in a **single chunk** (`--chunk-size 40`) — this exceeds the old rollback threshold
3. Poll to completion, verify all 35 relationships got `realId` in the result
4. For each relationship `realId`, call `archicli model element <sourceId>` and verify the relationship appears in the element's relationship list
5. Call `archicli model query` — verify relationship count matches expected
6. **Key assertion**: No silent loss — every tempId has a valid realId, and every realId is retrievable

**Bug 2 — Ghost Objects** (describe block):
1. Create elements, verify via `/model/diagnostics` that zero orphans exist
2. Intentionally create a known conflict (e.g., apply, then attempt to re-create without `--skip-existing` — expect error)
3. After error, run `archicli model search` and `archicli model element` for each — verify no ghost objects (objects that exist by ID but don't appear in search)

**Bug 3 — Snapshot Consistency** (describe block):
1. Create 20 elements in a batch
2. Immediately query via `archicli model query` — verify count includes all 20
3. Create 15 relationships
4. Query again — verify counts are accurate
5. Delete 5 elements (cascade)
6. Query again — verify counts decreased for both elements and their cascaded relationships

**Bug 4 — Duplicate Detection with Properties** (describe block):
1. Create 2 elements (source, target)
2. Apply `fix4-duplicate-access.json` — creates two `access-relationship` between same pair with different `accessType` (`Read` vs `ReadWrite`)
3. Verify both relationships have distinct `realId`s
4. Verify `archicli model element <sourceId>` shows both relationships
5. **Key assertion**: Two distinct relationships exist, not de-duplicated

**Bug 5 — Large Element Batch** (describe block):
1. Apply `fix5-large-elements.json` — 40 elements in one batch with `--chunk-size 50` (single server request)
2. Verify all 40 got `realId`s
3. Call `archicli model query` — verify element count = 40
4. Spot-check 5 random elements via `archicli model element <id>`

Cleanup: `afterAll` cascade-deletes all test elements.

## 8. Test suite: Bulk modeling stress — `archicli/__tests__/bulk-modeling.test.ts` ✅ DONE

**Precondition**: Server running, empty model. This suite tests the full agentic AI workflow at scale.

Tests run **sequentially** (ordered dependency):

1. **Phase 1 — Elements** (~200 elements):
   - `archicli batch apply fixtures/bulk-01-elements.json --poll --chunk-size 20`
   - Verify: 200+ tempIds resolved, `.ids.json` saved with all mappings
   - `archicli model query` — element count ≥ 200
   - Spot-check: 10 random elements via `model element <id>`

2. **Phase 2 — Relationships** (~300 relationships):
   - `archicli batch apply fixtures/bulk-02-relationships.json --poll --chunk-size 20`
   - Uses `idFiles` from phase 1
   - Verify: 300+ tempIds resolved
   - `archicli model query` — relationship count ≥ 300
   - Spot-check: 10 random elements have expected relationship counts

3. **Phase 3 — Views** (6 views with visual objects and connections):
   - `archicli batch apply fixtures/bulk-03-views.json --poll --chunk-size 20 --layout`
   - Uses `idFiles` from phases 1+2
   - Verify: 6 views created, each with visual objects
   - `archicli view list` — 6 views
   - For each view: `archicli view get <id>` — has elements and connections
   - For each view: `archicli view export <id>` — exports successfully (non-empty image)

4. **Phase 4 — Styling & Annotations**:
   - `archicli batch apply fixtures/bulk-04-styling.json --poll --chunk-size 20`
   - Verify: styling applied, notes and groups created

5. **Phase 5 — Diagnostics & Consistency**:
   - Raw fetch to `GET /model/diagnostics` — zero orphans/ghosts
   - `archicli model query` — final counts match expectations (~200 elements, ~300 relationships, 6 views)
   - Timed performance assertion: total suite < 5 minutes (logged, not hard-fail)

6. **Phase 6 — Idempotent Re-apply** (`--skip-existing`):
   - Re-run `archicli batch apply fixtures/bulk-01-elements.json --poll --skip-existing --chunk-size 20`
   - Verify: all ops skipped (existing IDs recovered), no new elements created
   - `archicli model query` — counts unchanged

7. **Phase 7 — Save**:
   - `archicli model save` — success

## 9. Test suite: CLI error handling — `archicli/__tests__/error-handling.test.ts` ✅ DONE

1. `archicli batch apply nonexistent.json` — file not found error, exits non-zero
2. `archicli batch apply fixtures/verify-invalid-schema.json --poll` — schema validation error
3. `archicli batch apply fixtures/empty.json --poll` — fails without `--allow-empty`
4. `archicli batch apply fixtures/empty.json --poll --allow-empty` — succeeds
5. `archicli model element id-nonexistent` — 404 error
6. `archicli view get id-nonexistent` — 404 error
7. `archicli view delete id-nonexistent` — 404 error
8. `archicli ops status nonexistent-op` — operation not found
9. `archicli batch apply fixtures/smoke-elements.json --chunk-size 0` — argument validation error
10. `archicli batch apply fixtures/smoke-elements.json --chunk-size abc` — argument validation error
11. `archicli -u http://localhost:19999 health` — connection refused error

## 10. Test suite: BOM composition — `archicli/__tests__/bom-composition.test.ts` ✅ DONE

1. `archicli batch apply fixtures/includes-parent.json --poll` — verifies includes resolution, creates elements from both parent and child
2. `archicli verify fixtures/includes-parent.json` — passes validation with includes
3. Create a temp BOM with circular include (A→B→A) — `archicli verify` catches cycle
4. Create a temp BOM with `idFiles` referencing a generated `.ids.json` — verify cross-session tempId resolution works

## 11. Documentation — `archicli/__tests__/README.md`

- Prerequisites: Archi 5.7+ with jArchi 1.11+, server running on empty model, Node 18+
- How to reset: "Open a blank .archimate model, open at least one view, run the server script"
- Commands: `cd archicli && npm test` (all), `npm run test:smoke`, `npm run test:fixes`, `npm run test:bulk`
- Expected runtime: smoke ~1min, fixes ~2min, bulk ~5min
- Troubleshooting: rate limits, stale model state, view requirement

---

## Verification

- `cd archicli && npm install && npm test` runs all suites
- Individual suites: `npx vitest run __tests__/smoke.test.ts`
- Check: all tests pass against empty model with live server
- Check: FIXES.md bugs 1–5 each have a dedicated regression test
- Check: bulk test creates 200+ elements, 300+ relationships, 6 views
- Check: `--skip-existing` re-apply is idempotent (no double-creates)

## Decisions

- **Vitest in archicli/**: Own config, own dependencies — decoupled from root test suites
- **CLI process spawn**: Every test spawns `tsx src/cli.ts` — true E2E, exercises the full Commander parse → fetch → output pipeline
- **Static fixtures**: Hand-authored JSON BOMs in `__tests__/fixtures/` — readable, debuggable, version-controlled
- **Sequential global ordering**: Smoke → Fixes → Bulk → Error → Composition. Suites are independent (each cleans up), but running in this order avoids model pollution
- **Empty model requirement**: Tests assert empty model in `beforeAll` rather than attempting full teardown — simpler, more reliable, matches real agentic workflow (start fresh)
- **No mocking**: All tests hit the real server — the point is to validate the full stack including the GEF/SWT threading bugs from FIXES.md
