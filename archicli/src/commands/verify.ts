import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { print, success, failure } from '../utils/output';
import { validate, detectSchema, SCHEMA_NAMES, type KnownSchema } from '../schemas/registry';
import { loadBom } from './batch/apply';

const REFERENCE_FIELDS = [
  'id',
  'sourceId',
  'targetId',
  'elementId',
  'viewId',
  'relationshipId',
  'sourceVisualId',
  'targetVisualId',
  'parentId',
  'folderId',
  'viewObjectId',
  'connectionId',
] as const;

const PHASE3_OPS = new Set([
  'deleteConnectionFromView',
  'deleteElement',
  'deleteRelationship',
  'deleteView',
]);

const PHASE2_TEMPID_CREATORS = new Set([
  'createRelationship',
  'addToView',
  'createFolder',
  'createNote',
  'createGroup',
  'createView',
]);

interface BomOperation {
  op?: string;
  tempId?: string;
  [key: string]: unknown;
}

interface SemanticError {
  path: string;
  message: string;
  hint?: string;
}

interface SemanticResult {
  valid: boolean;
  errors: SemanticError[];
  checkedOperations: number;
  idFilesLoaded: number;
}

function isRealId(value: string): boolean {
  return value.startsWith('id-');
}

function loadIdFileMap(paths: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, string>;
      Object.assign(map, data);
    } catch {
      // Keep verify resilient: malformed id files are ignored like batch apply.
    }
  }
  return map;
}

function findDuplicateTempIds(changes: unknown[]): SemanticError[] {
  const seen = new Map<string, number>();
  const errors: SemanticError[] = [];
  for (const [i, ch] of changes.entries()) {
    const t = (ch as BomOperation).tempId;
    if (typeof t !== 'string' || t.length === 0) continue;
    if (seen.has(t)) {
      errors.push({
        path: `/changes/${i}/tempId`,
        message: `Duplicate tempId '${t}' also used at /changes/${seen.get(t)}`,
      });
    } else {
      seen.set(t, i);
    }
  }
  return errors;
}

function validateBomSemantics(file: string): SemanticResult {
  const { changes, idFilePaths } = loadBom(file);
  const idFileMap = loadIdFileMap(idFilePaths);
  const errors: SemanticError[] = [];

  const duplicateTempIdErrors = findDuplicateTempIds(changes);
  if (duplicateTempIdErrors.length > 0) {
    errors.push(...duplicateTempIdErrors);
  }

  const declaredTempIds = new Map<string, { index: number; op: string }>();
  for (const [i, ch] of changes.entries()) {
    const o = ch as BomOperation;
    if (typeof o.tempId === 'string' && o.tempId.length > 0 && !declaredTempIds.has(o.tempId)) {
      declaredTempIds.set(o.tempId, { index: i, op: typeof o.op === 'string' ? o.op : 'unknown' });
    }
  }

  const availableTempIds = new Set<string>(Object.keys(idFileMap));

  // Phase 1 in server execution: all createElement operations publish tempIds before other mutations.
  for (const ch of changes) {
    const o = ch as BomOperation;
    if (o.op === 'createElement' && typeof o.tempId === 'string' && o.tempId.length > 0) {
      availableTempIds.add(o.tempId);
    }
  }

  const checkReferences = (operation: BomOperation, opIndex: number): void => {
    const opName = typeof operation.op === 'string' ? operation.op : 'unknown';
    for (const field of REFERENCE_FIELDS) {
      const refValue = operation[field];
      if (typeof refValue !== 'string' || isRealId(refValue)) continue;

      // Only validate values that are known tempIds (declared in BOM or preloaded via idFiles).
      if (!declaredTempIds.has(refValue) && idFileMap[refValue] === undefined) continue;
      if (availableTempIds.has(refValue)) continue;

      const declared = declaredTempIds.get(refValue);
      errors.push({
        path: `/changes/${opIndex}/${field}`,
        message: `Change ${opIndex} (${opName}): '${field}' references tempId '${refValue}' before it is available`,
        hint: declared
          ? `Declared at /changes/${declared.index} (${declared.op}); reorder operations or pre-resolve via idFiles.`
          : `Declare this tempId earlier in the BOM or provide it via idFiles.`,
      });
    }
  };

  // Phase 2 in server execution: non-delete mutations run in order (excluding createElement which ran in phase 1).
  for (const [i, ch] of changes.entries()) {
    const o = ch as BomOperation;
    const opName = typeof o.op === 'string' ? o.op : '';
    if (opName === 'createElement' || PHASE3_OPS.has(opName)) continue;

    checkReferences(o, i);

    if (typeof o.tempId === 'string' && o.tempId.length > 0 && PHASE2_TEMPID_CREATORS.has(opName)) {
      availableTempIds.add(o.tempId);
    }
  }

  // Phase 3 in server execution: delete operations run after all prior phases.
  for (const [i, ch] of changes.entries()) {
    const o = ch as BomOperation;
    const opName = typeof o.op === 'string' ? o.op : '';
    if (!PHASE3_OPS.has(opName)) continue;
    checkReferences(o, i);
  }

  return {
    valid: errors.length === 0,
    errors,
    checkedOperations: changes.length,
    idFilesLoaded: idFilePaths.length,
  };
}

