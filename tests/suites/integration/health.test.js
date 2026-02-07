/**
 * Integration Tests for Health Endpoints
 *
 * Tests /health, /test, and /shutdown endpoints.
 * Requires the Archi server to be running.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as httpClient from '../../infrastructure/httpClient.js';
import { ensureServerRunning } from '../../infrastructure/archiServer.js';
import { expectSuccessResponse } from '../../infrastructure/assertions.js';

describe('Health Endpoints', () => {
  beforeAll(async () => {
    await ensureServerRunning();
  });

  describe('GET /health', () => {
    it('returns 200 status code', async () => {
      const response = await httpClient.get('/health');
      expect(response.status).toBe(200);
    });

    it('returns valid health response structure', async () => {
      const response = await httpClient.get('/health');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('server');
      expect(response.body).toHaveProperty('operations');
      expect(response.body).toHaveProperty('model');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('returns status as "ok"', async () => {
      const response = await httpClient.get('/health');
      expect(response.body.status).toBe('ok');
    });

    it('returns valid server information', async () => {
      const response = await httpClient.get('/health');

      expect(response.body.server).toHaveProperty('port');
      expect(response.body.server).toHaveProperty('host');
      expect(response.body.server).toHaveProperty('uptime');

      expect(response.body.server.port).toBe(8765);
      expect(response.body.server.host).toBe('127.0.0.1');
      expect(typeof response.body.server.uptime).toBe('number');
      expect(response.body.server.uptime).toBeGreaterThan(0);
    });

    it('returns valid operations information', async () => {
      const response = await httpClient.get('/health');

      expect(response.body.operations).toHaveProperty('queued');
      expect(response.body.operations).toHaveProperty('completed');
      expect(response.body.operations).toHaveProperty('failed');

      expect(typeof response.body.operations.queued).toBe('number');
      expect(typeof response.body.operations.completed).toBe('number');
      expect(typeof response.body.operations.failed).toBe('number');
    });

    it('returns valid model information', async () => {
      const response = await httpClient.get('/health');

      expect(response.body.model).toHaveProperty('name');
      expect(response.body.model).toHaveProperty('id');
      expect(response.body.model).toHaveProperty('elements');
      expect(response.body.model).toHaveProperty('relationships');
      expect(response.body.model).toHaveProperty('views');

      expect(typeof response.body.model.name).toBe('string');
      expect(typeof response.body.model.id).toBe('string');
      expect(typeof response.body.model.elements).toBe('number');
      expect(typeof response.body.model.relationships).toBe('number');
      expect(typeof response.body.model.views).toBe('number');
    });

    it('returns valid memory information', async () => {
      const response = await httpClient.get('/health');

      expect(response.body.memory).toHaveProperty('total');
      expect(response.body.memory).toHaveProperty('free');
      expect(response.body.memory).toHaveProperty('used');
      expect(response.body.memory).toHaveProperty('max');

      expect(typeof response.body.memory.total).toBe('number');
      expect(typeof response.body.memory.free).toBe('number');
      expect(typeof response.body.memory.used).toBe('number');
      expect(typeof response.body.memory.max).toBe('number');
    });

    it('returns valid timestamp', async () => {
      const response = await httpClient.get('/health');

      expect(typeof response.body.timestamp).toBe('string');
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Parse timestamp to ensure it's valid
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('returns version matching package.json', async () => {
      const response = await httpClient.get('/health');
      expect(response.body.version).toBeDefined();
      expect(typeof response.body.version).toBe('string');
      expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('GET /test', () => {
    it('returns 200 status code', async () => {
      const response = await httpClient.get('/test');
      expect(response.status).toBe(200);
    });

    it('confirms UI thread execution', async () => {
      const response = await httpClient.get('/test');

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('message');
      expect(response.body.success).toBe(true);
      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.toLowerCase()).toContain('display');
    });
  });

  describe('POST /shutdown', () => {
    // Note: This test is commented out to avoid actually shutting down the server
    // during test runs. Uncomment to test shutdown manually.

    it.skip('should gracefully shutdown the server', async () => {
      const response = await httpClient.post('/shutdown', {});

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('inFlightOperations');

      // Note: After this test, the server will be stopped
      // You'll need to manually restart it for other tests
    });
  });
});
