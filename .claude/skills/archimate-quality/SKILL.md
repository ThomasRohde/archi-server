---
name: archimate-quality
description: This skill should be used when the user asks about "ArchiMate naming conventions", "model quality", "EA smells", "anti-patterns", "ArchiMate best practices", "model review", "abstraction levels", "viewpoints", "model organization", or needs guidance on creating high-quality ArchiMate models.
---

# ArchiMate Model Quality

This skill provides guidance on creating high-quality, maintainable ArchiMate models.

## Naming Conventions

### Element Naming by Type

| Element Category | Convention | Examples |
|-----------------|------------|----------|
| **Structural Elements** | Singular Noun Phrases | `Customer Portal`, `Data Warehouse` |
| **Behavioral Elements** | Verb Phrases | `Manage Applications`, `Process Payments` |
| **Processes** | Present-tense Verb + Noun | `Handle Claim`, `Submit Order` |
| **Services** | Noun or Gerund Phrase | `Customer Information Service`, `Payment Processing` |
| **Capabilities** | Compound Noun/Gerund | `Risk Management`, `Customer Onboarding` |
| **Value Streams** | Verb-Noun Active | `Acquire Insurance Product` |

### General Guidelines

- Use **Title Case** for element names
- Use compound terms for clarity ("Student Information System" not "System")
- Avoid abbreviations unless domain-standard
- Don't include element type in name when tool shows it visually
- Use namespacing prefixes for large models: `[Business Systems][Customer System]`
- Prefix views with state: `ASIS_ApplicationLandscape`, `TOBE_Integration`

## EA Smells (Quality Issues)

| EA Smell | Description | Correction |
|----------|-------------|------------|
| **Lonely Component** | Element with no relations | Connect or remove orphans |
| **Strict Layers Violation** | Business directly linked to Technology | Add Application layer intermediation |
| **Dead Element** | Element not in any view | Review for deletion or include |
| **God Component** | One element with too many responsibilities | Decompose into focused components |
| **Chatty Interface** | Too many fine-grained relationships | Consolidate at appropriate abstraction |
| **Missing Relationship** | Implicit dependencies not modeled | Make relationships explicit |
| **Circular Dependencies** | Cyclic relationships | Restructure to eliminate cycles |

## Common Modeling Errors

1. **Mixing abstraction levels**: Detailed processes alongside strategic capabilities
2. **Using Association as default**: When specific relationship type applies
3. **Over-modeling**: Every detail captured, creating maintenance burden
4. **Wrong element type**: Using Process when Function is correct
5. **Missing services layer**: Direct connections bypassing service abstraction
6. **View-centric thinking**: Creating elements for single view, not reusing
7. **Inconsistent naming**: Same concept with different names across views

## Abstraction and Granularity

### Abstraction Levels by Purpose

| Purpose | Abstraction Level | Audience |
|---------|------------------|----------|
| **Informing** | High (Overview) | CxOs, broad stakeholders |
| **Deciding** | Medium (Coherence) | Managers, analysts |
| **Designing** | Low (Details) | Subject matter experts |

### Granularity by Element Type

| Element Type | Right Level | Over-Modeling Signs |
|--------------|-------------|---------------------|
| **Business Processes** | Level 2-3 decomposition | Every task modeled |
| **Applications** | Logical components | Individual modules as components |
| **Technology** | Platform/service level | Individual servers |
| **Capabilities** | 2-3 levels deep | Operational activities |

### Key Principles

- **80/20 Rule**: Only a subset of ArchiMate elements needed for most modeling
- **Match stakeholder needs**: Detail viewpoints = one layer/one aspect
- **Limit view complexity**: Target ~20 elements per view (40 max)

## Viewpoint Selection

### Stakeholder-to-Viewpoint Mapping

