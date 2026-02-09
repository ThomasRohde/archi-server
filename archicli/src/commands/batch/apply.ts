import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, extname, resolve } from 'path';
import { validate } from '../../schemas/registry';
import { post, ApiError } from '../../utils/api';
import { ArgumentValidationError, parsePositiveInt } from '../../utils/args';
import {
  findDuplicateTempIds,
  loadBom,
  loadIdFilesWithDiagnostics,
  summarizeIdFileCompleteness,
} from '../../utils/bom';
import { isCommanderError } from '../../utils/commander';
import { getConfig } from '../../utils/config';
import { print, success, failure } from '../../utils/output';
import { pollUntilDone, type OperationErrorDetails } from '../../utils/poll';
import { collectTempIdRefs, resolveTempIdsByName, substituteIds } from '../../utils/tempIds';

interface ApplyResponse {
  operationId: string;
  status: string;
  message?: string;
}

interface ChunkOperation {
  change: unknown;
  originalIndexInChunk: number;
}

interface SkippedOperation {
  chunk: number;
  of: number;
  opIndex: number;
  originalChunkIndex: number;
  globalIndex: number;
  op: string;
  reason: string;
}

export function resolveIdsOutputPath(file: string, saveIdsOption?: string | boolean): string {
  const sourceFile = resolve(file);
  if (typeof saveIdsOption === 'string') {
    return resolve(saveIdsOption);
  }
  return resolve(dirname(sourceFile), basename(sourceFile, extname(sourceFile)) + '.ids.json');
}

export function parseDuplicateExistingChangeIndex(message: string): number | null {
  if (!/already exists/i.test(message)) return null;
  const match = message.match(/Change\s+(\d+)\s+\([^)]+\):/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

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
    .join(' | ');
}

function summarizeBatchOutputForText(
  output: Record<string, unknown>,
  results: Array<Record<string, unknown>>,
  skippedOperations: SkippedOperation[]
): Record<string, unknown> {
  const complete = results.filter((r) => r.status === 'complete').length;
  const failed = results.filter((r) => r.status === 'error').length;
  const skippedChunks = results.filter((r) => r.status === 'skipped').length;
  const inFlight = results.length - complete - failed - skippedChunks;
  const idFiles = (output['idFiles'] ?? null) as
    | {
        loaded?: number;
        missing?: unknown[];
        malformed?: unknown[];
      }
    | null;

  const summarizedResults = results.map((result) => {
    const details = (result.errorDetails ?? null) as OperationErrorDetails | null;
    const summary: Record<string, unknown> = {
      chunk: result.chunk,
      of: result.of,
      operationId: result.operationId,
      status: result.status,
    };
    if (typeof result.durationMs === 'number') summary['durationMs'] = result.durationMs;
    if (typeof result.error === 'string') summary['error'] = result.error;
    if (details && typeof details === 'object') {
      if (details.path) summary['path'] = details.path;
      if (details.hint) summary['hint'] = details.hint;
    }
    return summary;
  });

  const summary: Record<string, unknown> = {
    totalChanges: output['totalChanges'],
    chunks: output['chunks'],
    chunkStatus: {
      complete,
      error: failed,
      skipped: skippedChunks,
      inFlight,
    },
    idFiles: {
      loaded: idFiles?.loaded ?? 0,
      missing: Array.isArray(idFiles?.missing) ? idFiles?.missing.length : 0,
      malformed: Array.isArray(idFiles?.malformed) ? idFiles?.malformed.length : 0,
    },
    skippedOperations: skippedOperations.length,
    results: summarizedResults,
  };

  if (skippedOperations.length > 0) {
    summary['skippedOperationDetails'] = skippedOperations;
  }

  if (typeof output['warning'] === 'string') {
    summary['warning'] = output['warning'];
  }

  return summary;
}

