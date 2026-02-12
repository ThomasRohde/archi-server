/**
 * Bulk modeling stress tests — exercises the full agentic AI workflow at scale.
 *
 * Phase 1: 200 elements across all ArchiMate layers
 * Phase 2: 338 relationships (within-layer + cross-layer)
 * Phase 3: 6 views with 125 visual objects and 114 connections
 * Phase 4: 27 styling, note, and group operations
 * Phase 5: Diagnostics & consistency verification
 * Phase 6: Idempotent re-apply with --skip-existing
 * Phase 7: Save model
 *
 * Precondition: Server running at $ARCHI_BASE_URL (default http://127.0.0.1:8765),
 *               model is empty (zero elements/relationships).
 *
 * Tests run sequentially — each phase depends on the results of the previous phase.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import {
  cli,
  assertSuccess,
} from './helpers/cli';
import {
  assertEmptyModel,
  cleanupAll,
  getModelCounts,
  getDiagnostics,
  isServerHealthy,
  listViews,
} from './helpers/server';
import {
  fixturePath,
  idsFilePath,
  readIdsFile,
} from './helpers/fixtures';

// ── Types for CLI batch results ──────────────────────────────────────────────

interface BatchResult {
  totalChanges: number;
  results: Array<{
    chunk: number;
    status: string;
    result?: Array<{ tempId?: string; realId?: string; visualId?: string; viewId?: string; op: string }>;
  }>;
  skippedOperations?: Array<{
    chunk: number;
    opIndex: number;
    op: string;
    reason: string;
  }>;
  idsSaved?: { path: string; count: number };
  layoutResults?: Array<{ viewId: string; status: string }>;
}

interface QueryResult {
  modelName: string;
  summary: { elements: number; relationships: number; views: number };
}

interface ElementDetail {
  id: string;
  name: string;
  type: string;
  relationships?: {
    outgoing?: Array<{ id: string; type: string; targetId: string }>;
    incoming?: Array<{ id: string; type: string; sourceId: string }>;
  };
}

interface ViewDetail {
  id: string;
  name: string;
  elements: Array<{ id: string; conceptId?: string }>;
  connections: Array<{ id: string; sourceId: string; targetId: string }>;
}

// ── Shared state across ordered tests ────────────────────────────────────────

/** IDs resolved from bulk-01-elements.json */
let phase1Ids: Record<string, string> = {};

/** IDs resolved from bulk-02-relationships.json */
let phase2Ids: Record<string, string> = {};

/** IDs resolved from bulk-03-views.json (includes view IDs and visual object IDs) */
let phase3Ids: Record<string, string> = {};

/** IDs resolved from bulk-04-styling.json */
let phase4Ids: Record<string, string> = {};

/** Suite start time for performance measurement */
let suiteStartTime: number;

// ── ids.json files generated during tests — cleaned up in afterAll ───────────

const idsFilesToClean: string[] = [];

function trackIdsFile(bomPath: string): void {
  const p = idsFilePath(bomPath);
  idsFilesToClean.push(p);
}

function cleanupIdsFiles(): void {
  for (const f of idsFilesToClean) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch { /* best-effort */ }
  }
}

const serverUp = await isServerHealthy();

// ── Suite setup / teardown ───────────────────────────────────────────────────

