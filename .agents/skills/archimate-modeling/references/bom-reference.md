# BOM (Bill of Materials) Reference

## Table of Contents

- [BOM Structure](#bom-structure)
- [Operation Catalog](#operation-catalog)
- [Element and Relationship Types](#element-and-relationship-types)
- [Viewpoints and Folder Types](#viewpoints-and-folder-types)
- [Semantic Rules and Runtime Behavior](#semantic-rules-and-runtime-behavior)
- [Examples](#examples)

## BOM Structure

Minimal BOM (one of `changes`, `includes`, or `idFiles` is required):

```json
{
  "version": "1.0",
  "description": "Human-readable description",
  "changes": [],
  "includes": ["other-bom.json"],
  "idFiles": ["previous.ids.json"]
}
```

Rules:

- `version`: required, must be `"1.0"`
- `changes`: inline operation array
- `includes`: BOM composition file list (resolved relative to current BOM)
- `idFiles`: tempId mapping files (resolved relative to current BOM)
- Unknown top-level fields are rejected

A BOM with only `idFiles` is schema-valid and useful for preloading mappings.

## Operation Catalog

Each entry in `changes` must contain an `op` field and match the required/optional fields below.

### createElement

Required: `type`, `name`

Optional: `tempId`, `documentation`, `folder`

```json
{
  "op": "createElement",
  "type": "application-component",
  "name": "Customer Portal",
  "tempId": "ac-portal",
  "documentation": "Web self-service frontend"
}
```

### createRelationship

Required: `type`, `sourceId`, `targetId`

Optional: `tempId`, `name`, `documentation`, `accessType`, `strength`

```json
{
  "op": "createRelationship",
  "type": "serving-relationship",
  "sourceId": "as-customer-service",
  "targetId": "bp-handle-order",
  "tempId": "rel-serves"
}
```

For `access-relationship`, use integer `accessType`:

- `0`: write
- `1`: read
- `2`: access
- `3`: readwrite

For `influence-relationship`, optionally set `strength` (for example `+`, `-`, `++`, `--`).

### updateElement

Required: `id` and at least one of `name`, `documentation`, `properties`

```json
{
  "op": "updateElement",
  "id": "ac-portal",
  "name": "Customer Self-Service Portal",
  "properties": {
    "owner": "Digital Team"
  }
}
```

### updateRelationship

Required: `id` and at least one of `name`, `documentation`, `properties`

```json
{
  "op": "updateRelationship",
  "id": "rel-serves",
  "documentation": "Primary service path"
}
```

### deleteElement

Required: `id`

Optional: `cascade`

```json
{
  "op": "deleteElement",
  "id": "ac-legacy",
  "cascade": true
}
```

### deleteRelationship

Required: `id`

```json
{
  "op": "deleteRelationship",
  "id": "rel-obsolete"
}
```

### setProperty

Required: `id`, `key`, `value`

```json
{
  "op": "setProperty",
  "id": "ac-portal",
  "key": "lifecycle-status",
  "value": "Production"
}
```

### createFolder

Required: `name` and one of `parentId` or `parentType`

Optional: `tempId`

```json
{
  "op": "createFolder",
  "name": "Customer Domain",
  "parentType": "application",
  "tempId": "fld-customer"
}
```

### moveToFolder

Required: `id`, `folderId`

```json
{
  "op": "moveToFolder",
  "id": "ac-portal",
  "folderId": "fld-customer"
}
```

### createView

Required: `name`

Optional: `tempId`, `documentation`, `viewpoint`

```json
{
  "op": "createView",
  "name": "Application Landscape",
  "tempId": "v-apps",
  "viewpoint": "application_cooperation"
}
```

### deleteView

Required: `viewId`

```json
{
  "op": "deleteView",
  "viewId": "id-view-old"
}
```

### addToView

Required: `viewId`, `elementId`

Optional: `tempId`, `parentVisualId`, `x`, `y`, `width`, `height`, `autoNest`

```json
{
  "op": "addToView",
  "viewId": "v-apps",
  "elementId": "ac-portal",
  "tempId": "vis-portal",
  "x": 100,
  "y": 180
}
```

### nestInView

Required: `viewId`, `visualId`, `parentVisualId`

Optional: `x`, `y`

```json
{
  "op": "nestInView",
  "viewId": "v-apps",
  "visualId": "vis-service",
  "parentVisualId": "vis-portal",
  "x": 12,
  "y": 10
}
```

### addConnectionToView

Required: `viewId`, `relationshipId`

Optional: `sourceVisualId`, `targetVisualId`, `autoResolveVisuals`, `tempId`

```json
{
  "op": "addConnectionToView",
  "viewId": "v-apps",
  "relationshipId": "rel-serves",
  "sourceVisualId": "vis-service",
  "targetVisualId": "vis-process",
  "tempId": "conn-serves"
}
```

Auto-resolution variant:

```json
{
  "op": "addConnectionToView",
  "viewId": "v-apps",
  "relationshipId": "rel-serves",
  "autoResolveVisuals": true
}
```

### deleteConnectionFromView

Required: `viewId`, `connectionId`

```json
{
  "op": "deleteConnectionFromView",
  "viewId": "v-apps",
  "connectionId": "conn-serves"
}
```

### moveViewObject

Required: `viewObjectId` and at least one of `x`, `y`, `width`, `height`

```json
{
  "op": "moveViewObject",
  "viewObjectId": "vis-portal",
  "x": 240,
  "y": 120
}
```

### styleViewObject

Required: `viewObjectId`

Optional: `fillColor`, `fontColor`, `fontStyle`, `lineColor`, `lineWidth`, `opacity`, `textAlignment`, `textPosition`, `font`

```json
{
  "op": "styleViewObject",
  "viewObjectId": "vis-portal",
  "fillColor": "#E3F2FD",
  "lineColor": "#1565C0",
  "fontColor": "#0D47A1",
  "lineWidth": 2,
  "font": "Arial-10"
}
```

### styleConnection

Required: `connectionId`

Optional: `lineColor`, `lineWidth`, `font`, `fontColor`, `fontStyle`, `textPosition`

```json
{
  "op": "styleConnection",
  "connectionId": "conn-serves",
  "lineColor": "#757575",
  "lineWidth": 1
}
```

### createNote

Required: `viewId`, `content`

Optional: `tempId`, `x`, `y`, `width`, `height`

```json
{
  "op": "createNote",
  "viewId": "v-apps",
  "content": "External-facing systems",
  "tempId": "note-external",
  "x": 20,
  "y": 20,
  "width": 220,
  "height": 60
}
```

### createGroup

Required: `viewId`, `name`

Optional: `tempId`, `documentation`, `x`, `y`, `width`, `height`

```json
{
  "op": "createGroup",
  "viewId": "v-apps",
  "name": "Customer Domain",
  "tempId": "grp-customer",
  "x": 0,
  "y": 0,
  "width": 500,
  "height": 320
}
```

## Element and Relationship Types

### Element types

- Strategy: `resource`, `capability`, `value-stream`, `course-of-action`
- Business: `business-actor`, `business-role`, `business-collaboration`, `business-interface`, `business-process`, `business-function`, `business-interaction`, `business-event`, `business-service`, `business-object`, `contract`, `representation`, `product`
- Application: `application-component`, `application-collaboration`, `application-interface`, `application-function`, `application-interaction`, `application-process`, `application-event`, `application-service`, `data-object`
- Technology: `node`, `device`, `system-software`, `technology-collaboration`, `technology-interface`, `path`, `communication-network`, `technology-function`, `technology-process`, `technology-interaction`, `technology-event`, `technology-service`, `artifact`
- Physical: `equipment`, `facility`, `distribution-network`, `material`
- Motivation: `stakeholder`, `driver`, `assessment`, `goal`, `outcome`, `principle`, `requirement`, `constraint`, `meaning`, `value`
- Implementation and migration: `work-package`, `deliverable`, `implementation-event`, `plateau`, `gap`
- Other: `location`, `grouping`, `junction`

### Relationship types

- `composition-relationship`
- `aggregation-relationship`
- `assignment-relationship`
- `realization-relationship`
- `serving-relationship`
- `access-relationship`
- `influence-relationship`
- `triggering-relationship`
- `flow-relationship`
- `specialization-relationship`
- `association-relationship`

## Viewpoints and Folder Types

### Common viewpoints

- Strategy: `strategy`, `capability`, `value_stream`, `outcome_realization`
- Business: `organization`, `business_process_cooperation`, `product`
- Application: `application_cooperation`, `application_usage`, `information_structure`
- Technology: `technology`, `technology_usage`, `physical`
- Cross-layer: `layered`, `implementation_and_deployment`, `service_realization`
- Motivation: `motivation`, `goal_realization`, `requirements_realization`
- Migration: `implementation_and_migration`, `migration`, `project`

### Folder `parentType` values

- `strategy`
- `business`
- `application`
- `technology`
- `motivation`
- `implementation`
- `other`
- `relations`
- `views`

## Semantic Rules and Runtime Behavior

- Operations are executed in order; forward references fail semantic preflight.
- Visual fields (`sourceVisualId`, `targetVisualId`, `viewObjectId`, `connectionId`, `visualId`, `parentVisualId`) must reference visual tempIds/IDs, not concept tempIds.
- `--resolve-names` can resolve unresolved concept tempIds by exact name, but cannot resolve visual IDs.
- Declared `idFiles` are loaded before apply/semantic checks; missing/malformed files fail by default.
- Use `--allow-incomplete-idfiles` to continue despite missing/malformed idFiles.
- Empty BOMs fail `batch apply` by default; use `--allow-empty` to permit no-op runs.
- `batch apply` polls by default; `--poll` is a deprecated no-op alias.

## Examples

### Example A: Minimal model + view using autoResolveVisuals

```json
{
  "version": "1.0",
  "description": "Simple service relationship with one view",
  "changes": [
    {
      "op": "createElement",
      "type": "application-component",
      "name": "Order App",
      "tempId": "ac-order"
    },
    {
      "op": "createElement",
      "type": "application-service",
      "name": "Order Service",
      "tempId": "as-order"
    },
    {
      "op": "createRelationship",
      "type": "realization-relationship",
      "sourceId": "ac-order",
      "targetId": "as-order",
      "tempId": "rel-realizes"
    },
    {
      "op": "createView",
      "name": "Application Overview",
      "viewpoint": "application_cooperation",
      "tempId": "v-app"
    },
    {
      "op": "addToView",
      "viewId": "v-app",
      "elementId": "ac-order",
      "tempId": "vis-order"
    },
    {
      "op": "addToView",
      "viewId": "v-app",
      "elementId": "as-order",
      "tempId": "vis-service"
    },
    {
      "op": "addConnectionToView",
      "viewId": "v-app",
      "relationshipId": "rel-realizes",
      "autoResolveVisuals": true,
      "tempId": "conn-realizes"
    }
  ]
}
```

Apply:

```bash
archicli verify app.json --semantic
archicli batch apply app.json --layout
```

### Example B: Multi-BOM chaining with idFiles

`01-elements.json`:

```json
{
  "version": "1.0",
  "changes": [
    {
      "op": "createElement",
      "type": "application-component",
      "name": "CRM",
      "tempId": "ac-crm"
    },
    {
      "op": "createElement",
      "type": "application-component",
      "name": "ERP",
      "tempId": "ac-erp"
    }
  ]
}
```

`02-relationships.json`:

```json
{
  "version": "1.0",
  "idFiles": ["01-elements.ids.json"],
  "changes": [
    {
      "op": "createRelationship",
      "type": "flow-relationship",
      "sourceId": "ac-crm",
      "targetId": "ac-erp",
      "name": "customer data",
      "tempId": "rel-crm-erp"
    }
  ]
}
```

`03-views.json`:

```json
{
  "version": "1.0",
  "idFiles": ["01-elements.ids.json", "02-relationships.ids.json"],
  "changes": [
    {
      "op": "createView",
      "name": "Application Landscape",
      "viewpoint": "application_cooperation",
      "tempId": "v-apps"
    },
    {
      "op": "addToView",
      "viewId": "v-apps",
      "elementId": "ac-crm",
      "tempId": "vis-crm"
    },
    {
      "op": "addToView",
      "viewId": "v-apps",
      "elementId": "ac-erp",
      "tempId": "vis-erp"
    },
    {
      "op": "addConnectionToView",
      "viewId": "v-apps",
      "relationshipId": "rel-crm-erp",
      "sourceVisualId": "vis-crm",
      "targetVisualId": "vis-erp"
    }
  ]
}
```

Execution:

```bash
archicli batch apply 01-elements.json
archicli batch apply 02-relationships.json
archicli batch apply 03-views.json --layout
```
