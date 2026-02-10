/**
 * Unit tests for cross-validation of addConnectionToView operations (R5).
 *
 * These tests mock the API layer to validate the cross-validation logic
 * without requiring a running Archi server.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  buildVisualToElementMap,
  clearRelationshipCache,
  crossValidateConnections,
  type RelationshipDetail,
} from '../src/utils/crossValidation';

// ── Mock the API module ──────────────────────────────────────────────────────

vi.mock('../src/utils/api', () => ({
  get: vi.fn(),
}));

import { get } from '../src/utils/api';
const mockGet = vi.mocked(get);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRelationshipDetail(overrides: Partial<RelationshipDetail> = {}): RelationshipDetail {
  return {
    id: 'id-rel-1',
    name: 'TestRelationship',
    type: 'serving-relationship',
    source: { id: 'id-elem-a', name: 'Element A', type: 'application-service' },
    target: { id: 'id-elem-b', name: 'Element B', type: 'application-component' },
    ...overrides,
  };
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  clearRelationshipCache();
  mockGet.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── buildVisualToElementMap ──────────────────────────────────────────────────

describe('buildVisualToElementMap', () => {
  test('extracts visual tempId → element ID from addToView operations', () => {
    const changes = [
      { op: 'createElement', type: 'application-service', name: 'Svc', tempId: 'e-svc' },
      { op: 'addToView', viewId: 'v-main', elementId: 'e-svc', tempId: 'vis-svc', x: 0, y: 0 },
      { op: 'addToView', viewId: 'v-main', elementId: 'e-comp', tempId: 'vis-comp', x: 100, y: 0 },
      { op: 'addConnectionToView', viewId: 'v-main', relationshipId: 'r1', sourceVisualId: 'vis-svc', targetVisualId: 'vis-comp' },
    ];

    const map = buildVisualToElementMap(changes);

    expect(map).toEqual({
      'vis-svc': 'e-svc',
      'vis-comp': 'e-comp',
    });
  });

  test('ignores operations that are not addToView', () => {
    const changes = [
      { op: 'createElement', type: 'application-service', name: 'Svc', tempId: 'e-svc' },
      { op: 'createRelationship', type: 'serving-relationship', sourceId: 'e-svc', targetId: 'e-comp', tempId: 'r1' },
    ];

    const map = buildVisualToElementMap(changes);
    expect(map).toEqual({});
  });

  test('ignores addToView without tempId', () => {
    const changes = [
      { op: 'addToView', viewId: 'v-main', elementId: 'e-svc', x: 0, y: 0 },
    ];

    const map = buildVisualToElementMap(changes);
    expect(map).toEqual({});
  });

  test('handles empty changes', () => {
    expect(buildVisualToElementMap([])).toEqual({});
  });
});

// ── crossValidateConnections ─────────────────────────────────────────────────

describe('crossValidateConnections', () => {
  test('passes when connection direction matches relationship', async () => {
    const relDetail = makeRelationshipDetail();
    mockGet.mockResolvedValue(relDetail);

    const tempIdMap: Record<string, string> = {
      'e-svc': 'id-elem-a',
      'e-comp': 'id-elem-b',
      'r1': 'id-rel-1',
      'vis-svc': 'id-vis-1',
      'vis-comp': 'id-vis-2',
    };

    const visualToElementMap: Record<string, string> = {
      'vis-svc': 'e-svc',
      'vis-comp': 'e-comp',
    };

    const substitutedChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'id-view-1',
        relationshipId: 'id-rel-1',
        sourceVisualId: 'id-vis-1',
        targetVisualId: 'id-vis-2',
      },
    ];
    const originalChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'v-main',
        relationshipId: 'r1',
        sourceVisualId: 'vis-svc',
        targetVisualId: 'vis-comp',
      },
    ];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      tempIdMap,
      visualToElementMap,
    );

    expect(result.checked).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.swapped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.details).toHaveLength(0);
  });

  test('detects and auto-swaps reversed direction', async () => {
    const relDetail = makeRelationshipDetail();
    mockGet.mockResolvedValue(relDetail);

    const tempIdMap: Record<string, string> = {
      'e-svc': 'id-elem-a',     // = relationship source
      'e-comp': 'id-elem-b',    // = relationship target
      'r1': 'id-rel-1',
      'vis-svc': 'id-vis-1',
      'vis-comp': 'id-vis-2',
    };

    const visualToElementMap: Record<string, string> = {
      'vis-svc': 'e-svc',     // represents elem-a (source)
      'vis-comp': 'e-comp',   // represents elem-b (target)
    };

    // Connection is REVERSED: sourceVisual points to target element, targetVisual to source
    const substitutedChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'id-view-1',
        relationshipId: 'id-rel-1',
        sourceVisualId: 'id-vis-2',    // vis-comp → elem-b (target) — wrong as source
        targetVisualId: 'id-vis-1',    // vis-svc → elem-a (source) — wrong as target
      },
    ];
    const originalChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'v-main',
        relationshipId: 'r1',
        sourceVisualId: 'vis-comp',
        targetVisualId: 'vis-svc',
      },
    ];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      tempIdMap,
      visualToElementMap,
    );

    expect(result.checked).toBe(1);
    expect(result.swapped).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].swapped).toBe(true);
    expect(result.details[0].valid).toBe(true);

    // Verify the chunk was mutated to swap the visual IDs
    expect(substitutedChunk[0].sourceVisualId).toBe('id-vis-1'); // now correct
    expect(substitutedChunk[0].targetVisualId).toBe('id-vis-2'); // now correct
  });

  test('fails on complete mismatch (neither direction matches)', async () => {
    const relDetail = makeRelationshipDetail();
    mockGet.mockResolvedValue(relDetail);

    const tempIdMap: Record<string, string> = {
      'e-x': 'id-elem-x',       // unrelated element
      'e-y': 'id-elem-y',       // unrelated element
      'r1': 'id-rel-1',
      'vis-x': 'id-vis-x',
      'vis-y': 'id-vis-y',
    };

    const visualToElementMap: Record<string, string> = {
      'vis-x': 'e-x',
      'vis-y': 'e-y',
    };

    const substitutedChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'id-view-1',
        relationshipId: 'id-rel-1',
        sourceVisualId: 'id-vis-x',
        targetVisualId: 'id-vis-y',
      },
    ];
    const originalChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'v-main',
        relationshipId: 'r1',
        sourceVisualId: 'vis-x',
        targetVisualId: 'vis-y',
      },
    ];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      tempIdMap,
      visualToElementMap,
    );

    expect(result.checked).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.details).toHaveLength(1);
    expect(result.details[0].valid).toBe(false);
    expect(result.details[0].error).toContain('mismatch');
  });

  test('skips validation when relationshipId is not a real ID', async () => {
    const tempIdMap: Record<string, string> = {};

    const visualToElementMap: Record<string, string> = {
      'vis-svc': 'e-svc',
    };

    const substitutedChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'v-main',
        relationshipId: 'r1',         // unresolved tempId
        sourceVisualId: 'vis-svc',
        targetVisualId: 'vis-comp',
      },
    ];
    const originalChunk = [...substitutedChunk];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      tempIdMap,
      visualToElementMap,
    );

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('skips validation when visual-to-element mapping is missing', async () => {
    const relDetail = makeRelationshipDetail();
    mockGet.mockResolvedValue(relDetail);

    const tempIdMap: Record<string, string> = {
      'r1': 'id-rel-1',
    };

    // No visual-to-element entries
    const visualToElementMap: Record<string, string> = {};

    const substitutedChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'id-view-1',
        relationshipId: 'id-rel-1',
        sourceVisualId: 'id-vis-1',
        targetVisualId: 'id-vis-2',
      },
    ];
    const originalChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'v-main',
        relationshipId: 'r1',
        sourceVisualId: 'vis-svc',
        targetVisualId: 'vis-comp',
      },
    ];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      tempIdMap,
      visualToElementMap,
    );

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  test('skips gracefully when API fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Connection refused'));

    const tempIdMap: Record<string, string> = {
      'e-svc': 'id-elem-a',
      'e-comp': 'id-elem-b',
      'r1': 'id-rel-1',
    };

    const visualToElementMap: Record<string, string> = {
      'vis-svc': 'e-svc',
      'vis-comp': 'e-comp',
    };

    const substitutedChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'id-view-1',
        relationshipId: 'id-rel-1',
        sourceVisualId: 'id-vis-1',
        targetVisualId: 'id-vis-2',
      },
    ];
    const originalChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'v-main',
        relationshipId: 'r1',
        sourceVisualId: 'vis-svc',
        targetVisualId: 'vis-comp',
      },
    ];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      tempIdMap,
      visualToElementMap,
    );

    expect(result.checked).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  test('caches relationship details across multiple connections', async () => {
    const relDetail = makeRelationshipDetail();
    mockGet.mockResolvedValue(relDetail);

    const tempIdMap: Record<string, string> = {
      'e-svc': 'id-elem-a',
      'e-comp': 'id-elem-b',
      'r1': 'id-rel-1',
      'vis-svc-1': 'id-vis-s1',
      'vis-comp-1': 'id-vis-t1',
      'vis-svc-2': 'id-vis-s2',
      'vis-comp-2': 'id-vis-t2',
    };

    const visualToElementMap: Record<string, string> = {
      'vis-svc-1': 'e-svc',
      'vis-comp-1': 'e-comp',
      'vis-svc-2': 'e-svc',
      'vis-comp-2': 'e-comp',
    };

    const substitutedChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'id-view-1',
        relationshipId: 'id-rel-1',
        sourceVisualId: 'id-vis-s1',
        targetVisualId: 'id-vis-t1',
      },
      {
        op: 'addConnectionToView',
        viewId: 'id-view-2',
        relationshipId: 'id-rel-1', // same relationship in different view
        sourceVisualId: 'id-vis-s2',
        targetVisualId: 'id-vis-t2',
      },
    ];
    const originalChunk = [
      {
        op: 'addConnectionToView',
        viewId: 'v-main',
        relationshipId: 'r1',
        sourceVisualId: 'vis-svc-1',
        targetVisualId: 'vis-comp-1',
      },
      {
        op: 'addConnectionToView',
        viewId: 'v-detail',
        relationshipId: 'r1',
        sourceVisualId: 'vis-svc-2',
        targetVisualId: 'vis-comp-2',
      },
    ];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      tempIdMap,
      visualToElementMap,
    );

    expect(result.checked).toBe(2);
    expect(result.passed).toBe(2);
    // API should only be called once due to caching
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('ignores non-addConnectionToView operations in chunk', async () => {
    const substitutedChunk = [
      { op: 'addToView', viewId: 'id-view-1', elementId: 'id-elem-1', tempId: 'vis-1' },
      { op: 'createElement', type: 'business-actor', name: 'Actor' },
    ];
    const originalChunk = [...substitutedChunk];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      {},
      {},
    );

    expect(result.checked).toBe(0);
    expect(result.passed).toBe(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('handles mixed chunk with connections and other operations', async () => {
    const relDetail = makeRelationshipDetail();
    mockGet.mockResolvedValue(relDetail);

    const tempIdMap: Record<string, string> = {
      'e-svc': 'id-elem-a',
      'e-comp': 'id-elem-b',
      'r1': 'id-rel-1',
      'vis-svc': 'id-vis-1',
      'vis-comp': 'id-vis-2',
    };

    const visualToElementMap: Record<string, string> = {
      'vis-svc': 'e-svc',
      'vis-comp': 'e-comp',
    };

    const substitutedChunk = [
      { op: 'addToView', viewId: 'id-view-1', elementId: 'id-elem-a', tempId: 'vis-extra' },
      {
        op: 'addConnectionToView',
        viewId: 'id-view-1',
        relationshipId: 'id-rel-1',
        sourceVisualId: 'id-vis-1',
        targetVisualId: 'id-vis-2',
      },
    ];
    const originalChunk = [
      { op: 'addToView', viewId: 'v-main', elementId: 'e-svc', tempId: 'vis-extra' },
      {
        op: 'addConnectionToView',
        viewId: 'v-main',
        relationshipId: 'r1',
        sourceVisualId: 'vis-svc',
        targetVisualId: 'vis-comp',
      },
    ];

    const result = await crossValidateConnections(
      substitutedChunk,
      originalChunk,
      tempIdMap,
      visualToElementMap,
    );

    expect(result.checked).toBe(1);
    expect(result.passed).toBe(1);
  });
});
