---
name: archimate-modeling
description: >
  ArchiMate enterprise architecture modeling using the archicli CLI tool.
  Use this skill when creating, modifying, querying, or visualizing ArchiMate models
  programmatically through the Archi Model API Server. Covers: creating elements and
  relationships, building views/diagrams, batch operations via BOM files, model queries,
  searching elements, exporting views, and applying ArchiMate best practices.
  Triggers: ArchiMate, archicli, enterprise architecture modeling, Archi, BOM file,
  creating elements, creating views, application landscape, capability map, layered view.
---

# ArchiMate Modeling with archicli

## Prerequisites

1. **Archi** (5.7+) with jArchi plugin must be running
2. An ArchiMate model must be open with at least one view active
3. "Model API Server" script must be running (Scripts menu)
4. Server listens on `http://127.0.0.1:8765` by default

Always start by verifying connectivity:

```bash
archicli health
```

## Critical Rules

- **NEVER use `--fast`**. Always use the default atomic mode (chunk-size 1) for correctness.
- **Always use `--poll`** with batch apply (it is on by default). Never fire-and-forget.
- **Always verify before apply**: Run `archicli verify <file> --semantic` before `archicli batch apply`.
- **Always use `--layout`** with batch apply when creating views to auto-layout elements.
- **Follow ArchiMate best practices**: See [references/archimate-best-practices.md](references/archimate-best-practices.md) for comprehensive guidance.

## Core Workflow

### Step 1: Understand Current Model State

```bash
# Overview with element counts and samples
archicli model query --limit 20 --show-views --show-relationships

# Find specific elements
archicli model search --type application-component
archicli model search --name ".*Customer.*"
archicli model search --type business-process --name ".*Order.*"

# Get element details including relationships
archicli model element <id>

# List views
archicli view list

# Get view details (elements + connections with visual IDs)
archicli view get <view-id>

# List folders
archicli folder list
```

### Step 2: Author a BOM File

A BOM (Bill of Materials) is a JSON file describing model changes. See [references/bom-reference.md](references/bom-reference.md) for the complete format.

**Minimal BOM structure:**

```json
{
  "version": "1.0",
  "description": "What this BOM does",
  "changes": [
    { "op": "createElement", "type": "application-component", "name": "My App", "tempId": "ac-myapp" }
  ]
}
```

### Step 3: Validate the BOM

```bash
archicli verify my-bom.json --semantic
```

### Step 4: Apply the BOM

```bash
archicli batch apply my-bom.json --layout
```

The `--layout` flag auto-layouts any views created or populated in the BOM.

After apply, tempId mappings are saved to `<file>.ids.json` automatically.

### Step 5: Save the Model

```bash
archicli model save
```

## BOM Authoring Guide

### Operation Ordering

Operations execute sequentially. Order matters:

1. `createElement` / `createRelationship` - create model concepts first
2. `setProperty` - set properties on created elements
3. `createView` - create the view
4. `addToView` - add elements to the view (returns visual IDs)
5. `addConnectionToView` - add relationship connections (needs visual IDs from step 4)

### TempId System

Assign `tempId` strings to create operations. Later operations reference them:

```json
{
  "version": "1.0",
  "changes": [
    { "op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "ba-customer" },
    { "op": "createElement", "type": "business-service", "name": "Order Service", "tempId": "bs-order" },
    { "op": "createRelationship", "type": "serving-relationship", "sourceId": "bs-order", "targetId": "ba-customer", "tempId": "rel-serving" },
    { "op": "createView", "name": "Customer View", "tempId": "v-customer" },
    { "op": "addToView", "viewId": "v-customer", "elementId": "ba-customer", "tempId": "vis-customer" },
    { "op": "addToView", "viewId": "v-customer", "elementId": "bs-order", "tempId": "vis-order" },
    { "op": "addConnectionToView", "viewId": "v-customer", "relationshipId": "rel-serving",
      "sourceVisualId": "vis-order", "targetVisualId": "vis-customer" }
  ]
}
```

**TempId naming conventions:**

| Prefix | Element Type |
|--------|-------------|
| `ba-` | Business Actor |
| `br-` | Business Role |
| `bp-` | Business Process |
| `bf-` | Business Function |
| `bs-` | Business Service |
| `bi-` | Business Interface |
| `bo-` | Business Object |
| `ac-` | Application Component |
| `as-` | Application Service |
| `af-` | Application Function |
| `ai-` | Application Interface |
| `do-` | Data Object |
| `nd-` | Node |
| `dv-` | Device |
| `ss-` | System Software |
| `ts-` | Technology Service |
| `ar-` | Artifact |
| `cn-` | Communication Network |
| `cap-` | Capability |
| `vs-` | Value Stream |
| `res-` | Resource |
| `coa-` | Course of Action |
| `dr-` | Driver |
| `as-` | Assessment |
| `gl-` | Goal |
| `oc-` | Outcome |
| `pr-` | Principle |
| `rq-` | Requirement |
| `ct-` | Constraint |
| `wp-` | Work Package |
| `dl-` | Deliverable |
| `pl-` | Plateau |
| `gp-` | Gap |
| `rel-` | Relationship |
| `v-` | View |
| `vis-` | Visual object (addToView) |
| `note-` | Note |
| `grp-` | Group |
| `fld-` | Folder |

