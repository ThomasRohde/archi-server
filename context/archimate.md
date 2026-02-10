# ArchiMate Best Practices and Modeling Patterns Reference Guide

This comprehensive guide provides authoritative guidance for enterprise architecture modeling using ArchiMate, designed to support AI assistant prompts and skills for an MCP Server integrated with Archi. It covers foundational concepts through advanced patterns, serving both novice and experienced enterprise architects.

---

## Core ArchiMate concepts and framework structure

ArchiMate is The Open Group's open standard for enterprise architecture modeling, providing a visual language with **56 elements** across **6 core layers** connected by **11 relationship types**. The framework enables uniform representation for describing, analyzing, and communicating enterprise architectures through service orientation and realization relationships.

### The ArchiMate framework layers

| Layer | Purpose | Key Elements |
|-------|---------|--------------|
| **Motivation** | Why (stakeholder concerns, goals) | Stakeholder, Driver, Goal, Requirement, Principle |
| **Strategy** | What enterprise intends to achieve | Capability, Resource, Value Stream, Course of Action |
| **Business** | Business operations | Business Actor, Role, Process, Function, Service, Object |
| **Application** | Software and data | Application Component, Service, Interface, Data Object |
| **Technology** | Infrastructure | Node, Device, System Software, Artifact, Network |
| **Implementation & Migration** | Change management | Work Package, Deliverable, Plateau, Gap |

### Three fundamental aspects

Every layer contains elements organized into three aspects:

- **Active Structure (Nouns)**: Elements that perform behavior—actors, components, nodes, interfaces
- **Behavior (Verbs)**: Activities performed—processes, functions, services, events
- **Passive Structure (Objects)**: Elements behavior acts upon—business objects, data objects, artifacts

---

## Complete relationship type catalog

ArchiMate defines **11 core relationships** organized into four categories. Understanding proper relationship usage is critical for model quality and analysis.

### Structural relationships (static construction)

| Relationship | Notation | Usage |
|-------------|----------|-------|
| **Composition** | Solid line + filled diamond | Strong whole-part; parts cannot exist independently |
| **Aggregation** | Solid line + hollow diamond | Weak whole-part; parts may belong to multiple aggregations |
| **Assignment** | Solid line + circle at source | Who/what performs behavior; links actors to roles, components to functions |
| **Realization** | Dashed line + hollow triangle | Logical-to-physical mapping; cross-layer implementation |

### Dependency relationships (support/usage)

| Relationship | Notation | Usage |
|-------------|----------|-------|
| **Serving** | Solid line + open arrowhead | Service delivery; arrow points toward consumer |
| **Access** | Dotted line + optional arrowhead | Data access; use mode indicators (r, w, rw) |
| **Influence** | Dashed line + open arrowhead | Affects motivation elements; can include +/- strength |
| **Association** | Solid line (undirected/directed) | Generic relationship; use when no specific type applies |

### Dynamic relationships (temporal/flow)

| Relationship | Notation | Usage |
|-------------|----------|-------|
| **Triggering** | Solid line + filled arrowhead | Temporal/causal precedence between behaviors |
| **Flow** | Dashed line + filled arrowhead | Transfer of objects between behaviors; label what flows |

### Other relationship

| Relationship | Notation | Usage |
|-------------|----------|-------|
| **Specialization** | Solid line + hollow triangle | Type hierarchies; same-type elements only |

**Key principle**: ArchiMate relationships consistently point **toward enterprise goals and results**—from Technology → Application → Business, from Active Structure → Behavior → Passive Structure.

---

## Strategy Layer patterns

### Capability modeling pattern

Capabilities represent stable, technology-agnostic abilities that enable strategic outcomes. Model capabilities at **2-3 levels of decomposition** using composition relationships.

```
Goal → [realized by] → Capability → [realized by] → Business Process/Application Component
Capability → [composition] → Sub-Capability
Capability → [serves] → Value Stream Stage
```

