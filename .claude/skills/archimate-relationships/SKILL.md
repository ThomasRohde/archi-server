---
name: archimate-relationships
description: This skill should be used when the user asks about "ArchiMate relationships", "composition vs aggregation", "realization relationship", "serving relationship", "assignment relationship", "triggering", "flow relationship", "access relationship", "influence", "specialization", "cross-layer relationships", or needs help connecting ArchiMate elements correctly.
---

# ArchiMate Relationships

ArchiMate defines **11 core relationships** organized into four categories. Understanding proper relationship usage is critical for model quality and analysis.

## Relationship Categories

### Structural Relationships (Static Construction)

| Relationship | Notation | Usage |
|-------------|----------|-------|
| **Composition** | Solid line + filled diamond | Strong whole-part; parts cannot exist independently |
| **Aggregation** | Solid line + hollow diamond | Weak whole-part; parts may belong to multiple aggregations |
| **Assignment** | Solid line + circle at source | Who/what performs behavior; links actors to roles, components to functions |
| **Realization** | Dashed line + hollow triangle | Logical-to-physical mapping; cross-layer implementation |

### Dependency Relationships (Support/Usage)

| Relationship | Notation | Usage |
|-------------|----------|-------|
| **Serving** | Solid line + open arrowhead | Service delivery; arrow points toward consumer |
| **Access** | Dotted line + optional arrowhead | Data access; use mode indicators (r, w, rw) |
| **Influence** | Dashed line + open arrowhead | Affects motivation elements; can include +/- strength |
| **Association** | Solid line (undirected/directed) | Generic relationship; use when no specific type applies |

### Dynamic Relationships (Temporal/Flow)

| Relationship | Notation | Usage |
|-------------|----------|-------|
| **Triggering** | Solid line + filled arrowhead | Temporal/causal precedence between behaviors |
| **Flow** | Dashed line + filled arrowhead | Transfer of objects between behaviors; label what flows |

### Other

| Relationship | Notation | Usage |
|-------------|----------|-------|
| **Specialization** | Solid line + hollow triangle | Type hierarchies; same-type elements only |

## Key Direction Principle

ArchiMate relationships consistently point **toward enterprise goals and results**:
- From Technology → Application → Business
- From Active Structure → Behavior → Passive Structure

## Cross-Layer Relationship Patterns

### Business ↔ Application

**Supporting:**
```
[Application Service] → [serves] → [Business Process/Function]
[Application Interface] → [serves] → [Business Role]
```

**Realizing:**
```
[Application Process/Function] → [realizes] → [Business Process/Function]
[Data Object] → [realizes] → [Business Object]
```

### Application ↔ Technology

**Supporting:**
```
[Technology Service] → [serves] → [Application Component/Function]
```

**Realizing:**
```
[Artifact] → [realizes] → [Application Component]
[Artifact] → [realizes] → [Data Object]
```

### Service-Driven Architecture Pattern

The canonical layered view shows service chains connecting layers:

```
[Business Actor: Customer]
    ↓ served by
[Business Service]
    ↓ realized by
[Business Process]
    ↓ served by
[Application Service]
    ↓ realized by
[Application Component]
    ↓ served by
[Technology Service]
    ↓ realized by
[Node: Device + System Software]
```

## Common Relationship Patterns

### Actor-Role-Function Pattern
```
[Business Actor] → [assignment] → [Business Role] → [assignment] → [Business Process/Function]
```

### Service Realization Pattern
```
[Business Role] → [assignment] → [Business Process] → [realization] → [Business Service]
[Business Interface] → [assignment] → [Business Service]
```

### Deployment Pattern
```
[Application Component] ← [realized by] ← [Artifact] → [assigned to] → [Node/System Software]
```

## Relationship Selection Guide

| Want to show... | Use |
|-----------------|-----|
| What performs behavior | **Assignment** |
| What implements/realizes something | **Realization** |
| What provides service to whom | **Serving** |
| What reads/writes data | **Access** (with r/w/rw) |
| What causes what to happen | **Triggering** |
| What passes between behaviors | **Flow** (label it) |
| Part-whole (dependent) | **Composition** |
| Part-whole (independent) | **Aggregation** |
| Type hierarchy | **Specialization** |
| Motivation impact | **Influence** (+/-) |
| Generic connection | **Association** (last resort) |

## Output Format for Relationships

### Notation Format
```
[Source Element] → [relationship type] → [Target Element]
```

### With Access Modes
```
[Application Function: Process Order] → [access (rw)] → [Data Object: Order Record]
```

