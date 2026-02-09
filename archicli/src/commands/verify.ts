import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validate, detectSchema, SCHEMA_NAMES, type KnownSchema } from '../schemas/registry';
import { findDuplicateTempIds, loadBom, loadIdFilesWithDiagnostics, type IdFileDiagnostics } from '../utils/bom';
import { isCommanderError } from '../utils/commander';
import { print, success, failure } from '../utils/output';
import { REFERENCE_ID_FIELDS, resolveTempIdsByName } from '../utils/tempIds';

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
  idFiles: IdFileDiagnostics;
  idFilesLoaded: number;
  resolveNames: boolean;
}

function isRealId(value: string): boolean {
  return value.startsWith('id-');
}

async function validateBomSemantics(
  changes: unknown[],
  idFilePaths: string[],
  options: { resolveNames?: boolean }
): Promise<SemanticResult> {
  const { map: idFileMap, diagnostics: idFiles } = loadIdFilesWithDiagnostics(idFilePaths);
  const errors: SemanticError[] = [];

  const duplicateTempIdErrors = findDuplicateTempIds(changes);
  if (duplicateTempIdErrors.length > 0) {
    errors.push(...duplicateTempIdErrors);
  }

  const declaredTempIds = new Map<string, { index: number; op: string }>();
  for (const [index, change] of changes.entries()) {
    const operation = change as BomOperation;
    if (
      typeof operation.tempId === 'string' &&
      operation.tempId.length > 0 &&
      !declaredTempIds.has(operation.tempId)
    ) {
      declaredTempIds.set(operation.tempId, {
        index,
        op: typeof operation.op === 'string' ? operation.op : 'unknown',
      });
    }
  }

  if (options.resolveNames) {
    const unresolved = new Set<string>();
    for (const change of changes) {
      const operation = change as BomOperation;
      for (const field of REFERENCE_ID_FIELDS) {
        const value = operation[field];
        if (typeof value !== 'string' || isRealId(value)) continue;
        if (declaredTempIds.has(value)) continue;
        if (idFileMap[value] !== undefined) continue;
        unresolved.add(value);
      }
    }
    if (unresolved.size > 0) {
      await resolveTempIdsByName([...unresolved], idFileMap);
    }
  }

  const availableTempIds = new Set<string>(Object.keys(idFileMap));

  for (const change of changes) {
    const operation = change as BomOperation;
    if (operation.op === 'createElement' && typeof operation.tempId === 'string' && operation.tempId.length > 0) {
      availableTempIds.add(operation.tempId);
    }
  }

  const checkReferences = (operation: BomOperation, opIndex: number): void => {
    const opName = typeof operation.op === 'string' ? operation.op : 'unknown';
    for (const field of REFERENCE_ID_FIELDS) {
      const refValue = operation[field];
      if (typeof refValue !== 'string' || isRealId(refValue)) continue;

      if (!declaredTempIds.has(refValue) && idFileMap[refValue] === undefined) {
        errors.push({
          path: `/changes/${opIndex}/${field}`,
          message: `Change ${opIndex} (${opName}): '${field}' references unknown tempId '${refValue}'`,
          hint:
            "This tempId is not declared in the BOM, not in idFiles, not resolvable by --resolve-names (if enabled), and not a real ID (format: id-...).",
        });
        continue;
      }

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

  for (const [index, change] of changes.entries()) {
    const operation = change as BomOperation;
    const opName = typeof operation.op === 'string' ? operation.op : '';
    if (opName === 'createElement' || PHASE3_OPS.has(opName)) continue;

    checkReferences(operation, index);

    if (
      typeof operation.tempId === 'string' &&
      operation.tempId.length > 0 &&
      PHASE2_TEMPID_CREATORS.has(opName)
    ) {
      availableTempIds.add(operation.tempId);
    }
  }

  for (const [index, change] of changes.entries()) {
    const operation = change as BomOperation;
    const opName = typeof operation.op === 'string' ? operation.op : '';
    if (!PHASE3_OPS.has(opName)) continue;
    checkReferences(operation, index);
  }

  return {
    valid: errors.length === 0,
    errors,
    checkedOperations: changes.length,
    idFiles,
    idFilesLoaded: idFiles.loaded,
    resolveNames: options.resolveNames ?? false,
  };
}

export function verifyCommand(): Command {
  return new Command('verify')
    .description(
      'Validate a JSON file against a known schema before sending to the server.\n\n' +
        'Run this before "batch apply" to catch authoring errors (missing required\n' +
        'fields, unknown operation types, invalid structure) without touching the model.\n\n' +
        'Use --semantic for tempId reference preflight.\n' +
        'Use --resolve-names with --semantic to mirror batch apply name resolution.\n\n' +
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
    .option('--resolve-names', 'resolve unresolved tempIds by exact name lookup (requires running server)')
    .action(
      async (
        file: string,
        options: { schema?: string; semantic?: boolean; preflight?: boolean; resolveNames?: boolean },
        cmd: Command
      ) => {
        try {
          const resolvedFile = resolve(file);
          const content = readFileSync(resolvedFile, 'utf-8');
          let data: unknown;
          try {
            data = JSON.parse(content);
          } catch (err) {
            print(failure('PARSE_ERROR', `Not valid JSON: ${String(err)}`));
            cmd.error('', { exitCode: 1 });
            return;
          }

          let schema = options.schema as KnownSchema | undefined;
          if (!schema) {
            schema = detectSchema(data);
            if (!schema) {
              let hint = 'Could not auto-detect schema.';
              const obj = data as Record<string, unknown>;
              if (!obj.version) {
                hint += ' Hint: BOM files require a top-level "version" field set to "1.0" for auto-detection.';
              } else if (obj.version !== '1.0') {
                hint += ` Hint: BOM "version" must be "1.0", found "${obj.version}".`;
              } else if (!obj.changes && !obj.includes) {
                hint += ' Hint: BOM files require either a "changes" array or an "includes" array.';
              }
              hint += ' Use --schema to specify one of: ' + SCHEMA_NAMES.join(', ');
              print(failure('SCHEMA_UNKNOWN', hint));
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

          const schemaValidation = validate(schema, data);
          if (!schemaValidation.valid) {
            print(
              failure('VALIDATION_FAILED', 'File failed schema validation', {
                file,
                schema,
                errors: schemaValidation.errors,
              })
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

          if (schema === 'bom') {
            let loaded;
            try {
              loaded = loadBom(resolvedFile);
            } catch (err) {
              print(failure('INVALID_BOM', String(err)));
              cmd.error('', { exitCode: 1 });
              return;
            }

            const duplicateTempIdErrors = findDuplicateTempIds(loaded.changes);
            if (duplicateTempIdErrors.length > 0) {
              print(
                failure('VALIDATION_FAILED', 'Duplicate tempIds found', {
                  file,
                  schema,
                  checkedOperations: loaded.changes.length,
                  errors: duplicateTempIdErrors,
                })
              );
              cmd.error('', { exitCode: 1 });
              return;
            }

            const runSemantic = Boolean(options.semantic || options.preflight);
            if (runSemantic) {
              const semanticResult = await validateBomSemantics(loaded.changes, loaded.idFilePaths, {
                resolveNames: options.resolveNames,
              });

              if (!semanticResult.valid) {
                print(
                  failure('SEMANTIC_VALIDATION_FAILED', 'BOM failed semantic preflight checks', {
                    file,
                    schema,
                    checkedOperations: semanticResult.checkedOperations,
                    resolveNames: semanticResult.resolveNames,
                    idFilesLoaded: semanticResult.idFilesLoaded,
                    idFiles: semanticResult.idFiles,
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
                  resolveNames: semanticResult.resolveNames,
                  checkedOperations: semanticResult.checkedOperations,
                  idFilesLoaded: semanticResult.idFilesLoaded,
                  idFiles: semanticResult.idFiles,
                })
              );
              return;
            }
          }

          print(success({ file, schema, valid: true }));
        } catch (err) {
          if (isCommanderError(err)) throw err;
          print(failure('VERIFY_ERROR', String(err)));
          cmd.error('', { exitCode: 1 });
        }
      }
    );
}
