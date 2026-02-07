---
name: archimate-modeling
description: This skill should be used when the user asks about "ArchiMate elements", "which element to use", "ArchiMate layers", "business layer", "application layer", "technology layer", "motivation layer", "strategy layer", "active structure", "passive structure", "behavior elements", or needs help selecting the correct ArchiMate element type for modeling enterprise architecture.
---

# ArchiMate Modeling Fundamentals

ArchiMate is The Open Group's standard for enterprise architecture modeling, providing a visual language with **56 elements** across **6 core layers** connected by **11 relationship types**.

## The Six Layers

| Layer | Purpose | Key Elements |
|-------|---------|--------------|
| **Motivation** | Why (stakeholder concerns, goals) | Stakeholder, Driver, Goal, Requirement, Principle |
| **Strategy** | What enterprise intends to achieve | Capability, Resource, Value Stream, Course of Action |
| **Business** | Business operations | Business Actor, Role, Process, Function, Service, Object |
| **Application** | Software and data | Application Component, Service, Interface, Data Object |
| **Technology** | Infrastructure | Node, Device, System Software, Artifact, Network |
| **Implementation & Migration** | Change management | Work Package, Deliverable, Plateau, Gap |

## Three Fundamental Aspects

Every layer contains elements organized into three aspects:

- **Active Structure (Nouns)**: Elements that perform behavior—actors, components, nodes, interfaces
- **Behavior (Verbs)**: Activities performed—processes, functions, services, events
- **Passive Structure (Objects)**: Elements behavior acts upon—business objects, data objects, artifacts

## Element Selection Decision Guide

### Active Structure: Who/What Performs Behavior?

| Need to model... | Use | Not |
|------------------|-----|-----|
| Specific person/system | **Business Actor** / **Application Component** | Role |
| Responsibility pattern | **Business Role** | Actor |
| Collaboration | **Business Collaboration** | Multiple separate actors |
| External access point | **Interface** | Component |

### Behavior: What Is Performed?

| Need to model... | Use | Not |
|------------------|-----|-----|
| Sequence with defined result | **Process** | Function |
| Ongoing capability/grouping | **Function** | Process |
| Externally visible functionality | **Service** | Process/Function |
| Something that triggers behavior | **Event** | Process step |

### Passive Structure: What Is Acted Upon?

| Need to model... | Use | Not |
|------------------|-----|-----|
| Business-level concept | **Business Object** | Data Object |
| Structured application data | **Data Object** | Business Object |
| Perceptible information form | **Representation** | Artifact |
| Deployable file/module | **Artifact** | Data Object |

## Common Confusion Points

| Pair | Use First When... | Use Second When... |
|------|-------------------|-------------------|
| **Component vs Function** | Static structural unit | Behavior performed (no structure) |
| **Process vs Function** | Has sequence, start/end | Continuous, no sequence |
| **Service vs Process** | External view, what's offered | Internal, how it's done |
| **Actor vs Role** | Specific entity | Responsibility that can be filled by different actors |

## Output Formats

When creating ArchiMate models, use these formats:

### Textual Description Format
```
Element Type: [Name]
Layer: [Layer Name]
Description: [What this element represents]
Relationships:
- [relationship type] → [Target Element]
```

### Notation Format
```
[Element Type: Name] → [relationship] → [Element Type: Name]
```

Example:
```
[Business Role: Claims Handler] → [assignment] → [Business Process: Handle Insurance Claim]
[Business Process: Handle Insurance Claim] → [realization] → [Business Service: Claims Processing]
```

## Key Principles

1. **Layer consistency**: Keep elements in appropriate layers; use cross-layer relationships to connect
2. **Service orientation**: Expose functionality through services, not direct process/function access
3. **Separation of concerns**: Distinguish who (actors/roles), what (behavior), and what's affected (objects)
4. **Realization chains**: Connect logical to physical through realization relationships

## Additional Resources

### Reference Files