### With Flow Labels
```
[Business Process: Receive Order] → [flow: Order Data] → [Business Process: Validate Order]
```

## Additional Resources

### Reference Files

For detailed relationship patterns and advanced cross-layer guidance:
- **`references/relationship-patterns.md`** - Complete relationship pattern catalog with examples

---

## Creating Relationships via the API

To create relationships in Archi, use the Archi Model API Server. Load the **archi-server-api** skill for full API workflow details.

### Relationship Type to API Type Mapping

All relationship types use **kebab-case with `-relationship` suffix** in the API:

| Relationship | API `type` | Key Fields |
|-------------|-----------|------------|
| Composition | `composition-relationship` | `sourceId`, `targetId` |
| Aggregation | `aggregation-relationship` | `sourceId`, `targetId` |
| Assignment | `assignment-relationship` | `sourceId`, `targetId` |
| Realization | `realization-relationship` | `sourceId`, `targetId` |
| Serving | `serving-relationship` | `sourceId`, `targetId` |
| Access | `access-relationship` | `sourceId`, `targetId`, `accessType` |
| Influence | `influence-relationship` | `sourceId`, `targetId` |
| Triggering | `triggering-relationship` | `sourceId`, `targetId` |
| Flow | `flow-relationship` | `sourceId`, `targetId`, `name` (label) |
| Specialization | `specialization-relationship` | `sourceId`, `targetId` |
| Association | `association-relationship` | `sourceId`, `targetId` |

### Direction Convention in the API

The `sourceId` → `targetId` direction follows ArchiMate direction conventions:
- **Serving**: source *serves* target (arrow from source to target)
- **Realization**: source *realizes* target (source is the implementing element)
- **Assignment**: source *is assigned to* target (source performs target's behavior)
- **Triggering**: source *triggers* target
- **Flow**: source *flows to* target (label with `name` field to describe what flows)
- **Access**: source *accesses* target (data/object)
- **Composition/Aggregation**: source *contains* target

### Access Relationship Variants

Use the `accessType` field for access relationships:

```bash
# Read access
{"op": "createRelationship", "type": "access-relationship", "sourceId": "FUNC_ID", "targetId": "DATA_ID", "accessType": "read", "tempId": "r1"}

# Write access
{"op": "createRelationship", "type": "access-relationship", "sourceId": "FUNC_ID", "targetId": "DATA_ID", "accessType": "write", "tempId": "r2"}

# Read-write access
{"op": "createRelationship", "type": "access-relationship", "sourceId": "FUNC_ID", "targetId": "DATA_ID", "accessType": "readwrite", "tempId": "r3"}
```

### Quick API Examples by Pattern

**Actor-Role-Process (Assignment chain):**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "ACTOR_ID", "targetId": "ROLE_ID", "tempId": "r1"},
    {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "ROLE_ID", "targetId": "PROCESS_ID", "tempId": "r2"}
  ]}'
```

**Service Realization:**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createRelationship", "type": "realization-relationship", "sourceId": "PROCESS_ID", "targetId": "SERVICE_ID", "tempId": "r1"},
    {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "INTERFACE_ID", "targetId": "SERVICE_ID", "tempId": "r2"}
  ]}'
```

**Cross-Layer (Application serves Business):**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createRelationship", "type": "serving-relationship", "sourceId": "APP_SERVICE_ID", "targetId": "BUS_PROCESS_ID", "tempId": "r1"}
  ]}'
```

**Process Flow with Labels:**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createRelationship", "type": "triggering-relationship", "sourceId": "EVENT_ID", "targetId": "PROCESS1_ID", "tempId": "r1"},
    {"op": "createRelationship", "type": "flow-relationship", "sourceId": "PROCESS1_ID", "targetId": "PROCESS2_ID", "name": "Order Data", "tempId": "r2"},
    {"op": "createRelationship", "type": "flow-relationship", "sourceId": "PROCESS2_ID", "targetId": "PROCESS3_ID", "name": "Validated Order", "tempId": "r3"}
  ]}'
```

**Deployment Pattern:**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ARTIFACT_ID", "targetId": "APP_COMP_ID", "tempId": "r1"},
    {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "NODE_ID", "targetId": "ARTIFACT_ID", "tempId": "r2"}
  ]}'
```

### Validation Before Creating

To validate that a relationship is permitted between two element types, use dry-run:
```bash
curl -s -X POST http://localhost:8765/model/plan \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createRelationship", "type": "serving-relationship", "sourceId": "ID_1", "targetId": "ID_2"}
  ]}'
```

After each `POST /model/apply`, poll `GET /ops/status?opId=OP_ID` for the real relationship IDs.
