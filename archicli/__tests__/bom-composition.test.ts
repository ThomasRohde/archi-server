/**
 * BOM composition tests — validates includes resolution, idFiles cross-session
 * tempId resolution, and circular-include detection.
 *
 * Precondition: Server running at $ARCHI_BASE_URL (default http://127.0.0.1:8765),
 *               model is empty (zero elements/relationships).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cli,
  assertSuccess,
  assertFailure,
} from './helpers/cli';
import {
  ensureServer,
  assertEmptyModel,
  cleanupAll,
  getModelCounts,
  searchElements,
} from './helpers/server';
import {
  fixturePath,
  idsFilePath,
  readIdsFile,
  writeTempBom,
  writeTempFile,
  cleanupTempFiles,
} from './helpers/fixtures';

// ── Types for CLI batch results ──────────────────────────────────────────────

interface BatchResult {
  totalChanges: number;
  results: Array<{
    chunk: number;
    status: string;
    result: Array<{ tempId?: string; realId?: string; op: string }>;
  }>;
  idsSaved?: { path: string; count: number };
}

interface QueryResult {
  modelName: string;
  counts: { elements: number; relationships: number; views: number };
}

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

// ── Suite setup / teardown ───────────────────────────────────────────────────

beforeAll(async () => {
  await ensureServer();
  await assertEmptyModel();
}, 30_000);

afterAll(async () => {
  try {
    await cleanupAll();
  } catch (e) {
    console.warn('BOM composition afterAll cleanup warning:', (e as Error).message);
  }
  cleanupIdsFiles();
  cleanupTempFiles();
}, 120_000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BOM composition — includes', () => {

  // ── 1. Includes resolution: parent + child creates all elements ────────────

  test('batch apply with includes resolves child BOM and creates all elements', async () => {
    const parentPath = fixturePath('includes-parent.json');
    trackIdsFile(parentPath);

    const result = await cli<BatchResult>(
      'batch', 'apply', parentPath, '--poll',
    );

    assertSuccess(result, 'includes parent apply');

    // The parent BOM includes child BOM which has 2 elements (inc-app, inc-data)
    // plus the parent itself adds 1 element (inc-actor) and 1 relationship (inc-rel)
    // Total: 3 elements + 1 relationship = 4 changes
    const data = result.data!;
    expect(data.totalChanges).toBeGreaterThanOrEqual(4);

    // All tempIds should have resolved to real IDs
    const allResults = data.results.flatMap((r) => r.result);
    const resolvedOps = allResults.filter((r) => r.tempId && r.realId);
    expect(resolvedOps.length).toBeGreaterThanOrEqual(4);

    // Verify elements actually exist in the model
    const counts = await getModelCounts();
    expect(counts.elements).toBeGreaterThanOrEqual(3);
    expect(counts.relationships).toBeGreaterThanOrEqual(1);
  });

  // ── 2. Verify with includes passes validation ─────────────────────────────

  test('verify validates BOM with includes successfully', async () => {
    const result = await cli('verify', fixturePath('includes-parent.json'));
    assertSuccess(result, 'verify includes-parent');
  });

  // ── 3. Circular include detection ──────────────────────────────────────────

  test('verify catches circular includes', async () => {
    // Create two temp BOM files that reference each other: A → B → A
    const tempDir = join(require('node:os').tmpdir(), 'archicli-tests');
    require('node:fs').mkdirSync(tempDir, { recursive: true });

    const fileA = join(tempDir, 'circular-a.json');
    const fileB = join(tempDir, 'circular-b.json');

    writeFileSync(fileA, JSON.stringify({
      version: '1.0',
      includes: ['circular-b.json'],
      changes: [
        { op: 'createElement', type: 'business-actor', name: 'A', tempId: 'circ-a' },
      ],
    }, null, 2));

    writeFileSync(fileB, JSON.stringify({
      version: '1.0',
      includes: ['circular-a.json'],
      changes: [
        { op: 'createElement', type: 'business-role', name: 'B', tempId: 'circ-b' },
      ],
    }, null, 2));

    // Track for cleanup
    const trackedFiles = [fileA, fileB];

    try {
      // batch apply should detect the cycle
      const result = await cli('batch', 'apply', fileA, '--poll');
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
      const errText = (result.error?.message ?? '') + (result.error?.code ?? '');
      expect(errText.toLowerCase()).toMatch(/cycle|circular|invalid_bom/i);
    } finally {
      // Clean up temp files
      for (const f of trackedFiles) {
        try { if (existsSync(f)) unlinkSync(f); } catch { /* best-effort */ }
      }
    }
  });
});

