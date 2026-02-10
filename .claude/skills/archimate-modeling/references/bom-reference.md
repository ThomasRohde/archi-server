# BOM (Bill of Materials) Reference

## Table of Contents

- [BOM Structure](#bom-structure)
- [All Operation Types](#all-operation-types)
- [Complete Examples](#complete-examples)
- [Multi-BOM Composition](#multi-bom-composition)

## BOM Structure

```json
{
  "version": "1.0",
  "description": "Human-readable description",
  "changes": [],
  "includes": ["other-bom.json"],
  "idFiles": ["previous.ids.json"]
}
```

- `version`: Always `"1.0"` (required)
- `changes`: Array of operations (required unless using `includes`)
- `includes`: Compose from other BOM files (resolved relative to this file)
- `idFiles`: Pre-load tempId mappings from previous runs (resolved relative to this file)

## All Operation Types

### createElement

```json
{
  "op": "createElement",
  "type": "application-component",
  "name": "Customer Portal",
  "tempId": "ac-portal",
  "documentation": "Web-based customer self-service portal",
  "folder": "id-of-target-folder"
}
```

Required: `type`, `name`. Optional: `tempId`, `documentation`, `folder`.

### createRelationship

```json
{
  "op": "createRelationship",
  "type": "serving-relationship",
  "sourceId": "ac-portal",
  "targetId": "ba-customer",
  "tempId": "rel-portal-serves-customer",
  "name": "delivers self-service"
}
```

Required: `type`, `sourceId`, `targetId`. Optional: `tempId`, `name`, `documentation`.

For access-relationship, add `accessType` as an integer:

| Value | Meaning | Description |
|-------|---------|-------------|
| 0 | Write | Behavior can write to the data object |
| 1 | Read | Behavior can read from the data object |
| 2 | Access | Generic access (unspecified read/write) |
| 3 | ReadWrite | Behavior can both read and write |

Example:
```json
{
  "op": "createRelationship",
  "type": "access-relationship",
  "sourceId": "bp-process",
  "targetId": "do-data",
  "tempId": "rel-access",
  "accessType": 3
}
```

### updateElement

```json
{
  "op": "updateElement",
  "id": "ac-portal",
  "name": "Customer Self-Service Portal",
  "documentation": "Updated description"
}
```

Required: `id`. Optional: `name`, `documentation`.

### updateRelationship

```json
{
  "op": "updateRelationship",
  "id": "rel-portal-serves-customer",
  "name": "provides self-service",
  "documentation": "Updated relationship description"
}
```

Required: `id`. Optional: `name`, `documentation`.

### deleteElement

```json
{
  "op": "deleteElement",
  "id": "ac-legacy-system",
  "cascade": true
}
```

Required: `id`. Optional: `cascade` (default: true, removes related relationships and view references).

### deleteRelationship

```json
{
  "op": "deleteRelationship",
  "id": "rel-old-connection"
}
```

Required: `id`.

### setProperty

```json
{
  "op": "setProperty",
  "id": "ac-portal",
  "key": "lifecycle-status",
  "value": "Production"
}
```

Required: `id`, `key`, `value`.

### createView

```json
{
  "op": "createView",
  "name": "Application Landscape",
  "tempId": "v-app-landscape",
  "viewpoint": "application_cooperation",
  "documentation": "Overview of all application components"
}
```

Required: `name`. Optional: `tempId`, `viewpoint`, `documentation`, `allowDuplicate`.

By default, creating a view with a name that already exists returns 409 Conflict. Set `allowDuplicate: true` to permit duplicate names.

### addToView

```json
{
  "op": "addToView",
  "viewId": "v-app-landscape",
  "elementId": "ac-portal",
  "x": 100,
  "y": 200,
  "width": 120,
  "height": 55,
  "tempId": "vis-portal"
}
```

Required: `viewId`, `elementId`. Optional: `x`, `y`, `width`, `height`, `tempId`.

When using `--layout`, position values are overwritten by the layout engine, so they can be omitted.

### addConnectionToView

```json
{
  "op": "addConnectionToView",
  "viewId": "v-app-landscape",
  "relationshipId": "rel-portal-serves-customer",
  "sourceVisualId": "vis-portal",
  "targetVisualId": "vis-customer"
}
```

Required: `viewId`, `relationshipId`. Optional: `sourceVisualId`, `targetVisualId`, `autoResolveVisuals`.

- `sourceVisualId` and `targetVisualId` are the visual object IDs (tempIds) returned from `addToView` operations
- Both source and target elements of the relationship must already be in the view (via addToView)
- The visual IDs must correspond to the source and target of the relationship concept
- When `autoResolveVisuals: true`, the server automatically finds visual objects by matching the relationship's source/target elements against visuals in the view. This eliminates the need for explicit `sourceVisualId`/`targetVisualId`:

```json
{
  "op": "addConnectionToView",
  "viewId": "v-app-landscape",
  "relationshipId": "rel-portal-serves-customer",
  "autoResolveVisuals": true
}
```

The result includes `autoResolved: true` when server-side resolution was used.

### deleteConnectionFromView

```json
{
  "op": "deleteConnectionFromView",
  "viewId": "v-app-landscape",
  "connectionId": "id-of-connection"
}
```

Required: `viewId`, `connectionId` (the visual connection ID, not the relationship concept ID).

### moveViewObject

```json
{
  "op": "moveViewObject",
  "viewId": "v-app-landscape",
  "viewObjectId": "vis-portal",
  "x": 300,
  "y": 100
}
```

Required: `viewId`, `viewObjectId`, `x`, `y`.

### styleViewObject

```json
{
  "op": "styleViewObject",
  "viewId": "v-app-landscape",
  "viewObjectId": "vis-portal",
  "fillColor": "#E3F2FD",
  "lineColor": "#1565C0",
  "fontColor": "#0D47A1",
  "opacity": 255,
  "lineWidth": 2,
  "fontName": "Arial",
  "fontSize": 10
}
```

Required: `viewId`, `viewObjectId`. All style fields are optional.

### styleConnection

```json
{
  "op": "styleConnection",
  "viewId": "v-app-landscape",
  "connectionId": "id-of-connection",
  "lineColor": "#757575",
  "fontColor": "#424242",
  "lineWidth": 1
}
```

Required: `viewId`, `connectionId`. All style fields are optional.

### createNote

```json
{
  "op": "createNote",
  "viewId": "v-app-landscape",
  "content": "External-facing systems",
  "x": 10,
  "y": 10,
  "width": 200,
  "height": 60,
  "tempId": "note-external"
}
```

Required: `viewId`, `content`. Optional: `x`, `y`, `width`, `height`, `tempId`.

### createGroup

```json
{
  "op": "createGroup",
  "viewId": "v-app-landscape",
  "name": "Customer Domain",
  "x": 0,
  "y": 0,
  "width": 500,
  "height": 400,
  "tempId": "grp-customer"
}
```

Required: `viewId`, `name`. Optional: `x`, `y`, `width`, `height`, `tempId`.

### deleteView

```json
{
  "op": "deleteView",
  "viewId": "v-old-view"
}
```

Required: `viewId`.

### createFolder

```json
{
  "op": "createFolder",
  "name": "Customer Domain",
  "parentType": "application",
  "tempId": "fld-customer"
}
```

Required: `name`, plus one of `parentId` or `parentType`.

`parentType` values: `strategy`, `business`, `application`, `technology`, `motivation`, `implementation`, `other`, `relations`, `views`.

### moveToFolder

```json
{
  "op": "moveToFolder",
  "id": "ac-portal",
  "folderId": "fld-customer"
}
```

Required: `id`, `folderId`.

## Complete Examples

### Example 1: Application Landscape with Services

```json
{
  "version": "1.0",
  "description": "Application landscape showing key systems and integrations",
  "changes": [
    { "op": "createElement", "type": "application-component", "name": "CRM System", "tempId": "ac-crm",
      "documentation": "Customer relationship management platform" },
    { "op": "createElement", "type": "application-component", "name": "Order Management", "tempId": "ac-orders",
      "documentation": "Order processing and fulfillment system" },
    { "op": "createElement", "type": "application-component", "name": "Payment Gateway", "tempId": "ac-payment",
      "documentation": "Third-party payment processing integration" },

    { "op": "createElement", "type": "application-service", "name": "Customer Data Service", "tempId": "as-custdata" },
    { "op": "createElement", "type": "application-service", "name": "Order Processing", "tempId": "as-orderproc" },

    { "op": "createRelationship", "type": "realization-relationship",
      "sourceId": "ac-crm", "targetId": "as-custdata", "tempId": "rel-crm-realizes-custdata" },
    { "op": "createRelationship", "type": "realization-relationship",
      "sourceId": "ac-orders", "targetId": "as-orderproc", "tempId": "rel-orders-realizes-orderproc" },
    { "op": "createRelationship", "type": "serving-relationship",
      "sourceId": "as-custdata", "targetId": "ac-orders", "tempId": "rel-custdata-serves-orders" },
    { "op": "createRelationship", "type": "flow-relationship",
      "sourceId": "ac-orders", "targetId": "ac-payment", "tempId": "rel-orders-flow-payment",
      "name": "Payment Request" },

    { "op": "createView", "name": "Application Landscape", "viewpoint": "application_cooperation",
      "tempId": "v-applandscape" },

    { "op": "addToView", "viewId": "v-applandscape", "elementId": "ac-crm", "tempId": "vis-crm" },
    { "op": "addToView", "viewId": "v-applandscape", "elementId": "ac-orders", "tempId": "vis-orders" },
    { "op": "addToView", "viewId": "v-applandscape", "elementId": "ac-payment", "tempId": "vis-payment" },
    { "op": "addToView", "viewId": "v-applandscape", "elementId": "as-custdata", "tempId": "vis-custdata" },
    { "op": "addToView", "viewId": "v-applandscape", "elementId": "as-orderproc", "tempId": "vis-orderproc" },

    { "op": "addConnectionToView", "viewId": "v-applandscape", "relationshipId": "rel-crm-realizes-custdata",
      "sourceVisualId": "vis-crm", "targetVisualId": "vis-custdata" },
    { "op": "addConnectionToView", "viewId": "v-applandscape", "relationshipId": "rel-orders-realizes-orderproc",
      "sourceVisualId": "vis-orders", "targetVisualId": "vis-orderproc" },
    { "op": "addConnectionToView", "viewId": "v-applandscape", "relationshipId": "rel-custdata-serves-orders",
      "sourceVisualId": "vis-custdata", "targetVisualId": "vis-orders" },
    { "op": "addConnectionToView", "viewId": "v-applandscape", "relationshipId": "rel-orders-flow-payment",
      "sourceVisualId": "vis-orders", "targetVisualId": "vis-payment" }
  ]
}
```

Apply: `archicli batch apply app-landscape.json --layout`

### Example 2: Layered Architecture (Business-Application-Technology)

```json
{
  "version": "1.0",
  "description": "Cross-layer service realization from business through technology",
  "changes": [
    { "op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "ba-customer" },
    { "op": "createElement", "type": "business-service", "name": "Order Placement", "tempId": "bs-orderplace" },
    { "op": "createElement", "type": "business-process", "name": "Handle Order", "tempId": "bp-handleorder" },
    { "op": "createElement", "type": "business-role", "name": "Sales Representative", "tempId": "br-salesrep" },

    { "op": "createElement", "type": "application-service", "name": "Online Ordering", "tempId": "as-online" },
    { "op": "createElement", "type": "application-component", "name": "E-Commerce Platform", "tempId": "ac-ecommerce" },

    { "op": "createElement", "type": "technology-service", "name": "Hosting Service", "tempId": "ts-hosting" },
    { "op": "createElement", "type": "node", "name": "Cloud Server", "tempId": "nd-cloud" },

    { "op": "createRelationship", "type": "serving-relationship",
      "sourceId": "bs-orderplace", "targetId": "ba-customer", "tempId": "rel-bs-serves-ba" },
    { "op": "createRelationship", "type": "realization-relationship",
      "sourceId": "bp-handleorder", "targetId": "bs-orderplace", "tempId": "rel-bp-realizes-bs" },
    { "op": "createRelationship", "type": "assignment-relationship",
      "sourceId": "br-salesrep", "targetId": "bp-handleorder", "tempId": "rel-br-assigned-bp" },
    { "op": "createRelationship", "type": "serving-relationship",
      "sourceId": "as-online", "targetId": "bp-handleorder", "tempId": "rel-as-serves-bp" },
    { "op": "createRelationship", "type": "realization-relationship",
      "sourceId": "ac-ecommerce", "targetId": "as-online", "tempId": "rel-ac-realizes-as" },
    { "op": "createRelationship", "type": "serving-relationship",
      "sourceId": "ts-hosting", "targetId": "ac-ecommerce", "tempId": "rel-ts-serves-ac" },
    { "op": "createRelationship", "type": "realization-relationship",
      "sourceId": "nd-cloud", "targetId": "ts-hosting", "tempId": "rel-nd-realizes-ts" },

    { "op": "createView", "name": "Service Realization", "viewpoint": "layered", "tempId": "v-layered" },

    { "op": "addToView", "viewId": "v-layered", "elementId": "ba-customer", "tempId": "vis-customer" },
    { "op": "addToView", "viewId": "v-layered", "elementId": "bs-orderplace", "tempId": "vis-orderplace" },
    { "op": "addToView", "viewId": "v-layered", "elementId": "bp-handleorder", "tempId": "vis-handleorder" },
    { "op": "addToView", "viewId": "v-layered", "elementId": "br-salesrep", "tempId": "vis-salesrep" },
    { "op": "addToView", "viewId": "v-layered", "elementId": "as-online", "tempId": "vis-online" },
    { "op": "addToView", "viewId": "v-layered", "elementId": "ac-ecommerce", "tempId": "vis-ecommerce" },
    { "op": "addToView", "viewId": "v-layered", "elementId": "ts-hosting", "tempId": "vis-hosting" },
    { "op": "addToView", "viewId": "v-layered", "elementId": "nd-cloud", "tempId": "vis-cloud" },

    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "rel-bs-serves-ba",
      "sourceVisualId": "vis-orderplace", "targetVisualId": "vis-customer" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "rel-bp-realizes-bs",
      "sourceVisualId": "vis-handleorder", "targetVisualId": "vis-orderplace" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "rel-br-assigned-bp",
      "sourceVisualId": "vis-salesrep", "targetVisualId": "vis-handleorder" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "rel-as-serves-bp",
      "sourceVisualId": "vis-online", "targetVisualId": "vis-handleorder" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "rel-ac-realizes-as",
      "sourceVisualId": "vis-ecommerce", "targetVisualId": "vis-online" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "rel-ts-serves-ac",
      "sourceVisualId": "vis-hosting", "targetVisualId": "vis-ecommerce" },
    { "op": "addConnectionToView", "viewId": "v-layered", "relationshipId": "rel-nd-realizes-ts",
      "sourceVisualId": "vis-cloud", "targetVisualId": "vis-hosting" }
  ]
}
```

### Example 3: Capability Map with Heat Mapping

```json
{
  "version": "1.0",
  "description": "Strategy-layer capability map with maturity color coding",
  "changes": [
    { "op": "createElement", "type": "capability", "name": "Customer Management", "tempId": "cap-custmgmt" },
    { "op": "createElement", "type": "capability", "name": "Customer Acquisition", "tempId": "cap-custacq" },
    { "op": "createElement", "type": "capability", "name": "Customer Retention", "tempId": "cap-custret" },
    { "op": "createElement", "type": "capability", "name": "Customer Analytics", "tempId": "cap-custanal" },

    { "op": "createRelationship", "type": "composition-relationship",
      "sourceId": "cap-custmgmt", "targetId": "cap-custacq", "tempId": "rel-comp-acq" },
    { "op": "createRelationship", "type": "composition-relationship",
      "sourceId": "cap-custmgmt", "targetId": "cap-custret", "tempId": "rel-comp-ret" },
    { "op": "createRelationship", "type": "composition-relationship",
      "sourceId": "cap-custmgmt", "targetId": "cap-custanal", "tempId": "rel-comp-anal" },

    { "op": "setProperty", "id": "cap-custacq", "key": "maturity", "value": "Mature" },
    { "op": "setProperty", "id": "cap-custret", "key": "maturity", "value": "Developing" },
    { "op": "setProperty", "id": "cap-custanal", "key": "maturity", "value": "Gap" },

    { "op": "createView", "name": "Capability Map", "viewpoint": "capability", "tempId": "v-capmap" },

    { "op": "addToView", "viewId": "v-capmap", "elementId": "cap-custmgmt", "tempId": "vis-custmgmt" },
    { "op": "addToView", "viewId": "v-capmap", "elementId": "cap-custacq", "tempId": "vis-custacq" },
    { "op": "addToView", "viewId": "v-capmap", "elementId": "cap-custret", "tempId": "vis-custret" },
    { "op": "addToView", "viewId": "v-capmap", "elementId": "cap-custanal", "tempId": "vis-custanal" },

    { "op": "addConnectionToView", "viewId": "v-capmap", "relationshipId": "rel-comp-acq",
      "sourceVisualId": "vis-custmgmt", "targetVisualId": "vis-custacq" },
    { "op": "addConnectionToView", "viewId": "v-capmap", "relationshipId": "rel-comp-ret",
      "sourceVisualId": "vis-custmgmt", "targetVisualId": "vis-custret" },
    { "op": "addConnectionToView", "viewId": "v-capmap", "relationshipId": "rel-comp-anal",
      "sourceVisualId": "vis-custmgmt", "targetVisualId": "vis-custanal" },

    { "op": "styleViewObject", "viewId": "v-capmap", "viewObjectId": "vis-custacq",
      "fillColor": "#C8E6C9" },
    { "op": "styleViewObject", "viewId": "v-capmap", "viewObjectId": "vis-custret",
      "fillColor": "#FFF9C4" },
    { "op": "styleViewObject", "viewId": "v-capmap", "viewObjectId": "vis-custanal",
      "fillColor": "#FFCDD2" }
  ]
}
```

## Multi-BOM Composition

### Referencing Previous BOM Results

After running `archicli batch apply 01-elements.json`, a file `01-elements.ids.json` is created containing the tempId-to-realId mappings. Subsequent BOMs can reference those:

```json
{
  "version": "1.0",
  "description": "Views that reference elements from 01-elements.json",
  "idFiles": ["01-elements.ids.json"],
  "changes": [
    { "op": "createView", "name": "Overview", "tempId": "v-overview" },
    { "op": "addToView", "viewId": "v-overview", "elementId": "ac-crm", "tempId": "vis-crm" }
  ]
}
```

### Using Includes

BOMs can compose other BOMs:

```json
{
  "version": "1.0",
  "description": "Master BOM composing all layers",
  "includes": [
    "01-business-elements.json",
    "02-application-elements.json",
    "03-relationships.json",
    "04-views.json"
  ]
}
```

Included files are flattened into a single operation list in order.

### Complete Multi-BOM Workflow Example

**Step 1: Create elements** (`01-elements.json`)
```json
{
  "version": "1.0",
  "description": "Core elements",
  "changes": [
    { "op": "createElement", "type": "application-component", "name": "CRM", "tempId": "ac-crm" },
    { "op": "createElement", "type": "application-component", "name": "ERP", "tempId": "ac-erp" },
    { "op": "createRelationship", "type": "flow-relationship", "sourceId": "ac-crm", "targetId": "ac-erp",
      "name": "customer data", "tempId": "rel-flow" }
  ]
}
```

Apply: `archicli batch apply 01-elements.json`
Result: Creates `01-elements.ids.json` with real IDs.

**Step 2: Create views** (`02-views.json`)
```json
{
  "version": "1.0",
  "description": "Application landscape view",
  "idFiles": ["01-elements.ids.json"],
  "changes": [
    { "op": "createView", "name": "Application Landscape", "viewpoint": "application_cooperation", "tempId": "v-apps" },
    { "op": "addToView", "viewId": "v-apps", "elementId": "ac-crm", "tempId": "vis-crm" },
    { "op": "addToView", "viewId": "v-apps", "elementId": "ac-erp", "tempId": "vis-erp" },
    { "op": "addConnectionToView", "viewId": "v-apps", "relationshipId": "rel-flow",
      "sourceVisualId": "vis-crm", "targetVisualId": "vis-erp" }
  ]
}
```

Apply: `archicli batch apply 02-views.json --layout`

Note: `ac-crm`, `ac-erp`, and `rel-flow` are resolved from `01-elements.ids.json`.