### Multi-BOM Composition

Split complex models into layered BOM files. Each BOM declares `idFiles` to reference tempIds from prior BOMs:

```
model/
  01-business.json          # Business layer elements
  02-application.json       # Application layer (idFiles: ["01-business.ids.json"])
  03-technology.json        # Technology layer (idFiles: ["02-application.ids.json"])
  04-relationships.json     # Cross-layer relationships (idFiles: all previous)
  05-views.json             # Views (idFiles: all previous)
```

### Visual IDs vs Concept IDs

- `createElement` creates a **concept** (model tree element) with a concept ID
- `addToView` places a concept in a **view** and returns a **visual ID** (diagram object)
- `addConnectionToView` requires that both endpoints are already placed in the view
- One concept can appear in multiple views, each with its own visual ID

### Element Types

**Strategy:** `capability`, `value-stream`, `resource`, `course-of-action`

**Business:** `business-actor`, `business-role`, `business-process`, `business-service`, `business-function`, `business-object`, `business-interface`, `business-event`, `business-collaboration`, `business-interaction`, `contract`, `product`, `representation`

**Application:** `application-component`, `application-service`, `application-function`, `application-interface`, `application-event`, `application-process`, `application-interaction`, `application-collaboration`, `data-object`

**Technology:** `node`, `device`, `system-software`, `technology-service`, `technology-interface`, `technology-function`, `technology-process`, `technology-event`, `technology-interaction`, `technology-collaboration`, `artifact`, `communication-network`, `path`

**Motivation:** `stakeholder`, `driver`, `assessment`, `goal`, `outcome`, `principle`, `requirement`, `constraint`, `meaning`, `value`

**Implementation & Migration:** `work-package`, `deliverable`, `plateau`, `gap`, `implementation-event`

**Other:** `grouping`, `location`, `junction`

### Relationship Types

| Type | Usage |
|------|-------|
| `composition-relationship` | Strong whole-part (parts cannot exist independently) |
| `aggregation-relationship` | Weak whole-part (parts may exist independently) |
| `assignment-relationship` | Who/what performs behavior |
| `realization-relationship` | Logical-to-physical mapping |
| `serving-relationship` | Service delivery (arrow toward consumer) |
| `access-relationship` | Data access (use `accessType`: 0=write, 1=read, 2=access, 3=readwrite) |
| `influence-relationship` | Affects motivation elements |
| `association-relationship` | Generic relationship |
| `triggering-relationship` | Temporal/causal precedence |
| `flow-relationship` | Transfer of objects between behaviors |
| `specialization-relationship` | Type hierarchies (same-type elements only) |

### Viewpoints

When creating views, use the `viewpoint` field:

**Strategy:** `strategy`, `capability`, `value_stream`, `outcome_realization`
**Business:** `organization`, `business_process_cooperation`, `product`
**Application:** `application_cooperation`, `application_usage`, `information_structure`
**Technology:** `technology`, `technology_usage`, `physical`
**Cross-layer:** `layered`, `implementation_and_deployment`, `service_realization`
**Motivation:** `motivation`, `goal_realization`, `requirements_realization`
**Migration:** `implementation_and_migration`, `migration`, `project`

## View Operations

### Create a View Directly (Synchronous)

```bash
archicli view create "Application Landscape" --viewpoint application_cooperation
```

### Export Views

```bash
archicli view export <view-id> --format PNG --scale 2
archicli view export --all --dir ./exports
```

### Layout a View

```bash
archicli view layout <view-id> --rankdir LR
```

## Advanced Features

### Styling Elements in Views

```json
{ "op": "styleViewObject", "viewId": "v-main", "viewObjectId": "vis-elem",
  "fillColor": "#E8F5E9", "lineColor": "#2E7D32", "fontColor": "#1B5E20",
  "opacity": 255, "lineWidth": 2 }
```

### Notes and Groups in Views

```json
{ "op": "createNote", "viewId": "v-main", "content": "This area handles...",
  "x": 10, "y": 10, "width": 200, "height": 60, "tempId": "note-info" }
```

