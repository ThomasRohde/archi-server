---
name: archi-server-api
description: This skill should be used when the agent needs to "create elements in Archi", "modify the model", "create views", "add to view", "auto-layout", "export view", "search model", "query model", "execute CURL", "call the API", "apply changes", "poll operation status", or perform any operation against the Archi Model API Server running at localhost:8765.
allowed-tools: Bash(curl:*) Read
---

# Archi Model API Server — Execution Guide

This skill enables agents to **execute real modeling operations** in Archi by running CURL commands against the Archi Model API Server (`http://localhost:8765`).

## Prerequisites

Before any modeling operation, verify the server is running:

```bash
curl -s http://localhost:8765/health
```

Expected: JSON with `"status": "healthy"`. If this fails, the server is not running — tell the user to start it from Archi's Scripts menu.

## Core Concepts

### Sync vs Async Endpoints

| Type | Endpoints | Behavior |
|------|-----------|----------|
| **Sync** | `/health`, `/model/query`, `/model/search`, `/model/element/{id}`, `/views`, `/views/{id}`, `/folders` | Return result immediately |
| **Async** | `/model/apply` | Returns `operationId`; must poll `/ops/status?opId=...` for result |

### The tempId System

When creating elements/relationships, assign a `tempId` string. After the operation completes, the result maps each `tempId` to the real Archi element ID. Use real IDs for all subsequent operations.

**Within a single `/model/apply` batch**, later operations can reference earlier `tempId` values directly (e.g., a `createRelationship` can reference a `tempId` from a `createElement` in the same batch).

### Visual IDs vs Concept IDs

- **Concept ID**: The ArchiMate element/relationship ID in the model (returned by `createElement`/`createRelationship`)
- **Visual ID**: The diagram object ID on a specific view (returned by `addToView`)
- `addConnectionToView` requires **visual IDs** for `sourceVisualId` and `targetVisualId`, NOT concept IDs

## The Async Workflow Pattern

Every mutation follows this pattern:

```
1. POST /model/apply  →  { "operationId": "op-123" }
2. GET /ops/status?opId=op-123  →  { "status": "queued" }
3. GET /ops/status?opId=op-123  →  { "status": "processing" }
4. GET /ops/status?opId=op-123  →  { "status": "complete", "result": [...] }
```

**Polling implementation:**

```bash
# Submit changes
OP_ID=$(curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [...]}' | jq -r '.operationId')

# Poll until complete (wait 1 second between attempts)
while true; do
  STATUS=$(curl -s "http://localhost:8765/ops/status?opId=$OP_ID")
  STATE=$(echo "$STATUS" | jq -r '.status')
  if [ "$STATE" = "complete" ] || [ "$STATE" = "error" ]; then
    echo "$STATUS"
    break
  fi
  sleep 1
done
```

**In practice**: Run the POST, then run the GET poll. Parse the JSON result to extract real IDs. Most operations complete within 1-2 seconds.

## API Quick Reference

### Read Operations (Sync)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Server health check |
| `/model/query` | POST | Model summary + sample elements |
| `/model/search` | POST | Search by type, name pattern, properties |
| `/model/element/{id}` | GET | Single element with relationships & views |
| `/views` | GET | List all views |
| `/views/{id}` | GET | View detail with elements + connections |
| `/views/{id}/validate` | GET | Validate view connection integrity |
| `/folders` | GET | Full folder hierarchy |

### Write Operations

| Endpoint | Method | Type | Purpose |
|----------|--------|------|---------|
| `/model/apply` | POST | Async | Create/update/delete elements, relationships, views |
| `/model/plan` | POST | Sync | Dry-run validation (no mutation) |
| `/views` | POST | Sync | Create a new empty view |
| `/views/{id}/layout` | POST | Sync | Auto-layout with Dagre |
| `/views/{id}/export` | POST | Sync | Export as PNG/JPEG |
| `/views/{id}/router` | PUT | Sync | Set connection router style |
| `/model/save` | POST | Sync | Save model to disk |
| `/shutdown` | POST | Sync | Stop the server |

### All `/model/apply` Operation Types