**Best practices:**
- Name capabilities using compound nouns or gerunds ("Risk Management", "Customer Onboarding")
- Keep capabilities stable over time; they describe *what* the enterprise can do, not *how*
- Use capability increments for time-based planning via specialization relationships
- Color-code capabilities by maturity gap for heat map views (Red=gap, Green=mature)

### Value stream pattern

Value streams show end-to-end value creation from the stakeholder perspective.

```
Value Stream → [composition] → Value Stream Stages (with flow relationships between stages)
Value Stream Stage ← [served by] ← Capability
Value Stream → [realizes] → Outcome
Outcome → [associated with] → Value
```

**Naming convention**: Use verb-noun active tense ("Acquire Insurance Product", "Deliver Customer Order")

### Course of action pattern

```
Driver/Assessment → [influences] → Goal → [realized by] → Course of Action
Course of Action → [realizes] → Capability
Course of Action → [associated with] → Resource
```

---

## Business Layer patterns

### Actor-role-function pattern

Separating actors from roles provides flexibility for organizational changes.

```
Business Actor → [assignment] → Business Role → [assignment] → Business Process/Function
```

**Key distinctions:**
- **Business Actor**: Specific organizational entity (person, department, partner)
- **Business Role**: Responsibility or "hat" that can be filled by different actors
- **Business Function**: Stable grouping of behavior based on competency or domain
- **Business Process**: Specific sequence with defined start, end, and outcome

### Business service pattern

Services expose externally visible behavior to consumers.

```
Business Role → [assignment] → Business Process → [realization] → Business Service
Business Interface → [assignment] → Business Service
External Actor → [served by] → Business Service
```

**Naming conventions:**
- Services: Noun phrases with "-ing" ("Payment Processing", "Customer Onboarding")
- Processes: Verb phrases ("Handle Insurance Claim", "Process Order")
- Objects: Nouns ("Insurance Policy", "Customer Record")

### Product pattern

Products bundle services with agreements for customer consumption.

```
Business Service(s) + Contract + Application Services → [aggregation] → Product
Product → [associated with] → Value
Customer → [served by] → Product
```

### Business objects and access pattern

```
Business Process/Function → [access (r/w/rw)] → Business Object
Representation → [realizes] → Business Object (perceptible form of information)
```

**Common mistakes to avoid:**
- Confusing actors with roles (actors are specific entities; roles are responsibilities)
- Using visual nesting without actual relationships
- Not distinguishing internal behavior (processes) from external (services)
- Modeling processes too granularly (use BPMN for detailed workflow)

---

## Application Layer patterns

### Basic application pattern

```
Application Component → [assignment] → Application Function → [realization] → Application Service
Application Interface → [assignment] → Application Service
Consumer → [served by] → Application Service (via Interface)
```

### Application integration pattern (10 alternatives)

**Pattern 1 - Simple flow:**
```
Application A → [flow (labeled with Data Object)] → Application B
```

**Pattern 3 - Service-based:**
```
Application A → [realizes] → Application Service A-1
Application Service A-1 → [serves] → Application B
Data Object A-1 ← [accessed by] ← Application Service A-1
```

**Pattern 10 - Full detail:**
```
Application A → [assigned] → Application Interface A-1
Application Interface A-1 → [realizes] → Application Service A-1
Application Service A-1 → [serves] → Application B
Data Object → [flows via] → Flow relationship
```

**Recommendation**: Standardize on patterns 1, 3, and 10 based on required detail level.

### Data access pattern

```
Application Function/Service → [access] → Data Object
Data Object → [realization] → Business Object (cross-layer)
Data Object ← [realized by] ← Artifact (to Technology Layer)
```

### Application sequence pattern

```
Application Event → [triggers] → Application Process → [served by] → Application Service 1 → [triggers] → Application Service 2
```

**Best practices:**
- Use components for deployable, replaceable units
- Functions are internal behavior; services are external contracts
- Show interfaces explicitly when modeling integration points
- Keep services meaningful from consumer perspective

