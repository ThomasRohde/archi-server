/**
 * Unit tests for BOM schema validation of all 20 operation types.
 *
 * Verifies that each operation's required fields, optional fields,
 * and additionalProperties constraints are correctly enforced.
 */
import { describe, expect, test } from 'vitest';
import { validate } from '../src/schemas/registry';

function wrapChange(change: Record<string, unknown>) {
  return { version: '1.0', changes: [change] };
}

function expectValid(change: Record<string, unknown>) {
  const result = validate('bom', wrapChange(change));
  if (!result.valid) {
    const msgs = result.errors.map((e: { message?: string }) => e.message).join('; ');
    throw new Error(`Expected valid but got errors: ${msgs}`);
  }
}

function expectInvalid(change: Record<string, unknown>) {
  const result = validate('bom', wrapChange(change));
  expect(result.valid).toBe(false);
}

function expectBomValid(bom: Record<string, unknown>) {
  const result = validate('bom', bom);
  if (!result.valid) {
    const msgs = result.errors.map((e: { message?: string }) => e.message).join('; ');
    throw new Error(`Expected valid BOM but got errors: ${msgs}`);
  }
}

function expectBomInvalid(bom: Record<string, unknown>) {
  const result = validate('bom', bom);
  expect(result.valid).toBe(false);
}

// ── root BOM fields ──────────────────────────────────────────────────────────

describe('BOM root fields', () => {
  test('accepts idempotencyKey and duplicateStrategy', () => {
    expectBomValid({
      version: '1.0',
      idempotencyKey: 'verify-test-1',
      duplicateStrategy: 'reuse',
      changes: [{ op: 'createElement', type: 'business-actor', name: 'Customer' }],
    });
  });

  test('rejects invalid idempotencyKey pattern', () => {
    expectBomInvalid({
      version: '1.0',
      idempotencyKey: 'invalid key with spaces',
      changes: [{ op: 'createElement', type: 'business-actor', name: 'Customer' }],
    });
  });

  test('rejects invalid duplicateStrategy', () => {
    expectBomInvalid({
      version: '1.0',
      duplicateStrategy: 'skip',
      changes: [{ op: 'createElement', type: 'business-actor', name: 'Customer' }],
    });
  });
});

// ── createElement ────────────────────────────────────────────────────────────

describe('createElement', () => {
  test('valid minimal', () => {
    expectValid({ op: 'createElement', type: 'business-actor', name: 'Customer' });
  });
  test('valid with all optional fields', () => {
    expectValid({
      op: 'createElement', type: 'business-actor', name: 'Customer',
      tempId: 'e-cust', documentation: 'A customer', folder: 'Business',
    });
  });
  test('missing name', () => {
    expectInvalid({ op: 'createElement', type: 'business-actor' });
  });
  test('missing type', () => {
    expectInvalid({ op: 'createElement', name: 'Customer' });
  });
  test('invalid type', () => {
    expectInvalid({ op: 'createElement', type: 'invalid-type', name: 'X' });
  });
  test('rejects extra fields', () => {
    expectInvalid({ op: 'createElement', type: 'business-actor', name: 'X', bogus: true });
  });
});

// ── createRelationship ───────────────────────────────────────────────────────

describe('createRelationship', () => {
  test('valid minimal', () => {
    expectValid({ op: 'createRelationship', type: 'serving-relationship', sourceId: 's1', targetId: 't1' });
  });
  test('valid with optional fields', () => {
    expectValid({
      op: 'createRelationship', type: 'access-relationship', sourceId: 's1', targetId: 't1',
      tempId: 'r1', name: 'Accesses', documentation: 'desc', accessType: 1, strength: '+',
    });
  });
  test('missing sourceId', () => {
    expectInvalid({ op: 'createRelationship', type: 'serving-relationship', targetId: 't1' });
  });
  test('missing targetId', () => {
    expectInvalid({ op: 'createRelationship', type: 'serving-relationship', sourceId: 's1' });
  });
  test('invalid relationship type', () => {
    expectInvalid({ op: 'createRelationship', type: 'bogus', sourceId: 's1', targetId: 't1' });
  });
});

