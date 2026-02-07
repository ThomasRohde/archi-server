/**
 * Test Helper Utilities
 *
 * Shared utility functions for test setup, cleanup, and common operations.
 */

import * as httpClient from '../infrastructure/httpClient.js';
import { waitForOperation } from './waitFor.js';

/**
 * Generate a unique name with timestamp
 * @param {string} prefix - Name prefix (e.g., 'TestActor')
 * @returns {string} Unique name like 'TestActor_1738934567890'
 */
export function generateUniqueName(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Build a tempId→realId mapping from an operation result array.
 * The /ops/status result field is an array of { tempId, realId, ... } objects.
 * @param {Array} resultArray - The result array from a completed operation
 * @returns {Object} Map of tempId to realId
 */
export function buildIdMap(resultArray) {
  const map = {};
  if (Array.isArray(resultArray)) {
    for (const entry of resultArray) {
      if (entry.tempId && entry.realId) {
        map[entry.tempId] = entry.realId;
      }
    }
  }
  return map;
}

/**
 * Clean up created elements by deleting them
 * @param {Array<string>} elementIds - Array of element IDs to delete
 * @returns {Promise<void>}
 */
export async function cleanupElements(elementIds) {
  if (!elementIds || elementIds.length === 0) {
    return;
  }

  try {
    const changes = elementIds.map(id => ({
      op: 'deleteElement',
      id
    }));

    const response = await httpClient.post('/model/apply', { changes });

    if (response.status === 200 && response.body.operationId) {
      await waitForOperation(response.body.operationId);
    }
  } catch (error) {
    console.warn(`Warning: Failed to cleanup elements: ${error.message}`);
  }
}

/**
 * Clean up created views by deleting them
 * @param {Array<string>} viewIds - Array of view IDs to delete
 * @returns {Promise<void>}
 */
export async function cleanupViews(viewIds) {
  if (!viewIds || viewIds.length === 0) {
    return;
  }

  try {
    for (const viewId of viewIds) {
      await httpClient.del(`/views/${viewId}`);
    }
  } catch (error) {
    console.warn(`Warning: Failed to cleanup views: ${error.message}`);
  }
}

/**
 * Find an element by name using the search endpoint
 * @param {string} name - Element name to search for
 * @returns {Promise<Object|null>} Element object or null if not found
 */
export async function findElementByName(name) {
  try {
    const response = await httpClient.post('/model/search', {
      namePattern: `^${name}$`,
      limit: 1
    });

    if (response.status === 200 && response.body.results && response.body.results.length > 0) {
      return response.body.results[0];
    }

    return null;
  } catch (error) {
    console.warn(`Warning: Failed to find element by name: ${error.message}`);
    return null;
  }
}

/**
 * Find a view by name
 * @param {string} name - View name to search for
 * @returns {Promise<Object|null>} View object or null if not found
 */
export async function findViewByName(name) {
  try {
    const response = await httpClient.get('/views');

    if (response.status === 200 && response.body.views) {
      return response.body.views.find(view => view.name === name) || null;
    }

    return null;
  } catch (error) {
    console.warn(`Warning: Failed to find view by name: ${error.message}`);
    return null;
  }
}

/**
 * Create a test element and return its ID
 * @param {string} type - Element type
 * @param {string} [name] - Element name (auto-generated if not provided)
 * @param {Object} [options] - Additional options
 * @returns {Promise<string>} Created element ID
 */
export async function createTestElement(type, name = null, options = {}) {
  const elementName = name || generateUniqueName(`Test_${type}`);
  const tempId = `temp-${Date.now()}`;

  const changes = [{
    op: 'createElement',
    type,
    name: elementName,
    tempId,
    ...options
  }];

  const response = await httpClient.post('/model/apply', { changes });

  if (response.status !== 200) {
    throw new Error(`Failed to create element: ${JSON.stringify(response.body)}`);
  }

  const result = await waitForOperation(response.body.operationId);

  if (!result.result || !result.result.idMap || !result.result.idMap[tempId]) {
    throw new Error('Failed to get created element ID from operation result');
  }

  return result.result.idMap[tempId];
}

/**
 * Create a test view and return its ID
 * @param {string} [name] - View name (auto-generated if not provided)
 * @param {Object} [options] - Additional options
 * @returns {Promise<string>} Created view ID
 */
export async function createTestView(name = null, options = {}) {
  const viewName = name || generateUniqueName('TestView');

  const response = await httpClient.post('/views', {
    name: viewName,
    ...options
  });

  if (response.status !== 200) {
    throw new Error(`Failed to create view: ${JSON.stringify(response.body)}`);
  }

  if (!response.body.viewId) {
    throw new Error('Failed to get created view ID from response');
  }

  return response.body.viewId;
}

/**
 * Get the current model state (element count, relationship count)
 * @returns {Promise<Object>} Model state summary
 */
export async function getModelState() {
  const response = await httpClient.post('/model/query', {});

  if (response.status !== 200) {
    throw new Error(`Failed to query model: ${JSON.stringify(response.body)}`);
  }

  return response.body.summary;
}

export default {
  generateUniqueName,
  cleanupElements,
  cleanupViews,
  findElementByName,
  findViewByName,
  createTestElement,
  createTestView,
  getModelState
};