---

## Technology Layer patterns

### Basic node pattern

```
Node → [composition] → Device + System Software
Device → [assignment] → System Software
System Software → [assignment] → Artifact
```

**Key distinctions:**
- **Node**: Logical computational resource
- **Device**: Physical hardware (server, router)
- **System Software**: OS, middleware, DBMS, container runtime

### Deployment pattern

```
Application Component ← [realized by] ← Artifact → [assigned to] → Node/System Software
```

This critical cross-layer pattern shows how applications map to infrastructure.

### Network infrastructure pattern

```
Device A → [connected via] → Communication Network → [connected to] → Device B
Communication Network → [realization] → Path
Node → [composition] → Technology Interface
```

### Virtualization pattern

```
Device (Physical Server)
    → [assignment] → System Software (Hypervisor)
        → [assignment] → System Software (Virtual OS)
            = Node (Virtual Host)
```

### Database pattern

```
System Software (DBMS) → [realization] → Technology Service (Database Service)
Artifact (Data Files) → [assigned to] → System Software
Data Object ← [realized by] ← Artifact
```

---

## Physical Layer patterns

### Manufacturing pattern

```
Equipment (Assembly Line) → [assigned to] → Facility (Factory)
Material (Raw Materials) ← [accessed by] ← Equipment → [produces] → Material (Product)
```

### Logistics/distribution pattern

```
Facility A → [connected via] → Distribution Network → [connected to] → Facility B
Distribution Network(s) → [realization] → Path
```

### IoT/OT integration pattern

```
Equipment (Sensor) → [served by] → Technology Service (Data Collection)
Equipment → [composed of] → Device (embedded computer)
Device → [assignment] → System Software (firmware)
```

---

## Implementation and Migration Layer patterns

### Program/project structure pattern

```
Work Package (Program)
    → [composition] → Work Package (Project 1)
        → [composition] → Work Package (Task 1.1, Task 1.2)
Business Role (Project Manager) → [assignment] → Work Package
```

### Plateau/gap pattern for migration planning

```
Plateau (Baseline) → [triggers] → Plateau (Transition 1) → [triggers] → Plateau (Target)
Gap (Baseline-to-Transition) → [associated with] → Plateau (Baseline), Plateau (Transition 1)
Gap → [associated with] → Core elements being added/removed
```

### Roadmap pattern

```
Implementation Event (Program Approved) → [triggers] → Work Package 1 → [triggers] → Work Package 2
Work Package → [accesses] → Deliverable (input)
Work Package → [realizes] → Deliverable (output)
Deliverables → [realize] → Plateau
```

**Color coding for gap analysis:**
- White = unchanged
- Green = new additions
- Orange = modified
- Red = removed/deprecated

---

## Cross-layer relationship patterns

### Business ↔ Application layer

**Supporting:**
```
Application Service → [serves] → Business Process/Function
Application Interface → [serves] → Business Role
```

**Realizing:**
```
Application Process/Function → [realizes] → Business Process/Function (automation)
Data Object → [realizes] → Business Object
```

### Application ↔ Technology layer

**Supporting:**
```
Technology Service → [serves] → Application Component/Function
```

**Realizing:**
```
Artifact → [realizes] → Application Component (deployment)
Artifact → [realizes] → Data Object
```

### Service-driven architecture pattern

The canonical layered view shows service chains connecting layers:

```
Customer (Business Actor)
    ↓ served by
Business Service
    ↓ realized by
Business Process
    ↓ served by
Application Service
    ↓ realized by
Application Component
    ↓ served by
Technology Service
    ↓ realized by
Node (Device + System Software)
```

---

## Modern architecture patterns in ArchiMate

### Microservices architecture

**Element mapping:**
- Individual microservices → **Application Component**
- Business functionality → **Application Service**
- REST/gRPC endpoints → **Application Interface**
- Docker images → **Artifact**
- Kubernetes pods/namespaces → **Node**
- Container runtime → **System Software**

