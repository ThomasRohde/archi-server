import * as z from 'zod/v4';
import { ArchiApiClient, ArchiApiError } from '../archi-api.js';
import { PopulateViewSchema, WaitForOperationSchema } from './schemas.js';
import { PopulateViewDataSchema, WaitForOperationDataSchema } from './output-schemas.js';
import {
  asLooseObject,
  getNonEmptyString,
  resolveOperationIdentifier,
  uniqueStrings,
} from './model-helpers.js';
import { collectRelationshipsBetweenElements } from './view-helpers.js';

export const RELIABLE_BATCH_SIZE = 8;
const CHUNK_POLL_INTERVAL_MS = 500;
const CHUNK_POLL_TIMEOUT_MS = 120_000;

const REFERENCE_ID_FIELDS = [
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
  'parentVisualId',
  'visualId',
  'viewConnectionId',
] as const;

function substituteIdsInChunk(
  chunk: Array<Record<string, unknown>>,
  idMap: Record<string, string>,
): Array<Record<string, unknown>> {
  if (Object.keys(idMap).length === 0) return chunk;
  return chunk.map((change) => {
    const patched = { ...change };
    for (const field of REFERENCE_ID_FIELDS) {
      const value = patched[field];
      if (typeof value === 'string' && idMap[value]) {
        patched[field] = idMap[value];
      }
    }
    return patched;
  });
}

function extractTempIdMappings(results: Array<Record<string, unknown>>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const result of results) {
    const tempId = getNonEmptyString(result.tempId);
    if (!tempId) continue;
    const resolvedId =
      getNonEmptyString(result.realId) ??
      getNonEmptyString(result.visualId) ??
      getNonEmptyString(result.noteId) ??
      getNonEmptyString(result.groupId) ??
      getNonEmptyString(result.viewId);
    if (resolvedId) {
      map[tempId] = resolvedId;
    }
  }
  return map;
}

