import { describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli, assertSuccess } from './helpers/cli';

describe('init command', () => {
  test('creates starter templates in target directory', async () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'archicli-init-'));
    try {
      const result = await cli<{
        directory: string;
        files: string[];
      }>('init', targetDir, '--force');
      const data = assertSuccess(result, 'init --force');

      expect(data.directory).toBe(targetDir);
      expect(Array.isArray(data.files)).toBe(true);
      expect(existsSync(join(targetDir, '01-elements.json'))).toBe(true);
      expect(existsSync(join(targetDir, '02-view.json'))).toBe(true);
      expect(existsSync(join(targetDir, 'README.md'))).toBe(true);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  test('creates a starter-bom subdirectory when target is non-empty and --force is not set', async () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'archicli-init-nonempty-'));
    try {
      writeFileSync(join(targetDir, 'existing.txt'), 'existing', 'utf-8');
      const result = await cli<{
        directory: string;
        requestedDirectory?: string;
        warnings?: string[];
      }>('init', targetDir);
      const data = assertSuccess(result, 'init non-empty fallback');

      expect(data.requestedDirectory).toBe(targetDir);
      expect(data.directory).toMatch(/starter-bom/);
      expect(existsSync(join(data.directory, '01-elements.json'))).toBe(true);
      expect(Array.isArray(data.warnings)).toBe(true);
      expect(data.warnings?.[0]).toMatch(/not empty/i);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