**Example pattern:**
```
[Application Component: Order Service] → [realizes] → [Application Service: Order Processing]
    → [composition] → [Application Function: Validate Order]
    → [composition] → [Application Function: Process Payment]
    → [serves] → [Application Interface: Order API (REST)]
```

**Container orchestration:**
```
Node (Kubernetes Cluster)
    → [composition] → Node (Namespace)
        → [composition] → Node (Pod)
            → [assigned to] → Artifact (Container Image)
```

**Key principle**: Model microservices at **Application Layer**, not Technology Layer. The "service" in microservice maps to Application Component; the business functionality it provides maps to Application Service.

### API and integration patterns

**API Gateway:**
```
[Technology Node: API Gateway]
    → [assignment] → [Technology Function: Request Routing]
    → [realization] → [Technology Service: API Management]
    → [serves] → [Application Component: Backend Service]
```

**Message queue/event bus:**
```
[Application Component: Message Broker]
    → [realization] → [Application Service: Async Messaging]
    → [served by] → [Application Interface: Topic/Queue Endpoint]
[Application Component: Producer] → [flow (labeled)] → [Application Component: Consumer]
```

### Cloud infrastructure patterns

**IaaS:**
```
[Technology Service: Compute Service] → [realizes] → [Node: Virtual Machine]
[Technology Service: Storage Service] → [accesses] → [Artifact: Data Volume]
```

**PaaS:**
```
[Technology Service: Runtime Environment] → [serves] → [Application Component: Customer App]
[Node: Container Platform] → [assigned to] → [Artifact: Application Container]
```

**SaaS:**
```
[Application Service: SaaS Capability] → [serves] → [Business Actor: Customer]
[Application Component: SaaS Application] → [realizes] → [Application Service]
```

**Multi-cloud:** Use **Location** elements to represent cloud providers/regions, **Groupings** to organize provider-specific services.

**Serverless:**
```
[Technology Service: Lambda/Functions] → [assigned to] → [Artifact: Function Code]
[Technology Interface: API Gateway Trigger] → [triggers] → [Application Event]
```

### Event-driven architecture

**Event producers/consumers:**
```
[Application Component: Order Service] → [triggers] → [Application Event: Order Created]
[Application Event] → [flow] → [Application Component: Inventory Service]
```

**CQRS pattern:**
```
[Application Component: Command Service] → [accesses (write)] → [Data Object: Write Model]
[Application Component: Query Service] → [accesses (read)] → [Data Object: Read Model]
[Application Event: State Changed] → [flow] → (synchronizes models)
```

**Event sourcing:**
```
[Application Component: Event Store] → [accesses (write, append-only)] → [Artifact: Event Log]
[Application Process: Event Replay] → [realizes] → [Application Service: State Reconstruction]
```

### Data architecture patterns

**Data lake:**
```
[Technology Node: Data Lake Platform]
    → [serves] → [Application Service: Data Ingestion]
    → [serves] → [Application Service: Data Processing]
    → [accesses] → [Artifact: Raw Data Store]
```

**Master data management:**
```
[Business Object: Customer (Master)] ← [realized by] ← [Data Object: Customer Record]
[Data Object: Customer Record] ← [accessed by] ← [Application Component: MDM Platform]
```

**Key principle**: Separate conceptual (Business Object), logical (Data Object), and physical (Artifact) levels of data representation.

### Security architecture patterns

**Identity and access management:**
```
[Application Component: Identity Provider]
    → [realizes] → [Application Service: Authentication Service]
    → [realizes] → [Application Service: Authorization Service]
    → [serves] → [Application Component: Protected Application]
```

**Security zones:** Use **Location** or **Grouping** elements to represent security boundaries (DMZ, Internal, External). Model firewalls as **Technology Interface** elements.

**Zero-trust architecture:**
```
[Principle: Never Trust, Always Verify]
    → [influences] → [Requirement: Continuous Authentication]
    → [realizes] → [Application Service: Identity Verification]
```

---

