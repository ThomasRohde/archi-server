import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validate, detectSchema, SCHEMA_NAMES, type KnownSchema } from '../schemas/registry';
import {
  findDuplicateTempIds,
  loadBom,
  loadIdFilesWithDiagnostics,
  summarizeIdFileCompleteness,
  type IdFileDiagnostics,
} from '../utils/bom';
import { isCommanderError } from '../utils/commander';
import { print, success, failure } from '../utils/output';
import { REFERENCE_ID_FIELDS, resolveTempIdsByName } from '../utils/tempIds';

// Operations intentionally checked after forward-reference validation.
const PHASE3_OPS = new Set([
  'deleteConnectionFromView',
  'deleteElement',
  'deleteRelationship',
  'deleteView',
]);

// Operations that can introduce new tempIds for later references.
const PHASE2_TEMPID_CREATORS = new Set([
  'createElement',
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

/**
 * Run BOM semantic validation beyond JSON schema checks.
 * Verifies tempId availability/order and basic connection direction consistency.
 */
export async function validateBomSemantics(
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

  // Validate references against declared/loaded tempIds and execution ordering rules.
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
    if (PHASE3_OPS.has(opName)) continue;

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

  // Phase 4: Validate addConnectionToView direction consistency
  // Build maps of relationship tempId -> { sourceId, targetId }
  // and addToView tempId -> elementId
  const relationshipMeta = new Map<string, { sourceId: string; targetId: string }>();
  const visualToElement = new Map<string, string>();

  for (const change of changes) {
    const operation = change as BomOperation;
    if (operation.op === 'createRelationship') {
      const tempId = typeof operation.tempId === 'string' ? operation.tempId : '';
      const sourceId = typeof operation.sourceId === 'string' ? operation.sourceId : '';
      const targetId = typeof operation.targetId === 'string' ? operation.targetId : '';
      if (tempId && sourceId && targetId) {
        relationshipMeta.set(tempId, { sourceId, targetId });
      }
    }
    if (operation.op === 'addToView') {
      const tempId = typeof operation.tempId === 'string' ? operation.tempId : '';
      const elementId = typeof operation.elementId === 'string' ? operation.elementId : '';
      if (tempId && elementId) {
        visualToElement.set(tempId, elementId);
      }
    }
  }

  for (const [index, change] of changes.entries()) {
    const operation = change as BomOperation;
    if (operation.op !== 'addConnectionToView') continue;

    const relationshipId = typeof operation.relationshipId === 'string' ? operation.relationshipId : '';
    const sourceVisualId = typeof operation.sourceVisualId === 'string' ? operation.sourceVisualId : '';
    const targetVisualId = typeof operation.targetVisualId === 'string' ? operation.targetVisualId : '';

    // Only validate if we have BOM-local metadata for all three references
    const relMeta = relationshipMeta.get(relationshipId);
    if (!relMeta) continue;
    const sourceElementId = visualToElement.get(sourceVisualId);
    const targetElementId = visualToElement.get(targetVisualId);
    if (!sourceElementId || !targetElementId) continue;

    if (sourceElementId === relMeta.sourceId && targetElementId === relMeta.targetId) {
      // Correct direction
      continue;
    }

    if (sourceElementId === relMeta.targetId && targetElementId === relMeta.sourceId) {
      errors.push({
        path: `/changes/${index}/sourceVisualId`,
        message: `Change ${index} (addConnectionToView): sourceVisualId/targetVisualId are swapped relative to relationship direction`,
        hint: `Relationship '${relationshipId}' connects '${relMeta.sourceId}' → '${relMeta.targetId}', ` +
          `but sourceVisualId '${sourceVisualId}' represents '${sourceElementId}' and targetVisualId '${targetVisualId}' represents '${targetElementId}'. ` +
          `Swap sourceVisualId and targetVisualId.`,
      });
    } else {
      errors.push({
        path: `/changes/${index}/sourceVisualId`,
        message: `Change ${index} (addConnectionToView): visual objects do not match relationship source/target`,
        hint: `Relationship '${relationshipId}' connects '${relMeta.sourceId}' → '${relMeta.targetId}', ` +
          `but sourceVisualId '${sourceVisualId}' represents '${sourceElementId}' and targetVisualId '${targetVisualId}' represents '${targetElementId}'.`,
      });
    }
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

/**
 * Validate schema (and optionally semantics) for JSON payloads before apply.
 */
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
    .option(
      '--allow-incomplete-idfiles',
      'allow semantic validation to continue when declared idFiles are missing or malformed'
    )
    .action(
      async (
        file: string,
        options: {
          schema?: string;
          semantic?: boolean;
          preflight?: boolean;
          resolveNames?: boolean;
          allowIncompleteIdfiles?: boolean;
        },
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

          let bomOpCount = 0;
          if (schema === 'bom') {
            let loaded;
            try {
              loaded = loadBom(resolvedFile);
              bomOpCount = loaded.changes.length;
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
              const idFilesCompleteness = summarizeIdFileCompleteness(semanticResult.idFiles);
              if (!options.allowIncompleteIdfiles && !idFilesCompleteness.complete) {
                print(
                  failure(
                    'IDFILES_INCOMPLETE',
                    'Declared idFiles could not be fully loaded; semantic validation is incomplete',
                    {
                      file,
                      schema,
                      checkedOperations: semanticResult.checkedOperations,
                      resolveNames: semanticResult.resolveNames,
                      idFilesLoaded: semanticResult.idFilesLoaded,
                      idFiles: semanticResult.idFiles,
                    }
                  )
                );
                cmd.error('', { exitCode: 1 });
                return;
              }

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

          const output: Record<string, unknown> = { file, schema, valid: true };
          if (bomOpCount > 0) {
            output['operations'] = bomOpCount;
          }
          print(success(output));
        } catch (err) {
          if (isCommanderError(err)) throw err;
          print(failure('VERIFY_ERROR', String(err)));
          cmd.error('', { exitCode: 1 });
        }
      }
    );
}
