import { post } from './api';

// Fields that may legally contain tempIds and therefore need substitution.
export const REFERENCE_ID_FIELDS = [
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
] as const;

interface SearchResponse {
  results: Array<{ id: string; name: string; type: string }>;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace known tempId references in a chunk with resolved real IDs.
 */
export function substituteIds(chunk: unknown[], map: Record<string, string>): unknown[] {
  if (Object.keys(map).length === 0) return chunk;
  return chunk.map((op) => {
    const source = op as Record<string, unknown>;
    const patched: Record<string, unknown> = { ...source };
    for (const field of REFERENCE_ID_FIELDS) {
      const value = source[field];
      if (typeof value === 'string' && map[value]) {
        patched[field] = map[value];
      }
    }
    return patched;
  });
}

/**
 * Collect unresolved identifier references used by operations.
 */
export function collectTempIdRefs(changes: unknown[]): string[] {
  const refs = new Set<string>();
  for (const op of changes) {
    const source = op as Record<string, unknown>;
    for (const field of REFERENCE_ID_FIELDS) {
      const value = source[field];
      if (typeof value === 'string') {
        refs.add(value);
      }
    }
  }
  return [...refs].filter((value) => !value.startsWith('id-'));
}

/**
 * Resolve unresolved IDs by exact concept name lookup.
 * This is intentionally best-effort and never throws to avoid blocking apply/verify.
 */
export async function resolveTempIdsByName(
  tempIds: string[],
  map: Record<string, string>
): Promise<void> {
  for (const tempId of tempIds) {
    if (map[tempId]) continue;
    try {
      const resp = await post<SearchResponse>('/model/search', {
        namePattern: `^${escapeRegex(tempId)}$`,
      });
      if (Array.isArray(resp.results) && resp.results.length > 0) {
        map[tempId] = resp.results[0].id;
      }
    } catch {
      // Best-effort lookup; unresolved names stay unresolved for normal validation.
    }
  }
}
