/**
 * E2E Test: Create View Workflow
 *
 * Tests the complete workflow of creating elements, relationships, and views,
 * then adding elements to views, applying layout, and exporting.
 *
 * Requires the Archi server to be running with a model loaded.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as httpClient from '../../infrastructure/httpClient.js';
import { ensureServerRunning } from '../../infrastructure/archiServer.js';
import { expectSuccessResponse } from '../../infrastructure/assertions.js';
import { createElementPayload, createRelationshipPayload, createApplyRequest } from '../../infrastructure/fixtures.js';
import { generateUniqueName, cleanupElements, cleanupViews } from '../../utils/testHelpers.js';
import { waitForOperation } from '../../utils/waitFor.js';

describe('E2E: Create View Workflow', () => {
  const createdElementIds = [];
  const createdViewIds = [];

  beforeAll(async () => {
    await ensureServerRunning();
  });

  afterEach(async () => {
    // Clean up in reverse order (views first, then elements)
    if (createdViewIds.length > 0) {
      await cleanupViews([...createdViewIds]);
      createdViewIds.length = 0;
    }

    if (createdElementIds.length > 0) {
      await cleanupElements([...createdElementIds]);
      createdElementIds.length = 0;
    }
  });

  it('completes full view creation workflow with layout and export', async () => {
    // Step 1: Create elements
    console.log('\n📝 Step 1: Creating elements...');

    const actor = createElementPayload('business-actor', generateUniqueName('Customer'), {
      tempId: 'temp-actor',
      documentation: 'The customer interacting with the system'
    });

    const service1 = createElementPayload('business-service', generateUniqueName('OrderService'), {
      tempId: 'temp-service1',
      documentation: 'Service for managing orders'
    });

    const service2 = createElementPayload('business-service', generateUniqueName('PaymentService'), {
      tempId: 'temp-service2',
      documentation: 'Service for processing payments'
    });

    const component = createElementPayload('application-component', generateUniqueName('OrderManagement'), {
      tempId: 'temp-component',
      documentation: 'Order management application'
    });

    const createElementsResponse = await httpClient.post('/model/apply', createApplyRequest([
      actor, service1, service2, component
    ]));

    expectSuccessResponse(createElementsResponse);

    const createElementsResult = await waitForOperation(createElementsResponse.body.operationId);
    expect(createElementsResult.status).toBe('complete');

    const actorId = createElementsResult.result.idMap['temp-actor'];
    const service1Id = createElementsResult.result.idMap['temp-service1'];
    const service2Id = createElementsResult.result.idMap['temp-service2'];
    const componentId = createElementsResult.result.idMap['temp-component'];

    createdElementIds.push(actorId, service1Id, service2Id, componentId);

    console.log(`✅ Created ${createdElementIds.length} elements`);

    // Step 2: Create relationships
    console.log('\n🔗 Step 2: Creating relationships...');

    const rel1 = createRelationshipPayload('serving-relationship', service1Id, actorId, {
      tempId: 'temp-rel1',
      name: 'serves'
    });

    const rel2 = createRelationshipPayload('serving-relationship', service2Id, actorId, {
      tempId: 'temp-rel2',
      name: 'serves'
    });

    const rel3 = createRelationshipPayload('realization-relationship', componentId, service1Id, {
      tempId: 'temp-rel3',
      name: 'realizes'
    });

    const createRelsResponse = await httpClient.post('/model/apply', createApplyRequest([
      rel1, rel2, rel3
    ]));

    const createRelsResult = await waitForOperation(createRelsResponse.body.operationId);
    expect(createRelsResult.status).toBe('complete');

    console.log('✅ Created 3 relationships');

    // Step 3: Create view
    console.log('\n🖼️  Step 3: Creating view...');

    const viewName = generateUniqueName('E2E_TestView');
    const createViewResponse = await httpClient.post('/views', {
      name: viewName,
      documentation: 'E2E test view with multiple elements and relationships'
    });

    expectSuccessResponse(createViewResponse);
    const viewId = createViewResponse.body.viewId;
    createdViewIds.push(viewId);

    console.log(`✅ Created view: ${viewName} (${viewId})`);

    // Step 4: Add elements to view
    console.log('\n➕ Step 4: Adding elements to view...');

    const addToView = [
      {
        op: 'addToView',
        viewId,
        elementId: actorId,
        x: 100,
        y: 50,
        width: 120,
        height: 55
      },
      {
        op: 'addToView',
        viewId,
        elementId: service1Id,
        x: 100,
        y: 150,
        width: 120,
        height: 55
      },
      {
        op: 'addToView',
        viewId,
        elementId: service2Id,
        x: 250,
        y: 150,
        width: 120,
        height: 55
      },
      {
        op: 'addToView',
        viewId,
        elementId: componentId,
        x: 100,
        y: 250,
        width: 120,
        height: 55
      }
    ];

    const addElementsResponse = await httpClient.post('/model/apply', createApplyRequest(addToView));
    const addElementsResult = await waitForOperation(addElementsResponse.body.operationId);
    expect(addElementsResult.status).toBe('complete');

    console.log('✅ Added 4 elements to view');

    // Step 5: Get view details to verify elements
    console.log('\n🔍 Step 5: Verifying view contents...');

    const viewDetailsResponse = await httpClient.get(`/views/${viewId}`);
    expectSuccessResponse(viewDetailsResponse);

    expect(viewDetailsResponse.body.elements).toHaveLength(4);
    expect(viewDetailsResponse.body.connections).toHaveLength(3);

    console.log(`✅ View contains ${viewDetailsResponse.body.elements.length} elements and ${viewDetailsResponse.body.connections.length} connections`);

    // Step 6: Apply layout
    console.log('\n📐 Step 6: Applying automatic layout...');

    const layoutResponse = await httpClient.post(`/views/${viewId}/layout`, {
      algorithm: 'dagre',
      rankdir: 'TB',
      nodesep: 50,
      ranksep: 50
    });

    expectSuccessResponse(layoutResponse);
    expect(layoutResponse.body).toHaveProperty('nodesPositioned');
    expect(layoutResponse.body.nodesPositioned).toBeGreaterThan(0);

    console.log(`✅ Layout applied to ${layoutResponse.body.nodesPositioned} nodes`);

    // Step 7: Validate view integrity
    console.log('\n✅ Step 7: Validating view integrity...');

    const validateResponse = await httpClient.get(`/views/${viewId}/validate`);
    expectSuccessResponse(validateResponse);

    expect(validateResponse.body).toHaveProperty('valid');
    expect(validateResponse.body).toHaveProperty('checks');

    const failedChecks = validateResponse.body.checks.filter(check => !check.passed);
    if (failedChecks.length > 0) {
      console.log(`⚠️  View has ${failedChecks.length} failed validation checks`);
      failedChecks.forEach(check => {
        console.log(`   - ${check.name}: ${check.violations.length} violations`);
      });
    } else {
      console.log('✅ All validation checks passed');
    }

    // Step 8: Export view as PNG
    console.log('\n💾 Step 8: Exporting view as PNG...');

    const exportResponse = await httpClient.post(`/views/${viewId}/export`, {
      format: 'PNG',
      scale: 1.0,
      margin: 10
    });

    expectSuccessResponse(exportResponse);
    expect(exportResponse.body).toHaveProperty('filePath');
    expect(exportResponse.body).toHaveProperty('fileSizeBytes');
    expect(exportResponse.body.format).toBe('PNG');
    expect(exportResponse.body.fileSizeBytes).toBeGreaterThan(0);

    console.log(`✅ Exported to ${exportResponse.body.filePath} (${exportResponse.body.fileSizeBytes} bytes)`);

    // Step 9: Final verification
    console.log('\n🎉 Step 9: Workflow complete!');
    console.log('\nWorkflow Summary:');
    console.log(`  - Created: ${createdElementIds.length} elements`);
    console.log(`  - Created: 3 relationships`);
    console.log(`  - Created: 1 view`);
    console.log(`  - Added: 4 elements to view`);
    console.log(`  - Applied: Dagre layout`);
    console.log(`  - Validated: View integrity`);
    console.log(`  - Exported: PNG image\n`);
  });

  it('creates a view with styled elements', async () => {
    console.log('\n🎨 Testing view with styled elements...');

    // Create elements
    const element = createElementPayload('business-actor', generateUniqueName('StyledActor'), {
      tempId: 'temp-1'
    });

    const createResponse = await httpClient.post('/model/apply', createApplyRequest([element]));
    const createResult = await waitForOperation(createResponse.body.operationId);
    const elementId = createResult.result.idMap['temp-1'];
    createdElementIds.push(elementId);

    // Create view
    const viewName = generateUniqueName('StyledView');
    const viewResponse = await httpClient.post('/views', { name: viewName });
    const viewId = viewResponse.body.viewId;
    createdViewIds.push(viewId);

    // Add element to view
    const addToViewOp = {
      op: 'addToView',
      viewId,
      elementId,
      x: 100,
      y: 100,
      width: 120,
      height: 55
    };

    const addResponse = await httpClient.post('/model/apply', createApplyRequest([addToViewOp]));
    const addResult = await waitForOperation(addResponse.body.operationId);
    expect(addResult.status).toBe('complete');

    // Get view to find visual object ID
    const viewDetailsResponse = await httpClient.get(`/views/${viewId}`);
    const viewObjectId = viewDetailsResponse.body.elements[0].id;

    // Style the element
    const styleOp = {
      op: 'styleViewObject',
      viewObjectId,
      fillColor: '#FF5733',
      lineColor: '#000000',
      lineWidth: 2
    };

    const styleResponse = await httpClient.post('/model/apply', createApplyRequest([styleOp]));
    const styleResult = await waitForOperation(styleResponse.body.operationId);
    expect(styleResult.status).toBe('complete');

    console.log('✅ Successfully styled view object');

    // Export styled view
    const exportResponse = await httpClient.post(`/views/${viewId}/export`, {
      format: 'PNG'
    });

    expectSuccessResponse(exportResponse);
    console.log(`✅ Exported styled view to ${exportResponse.body.filePath}`);
  });
});
