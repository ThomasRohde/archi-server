# API Operations Reference

Complete field-level reference for every `/model/apply` operation type and API endpoint.

## Element Operations

### createElement

Creates a new ArchiMate element in the model.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"createElement"` | Operation type |
| `type` | Yes | string | ArchiMate element type (kebab-case) |
| `name` | Yes | string | Element name |
| `tempId` | No | string | Temporary ID for referencing in subsequent operations |
| `documentation` | No | string | Element description/documentation |
| `properties` | No | object | Key-value pairs for custom properties |
| `folderId` | No | string | Target folder ID (defaults to type-appropriate folder) |

**Example:**
```json
{
  "op": "createElement",
  "type": "business-process",
  "name": "Handle Insurance Claim",
  "tempId": "bp1",
  "documentation": "End-to-end claim handling from submission to resolution",
  "properties": {
    "Status": "Active",
    "Owner": "Claims Department"
  }
}
```

**Valid element types:**

| Layer | Types |
|-------|-------|
| Strategy | `resource`, `capability`, `value-stream`, `course-of-action` |
| Business | `business-actor`, `business-role`, `business-collaboration`, `business-interface`, `business-process`, `business-function`, `business-interaction`, `business-event`, `business-service`, `business-object`, `contract`, `representation`, `product` |
| Application | `application-component`, `application-collaboration`, `application-interface`, `application-function`, `application-interaction`, `application-process`, `application-event`, `application-service`, `data-object` |
| Technology | `node`, `device`, `system-software`, `technology-collaboration`, `technology-interface`, `path`, `communication-network`, `technology-function`, `technology-process`, `technology-interaction`, `technology-event`, `technology-service`, `artifact` |
| Physical | `equipment`, `facility`, `distribution-network`, `material` |
| Motivation | `stakeholder`, `driver`, `assessment`, `goal`, `outcome`, `principle`, `requirement`, `constraint`, `meaning`, `value` |
| Implementation | `work-package`, `deliverable`, `implementation-event`, `plateau`, `gap` |
| Other | `location`, `grouping`, `junction` |

### updateElement

Updates an existing element's name, documentation, or properties.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"updateElement"` | Operation type |
| `id` | Yes | string | Element ID |
| `name` | No | string | New name |
| `documentation` | No | string | New documentation |
| `properties` | No | object | Properties to set/update |

**Example:**
```json
{
  "op": "updateElement",
  "id": "abc123",
  "name": "Process Insurance Claim",
  "documentation": "Updated process with automated validation",
  "properties": {"Status": "Redesigned"}
}
```

### deleteElement

Removes an element from the model.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"deleteElement"` | Operation type |
| `id` | Yes | string | Element ID |
| `cascade` | No | boolean | Remove relationships + visual refs (default: `true`) |

**Example:**
```json
{"op": "deleteElement", "id": "abc123", "cascade": true}
```

### setProperty

Sets a single property on an element or relationship.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"setProperty"` | Operation type |
| `id` | Yes | string | Element or relationship ID |
| `key` | Yes | string | Property name |
| `value` | Yes | string | Property value |

**Example:**
```json
{"op": "setProperty", "id": "abc123", "key": "Status", "value": "Active"}
```

### moveToFolder

Moves an element to a different folder.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"moveToFolder"` | Operation type |
| `id` | Yes | string | Element ID |
| `folderId` | Yes | string | Target folder ID |

## Relationship Operations

### createRelationship

Creates a relationship between two elements.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"createRelationship"` | Operation type |
| `type` | Yes | string | Relationship type (kebab-case with `-relationship` suffix) |
| `sourceId` | Yes | string | Source element ID (or tempId from same batch) |
| `targetId` | Yes | string | Target element ID (or tempId from same batch) |
| `tempId` | No | string | Temporary ID for referencing later |
| `name` | No | string | Relationship name/label |
| `documentation` | No | string | Description |
| `properties` | No | object | Custom properties |
| `accessType` | No | string | For access-relationship: `"read"`, `"write"`, `"readwrite"` |

**Example:**
```json
{
  "op": "createRelationship",
  "type": "serving-relationship",
  "sourceId": "def456",
  "targetId": "abc123",
  "tempId": "r1",
  "name": "provides order data"
}
```

**Valid relationship types:**
- `composition-relationship` — strong whole-part
- `aggregation-relationship` — weak whole-part
- `assignment-relationship` — who performs what
- `realization-relationship` — logical-to-physical
- `serving-relationship` — service delivery (source serves target)
- `access-relationship` — data access (use `accessType`)
- `influence-relationship` — motivation impact
- `triggering-relationship` — temporal/causal
- `flow-relationship` — transfer between behaviors
- `specialization-relationship` — type hierarchy
- `association-relationship` — generic connection

### updateRelationship

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"updateRelationship"` | Operation type |
| `id` | Yes | string | Relationship ID |
| `name` | No | string | New name |
| `documentation` | No | string | New documentation |
| `properties` | No | object | Properties to set/update |

### deleteRelationship

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"deleteRelationship"` | Operation type |
| `id` | Yes | string | Relationship ID |

## View Operations (via /model/apply)

### addToView

