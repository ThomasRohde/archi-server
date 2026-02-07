# ArchiMate Model API Server - Test Suite

Comprehensive Node.js test suite for the ArchiMate Model API Server using Vitest, native Fetch API, and Ajv schema validation.

## Overview

This test suite provides:
- **Unit Tests** - Pure JavaScript validation logic (serverConfig, operationValidation)
- **Integration Tests** - HTTP API endpoint testing (health, model-query, model-apply, views, etc.)
- **E2E Tests** - Complete workflow testing (create → layout → export)
- **OpenAPI Schema Validation** - All responses validated against openapi.yaml
- **Modern Tooling** - Vitest with watch mode, UI mode, and coverage reporting

## Prerequisites

### 1. Install Node.js

Ensure you have Node.js 18 or higher installed:

```bash
node --version  # Should be >= 18.0.0
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Archi Server (Required for Integration/E2E Tests)

**IMPORTANT:** Integration and E2E tests require the Archi server to be running.

1. Open **Archi** (5.7+) with **jArchi plugin** (1.11+) installed
2. Open an **ArchiMate model**
3. Open **at least one view** from the model (required for undo/redo support)
4. Run the **"Model API Server"** script from Archi's Scripts menu
5. Verify the monitor dialog shows "Server running on http://127.0.0.1:8765"

**Test server availability:**

```bash
curl http://localhost:8765/health
```

You should see a JSON response with `"status": "ok"`.

## Running Tests

### Run All Tests

```bash
npm test
```

This runs unit, integration, and E2E tests sequentially.

### Run Tests by Type

```bash
# Unit tests only (no server required)
npm run test:unit

# Integration tests only (requires running server)
npm run test:integration

# E2E tests only (requires running server)
npm run test:e2e
```

### Watch Mode

Automatically re-run tests on file changes:

```bash
npm run test:watch
```

Press `a` to run all tests, `f` to run only failed tests, `q` to quit.

### UI Mode

Visual test runner in the browser:

```bash
npm run test:ui
```

This opens a browser UI at `http://localhost:51204/__vitest__/` with:
- Interactive test results
- Filter and search tests
- Time travel debugging
- Snapshot management

### Coverage Report

Generate code coverage report:

```bash
npm run test:coverage
```

Coverage reports are generated in:
- **Terminal:** Text summary
- **HTML:** `coverage/index.html` (open in browser)
- **JSON:** `coverage/coverage-final.json`

## Test Structure

```
tests/
├── infrastructure/          # Test framework setup
│   ├── archiServer.js      # Server lifecycle management
│   ├── httpClient.js       # HTTP client with retries
│   ├── schemas.js          # OpenAPI schema validation
│   ├── fixtures.js         # Test data generators
│   ├── assertions.js       # Custom assertions
│   └── setup.js            # Global setup/teardown
│
├── suites/
│   ├── unit/               # Pure JS logic tests (no server)
│   │   ├── serverConfig.test.js
│   │   └── operationValidation.test.js
│   │
│   ├── integration/        # HTTP API endpoint tests
│   │   ├── health.test.js
│   │   ├── model-query.test.js
│   │   ├── model-apply.test.js
│   │   └── views.test.js
│   │
│   └── e2e/                # End-to-end workflows
│       └── create-view-workflow.test.js
│
├── fixtures/               # Sample test data
│   └── operations/
│       ├── create-element.json
│       ├── create-relationship.json
│       └── create-view.json
│
├── utils/                  # Test utilities
│   ├── waitFor.js         # Polling helpers
│   └── testHelpers.js     # Cleanup, unique names
│
├── vitest.config.js       # Vitest configuration
└── README.md              # This file
```

## Writing New Tests

### Unit Test Example

```javascript
// tests/suites/unit/myModule.test.js
import { describe, it, expect } from 'vitest';
import myModule from '../../../scripts/lib/server/myModule.js';

describe('myModule', () => {
  it('validates input correctly', () => {
    expect(myModule.validate('valid-input')).toBe(true);
    expect(myModule.validate('invalid')).toBe(false);
  });
});
```

### Integration Test Example

```javascript
// tests/suites/integration/my-endpoint.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import * as httpClient from '../../infrastructure/httpClient.js';
import { ensureServerRunning } from '../../infrastructure/archiServer.js';

describe('My Endpoint', () => {
  beforeAll(async () => {
    await ensureServerRunning();
  });

  it('returns expected response', async () => {
    const response = await httpClient.get('/my-endpoint');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });
});
```

### E2E Test Example

