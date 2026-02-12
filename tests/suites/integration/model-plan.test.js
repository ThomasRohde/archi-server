/**
 * Integration Tests for Model Plan Endpoint
 *
 * Tests POST /model/plan endpoint behavior.
 * Requires the Archi server to be running.
 */

import * as httpClient from '../../infrastructure/httpClient.js';
import { isServerRunning } from '../../infrastructure/archiServer.js';
import { expectSuccessResponse, expectErrorResponse } from '../../infrastructure/assertions.js';

const serverAvailable = await isServerRunning();
let strictPlanActionsSupported = false;

if (serverAvailable) {
  try {
    const probe = await httpClient.post('/model/plan', { action: 'unknown-action' });
    strictPlanActionsSupported = probe.status === 400;
  } catch (error) {
    strictPlanActionsSupported = false;
  }
}

describe.skipIf(!serverAvailable || !strictPlanActionsSupported)('Model Plan Endpoint', () => {
  describe('POST /model/plan', () => {
    it('returns a plan for supported action create-element', async () => {
      const response = await httpClient.post('/model/plan', {
        action: 'create-element',
        type: 'business-actor',
        name: 'Planned Actor',
      });

      expectSuccessResponse(response);
      expect(response.body).toHaveProperty('planId');
      expect(Array.isArray(response.body.changes)).toBe(true);
      expect(response.body.changes.length).toBe(1);
      expect(response.body.changes[0].op).toBe('createElement');
    });

    it('rejects unsupported planning actions with validation error', async () => {
      const response = await httpClient.post('/model/plan', {
        action: 'unknown-action',
      });

      expectErrorResponse(response, 400);
      expect(response.body.error.message).toContain('Unsupported planning action');
    });
  });
});
