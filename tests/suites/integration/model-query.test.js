/**
 * Integration Tests for Model Query Endpoint
 *
 * Tests POST /model/query endpoint.
 * Requires the Archi server to be running with a model loaded.
 */

import * as httpClient from '../../infrastructure/httpClient.js';
import { ensureServerRunning } from '../../infrastructure/archiServer.js';
import { expectSuccessResponse } from '../../infrastructure/assertions.js';

describe('Model Query Endpoint', () => {
  beforeAll(async () => {
    await ensureServerRunning();
  });

  describe('POST /model/query', () => {
    it('returns 200 status code', async () => {
      const response = await httpClient.post('/model/query', {});
      expect(response.status).toBe(200);
    });

    it('returns model summary', async () => {
      const response = await httpClient.post('/model/query', {});

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('elements');
      expect(response.body.summary).toHaveProperty('relationships');
      expect(response.body.summary).toHaveProperty('views');

      expect(typeof response.body.summary.elements).toBe('number');
      expect(typeof response.body.summary.relationships).toBe('number');
      expect(typeof response.body.summary.views).toBe('number');
    });

    it('returns sample elements when no limit specified', async () => {
      const response = await httpClient.post('/model/query', {});

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('sample');
      expect(Array.isArray(response.body.sample)).toBe(true);
    });

    it('respects limit parameter', async () => {
      const limit = 5;
      const response = await httpClient.post('/model/query', { limit });

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('sample');
      expect(Array.isArray(response.body.sample)).toBe(true);

      if (response.body.sample.length > 0) {
        expect(response.body.sample.length).toBeLessThanOrEqual(limit);
      }
    });

    it('returns elements with valid structure', async () => {
      const response = await httpClient.post('/model/query', { limit: 10 });

      expectSuccessResponse(response);

      if (response.body.sample && response.body.sample.length > 0) {
        const element = response.body.sample[0];

        expect(element).toHaveProperty('id');
        expect(element).toHaveProperty('type');
        expect(element).toHaveProperty('name');

        expect(typeof element.id).toBe('string');
        expect(typeof element.type).toBe('string');
        expect(typeof element.name).toBe('string');
      }
    });

    it('handles empty request body', async () => {
      const response = await httpClient.post('/model/query', {});
      expectSuccessResponse(response);
    });

    it('handles query with very large limit', async () => {
      const response = await httpClient.post('/model/query', { limit: 10000 });
      expectSuccessResponse(response);
      expect(Array.isArray(response.body.sample)).toBe(true);
    });
  });
});