| Stakeholder Type | Recommended Viewpoints |
|-----------------|----------------------|
| **CxOs, Business Managers** | Strategy, Capability Map, Motivation |
| **Enterprise Architects** | Layered, Application Cooperation, Implementation |
| **Process Architects** | Business Process Cooperation, Service Realization |
| **Application Architects** | Application Usage, Implementation and Deployment |
| **Infrastructure Architects** | Technology, Technology Usage, Physical |

### Pattern-to-Viewpoint Mapping

| Architecture Pattern | Primary Viewpoints |
|---------------------|-------------------|
| Microservices | Application Cooperation, Layered, Technology Usage |
| API/Integration | Application Cooperation, Service Realization |
| Cloud Infrastructure | Technology, Deployment, Layered |
| Data Architecture | Information Structure, Application Cooperation |
| Capability Mapping | Capability Map, Strategy, Resource Map |

## Model Quality Checklist

### Before Creating
- [ ] Define scope and purpose
- [ ] Identify stakeholders and concerns
- [ ] Select appropriate viewpoints
- [ ] Establish naming conventions

### During Modeling
- [ ] Follow naming conventions consistently
- [ ] Use correct element types
- [ ] Model at appropriate abstraction level
- [ ] Reuse existing elements (don't duplicate)
- [ ] Add descriptions to elements

### Model Review
- [ ] Elements correctly typed
- [ ] Names follow conventions
- [ ] No orphaned elements
- [ ] No strict layer violations
- [ ] Relationships directionally correct
- [ ] Views tell coherent stories

## Model Organization

### Folder Structure (By Layer)
```
Model
├── Strategy
├── Business
├── Application
├── Technology
├── Physical
├── Motivation
├── Implementation & Migration
├── Relations
└── Views
```

### Folder Structure (By Domain)
```
Model
├── Customer Domain
│   ├── Business
│   ├── Application
│   └── Technology
├── Finance Domain
└── Shared Services
```

## Additional Resources

### Reference Files

For detailed viewpoint guidance and framework integration:
- **`references/viewpoints.md`** - Complete ArchiMate viewpoints catalog
- **`references/framework-integration.md`** - TOGAF, BPMN, IT4IT integration patterns

---

## Automated Model Audit via the API

To audit a model in Archi, use the Archi Model API Server. Load the **archi-server-api** skill for full API workflow details. Use the **/audit** command for a guided audit workflow.

### Querying for Quality Issues

#### Find Orphan Elements (Lonely Components)

Search for elements of each type and check for empty relationship arrays:

```bash
# Get all business actors
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "business-actor", "limit": 200}'

# Get details for a specific element (includes relationships and views)
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

Elements where the `relationships` array is empty are orphans.

#### Check Naming Conventions

Search elements and inspect names against the conventions table above:

```bash
# Find processes that might not follow Verb+Noun convention
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "business-process", "limit": 200}'
```

Check each name:
- Processes should start with a verb ("Handle", "Process", "Submit", "Validate")
- Structural elements should be singular noun phrases in Title Case
- Services should be noun/gerund phrases

#### Find Duplicate Elements

```bash
# Search with a common name fragment
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"namePattern": "Customer", "limit": 100}'
```

Compare results for same-type elements with identical or near-identical names.

#### Find Dead Elements (Not in Any View)

```bash
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

If the `views` array in the response is empty, the element is not on any view.

#### Check for Missing Documentation

Search all elements — those with empty `documentation` field need attention:

```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"limit": 500}'
```

#### Detect Association Overuse

Search for association relationships and check if a more specific type applies:

```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "association-relationship", "limit": 100}'
```

### Applying Fixes

#### Rename Elements
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "updateElement", "id": "ELEMENT_ID", "name": "Corrected Name"}
  ]}'
```

#### Add Documentation
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "updateElement", "id": "ELEMENT_ID", "documentation": "Purpose and description of this element"}
  ]}'
```

#### Remove Orphan Elements
```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "deleteElement", "id": "ORPHAN_ID", "cascade": true}
  ]}'
```

Always poll `GET /ops/status?opId=OP_ID` after applying changes, then `POST /model/save` to persist.
