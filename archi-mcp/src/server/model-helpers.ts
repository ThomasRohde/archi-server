import type { ArchiApiClient } from '../archi-api.js';
import { ArchiApiError } from '../archi-api.js';
import type * as z from 'zod/v4';
import { ListViewsSchema, SearchSchema } from './schemas.js';

const CASE_INSENSITIVE_PREFIX = /^\(\?i\)/i;

type OperationIdentifierInput = {
  opId?: string;
  operationId?: string;
};

export function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asLooseObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value as Record<string, unknown>;
}

export function resolveOperationIdentifier(input: OperationIdentifierInput, operation: string): string {
  const opId = getNonEmptyString(input.opId);
  const operationId = getNonEmptyString(input.operationId);

  if (!opId && !operationId) {
    throw new ArchiApiError(`${operation} requires opId or operationId.`, undefined, 'INVALID_OPERATION_ID');
  }

  if (opId && operationId && opId !== operationId) {
    throw new ArchiApiError(
      `${operation} received conflicting identifiers. opId and operationId must match.`,
      undefined,
      'INVALID_OPERATION_ID',
    );
  }

  return operationId ?? opId!;
}

function normalizeTextForCompare(value: unknown, caseSensitive: boolean): string | undefined {
  const text = getNonEmptyString(value);
  if (!text) {
    return undefined;
  }

  return caseSensitive ? text : text.toLowerCase();
}

function toFiniteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

export function filterAndPaginateViews(
  listResponse: Awaited<ReturnType<ArchiApiClient['getViews']>>,
  args: z.infer<typeof ListViewsSchema>,
) {
  const caseSensitive = args.caseSensitive ?? false;
  const exactName = normalizeTextForCompare(args.exactName, caseSensitive);
  const nameContains = normalizeTextForCompare(args.nameContains, caseSensitive);
  const viewType = normalizeTextForCompare(args.type, caseSensitive);
  const viewpoint = normalizeTextForCompare(args.viewpoint, caseSensitive);
  const sortBy = args.sortBy ?? 'name';
  const sortDirection = args.sortDirection ?? 'asc';
  const directionMultiplier = sortDirection === 'desc' ? -1 : 1;
  const views = Array.isArray(listResponse.views) ? [...listResponse.views] : [];

  const filteredViews = views.filter((view) => {
    const normalizedName = normalizeTextForCompare(view.name, caseSensitive) ?? '';
    if (exactName && normalizedName !== exactName) {
      return false;
    }

    if (nameContains && !normalizedName.includes(nameContains)) {
      return false;
    }

    const normalizedType = normalizeTextForCompare(view.type, caseSensitive);
    if (viewType && normalizedType !== viewType) {
      return false;
    }

    const normalizedViewpoint = normalizeTextForCompare(view.viewpoint, caseSensitive);
    if (viewpoint && normalizedViewpoint !== viewpoint) {
      return false;
    }

    return true;
  });

  filteredViews.sort((left, right) => {
    let compare = 0;
    if (sortBy === 'name') {
      compare = (left.name ?? '').localeCompare(right.name ?? '', undefined, { sensitivity: 'base' });
    } else if (sortBy === 'objectCount') {
      compare = toFiniteNumberOrZero(left.objectCount) - toFiniteNumberOrZero(right.objectCount);
    } else {
      compare = toFiniteNumberOrZero(left.connectionCount) - toFiniteNumberOrZero(right.connectionCount);
    }

    if (compare === 0) {
      compare = (left.id ?? '').localeCompare(right.id ?? '', undefined, { sensitivity: 'base' });
    }

    return compare * directionMultiplier;
  });

  const offset = args.offset ?? 0;
  const effectiveLimit = args.limit ?? filteredViews.length;
  const pagedViews = filteredViews.slice(offset, offset + effectiveLimit);
  const total = filteredViews.length;
  const returned = pagedViews.length;

  return {
    ...listResponse,
    views: pagedViews,
    total,
    mcp: {
      filters: {
        exactName: args.exactName,
        nameContains: args.nameContains,
        caseSensitive,
        type: args.type,
        viewpoint: args.viewpoint,
      },
      sort: {
        by: sortBy,
        direction: sortDirection,
      },
      pagination: {
        offset,
        limit: effectiveLimit,
        returned,
        hasMore: offset + returned < total,
      },
    },
  };
}

export function normalizeArchiTypeForCompare(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

export function isRelationshipTypeAllowed(
  relationshipType: string | undefined,
  allowedTypes: Set<string> | undefined,
): boolean {
  if (!allowedTypes || allowedTypes.size === 0) {
    return true;
  }

  if (!relationshipType) {
    return false;
  }

  return allowedTypes.has(normalizeArchiTypeForCompare(relationshipType));
}

function makeCaseInsensitivePattern(pattern: string): string {
  let transformed = '';
  let escaped = false;
  let inCharacterClass = false;

  for (const character of pattern) {
    if (escaped) {
      transformed += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      transformed += character;
      escaped = true;
      continue;
    }

    if (character === '[' && !inCharacterClass) {
      inCharacterClass = true;
      transformed += character;
      continue;
    }

    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      transformed += character;
      continue;
    }

    if (!inCharacterClass && /[A-Za-z]/.test(character)) {
      const lower = character.toLowerCase();
      const upper = character.toUpperCase();
      transformed += `[${lower}${upper}]`;
      continue;
    }

    transformed += character;
  }

  return transformed;
}

export function prepareSearchRequest(args: z.infer<typeof SearchSchema>): {
  request: {
    type?: string;
    namePattern?: string;
    propertyKey?: string;
    propertyValue?: string;
    includeRelationships?: boolean;
    limit?: number;
  };
  metadata?: Record<string, unknown>;
} {
  const { caseSensitive, ...request } = args;
  const rawPattern = request.namePattern;
  if (!rawPattern) {
    return { request };
  }

  const hasInlineInsensitivePrefix = CASE_INSENSITIVE_PREFIX.test(rawPattern);
  const shouldUseCaseInsensitivePattern =
    hasInlineInsensitivePrefix || caseSensitive === false || caseSensitive === undefined;
  if (!shouldUseCaseInsensitivePattern) {
    return { request };
  }

  const strippedPattern = rawPattern.replace(CASE_INSENSITIVE_PREFIX, '');
  if (strippedPattern.trim().length === 0) {
    throw new ArchiApiError(
      'namePattern cannot be empty when using case-insensitive mode.',
      undefined,
      'INVALID_SEARCH_REQUEST',
    );
  }

  const expandedPattern = makeCaseInsensitivePattern(strippedPattern);
  return {
    request: {
      ...request,
      namePattern: expandedPattern,
    },
    metadata: {
      originalNamePattern: rawPattern,
      effectiveNamePattern: expandedPattern,
      caseSensitive: false,
      regexMode: 'expanded-case-insensitive',
    },
  };
}
