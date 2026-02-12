import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, extname, resolve } from 'path';
import { validate } from '../../schemas/registry';
import { post, get, ApiError } from '../../utils/api';
import { ArgumentValidationError, parsePositiveInt, parseNonNegativeInt } from '../../utils/args';
import {
  buildIdFileRemediation,
  findDuplicateTempIds,
  loadBom,
  loadIdFilesWithDiagnostics,
  summarizeIdFileCompleteness,
} from '../../utils/bom';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';
import { pollUntilDone, type OperationErrorDetails } from '../../utils/poll';
import { collectTempIdRefs, REFERENCE_ID_FIELDS, resolveTempIdsByName, substituteIds } from '../../utils/tempIds';
import {
  autoResolveVisualIds,
  buildElementToVisualMap,
  buildVisualToElementMap,
  clearElementCache,
  clearRelationshipCache,
  crossValidateConnections,
  type AutoResolutionResult,
  type CrossValidationSummary,
} from '../../utils/crossValidation';

// Minimal `/model/apply` acknowledgment payload before polling.
interface ApplyResponse {
  operationId: string;
  status: string;
  message?: string;
}

// Operation plus original position tracking for duplicate-skip bookkeeping.
interface ChunkOperation {
  change: unknown;
  originalIndexInChunk: number;
}

// Diagnostics for operations skipped due to duplicate/create conflicts.
interface SkippedOperation {
  chunk: number;
  of: number;
  opIndex: number;
  originalChunkIndex: number;
  globalIndex: number;
  op: string;
  reason: string;
}

/**
 * Resolve where tempId mappings should be persisted for this run.
 */
export function resolveIdsOutputPath(file: string, saveIdsOption?: string | boolean): string {
  const sourceFile = resolve(file);
  if (typeof saveIdsOption === 'string') {
    return resolve(saveIdsOption);
  }
  return resolve(dirname(sourceFile), basename(sourceFile, extname(sourceFile)) + '.ids.json');
}

/**
 * Extract duplicate operation index from server validation error messages.
 */
