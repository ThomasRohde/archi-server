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
