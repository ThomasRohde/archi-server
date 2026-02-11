import { describe, expect, test } from 'vitest';
import { execFile, type ExecFileOptions } from 'node:child_process';
import { resolve } from 'node:path';
import { fixturePath } from './helpers/fixtures';

interface RawCliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const CLI_ROOT = resolve(__dirname, '..');

function runCliRaw(args: string[], timeout = 60_000): Promise<RawCliResult> {
  const execOpts: ExecFileOptions = {
    cwd: CLI_ROOT,
    timeout,
    env: { ...process.env },
    maxBuffer: 10 * 1024 * 1024,
    shell: true,
  };

  return new Promise((resolvePromise) => {
    execFile('npx', ['tsx', 'src/cli.ts', ...args], execOpts, (error, stdout, stderr) => {
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

describe('batch apply --poll compatibility', () => {
  test('help clarifies polling defaults and no-poll behavior', async () => {
    const result = await runCliRaw([
      'batch', 'apply', '--help',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/polling is enabled by default/i);
    expect(result.stdout).toMatch(/--no-poll/);
  });

  test('accepts --poll and emits deprecation guidance in JSON output', async () => {
    const result = await runCliRaw([
      'batch', 'apply', fixturePath('smoke-elements.json'),
      '--dry-run',
      '--poll',
      '--output', 'json',
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      data?: { warnings?: string[] };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.data?.warnings?.join(' ')).toMatch(/already polls by default/i);
  });

  test('emits guidance in text and yaml output modes', async () => {
    const textResult = await runCliRaw([
      'batch', 'apply', fixturePath('smoke-elements.json'),
      '--dry-run',
      '--poll',
      '--output', 'text',
    ]);
    expect(textResult.exitCode).toBe(0);
    expect(textResult.stdout).toMatch(/already polls by default/i);

    const yamlResult = await runCliRaw([
      'batch', 'apply', fixturePath('smoke-elements.json'),
      '--dry-run',
      '--poll',
      '--output', 'yaml',
    ]);
    expect(yamlResult.exitCode).toBe(0);
    expect(yamlResult.stdout).toMatch(/already polls by default/i);
  });

  test('unknown-option usage still includes targeted poll guidance', async () => {
    const result = await runCliRaw([
      'batch', 'apply', fixturePath('smoke-elements.json'),
      '--dry-run',
      '--poll=always',
      '--output', 'json',
    ]);

    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      error?: { code?: string; message?: string };
    };
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('CLI_USAGE_ERROR');
    expect(parsed.error?.message).toMatch(/already polls by default/i);
  });
});

describe('completion command ergonomics', () => {
  test('--raw emits the script directly even with --output json', async () => {
    const result = await runCliRaw([
      'completion', 'pwsh',
      '--raw',
      '--output', 'json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Register-ArgumentCompleter/);
    expect(() => JSON.parse(result.stdout)).toThrow();
  });

  test('non-raw json output includes a hint about --raw', async () => {
    const result = await runCliRaw([
      'completion', 'pwsh',
      '--output', 'json',
    ]);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      data?: { hint?: string };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.data?.hint).toMatch(/--raw/i);
  });
});