export function verifyCommand(): Command {
  return new Command('verify')
    .description(
      'Validate a JSON file against a known schema before sending to the server.\n\n' +
        'Run this before "batch apply" to catch authoring errors (missing required\n' +
        'fields, unknown operation types, invalid structure) without touching the model.\n\n' +
        'Schema is auto-detected from file structure if --schema is omitted.\n' +
        'Available schemas: ' +
        SCHEMA_NAMES.join(', ')
    )
    .argument('<file>', 'path to JSON file to validate')
    .option(
      '-s, --schema <schema>',
      `schema to validate against (${SCHEMA_NAMES.join('|')}); auto-detected if omitted`
    )
    .option('--semantic', 'run semantic BOM checks (tempId reference preflight)')
    .option('--preflight', 'alias for --semantic')
    .action((file: string, options: { schema?: string; semantic?: boolean; preflight?: boolean }, cmd: Command) => {
      try {
        const resolvedFile = resolve(file);
        const content = readFileSync(resolvedFile, 'utf-8');
        let data: unknown;
        try {
          data = JSON.parse(content);
        } catch (e) {
          print(failure('PARSE_ERROR', `Not valid JSON: ${String(e)}`));
          cmd.error('', { exitCode: 1 });
          return;
        }

        let schema = options.schema as KnownSchema | undefined;
        if (!schema) {
          schema = detectSchema(data);
          if (!schema) {
            print(
              failure(
                'SCHEMA_UNKNOWN',
                'Could not auto-detect schema. Use --schema to specify one of: ' +
                  SCHEMA_NAMES.join(', ')
              )
            );
            cmd.error('', { exitCode: 1 });
            return;
          }
        }

        if (!SCHEMA_NAMES.includes(schema)) {
          print(
            failure(
              'SCHEMA_UNKNOWN',
              `Unknown schema '${schema}'. Available: ${SCHEMA_NAMES.join(', ')}`
            )
          );
          cmd.error('', { exitCode: 1 });
          return;
        }

        const result = validate(schema, data);
        if (!result.valid) {
          print(failure('VALIDATION_FAILED', 'File failed schema validation', { file, schema, errors: result.errors }));
          cmd.error('', { exitCode: 1 });
          return;
        }

        // Extra BOM-specific checks that JSON Schema cannot express
        if (schema === 'bom') {
          const changes = (data as { changes?: unknown[] }).changes ?? [];
          const duplicateTempIdErrors = findDuplicateTempIds(changes);
          if (duplicateTempIdErrors.length > 0) {
            print(
              failure('VALIDATION_FAILED', 'Duplicate tempIds found', {
                file,
                schema,
                errors: duplicateTempIdErrors,
              })
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

          const runSemantic = Boolean(options.semantic || options.preflight);
          if (runSemantic) {
            const semanticResult = validateBomSemantics(resolvedFile);
            if (!semanticResult.valid) {
              print(
                failure('SEMANTIC_VALIDATION_FAILED', 'BOM failed semantic preflight checks', {
                  file,
                  schema,
                  checkedOperations: semanticResult.checkedOperations,
                  idFilesLoaded: semanticResult.idFilesLoaded,
                  errors: semanticResult.errors,
                })
              );
              cmd.error('', { exitCode: 1 });
              return;
            }

            print(
              success({
                file,
                schema,
                valid: true,
                semantic: true,
                checkedOperations: semanticResult.checkedOperations,
                idFilesLoaded: semanticResult.idFilesLoaded,
              })
            );
            return;
          }
        }

        print(success({ file, schema, valid: true }));
      } catch (err) {
        print(failure('VERIFY_ERROR', String(err)));
        cmd.error('', { exitCode: 1 });
      }
    });
}