export function normalizeApplyChanges(changes: Array<Record<string, unknown>>): {
  changes: Array<Record<string, unknown>>;
  aliasesResolved: number;
} {
  const opsAcceptingIdAlias = new Set([
    'setProperty',
    'updateElement',
    'updateRelationship',
    'moveToFolder',
    'deleteElement',
    'deleteRelationship',
  ]);

  const opsAcceptingViewObjectIdAlias = new Set(['styleViewObject', 'moveViewObject']);
  const opsAcceptingConnectionIdAlias = new Set(['styleConnection', 'deleteConnectionFromView']);
  const opsAcceptingVisualIdAlias = new Set(['nestInView']);
  const opsAcceptingWidthHeightAlias = new Set(['addToView', 'moveViewObject', 'createNote', 'createGroup']);
  const opsAcceptingContentAlias = new Set(['createNote']);
  const opsAcceptingFontAlias = new Set(['styleViewObject']);

  let aliasesResolved = 0;

  const normalized = changes.map((change, index) => {
    const op = change.op as string;
    let result = { ...change };

    if (opsAcceptingIdAlias.has(op)) {
      const id = getNonEmptyString(result.id);
      const elementId = getNonEmptyString(result.elementId);
      const relationshipId = getNonEmptyString(result.relationshipId);
      const aliases = [elementId, relationshipId].filter((value): value is string => value !== undefined);

      if (id && aliases.some((alias) => alias !== id)) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: "id" conflicts with alias field values.`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, id, elementId, relationshipId },
        );
      }

      if (!id && aliases.length > 1 && aliases.some((alias) => alias !== aliases[0])) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: alias fields disagree.`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, elementId, relationshipId },
        );
      }

      const resolvedId = id ?? aliases[0];
      if (resolvedId && (elementId !== undefined || relationshipId !== undefined)) {
        result.id = resolvedId;
        delete result.elementId;
        delete result.relationshipId;
        aliasesResolved += 1;
      }
    }

    if (opsAcceptingViewObjectIdAlias.has(op)) {
      const viewObjectId = getNonEmptyString(result.viewObjectId);
      const visualId = getNonEmptyString(result.visualId);

      if (viewObjectId && visualId && viewObjectId !== visualId) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: "viewObjectId" conflicts with "visualId".`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, viewObjectId, visualId },
        );
      }

      if (!viewObjectId && visualId) {
        result.viewObjectId = visualId;
        delete result.visualId;
        aliasesResolved += 1;
      }
    }

    if (opsAcceptingConnectionIdAlias.has(op)) {
      const connectionId = getNonEmptyString(result.connectionId);
      const viewConnectionId = getNonEmptyString(result.viewConnectionId);

      if (connectionId && viewConnectionId && connectionId !== viewConnectionId) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: "connectionId" conflicts with "viewConnectionId".`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, connectionId, viewConnectionId },
        );
      }

      if (!connectionId && viewConnectionId) {
        result.connectionId = viewConnectionId;
        delete result.viewConnectionId;
        aliasesResolved += 1;
      }
    }

    if (opsAcceptingVisualIdAlias.has(op)) {
      const visualId = getNonEmptyString(result.visualId);
      const viewObjectId = getNonEmptyString(result.viewObjectId);

      if (visualId && viewObjectId && visualId !== viewObjectId) {
        throw new ArchiApiError(
          `Invalid ${op} change at index ${index}: "visualId" conflicts with "viewObjectId".`,
          undefined,
          'INVALID_APPLY_REQUEST',
          { index, op, visualId, viewObjectId },
        );
      }

      if (!visualId && viewObjectId) {
        result.visualId = viewObjectId;
        delete result.viewObjectId;
        aliasesResolved += 1;
      }
    }

    if (opsAcceptingWidthHeightAlias.has(op)) {
      if (result.w !== undefined && result.width === undefined) {
        result.width = result.w;
        delete result.w;
        aliasesResolved += 1;
      }
      if (result.h !== undefined && result.height === undefined) {
        result.height = result.h;
        delete result.h;
        aliasesResolved += 1;
      }
    }

    if (opsAcceptingContentAlias.has(op)) {
      if (result.text !== undefined && result.content === undefined) {
        result.content = result.text;
        delete result.text;
        aliasesResolved += 1;
      }
    }

    if (opsAcceptingFontAlias.has(op)) {
      if (result.fontStyle !== undefined && result.font === undefined) {
        const fontStyle = result.fontStyle;
        const fontStyleMap: Record<string, number> = {
          normal: 0,
          bold: 1,
          italic: 2,
          'bold|italic': 3,
          'italic|bold': 3,
        };
        if (typeof fontStyle === 'string' && fontStyleMap[fontStyle.toLowerCase()] !== undefined) {
          result.font = `|0|${fontStyleMap[fontStyle.toLowerCase()]}`;
          delete result.fontStyle;
          aliasesResolved += 1;
        } else if (typeof fontStyle === 'number') {
          result.font = `|0|${fontStyle}`;
          delete result.fontStyle;
          aliasesResolved += 1;
        }
      }
    }

    return result;
  });

  return {
    changes: normalized,
    aliasesResolved,
  };
}

