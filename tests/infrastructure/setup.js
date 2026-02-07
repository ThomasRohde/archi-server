/**
 * Global Test Setup
 *
 * Runs once before all tests to initialize the test environment.
 */

import { beforeAll, afterAll } from 'vitest';
import { loadSchemas } from './schemas.js';
import { isServerRunning } from './archiServer.js';

// Track whether server is available
export let serverAvailable = false;

beforeAll(async () => {
  console.log('\n🧪 Initializing test environment...\n');

  // Load OpenAPI schemas
  try {
    loadSchemas();
  } catch (error) {
    console.error('⚠️  Failed to load OpenAPI schemas:', error.message);
    console.error('Schema validation will be skipped.\n');
  }

  // Check if Archi server is running
  serverAvailable = await isServerRunning();

  if (serverAvailable) {
    console.log('✅ Archi server is running at http://localhost:8765');
    console.log('✅ Integration and E2E tests will be executed\n');
  } else {
    console.warn('⚠️  Archi server is not running!');
    console.warn('⚠️  Integration and E2E tests will be skipped.');
    console.warn('');
    console.warn('To run integration tests:');
    console.warn('  1. Open Archi with jArchi plugin installed');
    console.warn('  2. Open an ArchiMate model');
    console.warn('  3. Open at least one view from the model');
    console.warn('  4. Run the "Model API Server" script');
    console.warn('  5. Re-run tests: npm run test:integration\n');
  }
});

afterAll(async () => {
  console.log('\n✅ Test environment cleanup complete\n');
});

/**
 * Helper to skip tests if server is not running
 * @param {Function} testFn - Vitest test function (it, describe, etc.)
 * @returns {Function} Conditionally skipped test function
 */
export function requiresServer(testFn) {
  return serverAvailable ? testFn : testFn.skip;
}
