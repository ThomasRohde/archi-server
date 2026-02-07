# ArchiMate Viewpoints Catalog

Complete reference for ArchiMate viewpoints and their usage.

## Viewpoint Categories

### Basic Viewpoints

#### Organization Viewpoint
**Purpose**: Shows organizational structure including actors, roles, and their assignments.
**Elements**: Business Actor, Business Role, Business Collaboration, Location
**Relationships**: Composition, Aggregation, Assignment, Association

**When to use:**
- Document organizational structure
- Show role assignments
- Map responsibilities

**Example scope:**
```
[Business Actor: Sales Department]
    → [composition] → [Business Actor: Regional Sales Team]
        → [assignment] → [Business Role: Account Manager]
        → [assignment] → [Business Role: Sales Representative]
```

#### Information Structure Viewpoint
**Purpose**: Shows data and business object relationships.
**Elements**: Business Object, Representation, Data Object, Meaning
**Relationships**: Composition, Aggregation, Realization, Association

**When to use:**
- Document data models
- Show information relationships
- Map business concepts to data

#### Technology Viewpoint
**Purpose**: Shows infrastructure, devices, and networks.
**Elements**: Node, Device, System Software, Technology Interface, Path, Communication Network
**Relationships**: Composition, Aggregation, Assignment, Realization, Serving

**When to use:**
- Document infrastructure
- Show deployment topology
- Plan capacity

#### Layered Viewpoint
**Purpose**: Bird's-eye view across all layers.
**Elements**: All layers
**Relationships**: All types

**When to use:**
- Executive overviews
- Cross-layer analysis
- Impact assessment

#### Physical Viewpoint
**Purpose**: Shows physical environment including equipment and facilities.
**Elements**: Equipment, Facility, Distribution Network, Material
**Relationships**: Composition, Aggregation, Assignment, Realization

**When to use:**
- Manufacturing environments
- Logistics planning
- Facility management

### Support Viewpoints

#### Product Viewpoint
**Purpose**: Shows product contents including services, contracts, and value.
**Elements**: Product, Business Service, Application Service, Contract, Value
**Relationships**: Composition, Aggregation, Association

**When to use:**
- Product design
- Service bundling
- Value proposition

#### Application Usage Viewpoint
**Purpose**: Shows how applications support business processes.
**Elements**: Business Process, Business Function, Application Service, Application Component, Data Object
**Relationships**: Serving, Realization, Access

**When to use:**
- Business-IT alignment
- Application rationalization
- Gap analysis

#### Technology Usage Viewpoint
**Purpose**: Shows how applications use technology.
**Elements**: Application Component, Technology Service, Node, Artifact
**Relationships**: Serving, Realization, Assignment

**When to use:**
- Deployment planning
- Infrastructure sizing
- Technology dependencies

### Cooperation Viewpoints

#### Business Process Cooperation Viewpoint
**Purpose**: Shows process relationships and flows.
**Elements**: Business Process, Business Function, Business Event, Business Service, Business Object
**Relationships**: Triggering, Flow, Serving, Access

**When to use:**
- Process integration
- Value chain analysis
- Process improvement

#### Application Cooperation Viewpoint
**Purpose**: Shows application component interactions.
**Elements**: Application Component, Application Service, Application Interface, Data Object
**Relationships**: Serving, Flow, Triggering, Access

**When to use:**
- Integration architecture
- Application landscape
- Data flow analysis

### Realization Viewpoints

#### Service Realization Viewpoint
**Purpose**: Shows how services are realized by behavior.
**Elements**: Business Service, Business Process, Application Service, Application Component
**Relationships**: Realization, Assignment, Serving

**When to use:**
- Service design
- Implementation planning
- Service catalog

#### Implementation and Deployment Viewpoint
**Purpose**: Shows applications mapped to technology.
**Elements**: Application Component, Artifact, Node, System Software
**Relationships**: Realization, Assignment

**When to use:**
- Deployment documentation
- Release planning
- Infrastructure mapping

### Strategy Viewpoints

#### Strategy Viewpoint
**Purpose**: High-level strategic overview.
**Elements**: Resource, Capability, Course of Action, Value Stream
**Relationships**: Realization, Association, Serving

**When to use:**
- Strategic planning
- Capability-based planning
- Initiative prioritization

#### Capability Map Viewpoint
**Purpose**: Structured capability overview.
**Elements**: Capability (primary), Resource, Value Stream
**Relationships**: Composition, Aggregation, Realization

**When to use:**
- Capability assessment
- Heat map analysis
- Gap identification

