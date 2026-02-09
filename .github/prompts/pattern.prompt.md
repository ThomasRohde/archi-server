---
name: pattern
description: Look up ArchiMate patterns for specific architecture scenarios — and instantiate them in Archi
argument-hint: "[architecture type, e.g., microservices, cloud, API gateway]"
tools: ['runInTerminal', 'terminalLastCommand', 'codebase']
agent: agent
---

# ArchiMate Pattern Lookup & Instantiation

Help the user find the right ArchiMate pattern for their architecture scenario, then create it in Archi.

The **archi-server-api** skill (in `.claude/skills/archi-server-api/`) has full API execution details. The **archimate-patterns** skill (in `.claude/skills/archimate-patterns/`) has pattern knowledge and executable templates.

## Process

1. Identify the architecture pattern from the user's query
2. Present the pattern with element mappings, relationship patterns, and notation examples
3. **Instantiate the pattern in Archi** — create all elements, relationships, and a view

## Pattern Instantiation Workflow

### Step 1: Health Check
```bash
curl -s http://localhost:8765/health
```

### Step 2: Search for Existing Elements
```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"namePattern": "PATTERN_SPECIFIC_SEARCH", "limit": 50}'
```

### Step 3: Create All Elements + Relationships in One Batch
Use the single-batch optimization — `createRelationship` can reference `tempId` from `createElement` in the same batch.

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createElement", "type": "...", "name": "...", "tempId": "p-e1"},
    {"op": "createElement", "type": "...", "name": "...", "tempId": "p-e2"},
    {"op": "createRelationship", "type": "...", "sourceId": "p-e1", "targetId": "p-e2", "tempId": "p-r1"}
  ]}'
```

### Step 4: Poll, Create View, Populate, Layout

```bash
# Poll for IDs
curl -s "http://localhost:8765/ops/status?opId=OP_ID"

# Create view
curl -s -X POST http://localhost:8765/views \
  -H "Content-Type: application/json" \
  -d '{"name": "PATTERN_NAME Architecture", "documentation": "Generated from PATTERN template"}'

# Add elements to view (use real IDs from poll)
# For compound elements, nest children with parentVisualId:
# {"op": "addToView", ..., "parentVisualId": "v-parent"}
# Or reparent later: {"op": "nestInView", "viewId": "...", "visualId": "...", "parentVisualId": "..."}
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [{"op": "addToView", "viewId": "VIEW_ID", "elementId": "REAL_ID", "tempId": "v1"}, ...]}'

# Poll for visual IDs
curl -s "http://localhost:8765/ops/status?opId=OP_ID_2"

# Add connections (use visual IDs, NOT concept IDs)
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [{"op": "addConnectionToView", "viewId": "VIEW_ID", "relationshipId": "REL_ID", "sourceVisualId": "VIS_ID_1", "targetVisualId": "VIS_ID_2"}, ...]}'

# Auto-layout
curl -s -X POST http://localhost:8765/views/VIEW_ID/layout \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "dagre", "options": {"rankdir": "TB", "nodesep": 60, "ranksep": 80}}'

# Save
curl -s -X POST http://localhost:8765/model/save
```

### Step 5: Report Results
List all created elements, relationships, and the view name.

## Common Patterns Quick Reference

### Microservices
**Elements**: Application Components (services), Application Interfaces (APIs), Application Events, Artifacts (containers), Nodes (K8s cluster)

```
[Application Component: Service Name] → [realizes] → [Application Service: Capability]
    → [composition] → [Application Function: Internal Behavior]
    → [serves] → [Application Interface: API]
```

### API Gateway
```
[Technology Node: API Gateway]
    → [realization] → [Technology Service: API Management]
    → [serves] → [Application Component: Backend]
```

### Event-Driven
```
[Application Component: Producer] → [triggers] → [Application Event: Event Name]
[Application Event] → [flow] → [Application Component: Consumer]
```

### Capability Mapping
```
[Capability] → [realized by] → [Business Process]
[Capability] → [realized by] → [Application Component]
```

### Value Stream
```
[Value Stream] → [composition] → [Value Stream Stage]
[Value Stream Stage] ← [served by] ← [Capability]
```

### Cross-Layer (Business → Application → Technology)
Full layered pattern with realization chains connecting Business to Application to Technology.

## Output

Present patterns as notation format + textual description, then **execute the pattern creation** in Archi unless the user explicitly asks not to.