For detailed element catalogs and layer-specific guidance:
- **`references/element-catalog.md`** - Complete catalog of all 56 ArchiMate elements with usage guidance
- **`references/layer-details.md`** - Detailed patterns for each layer

---

## Creating Elements via the API

To create elements in Archi, use the Archi Model API Server. Load the **archi-server-api** skill for full API workflow details.

### Element Type to API Type Mapping

All element types use **kebab-case** in the API:

| Layer | Element | API `type` |
|-------|---------|-----------|
| **Strategy** | Resource | `resource` |
| | Capability | `capability` |
| | Value Stream | `value-stream` |
| | Course of Action | `course-of-action` |
| **Business** | Business Actor | `business-actor` |
| | Business Role | `business-role` |
| | Business Collaboration | `business-collaboration` |
| | Business Interface | `business-interface` |
| | Business Process | `business-process` |
| | Business Function | `business-function` |
| | Business Interaction | `business-interaction` |
| | Business Event | `business-event` |
| | Business Service | `business-service` |
| | Business Object | `business-object` |
| | Contract | `contract` |
| | Representation | `representation` |
| | Product | `product` |
| **Application** | Application Component | `application-component` |
| | Application Collaboration | `application-collaboration` |
| | Application Interface | `application-interface` |
| | Application Function | `application-function` |
| | Application Interaction | `application-interaction` |
| | Application Process | `application-process` |
| | Application Event | `application-event` |
| | Application Service | `application-service` |
| | Data Object | `data-object` |
| **Technology** | Node | `node` |
| | Device | `device` |
| | System Software | `system-software` |
| | Technology Collaboration | `technology-collaboration` |
| | Technology Interface | `technology-interface` |
| | Path | `path` |
| | Communication Network | `communication-network` |
| | Technology Function | `technology-function` |
| | Technology Process | `technology-process` |
| | Technology Interaction | `technology-interaction` |
| | Technology Event | `technology-event` |
| | Technology Service | `technology-service` |
| | Artifact | `artifact` |
| **Physical** | Equipment | `equipment` |
| | Facility | `facility` |
| | Distribution Network | `distribution-network` |
| | Material | `material` |
| **Motivation** | Stakeholder | `stakeholder` |
| | Driver | `driver` |
| | Assessment | `assessment` |
| | Goal | `goal` |
| | Outcome | `outcome` |
| | Principle | `principle` |
| | Requirement | `requirement` |
| | Constraint | `constraint` |
| | Meaning | `meaning` |
| | Value | `value` |
| **Implementation** | Work Package | `work-package` |
| | Deliverable | `deliverable` |
| | Implementation Event | `implementation-event` |
| | Plateau | `plateau` |
| | Gap | `gap` |
| **Other** | Location | `location` |
| | Grouping | `grouping` |
| | Junction | `junction` |

### Quick API Examples by Layer

**Business Layer:**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createElement", "type": "business-actor", "name": "Customer", "tempId": "e1"},
    {"op": "createElement", "type": "business-process", "name": "Submit Order", "tempId": "e2"},
    {"op": "createElement", "type": "business-service", "name": "Order Processing", "tempId": "e3"}
  ]}'
```

**Application Layer:**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createElement", "type": "application-component", "name": "Order System", "tempId": "e1"},
    {"op": "createElement", "type": "application-service", "name": "Order Management", "tempId": "e2"},
    {"op": "createElement", "type": "data-object", "name": "Order Record", "tempId": "e3"}
  ]}'
```

**Technology Layer:**
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "createElement", "type": "node", "name": "Application Server", "tempId": "e1"},
    {"op": "createElement", "type": "system-software", "name": "PostgreSQL", "tempId": "e2"},
    {"op": "createElement", "type": "artifact", "name": "order-service.jar", "tempId": "e3"}
  ]}'
```

After each `POST /model/apply`, poll `GET /ops/status?opId=OP_ID` for the real IDs.
