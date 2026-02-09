#!/usr/bin/env node
/**
 * Generates all static fixture BOMs for archicli integration tests.
 * Run: node generate-fixtures.mjs
 * Output: JSON files in the same directory
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function write(name, obj) {
  writeFileSync(join(__dirname, name), JSON.stringify(obj, null, 2) + '\n');
  console.log(`  ✓ ${name}`);
}

// ============================================================
// SMOKE FIXTURES
// ============================================================

write('smoke-elements.json', {
  version: '1.0',
  description: 'Smoke test: create 3 basic elements across layers',
  changes: [
    { op: 'createElement', type: 'business-actor', name: 'Smoke Test Actor', tempId: 's-actor' },
    { op: 'createElement', type: 'application-component', name: 'Smoke Test App', tempId: 's-app' },
    { op: 'createElement', type: 'node', name: 'Smoke Test Node', tempId: 's-node' }
  ]
});

write('smoke-relationships.json', {
  version: '1.0',
  description: 'Smoke test: create 2 relationships referencing smoke elements',
  idFiles: ['smoke-elements.ids.json'],
  changes: [
    { op: 'createRelationship', type: 'serving-relationship', sourceId: 's-app', targetId: 's-actor', name: 'Serves', tempId: 's-rel-serving' },
    { op: 'createRelationship', type: 'association-relationship', sourceId: 's-node', targetId: 's-app', name: 'Hosts', tempId: 's-rel-assoc' }
  ]
});

write('smoke-view.json', {
  version: '1.0',
  description: 'Smoke test: create view, add elements, add connections',
  idFiles: ['smoke-elements.ids.json', 'smoke-relationships.ids.json'],
  changes: [
    { op: 'createView', name: 'Smoke Test View', tempId: 's-view' },
    { op: 'addToView', viewId: 's-view', elementId: 's-actor', tempId: 's-vis-actor', x: 50, y: 50 },
    { op: 'addToView', viewId: 's-view', elementId: 's-app', tempId: 's-vis-app', x: 300, y: 50 },
    { op: 'addToView', viewId: 's-view', elementId: 's-node', tempId: 's-vis-node', x: 550, y: 50 },
    { op: 'addConnectionToView', viewId: 's-view', relationshipId: 's-rel-serving', sourceVisualId: 's-vis-app', targetVisualId: 's-vis-actor' },
    { op: 'addConnectionToView', viewId: 's-view', relationshipId: 's-rel-assoc', sourceVisualId: 's-vis-node', targetVisualId: 's-vis-app' }
  ]
});

// ============================================================
// VERIFY / EDGE-CASE FIXTURES
// ============================================================

write('verify-valid.json', {
  version: '1.0',
  description: 'Verify: well-formed BOM with 2 elements',
  changes: [
    { op: 'createElement', type: 'business-actor', name: 'Valid Actor', tempId: 'v-actor' },
    { op: 'createElement', type: 'business-role', name: 'Valid Role', tempId: 'v-role' },
    { op: 'createRelationship', type: 'assignment-relationship', sourceId: 'v-actor', targetId: 'v-role', tempId: 'v-rel' }
  ]
});

write('verify-invalid-schema.json', {
  // Intentionally missing "version" (required) and uses bad op type
  description: 'Invalid BOM: missing version, bad op type',
  changes: [
    { op: 'invalidOperation', type: 'business-actor', name: 'Should Fail' },
    { op: 'createElement', name: 'Missing Type' }
  ]
});

write('verify-duplicate-tempid.json', {
  version: '1.0',
  description: 'Invalid BOM: two elements share the same tempId',
  changes: [
    { op: 'createElement', type: 'business-actor', name: 'First Actor', tempId: 'dup-id' },
    { op: 'createElement', type: 'business-role', name: 'Second Role', tempId: 'dup-id' }
  ]
});

write('empty.json', {
  version: '1.0',
  description: 'Edge case: empty changes array',
  changes: []
});

write('skip-existing-round2.json', {
  version: '1.0',
  description: 'Skip-existing: same elements as smoke-elements for idempotent re-apply test',
  changes: [
    { op: 'createElement', type: 'business-actor', name: 'Smoke Test Actor', tempId: 's-actor' },
    { op: 'createElement', type: 'application-component', name: 'Smoke Test App', tempId: 's-app' },
    { op: 'createElement', type: 'node', name: 'Smoke Test Node', tempId: 's-node' }
  ]
});

// ============================================================
// INCLUDES / BOM COMPOSITION FIXTURES
// ============================================================

write('includes-child.json', {
  version: '1.0',
  description: 'Child BOM: elements included by parent',
  changes: [
    { op: 'createElement', type: 'application-component', name: 'Child App Component', tempId: 'inc-app' },
    { op: 'createElement', type: 'data-object', name: 'Child Data Object', tempId: 'inc-data' }
  ]
});

write('includes-parent.json', {
  version: '1.0',
  description: 'Parent BOM: includes child BOM and adds relationships',
  includes: ['includes-child.json'],
  changes: [
    { op: 'createElement', type: 'business-actor', name: 'Parent Actor', tempId: 'inc-actor' },
    { op: 'createRelationship', type: 'serving-relationship', sourceId: 'inc-app', targetId: 'inc-actor', tempId: 'inc-rel' }
  ]
});

// ============================================================
// FIX1: Silent Batch Rollback — 10 elements + 35 relationships
// ============================================================

write('fix1-elements.json', {
  version: '1.0',
  description: 'Fix1 prerequisite: 10 business-layer elements for relationship stress test',
  changes: Array.from({ length: 10 }, (_, i) => ({
    op: 'createElement',
    type: ['business-process', 'business-service', 'business-actor', 'business-role', 'business-object'][i % 5],
    name: `Fix1 Element ${i + 1}`,
    tempId: `fix1-e${i + 1}`
  }))
});

// 35 relationships between fix1-e1..fix1-e10, all unique (source, target) pairs
{
  const relTypes = [
    'serving-relationship', 'association-relationship', 'triggering-relationship',
    'flow-relationship', 'association-relationship'
  ];
  const pairs = [];
  // Systematic: e(i) → e(i+1..i+k) wrapping, 35 total
  const connections = [
    [1,2],[1,3],[1,4],[1,5],
    [2,3],[2,4],[2,5],[2,6],
    [3,4],[3,5],[3,6],[3,7],
    [4,5],[4,6],[4,7],[4,8],
    [5,6],[5,7],[5,8],[5,9],
    [6,7],[6,8],[6,9],[6,10],
    [7,8],[7,9],[7,10],
    [8,9],[8,10],
    [9,10],
    [10,1],[10,2],[10,3],[10,4],[10,5]
  ];
  const changes = connections.map(([s, t], i) => ({
    op: 'createRelationship',
    type: relTypes[i % relTypes.length],
    sourceId: `fix1-e${s}`,
    targetId: `fix1-e${t}`,
    name: `Fix1 Rel ${i + 1}`,
    tempId: `fix1-r${i + 1}`
  }));

  write('fix1-large-relationships.json', {
    version: '1.0',
    description: 'Fix1 regression (Bug 1): 35 relationships in single batch — tests silent rollback threshold',
    idFiles: ['fix1-elements.ids.json'],
    changes
  });
}

// ============================================================
// FIX4: Duplicate Detection with Properties
// ============================================================

write('fix4-elements.json', {
  version: '1.0',
  description: 'Fix4 prerequisite: 2 elements for duplicate access-relationship test',
  changes: [
    { op: 'createElement', type: 'application-process', name: 'Fix4 Data Processor', tempId: 'fix4-src' },
    { op: 'createElement', type: 'data-object', name: 'Fix4 Customer Data', tempId: 'fix4-tgt' }
  ]
});

write('fix4-duplicate-access.json', {
  version: '1.0',
  description: 'Fix4 regression (Bug 4): two access-relationships with different accessType between same source/target',
  idFiles: ['fix4-elements.ids.json'],
  changes: [
    {
      op: 'createRelationship',
      type: 'access-relationship',
      sourceId: 'fix4-src',
      targetId: 'fix4-tgt',
      name: 'Read Customer Data',
      accessType: 1,
      tempId: 'fix4-rel-read'
    },
    {
      op: 'createRelationship',
      type: 'access-relationship',
      sourceId: 'fix4-src',
      targetId: 'fix4-tgt',
      name: 'Write Customer Data',
      accessType: 3,
      tempId: 'fix4-rel-readwrite'
    }
  ]
});

// ============================================================
// FIX5: Large Element Batch — 40 mixed-type elements
// ============================================================

{
  const elementDefs = [
    // Business layer (12)
    { type: 'business-actor', name: 'Fix5 Customer' },
    { type: 'business-actor', name: 'Fix5 Employee' },
    { type: 'business-role', name: 'Fix5 Buyer' },
    { type: 'business-role', name: 'Fix5 Seller' },
    { type: 'business-process', name: 'Fix5 Order Process' },
    { type: 'business-process', name: 'Fix5 Payment Process' },
    { type: 'business-service', name: 'Fix5 Order Service' },
    { type: 'business-service', name: 'Fix5 Payment Service' },
    { type: 'business-object', name: 'Fix5 Order' },
    { type: 'business-object', name: 'Fix5 Invoice' },
    { type: 'business-event', name: 'Fix5 Order Received' },
    { type: 'business-function', name: 'Fix5 Sales Mgmt' },
    // Application layer (10)
    { type: 'application-component', name: 'Fix5 CRM' },
    { type: 'application-component', name: 'Fix5 ERP' },
    { type: 'application-service', name: 'Fix5 API Gateway' },
    { type: 'application-service', name: 'Fix5 Auth Service' },
    { type: 'application-function', name: 'Fix5 Validation' },
    { type: 'application-function', name: 'Fix5 Transform' },
    { type: 'application-process', name: 'Fix5 ETL' },
    { type: 'application-process', name: 'Fix5 Reporting' },
    { type: 'data-object', name: 'Fix5 User Profile' },
    { type: 'data-object', name: 'Fix5 Transaction' },
    // Technology layer (8)
    { type: 'node', name: 'Fix5 Web Server' },
    { type: 'node', name: 'Fix5 DB Server' },
    { type: 'device', name: 'Fix5 Firewall' },
    { type: 'system-software', name: 'Fix5 Kubernetes' },
    { type: 'artifact', name: 'Fix5 Docker Image' },
    { type: 'technology-service', name: 'Fix5 Compute' },
    { type: 'communication-network', name: 'Fix5 LAN' },
    { type: 'technology-process', name: 'Fix5 Monitoring' },
    // Motivation layer (6)
    { type: 'stakeholder', name: 'Fix5 CTO' },
    { type: 'goal', name: 'Fix5 99% Uptime' },
    { type: 'requirement', name: 'Fix5 Encryption' },
    { type: 'driver', name: 'Fix5 Compliance' },
    { type: 'principle', name: 'Fix5 Security First' },
    { type: 'constraint', name: 'Fix5 Budget Limit' },
    // Strategy & Implementation (4)
    { type: 'capability', name: 'Fix5 Digital Commerce' },
    { type: 'resource', name: 'Fix5 Dev Team' },
    { type: 'work-package', name: 'Fix5 Phase 1' },
    { type: 'deliverable', name: 'Fix5 Platform' }
  ];

  write('fix5-large-elements.json', {
    version: '1.0',
    description: 'Fix5 regression (Bug 5): 40 elements in single batch — tests large element batch persistence',
    changes: elementDefs.map((el, i) => ({
      op: 'createElement',
      ...el,
      tempId: `fix5-e${i + 1}`
    }))
  });
}

// ============================================================
// BULK-01: ~200 Elements
// ============================================================

{
  const elements = [];
  let id = 0;

  function add(type, name) {
    id++;
    elements.push({ op: 'createElement', type, name, tempId: `b-e${id}` });
  }

  // Strategy layer (~15)
  ['IT Budget', 'Engineering Staff', 'Customer Data Asset'].forEach(n => add('resource', n));
  ['Digital Commerce', 'Data Analytics', 'Customer Management', 'Supply Chain Mgmt'].forEach(n => add('capability', n));
  ['Order to Cash', 'Customer Onboarding', 'Customer Support', 'Product Development'].forEach(n => add('value-stream', n));
  ['Cloud Migration', 'Digital Transformation', 'Security Enhancement', 'Agile Adoption'].forEach(n => add('course-of-action', n));

  // Business layer (~60)
  ['Customer', 'Employee', 'Business Partner', 'Supplier', 'Account Manager', 'System Admin'].forEach(n => add('business-actor', n));
  ['Buyer', 'Seller', 'Approver', 'Auditor', 'Support Agent'].forEach(n => add('business-role', n));
  ['Sales Team', 'Operations Team', 'Development Team'].forEach(n => add('business-collaboration', n));
  ['Web Portal', 'Mobile App', 'Phone Line', 'Email Channel'].forEach(n => add('business-interface', n));
  ['Place Order', 'Process Payment', 'Ship Product', 'Handle Return', 'Customer Onboarding', 'Approval Workflow', 'Audit Process', 'Financial Reporting'].forEach(n => add('business-process', n));
  ['Sales Management', 'Financial Management', 'Human Resources', 'Marketing', 'Logistics Mgmt'].forEach(n => add('business-function', n));
  ['Price Negotiation', 'Contract Signing', 'Performance Review'].forEach(n => add('business-interaction', n));
  ['Order Received', 'Payment Confirmed', 'Shipment Dispatched', 'Complaint Filed'].forEach(n => add('business-event', n));
  ['Ordering Service', 'Billing Service', 'Shipping Service', 'Support Service', 'Returns Service', 'Reporting Service', 'Auth Service'].forEach(n => add('business-service', n));
  ['Order', 'Invoice', 'Product Catalog', 'Customer Record', 'Service Contract', 'Financial Report'].forEach(n => add('business-object', n));
  ['Service Level Agreement', 'Non-Disclosure Agreement', 'Terms of Service'].forEach(n => add('contract', n));
  ['Order Receipt', 'Account Statement'].forEach(n => add('representation', n));
  ['Basic Plan', 'Premium Plan', 'Enterprise Plan', 'Add-on Services'].forEach(n => add('product', n));

  // Application layer (~50)
  ['CRM Application', 'ERP System', 'E-Commerce Platform', 'Content Mgmt System', 'Analytics Engine', 'Billing System', 'Inventory Manager', 'Notification Service', 'Auth Service', 'Search Engine'].forEach(n => add('application-component', n));
  ['Payment Processing Cluster', 'Messaging Cluster', 'Cache Cluster'].forEach(n => add('application-collaboration', n));
  ['REST API', 'GraphQL API', 'gRPC Interface', 'Webhook Endpoint', 'SOAP Interface'].forEach(n => add('application-interface', n));
  ['Data Validation', 'Data Transformation', 'Data Encryption', 'User Authentication', 'Cache Management', 'Audit Logging'].forEach(n => add('application-function', n));
  ['Data Synchronization', 'Database Replication', 'Batch Processing'].forEach(n => add('application-interaction', n));
  ['Checkout Process', 'ETL Pipeline', 'Deployment Pipeline', 'Backup Process', 'Search Indexing', 'Report Generation'].forEach(n => add('application-process', n));
  ['User Action Event', 'System Alert Event', 'Scheduled Task Event'].forEach(n => add('application-event', n));
  ['Order API Service', 'Payment API Service', 'User Mgmt Service', 'Product Catalog Service', 'Notification Service', 'Reporting Service', 'Search Service', 'File Storage Service'].forEach(n => add('application-service', n));
  ['User Profile', 'Order Record', 'Transaction Log', 'Product Data', 'Configuration Data', 'Session Data'].forEach(n => add('data-object', n));

  // Technology layer (~40)
  ['Web Server Cluster', 'Application Server', 'Database Server', 'Cache Server'].forEach(n => add('node', n));
  ['Load Balancer', 'Firewall Appliance', 'NAS Storage'].forEach(n => add('device', n));
  ['Linux OS', 'Docker Engine', 'Kubernetes', 'PostgreSQL'].forEach(n => add('system-software', n));
  ['HTTPS Endpoint', 'TCP Socket', 'SSH Interface'].forEach(n => add('technology-interface', n));
  ['Corporate LAN', 'WAN', 'VPN Tunnel'].forEach(n => add('communication-network', n));
  ['Traffic Routing', 'Load Balancing', 'DNS Resolution'].forEach(n => add('technology-function', n));
  ['Server Provisioning', 'Health Monitoring', 'Patch Management'].forEach(n => add('technology-process', n));
  ['Compute Service', 'Storage Service', 'Network Service'].forEach(n => add('technology-service', n));
  ['Application WAR', 'Docker Image', 'Config File', 'Log File'].forEach(n => add('artifact', n));
  ['Server Rack', 'UPS Unit'].forEach(n => add('equipment', n));
  ['Data Center', 'DR Site'].forEach(n => add('facility', n));
  ['Fiber Optic Link', 'Wireless Link'].forEach(n => add('path', n));
  ['Server Cluster', 'Service Mesh'].forEach(n => add('technology-collaboration', n));
  ['Failover Event', 'Auto-Scale Event'].forEach(n => add('technology-event', n));

  // Motivation layer (~20)
  ['Board of Directors', 'CTO', 'Customer Group'].forEach(n => add('stakeholder', n));
  ['Business Growth', 'Regulatory Compliance', 'Operational Efficiency'].forEach(n => add('driver', n));
  ['Security Risk Assessment', 'Performance Assessment'].forEach(n => add('assessment', n));
  ['Increase Revenue 20%', '99.9% Uptime', 'Customer Satisfaction > 90%'].forEach(n => add('goal', n));
  ['Market Leadership', 'Customer Trust'].forEach(n => add('outcome', n));
  ['Security by Design', 'Simplicity First'].forEach(n => add('principle', n));
  ['Response Time < 200ms', 'High Availability', 'Data Encryption at Rest'].forEach(n => add('requirement', n));
  ['Budget Limit 5M', 'GDPR Compliance'].forEach(n => add('constraint', n));

  // Implementation & Migration (~15)
  ['Phase 1 Foundation', 'Phase 2 Migration', 'Phase 3 Optimization', 'Integration Testing'].forEach(n => add('work-package', n));
  ['Architecture Document', 'Cloud Platform', 'Operations Runbook'].forEach(n => add('deliverable', n));
  ['Project Kickoff', 'Go-Live', 'Post-Implementation Review'].forEach(n => add('implementation-event', n));
  ['Current State', 'Interim Architecture', 'Target Architecture'].forEach(n => add('plateau', n));
  ['Legacy System Gap', 'Skills Gap'].forEach(n => add('gap', n));

  console.log(`  bulk-01: ${elements.length} elements`);

  write('bulk-01-elements.json', {
    version: '1.0',
    description: `Bulk stress test phase 1: ${elements.length} elements across all ArchiMate layers`,
    changes: elements
  });

  // ============================================================
  // BULK-02: ~300 Relationships
  // ============================================================

  // Build an index of elements by type category for relationship generation
  const byType = {};
  for (const el of elements) {
    const cat = el.type.split('-')[0]; // business, application, technology, etc.
    if (!byType[cat]) byType[cat] = [];
    byType[cat].push(el.tempId);
  }
  // Also group by exact type
  const byExactType = {};
  for (const el of elements) {
    if (!byExactType[el.type]) byExactType[el.type] = [];
    byExactType[el.type].push(el.tempId);
  }

  const rels = [];
  let rid = 0;
  const usedPairs = new Set();

  function addRel(type, sourceId, targetId, extras = {}) {
    const key = `${sourceId}|${targetId}|${type}`;
    if (usedPairs.has(key) || sourceId === targetId) return false;
    usedPairs.add(key);
    rid++;
    rels.push({ op: 'createRelationship', type, sourceId, targetId, tempId: `b-r${rid}`, ...extras });
    return true;
  }

  function pick(arr, n) {
    // Pick n items from array (or all if fewer)
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  // Use a fixed seed-like approach for reproducibility — just use deterministic indices
  function pickDeterministic(arr, start, count) {
    const result = [];
    for (let i = 0; i < count && i < arr.length; i++) {
      result.push(arr[(start + i) % arr.length]);
    }
    return result;
  }

  // --- Within Strategy (~10 rels) ---
  const resources = byExactType['resource'] || [];
  const capabilities = byExactType['capability'] || [];
  const valueStreams = byExactType['value-stream'] || [];
  const courseOfActions = byExactType['course-of-action'] || [];

  // resource → capability (assignment)
  for (let i = 0; i < resources.length; i++) {
    addRel('assignment-relationship', resources[i], capabilities[i % capabilities.length]);
  }
  // capability → value-stream (realization)
  for (let i = 0; i < capabilities.length; i++) {
    addRel('realization-relationship', capabilities[i], valueStreams[i % valueStreams.length]);
  }
  // course-of-action → capability (realization)
  for (let i = 0; i < courseOfActions.length; i++) {
    addRel('realization-relationship', courseOfActions[i], capabilities[i % capabilities.length]);
  }

  // --- Within Business (~60 rels) ---
  const bActors = byExactType['business-actor'] || [];
  const bRoles = byExactType['business-role'] || [];
  const bProcesses = byExactType['business-process'] || [];
  const bFunctions = byExactType['business-function'] || [];
  const bServices = byExactType['business-service'] || [];
  const bObjects = byExactType['business-object'] || [];
  const bEvents = byExactType['business-event'] || [];
  const bInterfaces = byExactType['business-interface'] || [];
  const bInteractions = byExactType['business-interaction'] || [];
  const bCollabs = byExactType['business-collaboration'] || [];
  const bContracts = byExactType['contract'] || [];
  const bProducts = byExactType['product'] || [];

  // actor → role (assignment)
  for (let i = 0; i < bActors.length; i++) {
    addRel('assignment-relationship', bActors[i], bRoles[i % bRoles.length]);
    if (i + 1 < bRoles.length) addRel('assignment-relationship', bActors[i], bRoles[(i + 1) % bRoles.length]);
  }
  // process → service (realization)
  for (let i = 0; i < bProcesses.length; i++) {
    addRel('realization-relationship', bProcesses[i], bServices[i % bServices.length]);
  }
  // service → actor (serving)
  for (let i = 0; i < bServices.length; i++) {
    addRel('serving-relationship', bServices[i], bActors[i % bActors.length]);
  }
  // process → process (triggering chain)
  for (let i = 0; i < bProcesses.length - 1; i++) {
    addRel('triggering-relationship', bProcesses[i], bProcesses[i + 1]);
  }
  // process → object (access)
  for (let i = 0; i < bProcesses.length; i++) {
    addRel('access-relationship', bProcesses[i], bObjects[i % bObjects.length]);
  }
  // event → process (triggering)
  for (let i = 0; i < bEvents.length; i++) {
    addRel('triggering-relationship', bEvents[i], bProcesses[i % bProcesses.length]);
  }
  // function → service (realization)
  for (let i = 0; i < bFunctions.length; i++) {
    addRel('realization-relationship', bFunctions[i], bServices[i % bServices.length]);
  }
  // role → process (assignment)
  for (let i = 0; i < bRoles.length; i++) {
    addRel('assignment-relationship', bRoles[i], bProcesses[i % bProcesses.length]);
  }
  // interface → service (serving)
  for (let i = 0; i < bInterfaces.length; i++) {
    addRel('serving-relationship', bInterfaces[i], bServices[i % bServices.length]);
  }
  // collaboration → role (aggregation)
  for (let i = 0; i < bCollabs.length; i++) {
    addRel('aggregation-relationship', bCollabs[i], bRoles[i % bRoles.length]);
  }
  // product → service (aggregation)
  for (let i = 0; i < bProducts.length; i++) {
    addRel('aggregation-relationship', bProducts[i], bServices[i % bServices.length]);
  }
  // product → contract (aggregation)
  for (let i = 0; i < Math.min(bProducts.length, bContracts.length); i++) {
    addRel('aggregation-relationship', bProducts[i], bContracts[i]);
  }
  // interaction → object (access)
  for (let i = 0; i < bInteractions.length; i++) {
    addRel('access-relationship', bInteractions[i], bObjects[i % bObjects.length]);
  }

  // --- Within Application (~50 rels) ---
  const aComps = byExactType['application-component'] || [];
  const aServices = byExactType['application-service'] || [];
  const aFunctions = byExactType['application-function'] || [];
  const aProcesses = byExactType['application-process'] || [];
  const aInterfaces = byExactType['application-interface'] || [];
  const aEvents = byExactType['application-event'] || [];
  const aInteractions = byExactType['application-interaction'] || [];
  const aCollabs = byExactType['application-collaboration'] || [];
  const dataObjects = byExactType['data-object'] || [];

  // component → service (realization)
  for (let i = 0; i < aComps.length; i++) {
    addRel('realization-relationship', aComps[i], aServices[i % aServices.length]);
  }
  // function → service (realization)
  for (let i = 0; i < aFunctions.length; i++) {
    addRel('realization-relationship', aFunctions[i], aServices[i % aServices.length]);
  }
  // process → process (triggering chain)
  for (let i = 0; i < aProcesses.length - 1; i++) {
    addRel('triggering-relationship', aProcesses[i], aProcesses[i + 1]);
  }
  // process → data-object (access)
  for (let i = 0; i < aProcesses.length; i++) {
    addRel('access-relationship', aProcesses[i], dataObjects[i % dataObjects.length]);
  }
  // component → component (serving)
  for (let i = 0; i < aComps.length - 1; i++) {
    addRel('serving-relationship', aComps[i], aComps[i + 1]);
  }
  // interface → component (serving)
  for (let i = 0; i < aInterfaces.length; i++) {
    addRel('serving-relationship', aInterfaces[i], aComps[i % aComps.length]);
  }
  // event → process (triggering)
  for (let i = 0; i < aEvents.length; i++) {
    addRel('triggering-relationship', aEvents[i], aProcesses[i % aProcesses.length]);
  }
  // component → function (assignment)
  for (let i = 0; i < aComps.length; i++) {
    addRel('assignment-relationship', aComps[i], aFunctions[i % aFunctions.length]);
  }
  // interaction → data-object (access)
  for (let i = 0; i < aInteractions.length; i++) {
    addRel('access-relationship', aInteractions[i], dataObjects[i % dataObjects.length]);
  }
  // collaboration → component (aggregation)
  for (let i = 0; i < aCollabs.length; i++) {
    addRel('aggregation-relationship', aCollabs[i], aComps[i % aComps.length]);
  }
  // component → data-object (access)
  for (let i = 0; i < aComps.length; i++) {
    addRel('access-relationship', aComps[i], dataObjects[i % dataObjects.length]);
  }

  // --- Within Technology (~30 rels) ---
  const tNodes = byExactType['node'] || [];
  const tDevices = byExactType['device'] || [];
  const tSoftware = byExactType['system-software'] || [];
  const tInterfaces = byExactType['technology-interface'] || [];
  const tNetworks = byExactType['communication-network'] || [];
  const tFunctions = byExactType['technology-function'] || [];
  const tProcesses = byExactType['technology-process'] || [];
  const tServices = byExactType['technology-service'] || [];
  const tArtifacts = byExactType['artifact'] || [];
  const tEquipment = byExactType['equipment'] || [];
  const tFacilities = byExactType['facility'] || [];
  const tPaths = byExactType['path'] || [];
  const tCollabs = byExactType['technology-collaboration'] || [];
  const tEvents = byExactType['technology-event'] || [];

  // node → system-software (assignment)
  for (let i = 0; i < tNodes.length; i++) {
    addRel('assignment-relationship', tNodes[i], tSoftware[i % tSoftware.length]);
  }
  // node → device (composition)
  for (let i = 0; i < tNodes.length && i < tDevices.length; i++) {
    addRel('composition-relationship', tNodes[i], tDevices[i]);
  }
  // software → artifact (realization)
  for (let i = 0; i < tSoftware.length; i++) {
    addRel('realization-relationship', tSoftware[i], tArtifacts[i % tArtifacts.length]);
  }
  // function → service (realization)
  for (let i = 0; i < tFunctions.length; i++) {
    addRel('realization-relationship', tFunctions[i], tServices[i % tServices.length]);
  }
  // process → process (triggering)
  for (let i = 0; i < tProcesses.length - 1; i++) {
    addRel('triggering-relationship', tProcesses[i], tProcesses[i + 1]);
  }
  // interface → service (serving)
  for (let i = 0; i < tInterfaces.length; i++) {
    addRel('serving-relationship', tInterfaces[i], tServices[i % tServices.length]);
  }
  // node → network (association)
  for (let i = 0; i < tNodes.length; i++) {
    addRel('association-relationship', tNodes[i], tNetworks[i % tNetworks.length]);
  }
  // facility → equipment (composition)
  for (let i = 0; i < tFacilities.length; i++) {
    addRel('composition-relationship', tFacilities[i], tEquipment[i % tEquipment.length]);
  }
  // facility → node (composition)
  for (let i = 0; i < tFacilities.length; i++) {
    addRel('composition-relationship', tFacilities[i], tNodes[i % tNodes.length]);
  }
  // event → process (triggering)
  for (let i = 0; i < tEvents.length; i++) {
    addRel('triggering-relationship', tEvents[i], tProcesses[i % tProcesses.length]);
  }
  // collaboration → node (aggregation)
  for (let i = 0; i < tCollabs.length; i++) {
    addRel('aggregation-relationship', tCollabs[i], tNodes[i % tNodes.length]);
  }
  // path → network (association)
  for (let i = 0; i < tPaths.length; i++) {
    addRel('association-relationship', tPaths[i], tNetworks[i % tNetworks.length]);
  }

  // --- Within Motivation (~15 rels) ---
  const mStakeholders = byExactType['stakeholder'] || [];
  const mDrivers = byExactType['driver'] || [];
  const mAssessments = byExactType['assessment'] || [];
  const mGoals = byExactType['goal'] || [];
  const mOutcomes = byExactType['outcome'] || [];
  const mPrinciples = byExactType['principle'] || [];
  const mRequirements = byExactType['requirement'] || [];
  const mConstraints = byExactType['constraint'] || [];

  // stakeholder → driver (association)
  for (let i = 0; i < mStakeholders.length; i++) {
    addRel('association-relationship', mStakeholders[i], mDrivers[i % mDrivers.length]);
  }
  // driver → assessment (association)
  for (let i = 0; i < mDrivers.length; i++) {
    addRel('association-relationship', mDrivers[i], mAssessments[i % mAssessments.length]);
  }
  // assessment → goal (influence)
  for (let i = 0; i < mAssessments.length; i++) {
    addRel('influence-relationship', mAssessments[i], mGoals[i % mGoals.length]);
  }
  // goal → outcome (realization)
  for (let i = 0; i < mGoals.length; i++) {
    addRel('realization-relationship', mGoals[i], mOutcomes[i % mOutcomes.length]);
  }
  // principle → requirement (realization)
  for (let i = 0; i < mPrinciples.length; i++) {
    addRel('realization-relationship', mPrinciples[i], mRequirements[i % mRequirements.length]);
  }
  // goal → principle (realization)
  for (let i = 0; i < mGoals.length; i++) {
    addRel('realization-relationship', mGoals[i], mPrinciples[i % mPrinciples.length]);
  }
  // requirement → constraint (specialization)
  for (let i = 0; i < mRequirements.length && i < mConstraints.length; i++) {
    addRel('association-relationship', mRequirements[i], mConstraints[i]);
  }

  // --- Within Implementation (~10 rels) ---
  const iWorkPkgs = byExactType['work-package'] || [];
  const iDeliverables = byExactType['deliverable'] || [];
  const iEvents = byExactType['implementation-event'] || [];
  const iPlateaus = byExactType['plateau'] || [];
  const iGaps = byExactType['gap'] || [];

  // work-package → deliverable (realization)
  for (let i = 0; i < iWorkPkgs.length; i++) {
    addRel('realization-relationship', iWorkPkgs[i], iDeliverables[i % iDeliverables.length]);
  }
  // event → work-package (triggering)
  for (let i = 0; i < iEvents.length; i++) {
    addRel('triggering-relationship', iEvents[i], iWorkPkgs[i % iWorkPkgs.length]);
  }
  // plateau → gap (association)
  for (let i = 0; i < iPlateaus.length && i < iGaps.length; i++) {
    addRel('association-relationship', iPlateaus[i], iGaps[i]);
  }
  // work-package chain (triggering)
  for (let i = 0; i < iWorkPkgs.length - 1; i++) {
    addRel('triggering-relationship', iWorkPkgs[i], iWorkPkgs[i + 1]);
  }

  // --- Cross-layer: Strategy → Business (~15 rels) ---
  // capability → business-function (realization)
  for (let i = 0; i < capabilities.length; i++) {
    addRel('realization-relationship', capabilities[i], bFunctions[i % bFunctions.length]);
  }
  // value-stream → business-process (realization)
  for (let i = 0; i < valueStreams.length; i++) {
    addRel('realization-relationship', valueStreams[i], bProcesses[i % bProcesses.length]);
  }
  // course-of-action → business-process (realization)
  for (let i = 0; i < courseOfActions.length; i++) {
    addRel('association-relationship', courseOfActions[i], bProcesses[i % bProcesses.length]);
  }
  // resource → business-actor (assignment)
  for (let i = 0; i < resources.length; i++) {
    addRel('association-relationship', resources[i], bActors[i % bActors.length]);
  }

  // --- Cross-layer: Business → Application (~40 rels) ---
  // business-service → application-service (realization)
  for (let i = 0; i < bServices.length; i++) {
    addRel('realization-relationship', aComps[i % aComps.length], bServices[i]);
  }
  // business-process → application-process (realization)
  for (let i = 0; i < bProcesses.length; i++) {
    addRel('serving-relationship', aServices[i % aServices.length], bProcesses[i]);
  }
  // business-object → data-object (realization)
  for (let i = 0; i < bObjects.length; i++) {
    addRel('realization-relationship', dataObjects[i % dataObjects.length], bObjects[i]);
  }
  // application-service → business-actor (serving)
  for (let i = 0; i < aServices.length; i++) {
    addRel('serving-relationship', aServices[i], bActors[i % bActors.length]);
  }
  // application-service → business-role (serving)
  for (let i = 0; i < aServices.length; i++) {
    addRel('serving-relationship', aServices[i], bRoles[i % bRoles.length]);
  }
  // application-interface → business-interface (serving)
  for (let i = 0; i < aInterfaces.length; i++) {
    addRel('serving-relationship', aInterfaces[i], bInterfaces[i % bInterfaces.length]);
  }

  // --- Cross-layer: Application → Technology (~30 rels) ---
  // application-component → node (assignment/realization)
  for (let i = 0; i < aComps.length; i++) {
    addRel('realization-relationship', tSoftware[i % tSoftware.length], aComps[i]);
  }
  // application-service → technology-service (serving)
  for (let i = 0; i < Math.min(aServices.length, tServices.length); i++) {
    addRel('serving-relationship', tServices[i], aServices[i]);
  }
  // artifact → application-component (realization)
  for (let i = 0; i < tArtifacts.length; i++) {
    addRel('realization-relationship', tArtifacts[i], aComps[i % aComps.length]);
  }
  // node → application-component (serving)
  for (let i = 0; i < tNodes.length; i++) {
    addRel('serving-relationship', tNodes[i], aComps[i % aComps.length]);
  }
  // technology-process → application-process (serving)
  for (let i = 0; i < tProcesses.length; i++) {
    addRel('serving-relationship', tProcesses[i], aProcesses[i % aProcesses.length]);
  }
  // network → application-collaboration (serving)
  for (let i = 0; i < tNetworks.length; i++) {
    addRel('serving-relationship', tNetworks[i], aCollabs[i % aCollabs.length]);
  }

  // --- Cross-layer: Motivation → Other (~20 rels) ---
  // goal → business-service (realization)
  for (let i = 0; i < mGoals.length; i++) {
    addRel('realization-relationship', bServices[i % bServices.length], mGoals[i]);
  }
  // requirement → application-component (realization)
  for (let i = 0; i < mRequirements.length; i++) {
    addRel('realization-relationship', aComps[i % aComps.length], mRequirements[i]);
  }
  // constraint → technology-service (realization)
  for (let i = 0; i < mConstraints.length; i++) {
    addRel('realization-relationship', tServices[i % tServices.length], mConstraints[i]);
  }
  // stakeholder → goal (association)
  for (let i = 0; i < mStakeholders.length; i++) {
    addRel('association-relationship', mStakeholders[i], mGoals[i % mGoals.length]);
  }
  // driver → business-process (influence)
  for (let i = 0; i < mDrivers.length; i++) {
    addRel('influence-relationship', mDrivers[i], bProcesses[i % bProcesses.length]);
  }
  // principle → application-service (realization)
  for (let i = 0; i < mPrinciples.length; i++) {
    addRel('realization-relationship', aServices[i % aServices.length], mPrinciples[i]);
  }
  // outcome → stakeholder (association)
  for (let i = 0; i < mOutcomes.length; i++) {
    addRel('association-relationship', mOutcomes[i], mStakeholders[i % mStakeholders.length]);
  }

  // --- Cross-layer: Implementation → Other (~20 rels) ---
  // work-package → application-component (realization)
  for (let i = 0; i < iWorkPkgs.length; i++) {
    addRel('realization-relationship', iWorkPkgs[i], aComps[i % aComps.length]);
  }
  // deliverable → artifact (realization)
  for (let i = 0; i < iDeliverables.length; i++) {
    addRel('realization-relationship', iDeliverables[i], tArtifacts[i % tArtifacts.length]);
  }
  // plateau → business-process (aggregation)
  for (let i = 0; i < iPlateaus.length; i++) {
    addRel('aggregation-relationship', iPlateaus[i], bProcesses[i % bProcesses.length]);
  }
  // plateau → application-component (aggregation)
  for (let i = 0; i < iPlateaus.length; i++) {
    addRel('aggregation-relationship', iPlateaus[i], aComps[i % aComps.length]);
  }
  // plateau → node (aggregation)
  for (let i = 0; i < iPlateaus.length; i++) {
    addRel('aggregation-relationship', iPlateaus[i], tNodes[i % tNodes.length]);
  }
  // gap → plateau (association)
  for (let i = 0; i < iGaps.length && i < iPlateaus.length; i++) {
    addRel('association-relationship', iGaps[i], iPlateaus[(i + 1) % iPlateaus.length]);
  }
  // implementation-event → deliverable (triggering)
  for (let i = 0; i < iEvents.length; i++) {
    addRel('triggering-relationship', iEvents[i], iDeliverables[i % iDeliverables.length]);
  }

  // --- Pad to ~300 with additional cross-layer associations ---
  const allIds = elements.map(e => e.tempId);
  let padIdx = 0;
  while (rels.length < 300) {
    const si = (padIdx * 7 + 3) % allIds.length;
    const ti = (padIdx * 11 + 13) % allIds.length;
    if (si !== ti) {
      addRel('association-relationship', allIds[si], allIds[ti]);
    }
    padIdx++;
    if (padIdx > 1000) break; // safety valve
  }

  console.log(`  bulk-02: ${rels.length} relationships`);

  write('bulk-02-relationships.json', {
    version: '1.0',
    description: `Bulk stress test phase 2: ${rels.length} relationships across all layers`,
    idFiles: ['bulk-01-elements.ids.json'],
    changes: rels
  });

  // ============================================================
  // BULK-03: 6 Views with visual objects and connections
  // ============================================================

  const viewDefs = [
    {
      name: 'Business Layer Overview', tempId: 'v-business',
      elements: [
        ...bActors.slice(0, 4), ...bRoles.slice(0, 3), ...bProcesses.slice(0, 5),
        ...bServices.slice(0, 4), ...bObjects.slice(0, 3), ...bEvents.slice(0, 2)
      ]
    },
    {
      name: 'Application Architecture', tempId: 'v-application',
      elements: [
        ...aComps.slice(0, 6), ...aServices.slice(0, 5), ...aFunctions.slice(0, 3),
        ...aProcesses.slice(0, 3), ...dataObjects.slice(0, 3)
      ]
    },
    {
      name: 'Technology Infrastructure', tempId: 'v-technology',
      elements: [
        ...tNodes, ...tDevices, ...tSoftware.slice(0, 3), ...tNetworks,
        ...tServices, ...tArtifacts.slice(0, 2), ...tFacilities
      ]
    },
    {
      name: 'Motivation & Goals', tempId: 'v-motivation',
      elements: [
        ...mStakeholders, ...mDrivers, ...mGoals, ...mOutcomes,
        ...mPrinciples, ...mRequirements.slice(0, 2), ...mConstraints
      ]
    },
    {
      name: 'Strategy & Roadmap', tempId: 'v-strategy',
      elements: [
        ...resources, ...capabilities, ...valueStreams, ...courseOfActions,
        ...iWorkPkgs, ...iDeliverables, ...iPlateaus, ...iGaps
      ]
    },
    {
      name: 'Full Architecture Overview', tempId: 'v-overview',
      elements: [
        ...bActors.slice(0, 2), ...bServices.slice(0, 3),
        ...aComps.slice(0, 4), ...aServices.slice(0, 3),
        ...tNodes.slice(0, 2), ...tServices.slice(0, 2),
        ...mGoals.slice(0, 2), ...capabilities.slice(0, 2)
      ]
    }
  ];

  const viewChanges = [];
  const visIdMap = {}; // elementTempId → view → visualTempId
  let visIdx = 0;

  for (const vDef of viewDefs) {
    viewChanges.push({ op: 'createView', name: vDef.name, tempId: vDef.tempId });

    // Place elements in a grid layout
    const cols = 5;
    const cellW = 200;
    const cellH = 100;
    const marginX = 30;
    const marginY = 30;

    for (let i = 0; i < vDef.elements.length; i++) {
      visIdx++;
      const visTempId = `b-vis${visIdx}`;
      const col = i % cols;
      const row = Math.floor(i / cols);

      viewChanges.push({
        op: 'addToView',
        viewId: vDef.tempId,
        elementId: vDef.elements[i],
        tempId: visTempId,
        x: marginX + col * cellW,
        y: marginY + row * cellH
      });

      // Track for connections
      if (!visIdMap[vDef.elements[i]]) visIdMap[vDef.elements[i]] = {};
      visIdMap[vDef.elements[i]][vDef.tempId] = visTempId;
    }
  }

  // Add connections: for each relationship where both source AND target are in the same view
  let connCount = 0;
  for (const rel of rels) {
    for (const vDef of viewDefs) {
      const srcVis = visIdMap[rel.sourceId]?.[vDef.tempId];
      const tgtVis = visIdMap[rel.targetId]?.[vDef.tempId];
      if (srcVis && tgtVis) {
        viewChanges.push({
          op: 'addConnectionToView',
          viewId: vDef.tempId,
          relationshipId: rel.tempId,
          sourceVisualId: srcVis,
          targetVisualId: tgtVis
        });
        connCount++;
        break; // Only add to first matching view
      }
    }
  }

  console.log(`  bulk-03: ${viewDefs.length} views, ${visIdx} visual objects, ${connCount} connections`);

  write('bulk-03-views.json', {
    version: '1.0',
    description: `Bulk stress test phase 3: ${viewDefs.length} views with ${visIdx} visual objects and ${connCount} connections`,
    idFiles: ['bulk-01-elements.ids.json', 'bulk-02-relationships.ids.json'],
    changes: viewChanges
  });

  // ============================================================
  // BULK-04: Styling, Notes, and Groups
  // ============================================================

  const styleChanges = [];

  // Style some visual objects in each view (first 3 elements per view)
  const colors = ['#FFD700', '#87CEEB', '#90EE90', '#FFB6C1', '#DDA0DD', '#F0E68C'];
  let styleVis = 0;
  for (const vDef of viewDefs) {
    for (let i = 0; i < Math.min(3, vDef.elements.length); i++) {
      const visTempId = visIdMap[vDef.elements[i]]?.[vDef.tempId];
      if (visTempId) {
        styleChanges.push({
          op: 'styleViewObject',
          viewObjectId: visTempId,
          fillColor: colors[styleVis % colors.length],
          opacity: 100,
          lineWidth: 2
        });
        styleVis++;
      }
    }
  }

  // Create a note in each view
  let noteIdx = 0;
  for (const vDef of viewDefs) {
    noteIdx++;
    styleChanges.push({
      op: 'createNote',
      viewId: vDef.tempId,
      content: `${vDef.name} — Generated by bulk stress test`,
      tempId: `b-note${noteIdx}`,
      x: 10,
      y: 600,
      width: 300,
      height: 60
    });
  }

  // Create a group in 3 views
  for (let i = 0; i < 3; i++) {
    styleChanges.push({
      op: 'createGroup',
      viewId: viewDefs[i].tempId,
      name: `${viewDefs[i].name} — Key Components`,
      tempId: `b-group${i + 1}`,
      x: 20,
      y: 20,
      width: 950,
      height: 380
    });
  }

  console.log(`  bulk-04: ${styleChanges.length} styling/annotation operations`);

  write('bulk-04-styling.json', {
    version: '1.0',
    description: `Bulk stress test phase 4: styling, notes, and groups across 6 views`,
    idFiles: ['bulk-01-elements.ids.json', 'bulk-02-relationships.ids.json', 'bulk-03-views.ids.json'],
    changes: styleChanges
  });
}

console.log('\nAll fixtures generated successfully.');
