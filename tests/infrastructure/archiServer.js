/**
 * Archi Server Lifecycle Manager
 *
 * Manages detection and health checking of the Archi Model API Server.
 * The server must be manually started by the user in Archi before running tests.
 */

const SERVER_BASE_URL = 'http://localhost:8765';
const DEFAULT_TIMEOUT = 2000;
const MAX_WAIT_TIME = 30000;
const POLL_INTERVAL = 500;

/**
 * Check if the Archi server is running
 * @param {number} [timeout=2000] - Request timeout in milliseconds
 * @returns {Promise<boolean>} True if server is running
 */
export async function isServerRunning(timeout = DEFAULT_TIMEOUT) {
  try {
    const response = await fetch(`${SERVER_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for the server to become available
 * @param {number} [timeoutMs=30000] - Maximum time to wait in milliseconds
 * @returns {Promise<void>} Resolves when server is ready
 * @throws {Error} If server doesn't become available within timeout
 */
export async function waitForServer(timeoutMs = MAX_WAIT_TIME) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await isServerRunning()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error(
    `Archi server did not become available within ${timeoutMs}ms. ` +
    `Please ensure:\n` +
    `  1. Archi is running with jArchi plugin installed\n` +
    `  2. A model is open in Archi\n` +
    `  3. At least one view is open\n` +
    `  4. The "Model API Server" script has been started\n` +
    `  5. Server is accessible at ${SERVER_BASE_URL}`
  );
}

/**
 * Ensure server is running, throw if not
 * @throws {Error} If server is not running
 */
export async function ensureServerRunning() {
  if (!await isServerRunning()) {
    throw new Error(
      `Archi server is not running at ${SERVER_BASE_URL}.\n` +
      `Please start Archi with a model and run the "Model API Server" script.\n` +
      `Then run: npm run test:integration`
    );
  }
}

/**
 * Get server information from /health endpoint
 * @returns {Promise<Object>} Server health info
 */
export async function getServerInfo() {
  await ensureServerRunning();

  const response = await fetch(`${SERVER_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Failed to get server info: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get the server base URL
 * @returns {string} Base URL of the server
 */
export function getServerUrl() {
  return SERVER_BASE_URL;
}

export default {
  isServerRunning,
  waitForServer,
  ensureServerRunning,
  getServerInfo,
  getServerUrl
};
