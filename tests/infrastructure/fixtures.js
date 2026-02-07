/**
 * Test Data Fixtures Generator
 *
 * Provides factory functions for generating valid test data
 * for API requests.
 */

// Valid ArchiMate element types (from serverConfig)
const ELEMENT_TYPES = [
  'business-actor', 'business-role', 'business-collaboration', 'business-interface',
  'business-process', 'business-function', 'business-interaction', 'business-event',
  'business-service', 'business-object', 'contract', 'representation', 'product',
  'application-component', 'application-collaboration', 'application-interface',
  'application-function', 'application-interaction', 'application-process',
  'application-event', 'application-service', 'data-object',
  'node', 'device', 'system-software', 'technology-collaboration',
  'technology-interface', 'path', 'communication-network', 'technology-function',
  'technology-process', 'technology-interaction', 'technology-event',
  'technology-service', 'artifact',
  'equipment', 'facility', 'distribution-network', 'material',
  'stakeholder', 'driver', 'assessment', 'goal', 'outcome', 'principle',
  'requirement', 'constraint', 'meaning', 'value',
  'resource', 'capability', 'value-stream', 'course-of-action',
  'work-package', 'deliverable', 'implementation-event', 'plateau', 'gap',
  'location', 'grouping', 'junction'
];

// Valid relationship types
const RELATIONSHIP_TYPES = [
  'composition-relationship', 'aggregation-relationship', 'assignment-relationship',
  'realization-relationship', 'serving-relationship', 'access-relationship',
  'influence-relationship', 'triggering-relationship', 'flow-relationship',
  'specialization-relationship', 'association-relationship'
];

/**
 * Generate a unique timestamp-based ID
 * @returns {string} Unique ID
 */
function generateUniqueId() {
  return `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Get a random element from an array
 * @param {Array} array - Source array
 * @returns {*} Random element
 */
function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Create a createElement operation payload
 * @param {string} type - Element type (e.g., 'business-actor')
 * @param {string} name - Element name
 * @param {Object} [options] - Additional options
 * @param {string} [options.documentation] - Element documentation
 * @param {string} [options.folder] - Folder ID
 * @param {string} [options.tempId] - Temporary ID for reference
 * @param {Object} [options.properties] - Custom properties
 * @returns {Object} createElement operation
 */
export function createElementPayload(type, name, options = {}) {
  const payload = {
    op: 'createElement',
    type,
    name
  };

  if (options.documentation) {
    payload.documentation = options.documentation;
  }

  if (options.folder) {
    payload.folder = options.folder;
  }

  if (options.tempId) {
    payload.tempId = options.tempId;
  } else {
    payload.tempId = generateUniqueId();
  }

  if (options.properties) {
    payload.properties = options.properties;
  }

  return payload;
}

/**
 * Create a createRelationship operation payload
 * @param {string} type - Relationship type (e.g., 'serving-relationship')
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Object} [options] - Additional options
 * @param {string} [options.name] - Relationship name
 * @param {string} [options.documentation] - Relationship documentation
 * @param {string} [options.tempId] - Temporary ID for reference
 * @returns {Object} createRelationship operation
 */
export function createRelationshipPayload(type, sourceId, targetId, options = {}) {
  const payload = {
    op: 'createRelationship',
    type,
    sourceId,
    targetId
  };

  if (options.name) {
    payload.name = options.name;
  }

  if (options.documentation) {
    payload.documentation = options.documentation;
  }

  if (options.tempId) {
    payload.tempId = options.tempId;
  } else {
    payload.tempId = generateUniqueId();
  }

  return payload;
}

/**
 * Create a view creation payload
 * @param {string} name - View name
 * @param {Object} [options] - Additional options
 * @param {string} [options.documentation] - View documentation
 * @param {string} [options.folder] - Folder ID
 * @returns {Object} View creation payload
 */
export function createViewPayload(name, options = {}) {
  const payload = { name };

  if (options.documentation) {
    payload.documentation = options.documentation;
  }

  if (options.folder) {
    payload.folder = options.folder;
  }

  return payload;
}

/**
 * Create a /model/apply request with changes
 * @param {Array<Object>} changes - Array of operation payloads
 * @returns {Object} Apply request body
 */
export function createApplyRequest(changes) {
  return { changes };
}

/**
 * Get a random valid element type
 * @returns {string} Random element type
 */
export function randomElementType() {
  return randomElement(ELEMENT_TYPES);
}

/**
 * Get a random valid relationship type
 * @returns {string} Random relationship type
 */
export function randomRelationshipType() {
  return randomElement(RELATIONSHIP_TYPES);
}

/**
 * Get all valid element types
 * @returns {Array<string>} All element types
 */
export function getAllElementTypes() {
  return [...ELEMENT_TYPES];
}

/**
 * Get all valid relationship types
 * @returns {Array<string>} All relationship types
 */
export function getAllRelationshipTypes() {
  return [...RELATIONSHIP_TYPES];
}

export default {
  createElementPayload,
  createRelationshipPayload,
  createViewPayload,
  createApplyRequest,
  randomElementType,
  randomRelationshipType,
  getAllElementTypes,
  getAllRelationshipTypes
};
