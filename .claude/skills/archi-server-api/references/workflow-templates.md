# Workflow Templates

Reusable multi-step CURL workflows for common ArchiMate modeling scenarios. Each template shows the complete sequence of commands an agent should execute.

## Template 1: Create and Visualize Elements

**Use when**: Building a set of elements with relationships and placing them on a new view.

### Step 1: Search for Existing Elements (avoid duplicates)

```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"namePattern": "SEARCH_PATTERN", "limit": 50}'
```

Parse the results. If matching elements already exist, reuse their IDs instead of creating new ones.

### Step 2: Create Elements

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createElement", "type": "TYPE", "name": "NAME", "tempId": "e1", "documentation": "DESC"},
      {"op": "createElement", "type": "TYPE", "name": "NAME", "tempId": "e2"}
    ]
  }'
```

### Step 3: Poll and Collect IDs

```bash
curl -s "http://localhost:8765/ops/status?opId=OP_ID"
```

Build a map: `tempId → realId` from the result array.

### Step 4: Create Relationships

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "REAL_ID_1", "targetId": "REAL_ID_2", "tempId": "r1"}
    ]
  }'
```

### Step 5: Poll for Relationship IDs

```bash
curl -s "http://localhost:8765/ops/status?opId=OP_ID_2"
```

### Step 6: Create View

```bash
curl -s -X POST http://localhost:8765/views \
  -H "Content-Type: application/json" \
  -d '{"name": "VIEW_NAME", "documentation": "VIEW_DESC"}'
```

Extract `viewId` from response.

### Step 7: Add Elements to View

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "addToView", "viewId": "VIEW_ID", "elementId": "REAL_ID_1", "x": 200, "y": 50, "width": 120, "height": 55, "tempId": "v1"},
      {"op": "addToView", "viewId": "VIEW_ID", "elementId": "REAL_ID_2", "x": 200, "y": 200, "width": 120, "height": 55, "tempId": "v2"}
    ]
  }'
```

### Step 8: Poll for Visual Object IDs

```bash
curl -s "http://localhost:8765/ops/status?opId=OP_ID_3"
```

Build a map: `tempId → visualObjectId`.

### Step 9: Add Connections to View

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "addConnectionToView", "viewId": "VIEW_ID", "relationshipId": "REL_REAL_ID", "sourceVisualId": "VISUAL_ID_1", "targetVisualId": "VISUAL_ID_2"}
    ]
  }'
```

### Step 10: Layout + Export + Save

```bash
# Auto-layout
curl -s -X POST http://localhost:8765/views/VIEW_ID/layout \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "dagre", "options": {"rankdir": "TB", "nodesep": 60, "ranksep": 80}}'

# Export as PNG
curl -s -X POST http://localhost:8765/views/VIEW_ID/export \
  -H "Content-Type: application/json" \
  -d '{"format": "PNG", "scale": 2}'

# Save model
curl -s -X POST http://localhost:8765/model/save
```

---

## Template 2: Batch Create Elements and Relationships (Single Apply)

**Use when**: You can define all elements AND relationships upfront and want to minimize round-trips.

Within a single `/model/apply` batch, `createRelationship` can reference `tempId` values from `createElement` operations in the same batch.

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "e1"},
      {"op": "createElement", "type": "business-service", "name": "Order Processing", "tempId": "e2"},
      {"op": "createElement", "type": "application-component", "name": "Order System", "tempId": "e3"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "e2", "targetId": "e1", "tempId": "r1"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "e3", "targetId": "e2", "tempId": "r2"}
    ]
  }'
```

Then poll, collect all IDs (elements + relationships), and proceed with view creation.

---

## Template 3: Search, Update, and Visualize Existing Elements

**Use when**: Modifying existing model elements and building a view from them.

### Step 1: Search for Elements

```bash
# Search by type
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "application-component", "limit": 100}'

# Search by name pattern
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"namePattern": ".*Service$", "limit": 50}'

# Search by property
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"property": {"key": "Status", "value": "Active"}, "limit": 50}'

# Combine filters
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "business-process", "namePattern": "Handle.*", "limit": 20}'
```

### Step 2: Get Element Details (for specific elements)

```bash
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

### Step 3: Update Elements

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "updateElement", "id": "ID_1", "name": "New Name", "properties": {"Status": "Reviewed"}},
      {"op": "updateElement", "id": "ID_2", "documentation": "Updated documentation"}
    ]
  }'
