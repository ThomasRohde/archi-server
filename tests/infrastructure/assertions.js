/**
 * Custom Assertions
 *
 * Domain-specific assertion helpers for testing the Archi Model API Server.
 */

import { expect } from 'vitest';
import { validateResponse } from './schemas.js';
import * as httpClient from './httpClient.js';

/**
 * Assert that an object is a valid ArchiMate element
 * @param {Object} element - Element object to validate
 */
export function expectValidElement(element) {
  expect(element).toBeDefined();
  expect(element).toHaveProperty('id');
  expect(element).toHaveProperty('type');
  expect(element).toHaveProperty('name');
  expect(element.id).toMatch(/^id-[a-f0-9]+$/);
  expect(typeof element.type).toBe('string');
  expect(typeof element.name).toBe('string');
}

/**
 * Assert that an object is a valid ArchiMate view
 * @param {Object} view - View object to validate
 */
export function expectValidView(view) {
  expect(view).toBeDefined();
  expect(view).toHaveProperty('id');
  expect(view).toHaveProperty('name');
  expect(view).toHaveProperty('type');
  expect(view.id).toMatch(/^id-[a-f0-9]+$/);
  expect(typeof view.name).toBe('string');
  expect(view.type).toBe('archimate-diagram-model');
}

/**
 * Poll an operation until it completes and assert success
 * @param {string} operationId - Operation ID to poll
 * @param {number} [timeoutMs=10000] - Maximum time to wait
 * @returns {Promise<Object>} Completed operation result
 */
export async function expectOperationSuccess(operationId, timeoutMs = 10000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await httpClient.get(`/ops/status?opId=${operationId}`);

    expect(response.status).toBe(200);

    const status = response.body;

    if (status.status === 'complete') {
      expect(status).toHaveProperty('result');
      return status;
    }

    if (status.status === 'error') {
      throw new Error(`Operation ${operationId} failed: ${status.error}`);
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  throw new Error(`Operation ${operationId} timed out after ${timeoutMs}ms`);
}

/**
 * Assert that a response complies with an OpenAPI schema
 * @param {Object} response - HTTP response object
 * @param {string} schemaName - Name of the OpenAPI schema
 */
export function expectSchemaCompliance(response, schemaName) {
  expect(response.status).toBeLessThan(400);

  // Validate response body against schema
  validateResponse(response.body, schemaName);
}

/**
 * Assert that a response is an error with expected properties
 * @param {Object} response - HTTP response object
 * @param {number} expectedStatus - Expected HTTP status code
 */
export function expectErrorResponse(response, expectedStatus) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('error');
  expect(response.body.error).toHaveProperty('code');
  expect(response.body.error).toHaveProperty('message');
  expect(typeof response.body.error.message).toBe('string');
}

/**
 * Assert that a response is successful (200-299)
 * @param {Object} response - HTTP response object
 */
export function expectSuccessResponse(response) {
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
}

export default {
  expectValidElement,
  expectValidView,
  expectOperationSuccess,
  expectSchemaCompliance,
  expectErrorResponse,
  expectSuccessResponse
};