```json
{ "op": "createGroup", "viewId": "v-main", "name": "External Systems",
  "x": 0, "y": 0, "width": 400, "height": 300, "tempId": "grp-external" }
```

### Foldering

```json
{ "op": "createFolder", "name": "My Domain", "parentType": "application", "tempId": "fld-domain" },
{ "op": "moveToFolder", "id": "ac-myapp", "folderId": "fld-domain" }
```

### Idempotent Re-Apply

Use `--skip-existing` to safely re-run a BOM:

```bash
archicli batch apply model.json --skip-existing
```

### Error Recovery

```bash
# Check operation status
archicli ops list
archicli ops status <operation-id>

# Continue after partial failure
archicli batch apply model.json --continue-on-error
```

## ArchiMate Best Practices

For comprehensive ArchiMate modeling guidance including layer patterns, relationship rules, naming conventions, viewpoint selection, and anti-patterns, see:

- **[references/archimate-best-practices.md](references/archimate-best-practices.md)** - Full ArchiMate best practices reference

Key principles to always follow:

1. **Respect the layered structure**: Business -> Application -> Technology, with services connecting layers
2. **Choose elements deliberately**: Use the correct element types (Process vs Function, Service vs Process)
3. **Maintain naming conventions**: Structural elements use noun phrases, behavioral use verb phrases
4. **Right-size abstraction**: Target ~20 elements per view (40 max)
5. **Avoid anti-patterns**: No lonely components, no strict layer violations, no god components
6. **Separate actors from roles**: Business Actor is a specific entity; Business Role is a responsibility
7. **Use services for cross-layer integration**: Never connect Business directly to Technology layer
8. **Label flow relationships**: Always label what flows between behaviors

## Common Pitfalls and Solutions

### 1. accessType String vs Integer

**Problem**: Documentation says `"Read"`, `"Write"`, `"ReadWrite"` but schema requires integers.

**Solution**: Use integer values in your BOM:
```json
{
  "op": "createRelationship",
  "type": "access-relationship",
  "sourceId": "bp-process",
  "targetId": "do-customer",
  "accessType": 1
}
```

Access type mapping:
- `0` = Write
- `1` = Read
- `2` = Access (generic, unspecified)
- `3` = ReadWrite

### 2. Resolving sourceVisualId/targetVisualId in addConnectionToView

**Problem**: `addConnectionToView` needs source and target visual objects to draw the connection.

**Solution A** (preferred): Use `autoResolveVisuals: true` — the server automatically matches visuals by element ID:
```json
{ "op": "addToView", "viewId": "v-main", "elementId": "ac-app1", "tempId": "vis-app1" },
{ "op": "addToView", "viewId": "v-main", "elementId": "ac-app2", "tempId": "vis-app2" },
{ "op": "addConnectionToView", "viewId": "v-main", "relationshipId": "rel-serves",
  "autoResolveVisuals": true }
```

**Solution B**: Provide explicit visual IDs from `addToView` operations:
```json
{ "op": "addConnectionToView", "viewId": "v-main", "relationshipId": "rel-serves",
  "sourceVisualId": "vis-app1", "targetVisualId": "vis-app2" }
```

### 3. Realization Relationship Direction

**Problem**: Confusion about which way realization arrows point.

**Solution**: Realization points from concrete to abstract:
- Artifact realizes Component (NOT Component realizes Artifact)
- Component realizes Service (NOT Service realizes Component)
- Process realizes Service (NOT Service realizes Process)

Correct pattern:
```json
{ "op": "createRelationship", "type": "realization-relationship",
  "sourceId": "ac-component", "targetId": "as-service" }
```

Think: "Component realizes (implements) the Service"

### 4. Adding Connections Before Elements

**Problem**: Trying to add connections to a view before the endpoint elements are in the view.

**Solution**: Always follow this order:
1. Create elements (createElement)
2. Create relationships (createRelationship)
3. Create view (createView)
4. Add elements to view (addToView) - capture visual IDs
5. Add connections to view (addConnectionToView) - use visual IDs

### 5. Forgetting to Declare idFiles for Multi-BOM Workflows

**Problem**: Second BOM can't resolve tempIds from first BOM.

**Solution**: Reference the `.ids.json` file from the first BOM:
```json
{
  "version": "1.0",
  "description": "Views referencing elements from 01-elements.json",
  "idFiles": ["01-elements.ids.json"],
  "changes": [
    { "op": "createView", "name": "Overview", "tempId": "v-overview" },
    { "op": "addToView", "viewId": "v-overview", "elementId": "ac-app1", "tempId": "vis-app1" }
  ]
}
```

The `ac-app1` ID is resolved from `01-elements.ids.json`.