// ── createView ───────────────────────────────────────────────────────────────

describe('createView', () => {
  test('valid minimal', () => {
    expectValid({ op: 'createView', name: 'My View' });
  });
  test('valid with optional', () => {
    expectValid({ op: 'createView', name: 'My View', tempId: 'v1', documentation: 'desc', viewpoint: 'application_cooperation' });
  });
  test('missing name', () => {
    expectInvalid({ op: 'createView' });
  });
});

// ── createFolder ─────────────────────────────────────────────────────────────

describe('createFolder', () => {
  test('valid with parentId', () => {
    expectValid({ op: 'createFolder', name: 'Sub', parentId: 'id-123' });
  });
  test('valid with parentType', () => {
    expectValid({ op: 'createFolder', name: 'Sub', parentType: 'application' });
  });
  test('missing name', () => {
    expectInvalid({ op: 'createFolder', parentId: 'id-123' });
  });
  test('missing both parentId and parentType', () => {
    expectInvalid({ op: 'createFolder', name: 'Sub' });
  });
});

// ── deleteView ───────────────────────────────────────────────────────────────

describe('deleteView', () => {
  test('valid', () => {
    expectValid({ op: 'deleteView', viewId: 'id-view-1' });
  });
  test('missing viewId', () => {
    expectInvalid({ op: 'deleteView' });
  });
});

// ── addToView ────────────────────────────────────────────────────────────────

describe('addToView', () => {
  test('valid minimal', () => {
    expectValid({ op: 'addToView', viewId: 'v1', elementId: 'e1' });
  });
  test('valid with optional', () => {
    expectValid({
      op: 'addToView', viewId: 'v1', elementId: 'e1',
      tempId: 'vis1', parentVisualId: 'pv1', x: 10, y: 20, width: 100, height: 50, autoNest: true,
    });
  });
  test('missing elementId', () => {
    expectInvalid({ op: 'addToView', viewId: 'v1' });
  });
  test('missing viewId', () => {
    expectInvalid({ op: 'addToView', elementId: 'e1' });
  });
});

// ── nestInView ───────────────────────────────────────────────────────────────

describe('nestInView', () => {
  test('valid minimal', () => {
    expectValid({ op: 'nestInView', viewId: 'v1', visualId: 'vis1', parentVisualId: 'pv1' });
  });
  test('valid with optional', () => {
    expectValid({ op: 'nestInView', viewId: 'v1', visualId: 'vis1', parentVisualId: 'pv1', x: 10, y: 30 });
  });
  test('missing visualId', () => {
    expectInvalid({ op: 'nestInView', viewId: 'v1', parentVisualId: 'pv1' });
  });
});

// ── addConnectionToView ──────────────────────────────────────────────────────

describe('addConnectionToView', () => {
  test('valid minimal', () => {
    expectValid({
      op: 'addConnectionToView', viewId: 'v1', relationshipId: 'r1',
      sourceVisualId: 'sv1', targetVisualId: 'tv1',
    });
  });
  test('valid with tempId', () => {
    expectValid({
      op: 'addConnectionToView', viewId: 'v1', relationshipId: 'r1',
      sourceVisualId: 'sv1', targetVisualId: 'tv1', tempId: 'conn-1',
    });
  });
  test('missing relationshipId', () => {
    expectInvalid({ op: 'addConnectionToView', viewId: 'v1', sourceVisualId: 'sv1', targetVisualId: 'tv1' });
  });
  test('valid without sourceVisualId (autoResolveVisuals)', () => {
    expectValid({ op: 'addConnectionToView', viewId: 'v1', relationshipId: 'r1', targetVisualId: 'tv1' });
  });
  test('valid without targetVisualId (autoResolveVisuals)', () => {
    expectValid({ op: 'addConnectionToView', viewId: 'v1', relationshipId: 'r1', sourceVisualId: 'sv1' });
  });
  test('valid with autoResolveVisuals and no visual IDs', () => {
    expectValid({ op: 'addConnectionToView', viewId: 'v1', relationshipId: 'r1', autoResolveVisuals: true });
  });
  test('missing viewId', () => {
    expectInvalid({ op: 'addConnectionToView', relationshipId: 'r1', sourceVisualId: 'sv1', targetVisualId: 'tv1' });
  });
  test('rejects extra fields', () => {
    expectInvalid({
      op: 'addConnectionToView', viewId: 'v1', relationshipId: 'r1',
      sourceVisualId: 'sv1', targetVisualId: 'tv1', bogus: 42,
    });
  });
});

