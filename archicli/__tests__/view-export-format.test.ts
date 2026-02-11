import { describe, expect, test } from 'vitest';
import { normalizeViewListResponse } from '../src/commands/view/export';

describe('normalizeViewListResponse', () => {
  test('accepts envelope response with views array', () => {
    const result = normalizeViewListResponse({
      views: [
        { id: 'id-view-1', name: 'Main View', type: 'archimate-diagram-model' },
        { id: 'id-view-2', name: 'Secondary View' },
      ],
      total: 2,
    });

    expect(result).toEqual([
      { id: 'id-view-1', name: 'Main View', type: 'archimate-diagram-model' },
      { id: 'id-view-2', name: 'Secondary View' },
    ]);
  });

  test('accepts legacy raw array response', () => {
    const result = normalizeViewListResponse([
      { id: 'id-view-3', name: 'Legacy View' },
    ]);

    expect(result).toEqual([{ id: 'id-view-3', name: 'Legacy View' }]);
  });

  test('drops malformed entries and unknown shapes', () => {
    const fromEnvelope = normalizeViewListResponse({
      views: [{ name: 'Missing Id' }, null, { id: 'id-view-4' }],
    });
    const fromInvalidShape = normalizeViewListResponse({ total: 0 });

    expect(fromEnvelope).toEqual([{ id: 'id-view-4', name: '' }]);
    expect(fromInvalidShape).toEqual([]);
  });
});