```javascript
// tests/suites/e2e/my-workflow.test.js
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as httpClient from '../../infrastructure/httpClient.js';
import { createTestElement, cleanupElements } from '../../utils/testHelpers.js';

describe('My Workflow', () => {
  const createdIds = [];

  beforeAll(async () => {
    await ensureServerRunning();
  });

  afterEach(async () => {
    await cleanupElements(createdIds);
    createdIds.length = 0;
  });

  it('completes workflow successfully', async () => {
    // Step 1: Create element
    const elementId = await createTestElement('business-actor', 'Test');
    createdIds.push(elementId);

    // Step 2: Use element
    const response = await httpClient.get(`/model/element/${elementId}`);
    expect(response.status).toBe(200);
  });
});
```

## Best Practices

### Test Isolation

- Each test should be independent
- Use unique names: `generateUniqueName('TestElement')`
- Clean up created resources in `afterEach` hooks
- Avoid hardcoded element/view IDs

### Async Operations

Always poll operation status after `/model/apply`:

```javascript
import { waitForOperation } from '../../utils/waitFor.js';

const response = await httpClient.post('/model/apply', payload);
const result = await waitForOperation(response.body.operationId);

expect(result.status).toBe('complete');
```

### Schema Validation

Validate responses against OpenAPI spec:

```javascript
import { validateResponse } from '../../infrastructure/schemas.js';

const response = await httpClient.get('/health');
validateResponse(response.body, 'HealthResponse');
```

### Error Testing

Test both happy paths and error cases:

```javascript
it('rejects invalid input', async () => {
  const response = await httpClient.post('/model/apply', { invalid: 'payload' });

  expect(response.status).toBe(400);
  expect(response.body.error).toHaveProperty('message');
});
```

## Troubleshooting

### "Archi server is not running"

**Problem:** Integration tests fail with server not running error.

**Solution:**
1. Start Archi with a model open
2. Open at least one view from the model
3. Run "Model API Server" script
4. Verify with: `curl http://localhost:8765/health`
5. Re-run tests: `npm run test:integration`

### "Operation timed out"

**Problem:** Tests fail with operation timeout errors.

**Solution:**
- Increase timeout in `vitest.config.js`: `testTimeout: 60000`
- Check Archi console for errors (Window → Console)
- Ensure model isn't too large or complex
- Restart Archi and server

### "Test conflicts - element already exists"

**Problem:** Tests fail due to duplicate element names.

**Solution:**
- Ensure tests use `generateUniqueName()` for element names
- Add `afterEach` cleanup hooks
- Run tests sequentially (already configured in vitest.config.js)

### "Schema validation failed"

**Problem:** Response doesn't match OpenAPI spec.

**Solution:**
- Check if openapi.yaml is up-to-date
- Review error message for specific field mismatch
- Update test expectations or fix server response

### "Module not found" errors

**Problem:** Cannot find infrastructure or utility modules.

**Solution:**
```bash
# Ensure all dependencies are installed
npm install

# Check import paths are correct (use relative paths)
import * as httpClient from '../../infrastructure/httpClient.js';
```

## CI/CD Integration

### GitHub Actions (Unit Tests Only)

Unit tests run automatically on push/PR:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
```

**Note:** Integration and E2E tests require a running Archi server and cannot run in standard CI environments.

### Manual Integration Testing

For comprehensive testing including integration/E2E tests:

1. Set up a dedicated Windows/Mac machine with Archi installed
2. Load a test model with sample data
3. Start the Model API Server
4. Run full test suite: `npm test`
5. Review results and coverage report

## Test Coverage Goals

- **Unit Tests:** 100% coverage of pure JS logic (serverConfig, operationValidation)
- **Integration Tests:** 90%+ coverage of endpoint handlers
- **E2E Tests:** Cover critical workflows (create view, export, layout)
- **Overall:** 80%+ line coverage

## Contributing

When adding new features:

1. Write unit tests for validation/configuration logic
2. Write integration tests for new endpoints
3. Update E2E tests if workflow changes
4. Ensure all tests pass: `npm test`
5. Check coverage: `npm run test:coverage`
6. Update this README if adding new test patterns

## Useful Commands

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test file
npx vitest run tests/suites/unit/serverConfig.test.js

# Run tests matching pattern
npx vitest run --grep "health"

# Run tests in watch mode
npm run test:watch

# Open UI mode
npm run test:ui

# Generate coverage
npm run test:coverage

# Run only unit tests (no server)
npm run test:unit

# Run only integration tests (requires server)
npm run test:integration

# Run only E2E tests (requires server)
npm run test:e2e
```

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [OpenAPI Specification](../openapi.yaml)
- [Project README](../README.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
