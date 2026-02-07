/**
 * Global Test Setup
 *
 * Runs once before all tests to initialize the test environment.
 */

import { loadSchemas } from './schemas.js';

console.log('\n🧪 Initializing test environment...\n');

// Load OpenAPI schemas
try {
  loadSchemas();
} catch (error) {
  console.error('⚠️  Failed to load OpenAPI schemas:', error.message);
  console.error('Schema validation will be skipped.\n');
}

console.log('✅ Test environment initialized\n');
