/**
 * Integration Tests for Model Apply Endpoint
 *
 * Tests POST /model/apply endpoint for creating, updating, and deleting elements.
 * Requires the Archi server to be running with a model loaded.
 */

import * as httpClient from '../../infrastructure/httpClient.js';
import { ensureServerRunning } from '../../infrastructure/archiServer.js';
import { expectSuccessResponse, expectOperationSuccess, expectErrorResponse } from '../../infrastructure/assertions.js';
import { createElementPayload, createRelationshipPayload, createApplyRequest } from '../../infrastructure/fixtures.js';
import { generateUniqueName, cleanupElements } from '../../utils/testHelpers.js';
import { waitForOperation } from '../../utils/waitFor.js';

describe('Model Apply Endpoint', () => {
  const createdElementIds = [];

  beforeAll(async () => {
    await ensureServerRunning();
  });

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

      expect(result.status).toBe('complete');
      expect(result.result).toHaveProperty('idMap');
      expect(result.result.idMap[tempId]).toBeDefined();

      createdElementIds.push(result.result.idMap[tempId]);
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

      expect(result.status).toBe('complete');
      expect(result.result.idMap[tempId]).toBeDefined();

      createdElementIds.push(result.result.idMap[tempId]);
    });

    it('creates multiple elements in single request', async () => {
      const actor = createElementPayload('business-actor', generateUniqueName('Actor'), { tempId: 'temp-1' });
      const component = createElementPayload('application-component', generateUniqueName('Component'), { tempId: 'temp-2' });
      const node = createElementPayload('node', generateUniqueName('Node'), { tempId: 'temp-3' });

      const payload = createApplyRequest([actor, component, node]);

      const response = await httpClient.post('/model/apply', payload);
      const result = await waitForOperation(response.body.operationId);

      expect(result.status).toBe('complete');
      expect(result.result.idMap['temp-1']).toBeDefined();
      expect(result.result.idMap['temp-2']).toBeDefined();
      expect(result.result.idMap['temp-3']).toBeDefined();

      createdElementIds.push(
        result.result.idMap['temp-1'],
        result.result.idMap['temp-2'],
        result.result.idMap['temp-3']
      );
    });

    it('accepts camelCase element types', async () => {
      const name = generateUniqueName('TestActor');
      const payload = createApplyRequest([
        createElementPayload('businessActor', name, { tempId: 'temp-1' })
      ]);

      const response = await httpClient.post('/model/apply', payload);
      const result = await waitForOperation(response.body.operationId);

      expect(result.status).toBe('complete');
      createdElementIds.push(result.result.idMap['temp-1']);
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

      const actorId = createResult.result.idMap['temp-actor'];
      const serviceId = createResult.result.idMap['temp-service'];

      createdElementIds.push(actorId, serviceId);

      // Now create relationship
      const relationship = createRelationshipPayload('serving-relationship', actorId, serviceId, {
        tempId: 'temp-rel',
        name: 'serves'
      });

      const relResponse = await httpClient.post('/model/apply', createApplyRequest([relationship]));
      const relResult = await waitForOperation(relResponse.body.operationId);

      expect(relResult.status).toBe('complete');
      expect(relResult.result.idMap['temp-rel']).toBeDefined();
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
      createdElementIds.push(result.result.idMap['temp-1']);
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
});
