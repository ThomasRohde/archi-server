---
name: pattern
description: Look up ArchiMate patterns for specific architecture scenarios — and optionally instantiate them in Archi
argument-hint: "[architecture type, e.g., microservices, cloud, API gateway]"
allowed-tools:
  - Read
  - Bash
---

# ArchiMate Pattern Lookup & Instantiation

Help the user find the right ArchiMate pattern for their architecture scenario, then create it in Archi.

Load the **archi-server-api** skill for API execution details and the **archimate-patterns** skill for pattern knowledge.

## Process

1. Identify the architecture pattern from the user's query
2. Load the archimate-patterns skill if needed for detailed patterns
3. Present the pattern with:
   - Element mappings (what ArchiMate elements to use)
   - Relationship patterns (how to connect them)
   - Notation examples
4. **Instantiate the pattern in Archi** — offer to create all elements, relationships, and a view

## Pattern Instantiation Workflow

After presenting the pattern, execute it:

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

# Add elements to view (use real IDs)
# For compound elements, use parentVisualId to nest children:
# {"op": "addToView", ..., "parentVisualId": "v-parent"}
# Or use nestInView to reparent: {"op": "nestInView", "viewId": "...", "visualId": "...", "parentVisualId": "..."}
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [{"op": "addToView", "viewId": "VIEW_ID", "elementId": "REAL_ID", "tempId": "v1"}, ...]}'

# Poll for visual IDs
curl -s "http://localhost:8765/ops/status?opId=OP_ID_2"

# Add connections (use visual IDs)
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

**tempId convention**: `ms-[service]`, `ms-[service]-api`, `ms-evt-[event]`

```
[Application Component: Service Name] → [realizes] → [Application Service: Capability]
    → [composition] → [Application Function: Internal Behavior]
    → [serves] → [Application Interface: API]
```

### API Gateway

**Elements**: Technology Node (gateway), Technology Service, Application Components (backends)

**tempId convention**: `gw-node`, `gw-svc`, `gw-backend-[n]`

```
[Technology Node: API Gateway]
    → [realization] → [Technology Service: API Management]
    → [serves] → [Application Component: Backend]
```

### Event-Driven

**Elements**: Application Components (producers/consumers), Application Events

**tempId convention**: `ed-producer-[n]`, `ed-consumer-[n]`, `ed-evt-[name]`

```
[Application Component: Producer] → [triggers] → [Application Event: Event Name]
[Application Event] → [flow] → [Application Component: Consumer]
```

### Cloud (IaaS/PaaS/SaaS)
- IaaS: Technology Service → realizes → Node
- PaaS: Technology Service → serves → Application Component
- SaaS: Application Service → serves → Business Actor

### Capability Mapping

**Elements**: Capabilities, Business Processes, Application Components

**tempId convention**: `cap-[name]`, `cap-proc-[name]`, `cap-app-[name]`

```
[Capability] → [realized by] → [Business Process]
[Capability] → [realized by] → [Application Component]
```

### Value Stream

**Elements**: Value Streams, Capabilities, Outcomes

**tempId convention**: `vs-[name]`, `vs-stage-[n]`, `vs-cap-[name]`

```
[Value Stream] → [composition] → [Value Stream Stage]
[Value Stream Stage] ← [served by] ← [Capability]
```

### Cross-Layer (Business → Application → Technology)

**Elements**: Actors, Roles, Processes, Services, Components, Nodes

**tempId convention**: `b-[name]`, `a-[name]`, `t-[name]`

Full layered pattern with realization chains connecting Business to Application to Technology.

## Pattern Categories

If user asks generally, offer categories:
1. **Application patterns**: Microservices, API, integration, data
2. **Infrastructure patterns**: Cloud, containers, serverless
3. **Strategy patterns**: Capability, value stream, course of action
4. **Security patterns**: IAM, zero-trust, security zones
5. **Industry patterns**: BIAN (banking), FHIR (healthcare), EIRA (government)

## Output Format

Present patterns as both:
1. **Notation format** (for quick reference)
2. **Textual description** (for clarity)

Then **execute the pattern creation** in Archi unless the user explicitly asks not to.