## Capability-to-application mapping

### Core approach

```
[Capability: Customer Management]
    ← [realized by] ← [Business Process: Handle Customer Inquiry]
    ← [realized by] ← [Application Component: CRM System]
```

### Application portfolio rationalization

When multiple applications realize the same capability, this indicates a rationalization opportunity:

```
[Capability: Order Processing]
    ← [realized by] ← [Application Component: Legacy Order System]
    ← [realized by] ← [Application Component: New Order Platform]
```

Use **Metrics** (specialized Drivers) to assess fitness, **Work Packages** and **Plateaus** for migration planning.

### Strategy-to-portfolio mapping

```
[Goal: Improve Customer Experience]
    → [realized by] → [Capability: Digital Customer Engagement]
    → [realized by] → [Application Service: Mobile App Services]
    → [realized by] → [Application Component: Mobile Platform]
```

---

## Naming conventions and standards

### Element naming by type

| Element Category | Convention | Examples |
|-----------------|------------|----------|
| **Structural Elements** | Singular Noun Phrases | `Customer Portal`, `Data Warehouse` |
| **Behavioral Elements** | Verb Phrases | `Manage Applications`, `Process Payments` |
| **Processes** | Present-tense Verb + Noun | `Handle Claim`, `Submit Order` |
| **Services** | Noun or Gerund Phrase | `Customer Information Service`, `Payment Processing` |
| **Capabilities** | Compound Noun/Gerund | `Risk Management`, `Customer Onboarding` |
| **Value Streams** | Verb-Noun Active | `Acquire Insurance Product` |

### Gerben Wierda's naming pattern

Use multi-line naming with context for clarity:
```
[Group/Context]
Element Name
(Element Type)
```

**Example:** `[Customer System] Change Address (Application Process)`

Implement in Archi using Label Expressions: `[${property:Group}] ${name} (${type})`

### General guidelines

- Use **Title Case** for element names
- Use compound terms for clarity ("Student Information System" not "System")
- Avoid abbreviations unless domain-standard
- Don't include element type in name when tool shows it visually
- Use namespacing prefixes for large models: `[Business Systems][Customer System]`
- Prefix views with state: `ASIS_ApplicationLandscape`, `TOBE_Integration`

---

## Abstraction and granularity guidelines

### Abstraction levels by purpose

| Purpose | Abstraction Level | Audience |
|---------|------------------|----------|
| **Informing** | High (Overview) | CxOs, broad stakeholders |
| **Deciding** | Medium (Coherence) | Managers, analysts |
| **Designing** | Low (Details) | Subject matter experts |

### Granularity by element type

| Element Type | Right Level | Over-Modeling Signs |
|--------------|-------------|---------------------|
| **Business Processes** | Level 2-3 decomposition | Every task modeled |
| **Applications** | Logical components | Individual modules as components |
| **Technology** | Platform/service level | Individual servers |
| **Capabilities** | 2-3 levels deep | Operational activities |

### Key principles

- **80/20 Rule**: Only a subset of ArchiMate elements and diagram types needed for most modeling
- **Match stakeholder needs**: Detail viewpoints = one layer/one aspect; Overview viewpoints = multiple layers
- **Start simple**: Use Introductory Viewpoint when not everything needs detail
- **Limit view complexity**: Target ~20 elements per view (40 max) for readability

---

## Element selection decision guide

### Active structure: who performs behavior?

| If you need to model... | Use | Not |
|------------------------|-----|-----|
| Specific person/system | **Business Actor** / **Application Component** | Role |
| Responsibility pattern | **Business Role** | Actor |
| Collaboration | **Business Collaboration** | Multiple separate actors |
| External access point | **Interface** | Component |

### Behavior: what is performed?

| If you need to model... | Use | Not |
|------------------------|-----|-----|
| Sequence with defined result | **Process** | Function |
| Ongoing capability/grouping | **Function** | Process |
| Externally visible functionality | **Service** | Process/Function |
| Something that triggers behavior | **Event** | Process step |

