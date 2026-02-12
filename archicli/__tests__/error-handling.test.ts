/**
 * CLI error handling tests — validates that the CLI produces correct error responses
 * for invalid inputs, missing resources, and connectivity failures.
 *
 * Precondition: Server running at $ARCHI_BASE_URL (default http://127.0.0.1:8765).
 * Model state: does not matter — these tests exercise error paths, not model mutations.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  cli,
  assertFailure,
} from './helpers/cli';
import {
  isServerHealthy,
} from './helpers/server';
import {
  fixturePath,
  fixturePathUnchecked,
  writeTempBom,
  cleanupTempFiles,
} from './helpers/fixtures';

const serverUp = await isServerHealthy();

// ── Suite setup / teardown ───────────────────────────────────────────────────

describe.skipIf(!serverUp)('CLI error handling', () => {

  afterAll(() => {
    cleanupTempFiles();
  });

  // ── 1. File not found ──────────────────────────────────────────────────────

  test('batch apply with nonexistent file exits non-zero', async () => {
    const result = await cli('batch', 'apply', 'nonexistent-file-that-does-not-exist.json');

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    // The error should mention the file not being found
    const errText = result.error?.message ?? result.stderr;
    expect(errText).toBeTruthy();
  });

  // ── 2. Schema validation error on apply ────────────────────────────────────

  test('batch apply with invalid schema BOM exits non-zero', async () => {
    const result = await cli(
      'batch', 'apply', fixturePath('verify-invalid-schema.json'),
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    // Should report validation errors
    const errCode = result.error?.code ?? '';
    expect(errCode).toMatch(/INVALID_BOM|VALIDATION/i);
  });

  // ── 3. Empty BOM without --allow-empty fails ──────────────────────────────

  test('batch apply with empty BOM fails without --allow-empty', async () => {
    const result = await cli(
      'batch', 'apply', fixturePath('empty.json'),
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    const errCode = result.error?.code ?? '';
    expect(errCode).toBe('EMPTY_BOM');
  });

  // ── 4. Empty BOM with --allow-empty succeeds ──────────────────────────────

  test('batch apply with empty BOM succeeds with --allow-empty', async () => {
    const result = await cli(
      'batch', 'apply', fixturePath('empty.json'), '--allow-empty',
    );

    expect(result.success).toBe(true);
  });

  // ── 5. Nonexistent element ID ──────────────────────────────────────────────

  test('model element with nonexistent ID returns error', async () => {
    const result = await cli('model', 'element', 'id-nonexistent-ffffffff');

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  // ── 6. Nonexistent view ID (get) ──────────────────────────────────────────

  test('view get with nonexistent ID returns error', async () => {
    const result = await cli('view', 'get', 'id-nonexistent-ffffffff');

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  // ── 7. Nonexistent view ID (delete) ───────────────────────────────────────

  test('view delete with nonexistent ID returns error', async () => {
    const result = await cli('view', 'delete', 'id-nonexistent-ffffffff');

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  // ── 8. Nonexistent operation ID ────────────────────────────────────────────

  test('ops status with nonexistent ID returns error', async () => {
    const result = await cli('ops', 'status', 'nonexistent-op-ffffffff');

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  // ── 9. --chunk-size 0 (invalid) ───────────────────────────────────────────

  test('batch apply with --chunk-size 0 fails argument validation', async () => {
    const result = await cli(
      'batch', 'apply', fixturePath('smoke-elements.json'), '--chunk-size', '0',
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    const errCode = result.error?.code ?? '';
    expect(errCode).toBe('INVALID_ARGUMENT');
    expect(result.error?.message).toMatch(/positive integer/i);
  });

  // ── 10. --chunk-size abc (non-numeric) ─────────────────────────────────────

  test('batch apply with --chunk-size abc fails argument validation', async () => {
    const result = await cli(
      'batch', 'apply', fixturePath('smoke-elements.json'), '--chunk-size', 'abc',
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    const errCode = result.error?.code ?? '';
    expect(errCode).toBe('INVALID_ARGUMENT');
    expect(result.error?.message).toMatch(/integer/i);
  });

  // ── 11. Connection refused (unreachable server) ───────────────────────────

  test('health with unreachable server returns connection error', async () => {
    const result = await cli(
      'health',
      { baseUrl: 'http://localhost:19999', timeout: 15_000 },
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  // ── Additional edge cases ─────────────────────────────────────────────────

  test('verify with nonexistent file exits non-zero', async () => {
    // Use fixturePathUnchecked to avoid the existence check in the helper
    const result = await cli('verify', fixturePathUnchecked('this-file-does-not-exist.json'));

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  test('batch apply with duplicate tempId BOM fails validation', async () => {
    const result = await cli(
      'batch', 'apply', fixturePath('verify-duplicate-tempid.json'),
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
    const errCode = result.error?.code ?? '';
    expect(errCode).toBe('INVALID_BOM');
    expect(result.error?.message).toMatch(/[Dd]uplicate/);
  });

  test('view layout with nonexistent view ID returns error', async () => {
    const result = await cli('view', 'layout', 'id-nonexistent-ffffffff');

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  test('view export with nonexistent view ID returns error', async () => {
    const result = await cli('view', 'export', 'id-nonexistent-ffffffff');

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });
});
