/**
 * Polling Utilities
 *
 * Helper functions for waiting on async operations and conditions.
 */

import * as httpClient from '../infrastructure/httpClient.js';

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for an operation to complete
 * @param {string} operationId - Operation ID to poll
 * @param {number} [timeoutMs=10000] - Maximum time to wait in milliseconds
 * @param {number} [pollInterval=200] - Polling interval in milliseconds
 * @returns {Promise<Object>} Completed operation result
 * @throws {Error} If operation fails or times out
 */
export async function waitForOperation(operationId, timeoutMs = 10000, pollInterval = 200) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await httpClient.get(`/ops/status?opId=${operationId}`);

    if (response.status !== 200) {
      throw new Error(
        `Failed to get operation status: ${response.status} ${JSON.stringify(response.body)}`
      );
    }

    const status = response.body;

    if (status.status === 'complete') {
      return status;
    }

    if (status.status === 'error') {
      throw new Error(`Operation ${operationId} failed: ${status.error}`);
    }

    // Still queued or processing, wait and retry
    await sleep(pollInterval);
  }

  throw new Error(
    `Operation ${operationId} timed out after ${timeoutMs}ms. ` +
    `Last status was still pending.`
  );
}

/**
 * Wait for a condition to become true
 * @param {Function} conditionFn - Function that returns a boolean or Promise<boolean>
 * @param {number} [timeoutMs=5000] - Maximum time to wait in milliseconds
 * @param {number} [pollInterval=100] - Polling interval in milliseconds
 * @param {string} [errorMessage='Condition timed out'] - Error message if timeout occurs
 * @returns {Promise<void>}
 * @throws {Error} If condition doesn't become true within timeout
 */
export async function waitForCondition(
  conditionFn,
  timeoutMs = 5000,
  pollInterval = 100,
  errorMessage = 'Condition timed out'
) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await conditionFn();

    if (result) {
      return;
    }

    await sleep(pollInterval);
  }

  throw new Error(`${errorMessage} (waited ${timeoutMs}ms)`);
}

/**
 * Retry a function until it succeeds or times out
 * @param {Function} fn - Function to retry
 * @param {number} [maxAttempts=3] - Maximum number of attempts
 * @param {number} [delayMs=1000] - Delay between attempts in milliseconds
 * @returns {Promise<any>} Result of successful function call
 * @throws {Error} If all attempts fail
 */
export async function retry(fn, maxAttempts = 3, delayMs = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `Function failed after ${maxAttempts} attempts. Last error: ${lastError.message}`
  );
}

export default {
  sleep,
  waitForOperation,
  waitForCondition,
  retry
};