**Typical layout:**
```
┌─────────────────────────────────────────┐
│           Strategic Capabilities         │
├─────────────┬─────────────┬─────────────┤
│  Customer   │  Product    │  Operations │
│  Management │  Development│  Management │
├─────────────┼─────────────┼─────────────┤
│  Sub-cap 1  │  Sub-cap 1  │  Sub-cap 1  │
│  Sub-cap 2  │  Sub-cap 2  │  Sub-cap 2  │
└─────────────┴─────────────┴─────────────┘
```

#### Value Stream Viewpoint
**Purpose**: Value-creating activities.
**Elements**: Value Stream, Value Stream Stage, Capability, Outcome, Value
**Relationships**: Composition, Flow, Serving, Realization

**When to use:**
- Customer journey mapping
- Value analysis
- Process alignment

#### Outcome Realization Viewpoint
**Purpose**: How outcomes are produced.
**Elements**: Goal, Outcome, Value, Capability, Course of Action
**Relationships**: Realization, Association, Influence

**When to use:**
- Benefit realization
- Goal tracking
- Strategy execution

### Motivation Viewpoints

#### Motivation Viewpoint
**Purpose**: Stakeholder concerns, goals, and requirements.
**Elements**: Stakeholder, Driver, Assessment, Goal, Outcome, Principle, Requirement, Constraint
**Relationships**: Influence, Realization, Association

**When to use:**
- Requirements analysis
- Stakeholder management
- Architecture rationale

#### Goal Realization Viewpoint
**Purpose**: How goals are refined and realized.
**Elements**: Goal, Requirement, Constraint, Principle, Core elements
**Relationships**: Realization, Influence, Association

**When to use:**
- Requirements traceability
- Compliance mapping
- Design rationale

#### Requirements Realization Viewpoint
**Purpose**: How requirements are realized by architecture.
**Elements**: Requirement, Constraint, Core elements (all layers)
**Relationships**: Realization

**When to use:**
- Requirements coverage
- Compliance verification
- Gap analysis

### Implementation & Migration Viewpoints

#### Implementation and Migration Viewpoint
**Purpose**: Shows change initiatives and project relationships.
**Elements**: Work Package, Deliverable, Implementation Event, Plateau, Gap
**Relationships**: Triggering, Realization, Association

**When to use:**
- Program planning
- Project dependencies
- Roadmap development

#### Project Viewpoint
**Purpose**: Focus on specific project scope.
**Elements**: Work Package, Deliverable, Business Role, Plateau elements
**Relationships**: Realization, Assignment, Association

**When to use:**
- Project scoping
- Resource planning
- Deliverable tracking

#### Migration Viewpoint
**Purpose**: Shows transition from baseline to target.
**Elements**: Plateau, Gap, Core elements
**Relationships**: Triggering, Association

**When to use:**
- Migration planning
- Gap analysis
- Roadmap visualization

## Viewpoint Selection Guide

### By Stakeholder

| Stakeholder | Primary Viewpoints |
|-------------|-------------------|
| CEO/Board | Strategy, Capability Map |
| CIO | Layered, Application Usage |
| Business Manager | Business Process Cooperation, Product |
| Enterprise Architect | Layered, Migration |
| Solution Architect | Application Cooperation, Implementation |
| Infrastructure Architect | Technology, Technology Usage |
| Project Manager | Project, Implementation & Migration |

### By Question

| Question | Viewpoint |
|----------|-----------|
| What capabilities do we have? | Capability Map |
| How do applications support business? | Application Usage |
| How are services implemented? | Service Realization |
| Where are applications deployed? | Implementation and Deployment |
| What drives our architecture? | Motivation |
| How do we get from current to target? | Migration |
| What value do we deliver? | Value Stream, Product |

### By Architecture Domain

| Domain | Primary Viewpoints |
|--------|-------------------|
| Business Architecture | Organization, Business Process Cooperation, Product |
| Data Architecture | Information Structure |
| Application Architecture | Application Cooperation, Application Usage |
| Technology Architecture | Technology, Technology Usage, Physical |
| Security Architecture | Layered (with security elements), Motivation |
| Integration Architecture | Application Cooperation |

## Custom Viewpoints

ArchiMate allows custom viewpoints. Common customizations:

### Security Viewpoint (Custom)
**Elements**: Selected from all layers + security-focused groupings
**Focus**: Security zones, access controls, compliance

### Data Flow Viewpoint (Custom)
**Elements**: Business Object, Data Object, Artifact, Application Component
**Focus**: Data lineage, transformation, storage

### Cost Viewpoint (Custom)
**Elements**: All layers with cost properties
**Focus**: TCO analysis, cost allocation

## View Complexity Guidelines

| View Type | Target Elements | Maximum Elements |
|-----------|----------------|------------------|
| Executive overview | 10-15 | 20 |
| Analysis view | 15-25 | 40 |
| Detailed design | 20-30 | 50 |
| Reference architecture | 30-40 | 60 |

**Key principle**: If a view becomes too complex, split into multiple focused views or raise abstraction level.