describe('BOM composition — idFiles cross-session resolution', () => {

  // ── 4. idFiles from a generated .ids.json resolve tempIds ──────────────────

  test('batch apply with idFiles resolves tempIds from previous session', async () => {
    // Phase 1: Create elements and save .ids.json
    const elemPath = fixturePath('smoke-elements.json');
    trackIdsFile(elemPath);

    const phase1 = await cli<BatchResult>(
      'batch', 'apply', elemPath, '--poll',
    );
    assertSuccess(phase1, 'phase1: create elements');

    // Verify .ids.json was created
    const idsPath = idsFilePath(elemPath);
    expect(existsSync(idsPath)).toBe(true);

    const savedIds = readIdsFile(elemPath);
    expect(Object.keys(savedIds).length).toBeGreaterThanOrEqual(3);

    // Phase 2: Create a temp BOM that uses idFiles to reference phase 1 tempIds
    const relBomPath = writeTempBom(
      [
        {
          op: 'createRelationship',
          type: 'serving-relationship',
          sourceId: 's-app',    // tempId from smoke-elements.json
          targetId: 's-actor',  // tempId from smoke-elements.json
          tempId: 'cross-rel-1',
        },
      ],
      {
        description: 'Cross-session idFiles test',
        idFiles: [idsPath],
      },
    );

    const phase2 = await cli<BatchResult>(
      'batch', 'apply', relBomPath, '--poll',
    );
    assertSuccess(phase2, 'phase2: create relationship via idFiles');

    // The relationship should have been created with a real ID
    const allResults = phase2.data!.results.flatMap((r) => r.result);
    const relResult = allResults.find((r) => r.tempId === 'cross-rel-1');
    expect(relResult).toBeDefined();
    expect(relResult!.realId).toBeTruthy();

    // Verify model state: should have 3 elements + at least 1 relationship
    const counts = await getModelCounts();
    expect(counts.elements).toBeGreaterThanOrEqual(3);
    expect(counts.relationships).toBeGreaterThanOrEqual(1);
  });

  // ── 5. Missing idFiles causes failure (without --allow-incomplete-idfiles) ─

  test('batch apply fails when declared idFiles are missing', async () => {
    const bomPath = writeTempBom(
      [
        { op: 'createElement', type: 'business-actor', name: 'Test', tempId: 'tid-1' },
      ],
      {
        idFiles: ['nonexistent-ids-file.ids.json'],
      },
    );

    const result = await cli('batch', 'apply', bomPath, '--poll');
    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    const errCode = result.error?.code ?? '';
    expect(errCode).toBe('IDFILES_INCOMPLETE');
  });

  // ── 6. --allow-incomplete-idfiles permits missing files ────────────────────

  test('--allow-incomplete-idfiles permits apply with missing idFiles', async () => {
    const bomPath = writeTempBom(
      [
        { op: 'createElement', type: 'business-actor', name: 'Incomplete Idfiles Actor', tempId: 'tid-incomplete' },
      ],
      {
        idFiles: ['nonexistent-ids-file.ids.json'],
      },
    );

    const result = await cli<BatchResult>(
      'batch', 'apply', bomPath, '--poll', '--allow-incomplete-idfiles',
    );
    assertSuccess(result, 'apply with --allow-incomplete-idfiles');

    // The element should still be created despite the missing idFile
    const allResults = result.data!.results.flatMap((r) => r.result);
    const created = allResults.find((r) => r.tempId === 'tid-incomplete');
    expect(created).toBeDefined();
    expect(created!.realId).toBeTruthy();
  });
});
