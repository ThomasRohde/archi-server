/**
 * Smoke tests — exercises every CLI command against a live Archi server with an empty model.
 *
 * Precondition: Server running at $ARCHI_BASE_URL (default http://127.0.0.1:8765),
 *               model is empty (zero elements/relationships).
 *
 * Tests run sequentially — later tests depend on elements/relationships/views
 * created by earlier tests.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import {
  cli,
  assertSuccess,
  assertFailure,
} from './helpers/cli';
import {
  ensureServer,
  assertEmptyModel,
  cleanupAll,
} from './helpers/server';
import {
  fixturePath,
  idsFilePath,
  readIdsFile,
} from './helpers/fixtures';

// ── Shared state across ordered tests ────────────────────────────────────────

/** Real IDs resolved from smoke-elements.json */
let elementIds: Record<string, string> = {};

/** Real IDs resolved from smoke-relationships.json */
let relationshipIds: Record<string, string> = {};

/** Real IDs resolved from smoke-view.json */
let viewIds: Record<string, string> = {};

/** The smoke view's real ID */
let smokeViewId: string;

// ── ids.json files generated during tests — cleaned up in afterAll ───────────

const idsFiles: string[] = [];

function trackIdsFile(bomPath: string): void {
  const p = idsFilePath(bomPath);
  idsFiles.push(p);
}

function cleanupIdsFiles(): void {
  for (const f of idsFiles) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch { /* best-effort */ }
  }
}

// ── Suite setup / teardown ───────────────────────────────────────────────────

beforeAll(async () => {
  await ensureServer();
  await assertEmptyModel();
}, 30_000);