```

### Step 4: Create View from Existing Elements

Follow Template 1 Steps 6-10, using the real IDs from search results.

---

## Template 4: Model Quality Audit

**Use when**: Checking model health, finding issues, and optionally fixing them.

### Step 1: Get Model Overview

```bash
curl -s -X POST http://localhost:8765/model/query \
  -H "Content-Type: application/json" \
  -d '{"limit": 0}'
```

Examine element counts, relationship counts, orphan indicators.

### Step 2: Find Orphan Elements (no relationships)

```bash
# Get all elements of each type and check their relationships
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "business-actor", "limit": 200}'
```

For each element returned, check if `relationships` array is empty. Elements with zero relationships are orphans.

Alternatively, get details for specific elements:
```bash
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

Check if `relationships` is empty.

### Step 3: Check Naming Conventions

Search for elements and inspect their names against conventions:
- Structural elements: should be singular noun phrases (Title Case)
- Processes: should be verb + noun (e.g., "Handle Claim")
- Services: should be noun/gerund phrases

Report violations by element ID and current name.

### Step 4: Check for Missing Documentation

Search all elements and flag those with empty `documentation`.

### Step 5: Find Duplicate Elements

Search by name pattern to find potential duplicates:
```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"namePattern": "Customer", "limit": 100}'
```

Look for elements with the same or very similar names that might be unintentional duplicates.

### Step 6: Apply Fixes (optional)

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "updateElement", "id": "ID_1", "name": "Corrected Name"},
      {"op": "deleteElement", "id": "ORPHAN_ID", "cascade": true}
    ]
  }'
```

---

## Template 5: Instantiate Architecture Pattern

**Use when**: Creating a standard architecture pattern (e.g., microservices, API gateway) as real model elements.

### Microservices Pattern Example

```bash
# Step 1: Create elements
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createElement", "type": "application-component", "name": "API Gateway", "tempId": "ms-gw", "documentation": "API Gateway for routing and authentication"},
      {"op": "createElement", "type": "application-component", "name": "Order Service", "tempId": "ms-order", "documentation": "Handles order lifecycle"},
      {"op": "createElement", "type": "application-component", "name": "Inventory Service", "tempId": "ms-inv", "documentation": "Manages product inventory"},
      {"op": "createElement", "type": "application-component", "name": "Payment Service", "tempId": "ms-pay", "documentation": "Processes payments"},
      {"op": "createElement", "type": "application-service", "name": "Order Management", "tempId": "ms-order-svc"},
      {"op": "createElement", "type": "application-service", "name": "Inventory Management", "tempId": "ms-inv-svc"},
      {"op": "createElement", "type": "application-service", "name": "Payment Processing", "tempId": "ms-pay-svc"},
      {"op": "createElement", "type": "application-interface", "name": "Order API", "tempId": "ms-order-api"},
      {"op": "createElement", "type": "application-interface", "name": "Inventory API", "tempId": "ms-inv-api"},
      {"op": "createElement", "type": "application-interface", "name": "Payment API", "tempId": "ms-pay-api"},
      {"op": "createElement", "type": "application-event", "name": "Order Created", "tempId": "ms-evt-order"},
      {"op": "createElement", "type": "application-event", "name": "Payment Received", "tempId": "ms-evt-pay"},
      {"op": "createElement", "type": "node", "name": "Kubernetes Cluster", "tempId": "ms-k8s"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "ms-gw", "targetId": "ms-order", "tempId": "r1"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "ms-gw", "targetId": "ms-inv", "tempId": "r2"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "ms-gw", "targetId": "ms-pay", "tempId": "r3"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ms-order", "targetId": "ms-order-svc", "tempId": "r4"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ms-inv", "targetId": "ms-inv-svc", "tempId": "r5"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ms-pay", "targetId": "ms-pay-svc", "tempId": "r6"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "ms-order", "targetId": "ms-order-api", "tempId": "r7"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "ms-inv", "targetId": "ms-inv-api", "tempId": "r8"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "ms-pay", "targetId": "ms-pay-api", "tempId": "r9"},
      {"op": "createRelationship", "type": "triggering-relationship", "sourceId": "ms-order", "targetId": "ms-evt-order", "tempId": "r10"},
      {"op": "createRelationship", "type": "triggering-relationship", "sourceId": "ms-pay", "targetId": "ms-evt-pay", "tempId": "r11"},
      {"op": "createRelationship", "type": "flow-relationship", "sourceId": "ms-evt-order", "targetId": "ms-inv", "name": "Order Data", "tempId": "r12"},
      {"op": "createRelationship", "type": "flow-relationship", "sourceId": "ms-evt-order", "targetId": "ms-pay", "name": "Payment Request", "tempId": "r13"}
    ]
  }'

