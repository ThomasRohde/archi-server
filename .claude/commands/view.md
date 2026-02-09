---
name: view
description: Create an ArchiMate view in Archi from existing model elements or a description
argument-hint: "[description of what the view should show, or element types/names to include]"
allowed-tools:
  - Read
  - Bash
---

# ArchiMate View Creation

Create and populate an ArchiMate view in Archi by searching for existing model elements, adding them to a new view with their relationships, and applying auto-layout.

Load the **archi-server-api** skill for API execution details.

## Process

### Step 1: Health Check

```bash
curl -s http://localhost:8765/health
```

### Step 2: Determine What to Include

Based on the user's description, search for relevant elements:

```bash
# Search by type
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "application-component", "limit": 100}'

# Search by name pattern
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"namePattern": "ORDER_PATTERN", "limit": 50}'

# Search by property
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"property": {"key": "Domain", "value": "Sales"}, "limit": 50}'
```

Present the found elements to the user and confirm which to include. If the user specified specific elements, use those directly.

### Step 3: Get Element Details (for relationships)

For each element to include, get its relationships:

```bash
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

Collect all relationships between elements that will be on the view. Only include connections where BOTH source and target will be on the view.

### Step 4: Create the View

```bash
curl -s -X POST http://localhost:8765/views \
  -H "Content-Type: application/json" \
  -d '{"name": "VIEW_NAME", "documentation": "VIEW_DESCRIPTION"}'
```

### Step 5: Add Elements to View

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "addToView", "viewId": "VIEW_ID", "elementId": "ELEM_ID_1", "tempId": "v1"},
    {"op": "addToView", "viewId": "VIEW_ID", "elementId": "ELEM_ID_2", "tempId": "v2"},
    ...
  ]}'
```

**For compound/nested elements** (e.g., parent composing children), use `parentVisualId` to nest children:
```bash
{"op": "addToView", "viewId": "VIEW_ID", "elementId": "CHILD_ID", "tempId": "v-child", "parentVisualId": "v-parent", "x": 10, "y": 30}
```
Or use `nestInView` to reparent after placement:
```bash
{"op": "nestInView", "viewId": "VIEW_ID", "visualId": "CHILD_VIS_ID", "parentVisualId": "PARENT_VIS_ID", "x": 10, "y": 30}
```

### Step 6: Poll for Visual Object IDs

```bash
curl -s "http://localhost:8765/ops/status?opId=OP_ID"
```

Build a map: `elementConceptId → visualObjectId` (from the tempId results).

### Step 7: Add Connections

For each relationship where both source and target are on the view, look up their visual object IDs and add the connection:

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "addConnectionToView", "viewId": "VIEW_ID", "relationshipId": "REL_ID", "sourceVisualId": "VIS_SRC", "targetVisualId": "VIS_TGT"},
    ...
  ]}'
```

### Step 8: Auto-Layout

Choose layout direction based on content:
- **TB** (top-bottom): Layered views (Business → Application → Technology), process flows
- **LR** (left-right): Value streams, horizontal processes
- **BT** (bottom-top): Technology-up views

```bash
curl -s -X POST http://localhost:8765/views/VIEW_ID/layout \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "dagre", "options": {"rankdir": "TB", "nodesep": 60, "ranksep": 80}}'
```

### Step 9: Optional Styling

If the user wants layer grouping or color coding:

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createGroup", "viewId": "VIEW_ID", "name": "Business Layer", "tempId": "g1", "x": 10, "y": 10, "width": 500, "height": 200},
    {"op": "createNote", "viewId": "VIEW_ID", "content": "Generated view - auto-layout applied", "tempId": "n1", "x": 10, "y": 600}
  ]}'
```

### Step 10: Export (optional)

```bash
# Export as PNG
curl -s -X POST http://localhost:8765/views/VIEW_ID/export \
  -H "Content-Type: application/json" \
  -d '{"format": "PNG", "scale": 2}'
```

### Step 11: Save

```bash
curl -s -X POST http://localhost:8765/model/save
```

## View Naming Conventions

- **Prefix with purpose**: "Overview - Application Landscape", "Detail - Order Processing"
- **State prefix for roadmaps**: "ASIS - Integration Landscape", "TOBE - Cloud Architecture"
- **Viewpoint name**: "Layered - Core Banking", "Cooperation - Customer Services"

## Complexity Guidelines

- Target ~20 elements per view (max 40)
- If too many elements found, suggest filtering or splitting into multiple views
- Only include relationships where both endpoints are on the view

## Report Results

After completion, report:
- View name and ID
- Number of elements added
- Number of connections added
- Layout direction used
