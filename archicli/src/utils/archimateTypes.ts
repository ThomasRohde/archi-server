// Canonical ArchiMate concept types accepted by search and validation options.
export const ARCHIMATE_TYPES = [
  'resource', 'capability', 'value-stream', 'course-of-action',
  'business-actor', 'business-role', 'business-collaboration',
  'business-interface', 'business-process', 'business-function',
  'business-interaction', 'business-event', 'business-service',
  'business-object', 'contract', 'representation', 'product',
  'application-component', 'application-collaboration',
  'application-interface', 'application-function',
  'application-interaction', 'application-process',
  'application-event', 'application-service', 'data-object',
  'node', 'device', 'system-software', 'technology-collaboration',
  'technology-interface', 'path', 'communication-network',
  'technology-function', 'technology-process', 'technology-interaction',
  'technology-event', 'technology-service', 'artifact',
  'equipment', 'facility', 'distribution-network', 'material',
  'stakeholder', 'driver', 'assessment', 'goal', 'outcome',
  'principle', 'requirement', 'constraint', 'meaning', 'value',
  'work-package', 'deliverable', 'implementation-event', 'plateau', 'gap',
  'location', 'grouping', 'junction',
  'composition-relationship', 'aggregation-relationship', 'assignment-relationship',
  'realization-relationship', 'serving-relationship', 'access-relationship',
  'influence-relationship', 'triggering-relationship', 'flow-relationship',
  'specialization-relationship', 'association-relationship',
] as const;

// Set form enables O(1) membership checks for --type validation.
export const ARCHIMATE_TYPE_SET = new Set<string>(ARCHIMATE_TYPES);

// Relationship subset is used for client-side filtering (e.g. --no-elements).
export const RELATIONSHIP_TYPE_SET = new Set<string>(
  ARCHIMATE_TYPES.filter((t) => t.endsWith('-relationship'))
);
