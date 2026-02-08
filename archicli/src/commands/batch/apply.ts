import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import { post } from '../../utils/api';
import { print, success, failure } from '../../utils/output';
import { pollUntilDone } from '../../utils/poll';
import { validate } from '../../schemas/registry';

interface BomFile {
  version: string;
  description?: string;
  changes?: unknown[];
  includes?: string[];
  idFiles?: string[];
}

interface LoadedBom {
  changes: unknown[];
  idFilePaths: string[];
}

export function loadBom(filePath: string): LoadedBom {
  const abs = resolve(filePath);
  const content = readFileSync(abs, 'utf-8');
  const bom = JSON.parse(content) as BomFile;
  const dir = dirname(abs);

  const changes: unknown[] = [];
  const idFilePaths: string[] = [];

  // Collect idFiles declared in this file (resolved to absolute paths)
  if (Array.isArray(bom.idFiles)) {
    for (const p of bom.idFiles) {
      idFilePaths.push(resolve(dir, p));
    }
  }

  // Resolve includes recursively
  if (Array.isArray(bom.includes)) {
    for (const inc of bom.includes) {
      const child = loadBom(resolve(dir, inc));
      changes.push(...child.changes);
      idFilePaths.push(...child.idFilePaths);
    }
  }

  // Append inline changes
  if (Array.isArray(bom.changes)) {
    changes.push(...bom.changes);
  }

  return { changes, idFilePaths };
}

/**
 * Load tempId→realId mappings from .ids.json files.
 * Missing files are silently skipped.
 */
function loadIdFiles(paths: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, string>;
        Object.assign(map, data);
      } catch {
        // ignore malformed id files
      }
    }
  }
  return map;
}

/**
 * Replace tempId references in a chunk with real IDs from the map.
 * Rewrites `id`, `sourceId`, `targetId` fields.
 */
function substituteIds(chunk: unknown[], map: Record<string, string>): unknown[] {
  if (Object.keys(map).length === 0) return chunk;
  return chunk.map((op) => {
    const o = op as Record<string, unknown>;
    const patched: Record<string, unknown> = { ...o };
    for (const field of [
      'id', 'sourceId', 'targetId', 'elementId', 'viewId',
      'relationshipId', 'sourceVisualId', 'targetVisualId',
      'parentId', 'folderId', 'viewObjectId', 'connectionId',
    ]) {
      const v = o[field];
      if (typeof v === 'string' && map[v]) patched[field] = map[v];
    }
    return patched;
  });
}

interface ApplyResponse {
  operationId: string;
  status: string;
  message?: string;
}

interface SearchResponse {
  results: Array<{ id: string; name: string; type: string }>;
}

/**
 * Query the model for any tempIds not yet resolved, matching by name.
 * Populates map in-place.
 */
async function resolveByName(
  tempIds: string[],
  map: Record<string, string>
): Promise<void> {
  for (const tempId of tempIds) {
    if (map[tempId]) continue;
    try {
      const resp = await post<SearchResponse>('/model/search', { namePattern: `^${tempId}$` });
      if (resp.results && resp.results.length > 0) {
        map[tempId] = resp.results[0].id;
      }
    } catch {
      // skip unresolvable
    }
  }
}

/**
 * Collect all tempId references used in a set of operations.
 */
function collectTempIdRefs(changes: unknown[]): string[] {
  const refs = new Set<string>();
  for (const op of changes) {
    const o = op as Record<string, unknown>;
    for (const field of [
      'id', 'sourceId', 'targetId', 'elementId', 'viewId',
      'relationshipId', 'sourceVisualId', 'targetVisualId',
      'parentId', 'folderId', 'viewObjectId', 'connectionId',
    ]) {
      const v = o[field];
      if (typeof v === 'string') refs.add(v);
    }
  }
  // Only those that look like tempIds (not real IDs starting with "id-")
  return [...refs].filter((r) => !r.startsWith('id-'));
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
          // Validate the BOM file first
          const content = readFileSync(resolve(file), 'utf-8');
          const bom = JSON.parse(content);
          const validation = validate('bom', bom);
          if (!validation.valid) {
            print(failure('INVALID_BOM', 'BOM validation failed', validation.errors));
            cmd.error('', { exitCode: 1 });
            return;
          }

          // Load and flatten all changes (resolving includes), collect idFiles
          const { changes: allChanges, idFilePaths } = loadBom(file);
          const chunkSize = Math.min(1000, Math.max(1, parseInt(options.chunkSize, 10) || 100));
          const chunks: unknown[][] = [];
          for (let i = 0; i < allChanges.length; i += chunkSize) {
            chunks.push(allChanges.slice(i, i + chunkSize));
          }

          if (options.dryRun) {
            print(
              success({
                dryRun: true,
                totalChanges: allChanges.length,
                chunks: chunks.length,
                chunkSize,
                idFilePaths,
                chunksPreview: chunks.map((c, i) => ({
                  chunk: i + 1,
                  operations: c.length,
                })),
              })
            );
            return;
          }

          // Pre-populate tempIdMap from declared idFiles + auto-discovered sibling .ids.json
          const tempIdMap: Record<string, string> = loadIdFiles(idFilePaths);

          // If --resolve-names, query model for any still-unresolved tempId references
          if (options.resolveNames) {
            const unresolved = collectTempIdRefs(allChanges).filter((t) => !tempIdMap[t]);
            if (unresolved.length > 0) {
              await resolveByName(unresolved, tempIdMap);
            }
          }

          // Progress stream: use stdout in TTY mode (ensures ordering), suppress when piped
          const progressStream = process.stdout.isTTY ? process.stdout : null;

          // Submit each chunk, carrying tempId→realId map across chunks
          const results = [];
          let hadOperationErrors = false;
          for (let i = 0; i < chunks.length; i++) {
            // Substitute any tempIds resolved from previous chunks or idFiles
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
                timeoutMs: parseInt(options.pollTimeout, 10) || 60_000,
                onProgress: (status, attempt) => {
                  progressStream?.write(`\r  Chunk ${i + 1}/${chunks.length}: ${status} (${attempt})  `);
                },
              });
              progressStream?.write('\n');
              chunkResult = { ...chunkResult, ...pollResult };
              if ((pollResult as { status?: string }).status === 'error') {
                hadOperationErrors = true;
              }
              // Collect tempId→realId/visualId/viewId/noteId/groupId mappings from completed chunk results
              const opResults = (pollResult as { result?: Array<{ tempId?: string; realId?: string; visualId?: string; viewId?: string; noteId?: string; groupId?: string }> }).result ?? [];
              for (const r of opResults) {
                const id = r.realId ?? r.visualId ?? r.viewId ?? r.noteId ?? r.groupId;
                if (r.tempId && id) tempIdMap[r.tempId] = id;
              }
            }

            results.push(chunkResult);
          }

          // Save ID map unless --no-save-ids
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
            results,
          };
          if (allChanges.length === 0) {
            output['warning'] = 'Empty BOM — no changes were applied';
          }
          if (hadOperationErrors) {
            print(failure('BATCH_APPLY_PARTIAL_FAILURE', 'One or more chunks failed', output));
            cmd.error('', { exitCode: 1 });
          } else {
            print(success(output));
          }
        } catch (err) {
          print(failure('BATCH_APPLY_FAILED', String(err)));
          cmd.error('', { exitCode: 1 });
        }
      }
    );
}