### Passive structure: what is acted upon?

| If you need to model... | Use | Not |
|------------------------|-----|-----|
| Business-level concept | **Business Object** | Data Object |
| Structured application data | **Data Object** | Business Object |
| Perceptible information form | **Representation** | Artifact |
| Deployable file/module | **Artifact** | Data Object |

### Common confusion points resolved

| Pair | Use First When... | Use Second When... |
|------|-------------------|-------------------|
| **Component vs Function** | Static structural unit | Behavior performed (no structure) |
| **Process vs Function** | Has sequence, start/end | Continuous, no sequence |
| **Service vs Process** | External view, what's offered | Internal, how it's done |
| **Aggregation vs Composition** | Parts exist independently | Parts cannot exist without whole |

---

## Common anti-patterns and mistakes

### EA smells catalog (quality issues)

| EA Smell | Description | Correction |
|----------|-------------|------------|
| **Lonely Component** | Element with no relations | Connect or remove orphans |
| **Strict Layers Violation** | Business directly linked to Technology | Add Application layer intermediation |
| **Dead Element** | Element not in any view | Review for deletion or include |
| **God Component** | One element with too many responsibilities | Decompose into focused components |
| **Chatty Interface** | Too many fine-grained relationships | Consolidate at appropriate abstraction |
| **Missing Relationship** | Implicit dependencies not modeled | Make relationships explicit |
| **Circular Dependencies** | Cyclic relationships | Restructure to eliminate cycles |

### Common modeling errors

1. **Mixing abstraction levels**: Detailed processes alongside strategic capabilities
2. **Using Association as default**: When specific relationship type applies
3. **Over-modeling**: Every detail captured, creating maintenance burden
4. **Wrong element type**: Using Process when Function is correct
5. **Missing services layer**: Direct connections bypassing service abstraction
6. **View-centric thinking**: Creating elements for single view, not reusing
7. **Inconsistent naming**: Same concept with different names across views

---

## ArchiMate viewpoints catalog

### Basic viewpoints by category

**Composition viewpoints:**
- **Organization**: Organizational structure (actors, roles, departments)
- **Information Structure**: Data and business object relationships
- **Technology**: Infrastructure, devices, networks
- **Layered**: Bird's-eye view across all layers
- **Physical**: Equipment, facilities, distribution networks

**Support viewpoints:**
- **Product**: Product contents, services, contracts, value
- **Application Usage**: How applications support business
- **Technology Usage**: How applications use technology

**Cooperation viewpoints:**
- **Business Process Cooperation**: Process relationships and flows
- **Application Cooperation**: Application component interactions

**Realization viewpoints:**
- **Service Realization**: How services are realized by behavior
- **Implementation and Deployment**: Applications mapped to technology

### Strategy viewpoints

- **Strategy**: High-level overview (courses of action, capabilities)
- **Capability Map**: Structured capability overview
- **Value Stream**: Value-creating activities
- **Outcome Realization**: How outcomes are produced

### Stakeholder-to-viewpoint mapping

| Stakeholder Type | Recommended Viewpoints |
|-----------------|----------------------|
| **CxOs, Business Managers** | Strategy, Capability Map, Motivation |
| **Enterprise Architects** | Layered, Application Cooperation, Implementation |
| **Process Architects** | Business Process Cooperation, Service Realization |
| **Application Architects** | Application Usage, Implementation and Deployment |
| **Infrastructure Architects** | Technology, Technology Usage, Physical |

### Recommended viewpoints by pattern

| Architecture Pattern | Primary Viewpoints |
|---------------------|-------------------|
| Microservices | Application Cooperation, Layered, Technology Usage |
| API/Integration | Application Cooperation, Service Realization |
| Cloud Infrastructure | Technology, Deployment, Layered |
| Data Architecture | Information Structure, Application Cooperation |
| Capability Mapping | Capability Map, Strategy, Resource Map |

---

## Model organization best practices

### Folder structure strategies

