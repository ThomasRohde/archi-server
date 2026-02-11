import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli, assertSuccess } from './helpers/cli';
import { fixturePath } from './helpers/fixtures';

describe('output contract', () => {
  test('non-fatal warnings are structured and not written to stderr', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'archicli-output-contract-'));
    try {
      const result = await cli<{
        warnings?: string[];
      }>('batch', 'split', fixturePath('smoke-elements.json'), '--size', '2', '--output-dir', outputDir, '--force');
      const data = assertSuccess(result, 'batch split --size');

      expect(Array.isArray(data.warnings)).toBe(true);
      expect(data.warnings?.[0]).toMatch(/deprecated/i);
      expect(result.stderr.trim()).toBe('');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
