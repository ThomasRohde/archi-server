/**
 * Integration Tests for View Endpoints
 *
 * Tests view management endpoints: GET /views, POST /views, DELETE /views/{id}, etc.
 * Requires the Archi server to be running with a model loaded.
 */

import * as httpClient from '../../infrastructure/httpClient.js';
import { ensureServerRunning } from '../../infrastructure/archiServer.js';
import { expectSuccessResponse, expectErrorResponse, expectValidView } from '../../infrastructure/assertions.js';
import { generateUniqueName, cleanupViews } from '../../utils/testHelpers.js';

describe('View Endpoints', () => {
  const createdViewIds = [];

  beforeAll(async () => {
    await ensureServerRunning();
  });

  afterEach(async () => {
    // Clean up created views
    if (createdViewIds.length > 0) {
      await cleanupViews([...createdViewIds]);
      createdViewIds.length = 0;
    }
  });

  describe('GET /views', () => {
    it('returns 200 status code', async () => {
      const response = await httpClient.get('/views');
      expect(response.status).toBe(200);
    });

    it('returns list of views', async () => {
      const response = await httpClient.get('/views');

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('views');
      expect(Array.isArray(response.body.views)).toBe(true);
    });

    it('returns views with valid structure', async () => {
      const response = await httpClient.get('/views');

      if (response.body.views.length > 0) {
        const view = response.body.views[0];
        expectValidView(view);
      }
    });

    it('returns total count', async () => {
      const response = await httpClient.get('/views');

      expect(response.body).toHaveProperty('total');
      expect(typeof response.body.total).toBe('number');
      expect(response.body.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /views', () => {
    it('creates a new view with unique name', async () => {
      const name = generateUniqueName('TestView');

      const response = await httpClient.post('/views', { name });

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('viewId');
      expect(response.body).toHaveProperty('viewName');
      expect(response.body.success).toBe(true);
      expect(response.body.viewName).toBe(name);

      createdViewIds.push(response.body.viewId);
    });

    it('creates view with documentation', async () => {
      const name = generateUniqueName('TestView');
      const documentation = 'This is test documentation';

      const response = await httpClient.post('/views', { name, documentation });

      expectSuccessResponse(response);
      expect(response.body.success).toBe(true);

      createdViewIds.push(response.body.viewId);
    });

    it('rejects missing name field', async () => {
      const response = await httpClient.post('/views', {});

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('name');
    });

    it('returns creation duration', async () => {
      const name = generateUniqueName('TestView');

      const response = await httpClient.post('/views', { name });

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('durationMs');
      expect(typeof response.body.durationMs).toBe('number');
      expect(response.body.durationMs).toBeGreaterThan(0);

      createdViewIds.push(response.body.viewId);
    });
  });

  describe('GET /views/{id}', () => {
    it('returns view details by ID', async () => {
      // First create a view
      const name = generateUniqueName('TestView');
      const createResponse = await httpClient.post('/views', { name });
      const viewId = createResponse.body.viewId;
      createdViewIds.push(viewId);

      // Get view details
      const response = await httpClient.get(`/views/${viewId}`);

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('type');
      expect(response.body.id).toBe(viewId);
      expect(response.body.name).toBe(name);
    });

    it('returns view elements and connections', async () => {
      const name = generateUniqueName('TestView');
      const createResponse = await httpClient.post('/views', { name });
      const viewId = createResponse.body.viewId;
      createdViewIds.push(viewId);

      const response = await httpClient.get(`/views/${viewId}`);

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('elements');
      expect(response.body).toHaveProperty('connections');
      expect(Array.isArray(response.body.elements)).toBe(true);
      expect(Array.isArray(response.body.connections)).toBe(true);
    });

    it('returns 404 for non-existent view ID', async () => {
      const response = await httpClient.get('/views/nonexistent-view-id');

      expectErrorResponse(response, 404);
    });
  });

  describe('DELETE /views/{id}', () => {
    it('deletes a view by ID', async () => {
      // Create a view
      const name = generateUniqueName('TestView');
      const createResponse = await httpClient.post('/views', { name });
      const viewId = createResponse.body.viewId;

      // Delete it
      const response = await httpClient.del(`/views/${viewId}`);

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);

      // Verify it's deleted
      const getResponse = await httpClient.get(`/views/${viewId}`);
      expect(getResponse.status).toBe(404);
    });

    it('returns 404 when deleting non-existent view', async () => {
      const response = await httpClient.del('/views/nonexistent-view-id');

      expectErrorResponse(response, 404);
    });
  });

  describe('GET /views/{id}/validate', () => {
    it('validates view connection integrity', async () => {
      // Create a view
      const name = generateUniqueName('TestView');
      const createResponse = await httpClient.post('/views', { name });
      const viewId = createResponse.body.viewId;
      createdViewIds.push(viewId);

      // Validate it
      const response = await httpClient.get(`/views/${viewId}/validate`);

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('valid');
      expect(response.body).toHaveProperty('viewId');
      expect(response.body).toHaveProperty('checks');
      expect(Array.isArray(response.body.checks)).toBe(true);
      expect(response.body.viewId).toBe(viewId);
    });

    it('returns validation checks', async () => {
      const name = generateUniqueName('TestView');
      const createResponse = await httpClient.post('/views', { name });
      const viewId = createResponse.body.viewId;
      createdViewIds.push(viewId);

      const response = await httpClient.get(`/views/${viewId}/validate`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks.length).toBeGreaterThan(0);

      const check = response.body.checks[0];
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('passed');
      expect(check).toHaveProperty('violations');
      expect(Array.isArray(check.violations)).toBe(true);
    });
  });

  describe('POST /views/{id}/export', () => {
    it('exports view as PNG', async () => {
      // Create a view
      const name = generateUniqueName('TestView');
      const createResponse = await httpClient.post('/views', { name });
      const viewId = createResponse.body.viewId;
      createdViewIds.push(viewId);

      // Export it
      const response = await httpClient.post(`/views/${viewId}/export`, {
        format: 'PNG',
        scale: 1.0
      });

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('filePath');
      expect(response.body).toHaveProperty('format');
      expect(response.body).toHaveProperty('fileSizeBytes');
      expect(response.body.success).toBe(true);
      expect(response.body.format).toBe('PNG');
      expect(response.body.fileSizeBytes).toBeGreaterThan(0);
    });

    it('exports view as JPEG', async () => {
      const name = generateUniqueName('TestView');
      const createResponse = await httpClient.post('/views', { name });
      const viewId = createResponse.body.viewId;
      createdViewIds.push(viewId);

      const response = await httpClient.post(`/views/${viewId}/export`, {
        format: 'JPEG'
      });

      expectSuccessResponse(response);
      expect(response.body.format).toBe('JPEG');
    });

    it('rejects invalid export format', async () => {
      const name = generateUniqueName('TestView');
      const createResponse = await httpClient.post('/views', { name });
      const viewId = createResponse.body.viewId;
      createdViewIds.push(viewId);

      const response = await httpClient.post(`/views/${viewId}/export`, {
        format: 'INVALID'
      });

      expectErrorResponse(response, 400);
    });
  });
});