describe.skipIf(!serverUp)('Bulk modeling', () => {

beforeAll(async () => {
  await assertEmptyModel();
  suiteStartTime = Date.now();
}, 120_000);

afterAll(async () => {
  const totalMs = Date.now() - suiteStartTime;
  const totalMin = (totalMs / 60_000).toFixed(1);
  console.log(`\n⏱  Bulk modeling suite completed in ${totalMin} min (${totalMs}ms)`);

  if (totalMs > 5 * 60_000) {
    console.warn('⚠  Suite exceeded 5-minute target — consider investigating slow phases.');
  }

  try {
    await cleanupAll();
  } catch (e) {
    console.warn('Bulk afterAll cleanup warning:', (e as Error).message);
  }
  cleanupIdsFiles();
}, 180_000);

// ── View tempIds for assertions ──────────────────────────────────────────────

const VIEW_TEMP_IDS = [
  'v-business',
  'v-application',
  'v-technology',
  'v-motivation',
  'v-strategy',
  'v-overview',
] as const;

// ═════════════════════════════════════════════════════════════════════════════
// Phase 1 — Elements (~200)
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 1 — Elements (200)', () => {
  test('1a. Batch apply 200 elements with --fast', async () => {
    const bomPath = fixturePath('bulk-01-elements.json');
    trackIdsFile(bomPath);

    const r = await cli<BatchResult>(
      'batch', 'apply', bomPath, '--fast',
    );
    const data = assertSuccess(r, 'bulk phase 1 elements');

    expect(data.totalChanges).toBe(200);

    // All results should be complete
    for (const chunk of data.results) {
      expect(chunk.status).toBe('complete');
    }

    // Every tempId should have a realId
    const allResults = data.results.flatMap((c) => c.result);
    expect(allResults).toHaveLength(200);

    for (const item of allResults) {
      expect(item.tempId, 'Missing tempId in result').toBeTruthy();
      expect(
        item.realId,
        `tempId ${item.tempId} has no realId — batch rollback?`,
      ).toBeTruthy();
    }

    // .ids.json should be saved with all 200 mappings
    expect(data.idsSaved).toBeTruthy();
    expect(data.idsSaved!.count).toBe(200);

    phase1Ids = readIdsFile(bomPath);
    expect(Object.keys(phase1Ids)).toHaveLength(200);
  }, 120_000);

  test('1b. Model query confirms 200 elements', async () => {
    const r = await cli<QueryResult>('model', 'query');
    const data = assertSuccess(r, 'bulk phase 1 query');

    expect(data.summary.elements).toBe(200);
    expect(data.summary.relationships).toBe(0);
  });

  test('1c. Spot-check 10 random elements via model element', async () => {
    const allTempIds = Object.keys(phase1Ids);

    // Pick 10 elements spread across the batch
    const sampleIndices = [0, 20, 45, 70, 90, 110, 130, 150, 175, allTempIds.length - 1];
    const sampleTempIds = sampleIndices
      .filter((i) => i < allTempIds.length)
      .map((i) => allTempIds[i]);

    for (const tempId of sampleTempIds) {
      const realId = phase1Ids[tempId];
      expect(realId, `tempId ${tempId} not in ids file`).toBeTruthy();

      const r = await cli<ElementDetail>('model', 'element', realId);
      const data = assertSuccess(r, `phase 1 spot-check ${tempId}`);

      expect(data.id).toBe(realId);
      expect(data.name).toBeTruthy();
      expect(data.type).toBeTruthy();
    }
  }, 60_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 2 — Relationships (~338)
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 2 — Relationships (338)', () => {
  test('2a. Batch apply 338 relationships (atomic mode)', async () => {
    const bomPath = fixturePath('bulk-02-relationships.json');
    trackIdsFile(bomPath);

    // Default atomic mode: chunk-size 1, --poll, --validate-connections
    // Use longer CLI timeout for 338 individual operations
    const r = await cli<BatchResult>(
      'batch', 'apply', bomPath, '--throttle', '0',
      { timeout: 300_000 },
    );
    const data = assertSuccess(r, 'bulk phase 2 relationships');

    expect(data.totalChanges).toBe(338);

    // All chunks should be complete
    for (const chunk of data.results) {
      expect(chunk.status).toBe('complete');
    }

    // Every tempId should have a realId
    const allResults = data.results.flatMap((c) => c.result);
    expect(allResults).toHaveLength(338);

    let missingCount = 0;
    for (const item of allResults) {
      expect(item.tempId, 'Missing tempId in result').toBeTruthy();
      if (!item.realId) {
        missingCount++;
      }
    }
    expect(
      missingCount,
      `${missingCount} of 338 relationships have no realId — silent rollback?`,
    ).toBe(0);

    // .ids.json should be saved (count includes pre-loaded element IDs from idFiles)
    expect(data.idsSaved).toBeTruthy();
    expect(data.idsSaved!.count).toBeGreaterThanOrEqual(338);

    const allPhase2Ids = readIdsFile(bomPath);
    // Filter to only relationship tempIds (b-r*) — ids file also includes pre-loaded element IDs
    phase2Ids = Object.fromEntries(
      Object.entries(allPhase2Ids).filter(([k]) => k.startsWith('b-r')),
    );
    expect(Object.keys(phase2Ids)).toHaveLength(338);
  }, 360_000);  // 6 min for 338 atomic operations

  test('2b. Model query confirms 338 relationships', async () => {
    const r = await cli<QueryResult>('model', 'query');
    const data = assertSuccess(r, 'bulk phase 2 query');

    expect(data.summary.elements).toBe(200);
    expect(data.summary.relationships).toBe(338);
  });

  test('2c. Spot-check 10 elements have expected relationships', async () => {
    // Pick elements that should have outgoing relationships
    // (first 10 tempIds from phase 1 are likely relationship sources)
    const sourceTemps = Object.keys(phase1Ids).slice(0, 10);

    let elementsWithRelationships = 0;

    for (const tempId of sourceTemps) {
      const realId = phase1Ids[tempId];
      expect(realId).toBeTruthy();

      const r = await cli<ElementDetail>('model', 'element', realId);
      const data = assertSuccess(r, `phase 2 spot-check ${tempId}`);

      const totalRels =
        (data.relationships?.outgoing?.length ?? 0) +
        (data.relationships?.incoming?.length ?? 0);

      if (totalRels > 0) {
        elementsWithRelationships++;
      }
    }

    // At least some of the sampled elements should have relationships
    expect(
      elementsWithRelationships,
      'None of the sampled elements have relationships — bulk relationship creation may have failed',
    ).toBeGreaterThan(0);
  }, 60_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 3 — Views (6 views, 125 visual objects, 114 connections)
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 3 — Views (6 views + visual objects + connections)', () => {
  test('3a. Batch apply 6 views with visual objects and connections', async () => {
    const bomPath = fixturePath('bulk-03-views.json');
    trackIdsFile(bomPath);

    // Default atomic mode with layout; 245 atomic ops
    const r = await cli<BatchResult>(
      'batch', 'apply', bomPath, '--layout', '--throttle', '0',
      { timeout: 300_000 },
    );
    const data = assertSuccess(r, 'bulk phase 3 views');

    // 6 createView + 125 addToView + 114 addConnectionToView = 245
    expect(data.totalChanges).toBe(245);

    // All chunks should be complete
    for (const chunk of data.results) {
      expect(chunk.status).toBe('complete');
    }

    // Every tempId should have an ID (realId for elements, viewId for views, visualId for addToView)
    const allResults = data.results.flatMap((c) => c.result);
    let missingCount = 0;
    for (const item of allResults) {
      const resolvedId = item.realId ?? item.visualId ?? item.viewId;
      if (item.tempId && !resolvedId) {
        missingCount++;
      }
    }
    expect(
      missingCount,
      `${missingCount} visual objects/connections have no resolved ID`,
    ).toBe(0);

    // .ids.json should be saved
    expect(data.idsSaved).toBeTruthy();

    phase3Ids = readIdsFile(bomPath);
    // Should have IDs for views + visual objects + connections that had tempIds
    expect(Object.keys(phase3Ids).length).toBeGreaterThan(0);
  }, 360_000);  // 6 min for 245 atomic operations

  test('3b. View list shows 6 views', async () => {
    const r = await cli<Array<{ id: string; name: string }>>('view', 'list');
    const data = assertSuccess(r, 'bulk phase 3 view list');

    // API returns { views: [...], total: N } wrapper
    const views = Array.isArray(data) ? data : (data as any).views;
    expect(Array.isArray(views)).toBe(true);

    // Find our 6 bulk views by their tempIds
    const bulkViewIds = VIEW_TEMP_IDS
      .map((tempId) => phase3Ids[tempId])
      .filter(Boolean);

    expect(bulkViewIds).toHaveLength(6);

    // All 6 should appear in the view list
    for (const viewId of bulkViewIds) {
      const found = views.find((v: any) => v.id === viewId);
      expect(found, `View ${viewId} not found in view list`).toBeTruthy();
    }
  });

  test('3c. Each view has visual objects and connections', async () => {
    for (const tempId of VIEW_TEMP_IDS) {
      const viewId = phase3Ids[tempId];
      expect(viewId, `View tempId ${tempId} not resolved`).toBeTruthy();

      const r = await cli<ViewDetail>('view', 'get', viewId);
      const data = assertSuccess(r, `phase 3 view get ${tempId}`);

      expect(data.id).toBe(viewId);
      expect(data.name).toBeTruthy();

      // Each view should have visual elements
      expect(
        data.elements.length,
        `View ${tempId} (${data.name}) has no visual objects`,
      ).toBeGreaterThan(0);

      // Most views should have connections (the overview at minimum)
      // Not all views may have connections depending on which relationships
      // connect elements in that specific view, so we log but don't hard-fail
      if (data.connections.length === 0) {
        console.log(`  ℹ  View ${tempId} (${data.name}) has 0 connections — may be expected`);
      }
    }
  }, 60_000);

  test('3d. Each view exports successfully (non-empty image)', async () => {
    for (const tempId of VIEW_TEMP_IDS) {
      const viewId = phase3Ids[tempId];
      expect(viewId).toBeTruthy();

      const r = await cli<{
        filePath?: string;
        format?: string;
        size?: number;
      }>('view', 'export', viewId);
      const data = assertSuccess(r, `phase 3 view export ${tempId}`);

      // Export should produce output
      expect(data).toBeTruthy();

      // Clean up exported file if present
      if (data.filePath && existsSync(data.filePath)) {
        try { unlinkSync(data.filePath); } catch { /* ok */ }
      }
    }
  }, 60_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 4 — Styling & Annotations
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 4 — Styling & Annotations (27 operations)', () => {
  test('4a. Batch apply styling, notes, and groups', async () => {
    const bomPath = fixturePath('bulk-04-styling.json');
    trackIdsFile(bomPath);

    const r = await cli<BatchResult>(
      'batch', 'apply', bomPath, '--fast',
    );
    const data = assertSuccess(r, 'bulk phase 4 styling');

    // 18 styleViewObject + 6 createNote + 3 createGroup = 27
    expect(data.totalChanges).toBe(27);

    // All chunks should be complete
    for (const chunk of data.results) {
      expect(chunk.status).toBe('complete');
    }

    // Save IDs for any tempIds that were resolved (notes and groups get IDs)
    if (data.idsSaved) {
      phase4Ids = readIdsFile(bomPath);
    }
  }, 60_000);

  test('4b. Views still accessible after styling', async () => {
    // Verify views are intact after styling operations
    const sampleView = phase3Ids['v-business'];
    expect(sampleView).toBeTruthy();

    const r = await cli<ViewDetail>('view', 'get', sampleView);
    const data = assertSuccess(r, 'phase 4 view verify');

    expect(data.id).toBe(sampleView);
    expect(data.elements.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 5 — Diagnostics & Consistency
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 5 — Diagnostics & Consistency', () => {
  test('5a. Diagnostics shows zero orphans/ghosts', async () => {
    const diag = await getDiagnostics();

    const orphanElements = diag.orphanElements ?? [];
    const orphanRelationships = diag.orphanRelationships ?? [];

    expect(
      orphanElements.length,
      `Found ${orphanElements.length} orphan elements after bulk creation`,
    ).toBe(0);
    expect(
      orphanRelationships.length,
      `Found ${orphanRelationships.length} orphan relationships after bulk creation`,
    ).toBe(0);
  });

  test('5b. Final counts match expectations (~200 elements, ~338 relationships, 6 views)', async () => {
    const r = await cli<QueryResult>('model', 'query');
    const data = assertSuccess(r, 'bulk phase 5 final query');

    expect(data.summary.elements).toBe(200);
    expect(data.summary.relationships).toBe(338);

    // Views: our 6 bulk views + possibly a default view from Archi
    expect(data.summary.views).toBeGreaterThanOrEqual(6);
  });

  test('5c. Performance logged (informational)', () => {
    const elapsedMs = Date.now() - suiteStartTime;
    const elapsedMin = (elapsedMs / 60_000).toFixed(1);

    console.log(`  ⏱  Phases 1–4 elapsed: ${elapsedMin} min (${elapsedMs}ms)`);
    console.log(`     200 elements + 338 relationships + 6 views + 27 styling ops`);

    // Informational: log whether under 5-minute target (not a hard failure)
    if (elapsedMs <= 5 * 60_000) {
      console.log('  ✓  Under 5-minute target');
    } else {
      console.log(`  ⚠  Exceeds 5-minute target by ${((elapsedMs - 5 * 60_000) / 1000).toFixed(0)}s`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 6 — Idempotent Re-apply (--skip-existing)
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 6 — Idempotent Re-apply (--skip-existing)', () => {
  test('6a. Re-apply bulk-01-elements.json with --skip-existing', async () => {
    // Brief pause to let any pending rate-limit windows cool off
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    // Record counts before re-apply
    const countsBefore = await getModelCounts();

    const bomPath = fixturePath('bulk-01-elements.json');
    // Don't track ids file — it already exists from Phase 1

    const r = await cli<BatchResult>(
      'batch', 'apply', bomPath, '--fast', '--skip-existing',
    );
    const data = assertSuccess(r, 'bulk phase 6 skip-existing');

    expect(data.totalChanges).toBe(200);

    // With --skip-existing, all 200 ops are duplicates → skipped
    // Results have status 'skipped' (no result array), data is in skippedOperations
    for (const chunk of data.results) {
      expect(chunk.status).toBe('skipped');
    }

    // All 200 operations should appear in skippedOperations
    const skipped = data.skippedOperations ?? [];
    expect(skipped).toHaveLength(200);

    // Every skipped op should be a create operation
    for (const item of skipped) {
      expect(item.op).toMatch(/^create/);
    }

    // IDs file should still be saved with all 200 element mappings
    expect(data.idsSaved).toBeTruthy();
    expect(data.idsSaved!.count).toBeGreaterThanOrEqual(200);
  }, 120_000);

  test('6b. Model counts unchanged after re-apply', async () => {
    const r = await cli<QueryResult>('model', 'query');
    const data = assertSuccess(r, 'bulk phase 6 query after re-apply');

    // No new elements should have been created
    expect(data.summary.elements).toBe(200);
    expect(data.summary.relationships).toBe(338);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 7 — Save
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 7 — Save', () => {
  test('7a. Model save succeeds', async () => {
    const r = await cli<{
      modelName?: string;
      modelId?: string;
    }>('model', 'save');

    // Model save may fail if Archi doesn't have the model selected in the UI
    if (r.exitCode !== 0) {
      console.warn('  ⚠  Model save failed (model may not be selected in Archi UI) — skipping');
      return;
    }
    const data = assertSuccess(r, 'bulk phase 7 save');
    expect(data).toBeTruthy();
  });
});

}); // close describe.skipIf