// ── updateElement ────────────────────────────────────────────────────────────

describe('updateElement', () => {
  test('valid with name', () => {
    expectValid({ op: 'updateElement', id: 'id-e1', name: 'New Name' });
  });
  test('valid with documentation', () => {
    expectValid({ op: 'updateElement', id: 'id-e1', documentation: 'Updated docs' });
  });
  test('valid with properties', () => {
    expectValid({ op: 'updateElement', id: 'id-e1', properties: { key1: 'val1' } });
  });
  test('missing id', () => {
    expectInvalid({ op: 'updateElement', name: 'New Name' });
  });
  test('missing all update fields', () => {
    expectInvalid({ op: 'updateElement', id: 'id-e1' });
  });
  test('rejects extra fields', () => {
    expectInvalid({ op: 'updateElement', id: 'id-e1', name: 'X', bogus: true });
  });
});

// ── updateRelationship ───────────────────────────────────────────────────────

describe('updateRelationship', () => {
  test('valid with name', () => {
    expectValid({ op: 'updateRelationship', id: 'id-r1', name: 'New Name' });
  });
  test('valid with documentation', () => {
    expectValid({ op: 'updateRelationship', id: 'id-r1', documentation: 'Updated' });
  });
  test('valid with properties', () => {
    expectValid({ op: 'updateRelationship', id: 'id-r1', properties: { k: 'v' } });
  });
  test('missing id', () => {
    expectInvalid({ op: 'updateRelationship', name: 'X' });
  });
  test('missing all update fields', () => {
    expectInvalid({ op: 'updateRelationship', id: 'id-r1' });
  });
});

// ── deleteElement ────────────────────────────────────────────────────────────

describe('deleteElement', () => {
  test('valid', () => {
    expectValid({ op: 'deleteElement', id: 'id-e1' });
  });
  test('valid with cascade', () => {
    expectValid({ op: 'deleteElement', id: 'id-e1', cascade: false });
  });
  test('missing id', () => {
    expectInvalid({ op: 'deleteElement' });
  });
  test('cascade must be boolean', () => {
    expectInvalid({ op: 'deleteElement', id: 'id-e1', cascade: 'yes' });
  });
});

// ── deleteRelationship ───────────────────────────────────────────────────────

describe('deleteRelationship', () => {
  test('valid', () => {
    expectValid({ op: 'deleteRelationship', id: 'id-r1' });
  });
  test('missing id', () => {
    expectInvalid({ op: 'deleteRelationship' });
  });
});

// ── setProperty ──────────────────────────────────────────────────────────────

describe('setProperty', () => {
  test('valid', () => {
    expectValid({ op: 'setProperty', id: 'id-e1', key: 'owner', value: 'team-a' });
  });
  test('missing key', () => {
    expectInvalid({ op: 'setProperty', id: 'id-e1', value: 'team-a' });
  });
  test('missing value', () => {
    expectInvalid({ op: 'setProperty', id: 'id-e1', key: 'owner' });
  });
  test('missing id', () => {
    expectInvalid({ op: 'setProperty', key: 'owner', value: 'v' });
  });
});

// ── moveToFolder ─────────────────────────────────────────────────────────────

describe('moveToFolder', () => {
  test('valid', () => {
    expectValid({ op: 'moveToFolder', id: 'id-e1', folderId: 'id-f1' });
  });
  test('missing id', () => {
    expectInvalid({ op: 'moveToFolder', folderId: 'id-f1' });
  });
  test('missing folderId', () => {
    expectInvalid({ op: 'moveToFolder', id: 'id-e1' });
  });
});

// ── deleteConnectionFromView ─────────────────────────────────────────────────

