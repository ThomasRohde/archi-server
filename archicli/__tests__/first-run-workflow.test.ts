import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, assertSuccess } from './helpers/cli';
import { ensureServer, cleanupAll } from './helpers/server';

const tempDirs: string[] = [];

function trackDir(dir: string): void {
  tempDirs.push(dir);
}

describe('first-run onboarding workflow', () => {
  beforeAll(async () => {
    await ensureServer();
    await cleanupAll();
  }, 60_000);

  afterAll(async () => {
    try {
      await cleanupAll();
    } catch {
      // best-effort cleanup
    }
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  test('init -> verify --semantic -> ordered batch apply -> view export sanity', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'archicli-onboarding-'));
    trackDir(workspaceRoot);
    writeFileSync(join(workspaceRoot, 'keep.txt'), 'existing content', 'utf-8');

    const init = await cli<{
      directory: string;
      requestedDirectory?: string;
      files: string[];
      warnings?: string[];
    }>('init', workspaceRoot);
    const initData = assertSuccess(init, 'init starter workflow');

    expect(initData.requestedDirectory).toBe(workspaceRoot);
    expect(initData.directory).not.toBe(workspaceRoot);
    expect(initData.directory).toMatch(/starter-bom/);
    expect(existsSync(join(initData.directory, '01-elements.json'))).toBe(true);
    expect(existsSync(join(initData.directory, '02-view.json'))).toBe(true);
    expect(Array.isArray(initData.warnings)).toBe(true);

    const elementsBom = join(initData.directory, '01-elements.json');
    const viewBom = join(initData.directory, '02-view.json');

    assertSuccess(
      await cli('verify', elementsBom, '--semantic'),
      'verify starter elements'
    );

    const applyElements = await cli<{ idsSaved?: { path: string; count: number } }>(
      'batch',
      'apply',
      elementsBom
    );
    const applyElementsData = assertSuccess(applyElements, 'apply starter elements');
    expect(applyElementsData.idsSaved?.count).toBeGreaterThan(0);

    assertSuccess(
      await cli('verify', viewBom, '--semantic'),
      'verify starter view'
    );

    assertSuccess(
      await cli('batch', 'apply', viewBom, '--layout'),
      'apply starter view'
    );

    const viewList = assertSuccess(
      await cli<{ views: Array<{ id: string; name: string }> }>('view', 'list'),
      'view list after starter apply'
    );
    expect(viewList.views.some((view) => view.name === 'Application Overview')).toBe(true);

    const exportDir = join(initData.directory, 'exports');
    const exportResult = assertSuccess(
      await cli<{ exported: number; total: number }>(
        'view',
        'export',
        '--all',
        '--dir',
        exportDir
      ),
      'export starter views'
    );
    expect(exportResult.exported).toBeGreaterThan(0);
    expect(readdirSync(exportDir).length).toBeGreaterThan(0);
  }, 180_000);
});
