import { describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cli, assertFailure, assertSuccess } from './helpers/cli';

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

  test('fails on non-empty directory without --force', async () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'archicli-init-nonempty-'));
    try {
      writeFileSync(join(targetDir, 'existing.txt'), 'existing', 'utf-8');
      const result = await cli('init', targetDir);

      expect(result.success).toBe(false);
      const error = assertFailure(result, 'init non-empty');
      expect(error.code).toBe('INIT_DIR_NOT_EMPTY');
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
