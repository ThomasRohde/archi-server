/**
 * Fixture helpers — resolve static BOM fixtures and create temporary BOMs.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// ── Paths ────────────────────────────────────────────────────────────────────

/** Absolute path to `archicli/__tests__/fixtures/` */
export const fixtureDir = resolve(__dirname, '..', 'fixtures');

/**
 * Return the absolute path to a named fixture file.
 *
 * @example fixturePath('smoke-elements.json')
 */
export function fixturePath(name: string): string {
  const p = join(fixtureDir, name);
  if (!existsSync(p)) {
    throw new Error(`Fixture not found: ${p}`);
  }
  return p;
}

/**
 * Return the absolute path to a fixture, without checking existence.
 * Useful for testing error paths (e.g. "nonexistent.json").
 */
export function fixturePathUnchecked(name: string): string {
  return join(fixtureDir, name);
}

/**
 * Read and parse a fixture file as JSON.
 */
export function readFixture<T = unknown>(name: string): T {
  const p = fixturePath(name);
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

// ── Temporary BOM files ──────────────────────────────────────────────────────

const tempFiles: string[] = [];

/** Directory for temporary BOM files during tests */
const TEMP_DIR = join(tmpdir(), 'archicli-tests');

/**
 * Write a temporary BOM JSON file and return its absolute path.
 * The file is tracked for cleanup via `cleanupTempFiles()`.
 *
 * @example
 *   const bomPath = writeTempBom([
 *     { op: 'createElement', type: 'business-actor', name: 'Test', tempId: 't-1' }
 *   ]);
 *   const result = await cli('batch', 'apply', bomPath);
 */
export function writeTempBom(
  changes: unknown[],
  options: {
    version?: string;
    description?: string;
    idFiles?: string[];
    includes?: string[];
  } = {},
): string {
  mkdirSync(TEMP_DIR, { recursive: true });
  const filename = `bom-${randomUUID().slice(0, 8)}.json`;
  const filepath = join(TEMP_DIR, filename);

  const bom: Record<string, unknown> = {
    version: options.version ?? '1.0',
    changes,
  };
  if (options.description) bom.description = options.description;
  if (options.idFiles) bom.idFiles = options.idFiles;
  if (options.includes) bom.includes = options.includes;

  writeFileSync(filepath, JSON.stringify(bom, null, 2), 'utf-8');
  tempFiles.push(filepath);

  // Also track the .ids.json that batch apply may create alongside it
  const idsPath = filepath.replace(/\.json$/, '.ids.json');
  tempFiles.push(idsPath);

  return filepath;
}

/**
 * Write a temporary JSON file with arbitrary content from a temp directory.
 * Tracked for cleanup.
 */
export function writeTempFile(name: string, content: unknown): string {
  mkdirSync(TEMP_DIR, { recursive: true });
  const filepath = join(TEMP_DIR, name);
  writeFileSync(filepath, JSON.stringify(content, null, 2), 'utf-8');
  tempFiles.push(filepath);
  return filepath;
}

/**
 * Remove all temporary files created by `writeTempBom()` and `writeTempFile()`.
 * Call in `afterAll` or `afterEach`.
 */
export function cleanupTempFiles(): void {
  for (const f of tempFiles) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // Best-effort: file may already be gone
    }
  }
  tempFiles.length = 0;
}

/**
 * Find the .ids.json file that `batch apply --poll` would have created
 * alongside a given BOM file. Returns the path (may or may not exist).
 */
export function idsFilePath(bomPath: string): string {
  return bomPath.replace(/\.json$/, '.ids.json');
}

/**
 * Read and parse a .ids.json file.
 * Returns a Record mapping tempId → realId.
 */
export function readIdsFile(bomPath: string): Record<string, string> {
  const p = idsFilePath(bomPath);
  if (!existsSync(p)) {
    throw new Error(`IDs file not found: ${p} — did you forget --poll?`);
  }
  return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, string>;
}