| Operation | Required Fields | Optional Fields |
|-----------|----------------|-----------------|
| `createElement` | `type`, `name` | `tempId`, `documentation`, `properties`, `folderId` |
| `createRelationship` | `type`, `sourceId`, `targetId` | `tempId`, `name`, `documentation`, `properties`, `accessType` |
| `updateElement` | `id` | `name`, `documentation`, `properties` |
| `updateRelationship` | `id` | `name`, `documentation`, `properties` |
| `deleteElement` | `id` | `cascade` (default `true`) |
| `deleteRelationship` | `id` | |
| `setProperty` | `id`, `key`, `value` | |
| `moveToFolder` | `id`, `folderId` | |
| `createFolder` | `name`, `parentFolderId` | `tempId` |
| `addToView` | `viewId`, `elementId` | `tempId`, `x`, `y`, `width`, `height`, `parentVisualId` |
| `addConnectionToView` | `viewId`, `relationshipId`, `sourceVisualId`, `targetVisualId` | `tempId` |
| `nestInView` | `viewId`, `visualId`, `parentVisualId` | `x`, `y` |
| `deleteConnectionFromView` | `viewId`, `connectionId` | |
| `styleViewObject` | `viewObjectId` | `fillColor`, `lineColor`, `fontColor`, `lineWidth`, `opacity`, `textAlignment` |
| `styleConnection` | `connectionId` | `lineColor`, `lineWidth`, `fontColor` |
| `moveViewObject` | `viewObjectId`, `x`, `y` | `width`, `height` |
| `createNote` | `viewId`, `content` | `tempId`, `x`, `y`, `width`, `height` |
| `createGroup` | `viewId`, `name` | `tempId`, `x`, `y`, `width`, `height` |

## Complete End-to-End Sequence

This is the canonical workflow for creating a model from scratch:

### Step 1: Check Health
```bash
curl -s http://localhost:8765/health
```

### Step 2: Query Existing Model (avoid duplicates)
```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "business-actor", "namePattern": "Customer"}'
```

### Step 3: Create Elements
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "e1"},
      {"op": "createElement", "type": "business-service", "name": "Order Processing", "tempId": "e2"},
      {"op": "createElement", "type": "application-component", "name": "Order System", "tempId": "e3"}
    ]
  }'
```

### Step 4: Poll for Element IDs
```bash
curl -s "http://localhost:8765/ops/status?opId=OPERATION_ID"
```

Result contains:
```json
{
  "status": "complete",
  "result": [
    {"tempId": "e1", "id": "abc123", "type": "business-actor", "name": "Customer"},
    {"tempId": "e2", "id": "def456", "type": "business-service", "name": "Order Processing"},
    {"tempId": "e3", "id": "ghi789", "type": "application-component", "name": "Order System"}
  ]
}
```

### Step 5: Create Relationships (using real IDs)
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "def456", "targetId": "abc123", "tempId": "r1"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ghi789", "targetId": "def456", "tempId": "r2"}
    ]
  }'
```

### Step 6: Poll for Relationship IDs
```bash
curl -s "http://localhost:8765/ops/status?opId=OPERATION_ID_2"
```

### Step 7: Create View (sync — returns immediately)
```bash
curl -s -X POST http://localhost:8765/views \
  -H "Content-Type: application/json" \
  -d '{"name": "Order Processing Overview"}'
```

Returns: `{"id": "view-abc", "name": "Order Processing Overview"}`

### Step 8: Add Elements to View
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "addToView", "viewId": "view-abc", "elementId": "abc123", "x": 300, "y": 50, "width": 120, "height": 55, "tempId": "v1"},
      {"op": "addToView", "viewId": "view-abc", "elementId": "def456", "x": 300, "y": 200, "width": 120, "height": 55, "tempId": "v2"},
      {"op": "addToView", "viewId": "view-abc", "elementId": "ghi789", "x": 300, "y": 350, "width": 120, "height": 55, "tempId": "v3"}
    ]
  }'