**By Layer (default):**
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

**By Domain:**
```
Model
├── Customer Domain
│   ├── Business
│   ├── Application
│   └── Technology
├── Finance Domain
└── Shared Services
```

**By State:**
```
Model
├── Current State
│   ├── Infrastructure
│   ├── Applications
│   └── Business Structure
├── Target Architecture
└── Project Architectures
```

### View organization

- Prefix with state: `ASIS_ApplicationLandscape`, `TOBE_Integration`
- Use **ViewReference elements** for drill-down navigation
- Create navigation views as entry points to domains
- Maintain a prime navigation model at top level

### Model sanity checklist

- [ ] Remove orphaned elements not used in any view
- [ ] Validate relationships using scripts
- [ ] Check naming consistency
- [ ] Verify no duplicate elements with same meaning
- [ ] Ensure all elements have descriptions
- [ ] Review for proper element type usage
- [ ] Check for strict layer violations

---

## Practical how-to guides

### How to model a business capability map

1. Define scope: Identify top-level capabilities from business strategy
2. Decompose hierarchically: Break into 2-3 levels using Composition
3. Use **Capability** elements from Strategy Layer
4. Organize by category: Business Management, Operations, Support
5. Link to goals: Connect capabilities to strategic goals via Realization
6. Cross-map to value streams: Show which capabilities support each stage
7. Apply heat map: Color by maturity gap (Red=large, Yellow=medium, Green=small)

### How to model application integration

**Choose appropriate detail level:**
- **Simple**: Application A → Flow → Application B (labeled with Data Object)
- **Service-based**: App A realizes Service; Service serves App B; Data Object accessed by Service
- **Full detail**: App A → Interface → Service → serves → App B with explicit flows

### How to conduct gap analysis

1. Create **Plateau (Baseline)** aggregating current elements
2. Create **Plateau (Target)** aggregating target elements
3. Create **Gap** element linking the two plateaus
4. Associate Gap with elements unique to each plateau
5. Apply color coding: White=unchanged, Green=new, Orange=modified, Red=removed

### How to build a migration roadmap

1. Define Plateaus for each stable state (Baseline → Transitions → Target)
2. Create Work Packages for implementation activities
3. Link Work Packages to Plateaus via Realization
4. Create Deliverables realized by Work Packages
5. Use Triggering to show sequence of work packages
6. Connect Implementation Events for milestones

---

## Industry-specific patterns

### Financial services (BIAN integration)

The Banking Industry Architecture Network (BIAN) maps to ArchiMate:
- **Service Landscape** → ArchiMate Capabilities in value chain structure
- **Business Domains** → Groupings containing Service Domains
- **Service Operations** → Business Services
- **Business Objects** → ISO 20022 standard alignment

**Pattern template:**
```
Capability: [Service Domain Name]
    └── Business Service: [BIAN Service]
        └── Application Component: [Core Banking]
            └── Technology Service: [API]
                └── Data Object: [ISO 20022]
```

### Regulatory compliance (GDPR)

**GDPR compliance pattern:**
```
Driver: Data Subject Rights Compliance
    └── Goal: Enable Data Erasure
        └── Requirement: Erasure Request Processing
            └── Business Process: Handle Erasure Request
                └── Application Service: Data Deletion Service
                    └── Data Object: Personal Data Record
```

**Key compliance modeling elements:**
- **Control Objectives** → Requirements
- **Control Activities** → Business Processes
- **Audit Evidence** → Data Objects
- **Monitoring** → Assessment elements

### Healthcare (HL7/FHIR)

**FHIR integration pattern:**
```
Application Service: FHIR API
    └── Application Interface: REST Endpoint
        └── Application Component: FHIR Server
            └── Data Object: FHIR Resource
                └── Technology Service: HL7
```

### Government (EIRA)

The European Interoperability Reference Architecture extends ArchiMate:
- **Legal View** → Motivation elements
- **Organizational View** → Business Layer
- **Semantic View** → Data Objects
- **Technical View** → Technology Layer