afterAll(async () => {
  // Clean up all model data created by this suite
  try {
    await cleanupAll();
  } catch (e) {
    console.warn('Smoke afterAll cleanup warning:', (e as Error).message);
  }
  cleanupIdsFiles();
}, 120_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Smoke tests', () => {
  // ── 1. health ────────────────────────────────────────────────────────────

  test('1. archicli health — returns server status', async () => {
    const r = await cli<{ status: string; model: unknown }>('health');
    const data = assertSuccess(r, 'health');

    expect(data.status).toMatch(/^(ok|running)$/);
    expect(data).toHaveProperty('model');
  });

  // ── 2. model query on empty model ────────────────────────────────────────

  test('2. archicli model query — counts all zero on empty model', async () => {
    const r = await cli<{
      summary: { elements: number; relationships: number; views: number };
    }>('model', 'query');
    const data = assertSuccess(r, 'model query empty');

    const counts = data.summary;
    expect(counts.elements).toBe(0);
    expect(counts.relationships).toBe(0);
    // views may include a default view opened for undo support
  });

  // ── 3. model search on empty model ───────────────────────────────────────

  test('3. archicli model search — empty results', async () => {
    const r = await cli<{ results: unknown[] }>('model', 'search', '--type', 'business-actor');
    const data = assertSuccess(r, 'model search empty');

    expect(data.results).toEqual([]);
  });

  // ── 4. folder list ───────────────────────────────────────────────────────

  test('4. archicli folder list — returns folder hierarchy', async () => {
    const r = await cli<{ folders: unknown[] }>('folder', 'list');
    const data = assertSuccess(r, 'folder list');

    // Archi always has a folder structure even in empty models
    expect(data.folders).toBeDefined();
    expect(Array.isArray(data.folders)).toBe(true);
  });

  // ── 5. ops list ──────────────────────────────────────────────────────────

  test('5. archicli ops list — returns operations list', async () => {
    const r = await cli<{ operations: unknown[] }>('ops', 'list');
    const data = assertSuccess(r, 'ops list');

    expect(data.operations).toBeDefined();
    expect(Array.isArray(data.operations)).toBe(true);
  });

  // ── 6. view list on empty model ──────────────────────────────────────────

  test('6. archicli view list — returns list (may include default view)', async () => {
    const r = await cli<{ views: Array<{ id: string; name: string }>; total: number }>('view', 'list');
    const data = assertSuccess(r, 'view list');

    // Data wraps views in an object
    expect(data.views).toBeDefined();
    expect(Array.isArray(data.views)).toBe(true);
  });

  // ── 7. verify valid BOM ──────────────────────────────────────────────────

  test('7. archicli verify valid BOM — exits 0, success', async () => {
    const r = await cli<{ valid: boolean }>('verify', fixturePath('verify-valid.json'));
    const data = assertSuccess(r, 'verify valid');

    expect(data.valid).toBe(true);
  });

  // ── 8. verify invalid schema ─────────────────────────────────────────────

  test('8. archicli verify invalid BOM — exits non-zero, error with details', async () => {
    const r = await cli('verify', fixturePath('verify-invalid-schema.json'));

    // The CLI should report failure
    expect(r.success).toBe(false);
    const err = assertFailure(r, 'verify invalid schema');
    expect(err.message).toBeTruthy();
  });

  // ── 9. verify duplicate tempIds ──────────────────────────────────────────

  test('9. archicli verify duplicate tempIds — exits non-zero, duplicate detection', async () => {
    const r = await cli('verify', fixturePath('verify-duplicate-tempid.json'), '--semantic');

    expect(r.success).toBe(false);
    const err = assertFailure(r, 'verify duplicate tempId');
    expect(err.message).toBeTruthy();
  });

  // ── 10. batch apply smoke-elements.json ──────────────────────────────────

  test('10. batch apply smoke-elements.json — creates 3 elements, saves .ids.json', async () => {
    const bomPath = fixturePath('smoke-elements.json');
    trackIdsFile(bomPath);

    const r = await cli<{
      totalChanges: number;
      results: Array<{
        chunk: number;
        status: string;
        result: Array<{ tempId: string; realId: string; op: string }>;
      }>;
      idsSaved: { path: string; count: number };
    }>('batch', 'apply', bomPath, '--poll');
    const data = assertSuccess(r, 'batch apply smoke-elements');

    expect(data.totalChanges).toBe(3);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].status).toBe('complete');
    expect(data.results[0].result).toHaveLength(3);

    // All tempIds should have realIds
    for (const item of data.results[0].result) {
      expect(item.tempId).toBeTruthy();
      expect(item.realId).toBeTruthy();
    }

    // .ids.json should be saved
    expect(data.idsSaved).toBeTruthy();
    expect(data.idsSaved.count).toBe(3);

    // Read the ids file for subsequent tests
    elementIds = readIdsFile(bomPath);
    expect(Object.keys(elementIds)).toHaveLength(3);
    expect(elementIds['s-actor']).toBeTruthy();
    expect(elementIds['s-app']).toBeTruthy();
    expect(elementIds['s-node']).toBeTruthy();
  });

  // ── 11. model query after element creation ───────────────────────────────

  test('11. archicli model query — counts show 3 elements', async () => {
    const r = await cli<{
      summary: { elements: number; relationships: number };
    }>('model', 'query');
    const data = assertSuccess(r, 'model query after elements');

    expect(data.summary.elements).toBe(3);
    expect(data.summary.relationships).toBe(0);
  });

  // ── 12. model search by type+name ────────────────────────────────────────

  test('12. archicli model search — finds created business-actor', async () => {
    const r = await cli<{
      results: Array<{ id: string; name: string; type: string }>;
    }>('model', 'search', '--type', 'business-actor', '--name', 'Smoke Test Actor');
    const data = assertSuccess(r, 'model search by type+name');

    expect(data.results.length).toBeGreaterThanOrEqual(1);
    const found = data.results.find((el) => el.id === elementIds['s-actor']);
    expect(found).toBeTruthy();
    expect(found!.name).toBe('Smoke Test Actor');
    expect(found!.type).toBe('business-actor');
  });

  // ── 13. model element by ID ──────────────────────────────────────────────

  test('13. archicli model element — returns element details', async () => {
    const actorId = elementIds['s-actor'];
    expect(actorId).toBeTruthy();

    const r = await cli<{
      id: string;
      name: string;
      type: string;
      relationships: { outgoing: unknown[]; incoming: unknown[] };
    }>('model', 'element', actorId);
    const data = assertSuccess(r, 'model element details');

    expect(data.id).toBe(actorId);
    expect(data.name).toBe('Smoke Test Actor');
    expect(data.type).toBe('business-actor');
  });

  // ── 14. batch apply smoke-relationships.json ─────────────────────────────

  test('14. batch apply smoke-relationships.json — creates relationships using idFiles', async () => {
    const bomPath = fixturePath('smoke-relationships.json');
    trackIdsFile(bomPath);

    const r = await cli<{
      totalChanges: number;
      results: Array<{
        chunk: number;
        status: string;
        result: Array<{ tempId: string; realId: string; op: string }>;
      }>;
      idsSaved: { path: string; count: number };
    }>('batch', 'apply', bomPath, '--poll');
    const data = assertSuccess(r, 'batch apply smoke-relationships');

    expect(data.totalChanges).toBe(2);
    expect(data.results[0].status).toBe('complete');
    expect(data.results[0].result).toHaveLength(2);

    // All relationships got real IDs
    for (const item of data.results[0].result) {
      expect(item.realId).toBeTruthy();
    }

    // Read relationship ids
    relationshipIds = readIdsFile(bomPath);
    expect(relationshipIds['s-rel-serving']).toBeTruthy();
    expect(relationshipIds['s-rel-assoc']).toBeTruthy();
  });

  // ── 15. batch apply smoke-view.json ──────────────────────────────────────

  test('15. batch apply smoke-view.json — creates view, adds elements, auto-layouts', async () => {
    const bomPath = fixturePath('smoke-view.json');
    trackIdsFile(bomPath);

    const r = await cli<{
      totalChanges: number;
      results: Array<{
        chunk: number;
        status: string;
        result: Array<{ tempId?: string; realId?: string; op: string }>;
      }>;
      idsSaved: { path: string; count: number };
      layoutResults?: Array<{ viewId: string; status: string }>;
    }>('batch', 'apply', bomPath, '--poll', '--layout');
    const data = assertSuccess(r, 'batch apply smoke-view');

    expect(data.totalChanges).toBe(6); // 1 createView + 3 addToView + 2 addConnectionToView
    expect(data.results[0].status).toBe('complete');

    // Read view ids
    viewIds = readIdsFile(bomPath);
    smokeViewId = viewIds['s-view'];
    expect(smokeViewId).toBeTruthy();
  });

  // ── 16. view list after creation ─────────────────────────────────────────

  test('16. archicli view list — shows created view', async () => {
    const r = await cli<{ views: Array<{ id: string; name: string }>; total: number }>('view', 'list');
    const data = assertSuccess(r, 'view list after creation');

    expect(data.views).toBeDefined();
    expect(Array.isArray(data.views)).toBe(true);
    const found = data.views.find((v) => v.id === smokeViewId);
    expect(found).toBeTruthy();
    expect(found!.name).toBe('Smoke Test View');
  });

  // ── 17. view get ─────────────────────────────────────────────────────────

  test('17. archicli view get — returns view with elements and connections', async () => {
    expect(smokeViewId).toBeTruthy();

    const r = await cli<{
      id: string;
      name: string;
      elements: Array<{ id: string; conceptId?: string }>;
      connections: Array<{ id: string; sourceId: string; targetId: string }>;
    }>('view', 'get', smokeViewId);
    const data = assertSuccess(r, 'view get');

    expect(data.id).toBe(smokeViewId);
    expect(data.name).toBe('Smoke Test View');
    expect(data.elements.length).toBeGreaterThanOrEqual(3);
    expect(data.connections.length).toBeGreaterThanOrEqual(2);
  });

  // ── 18. view export ──────────────────────────────────────────────────────

  test('18. archicli view export — exports image successfully', async () => {
    expect(smokeViewId).toBeTruthy();

    const r = await cli<{
      filePath?: string;
      format?: string;
    }>('view', 'export', smokeViewId);
    const data = assertSuccess(r, 'view export');

    // The export should produce a file path or image data
    expect(data).toBeTruthy();
    // If a file was written, check it exists
    if (data.filePath && existsSync(data.filePath)) {
      // Clean up the exported file
      try { unlinkSync(data.filePath); } catch { /* ok */ }
    }
  });

  // ── 19. view layout ──────────────────────────────────────────────────────

  test('19. archicli view layout — re-layouts view', async () => {
    expect(smokeViewId).toBeTruthy();

    const r = await cli<{
      nodesPositioned?: number;
      durationMs?: number;
    }>('view', 'layout', smokeViewId);
    const data = assertSuccess(r, 'view layout');

    expect(data).toBeTruthy();
    // Should have positioned some nodes
    if (data.nodesPositioned !== undefined) {
      expect(data.nodesPositioned).toBeGreaterThan(0);
    }
  });

  // ── 20. view delete ──────────────────────────────────────────────────────

  test('20. archicli view delete — deletes view', async () => {
    expect(smokeViewId).toBeTruthy();

    const r = await cli('view', 'delete', smokeViewId);
    assertSuccess(r, 'view delete');

    // Verify it's gone
    const listResult = await cli<{ views: Array<{ id: string }> }>('view', 'list');
    const views = assertSuccess(listResult, 'view list after delete');
    const found = (views.views ?? []).find((v) => v.id === smokeViewId);
    expect(found).toBeUndefined();
  });

  // ── 21. model save ───────────────────────────────────────────────────────

  test('21. archicli model save — saves model', async () => {
    const r = await cli<{
      modelName?: string;
      modelId?: string;
    }>('model', 'save');

    // Model save may fail if the model isn't "selected" in Archi's UI.
    // When running in a test context, treat both success and this known error as acceptable.
    if (!r.success && r.error?.code === 'MODEL_SAVE_FAILED' &&
        r.error.message?.includes('currently selected model')) {
      // Known limitation — Archi requires the model to be selected in the UI
      console.warn('  ⚠ Model save skipped: model not selected in Archi UI');
      return;
    }
    const data = assertSuccess(r, 'model save');
    expect(data).toBeTruthy();
  });
});
