/**
 * HTTP Client Wrapper
 *
 * Centralized HTTP client with retry logic, logging, and error handling
 * for testing the Archi Model API Server.
 */

import { getServerUrl } from './archiServer.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const REQUEST_TIMEOUT = 30000;

/**
 * Make an HTTP request to the Archi server
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} path - Request path (e.g., '/health')
 * @param {Object} [body] - Request body (will be JSON stringified)
 * @param {Object} [options] - Additional options
 * @param {number} [options.timeout=30000] - Request timeout in milliseconds
 * @param {number} [options.retries=3] - Number of retries on failure
 * @param {boolean} [options.skipRetryOn4xx=true] - Don't retry on 4xx errors
 * @returns {Promise<{status: number, body: any, headers: Headers}>} Response object
 */
export async function request(method, path, body = null, options = {}) {
  const {
    timeout = REQUEST_TIMEOUT,
    retries = MAX_RETRIES,
    skipRetryOn4xx = true
  } = options;

  const url = `${getServerUrl()}${path}`;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const fetchOptions = {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(timeout)
      };

      if (body !== null) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      // Parse response body
      let responseBody;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      // Don't retry on client errors (4xx) unless specified
      if (skipRetryOn4xx && response.status >= 400 && response.status < 500) {
        return {
          status: response.status,
          body: responseBody,
          headers: response.headers
        };
      }

      // Return successful responses
      if (response.ok) {
        return {
          status: response.status,
          body: responseBody,
          headers: response.headers
        };
      }

      // Store error for potential retry
      lastError = new Error(
        `HTTP ${response.status}: ${JSON.stringify(responseBody)}`
      );

    } catch (error) {
      lastError = error;

      // Don't retry timeout errors on last attempt
      if (attempt === retries) {
        break;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
    }
  }

  throw new Error(
    `Request failed after ${retries + 1} attempts: ${method} ${path}\n` +
    `Error: ${lastError.message}`
  );
}

/**
 * Make a GET request
 * @param {string} path - Request path
 * @param {Object} [options] - Request options
 * @returns {Promise<{status: number, body: any, headers: Headers}>}
 */
export async function get(path, options = {}) {
  return request('GET', path, null, options);
}

/**
 * Make a POST request
 * @param {string} path - Request path
 * @param {Object} body - Request body
 * @param {Object} [options] - Request options
 * @returns {Promise<{status: number, body: any, headers: Headers}>}
 */
export async function post(path, body, options = {}) {
  return request('POST', path, body, options);
}

/**
 * Make a PUT request
 * @param {string} path - Request path
 * @param {Object} body - Request body
 * @param {Object} [options] - Request options
 * @returns {Promise<{status: number, body: any, headers: Headers}>}
 */
export async function put(path, body, options = {}) {
  return request('PUT', path, body, options);
}

/**
 * Make a DELETE request
 * @param {string} path - Request path
 * @param {Object} [options] - Request options
 * @returns {Promise<{status: number, body: any, headers: Headers}>}
 */
export async function del(path, options = {}) {
  return request('DELETE', path, null, options);
}

export default {
  request,
  get,
  post,
  put,
  del
};