---

## Framework integration guidance

### ArchiMate and TOGAF

| TOGAF ADM Phase | ArchiMate Support |
|-----------------|-------------------|
| Preliminary | Strategy, Motivation elements |
| Phase A: Vision | Goals, Stakeholders, Drivers |
| Phase B: Business | Business Layer elements |
| Phase C: Information Systems | Application Layer elements |
| Phase D: Technology | Technology Layer elements |
| Phase E: Opportunities | Gap relationships, Assessment |
| Phase F: Migration Planning | Implementation & Migration |

### ArchiMate and BPMN

- ArchiMate for high-level enterprise process context
- BPMN for detailed workflow and executable specifications
- Use trace dependencies between ArchiMate Business Process and BPMN diagrams

| ArchiMate | BPMN |
|-----------|------|
| Business Process | Process/Sub-process |
| Business Event | Start/End/Intermediate Event |
| Business Actor/Role | Pool/Lane |
| Junction | Gateway |
| Flow Relationship | Sequence Flow |

### ArchiMate and IT4IT

IT4IT uses ArchiMate as its modeling language:
- Functional Components → Application Components
- Data Objects → ArchiMate Data Objects
- Essential Services → Application Services
- Value Streams → Business Functions

---

## Archi tool guidance

### Essential tips and tricks

**Navigation:**
- Use Search Bar in Model Tree (filter by type, property)
- Visualiser shows all relationships for selected element
- Navigator provides drill-down navigation

**Efficiency:**
- Space bar + drag = pan view
- Use Magic Connector for valid relationships
- Drag from Model Tree to add elements to view
- Ctrl+drag (Windows/Linux) or Alt+drag (Mac) to add without relationships

### Recommended plugins

- **coArchi**: Git-based version control for collaboration
- **Database Plugin**: Export/import to PostgreSQL, MySQL, SQLite, Neo4J
- **jArchi Scripts**: Automation for reporting, validation, documentation

### Collaboration patterns

- **Single user**: Local modeling, periodic Git commits
- **Multiple users**: coArchi with defined branches and merge windows
- **Federated**: Centralized baseline, distributed copies per team

---

## Model quality checklist

### Before creating a model
- [ ] Define scope and purpose
- [ ] Identify stakeholders and concerns
- [ ] Select appropriate viewpoints
- [ ] Establish naming conventions
- [ ] Define folder structure

### During modeling
- [ ] Follow naming conventions consistently
- [ ] Use correct element types
- [ ] Model at appropriate abstraction level
- [ ] Reuse existing elements (don't duplicate)
- [ ] Add descriptions to elements
- [ ] Maintain proper relationships

### Model review
- [ ] Elements correctly typed
- [ ] Names follow conventions
- [ ] No orphaned elements
- [ ] No strict layer violations
- [ ] Relationships directionally correct
- [ ] Views tell coherent stories
- [ ] Stakeholder concerns addressed

---

## Conclusion

This reference guide synthesizes authoritative ArchiMate guidance from The Open Group specification, practitioner expertise, and industry-specific implementations. The patterns and practices documented here provide a foundation for creating consistent, high-quality enterprise architecture models.

**Key takeaways for effective ArchiMate modeling:**

1. **Respect the layered structure**: Business → Application → Technology, with services connecting layers
2. **Choose elements deliberately**: Use the decision guides to select appropriate element types
3. **Maintain consistency**: Apply naming conventions and organizational patterns uniformly
4. **Right-size abstraction**: Match detail level to stakeholder needs and viewpoint purpose
5. **Connect to strategy**: Link implementation to capabilities, value streams, and goals
6. **Avoid anti-patterns**: Regularly audit for EA smells and correct quality issues
7. **Use viewpoints purposefully**: Select viewpoints based on stakeholder concerns, not convention

The patterns in this guide can be combined and adapted for specific organizational contexts while maintaining ArchiMate semantic correctness and modeling best practices.