import { existsSync, readFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

interface BomFile {
  version: string;
  description?: string;
  changes?: unknown[];
  includes?: string[];
  idFiles?: string[];
}

/**
 * Duplicate tempId diagnostics normalized to JSON Pointer-like paths.
 */
export interface DuplicateTempIdError {
  path: string;
  message: string;
}

/**
 * Diagnostics from loading idFiles declared in a BOM.
 */
export interface IdFileDiagnostics {
  declared: number;
  loaded: number;
  missing: string[];
  malformed: string[];
  declaredFiles: string[];
  loadedFiles: string[];
}

/**
 * Convenience shape used by commands that need pass/fail completeness checks.
 */
export interface IdFileCompleteness {
  complete: boolean;
  missingCount: number;
  malformedCount: number;
  details: {
    declared: number;
    loaded: number;
    missing: string[];
    malformed: string[];
    declaredFiles: string[];
    loadedFiles: string[];
  };
}

export interface IdFileRemediation {
  missingPaths: string[];
  malformedPaths: string[];
  nextSteps: string[];
}

/**
 * Fully flattened BOM payload and supporting metadata.
 */
export interface LoadedBom {
  changes: unknown[];
  idFilePaths: string[];
  includedFiles: string[];
}

/**
 * Prefer repo-relative paths in diagnostics so output is stable across machines.
 */
function formatPath(filePath: string): string {
  const rel = relative(process.cwd(), filePath);
  if (rel && !rel.startsWith('..')) {
    return rel.replace(/\\/g, '/');
  }
  return filePath;
}

/**
 * Mapping from human-readable accessType strings to integer values.
 */
const ACCESS_TYPE_ALIASES: Record<string, number> = {
  'write': 0,
  'read': 1,
  'access': 2,
  'readwrite': 3,
};

/**
 * Normalize string accessType values to integers for access-relationship operations.
 * Modifies the changes array in-place for performance.
 * Case-insensitive matching. Integer values 0-3 are left unchanged.
 */
export function normalizeAccessTypes(changes: unknown[]): void {
  for (const change of changes) {
    if (typeof change !== 'object' || change === null) continue;

    const op = (change as { op?: unknown }).op;
    const type = (change as { type?: unknown }).type;
    const accessType = (change as { accessType?: unknown }).accessType;

    // Only process createRelationship operations with access-relationship type
    if (op !== 'createRelationship' || type !== 'access-relationship') continue;
    if (accessType === undefined) continue;

    // If accessType is already an integer 0-3, leave it unchanged
    if (typeof accessType === 'number' && accessType >= 0 && accessType <= 3) continue;

    // If accessType is a string, convert to integer
    if (typeof accessType === 'string') {
      const normalized = ACCESS_TYPE_ALIASES[accessType.toLowerCase()];
      if (normalized !== undefined) {
        (change as { accessType: number }).accessType = normalized;
      }
      // If string doesn't match any alias, leave it unchanged - schema validation will catch it
    }
  }
}

/**
 * Detect duplicate tempIds after BOM includes are flattened.
 */
export function findDuplicateTempIds(changes: unknown[]): DuplicateTempIdError[] {
  const seen = new Map<string, number>();
  const errors: DuplicateTempIdError[] = [];
  for (const [index, change] of changes.entries()) {
    const tempId = (change as { tempId?: unknown }).tempId;
    if (typeof tempId !== 'string' || tempId.length === 0) continue;

    if (seen.has(tempId)) {
      errors.push({
        path: `/changes/${index}/tempId`,
        message: `Duplicate tempId '${tempId}' also used at /changes/${seen.get(tempId)}`,
      });
    } else {
      seen.set(tempId, index);
    }
  }
  return errors;
}

/**
 * Load a BOM recursively, resolving include/idFile paths relative to each file.
 * Includes are depth-first and cycles are rejected with a descriptive path trace.
 */
export function loadBom(filePath: string): LoadedBom {
  const root = resolve(filePath);
  const state = {
    changes: [] as unknown[],
    idFilePaths: [] as string[],
    stack: [] as string[],
    inStack: new Set<string>(),
    includedFiles: [] as string[],
  };

  const loadRecursive = (currentPath: string): void => {
    const abs = resolve(currentPath);
    if (state.inStack.has(abs)) {
      const cycleStart = state.stack.indexOf(abs);
      const cycle = [...state.stack.slice(cycleStart), abs].map(formatPath);
      throw new Error(`Include cycle detected: ${cycle.join(' -> ')}`);
    }

    if (!existsSync(abs)) {
      throw new Error(`BOM file not found: ${formatPath(abs)}`);
    }

    let bom: BomFile;
    try {
      bom = JSON.parse(readFileSync(abs, 'utf-8')) as BomFile;
    } catch (err) {
      throw new Error(`Invalid JSON in BOM file ${formatPath(abs)}: ${String(err)}`);
    }

    state.stack.push(abs);
    state.inStack.add(abs);
    state.includedFiles.push(abs);

    const dir = dirname(abs);

    if (Array.isArray(bom.idFiles)) {
      for (const idFile of bom.idFiles) {
        if (typeof idFile !== 'string' || idFile.trim().length === 0) {
          throw new Error(`Invalid idFiles entry in ${formatPath(abs)}: expected a non-empty string`);
        }
        state.idFilePaths.push(resolve(dir, idFile));
      }
    }

    if (Array.isArray(bom.includes)) {
      for (const includeFile of bom.includes) {
        if (typeof includeFile !== 'string' || includeFile.trim().length === 0) {
          throw new Error(`Invalid includes entry in ${formatPath(abs)}: expected a non-empty string`);
        }
        loadRecursive(resolve(dir, includeFile));
      }
    }

    if (Array.isArray(bom.changes)) {
      state.changes.push(...bom.changes);
    }

    state.inStack.delete(abs);
    state.stack.pop();
  };

  loadRecursive(root);

  // Normalize string accessType values to integers before validation
  normalizeAccessTypes(state.changes);

  return {
    changes: state.changes,
    idFilePaths: state.idFilePaths,
    includedFiles: state.includedFiles,
  };
}

/**
 * Best-effort loader for idFiles: missing/malformed files are reported and
 * valid mappings from readable files are merged into a single tempId map.
 */
export function loadIdFilesWithDiagnostics(
  paths: string[]
): { map: Record<string, string>; diagnostics: IdFileDiagnostics } {
  const uniquePaths = [...new Set(paths.map((path) => resolve(path)))];

  const map: Record<string, string> = {};
  const missing: string[] = [];
  const malformed: string[] = [];
  const loadedFiles: string[] = [];

  for (const path of uniquePaths) {
    if (!existsSync(path)) {
      missing.push(formatPath(path));
      continue;
    }

    try {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        malformed.push(formatPath(path));
        continue;
      }
      const record = data as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string') {
          map[key] = value;
        }
      }
      loadedFiles.push(formatPath(path));
    } catch {
      malformed.push(formatPath(path));
    }
  }

  return {
    map,
    diagnostics: {
      declared: uniquePaths.length,
      loaded: loadedFiles.length,
      missing,
      malformed,
      declaredFiles: uniquePaths.map(formatPath),
      loadedFiles,
    },
  };
}

