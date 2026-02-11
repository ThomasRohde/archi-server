import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { execFile, type ExecFileOptions } from 'node:child_process';
import { resolve } from 'node:path';
import { ensureServer, cleanupAll } from './helpers/server';
import { cleanupTempFiles, writeTempBom, writeTempFile } from './helpers/fixtures';

interface RawCliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const CLI_ROOT = resolve(__dirname, '..');
const BASE_URL = process.env['ARCHI_BASE_URL'] ?? 'http://127.0.0.1:8765';

function runCliRaw(args: string[], timeout = 60_000): Promise<RawCliResult> {
  const execOpts: ExecFileOptions = {
    cwd: CLI_ROOT,
    timeout,
    env: { ...process.env },
    maxBuffer: 10 * 1024 * 1024,
    shell: true,
  };

  const fullArgs = ['-u', BASE_URL, '--output', 'json', '--quiet', ...args];

  return new Promise((resolvePromise) => {
    execFile('npx', ['tsx', 'src/cli.ts', ...fullArgs], execOpts, (error, stdout, stderr) => {
      let exitCode: number | null = 0;
      if (error) {
        const errWithCode = error as NodeJS.ErrnoException & { code?: unknown; status?: number };
        exitCode = typeof errWithCode.code === 'number'
          ? errWithCode.code
          : errWithCode.status ?? 1;
      }
      resolvePromise({
        stdout: (stdout ?? '').toString(),
        stderr: (stderr ?? '').toString(),
        exitCode,
      });
    });
  });
}

describe('quiet mode output contract', () => {
  beforeAll(async () => {
    await ensureServer();
  }, 30_000);

  afterAll(async () => {
    try {
      await cleanupAll();
    } catch {
      // best-effort cleanup
    }
    cleanupTempFiles();
  }, 120_000);

  test('health returns a data-only status object', async () => {
    const result = await runCliRaw(['health']);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(data).toEqual(expect.objectContaining({ status: expect.any(String) }));
    expect(data).not.toHaveProperty('success');
  });

  test('batch apply returns operationIds only', async () => {
    const bomPath = writeTempBom([
      { op: 'createElement', type: 'business-actor', name: 'Quiet Mode Actor', tempId: 'quiet-actor' },
    ]);

    const result = await runCliRaw(['batch', 'apply', bomPath], 120_000);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout) as { operationIds?: string[] };
    expect(Array.isArray(data.operationIds)).toBe(true);
    expect(data.operationIds?.length).toBeGreaterThan(0);
  });

  test('ops status returns operationId and status', async () => {
    const applyPayloadPath = writeTempFile('quiet-ops-status.json', {
      changes: [
        { op: 'createElement', type: 'application-component', name: 'Quiet Ops Status', tempId: 'quiet-ops' },
      ],
    });

    const applyResult = await runCliRaw(['model', 'apply', applyPayloadPath]);
    expect(applyResult.exitCode).toBe(0);
    const applyData = JSON.parse(applyResult.stdout) as { operationId?: string; status?: string };
    expect(typeof applyData.operationId).toBe('string');
    expect(typeof applyData.status).toBe('string');

    const statusResult = await runCliRaw(
      ['ops', 'status', applyData.operationId as string, '--poll'],
      120_000
    );
    expect(statusResult.exitCode).toBe(0);
    const statusData = JSON.parse(statusResult.stdout) as { operationId?: string; status?: string };
    expect(statusData.operationId).toBe(applyData.operationId);
    expect(statusData.status).toBe('complete');
  });
});