export function parseDuplicateExistingChangeIndex(message: string): number | null {
  if (!/already exists/i.test(message)) return null;
  const match = message.match(/Change\s+(\d+)\s+\([^)]+\):/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

/**
 * Extract existing real ID from duplicate-create validation errors.
 */
export function parseExistingIdFromError(message: string): string | null {
  if (!/already exists/i.test(message)) return null;
  const match = message.match(/\(id:\s*(\S+)\)\s*$/);
  return match ? match[1] : null;
}

/**
 * Build a concise multi-line message for partial chunk failures.
 */
function buildChunkFailureMessage(results: Array<Record<string, unknown>>): string {
  const failed = results.filter((r) => r.status === 'error');
  if (failed.length === 0) return 'One or more chunks failed';

  return failed
    .map((chunk) => {
      const chunkNo = typeof chunk.chunk === 'number' ? chunk.chunk : '?';
      const chunkOf = typeof chunk.of === 'number' ? chunk.of : '?';
      const fallbackMessage =
        typeof chunk.error === 'string' && chunk.error.length > 0
          ? chunk.error
          : 'operation failed';
      const details = (chunk.errorDetails ?? null) as OperationErrorDetails | null;

      if (!details || typeof details !== 'object') {
        return `Chunk ${chunkNo}/${chunkOf}: ${fallbackMessage}`;
      }

      const message =
        typeof details.message === 'string' && details.message.length > 0
          ? details.message
          : fallbackMessage;
      const opNumber = typeof details.opNumber === 'number' ? details.opNumber : null;
      const opName = typeof details.op === 'string' && details.op.length > 0 ? details.op : null;
      const path = typeof details.path === 'string' && details.path.length > 0 ? details.path : null;
      const refField = typeof details.field === 'string' && details.field.length > 0 ? details.field : null;
      const refValue =
        typeof details.reference === 'string' && details.reference.length > 0
          ? details.reference
          : null;
      const hint = typeof details.hint === 'string' && details.hint.length > 0 ? details.hint : null;

      const contextParts: string[] = [];
      if (opNumber !== null) contextParts.push(`op ${opNumber}`);
      if (opName) contextParts.push(opName);
      if (!opNumber && !opName && path) contextParts.push(path);

      const context = contextParts.length > 0 ? `${contextParts.join(' ')}: ` : '';
      const ref = refField && refValue ? ` (${refField}=${refValue})` : '';
      const hintText = hint ? ` Hint: ${hint}` : '';
      return `Chunk ${chunkNo}/${chunkOf}: ${context}${message}${ref}${hintText}`;
    })
    .join('\n');
}

async function collectRecoverySnapshot(): Promise<Record<string, unknown>> {
  const recovery: Record<string, unknown> = {
    mode: 'targeted_recovery',
    nextStep:
      'Re-read current state, reconcile expected vs actual deltas, and retry only minimal missing operations.',
  };

  try {
    recovery['model'] = await post<Record<string, unknown>>('/model/query', {});
  } catch (error) {
    recovery['modelReadError'] = error instanceof Error ? error.message : String(error);
  }

  try {
    recovery['diagnostics'] = await get<Record<string, unknown>>('/model/diagnostics');
  } catch (error) {
    recovery['diagnosticsReadError'] = error instanceof Error ? error.message : String(error);
  }

  return recovery;
}

/**
 * High-level BOM apply pipeline:
 * validate -> flatten -> resolve tempIds -> submit/poll chunks -> persist ids.
 */
export function batchApplyCommand(): Command {
  return new Command('apply')
    .description(
      'Apply a BOM file to the ArchiMate model.\n\n' +
        'CORRECTNESS-FIRST: Operations are submitted in small deterministic batches\n' +
        '(default chunk-size 8) and verified via polling by default. This reduces\n' +
        'GEF CompoundCommand rollback risk while keeping throughput practical.\n\n' +
        'TEMPID RESOLUTION ORDER (per chunk submission):\n' +
        '  1. Declared "idFiles" in the BOM (loaded upfront)\n' +
        '  2. Results from previously polled chunks in this run\n' +
        '  3. Model name lookup for concept IDs if --resolve-names is set\n\n' +
        'EXAMPLE WORKFLOW:\n' +
        '  archicli batch apply model/elements.json\n' +
        '  # creates model/elements.ids.json with tempId->realId map\n' +
        '  archicli batch apply model/views.json\n' +
        '  # views.json declares "idFiles": ["elements.ids.json"] to resolve element refs\n\n' +
        'FAST MODE:\n' +
        '  archicli batch apply model/elements.json --fast\n' +
        '  # chunk-size 20, no connection validation — for bulk creates where speed matters\n\n' +
        'IDEMPOTENT RE-APPLY:\n' +
        '  archicli batch apply model/elements.json --skip-existing\n' +
        '  # safely re-run: skips createElement ops that already exist,\n' +
        '  # recovers their real IDs, and continues with remaining ops'
    )
    .argument('<file>', 'path to BOM JSON file')
    .option('-c, --chunk-size <n>', 'operations per API request (default 8 for reliability, max 1000)', '8')
    .option('--dry-run', 'validate BOM and show what would be submitted, without applying')
    .option('--no-poll', 'disable polling (polling is enabled by default)')
    .option('--poll', '(deprecated) no-op alias; polling is already enabled by default')
    .option('--poll-timeout <ms>', 'polling timeout in ms per chunk', '60000')
    .option('--save-ids [path]', 'save tempId→realId map after apply (default: <file>.ids.json)')
    .option('--no-save-ids', 'skip saving the ID map after apply')
    .option(
      '--resolve-names',
      'query model by exact name for unresolved concept tempIds (does not resolve visual IDs)'
    )
    .option(
      '--allow-incomplete-idfiles',
      'allow apply to continue when declared idFiles are missing or malformed'
    )
    .option(
      '--skip-existing',
      'on duplicate create validation errors, skip only the duplicate change and continue'
    )
    .option(
      '--allow-empty',
      'allow empty BOMs to succeed (exit 0) instead of failing'
    )
    .option(
      '--layout',
      'after successful apply, auto-layout any views that were created or populated'
    )
    .option(
      '--rankdir <dir>',
      'layout direction when using --layout: TB, LR, BT, RL',
      'TB'
    )
    .option(
      '--layout-algorithm <name>',
      'layout algorithm when using --layout: dagre, sugiyama',
      'dagre'
    )
    .option(
      '--continue-on-error',
      'continue processing independent chunks when a chunk fails'
    )
    .option(
      '--no-validate-connections',
      'skip cross-validation of addConnectionToView ops against relationship endpoints'
    )
    .option(
      '--throttle <ms>',
      'delay between chunk submissions in ms (default 50 for atomic mode, 0 for fast mode)',
    )
    .option(
      '--fast',
      'fast mode: chunk-size 20, no connection validation, no throttle — use when speed matters'
    )
    .action(
      async (
        file: string,
        options: {
          chunkSize: string;
          dryRun?: boolean;
          poll: boolean;
          pollTimeout: string;
          saveIds?: string | boolean;
          resolveNames?: boolean;
          allowIncompleteIdfiles?: boolean;
          skipExisting?: boolean;
          allowEmpty?: boolean;
          layout?: boolean;
          rankdir: string;
          layoutAlgorithm: string;
          continueOnError?: boolean;
          validateConnections: boolean;
          throttle?: string;
          fast?: boolean;
        },
        cmd: Command
      ) => {
        try {
          // Phase 1: parse and schema-validate the root BOM file.
          const content = readFileSync(resolve(file), 'utf-8');
          const bom = JSON.parse(content);
          const validation = validate('bom', bom);
          if (!validation.valid) {
            print(failure('INVALID_BOM', 'BOM validation failed', validation.errors));
            cmd.error('', { exitCode: 1 });
            return;
          }

          // Phase 2: flatten includes and re-validate the effective operation list.
          const { changes: allChanges, idFilePaths, includedFiles } = loadBom(file);

          const flattenedValidation = validate('bom', {
            version: '1.0',
            changes: allChanges,
          });
          if (!flattenedValidation.valid) {
            print(
              failure('INVALID_BOM', 'Flattened BOM validation failed', {
                files: includedFiles,
                errors: flattenedValidation.errors,
              })
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

          // Duplicate tempIds are ambiguous and must be rejected before apply.
          const duplicateTempIdErrors = findDuplicateTempIds(allChanges);
          if (duplicateTempIdErrors.length > 0) {
            print(
              failure('INVALID_BOM', 'Duplicate tempIds found in flattened BOM', {
                errors: duplicateTempIdErrors,
              })
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

          const warnings: string[] = [];
          const pollValueSource = cmd.getOptionValueSource('poll');
          if (pollValueSource === 'cli' && options.poll) {
            warnings.push(
              '`batch apply` already polls by default. `--poll` is deprecated; remove it or use `--no-poll` to disable polling.'
            );
          }

          // --fast mode: override to batch-oriented defaults for speed
          if (options.fast) {
            if (options.chunkSize === '8') {
              options.chunkSize = '20';
            }
            options.validateConnections = false;
            warnings.push(`Fast mode enabled: chunk-size ${options.chunkSize}, no connection validation`);
          }

          const chunkSizeInput = parsePositiveInt(options.chunkSize, '--chunk-size');
          const chunkSize = Math.min(1000, chunkSizeInput);
          if (chunkSizeInput > 1000) {
            warnings.push(`--chunk-size capped at maximum of 1000 (requested ${chunkSizeInput})`);
          }

          const pollTimeoutMs = options.poll
            ? parsePositiveInt(options.pollTimeout, '--poll-timeout')
            : undefined;

          const chunks: unknown[][] = [];
          for (let i = 0; i < allChanges.length; i += chunkSize) {
            chunks.push(allChanges.slice(i, i + chunkSize));
          }

          // Load external tempId maps declared by BOM idFiles.
          const { map: tempIdMap, diagnostics: idFileDiagnostics } =
            loadIdFilesWithDiagnostics(idFilePaths);
          const idFilesCompleteness = summarizeIdFileCompleteness(idFileDiagnostics);
          if (!options.allowIncompleteIdfiles && !idFilesCompleteness.complete) {
            const remediation = buildIdFileRemediation(
              idFileDiagnostics,
              `archicli batch apply "${file}"`
            );
            print(
              failure(
                'IDFILES_INCOMPLETE',
                'Declared idFiles could not be fully loaded; apply would run with incomplete tempId mappings',
                {
                  idFiles: idFileDiagnostics,
                  missingPaths: remediation.missingPaths,
                  malformedPaths: remediation.malformedPaths,
                  nextSteps: remediation.nextSteps,
                }
              )
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

          // Stop after validation/planning when requested.
          if (options.dryRun) {
            print(
              success({
                dryRun: true,
                totalChanges: allChanges.length,
                chunks: chunks.length,
                chunkSize,
                idFiles: idFileDiagnostics,
                chunksPreview: chunks.map((chunk, index) => ({
                  chunk: index + 1,
                  operations: chunk.length,
                })),
                ...(warnings.length > 0 ? { warnings } : {}),
              })
            );
            return;
          }

          // Optional best-effort tempId resolution by exact name lookup.
          if (options.resolveNames) {
            const unresolved = collectTempIdRefs(allChanges).filter((tempId) => !tempIdMap[tempId]);
            if (unresolved.length > 0) {
              await resolveTempIdsByName(unresolved, tempIdMap);
            }
          }

          // Build visual-to-element map for connection cross-validation (R5)
          const visualToElementMap = options.validateConnections
            ? buildVisualToElementMap(allChanges)
            : {};
          // Build element-to-visual reverse index for auto-resolution
          const elementToVisualMap = options.validateConnections
            ? buildElementToVisualMap(allChanges)
            : {};
          const connectionValidationSummaries: CrossValidationSummary[] = [];
          const autoResolutionSummaries: AutoResolutionResult[] = [];
          if (options.validateConnections) {
            clearRelationshipCache();
            clearElementCache();
            if (!options.poll) {
              warnings.push('--validate-connections requires --poll to resolve tempIds. Validation was disabled.');
              options.validateConnections = false;
            }
          }

          // Determine inter-chunk throttle delay
          const throttleMs = options.throttle !== undefined
            ? parseNonNegativeInt(options.throttle, '--throttle')
            : (chunkSize <= 8 && !options.fast ? 50 : 0);

          if (!options.poll) {
            warnings.push('Running without --poll: operation results and tempId mappings are not tracked.');
          }

          const results: Array<Record<string, unknown>> = [];
          const skippedOperations: SkippedOperation[] = [];
          let hadOperationErrors = false;
          const failedChunkTempIds = new Set<string>();
          for (let i = 0; i < chunks.length; i++) {
            const chunkStartIndex = i * chunkSize;
            const pendingOps: ChunkOperation[] = chunks[i].map((change, index) => ({
              change,
              originalIndexInChunk: index,
            }));

            // --continue-on-error: skip chunks with unresolved deps from failed prior chunks
            if (options.continueOnError && failedChunkTempIds.size > 0) {
              const hasUnresolvedDep = pendingOps.some((op) => {
                const source = op.change as Record<string, unknown>;
                for (const field of REFERENCE_ID_FIELDS.filter(f => f !== 'id')) {
                  const value = source[field];
                  if (typeof value === 'string' && failedChunkTempIds.has(value)) {
                    return true;
                  }
                }
                return false;
              });
              if (hasUnresolvedDep) {
                results.push({
                  chunk: i + 1,
                  of: chunks.length,
                  operationId: null,
                  status: 'skipped',
                  message: 'Skipped due to unresolved dependencies from a failed chunk',
                });
                // Track tempIds from this skipped chunk as also failed
                for (const op of pendingOps) {
                  const tempId = (op.change as { tempId?: string }).tempId;
                  if (tempId) failedChunkTempIds.add(tempId);
                }
                continue;
              }
            }

            let resp: ApplyResponse | null = null;
            // Retry loop is used only for duplicate-create skipping in --skip-existing mode.
            while (true) {
              if (pendingOps.length === 0) {
                results.push({
                  chunk: i + 1,
                  of: chunks.length,
                  operationId: null,
                  status: 'skipped',
                  message: 'All operations in this chunk were skipped as duplicates',
                });
                break;
              }

              const currentChunk = substituteIds(
                pendingOps.map((op) => op.change),
                tempIdMap
              );

              // Auto-resolve missing sourceVisualId/targetVisualId before validation
              if (options.validateConnections) {
                const autoResolution = await autoResolveVisualIds(
                  currentChunk,
                  tempIdMap,
                  elementToVisualMap,
                );
                if (autoResolution.attempted > 0) {
                  autoResolutionSummaries.push(autoResolution);
                }
              }

              // R5: Cross-validate addConnectionToView operations before submission
              if (options.validateConnections) {
                const originalChunk = pendingOps.map((op) => op.change);
                const validation = await crossValidateConnections(
                  currentChunk,
                  originalChunk,
                  tempIdMap,
                  visualToElementMap,
                );
                if (validation.checked > 0) {
                  connectionValidationSummaries.push(validation);

                  // Log swap warnings to stderr
                  for (const detail of validation.details) {
                    if (detail.swapped && detail.relationship) {
                      warnings.push(
                        `Chunk ${i + 1}: swapped connection direction for relationship "${detail.relationship.name}" ` +
                        `(${detail.relationship.sourceId} -> ${detail.relationship.targetId})`
                      );
                    }
                  }

                  // Fail on complete mismatches (unless --continue-on-error)
                  if (validation.failed > 0) {
                    const errors = validation.details
                      .filter((d) => !d.valid && !d.swapped)
                      .map((d) => d.error)
                      .join('\n');

                    if (!options.continueOnError) {
                      throw new Error(
                        `Connection cross-validation failed for ${validation.failed} operation(s) in chunk ${i + 1}:\n${errors}`
                      );
                    }

                    warnings.push(
                      `Chunk ${i + 1}: ${validation.failed} connection(s) failed validation and were skipped due to --continue-on-error.`
                    );
                  }
                }
              }

              try {
                resp = await post<ApplyResponse>('/model/apply', { changes: currentChunk });
                break;
              } catch (err) {
                if (
                  options.skipExisting &&
                  err instanceof ApiError &&
                  err.status === 400 &&
                  err.code === 'ValidationError'
                ) {
                  const duplicateIndex = parseDuplicateExistingChangeIndex(err.message);
                  if (duplicateIndex !== null && duplicateIndex < pendingOps.length) {
                    const skipped = pendingOps[duplicateIndex];
                    const opValue = (skipped.change as { op?: unknown }).op;
                    const op = typeof opValue === 'string' ? opValue : 'unknown';
                    if (!op.startsWith('create')) {
                      throw err;
                    }
                    // Propagate existing real ID into tempId map so downstream ops can reference it
                    const skippedTempId = (skipped.change as { tempId?: string }).tempId;
                    if (skippedTempId) {
                      const existingRealId = parseExistingIdFromError(err.message);
                      if (existingRealId) {
                        tempIdMap[skippedTempId] = existingRealId;
                      }
                    }
                    pendingOps.splice(duplicateIndex, 1);
                    skippedOperations.push({
                      chunk: i + 1,
                      of: chunks.length,
                      opIndex: duplicateIndex,
                      originalChunkIndex: skipped.originalIndexInChunk,
                      globalIndex: chunkStartIndex + skipped.originalIndexInChunk,
                      op,
                      reason: err.message,
                    });
                    continue;
                  }
                }
                // --continue-on-error: record failure and move to next chunk
                if (options.continueOnError) {
                  hadOperationErrors = true;
                  for (const op of pendingOps) {
                    const tempId = (op.change as { tempId?: string }).tempId;
                    if (tempId) failedChunkTempIds.add(tempId);
                  }
                  results.push({
                    chunk: i + 1,
                    of: chunks.length,
                    operationId: null,
                    status: 'error',
                    error: String(err),
                  });
                  resp = null;
                  break;
                }
                throw err;
              }
            }

            if (!resp) {
              continue;
            }

            let chunkResult: Record<string, unknown> = {
              chunk: i + 1,
              of: chunks.length,
              operationId: resp.operationId,
              status: resp.status,
            };

            if (options.poll) {
              const pollResult = await pollUntilDone(resp.operationId, {
                timeoutMs: pollTimeoutMs,
              });
              chunkResult = { ...chunkResult, ...pollResult };

              if ((pollResult as { status?: string }).status === 'error') {
                hadOperationErrors = true;
                // Track tempIds from this failed chunk for --continue-on-error
                if (options.continueOnError) {
                  for (const op of pendingOps) {
                    const tempId = (op.change as { tempId?: string }).tempId;
                    if (tempId) failedChunkTempIds.add(tempId);
                  }
                }
              }

              const opResults = (pollResult as {
                result?: Array<{
                  tempId?: string;
                  realId?: string;
                  visualId?: string;
                  viewId?: string;
                  noteId?: string;
                  groupId?: string;
                }>;
              }).result ?? [];

              for (const result of opResults) {
                const id =
                  result.realId ??
                  result.visualId ??
                  result.noteId ??
                  result.groupId ??
                  result.viewId;
                if (result.tempId && id) {
                  tempIdMap[result.tempId] = id;
                }
              }
            }

            results.push(chunkResult);

            // Throttle between chunks to avoid rate-limit spikes
            if (throttleMs > 0 && i < chunks.length - 1) {
              await new Promise((r) => setTimeout(r, throttleMs));
            }
          }

          // Persist the merged tempId map only when polling produced stable results.
          const shouldSave = options.saveIds !== false;
          const savedIdCount = Object.keys(tempIdMap).length;
          let idsSavedPath: string | undefined;
          if (shouldSave && options.poll && savedIdCount > 0) {
            idsSavedPath = resolveIdsOutputPath(file, options.saveIds);
            writeFileSync(idsSavedPath, JSON.stringify(tempIdMap, null, 2));
          }

          // --layout: auto-layout views that were created or populated
          const layoutResults: Array<Record<string, unknown>> = [];
          if (options.layout && options.poll && !hadOperationErrors) {
            const viewIdsToLayout = new Set<string>();
            for (const chunkResult of results) {
              const opResults = (chunkResult as {
                result?: Array<{
                  op?: string;
                  viewId?: string;
                  tempId?: string;
                }>;
              }).result;
              if (!Array.isArray(opResults)) continue;
              for (const opResult of opResults) {
                if (opResult.viewId) {
                  viewIdsToLayout.add(opResult.viewId);
                }
              }
            }
            if (viewIdsToLayout.size > 0) {
              const rankdir = options.rankdir?.toUpperCase() ?? 'TB';
              const layoutAlgorithm = (options.layoutAlgorithm ?? 'dagre').toLowerCase();
              const validAlgorithms = ['dagre', 'sugiyama'];
              if (!validAlgorithms.includes(layoutAlgorithm)) {
                throw new ArgumentValidationError(
                  `Invalid --layout-algorithm '${layoutAlgorithm}'. Valid: ${validAlgorithms.join(', ')}`
                );
              }
              for (const viewId of viewIdsToLayout) {
                try {
                  const layoutData = await post(`/views/${encodeURIComponent(viewId)}/layout`, {
                    algorithm: layoutAlgorithm,
                    rankdir,
                    ranksep: 80,
                    nodesep: 50,
                  }) as Record<string, unknown>;
                  layoutResults.push({ viewId, status: 'ok', nodesPositioned: layoutData.nodesPositioned });
                } catch (err) {
                  layoutResults.push({ viewId, status: 'error', error: String(err) });
                  warnings.push(`Layout failed for view ${viewId}: ${String(err)}`);
                }
              }
            }
          }

          // Build final response payload after all chunk/layout work is complete.
          const output: Record<string, unknown> = {
            totalChanges: allChanges.length,
            chunks: chunks.length,
            idFiles: idFileDiagnostics,
            skippedOperations,
            results,
          };
          if (layoutResults.length > 0) {
            output['layoutResults'] = layoutResults;
          }
          if (connectionValidationSummaries.length > 0) {
            const totalChecked = connectionValidationSummaries.reduce((s, v) => s + v.checked, 0);
            const totalSwapped = connectionValidationSummaries.reduce((s, v) => s + v.swapped, 0);
            const totalFailed = connectionValidationSummaries.reduce((s, v) => s + v.failed, 0);
            const totalSkipped = connectionValidationSummaries.reduce((s, v) => s + v.skipped, 0);
            output['connectionValidation'] = {
              checked: totalChecked,
              passed: totalChecked - totalSwapped - totalFailed - totalSkipped,
              swapped: totalSwapped,
              failed: totalFailed,
              skipped: totalSkipped,
            };
          }
          if (autoResolutionSummaries.length > 0) {
            output['autoResolution'] = {
              attempted: autoResolutionSummaries.reduce((sum, item) => sum + item.attempted, 0),
              resolved: autoResolutionSummaries.reduce((sum, item) => sum + item.resolved, 0),
            };
          }
          if (idsSavedPath) {
            output['idsSaved'] = { path: idsSavedPath, count: savedIdCount };
          }
          if (allChanges.length === 0) {
            warnings.push('Empty BOM -- no changes were applied');
            if (!options.allowEmpty) {
              print(
                failure('EMPTY_BOM', 'Empty BOM -- no changes to apply. Use --allow-empty to permit this.')
              );
              cmd.error('', { exitCode: 1 });
              return;
            }
          }
          if (warnings.length > 0) {
            output['warnings'] = warnings;
          }

          if (hadOperationErrors) {
            output['recovery'] = await collectRecoverySnapshot();
            print(
              failure('BATCH_APPLY_PARTIAL_FAILURE', buildChunkFailureMessage(results), output)
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

          print(success(output));
        } catch (err) {
          if (isCommanderError(err)) throw err;
          if (err instanceof ArgumentValidationError) {
            print(failure(err.code, err.message));
            cmd.error('', { exitCode: 1 });
            return;
          }
          const message = String(err);
          if (
            message.includes('Include cycle detected') ||
            message.includes('BOM file not found') ||
            message.includes('Invalid JSON in BOM file')
          ) {
            print(failure('INVALID_BOM', message.replace(/^Error:\s*/, '')));
            cmd.error('', { exitCode: 1 });
            return;
          }
          print(failure('BATCH_APPLY_FAILED', String(err)));
          cmd.error('', { exitCode: 1 });
        }
      }
    );
}