/**
 * Convert detailed idFile diagnostics into a compact completeness summary.
 */
export function summarizeIdFileCompleteness(diagnostics: IdFileDiagnostics): IdFileCompleteness {
  const missingCount = diagnostics.missing.length;
  const malformedCount = diagnostics.malformed.length;
  return {
    complete: missingCount === 0 && malformedCount === 0,
    missingCount,
    malformedCount,
    details: {
      declared: diagnostics.declared,
      loaded: diagnostics.loaded,
      missing: diagnostics.missing,
      malformed: diagnostics.malformed,
      declaredFiles: diagnostics.declaredFiles,
      loadedFiles: diagnostics.loadedFiles,
    },
  };
}

/**
 * Build actionable remediation guidance when declared idFiles are incomplete.
 */
export function buildIdFileRemediation(
  diagnostics: IdFileDiagnostics,
  retryCommand: string
): IdFileRemediation {
  const missingPaths = [...diagnostics.missing];
  const malformedPaths = [...diagnostics.malformed];
  const nextSteps = [
    'Apply the producer BOM first so required *.ids.json mappings are generated.',
    ...(missingPaths.length > 0
      ? [`Missing idFiles: ${missingPaths.join(', ')}`]
      : []),
    ...(malformedPaths.length > 0
      ? ['Malformed idFiles must be valid JSON objects: { "tempId": "id-..." }']
      : []),
    `Re-run the consumer command: ${retryCommand}`,
    'Use --allow-incomplete-idfiles only when you intentionally want best-effort behavior.',
  ];

  return { missingPaths, malformedPaths, nextSteps };
}
