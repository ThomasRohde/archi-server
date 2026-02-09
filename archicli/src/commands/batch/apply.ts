import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, extname, resolve } from 'path';
import { validate } from '../../schemas/registry';
import { post } from '../../utils/api';
import { ArgumentValidationError, parsePositiveInt } from '../../utils/args';
import { findDuplicateTempIds, loadBom, loadIdFilesWithDiagnostics } from '../../utils/bom';
import { isCommanderError } from '../../utils/commander';
import { print, success, failure } from '../../utils/output';
import { pollUntilDone, type OperationErrorDetails } from '../../utils/poll';
import { collectTempIdRefs, resolveTempIdsByName, substituteIds } from '../../utils/tempIds';

interface ApplyResponse {
  operationId: string;
  status: string;
  message?: string;
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
          let hadOperationErrors = false;
          for (let i = 0; i < chunks.length; i++) {
            const chunk = substituteIds(chunks[i], tempIdMap);
            const resp = await post<ApplyResponse>('/model/apply', { changes: chunk });

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
            const idsPath =
              typeof options.saveIds === 'string'
                ? resolve(options.saveIds)
                : resolve(dirname(resolve(file)), basename(file, extname(file)) + '.ids.json');
            writeFileSync(idsPath, JSON.stringify(tempIdMap, null, 2));
          }

          const output: Record<string, unknown> = {
            totalChanges: allChanges.length,
            chunks: chunks.length,
            idFiles: idFileDiagnostics,
            results,
          };
          if (allChanges.length === 0) {
            output['warning'] = 'Empty BOM — no changes were applied';
          }

          if (hadOperationErrors) {
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
