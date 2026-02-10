# BOM Operations Reference

All 20 operations for the `changes` array in a BOM file. Fields marked (R) are required.

## createElement

Create an ArchiMate element.

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"createElement"` | |
| `type` (R) | string | See element-types.md |
| `name` (R) | string | Element name (min 1 char) |
| `tempId` | string | Cross-reference ID |
| `documentation` | string | Description text |
| `folder` | string | Folder path or ID |

## createRelationship

Create a relationship between two elements.

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"createRelationship"` | |
| `type` (R) | string | See relationship types below |
| `sourceId` (R) | string | Source element ID or tempId |
| `targetId` (R) | string | Target element ID or tempId |
| `tempId` | string | Cross-reference ID |
| `name` | string | Relationship label |
| `documentation` | string | Description text |
| `accessType` | integer | For access-relationship: 0=write, 1=read, 2=access, 3=readwrite |
| `strength` | string | For influence-relationship: `+`, `-`, `++`, `--` |

**Relationship types:** `composition-relationship`, `aggregation-relationship`, `assignment-relationship`, `realization-relationship`, `serving-relationship`, `access-relationship`, `influence-relationship`, `triggering-relationship`, `flow-relationship`, `specialization-relationship`, `association-relationship`

## updateElement

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"updateElement"` | |
| `id` (R) | string | Element ID or tempId |
| `name` | string | New name |
| `documentation` | string | New documentation |
| `properties` | object | `{ key: string, value: string }` |

At least one of `name`, `documentation`, or `properties` required.

## updateRelationship

Same structure as updateElement but for relationships.

## deleteElement

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"deleteElement"` | |
| `id` (R) | string | Element ID or tempId |
| `cascade` | boolean | Delete related relationships and view objects (default: true) |

## deleteRelationship

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"deleteRelationship"` | |
| `id` (R) | string | Relationship ID or tempId |

## setProperty

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"setProperty"` | |
| `id` (R) | string | Element or relationship ID or tempId |
| `key` (R) | string | Property key |
| `value` (R) | string | Property value |

## moveToFolder

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"moveToFolder"` | |
| `id` (R) | string | Element, relationship, or view ID or tempId |
| `folderId` (R) | string | Target folder ID or tempId |

## createFolder

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"createFolder"` | |
| `name` (R) | string | Folder name |
| `parentId` | string | Parent folder ID |
| `parentType` | string | Parent folder type (e.g., `"application"`, `"business"`) |
| `tempId` | string | Cross-reference ID |

At least one of `parentId` or `parentType` required.

## createView

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"createView"` | |
| `name` (R) | string | View name |
| `tempId` | string | Cross-reference ID |
| `documentation` | string | View description |
| `viewpoint` | string | ArchiMate viewpoint ID (e.g., `"application_cooperation"`, `"layered"`) |

## deleteView

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"deleteView"` | |
| `viewId` (R) | string | View ID to delete |

## addToView

Add an element to a view as a visual object.

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"addToView"` | |
| `viewId` (R) | string | Target view ID or tempId |
| `elementId` (R) | string | Element ID or tempId |
| `tempId` | string | Visual object cross-reference ID (needed for addConnectionToView) |
| `x` | integer | X coordinate (default: 100) |
| `y` | integer | Y coordinate (default: 100) |
| `width` | integer | Width pixels (default: -1 = auto) |
| `height` | integer | Height pixels (default: -1 = auto) |
| `parentVisualId` | string | Nest inside this visual object |
| `autoNest` | boolean | Auto-nest inside surrounding objects |

**Critical:** The tempId assigned here is a *visual* ID. Use it in `sourceVisualId`/`targetVisualId` of addConnectionToView.

## addConnectionToView

Visualize a relationship as a connection between two visual objects.

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"addConnectionToView"` | |
| `viewId` (R) | string | View ID or tempId |
| `relationshipId` (R) | string | Relationship ID or tempId |
| `sourceVisualId` (R) | string | Visual ID of source (from addToView tempId) |
| `targetVisualId` (R) | string | Visual ID of target (from addToView tempId) |
| `tempId` | string | Visual connection cross-reference ID |

**Critical rules:**
1. Both visual objects must already exist in the view (from prior addToView)
2. `sourceVisualId` must correspond to the relationship's source element
3. `targetVisualId` must correspond to the relationship's target element
4. Direction mismatch = error. The server validates this automatically.

## nestInView

Move a visual object to be a child of another.

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"nestInView"` | |
| `viewId` (R) | string | View ID or tempId |
| `visualId` (R) | string | Visual object to move |
| `parentVisualId` (R) | string | Target parent visual object |
| `x` | integer | X relative to parent (default: 10) |
| `y` | integer | Y relative to parent (default: 10) |

## deleteConnectionFromView

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"deleteConnectionFromView"` | |
| `viewId` (R) | string | View ID or tempId |
| `connectionId` (R) | string | Visual connection ID or tempId |

## styleViewObject

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"styleViewObject"` | |
| `viewObjectId` (R) | string | Visual object ID or tempId |
| `fillColor` | string | Hex color (e.g., `"#FF5733"`) |
| `fontColor` | string | Hex color |
| `fontStyle` | string | `"bold"`, `"italic"` |
| `lineColor` | string | Hex color |
| `lineWidth` | integer | Pixels |
| `opacity` | integer | 0-255 (0=transparent, 255=opaque) |
| `textAlignment` | integer | 0=left, 1=center, 2=right |
| `textPosition` | integer | 0=top, 1=middle, 2=bottom |

At least one style property required.

## styleConnection

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"styleConnection"` | |
| `connectionId` (R) | string | Visual connection ID or tempId |
| `lineColor` | string | Hex color |
| `lineWidth` | integer | Pixels |
| `fontColor` | string | Hex color |
| `fontStyle` | string | Font style |
| `textPosition` | integer | 0=source, 1=middle, 2=target |

## moveViewObject

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"moveViewObject"` | |
| `viewObjectId` (R) | string | Visual object ID or tempId |
| `x` | integer | New X |
| `y` | integer | New Y |
| `width` | integer | New width |
| `height` | integer | New height |

At least one coordinate/dimension required.

## createNote

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"createNote"` | |
| `viewId` (R) | string | View ID or tempId |
| `content` (R) | string | Note text |
| `tempId` | string | Cross-reference ID |
| `x` | integer | Default: 100 |
| `y` | integer | Default: 100 |
| `width` | integer | Default: 200 |
| `height` | integer | Default: 100 |

## createGroup

| Field | Type | Notes |
|-------|------|-------|
| `op` (R) | `"createGroup"` | |
| `viewId` (R) | string | View ID or tempId |
| `name` (R) | string | Group label |
| `tempId` | string | Cross-reference ID |
| `documentation` | string | Group description |
| `x` | integer | Default: 100 |
| `y` | integer | Default: 100 |
| `width` | integer | Default: 400 |
| `height` | integer | Default: 300 |
