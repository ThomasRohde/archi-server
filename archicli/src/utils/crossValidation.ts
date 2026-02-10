/**
 * Cross-validation for addConnectionToView operations.
 *
 * Before submitting connection operations to the server, validates that:
 *  - The relationship's source/target match the visual objects' underlying elements
 *  - Detects and optionally auto-swaps mismatched direction
 *  - Fails early with clear errors on complete mismatches
 *
 * This implements recommendation R5 from batch-rollback-recommendations.md.
 */
import { get } from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RelationshipEndpoint {
  id: string;
  name: string;
  type: string;
}

export interface RelationshipDetail {
  id: string;
  name: string;
  type: string;
  source: RelationshipEndpoint | null;
  target: RelationshipEndpoint | null;
}

export interface ConnectionValidationResult {
  /** Index of the operation in the chunk */
  index: number;
  /** Whether the connection is valid (possibly after swap) */
  valid: boolean;
  /** Whether source/target visual IDs were swapped to correct direction */
  swapped: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Relationship detail for diagnostics */
  relationship?: {
    id: string;
    name: string;
    sourceId: string;
    sourceName: string;
    targetId: string;
    targetName: string;
  };
  /** What element IDs the visuals resolved to */
  visuals?: {
    sourceElementId: string;
    targetElementId: string;
  };
}

export interface CrossValidationSummary {
  /** Total addConnectionToView operations checked */
  checked: number;
  /** Operations that passed without changes */
  passed: number;
  /** Operations where source/target were auto-swapped */
  swapped: number;
  /** Operations that completely failed validation */
  failed: number;
  /** Operations skipped (unresolved IDs, fetch errors) */
  skipped: number;
  /** Individual results for swapped or failed ops */
  details: ConnectionValidationResult[];
}

// ── Visual-to-Element Map ────────────────────────────────────────────────────

/**
 * Build a map from visual tempIds to the element IDs they represent.
 * Scans all `addToView` operations in the BOM.
 *
 * @param changes - All changes from the flattened BOM
 * @returns Map of visual tempId → element ID (which may itself be a tempId)
 */
export function buildVisualToElementMap(changes: unknown[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const change of changes) {
    const op = change as Record<string, unknown>;
    if (
      op.op === 'addToView' &&
      typeof op.tempId === 'string' &&
      typeof op.elementId === 'string'
    ) {
      map[op.tempId] = op.elementId;
    }
  }
  return map;
}

// ── Relationship Cache ───────────────────────────────────────────────────────

const relationshipCache = new Map<string, RelationshipDetail>();

/**
 * Fetch relationship details from the server, with caching.
 * Returns null if the fetch fails (network error, 404, etc).
 */
export async function fetchRelationshipDetail(
  realId: string,
): Promise<RelationshipDetail | null> {
  const cached = relationshipCache.get(realId);
  if (cached) return cached;

  try {
    const detail = await get<RelationshipDetail>(
      `/model/element/${encodeURIComponent(realId)}`,
    );
    relationshipCache.set(realId, detail);
    return detail;
  } catch {
    return null;
  }
}

/** Clear the relationship cache (useful between test runs). */
export function clearRelationshipCache(): void {
  relationshipCache.clear();
}

// ── Core Validation ──────────────────────────────────────────────────────────

/**
 * Determine if a string looks like a resolved real ID (Archi IDs start with "id-").
 */
function isRealId(value: string): boolean {
  return value.startsWith('id-');
}

/**
 * Cross-validate a single addConnectionToView operation.
 *
 * @param op - The operation (after tempId substitution)
 * @param originalOp - The original operation (before substitution, for tempId lookups)
 * @param tempIdMap - Current tempId → realId mapping
 * @param visualToElementMap - Visual tempId → element tempId mapping (from BOM)
 * @param index - Index of this operation in the chunk
 */