export async function populateViewWithRelationships(
  api: ArchiApiClient,
  args: z.infer<typeof PopulateViewSchema>,
): Promise<z.infer<typeof PopulateViewDataSchema>> {
  const uniqueElementIds = uniqueStrings(args.elementIds);
  const autoConnect = args.autoConnect ?? true;
  const skipExistingVisuals = args.skipExistingVisuals ?? true;
  const skipExistingConnections = args.skipExistingConnections ?? true;

  const view = await api.getViewById(args.viewId);
  const existingVisualizedElementIds = new Set<string>();
  const existingVisualizedRelationshipIds = new Set<string>();

  for (const element of view.elements ?? []) {
    const conceptId = getNonEmptyString(element.conceptId);
    if (conceptId) {
      existingVisualizedElementIds.add(conceptId);
    }
  }

  for (const connection of view.connections ?? []) {
    const conceptId = getNonEmptyString(connection.conceptId);
    if (conceptId) {
      existingVisualizedRelationshipIds.add(conceptId);
    }
  }

  const skippedElementIds: string[] = [];
  const elementIdsToAdd: string[] = [];
  for (const elementId of uniqueElementIds) {
    if (skipExistingVisuals && existingVisualizedElementIds.has(elementId)) {
      skippedElementIds.push(elementId);
      continue;
    }

    elementIdsToAdd.push(elementId);
  }

  const GRID_COLS = 4;
  const GRID_X_START = 20;
  const GRID_Y_START = 20;
  const GRID_X_STEP = 160;
  const GRID_Y_STEP = 80;

  const changes: Array<Record<string, unknown>> = elementIdsToAdd.map((elementId, index) => ({
    op: 'addToView',
    viewId: args.viewId,
    elementId,
    x: GRID_X_START + (index % GRID_COLS) * GRID_X_STEP,
    y: GRID_Y_START + Math.floor(index / GRID_COLS) * GRID_Y_STEP,
  }));

  const skippedRelationshipIds: string[] = [];
  const skippedRelationships: Array<{ relationshipId: string; reason: string }> = [];
  const skipReasonCounts: Record<string, number> = {};
  let relationshipsConsidered = 0;
  let connectionOpsQueued = 0;

  if (autoConnect) {
    const allRelevantElementIds = uniqueStrings([...uniqueElementIds, ...Array.from(existingVisualizedElementIds)]);

    if (allRelevantElementIds.length >= 2) {
      const { relationships, unsupportedTypeRelationshipIds } = await collectRelationshipsBetweenElements(
        api,
        allRelevantElementIds,
        args.relationshipTypes,
      );
      relationshipsConsidered = relationships.length;

      for (const relationshipId of unsupportedTypeRelationshipIds) {
        skippedRelationshipIds.push(relationshipId);
        skippedRelationships.push({ relationshipId, reason: 'unsupportedType' });
        skipReasonCounts.unsupportedType = (skipReasonCounts.unsupportedType ?? 0) + 1;
      }

      for (const relationship of relationships) {
        if (skipExistingConnections && existingVisualizedRelationshipIds.has(relationship.id)) {
          skippedRelationshipIds.push(relationship.id);
          skippedRelationships.push({ relationshipId: relationship.id, reason: 'alreadyConnected' });
          skipReasonCounts.alreadyConnected = (skipReasonCounts.alreadyConnected ?? 0) + 1;
          continue;
        }

        changes.push({
          op: 'addConnectionToView',
          viewId: args.viewId,
          relationshipId: relationship.id,
          autoResolveVisuals: true,
          skipExistingConnections,
        });
        connectionOpsQueued += 1;
      }
    }
  }

  if (changes.length === 0) {
    return {
      operationId: null,
      opId: null,
      status: 'no-op',
      viewId: args.viewId,
      requestedElementCount: uniqueElementIds.length,
      elementOpsQueued: 0,
      connectionOpsQueued: 0,
      relationshipsConsidered,
      skippedElementIds,
      skippedRelationshipIds,
      skippedRelationships,
      skipReasonCounts,
      changesQueued: 0,
      message: 'No changes queued. Requested elements/connections are already visualized on the target view.',
    };
  }

  const applyResponse = await api.postModelApply({ changes });
  const applyResponseRecord = applyResponse as Record<string, unknown>;
  return {
    operationId: getNonEmptyString(applyResponse.operationId) ?? undefined,
    opId: getNonEmptyString(applyResponseRecord.opId) ?? undefined,
    status: getNonEmptyString(applyResponse.status),
    viewId: args.viewId,
    requestedElementCount: uniqueElementIds.length,
    elementOpsQueued: elementIdsToAdd.length,
    connectionOpsQueued,
    relationshipsConsidered,
    skippedElementIds,
    skippedRelationshipIds,
    skippedRelationships,
    skipReasonCounts,
    changesQueued: changes.length,
    message: getNonEmptyString(applyResponse.message),
    requestId: getNonEmptyString(applyResponseRecord.requestId),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForOperationCompletion(
  api: ArchiApiClient,
  args: z.infer<typeof WaitForOperationSchema>,
): Promise<z.infer<typeof WaitForOperationDataSchema>> {
  const operationId = resolveOperationIdentifier(args, 'archi_wait_for_operation');
  const timeoutMs = args.timeoutMs ?? 120000;
  const pollIntervalMs = args.pollIntervalMs ?? 1000;
  const statusHistory: string[] = [];
  const startedAt = Date.now();
  let polls = 0;

  while (true) {
    const latest = await api.getOpsStatus({ opId: operationId });
    polls += 1;

    const status = getNonEmptyString(latest.status) ?? 'unknown';
    statusHistory.push(status);

    const latestRecord = latest as Record<string, unknown>;
    const elapsedMs = Date.now() - startedAt;
    const resolvedOperationId = getNonEmptyString(latestRecord.operationId) ?? operationId;
    const errorDetails = asLooseObject(latest.errorDetails);

    if (status === 'complete' || status === 'error') {
      return {
        operationId: resolvedOperationId,
        status,
        terminal: true,
        timedOut: false,
        polls,
        elapsedMs,
        statusHistory,
        result: Array.isArray(latest.result) ? latest.result : undefined,
        digest: asLooseObject((latest as Record<string, unknown>).digest),
        tempIdMap: (latest as Record<string, unknown>).tempIdMap as Record<string, string> | undefined,
        tempIdMappings: Array.isArray((latest as Record<string, unknown>).tempIdMappings)
          ? ((latest as Record<string, unknown>).tempIdMappings as Array<Record<string, unknown>>)
          : undefined,
        timeline: Array.isArray((latest as Record<string, unknown>).timeline)
          ? ((latest as Record<string, unknown>).timeline as Array<Record<string, unknown>>)
          : undefined,
        error: getNonEmptyString(latest.error),
        errorDetails,
        requestId: getNonEmptyString(latestRecord.requestId),
      };
    }

    if (elapsedMs >= timeoutMs) {
      return {
        operationId: resolvedOperationId,
        status,
        terminal: false,
        timedOut: true,
        polls,
        elapsedMs,
        statusHistory,
        result: Array.isArray(latest.result) ? latest.result : undefined,
        digest: asLooseObject((latest as Record<string, unknown>).digest),
        tempIdMap: (latest as Record<string, unknown>).tempIdMap as Record<string, string> | undefined,
        tempIdMappings: Array.isArray((latest as Record<string, unknown>).tempIdMappings)
          ? ((latest as Record<string, unknown>).tempIdMappings as Array<Record<string, unknown>>)
          : undefined,
        timeline: Array.isArray((latest as Record<string, unknown>).timeline)
          ? ((latest as Record<string, unknown>).timeline as Array<Record<string, unknown>>)
          : undefined,
        error: getNonEmptyString(latest.error),
        errorDetails,
        requestId: getNonEmptyString(latestRecord.requestId),
      };
    }

    const remainingMs = timeoutMs - elapsedMs;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

interface ChunkSummary {
  chunkIndex: number;
  operationId?: string;
  status: string;
  operationCount: number;
  result?: Array<Record<string, unknown>>;
  error?: string;
  errorDetails?: Record<string, unknown>;
}

interface ChunkedApplyResult {
  status: 'complete' | 'partial_error';
  totalOperations: number;
  chunksSubmitted: number;
  chunksCompleted: number;
  chunksFailed: number;
  tempIdMap: Record<string, string>;
  result: Array<Record<string, unknown>>;
  elapsedMs: number;
  chunks: ChunkSummary[];
  mcp?: Record<string, unknown>;
}

async function buildRecoverySnapshot(
  api: ArchiApiClient,
  params: {
    failedChunkIndex: number;
    operationId?: string;
    error?: string;
    errorDetails?: Record<string, unknown>;
    chunksCompleted: number;
    tempIdMap: Record<string, string>;
    totalOperations: number;
  },
): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {
    mode: 'targeted_recovery',
    failedChunk: params.failedChunkIndex + 1,
    operationId: params.operationId,
    error: params.error,
    errorDetails: params.errorDetails,
    chunksCompleted: params.chunksCompleted,
    resolvedTempIds: Object.keys(params.tempIdMap).length,
    totalOperations: params.totalOperations,
    nextStep:
      'Re-read model state, reconcile expected vs actual deltas, and resume with minimal targeted batches.',
  };

  try {
    snapshot.model = await api.postModelQuery();
  } catch (error) {
    snapshot.modelReadError = error instanceof Error ? error.message : String(error);
  }

  try {
    snapshot.diagnostics = await api.getModelDiagnostics();
  } catch (error) {
    snapshot.diagnosticsReadError = error instanceof Error ? error.message : String(error);
  }

  return snapshot;
}

export async function executeChunkedApply(
  api: ArchiApiClient,
  allChanges: Array<Record<string, unknown>>,
): Promise<ChunkedApplyResult> {
  const MAX_CHUNK_SIZE = RELIABLE_BATCH_SIZE;

  const rawChunks: Array<Array<Record<string, unknown>>> = [];
  for (let i = 0; i < allChanges.length; i += MAX_CHUNK_SIZE) {
    rawChunks.push(allChanges.slice(i, i + MAX_CHUNK_SIZE));
  }

  const startedAt = Date.now();
  const tempIdMap: Record<string, string> = {};
  const allResults: Array<Record<string, unknown>> = [];
  const chunkSummaries: ChunkSummary[] = [];
  let chunksFailed = 0;
  let totalAliasesResolved = 0;
  let recoverySnapshot: Record<string, unknown> | undefined;

  for (let i = 0; i < rawChunks.length; i++) {
    const resolvedChunk = substituteIdsInChunk(rawChunks[i], tempIdMap);
    const { changes: normalizedChunk, aliasesResolved: chunkAliases } = normalizeApplyChanges(resolvedChunk);
    totalAliasesResolved += chunkAliases;

    try {
      const applyResult = await api.postModelApply({ changes: normalizedChunk });
      const operationId = getNonEmptyString((applyResult as Record<string, unknown>).operationId);

      if (!operationId) {
        throw new Error('No operationId returned from postModelApply for chunk ' + (i + 1));
      }

      const pollResult = await waitForOperationCompletion(api, {
        operationId,
        timeoutMs: CHUNK_POLL_TIMEOUT_MS,
        pollIntervalMs: CHUNK_POLL_INTERVAL_MS,
      });

      if (pollResult.status === 'error') {
        chunksFailed++;
        const failedChunkSummary: ChunkSummary = {
          chunkIndex: i,
          operationId,
          status: 'error',
          operationCount: normalizedChunk.length,
          error: pollResult.error,
          errorDetails: pollResult.errorDetails as Record<string, unknown> | undefined,
        };
        chunkSummaries.push(failedChunkSummary);
        recoverySnapshot = await buildRecoverySnapshot(api, {
          failedChunkIndex: i,
          operationId,
          error: pollResult.error,
          errorDetails: pollResult.errorDetails as Record<string, unknown> | undefined,
          chunksCompleted: chunkSummaries.filter((chunk) => chunk.status === 'complete').length,
          tempIdMap,
          totalOperations: allChanges.length,
        });
        break;
      }

      if (pollResult.timedOut) {
        chunksFailed++;
        const timedOutChunkSummary: ChunkSummary = {
          chunkIndex: i,
          operationId,
          status: 'timeout',
          operationCount: normalizedChunk.length,
          error: 'Polling timed out after ' + CHUNK_POLL_TIMEOUT_MS + 'ms',
        };
        chunkSummaries.push(timedOutChunkSummary);
        recoverySnapshot = await buildRecoverySnapshot(api, {
          failedChunkIndex: i,
          operationId,
          error: timedOutChunkSummary.error,
          chunksCompleted: chunkSummaries.filter((chunk) => chunk.status === 'complete').length,
          tempIdMap,
          totalOperations: allChanges.length,
        });
        break;
      }

      const opResults = (pollResult.result ?? []) as Array<Record<string, unknown>>;
      const newMappings = extractTempIdMappings(opResults);
      Object.assign(tempIdMap, newMappings);
      allResults.push(...opResults);

      chunkSummaries.push({
        chunkIndex: i,
        operationId,
        status: 'complete',
        operationCount: normalizedChunk.length,
        result: opResults,
      });
    } catch (err) {
      chunksFailed++;
      const failedChunkSummary: ChunkSummary = {
        chunkIndex: i,
        status: 'error',
        operationCount: normalizedChunk.length,
        error: err instanceof Error ? err.message : String(err),
      };
      chunkSummaries.push(failedChunkSummary);
      recoverySnapshot = await buildRecoverySnapshot(api, {
        failedChunkIndex: i,
        error: failedChunkSummary.error,
        chunksCompleted: chunkSummaries.filter((chunk) => chunk.status === 'complete').length,
        tempIdMap,
        totalOperations: allChanges.length,
      });
      break;
    }
  }

  const elapsedMs = Date.now() - startedAt;

  const response: ChunkedApplyResult = {
    status: chunksFailed > 0 ? 'partial_error' : 'complete',
    totalOperations: allChanges.length,
    chunksSubmitted: chunkSummaries.length,
    chunksCompleted: chunkSummaries.filter((c) => c.status === 'complete').length,
    chunksFailed,
    tempIdMap,
    result: allResults,
    elapsedMs,
    chunks: chunkSummaries,
  };

  const mcpMetadata: Record<string, unknown> = {};
  if (totalAliasesResolved > 0) {
    mcpMetadata.aliasesResolved = totalAliasesResolved;
    mcpMetadata.note = 'Normalized alias fields before chunked submission.';
  }
  if (recoverySnapshot) {
    mcpMetadata.recovery = recoverySnapshot;
  }
  if (Object.keys(mcpMetadata).length > 0) {
    response.mcp = mcpMetadata;
  }

  return response;
}