```

**Nesting (compound elements):** To place a child element inside a parent (e.g., a composed Application Component), use `parentVisualId`:
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "addToView", "viewId": "view-abc", "elementId": "parent-id", "x": 50, "y": 50, "width": 300, "height": 200, "tempId": "v-parent"},
      {"op": "addToView", "viewId": "view-abc", "elementId": "child-id", "x": 10, "y": 30, "width": 120, "height": 55, "tempId": "v-child", "parentVisualId": "v-parent"}
    ]
  }'
```

**Or use `nestInView` to move an already-placed element into a parent:**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "nestInView", "viewId": "view-abc", "visualId": "v-child-visual-id", "parentVisualId": "v-parent-visual-id", "x": 10, "y": 30}
    ]
  }'
```

### Step 9: Poll for Visual Object IDs
The result maps `tempId` → visual object ID. These are the IDs needed for connections.

### Step 10: Add Connections to View
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "addConnectionToView", "viewId": "view-abc", "relationshipId": "r1-real-id", "sourceVisualId": "v2-visual-id", "targetVisualId": "v1-visual-id"},
      {"op": "addConnectionToView", "viewId": "view-abc", "relationshipId": "r2-real-id", "sourceVisualId": "v3-visual-id", "targetVisualId": "v2-visual-id"}
    ]
  }'
```

### Step 11: Auto-Layout
```bash
curl -s -X POST http://localhost:8765/views/view-abc/layout \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "dagre", "options": {"rankdir": "TB", "nodesep": 60, "ranksep": 80}}'
```

### Step 12: Export as PNG (optional)
```bash
curl -s -X POST http://localhost:8765/views/view-abc/export \
  -H "Content-Type: application/json" \
  -d '{"format": "PNG", "scale": 2}'
```

### Step 13: Save Model
```bash
curl -s -X POST http://localhost:8765/model/save
```

## Important Gotchas

1. **Connections are NOT auto-created**: Adding elements to a view does NOT visualize their relationships. You must explicitly `addConnectionToView` for each relationship.

2. **Poll before using IDs**: Never assume an operation is complete. Always poll `/ops/status` and extract real IDs from the result.

3. **Visual IDs ≠ concept IDs**: `addConnectionToView` needs the visual object IDs (from `addToView` results), not the element/relationship concept IDs.

4. **Within-batch tempId references**: In a single `/model/apply` batch, a `createRelationship` CAN reference `tempId` from a `createElement` in the same batch. But `addToView` and `addConnectionToView` typically need IDs from a separate prior batch.

5. **Nesting for compound elements**: When an element visually contains children (e.g., Application Component composing others), use `parentVisualId` on `addToView` to place children inside the parent. The child's `x`, `y` coordinates become **relative to the parent container**. Alternatively, use `nestInView` to reparent an already-placed visual object. Without nesting, children appear as siblings even if overlapping the parent.

6. **Limits**: Max 1000 changes per request. 1MB body limit. 200 requests/minute rate limit. Keep batches ≤20 ops when creating relationships to avoid silent GEF rollback. The server internally chunks large CompoundCommands and verifies created objects persist.

7. **Layout options**: Only `dagre` algorithm. `rankdir`: `TB` (top-bottom), `BT`, `LR` (left-right), `RL`. `nodesep`/`ranksep` in pixels.

8. **Connection router**: `bendpoint` (straight lines) or `manhattan` (right-angle routing). Set via `PUT /views/{id}/router`.

9. **Export formats**: `PNG` or `JPEG`. Scale: 0.5 to 4.0. Optional `margin` in pixels.

9. **Delete cascade**: `deleteElement` with `cascade: true` (default) removes the element, all its relationships, and all visual references across all views.

10. **Search supports regex**: `namePattern` in `/model/search` accepts regex patterns (e.g., `"^Order.*"` to find all elements starting with "Order").

11. **Model diagnostics**: `GET /model/diagnostics` detects orphan/ghost objects — elements or relationships that exist in the EMF resource but are missing from folder structure.

## Additional Resources

### Reference Files

- **`references/api-operations.md`** — Detailed field reference for every operation type with full examples
- **`references/workflow-templates.md`** — Reusable multi-step CURL workflows for common modeling scenarios