Adds an existing model element to a view as a visual object.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"addToView"` | Operation type |
| `viewId` | Yes | string | Target view ID |
| `elementId` | Yes | string | Element concept ID to add |
| `tempId` | No | string | Temporary ID for the visual object (needed for connections) |
| `x` | No | number | X position (default: 100) |
| `y` | No | number | Y position (default: 100) |
| `width` | No | number | Width in pixels (default: auto) |
| `height` | No | number | Height in pixels (default: auto) |

**Example:**
```json
{
  "op": "addToView",
  "viewId": "view-abc",
  "elementId": "abc123",
  "tempId": "vo1",
  "x": 200,
  "y": 100,
  "width": 120,
  "height": 55
}
```

### addConnectionToView

Adds a visual connection for an existing relationship between two visual objects on a view.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"addConnectionToView"` | Operation type |
| `viewId` | Yes | string | Target view ID |
| `relationshipId` | Yes | string | Relationship concept ID |
| `sourceVisualId` | Yes | string | Source visual object ID (from `addToView`) |
| `targetVisualId` | Yes | string | Target visual object ID (from `addToView`) |
| `tempId` | No | string | Temporary ID |

**CRITICAL**: `sourceVisualId` and `targetVisualId` must be **visual object IDs** (from `addToView` results or `GET /views/{id}`), NOT element concept IDs.

**Example:**
```json
{
  "op": "addConnectionToView",
  "viewId": "view-abc",
  "relationshipId": "rel-456",
  "sourceVisualId": "vo1-real-id",
  "targetVisualId": "vo2-real-id"
}
```

### deleteConnectionFromView

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"deleteConnectionFromView"` | Operation type |
| `viewId` | Yes | string | View ID |
| `connectionId` | Yes | string | Visual connection ID |

### styleViewObject

Styles a visual element on a view.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"styleViewObject"` | Operation type |
| `viewObjectId` | Yes | string | Visual object ID |
| `fillColor` | No | string | Fill color (hex, e.g. `"#FF5733"`) |
| `lineColor` | No | string | Border color (hex) |
| `fontColor` | No | string | Text color (hex) |
| `lineWidth` | No | number | Border width |
| `opacity` | No | number | Opacity (0-255) |
| `textAlignment` | No | number | Text alignment |

### styleConnection

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"styleConnection"` | Operation type |
| `connectionId` | Yes | string | Visual connection ID |
| `lineColor` | No | string | Line color (hex) |
| `lineWidth` | No | number | Line width |
| `fontColor` | No | string | Label color (hex) |

### moveViewObject

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"moveViewObject"` | Operation type |
| `viewObjectId` | Yes | string | Visual object ID |
| `x` | Yes | number | New X position |
| `y` | Yes | number | New Y position |
| `width` | No | number | New width |
| `height` | No | number | New height |

### createNote

Adds a text note to a view (not a model element).

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"createNote"` | Operation type |
| `viewId` | Yes | string | Target view ID |
| `content` | Yes | string | Note text content |
| `tempId` | No | string | Temporary ID |
| `x` | No | number | X position |
| `y` | No | number | Y position |
| `width` | No | number | Width |
| `height` | No | number | Height |

### createGroup

Adds a visual grouping box to a view.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"createGroup"` | Operation type |
| `viewId` | Yes | string | Target view ID |
| `name` | Yes | string | Group label |
| `tempId` | No | string | Temporary ID |
| `x` | No | number | X position |
| `y` | No | number | Y position |
| `width` | No | number | Width |
| `height` | No | number | Height |

## Folder Operations

### createFolder

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `op` | Yes | `"createFolder"` | Operation type |
| `name` | Yes | string | Folder name |
| `parentFolderId` | Yes | string | Parent folder ID |
| `tempId` | No | string | Temporary ID |

## Endpoint-Specific References

### POST /model/search

```json
{
  "type": "business-actor",
  "namePattern": "^Customer.*",
  "property": {"key": "Status", "value": "Active"},
  "limit": 50
}
```

All fields optional. Combine for refined searches. `namePattern` supports regex.

### POST /model/query

```json
{"limit": 20}
```

Returns model summary with element counts by type, relationship counts, and sample elements.

### GET /model/element/{id}

Returns full element detail including:
- Element properties (name, type, documentation, custom properties)
- All relationships (incoming and outgoing) with source/target details
- All views containing this element

### POST /views

```json
{
  "name": "Business Overview",
  "documentation": "High-level business architecture view"
}
```

Returns the created view with its `id`. This is a **sync** endpoint.

### POST /views/{id}/layout

```json
{
  "algorithm": "dagre",
  "options": {
    "rankdir": "TB",
    "nodesep": 60,
    "ranksep": 80
  }
}
```

Layout options:
- `rankdir`: `TB` (top-bottom), `BT` (bottom-top), `LR` (left-right), `RL` (right-left)
- `nodesep`: Horizontal spacing between nodes (pixels)
- `ranksep`: Vertical spacing between ranks (pixels)

### POST /views/{id}/export

```json
{
  "format": "PNG",
  "scale": 2.0,
  "margin": 10
}
```

- `format`: `"PNG"` or `"JPEG"`
- `scale`: 0.5 to 4.0 (default 1.0)
- `margin`: Pixels around edges

### PUT /views/{id}/router

```json
{"type": "manhattan"}
```

Options: `"bendpoint"` (straight with bend points) or `"manhattan"` (right-angle routing).

### POST /model/plan

Dry-run validation of changes without applying them:

```json
{
  "changes": [
    {"op": "createElement", "type": "business-actor", "name": "Test Actor"}
  ]
}
```

Returns validation results showing what would happen, without mutating the model.
