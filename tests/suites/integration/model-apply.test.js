/**
 * Integration Tests for Model Apply Endpoint
 *
 * Tests POST /model/apply endpoint for creating, updating, and deleting elements.
 * Requires the Archi server to be running with a model loaded.
 */

import * as httpClient from '../../infrastructure/httpClient.js';
import { isServerRunning } from '../../infrastructure/archiServer.js';
import { expectSuccessResponse, expectOperationSuccess, expectErrorResponse } from '../../infrastructure/assertions.js';
import { createElementPayload, createRelationshipPayload, createApplyRequest } from '../../infrastructure/fixtures.js';
import { generateUniqueName, cleanupElements, buildIdMap } from '../../utils/testHelpers.js';
import { waitForOperation } from '../../utils/waitFor.js';

const serverAvailable = await isServerRunning();

describe.skipIf(!serverAvailable)('Model Apply Endpoint', () => {
  const createdElementIds = [];

  afterEach(async () => {
    // Clean up created elements
    if (createdElementIds.length > 0) {
      await cleanupElements([...createdElementIds]);
      createdElementIds.length = 0;
    }
  });

  describe('POST /model/apply - createElement', () => {
    it('creates a business actor element', async () => {
      const name = generateUniqueName('TestActor');
      const tempId = 'temp-1';

      const payload = createApplyRequest([
        createElementPayload('business-actor', name, { tempId })
      ]);

      const response = await httpClient.post('/model/apply', payload);

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('operationId');

      const result = await waitForOperation(response.body.operationId);
      const idMap = buildIdMap(result.result);

      expect(result.status).toBe('complete');
      expect(idMap[tempId]).toBeDefined();

      createdElementIds.push(idMap[tempId]);
    });

    it('creates an application component element', async () => {
      const name = generateUniqueName('TestComponent');
      const tempId = 'temp-app-1';

      const payload = createApplyRequest([
        createElementPayload('application-component', name, {
          tempId,
          documentation: 'Test documentation'
        })
      ]);

      const response = await httpClient.post('/model/apply', payload);
      const result = await waitForOperation(response.body.operationId);
      const idMap = buildIdMap(result.result);

      expect(result.status).toBe('complete');
      expect(idMap[tempId]).toBeDefined();

      createdElementIds.push(idMap[tempId]);
    });

    it('creates multiple elements in single request', async () => {
      const actor = createElementPayload('business-actor', generateUniqueName('Actor'), { tempId: 'temp-1' });
      const component = createElementPayload('application-component', generateUniqueName('Component'), { tempId: 'temp-2' });
      const node = createElementPayload('node', generateUniqueName('Node'), { tempId: 'temp-3' });

      const payload = createApplyRequest([actor, component, node]);

      const response = await httpClient.post('/model/apply', payload);
      const result = await waitForOperation(response.body.operationId);
      const idMap = buildIdMap(result.result);

      expect(result.status).toBe('complete');
      expect(idMap['temp-1']).toBeDefined();
      expect(idMap['temp-2']).toBeDefined();
      expect(idMap['temp-3']).toBeDefined();

      createdElementIds.push(
        idMap['temp-1'],
        idMap['temp-2'],
        idMap['temp-3']
      );
    });

    it('accepts camelCase element types', async () => {
      const name = generateUniqueName('TestActor');
      const payload = createApplyRequest([
        createElementPayload('businessActor', name, { tempId: 'temp-1' })
      ]);

      const response = await httpClient.post('/model/apply', payload);
      const result = await waitForOperation(response.body.operationId);
      const idMap = buildIdMap(result.result);

      expect(result.status).toBe('complete');
      createdElementIds.push(idMap['temp-1']);
    });

    it('rejects invalid element type', async () => {
      const payload = createApplyRequest([
        createElementPayload('invalid-type', 'Test', { tempId: 'temp-1' })
      ]);

      const response = await httpClient.post('/model/apply', payload);

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('invalid element type');
    });

    it('rejects missing name field', async () => {
      const payload = {
        changes: [{
          op: 'createElement',
          type: 'business-actor',
          tempId: 'temp-1'
          // Missing name
        }]
      };

      const response = await httpClient.post('/model/apply', payload);

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('missing');
    });

    it('rejects missing type field', async () => {
      const payload = {
        changes: [{
          op: 'createElement',
          name: 'Test Element',
          tempId: 'temp-1'
          // Missing type
        }]
      };

      const response = await httpClient.post('/model/apply', payload);

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('missing');
    });
  });

  describe('POST /model/apply - createRelationship', () => {
    it('creates a serving relationship between elements', async () => {
      // First create two elements
      const actor = createElementPayload('business-actor', generateUniqueName('Actor'), { tempId: 'temp-actor' });
      const service = createElementPayload('business-service', generateUniqueName('Service'), { tempId: 'temp-service' });

      const createResponse = await httpClient.post('/model/apply', createApplyRequest([actor, service]));
      const createResult = await waitForOperation(createResponse.body.operationId);
      const createIdMap = buildIdMap(createResult.result);

      const actorId = createIdMap['temp-actor'];
      const serviceId = createIdMap['temp-service'];

      createdElementIds.push(actorId, serviceId);

      // Now create relationship
      const relationship = createRelationshipPayload('serving-relationship', actorId, serviceId, {
        tempId: 'temp-rel',
        name: 'serves'
      });

      const relResponse = await httpClient.post('/model/apply', createApplyRequest([relationship]));
      const relResult = await waitForOperation(relResponse.body.operationId);
      const relIdMap = buildIdMap(relResult.result);

      expect(relResult.status).toBe('complete');
      expect(relIdMap['temp-rel']).toBeDefined();
    });

    it('rejects invalid relationship type', async () => {
      const payload = createApplyRequest([
        createRelationshipPayload('invalid-relationship', 'id1', 'id2', { tempId: 'temp-1' })
      ]);

      const response = await httpClient.post('/model/apply', payload);

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('invalid relationship type');
    });
  });

  describe('POST /model/apply - validation', () => {
    it('rejects empty changes array', async () => {
      const response = await httpClient.post('/model/apply', { changes: [] });

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('empty');
    });

    it('rejects missing changes field', async () => {
      const response = await httpClient.post('/model/apply', {});

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('changes');
    });

    it('rejects unknown operation type', async () => {
      const payload = {
        changes: [{
          op: 'unknownOperation',
          id: 'test-id'
        }]
      };

      const response = await httpClient.post('/model/apply', payload);

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('unknown operation');
    });
  });

  describe('GET /ops/status', () => {
    it('polls operation status correctly', async () => {
      const name = generateUniqueName('TestActor');
      const payload = createApplyRequest([
        createElementPayload('business-actor', name, { tempId: 'temp-1' })
      ]);

      const response = await httpClient.post('/model/apply', payload);
      const opId = response.body.operationId;

      // Poll status
      const statusResponse = await httpClient.get(`/ops/status?opId=${opId}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('operationId');
      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body.operationId).toBe(opId);

      // Wait for completion
      const result = await waitForOperation(opId);
      const idMap = buildIdMap(result.result);
      createdElementIds.push(idMap['temp-1']);
    });

    it('returns 400 for missing operation ID', async () => {
      const response = await httpClient.get('/ops/status');

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('opId');
    });

    it('returns 404 for non-existent operation ID', async () => {
      const response = await httpClient.get('/ops/status?opId=nonexistent-op-id');

      expectErrorResponse(response, 404);
    });
  });

  describe('GET /ops/list', () => {
    it('lists recent operations', async () => {
      const response = await httpClient.get('/ops/list');

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('operations');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.operations)).toBe(true);
    });

    it('supports filtering by status', async () => {
      const name = generateUniqueName('OpsListActor');
      const createResponse = await httpClient.post('/model/apply', createApplyRequest([
        createElementPayload('business-actor', name, { tempId: 'temp-op-list' })
      ]));
      const opId = createResponse.body.operationId;
      const createResult = await waitForOperation(opId);
      const idMap = buildIdMap(createResult.result);
      createdElementIds.push(idMap['temp-op-list']);

      const response = await httpClient.get('/ops/list?status=complete&limit=50');

      expectSuccessResponse(response);
      expect(Array.isArray(response.body.operations)).toBe(true);
      expect(response.body.operations.some(op => op.operationId === opId)).toBe(true);
    });

    it('rejects invalid status filter', async () => {
      const response = await httpClient.get('/ops/list?status=invalid-status');

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('status');
    });
  });

  describe('Search and element/view linkage', () => {
    it('reports views containing an element after addToView', async () => {
      const elementName = generateUniqueName('ElementWithView');
      const createElementResponse = await httpClient.post('/model/apply', createApplyRequest([
        createElementPayload('application-component', elementName, { tempId: 'temp-el-view' })
      ]));
      const createElementResult = await waitForOperation(createElementResponse.body.operationId);
      const elementIdMap = buildIdMap(createElementResult.result);
      const elementId = elementIdMap['temp-el-view'];
      createdElementIds.push(elementId);

      const createViewResponse = await httpClient.post('/views', {
        name: generateUniqueName('ElementView')
      });
      expectSuccessResponse(createViewResponse);
      const viewId = createViewResponse.body.viewId;

      try {
        const addToViewResponse = await httpClient.post('/model/apply', createApplyRequest([
          {
            op: 'addToView',
            viewId,
            elementId,
            x: 100,
            y: 100
          }
        ]));
        const addToViewResult = await waitForOperation(addToViewResponse.body.operationId);
        expect(addToViewResult.status).toBe('complete');

        const elementResponse = await httpClient.get(`/model/element/${elementId}`);
        expectSuccessResponse(elementResponse);
        expect(Array.isArray(elementResponse.body.views)).toBe(true);
        expect(elementResponse.body.views.some(view => view.id === viewId)).toBe(true);
      } finally {
        await httpClient.del(`/views/${viewId}`);
      }
    });

    it('supports includeRelationships=false and returns matched property details', async () => {
      const sourceName = generateUniqueName('SearchSource');
      const targetName = generateUniqueName('SearchTarget');
      const payload = createApplyRequest([
        createElementPayload('business-actor', sourceName, { tempId: 'temp-search-source' }),
        createElementPayload('application-component', targetName, { tempId: 'temp-search-target' }),
        createRelationshipPayload('serving-relationship', 'temp-search-source', 'temp-search-target', {
          tempId: 'temp-search-rel'
        }),
        {
          op: 'setProperty',
          id: 'temp-search-target',
          key: 'status',
          value: 'active'
        }
      ]);

      const applyResponse = await httpClient.post('/model/apply', payload);
      const applyResult = await waitForOperation(applyResponse.body.operationId);
      const idMap = buildIdMap(applyResult.result);
      createdElementIds.push(idMap['temp-search-source'], idMap['temp-search-target']);

      const noRelationshipResponse = await httpClient.post('/model/search', {
        namePattern: '^Search',
        includeRelationships: false,
        limit: 200
      });
      expectSuccessResponse(noRelationshipResponse);
      expect(Array.isArray(noRelationshipResponse.body.results)).toBe(true);
      expect(
        noRelationshipResponse.body.results.every(result => !String(result.type || '').includes('relationship'))
      ).toBe(true);

      const propertySearchResponse = await httpClient.post('/model/search', {
        propertyKey: 'status',
        propertyValue: 'active',
        namePattern: `^${targetName}$`,
        limit: 10
      });
      expectSuccessResponse(propertySearchResponse);
      expect(Array.isArray(propertySearchResponse.body.results)).toBe(true);
      expect(propertySearchResponse.body.results.length).toBeGreaterThan(0);
      const first = propertySearchResponse.body.results[0];
      expect(first.matchedPropertyKey).toBe('status');
      expect(first.matchedPropertyValue).toBe('active');
    });
  });

  describe('Duplicate Detection', () => {
    describe('Element Duplicates', () => {
      it('rejects duplicate element with same name and type', async () => {
        const name = generateUniqueName('UniqueActor');

        // Create first element
        const payload1 = createApplyRequest([
          createElementPayload('business-actor', name, { tempId: 'temp-1' })
        ]);

        const response1 = await httpClient.post('/model/apply', payload1);
        const result1 = await waitForOperation(response1.body.operationId);
        const idMap1 = buildIdMap(result1.result);
        createdElementIds.push(idMap1['temp-1']);

        // Try to create duplicate
        const payload2 = createApplyRequest([
          createElementPayload('business-actor', name, { tempId: 'temp-2' })
        ]);

        const response2 = await httpClient.post('/model/apply', payload2);

        expectErrorResponse(response2, 400);
        expect(response2.body.error.code).toBe('ValidationError');
        expect(response2.body.error.message).toContain('already exists');
        expect(response2.body.error.message).toContain(name);
        expect(response2.body.error.message).toContain('business-actor');
        expect(response2.body.error.message).toContain(idMap1['temp-1']); // Should include existing ID
      });

      it('allows element with same name but different type', async () => {
        const name = generateUniqueName('SameNameActor');

        // Create business actor
        const payload1 = createApplyRequest([
          createElementPayload('business-actor', name, { tempId: 'temp-1' })
        ]);

        const response1 = await httpClient.post('/model/apply', payload1);
        const result1 = await waitForOperation(response1.body.operationId);
        const idMap1 = buildIdMap(result1.result);
        createdElementIds.push(idMap1['temp-1']);

        // Create business role with same name (different type - should succeed)
        const payload2 = createApplyRequest([
          createElementPayload('business-role', name, { tempId: 'temp-2' })
        ]);

        const response2 = await httpClient.post('/model/apply', payload2);
        expectSuccessResponse(response2);

        const result2 = await waitForOperation(response2.body.operationId);
        const idMap2 = buildIdMap(result2.result);
        expect(result2.status).toBe('complete');
        expect(idMap2['temp-2']).toBeDefined();

        createdElementIds.push(idMap2['temp-2']);
      });

      it('rejects intra-batch duplicate elements', async () => {
        const name = generateUniqueName('BatchDuplicateActor');

        const payload = createApplyRequest([
          createElementPayload('business-actor', name, { tempId: 'temp-1' }),
          createElementPayload('business-actor', name, { tempId: 'temp-2' }) // Duplicate in same batch
        ]);

        const response = await httpClient.post('/model/apply', payload);

        expectErrorResponse(response, 400);
        expect(response.body.error.code).toBe('ValidationError');
        expect(response.body.error.message).toContain('already created earlier in this batch');
        expect(response.body.error.message).toContain(name);
      });
    });

    describe('Relationship Duplicates', () => {
      it('rejects duplicate relationship with same source, target, and type', async () => {
        // Create two elements first
        const sourcePayload = createApplyRequest([
          createElementPayload('business-actor', generateUniqueName('Source'), { tempId: 'temp-source' })
        ]);
        const sourceResponse = await httpClient.post('/model/apply', sourcePayload);
        const sourceResult = await waitForOperation(sourceResponse.body.operationId);
        const sourceIdMap = buildIdMap(sourceResult.result);
        const sourceId = sourceIdMap['temp-source'];
        createdElementIds.push(sourceId);

        const targetPayload = createApplyRequest([
          createElementPayload('business-service', generateUniqueName('Target'), { tempId: 'temp-target' })
        ]);
        const targetResponse = await httpClient.post('/model/apply', targetPayload);
        const targetResult = await waitForOperation(targetResponse.body.operationId);
        const targetIdMap = buildIdMap(targetResult.result);
        const targetId = targetIdMap['temp-target'];
        createdElementIds.push(targetId);

        // Create first relationship
        const payload1 = createApplyRequest([
          createRelationshipPayload('serving-relationship', sourceId, targetId, { tempId: 'temp-rel-1' })
        ]);
        const response1 = await httpClient.post('/model/apply', payload1);
        const result1 = await waitForOperation(response1.body.operationId);
        const relIdMap1 = buildIdMap(result1.result);
        createdElementIds.push(relIdMap1['temp-rel-1']);

        // Try to create duplicate relationship
        const payload2 = createApplyRequest([
          createRelationshipPayload('serving-relationship', sourceId, targetId, { tempId: 'temp-rel-2' })
        ]);

        const response2 = await httpClient.post('/model/apply', payload2);

        expectErrorResponse(response2, 400);
        expect(response2.body.error.code).toBe('ValidationError');
        expect(response2.body.error.message).toContain('already exists');
        expect(response2.body.error.message).toContain('serving-relationship');
        expect(response2.body.error.message).toContain(relIdMap1['temp-rel-1']); // Should include existing ID
      });

      it('allows different relationship type between same elements', async () => {
        // Create two elements
        const elements = createApplyRequest([
          createElementPayload('business-actor', generateUniqueName('Source2'), { tempId: 'temp-source' }),
          createElementPayload('business-service', generateUniqueName('Target2'), { tempId: 'temp-target' })
        ]);
        const elemResponse = await httpClient.post('/model/apply', elements);
        const elemResult = await waitForOperation(elemResponse.body.operationId);
        const elemIdMap = buildIdMap(elemResult.result);
        const sourceId = elemIdMap['temp-source'];
        const targetId = elemIdMap['temp-target'];
        createdElementIds.push(sourceId, targetId);

        // Create first relationship
        const payload1 = createApplyRequest([
          createRelationshipPayload('serving-relationship', sourceId, targetId, { tempId: 'temp-rel-1' })
        ]);
        const response1 = await httpClient.post('/model/apply', payload1);
        const result1 = await waitForOperation(response1.body.operationId);
        const relIdMap1 = buildIdMap(result1.result);
        createdElementIds.push(relIdMap1['temp-rel-1']);

        // Create different relationship type (should succeed)
        const payload2 = createApplyRequest([
          createRelationshipPayload('assignment-relationship', sourceId, targetId, { tempId: 'temp-rel-2' })
        ]);
        const response2 = await httpClient.post('/model/apply', payload2);
        expectSuccessResponse(response2);

        const result2 = await waitForOperation(response2.body.operationId);
        const relIdMap2 = buildIdMap(result2.result);
        expect(result2.status).toBe('complete');
        expect(relIdMap2['temp-rel-2']).toBeDefined();

        createdElementIds.push(relIdMap2['temp-rel-2']);
      });

      it('rejects intra-batch duplicate relationships', async () => {
        // Create two elements
        const elements = createApplyRequest([
          createElementPayload('business-actor', generateUniqueName('Source3'), { tempId: 'temp-source' }),
          createElementPayload('business-service', generateUniqueName('Target3'), { tempId: 'temp-target' })
        ]);
        const elemResponse = await httpClient.post('/model/apply', elements);
        const elemResult = await waitForOperation(elemResponse.body.operationId);
        const elemIdMap = buildIdMap(elemResult.result);
        const sourceId = elemIdMap['temp-source'];
        const targetId = elemIdMap['temp-target'];
        createdElementIds.push(sourceId, targetId);

        // Try to create duplicate relationships in same batch
        const payload = createApplyRequest([
          createRelationshipPayload('serving-relationship', sourceId, targetId, { tempId: 'temp-rel-1' }),
          createRelationshipPayload('serving-relationship', sourceId, targetId, { tempId: 'temp-rel-2' })
        ]);

        const response = await httpClient.post('/model/apply', payload);

        expectErrorResponse(response, 400);
        expect(response.body.error.code).toBe('ValidationError');
        expect(response.body.error.message).toContain('already created earlier in this batch');
      });
    });
  });
});
