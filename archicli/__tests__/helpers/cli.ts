/**
 * CLI test harness — spawns `npx tsx src/cli.ts <args>` and parses CLIResponse JSON.
 *
 * Every test invocation exercises the full Commander parse → fetch → output pipeline.
 */
import { execFile, type ExecFileOptions } from 'node:child_process';
import { resolve } from 'node:path';

// ── Types mirroring src/utils/output.ts ──────────────────────────────────────

export interface CLIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: string;
    durationMs?: number;
  };
}

export interface CLIResult<T = unknown> {
  /** Parsed CLIResponse (null when stdout was not valid JSON) */
  response: CLIResponse<T> | null;
  /** Shorthand: response?.success ?? false */
  success: boolean;
  /** Shorthand: response?.data */
  data: T | undefined;
  /** Shorthand: response?.error */
  error: CLIResponse['error'] | undefined;
  /** Shorthand: response?.metadata */
  metadata: CLIResponse['metadata'] | undefined;
  /** Raw stdout */
  stdout: string;
  /** Raw stderr */
  stderr: string;
  /** Process exit code (null if killed by signal) */
  exitCode: number | null;
}

// ── Configuration ────────────────────────────────────────────────────────────

const CLI_ROOT = resolve(__dirname, '..', '..');

/** Default timeout per CLI invocation (ms) */
const DEFAULT_TIMEOUT = 60_000;

/** Base URL for the Archi server */
const DEFAULT_BASE_URL = process.env['ARCHI_BASE_URL'] ?? 'http://127.0.0.1:8765';

export interface CLIOptions {
  /** Override timeout for this invocation (ms). Default: 60 000. */
  timeout?: number;
  /** Extra environment variables merged over process.env. */
  env?: Record<string, string>;
  /** Working directory. Default: archicli/ root. */
  cwd?: string;
  /** Base URL override (passed via -u flag). */
  baseUrl?: string;
  /** When true, adds --quiet flag. */
  quiet?: boolean;
}

// ── Core helper ──────────────────────────────────────────────────────────────

/**
 * Spawn the CLI and return the parsed result.
 *
 * @example
 *   const r = await cli('health');
 *   expect(r.success).toBe(true);
 *
 * @example
 *   const r = await cli('batch', 'apply', fixturePath('smoke-elements.json'));
 */
export function cli<T = unknown>(...rawArgs: (string | CLIOptions)[]): Promise<CLIResult<T>> {
  // Separate trailing options object from positional args
  let options: CLIOptions = {};
  const args: string[] = [];

  for (const arg of rawArgs) {
    if (typeof arg === 'string') {
      args.push(arg);
    } else {
      options = arg;
    }
  }

  // Always request JSON output
  if (!args.includes('--output')) {
    args.push('--output', 'json');
  }

  // Inject base URL
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  if (!args.includes('-u') && !args.includes('--base-url')) {
    args.unshift('-u', baseUrl);
  }

  // Inject --quiet when requested
  if (options.quiet && !args.includes('-q') && !args.includes('--quiet')) {
    args.push('--quiet');
  }

  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const cwd = options.cwd ?? CLI_ROOT;

  const execOpts: ExecFileOptions = {
    cwd,
    timeout,
    env: { ...process.env, ...options.env },
    maxBuffer: 10 * 1024 * 1024, // 10 MB — bulk tests produce large output
    shell: true, // Required on Windows where npx is a .cmd batch script
  };

  return new Promise<CLIResult<T>>((resolvePromise) => {
    execFile(
      'npx',
      ['tsx', 'src/cli.ts', ...args],
      execOpts,
      (error, stdout, stderr) => {
        const rawStdout = (stdout ?? '').toString();
        const rawStderr = (stderr ?? '').toString();

        // Determine exit code
        let exitCode: number | null = 0;
        if (error) {
          const errWithCode = error as NodeJS.ErrnoException & { code?: unknown; status?: number };
          exitCode = typeof errWithCode.code === 'number'
            ? errWithCode.code
            : errWithCode.status ?? 1;
        }

        // Parse CLIResponse from stdout
        let response: CLIResponse<T> | null = null;
        try {
          const trimmed = rawStdout.trim();
          if (trimmed.startsWith('{')) {
            response = JSON.parse(trimmed) as CLIResponse<T>;
          }
        } catch {
          // stdout was not valid JSON — response stays null
        }

        resolvePromise({
          response,
          success: response?.success ?? false,
          data: response?.data,
          error: response?.error,
          metadata: response?.metadata,
          stdout: rawStdout,
          stderr: rawStderr,
          exitCode,
        });
      },
    );
  });
}

// ── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Assert that a CLI result succeeded and return the typed data.
 * Throws a descriptive error on failure.
 */
export function assertSuccess<T>(result: CLIResult<T>, context?: string): T {
  const prefix = context ? `[${context}] ` : '';
  if (!result.success || !result.response?.success) {
    const errMsg = result.error?.message ?? result.stderr?.slice(0, 500) ?? 'unknown error';
    const errCode = result.error?.code ?? 'NO_CODE';
    throw new Error(
      `${prefix}CLI command failed (${errCode}): ${errMsg}\n` +
      `  exit=${result.exitCode}\n` +
      `  stdout=${result.stdout.slice(0, 1000)}\n` +
      `  stderr=${result.stderr.slice(0, 500)}`
    );
  }
  return result.data as T;
}

/**
 * Assert that a CLI result failed (success=false or non-zero exit).
 * Returns the error object.
 */
export function assertFailure(result: CLIResult, context?: string): NonNullable<CLIResponse['error']> {
  const prefix = context ? `[${context}] ` : '';
  if (result.success) {
    throw new Error(
      `${prefix}Expected CLI failure but got success.\n` +
      `  data=${JSON.stringify(result.data).slice(0, 500)}`
    );
  }
  return result.error ?? { code: 'UNKNOWN', message: 'No error details available' };
}
