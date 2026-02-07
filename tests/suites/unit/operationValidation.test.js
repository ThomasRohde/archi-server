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
});