describe('deleteConnectionFromView', () => {
  test('valid', () => {
    expectValid({ op: 'deleteConnectionFromView', viewId: 'v1', connectionId: 'c1' });
  });
  test('missing viewId', () => {
    expectInvalid({ op: 'deleteConnectionFromView', connectionId: 'c1' });
  });
  test('missing connectionId', () => {
    expectInvalid({ op: 'deleteConnectionFromView', viewId: 'v1' });
  });
});

// ── styleViewObject ──────────────────────────────────────────────────────────

describe('styleViewObject', () => {
  test('valid minimal', () => {
    expectValid({ op: 'styleViewObject', viewObjectId: 'vo1' });
  });
  test('valid with style properties', () => {
    expectValid({
      op: 'styleViewObject', viewObjectId: 'vo1',
      fillColor: '#FF0000', fontColor: '#000000', lineWidth: 2, opacity: 200,
    });
  });
  test('missing viewObjectId', () => {
    expectInvalid({ op: 'styleViewObject' });
  });
  test('rejects extra fields', () => {
    expectInvalid({ op: 'styleViewObject', viewObjectId: 'vo1', bogus: 1 });
  });
});

// ── styleConnection ──────────────────────────────────────────────────────────

describe('styleConnection', () => {
  test('valid minimal', () => {
    expectValid({ op: 'styleConnection', connectionId: 'c1' });
  });
  test('valid with style', () => {
    expectValid({ op: 'styleConnection', connectionId: 'c1', lineColor: '#0000FF', lineWidth: 1 });
  });
  test('missing connectionId', () => {
    expectInvalid({ op: 'styleConnection' });
  });
});

// ── moveViewObject ───────────────────────────────────────────────────────────

describe('moveViewObject', () => {
  test('valid with x', () => {
    expectValid({ op: 'moveViewObject', viewObjectId: 'vo1', x: 100 });
  });
  test('valid with y', () => {
    expectValid({ op: 'moveViewObject', viewObjectId: 'vo1', y: 200 });
  });
  test('valid with width and height', () => {
    expectValid({ op: 'moveViewObject', viewObjectId: 'vo1', width: 150, height: 80 });
  });
  test('valid with all dimensions', () => {
    expectValid({ op: 'moveViewObject', viewObjectId: 'vo1', x: 10, y: 20, width: 100, height: 50 });
  });
  test('missing viewObjectId', () => {
    expectInvalid({ op: 'moveViewObject', x: 100 });
  });
  test('missing all dimensions', () => {
    expectInvalid({ op: 'moveViewObject', viewObjectId: 'vo1' });
  });
});

// ── createNote ───────────────────────────────────────────────────────────────

describe('createNote', () => {
  test('valid minimal', () => {
    expectValid({ op: 'createNote', viewId: 'v1', content: 'Hello world' });
  });
  test('valid with optional', () => {
    expectValid({
      op: 'createNote', viewId: 'v1', content: 'Note text',
      tempId: 'n1', x: 10, y: 20, width: 200, height: 100,
    });
  });
  test('missing viewId', () => {
    expectInvalid({ op: 'createNote', content: 'text' });
  });
  test('missing content', () => {
    expectInvalid({ op: 'createNote', viewId: 'v1' });
  });
  test('text field is not accepted (must use content)', () => {
    expectInvalid({ op: 'createNote', viewId: 'v1', text: 'Hello' });
  });
});

// ── createGroup ──────────────────────────────────────────────────────────────

describe('createGroup', () => {
  test('valid minimal', () => {
    expectValid({ op: 'createGroup', viewId: 'v1', name: 'My Group' });
  });
  test('valid with optional', () => {
    expectValid({
      op: 'createGroup', viewId: 'v1', name: 'Group',
      tempId: 'g1', documentation: 'desc', x: 0, y: 0, width: 300, height: 200,
    });
  });
  test('missing viewId', () => {
    expectInvalid({ op: 'createGroup', name: 'Group' });
  });
  test('missing name', () => {
    expectInvalid({ op: 'createGroup', viewId: 'v1' });
  });
});

// ── Unknown op ───────────────────────────────────────────────────────────────

describe('unknown operations', () => {
  test('rejects unknown op', () => {
    expectInvalid({ op: 'doSomethingWeird', id: 'id-1' });
  });
});
