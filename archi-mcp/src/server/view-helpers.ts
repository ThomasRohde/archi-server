import type { ArchiApiClient } from '../archi-api.js';
import {
  getNonEmptyString,
  isRelationshipTypeAllowed,
  normalizeArchiTypeForCompare,
  uniqueStrings,
} from './model-helpers.js';

export type RelationshipBetweenElements = {
  id: string;
  name?: string;
  type?: string;
  sourceId: string;
  targetId: string;
  sourceName?: string;
  targetName?: string;
};

export async function collectRelationshipsBetweenElements(
  api: ArchiApiClient,
  elementIds: string[],
  relationshipTypes?: string[],
): Promise<{
  relationships: RelationshipBetweenElements[];
  elementNameById: Map<string, string>;
  unsupportedTypeRelationshipIds: string[];
}> {
  const uniqueElementIds = uniqueStrings(elementIds);
  const uniqueElementIdSet = new Set(uniqueElementIds);
  const allowedTypes =
    relationshipTypes && relationshipTypes.length > 0
      ? new Set(relationshipTypes.map((value) => normalizeArchiTypeForCompare(value)))
      : undefined;

  const details = await Promise.all(uniqueElementIds.map((elementId) => api.getElementById(elementId)));
  const elementNameById = new Map<string, string>();
  const relationshipsById = new Map<string, RelationshipBetweenElements>();
  const unsupportedTypeRelationshipIds = new Set<string>();

  for (const [index, detail] of details.entries()) {
    const currentElementId = uniqueElementIds[index];
    if (detail.name && detail.name.trim().length > 0) {
      elementNameById.set(currentElementId, detail.name.trim());
    }

    const outgoing = Array.isArray(detail.relationships?.outgoing) ? detail.relationships.outgoing : [];
    for (const relationship of outgoing) {
      const relationshipId = getNonEmptyString(relationship.id);
      const otherEndId = getNonEmptyString(relationship.otherEndId);
      if (!relationshipId || !otherEndId || !uniqueElementIdSet.has(otherEndId)) {
        continue;
      }
      if (!isRelationshipTypeAllowed(relationship.type, allowedTypes)) {
        if (relationshipId) {
          unsupportedTypeRelationshipIds.add(relationshipId);
        }
        continue;
      }

      if (!relationshipsById.has(relationshipId)) {
        relationshipsById.set(relationshipId, {
          id: relationshipId,
          name: getNonEmptyString(relationship.name),
          type: getNonEmptyString(relationship.type),
          sourceId: currentElementId,
          targetId: otherEndId,
        });
      }
    }

    const incoming = Array.isArray(detail.relationships?.incoming) ? detail.relationships.incoming : [];
    for (const relationship of incoming) {
      const relationshipId = getNonEmptyString(relationship.id);
      const otherEndId = getNonEmptyString(relationship.otherEndId);
      if (!relationshipId || !otherEndId || !uniqueElementIdSet.has(otherEndId)) {
        continue;
      }
      if (!isRelationshipTypeAllowed(relationship.type, allowedTypes)) {
        if (relationshipId) {
          unsupportedTypeRelationshipIds.add(relationshipId);
        }
        continue;
      }

      if (!relationshipsById.has(relationshipId)) {
        relationshipsById.set(relationshipId, {
          id: relationshipId,
          name: getNonEmptyString(relationship.name),
          type: getNonEmptyString(relationship.type),
          sourceId: otherEndId,
          targetId: currentElementId,
        });
      }
    }
  }

  const relationships = Array.from(relationshipsById.values())
    .map((relationship) => ({
      ...relationship,
      sourceName: elementNameById.get(relationship.sourceId),
      targetName: elementNameById.get(relationship.targetId),
    }))
    .sort((left, right) => {
      if (left.sourceId !== right.sourceId) {
        return left.sourceId.localeCompare(right.sourceId);
      }
      if (left.targetId !== right.targetId) {
        return left.targetId.localeCompare(right.targetId);
      }
      return left.id.localeCompare(right.id);
    });

  return {
    relationships,
    elementNameById,
    unsupportedTypeRelationshipIds: Array.from(unsupportedTypeRelationshipIds.values()).sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

export function buildViewSummary(view: Awaited<ReturnType<ArchiApiClient['getViewById']>>, includeConnections: boolean) {
  const elements = Array.isArray(view.elements) ? view.elements : [];
  const connections = Array.isArray(view.connections) ? view.connections : [];

  const summarizedElements = elements
    .map((element) => {
      const visualId = getNonEmptyString(element.id);
      if (!visualId) {
        return undefined;
      }

      return {
        visualId,
        conceptId: getNonEmptyString(element.conceptId),
        conceptType: getNonEmptyString(element.conceptType),
        name: getNonEmptyString(element.name),
        parentVisualId: getNonEmptyString(element.parentId),
      };
    })
    .filter((element): element is NonNullable<typeof element> => element !== undefined);

  const summarizedConnections = connections
    .map((connection) => {
      const visualId = getNonEmptyString(connection.id);
      if (!visualId) {
        return undefined;
      }

      return {
        visualId,
        conceptId: getNonEmptyString(connection.conceptId),
        conceptType: getNonEmptyString(connection.conceptType),
        sourceVisualId: getNonEmptyString(connection.sourceId),
        targetVisualId: getNonEmptyString(connection.targetId),
        name: getNonEmptyString(connection.name),
      };
    })
    .filter((connection): connection is NonNullable<typeof connection> => connection !== undefined);

  return {
    id: getNonEmptyString(view.id),
    name: getNonEmptyString(view.name),
    type: getNonEmptyString(view.type),
    viewpoint: getNonEmptyString(view.viewpoint),
    connectionRouter: getNonEmptyString(view.connectionRouter),
    elementCount: summarizedElements.length,
    connectionCount: summarizedConnections.length,
    elements: summarizedElements,
    ...(includeConnections ? { connections: summarizedConnections } : {}),
    requestId: getNonEmptyString((view as { requestId?: unknown }).requestId),
  };
}