async function validateSingleConnection(
  op: Record<string, unknown>,
  originalOp: Record<string, unknown>,
  tempIdMap: Record<string, string>,
  visualToElementMap: Record<string, string>,
  index: number,
): Promise<ConnectionValidationResult> {
  const relationshipId = op.relationshipId as string;
  const sourceVisualId = op.sourceVisualId as string;
  const targetVisualId = op.targetVisualId as string;

  // Use original (pre-substitution) tempIds to look up the visual-to-element map
  const origSourceVisualId = originalOp.sourceVisualId as string;
  const origTargetVisualId = originalOp.targetVisualId as string;

  // Step 1: The relationshipId should be a real ID by now (resolved by substituteIds)
  if (!isRealId(relationshipId)) {
    return { index, valid: true, swapped: false }; // Can't validate unresolved
  }

  // Step 2: Fetch relationship details from server
  const relDetail = await fetchRelationshipDetail(relationshipId);
  if (!relDetail || !relDetail.source || !relDetail.target) {
    return { index, valid: true, swapped: false }; // Can't validate, skip gracefully
  }

  // Step 3: Resolve visual IDs → element IDs
  // Look up what element each visual represents from the BOM's addToView ops
  const sourceElementTempId =
    visualToElementMap[origSourceVisualId] ?? visualToElementMap[sourceVisualId];
  const targetElementTempId =
    visualToElementMap[origTargetVisualId] ?? visualToElementMap[targetVisualId];

  if (!sourceElementTempId || !targetElementTempId) {
    return { index, valid: true, swapped: false }; // Can't validate without element mapping
  }

  // Resolve element tempIds to real IDs
  const sourceElementRealId = tempIdMap[sourceElementTempId] ?? sourceElementTempId;
  const targetElementRealId = tempIdMap[targetElementTempId] ?? targetElementTempId;

  // If element IDs aren't resolved, skip
  if (!isRealId(sourceElementRealId) || !isRealId(targetElementRealId)) {
    return { index, valid: true, swapped: false };
  }

  const relSourceId = relDetail.source.id;
  const relTargetId = relDetail.target.id;
  const relInfo = {
    id: relDetail.id,
    name: relDetail.name || relDetail.type,
    sourceId: relSourceId,
    sourceName: relDetail.source.name || relDetail.source.id,
    targetId: relTargetId,
    targetName: relDetail.target.name || relDetail.target.id,
  };
  const visualInfo = {
    sourceElementId: sourceElementRealId,
    targetElementId: targetElementRealId,
  };

  // Step 4: Verify direction matches
  if (sourceElementRealId === relSourceId && targetElementRealId === relTargetId) {
    return { index, valid: true, swapped: false, relationship: relInfo, visuals: visualInfo };
  }

  // Step 5: Check if swapping would fix it
  if (sourceElementRealId === relTargetId && targetElementRealId === relSourceId) {
    return {
      index,
      valid: true,
      swapped: true,
      relationship: relInfo,
      visuals: visualInfo,
    };
  }

  // Complete mismatch — neither direction works
  return {
    index,
    valid: false,
    swapped: false,
    error:
      `Connection direction mismatch: relationship ${relDetail.name || relDetail.id} (${relDetail.type}) ` +
      `connects ${relDetail.source.name} (${relSourceId}) → ${relDetail.target.name} (${relTargetId}), ` +
      `but visual source represents element ${sourceElementRealId} and visual target represents element ${targetElementRealId}`,
    relationship: relInfo,
    visuals: visualInfo,
  };
}

/**
 * Cross-validate all addConnectionToView operations in a chunk.
 *
 * For operations where source/target are swapped relative to the relationship direction,
 * the operation is mutated in-place to swap the visual IDs (fixing the direction).
 *
 * @param substitutedChunk - The chunk after tempId substitution (will be mutated for swaps)
 * @param originalChunk - The original chunk before substitution (for tempId lookups)
 * @param tempIdMap - Current tempId → realId mapping
 * @param visualToElementMap - Visual tempId → element tempId mapping
 * @returns Summary of validation results
 */
export async function crossValidateConnections(
  substitutedChunk: unknown[],
  originalChunk: unknown[],
  tempIdMap: Record<string, string>,
  visualToElementMap: Record<string, string>,
): Promise<CrossValidationSummary> {
  const summary: CrossValidationSummary = {
    checked: 0,
    passed: 0,
    swapped: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  // Collect all connection ops with their indices
  const connectionOps: Array<{
    index: number;
    substituted: Record<string, unknown>;
    original: Record<string, unknown>;
  }> = [];

  for (let i = 0; i < substitutedChunk.length; i++) {
    const sub = substitutedChunk[i] as Record<string, unknown>;
    if (sub.op === 'addConnectionToView') {
      connectionOps.push({
        index: i,
        substituted: sub,
        original: originalChunk[i] as Record<string, unknown>,
      });
    }
  }

  if (connectionOps.length === 0) {
    return summary;
  }

  // Validate each connection (sequentially to be kind to the server)
  for (const { index, substituted, original } of connectionOps) {
    summary.checked++;

    const result = await validateSingleConnection(
      substituted,
      original,
      tempIdMap,
      visualToElementMap,
      index,
    );

    if (result.swapped) {
      // Apply the swap in-place
      const tmp = substituted.sourceVisualId;
      substituted.sourceVisualId = substituted.targetVisualId;
      substituted.targetVisualId = tmp;
      summary.swapped++;
      summary.details.push(result);
    } else if (!result.valid) {
      summary.failed++;
      summary.details.push(result);
    } else if (result.relationship) {
      // Validated successfully with full check
      summary.passed++;
    } else {
      // Skipped (unresolved IDs)
      summary.skipped++;
    }
  }

  summary.passed = summary.checked - summary.swapped - summary.failed - summary.skipped;

  return summary;
}
