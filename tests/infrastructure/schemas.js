/**
 * OpenAPI Schema Loader
 *
 * Loads and validates responses against the OpenAPI specification
 * using Ajv JSON Schema validator.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

let schemasLoaded = false;
let openApiSpec = null;

/**
 * Load OpenAPI specification and compile schema validators
 */
export function loadSchemas() {
  if (schemasLoaded) {
    return;
  }

  try {
    // Load openapi.yaml from project root
    const openapiPath = join(__dirname, '..', '..', 'openapi.yaml');
    const openapiContent = readFileSync(openapiPath, 'utf8');
    openApiSpec = yaml.load(openapiContent);

    if (!openApiSpec || !openApiSpec.components || !openApiSpec.components.schemas) {
      throw new Error('Invalid OpenAPI spec: missing components.schemas');
    }

    // Compile validators for each schema
    const schemas = openApiSpec.components.schemas;
    Object.entries(schemas).forEach(([name, schema]) => {
      ajv.addSchema(schema, name);
    });

    schemasLoaded = true;
    console.log(`✓ Loaded ${Object.keys(schemas).length} schemas from OpenAPI spec`);
  } catch (error) {
    console.error('Failed to load OpenAPI schemas:', error.message);
    throw error;
  }
}

/**
 * Get a schema validator by name
 * @param {string} schemaName - Name of the schema (e.g., 'HealthResponse')
 * @returns {Function} Ajv validator function
 */
export function getSchemaValidator(schemaName) {
  if (!schemasLoaded) {
    throw new Error('Schemas not loaded. Call loadSchemas() first.');
  }

  const validate = ajv.getSchema(schemaName);
  if (!validate) {
    throw new Error(`Schema '${schemaName}' not found in OpenAPI spec`);
  }

  return validate;
}

/**
 * Validate data against a schema
 * @param {any} data - Data to validate
 * @param {string} schemaName - Name of the schema
 * @returns {{valid: boolean, errors: Array|null}} Validation result
 */
export function validateAgainstSchema(data, schemaName) {
  const validate = getSchemaValidator(schemaName);
  const valid = validate(data);

  return {
    valid,
    errors: valid ? null : validate.errors
  };
}

/**
 * Validate response data and throw if invalid
 * @param {any} data - Response data to validate
 * @param {string} schemaName - Name of the schema
 * @throws {Error} If validation fails
 */
export function validateResponse(data, schemaName) {
  const result = validateAgainstSchema(data, schemaName);

  if (!result.valid) {
    const errorMessages = result.errors.map(err =>
      `  - ${err.instancePath || '(root)'}: ${err.message}`
    ).join('\n');

    throw new Error(
      `Schema validation failed for '${schemaName}':\n${errorMessages}\n\n` +
      `Data: ${JSON.stringify(data, null, 2)}`
    );
  }
}

/**
 * Get the OpenAPI specification object
 * @returns {Object} OpenAPI spec
 */
export function getOpenAPISpec() {
  if (!schemasLoaded) {
    throw new Error('Schemas not loaded. Call loadSchemas() first.');
  }
  return openApiSpec;
}

export default {
  loadSchemas,
  getSchemaValidator,
  validateAgainstSchema,
  validateResponse,
  getOpenAPISpec
};
