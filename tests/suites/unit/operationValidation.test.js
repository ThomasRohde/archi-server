/**
 * Unit Tests for operationValidation.js
 *
 * Tests validation logic for API operations without requiring a running server.
 *
 * Note: The source modules are GraalVM IIFEs that set globalThis properties.
 * Because package.json has "type": "module", Node.js treats .js files as ESM,
 * so the IIFE's `module.exports` assignment is ignored. We require() the files
 * to execute the IIFEs, then read from globalThis.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let serverConfig, operationValidation;

beforeAll(() => {
  // require() executes the IIFEs which set globalThis properties.
  // In ESM context ("type": "module"), module.exports isn't set, so we read from globalThis.
  // serverConfig must be loaded first (operationValidation depends on it as a global)
  require('../../../scripts/lib/server/serverConfig.js');
  serverConfig = globalThis.serverConfig;
  require('../../../scripts/lib/server/operationValidation.js');
  operationValidation = globalThis.operationValidation;
  if (!serverConfig) {
    throw new Error('Failed to load serverConfig from globalThis after require()');
  }
  if (!operationValidation) {
    throw new Error('Failed to load operationValidation from globalThis after require()');
  }
});

describe('operationValidation', () => {
  describe('validateApplyRequest', () => {
    it('validates a valid request with createElement', () => {
      const request = {
        changes: [{
          op: 'createElement',
          type: 'business-actor',
          name: 'Test Actor'
        }]
      };

      expect(() => operationValidation.validateApplyRequest(request)).not.toThrow();
    });

    it('validates a valid request with multiple changes', () => {
      const request = {
        changes: [
          { op: 'createElement', type: 'business-actor', name: 'Actor 1' },
          { op: 'createElement', type: 'application-component', name: 'Component 1' },
          { op: 'createRelationship', type: 'serving-relationship', sourceId: 'id1', targetId: 'id2' }
        ]
      };

      expect(() => operationValidation.validateApplyRequest(request)).not.toThrow();
    });

    it('throws when request body is missing', () => {
      expect(() => operationValidation.validateApplyRequest(null)).toThrow('Request body is missing');
      expect(() => operationValidation.validateApplyRequest(undefined)).toThrow('Request body is missing');
    });

    it('throws when changes array is missing', () => {
      expect(() => operationValidation.validateApplyRequest({})).toThrow("Missing or invalid 'changes' array");
    });

    it('throws when changes is not an array', () => {
      expect(() => operationValidation.validateApplyRequest({ changes: 'not-array' })).toThrow("Missing or invalid 'changes' array");
      expect(() => operationValidation.validateApplyRequest({ changes: 123 })).toThrow("Missing or invalid 'changes' array");
      expect(() => operationValidation.validateApplyRequest({ changes: {} })).toThrow("Missing or invalid 'changes' array");
    });

    it('throws when changes array is empty', () => {
      expect(() => operationValidation.validateApplyRequest({ changes: [] })).toThrow("'changes' array is empty");
    });

    it('throws when changes exceed maximum', () => {
      const maxChanges = operationValidation._getMaxChanges();
      const changes = Array.from({ length: maxChanges + 1 }, () => ({
        op: 'createElement',
        type: 'business-actor',
        name: 'Test'
      }));

      expect(() => operationValidation.validateApplyRequest({ changes }))
        .toThrow(/Too many changes/);
    });
  });

  describe('validateCreateElement', () => {
    it('validates a valid createElement operation', () => {
      const change = {
        op: 'createElement',
        type: 'business-actor',
        name: 'Test Actor'
      };

      expect(() => operationValidation.validateCreateElement(change, 0)).not.toThrow();
    });

    it('normalizes element type', () => {
      const change = {
        op: 'createElement',
        type: 'BusinessActor', // PascalCase
        name: 'Test Actor'
      };

      operationValidation.validateCreateElement(change, 0);
      expect(change.type).toBe('business-actor');
    });

    it('accepts camelCase element types', () => {
      const change = {
        op: 'createElement',
        type: 'businessActor',
        name: 'Test Actor'
      };

      expect(() => operationValidation.validateCreateElement(change, 0)).not.toThrow();
    });

    it('accepts snake_case element types', () => {
      const change = {
        op: 'createElement',
        type: 'business_actor',
        name: 'Test Actor'
      };

      expect(() => operationValidation.validateCreateElement(change, 0)).not.toThrow();
    });

    it('throws when type is missing', () => {
      const change = {
        op: 'createElement',
        name: 'Test Actor'
      };

      expect(() => operationValidation.validateCreateElement(change, 0))
        .toThrow(/missing 'type' field/);
    });

    it('throws when name is missing', () => {
      const change = {
        op: 'createElement',
        type: 'business-actor'
      };

      expect(() => operationValidation.validateCreateElement(change, 0))
        .toThrow(/missing 'name' field/);
    });

    it('throws when element type is invalid', () => {
      const change = {
        op: 'createElement',
        type: 'invalid-type',
        name: 'Test'
      };

      expect(() => operationValidation.validateCreateElement(change, 0))
        .toThrow(/invalid element type/);
    });

    it('includes helpful error message for invalid types', () => {
      const change = {
        op: 'createElement',
        type: 'not-a-real-element',
        name: 'Test'
      };

      expect(() => operationValidation.validateCreateElement(change, 0))
        .toThrow(/Valid types:/);
    });
  });

  describe('validateCreateRelationship', () => {
    it('validates a valid createRelationship operation', () => {
      const change = {
        op: 'createRelationship',
        type: 'serving-relationship',
        sourceId: 'source-id',
        targetId: 'target-id'
      };

      expect(() => operationValidation.validateCreateRelationship(change, 0)).not.toThrow();
    });

    it('throws when type is missing', () => {
      const change = {
        op: 'createRelationship',
        sourceId: 'source-id',
        targetId: 'target-id'
      };

      expect(() => operationValidation.validateCreateRelationship(change, 0))
        .toThrow(/missing 'type' field/);
    });

    it('throws when sourceId is missing', () => {
      const change = {
        op: 'createRelationship',
        type: 'serving-relationship',
        targetId: 'target-id'
      };

      expect(() => operationValidation.validateCreateRelationship(change, 0))
        .toThrow(/missing 'sourceId' field/);
    });

    it('throws when targetId is missing', () => {
      const change = {
        op: 'createRelationship',
        type: 'serving-relationship',
        sourceId: 'source-id'
      };

      expect(() => operationValidation.validateCreateRelationship(change, 0))
        .toThrow(/missing 'targetId' field/);
    });

    it('throws when relationship type is invalid', () => {
      const change = {
        op: 'createRelationship',
        type: 'invalid-relationship',
        sourceId: 'source-id',
        targetId: 'target-id'
      };

      expect(() => operationValidation.validateCreateRelationship(change, 0))
        .toThrow(/invalid relationship type/);
    });

    it('includes helpful error message for invalid relationship types', () => {
      const change = {
        op: 'createRelationship',
        type: 'not-a-relationship',
        sourceId: 'source-id',
        targetId: 'target-id'
      };

      expect(() => operationValidation.validateCreateRelationship(change, 0))
        .toThrow(/Valid types:/);
    });

    it('validates all standard relationship types', () => {
      const relationshipTypes = [
        'composition-relationship',
        'aggregation-relationship',
        'assignment-relationship',
        'realization-relationship',
        'serving-relationship',
        'access-relationship',
        'influence-relationship',
        'triggering-relationship',
        'flow-relationship',
        'specialization-relationship',
        'association-relationship'
      ];

      relationshipTypes.forEach(type => {
        const change = {
          op: 'createRelationship',
          type,
          sourceId: 'source-id',
          targetId: 'target-id'
        };

        expect(() => operationValidation.validateCreateRelationship(change, 0)).not.toThrow();
      });
    });
  });

  describe('validateChange', () => {
    it('throws when op field is missing', () => {
      const change = {
        type: 'business-actor',
        name: 'Test'
      };

      expect(() => operationValidation.validateChange(change, 0))
        .toThrow(/missing 'op' field/);
    });

    it('throws for unknown operation type', () => {
      const change = {
        op: 'unknownOperation',
        type: 'business-actor',
        name: 'Test'
      };

      expect(() => operationValidation.validateChange(change, 0))
        .toThrow(/unknown operation/);
    });

    it('delegates to validateCreateElement for createElement op', () => {
      const change = {
        op: 'createElement',
        type: 'business-actor',
        name: 'Test'
      };

      expect(() => operationValidation.validateChange(change, 0)).not.toThrow();
    });

    it('delegates to validateCreateRelationship for createRelationship op', () => {
      const change = {
        op: 'createRelationship',
        type: 'serving-relationship',
        sourceId: 'id1',
        targetId: 'id2'
      };

      expect(() => operationValidation.validateChange(change, 0)).not.toThrow();
    });
  });

  describe('helper methods', () => {
    it('normalizeElementType delegates to serverConfig', () => {
      expect(operationValidation.normalizeElementType('BusinessActor')).toBe('business-actor');
      expect(operationValidation.normalizeElementType('applicationComponent')).toBe('application-component');
    });

    it('isValidElementType delegates to serverConfig', () => {
      expect(operationValidation.isValidElementType('business-actor')).toBe(true);
      expect(operationValidation.isValidElementType('invalid-type')).toBe(false);
    });

    it('isValidRelationshipType delegates to serverConfig', () => {
      expect(operationValidation.isValidRelationshipType('serving-relationship')).toBe(true);
      expect(operationValidation.isValidRelationshipType('invalid-relationship')).toBe(false);
    });
  });

  describe('error message quality', () => {
    it('includes change index in error messages', () => {
      const request = {
        changes: [
          { op: 'createElement', type: 'business-actor', name: 'Valid' },
          { op: 'createElement', type: 'invalid-type', name: 'Invalid' },
          { op: 'createElement', type: 'business-role', name: 'Valid' }
        ]
      };

      expect(() => operationValidation.validateApplyRequest(request))
        .toThrow(/Change 1/);
    });

    it('includes operation name in error messages', () => {
      const request = {
        changes: [{
          op: 'createElement',
          type: 'business-actor'
          // Missing name field
        }]
      };

      expect(() => operationValidation.validateApplyRequest(request))
        .toThrow(/createElement/);
    });

    it('provides normalized type hint for invalid types', () => {
      const request = {
        changes: [{
          op: 'createElement',
          type: 'InvalidType', // Will normalize to 'invalid-type'
          name: 'Test'
        }]
      };

      try {
        operationValidation.validateApplyRequest(request);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toContain('invalid element type');
        expect(error.message).toContain('InvalidType');
      }
    });
  });

  describe('Duplicate Detection', () => {
    describe('Element Duplicates', () => {
      it('detects duplicate element in model snapshot', () => {
        const modelSnapshot = {
          elements: [
            { id: 'existing-1', name: 'Customer', type: 'business-actor' }
          ],
          relationships: []
        };

        const request = {
          changes: [{
            op: 'createElement',
            type: 'business-actor',
            name: 'Customer'
          }]
        };

        expect(() => operationValidation.validateApplyRequest(request, modelSnapshot))
          .toThrow(/element 'Customer' of type 'business-actor' already exists.*id: existing-1/);
      });

      it('allows element with same name but different type', () => {
        const modelSnapshot = {
          elements: [
            { id: 'existing-1', name: 'Customer', type: 'business-actor' }
          ],
          relationships: []
        };

        const request = {
          changes: [{
            op: 'createElement',
            type: 'business-role', // Different type
            name: 'Customer'
          }]
        };

        expect(() => operationValidation.validateApplyRequest(request, modelSnapshot))
          .not.toThrow();
      });

      it('detects intra-batch duplicate elements', () => {
        const request = {
          changes: [
            { op: 'createElement', type: 'business-actor', name: 'Customer', tempId: 't1' },
            { op: 'createElement', type: 'business-actor', name: 'Customer', tempId: 't2' }
          ]
        };

        expect(() => operationValidation.validateApplyRequest(request))
          .toThrow(/element 'Customer' of type 'business-actor' already created earlier in this batch.*tempId: t1/);
      });

      it('allows multiple different elements in same batch', () => {
        const request = {
          changes: [
            { op: 'createElement', type: 'business-actor', name: 'Customer', tempId: 't1' },
            { op: 'createElement', type: 'business-actor', name: 'Supplier', tempId: 't2' },
            { op: 'createElement', type: 'application-component', name: 'Customer', tempId: 't3' } // Same name, different type
          ]
        };

        expect(() => operationValidation.validateApplyRequest(request))
          .not.toThrow();
      });

      it('checks both model and batch for duplicates', () => {
        const modelSnapshot = {
          elements: [
            { id: 'existing-1', name: 'Customer', type: 'business-actor' }
          ],
          relationships: []
        };

        const request = {
          changes: [
            { op: 'createElement', type: 'business-actor', name: 'Supplier', tempId: 't1' },
            { op: 'createElement', type: 'business-actor', name: 'Customer', tempId: 't2' } // Duplicate from model
          ]
        };

        expect(() => operationValidation.validateApplyRequest(request, modelSnapshot))
          .toThrow(/element 'Customer' of type 'business-actor' already exists.*id: existing-1/);
      });
    });

    describe('Relationship Duplicates', () => {
      it('detects duplicate relationship in model snapshot', () => {
        const modelSnapshot = {
          elements: [],
          relationships: [
            {
              id: 'rel-1',
              type: 'serving-relationship',
              source: 'source-id',
              target: 'target-id'
            }
          ]
        };

        const request = {
          changes: [{
            op: 'createRelationship',
            type: 'serving-relationship',
            sourceId: 'source-id',
            targetId: 'target-id'
          }]
        };

        expect(() => operationValidation.validateApplyRequest(request, modelSnapshot))
          .toThrow(/relationship of type 'serving-relationship' from 'source-id' to 'target-id' already exists.*id: rel-1/);
      });

      it('allows different relationship type between same elements', () => {
        const modelSnapshot = {
          elements: [],
          relationships: [
            {
              id: 'rel-1',
              type: 'serving-relationship',
              source: 'source-id',
              target: 'target-id'
            }
          ]
        };

        const request = {
          changes: [{
            op: 'createRelationship',
            type: 'assignment-relationship', // Different type
            sourceId: 'source-id',
            targetId: 'target-id'
          }]
        };

        expect(() => operationValidation.validateApplyRequest(request, modelSnapshot))
          .not.toThrow();
      });

      it('detects intra-batch duplicate relationships', () => {
        const request = {
          changes: [
            {
              op: 'createRelationship',
              type: 'serving-relationship',
              sourceId: 'source-id',
              targetId: 'target-id',
              tempId: 'tr1'
            },
            {
              op: 'createRelationship',
              type: 'serving-relationship',
              sourceId: 'source-id',
              targetId: 'target-id',
              tempId: 'tr2'
            }
          ]
        };

        expect(() => operationValidation.validateApplyRequest(request))
          .toThrow(/relationship of type 'serving-relationship' from 'source-id' to 'target-id' already created earlier in this batch.*tempId: tr1/);
      });

      it('allows multiple different relationships in same batch', () => {
        const request = {
          changes: [
            {
              op: 'createRelationship',
              type: 'serving-relationship',
              sourceId: 'source-id',
              targetId: 'target-id',
              tempId: 'tr1'
            },
            {
              op: 'createRelationship',
              type: 'composition-relationship',
              sourceId: 'source-id',
              targetId: 'target-id',
              tempId: 'tr2'
            },
            {
              op: 'createRelationship',
              type: 'serving-relationship',
              sourceId: 'other-source',
              targetId: 'target-id',
              tempId: 'tr3'
            }
          ]
        };

        expect(() => operationValidation.validateApplyRequest(request))
          .not.toThrow();
      });
    });

    describe('Helper Functions', () => {
      it('_findDuplicateElement finds existing element', () => {
        const modelSnapshot = {
          elements: [
            { id: 'id-1', name: 'Actor A', type: 'business-actor' },
            { id: 'id-2', name: 'Actor B', type: 'business-role' }
          ]
        };

        const result = operationValidation._findDuplicateElement(modelSnapshot, 'Actor A', 'business-actor');
        expect(result).toBeDefined();
        expect(result.id).toBe('id-1');
      });

      it('_findDuplicateElement returns null when no match', () => {
        const modelSnapshot = {
          elements: [
            { id: 'id-1', name: 'Actor A', type: 'business-actor' }
          ]
        };

        const result = operationValidation._findDuplicateElement(modelSnapshot, 'Actor B', 'business-actor');
        expect(result).toBeNull();
      });

      it('_findDuplicateRelationship finds existing relationship', () => {
        const modelSnapshot = {
          relationships: [
            { id: 'rel-1', source: 's1', target: 't1', type: 'serving-relationship' },
            { id: 'rel-2', source: 's2', target: 't2', type: 'composition-relationship' }
          ]
        };

        const result = operationValidation._findDuplicateRelationship(modelSnapshot, 's1', 't1', 'serving-relationship');
        expect(result).toBeDefined();
        expect(result.id).toBe('rel-1');
      });

      it('_findDuplicateRelationship returns null when no match', () => {
        const modelSnapshot = {
          relationships: [
            { id: 'rel-1', source: 's1', target: 't1', type: 'serving-relationship' }
          ]
        };

        const result = operationValidation._findDuplicateRelationship(modelSnapshot, 's1', 't1', 'composition-relationship');
        expect(result).toBeNull();
      });
    });
  });

  describe('nestInView validation', () => {
    it('accepts valid nestInView operation', () => {
      const request = {
        changes: [{
          op: 'nestInView',
          viewId: 'view-1',
          visualId: 'vis-child',
          parentVisualId: 'vis-parent'
        }]
      };
      expect(() => operationValidation.validateApplyRequest(request)).not.toThrow();
    });

    it('accepts nestInView with optional x, y', () => {
      const request = {
        changes: [{
          op: 'nestInView',
          viewId: 'view-1',
          visualId: 'vis-child',
          parentVisualId: 'vis-parent',
          x: 10,
          y: 30
        }]
      };
      expect(() => operationValidation.validateApplyRequest(request)).not.toThrow();
    });

    it('rejects nestInView without viewId', () => {
      const change = { op: 'nestInView', visualId: 'vis-child', parentVisualId: 'vis-parent' };
      expect(() => operationValidation.validateNestInView(change, 0))
        .toThrow("missing 'viewId' field");
    });

    it('rejects nestInView without visualId', () => {
      const change = { op: 'nestInView', viewId: 'view-1', parentVisualId: 'vis-parent' };
      expect(() => operationValidation.validateNestInView(change, 0))
        .toThrow("missing 'visualId' field");
    });

    it('rejects nestInView without parentVisualId', () => {
      const change = { op: 'nestInView', viewId: 'view-1', visualId: 'vis-child' };
      expect(() => operationValidation.validateNestInView(change, 0))
        .toThrow("missing 'parentVisualId' field");
    });

    it('rejects nestInView with non-numeric x', () => {
      const change = { op: 'nestInView', viewId: 'view-1', visualId: 'vis-child', parentVisualId: 'vis-parent', x: 'bad' };
      expect(() => operationValidation.validateNestInView(change, 0))
        .toThrow("'x' must be a number");
    });

    it('rejects nestInView with non-numeric y', () => {
      const change = { op: 'nestInView', viewId: 'view-1', visualId: 'vis-child', parentVisualId: 'vis-parent', y: 'bad' };
      expect(() => operationValidation.validateNestInView(change, 0))
        .toThrow("'y' must be a number");
    });
  });

  describe('addToView parentVisualId validation', () => {
    it('accepts addToView with parentVisualId', () => {
      const request = {
        changes: [{
          op: 'addToView',
          viewId: 'view-1',
          elementId: 'elem-1',
          parentVisualId: 'vis-parent',
          x: 10,
          y: 30
        }]
      };
      expect(() => operationValidation.validateApplyRequest(request)).not.toThrow();
    });

    it('rejects addToView with non-string parentVisualId', () => {
      const change = { op: 'addToView', viewId: 'view-1', elementId: 'elem-1', parentVisualId: 123 };
      expect(() => operationValidation.validateAddToView(change, 0))
        .toThrow("'parentVisualId' must be a string");
    });
  });

  describe('strict geometry typing', () => {
    it('rejects moveViewObject with non-numeric x', () => {
      const change = { op: 'moveViewObject', viewObjectId: 'vo-1', x: '10' };
      expect(() => operationValidation.validateMoveViewObject(change, 0))
        .toThrow("'x' must be a number");
    });

    it('rejects moveViewObject with non-numeric width', () => {
      const change = { op: 'moveViewObject', viewObjectId: 'vo-1', width: '200' };
      expect(() => operationValidation.validateMoveViewObject(change, 0))
        .toThrow("'width' must be a number");
    });

    it('accepts moveViewObject with numeric geometry fields', () => {
      const change = { op: 'moveViewObject', viewObjectId: 'vo-1', x: 10, y: 20, width: 300, height: 150 };
      expect(() => operationValidation.validateMoveViewObject(change, 0)).not.toThrow();
    });

    it('rejects createNote with non-numeric y', () => {
      const change = { op: 'createNote', viewId: 'view-1', content: 'note', y: '20' };
      expect(() => operationValidation.validateCreateNote(change, 0))
        .toThrow("'y' must be a number");
    });

    it('rejects createNote with non-numeric height', () => {
      const change = { op: 'createNote', viewId: 'view-1', content: 'note', height: '120' };
      expect(() => operationValidation.validateCreateNote(change, 0))
        .toThrow("'height' must be a number");
    });

    it('accepts createNote with numeric geometry fields', () => {
      const change = { op: 'createNote', viewId: 'view-1', content: 'note', x: 10, y: 30, width: 260, height: 120 };
      expect(() => operationValidation.validateCreateNote(change, 0)).not.toThrow();
    });
  });

  describe('idempotency and upsert validation', () => {
    it('accepts request-level idempotencyKey and duplicateStrategy', () => {
      const request = {
        idempotencyKey: 'batch:claims:2026-02-13',
        duplicateStrategy: 'reuse',
        changes: [
          { op: 'createElement', type: 'application-component', name: 'Claims API' }
        ]
      };
      expect(() => operationValidation.validateApplyRequest(request)).not.toThrow();
    });

    it('rejects invalid idempotencyKey format', () => {
      const request = {
        idempotencyKey: 'invalid key with spaces',
        changes: [
          { op: 'createElement', type: 'application-component', name: 'Claims API' }
        ]
      };
      expect(() => operationValidation.validateApplyRequest(request))
        .toThrow('Invalid idempotencyKey');
    });

    it('validates createOrGetElement with explicit create/match', () => {
      const request = {
        changes: [
          {
            op: 'createOrGetElement',
            create: {
              type: 'application-component',
              name: 'Claims API',
              tempId: 'claims-api',
              folder: 'Application/Services',
              properties: { externalId: 'APP-42' }
            },
            match: {
              type: 'application-component',
              name: 'Claims API'
            },
            onDuplicate: 'reuse'
          }
        ]
      };
      expect(() => operationValidation.validateApplyRequest(request)).not.toThrow();
    });

    it('rejects createOrGetRelationship with rename strategy', () => {
      const request = {
        changes: [
          {
            op: 'createOrGetRelationship',
            create: {
              type: 'serving-relationship',
              sourceId: 'app-a',
              targetId: 'app-b'
            },
            match: {
              type: 'serving-relationship',
              sourceId: 'app-a',
              targetId: 'app-b'
            },
            onDuplicate: 'rename'
          }
        ]
      };
      expect(() => operationValidation.validateApplyRequest(request))
        .toThrow(/Duplicate strategy 'rename'/);
    });
  });
});