# Step 2: Poll for IDs
curl -s "http://localhost:8765/ops/status?opId=OP_ID"

# Step 3: Create view
curl -s -X POST http://localhost:8765/views \
  -H "Content-Type: application/json" \
  -d '{"name": "Microservices Architecture", "documentation": "Application-layer microservices with event-driven communication"}'

# Step 4: Add all elements to view (use real IDs from step 2)
# ... addToView for each element ...

# Step 5: Add connections to view (use visual IDs from step 4)
# ... addConnectionToView for each relationship ...

# Step 6: Layout
curl -s -X POST http://localhost:8765/views/VIEW_ID/layout \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "dagre", "options": {"rankdir": "TB", "nodesep": 60, "ranksep": 80}}'

# Step 7: Save
curl -s -X POST http://localhost:8765/model/save
```

---

## Template 6: Export and Document Views

**Use when**: Exporting existing views as images.

### List All Views

```bash
curl -s http://localhost:8765/views
```

### Export Specific View

```bash
# High-resolution PNG
curl -s -X POST http://localhost:8765/views/VIEW_ID/export \
  -H "Content-Type: application/json" \
  -d '{"format": "PNG", "scale": 2.0, "margin": 10}'
```

### Validate View Before Export

```bash
curl -s http://localhost:8765/views/VIEW_ID/validate
```

Check for broken connections or missing visual references.

---

## Template 7: Cross-Layer Architecture (Business-Application-Technology)

**Use when**: Building a full-stack layered architecture model.

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "b-actor"},
      {"op": "createElement", "type": "business-role", "name": "Buyer", "tempId": "b-role"},
      {"op": "createElement", "type": "business-process", "name": "Place Order", "tempId": "b-proc"},
      {"op": "createElement", "type": "business-service", "name": "Order Placement", "tempId": "b-svc"},
      {"op": "createElement", "type": "application-component", "name": "eCommerce Platform", "tempId": "a-comp"},
      {"op": "createElement", "type": "application-service", "name": "Shopping Cart Service", "tempId": "a-svc"},
      {"op": "createElement", "type": "application-interface", "name": "Web UI", "tempId": "a-iface"},
      {"op": "createElement", "type": "data-object", "name": "Order Record", "tempId": "a-data"},
      {"op": "createElement", "type": "node", "name": "Cloud Platform", "tempId": "t-node"},
      {"op": "createElement", "type": "system-software", "name": "Application Server", "tempId": "t-sw"},
      {"op": "createElement", "type": "artifact", "name": "ecommerce.war", "tempId": "t-art"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "b-actor", "targetId": "b-role", "tempId": "r1"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "b-role", "targetId": "b-proc", "tempId": "r2"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "b-proc", "targetId": "b-svc", "tempId": "r3"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "a-svc", "targetId": "b-proc", "tempId": "r4"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "a-comp", "targetId": "a-svc", "tempId": "r5"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "a-comp", "targetId": "a-iface", "tempId": "r6"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "a-iface", "targetId": "b-role", "tempId": "r7"},
      {"op": "createRelationship", "type": "access-relationship", "sourceId": "a-comp", "targetId": "a-data", "accessType": "readwrite", "tempId": "r8"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "t-art", "targetId": "a-comp", "tempId": "r9"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "t-sw", "targetId": "t-art", "tempId": "r10"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "t-node", "targetId": "t-sw", "tempId": "r11"}
    ]
  }'
```

After polling, create a "Layered" view with elements laid out in three horizontal bands (Business at top, Application in middle, Technology at bottom). Use `rankdir: "TB"` in the layout.

---

## Agent Execution Notes

When executing these templates:

1. **Always Health Check First**: Run `curl -s http://localhost:8765/health` before starting. If it fails, stop and tell the user.

2. **Parse JSON Carefully**: Use `jq` or parse the JSON response inline to extract IDs. Example:
   ```bash
   # Extract operationId
   echo '{"operationId":"op-123"}' | jq -r '.operationId'
   ```

3. **Poll with Patience**: Operations usually complete in <2 seconds, but complex batches may take longer. Poll every 1 second, up to 60 seconds.

4. **Report Progress**: After each major step, tell the user what was created (element names, IDs, view names).

5. **Handle Errors**: If an operation returns `"status": "error"`, report the error message and stop. Don't proceed with dependent operations.

6. **Save Periodically**: Call `POST /model/save` after completing significant workflow steps, not after every single operation.
