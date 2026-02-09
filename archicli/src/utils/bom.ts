import { existsSync, readFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

interface BomFile {
  version: string;
  description?: string;
  changes?: unknown[];
  includes?: string[];
  idFiles?: string[];
}

export interface DuplicateTempIdError {
  path: string;
  message: string;
}

export interface IdFileDiagnostics {
  declared: number;
  loaded: number;
  missing: string[];
  malformed: string[];
  declaredFiles: string[];
  loadedFiles: string[];
}

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

export interface LoadedBom {
  changes: unknown[];
  idFilePaths: string[];
  includedFiles: string[];
}

function formatPath(filePath: string): string {
  const rel = relative(process.cwd(), filePath);
  if (rel && !rel.startsWith('..')) {
    return rel.replace(/\\/g, '/');
  }
  return filePath;
}

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

  return {
    changes: state.changes,
    idFilePaths: state.idFilePaths,
    includedFiles: state.includedFiles,
  };
}

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