export function batchApplyCommand(): Command {
  return new Command('apply')
    .description(
      'Apply a BOM file to the ArchiMate model.\n\n' +
        'Large change sets are auto-split into chunks (default 100 ops each) and\n' +
        'submitted sequentially as async operations.\n\n' +
        'ALWAYS USE --poll when:\n' +
        '  - You need real IDs of created elements (required for view population)\n' +
        '  - Your BOM spans multiple chunks (tempIds resolved across chunks via --poll)\n' +
        '  - You want the ID map saved to <file>.ids.json for future BOM files\n\n' +
        'TEMPID RESOLUTION ORDER (per chunk submission):\n' +
        '  1. Declared "idFiles" in the BOM (loaded upfront)\n' +
        '  2. Results from previously polled chunks in this run\n' +
        '  3. Model name lookup if --resolve-names is set\n\n' +
        'SYNC VS ASYNC NOTE:\n' +
        '  "view create" is synchronous, but BOM createView runs through this async\n' +
        '  queue path. Use --poll whenever the run depends on created view IDs.\n\n' +
        'EXAMPLE WORKFLOW:\n' +
        '  archicli batch apply model/elements.json --poll\n' +
        '  # creates model/elements.ids.json with tempId->realId map\n' +
        '  archicli batch apply model/views.json --poll\n' +
        '  # views.json declares "idFiles": ["elements.ids.json"] to resolve element refs'
    )
    .argument('<file>', 'path to BOM JSON file')
    .option('-c, --chunk-size <n>', 'operations per API request (max 1000)', '100')
    .option('--dry-run', 'validate BOM and show what would be submitted, without applying')
    .option('--poll', 'poll /ops/status until each chunk completes')
    .option('--poll-timeout <ms>', 'polling timeout in ms per chunk', '60000')
    .option('--save-ids [path]', 'save tempId→realId map after apply (default: <file>.ids.json)')
    .option('--no-save-ids', 'skip saving the ID map after apply')
    .option('--resolve-names', 'query model by name for any unresolved tempId references')
    .option(
      '--allow-incomplete-idfiles',
      'allow apply to continue when declared idFiles are missing or malformed'
    )
    .option(
      '--skip-existing',
      'on duplicate create validation errors, skip only the duplicate change and continue'
    )
    .action(
      async (
        file: string,
        options: {
          chunkSize: string;
          dryRun?: boolean;
          poll?: boolean;
          pollTimeout: string;
          saveIds?: string | boolean;
          resolveNames?: boolean;
          allowIncompleteIdfiles?: boolean;
          skipExisting?: boolean;
        },
        cmd: Command
      ) => {
        try {
          const content = readFileSync(resolve(file), 'utf-8');
          const bom = JSON.parse(content);
          const validation = validate('bom', bom);
          if (!validation.valid) {
            print(failure('INVALID_BOM', 'BOM validation failed', validation.errors));
            cmd.error('', { exitCode: 1 });
            return;
          }

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

          const chunkSizeInput = parsePositiveInt(options.chunkSize, '--chunk-size');
          const chunkSize = Math.min(1000, chunkSizeInput);
          if (chunkSizeInput > 1000) {
            process.stderr.write(
              `warning: --chunk-size capped at maximum of 1000 (requested ${chunkSizeInput})\n`
            );
          }

          const pollTimeoutMs = options.poll
            ? parsePositiveInt(options.pollTimeout, '--poll-timeout')
            : undefined;

          const chunks: unknown[][] = [];
          for (let i = 0; i < allChanges.length; i += chunkSize) {
            chunks.push(allChanges.slice(i, i + chunkSize));
          }

          const { map: tempIdMap, diagnostics: idFileDiagnostics } =
            loadIdFilesWithDiagnostics(idFilePaths);
          const idFilesCompleteness = summarizeIdFileCompleteness(idFileDiagnostics);
          if (!options.allowIncompleteIdfiles && !idFilesCompleteness.complete) {
            print(
              failure(
                'IDFILES_INCOMPLETE',
                'Declared idFiles could not be fully loaded; apply would run with incomplete tempId mappings',
                {
                  idFiles: idFileDiagnostics,
                }
              )
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

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
              })
            );
            return;
          }

          if (options.resolveNames) {
            const unresolved = collectTempIdRefs(allChanges).filter((tempId) => !tempIdMap[tempId]);
            if (unresolved.length > 0) {
              await resolveTempIdsByName(unresolved, tempIdMap);
            }
          }

          const progressStream = process.stdout.isTTY ? process.stdout : null;

          if (!options.poll) {
            process.stderr.write(
              'Warning: Running without --poll. Operation results will not be tracked.\n' +
                '         Use --poll to wait for completion and save ID mappings.\n\n'
            );
          }

          const results: Array<Record<string, unknown>> = [];
          const skippedOperations: SkippedOperation[] = [];
          let hadOperationErrors = false;
          for (let i = 0; i < chunks.length; i++) {
            const chunkStartIndex = i * chunkSize;
            const pendingOps: ChunkOperation[] = chunks[i].map((change, index) => ({
              change,
              originalIndexInChunk: index,
            }));

            let resp: ApplyResponse | null = null;
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
                onProgress: (status, attempt) => {
                  progressStream?.write(`\r  Chunk ${i + 1}/${chunks.length}: ${status} (${attempt})  `);
                },
              });
              progressStream?.write('\n');
              chunkResult = { ...chunkResult, ...pollResult };

              if ((pollResult as { status?: string }).status === 'error') {
                hadOperationErrors = true;
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
          }

          const shouldSave = options.saveIds !== false;
          if (shouldSave && options.poll && Object.keys(tempIdMap).length > 0) {
            const idsPath = resolveIdsOutputPath(file, options.saveIds);
            writeFileSync(idsPath, JSON.stringify(tempIdMap, null, 2));
          }

          const output: Record<string, unknown> = {
            totalChanges: allChanges.length,
            chunks: chunks.length,
            idFiles: idFileDiagnostics,
            skippedOperations,
            results,
          };
          if (allChanges.length === 0) {
            output['warning'] = 'Empty BOM — no changes were applied';
          }

          if (hadOperationErrors) {
            const failureDetails =
              getConfig().output === 'text'
                ? summarizeBatchOutputForText(output, results, skippedOperations)
                : output;
            print(
              failure('BATCH_APPLY_PARTIAL_FAILURE', buildChunkFailureMessage(results), failureDetails)
            );
            cmd.error('', { exitCode: 1 });
            return;
          }

          const successData =
            getConfig().output === 'text'
              ? summarizeBatchOutputForText(output, results, skippedOperations)
              : output;
          print(success(successData));
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
