# ArchiMate Element Catalog

Complete reference for all 56 ArchiMate elements organized by layer.

## Motivation Layer Elements

### Stakeholder
**Purpose**: Represents the role of an individual, team, or organization that has interests in the architecture.
**Usage**: Model who cares about goals, requirements, and outcomes.
**Example**: `[Stakeholder: CIO]`, `[Stakeholder: Customer]`

### Driver
**Purpose**: Represents an external or internal condition that motivates an organization to define goals.
**Usage**: Model factors driving change (regulations, competition, technology trends).
**Example**: `[Driver: Digital Transformation]`, `[Driver: GDPR Compliance]`

### Assessment
**Purpose**: Represents the result of an analysis of the state of affairs with respect to a driver.
**Usage**: Model SWOT items, gap analysis results.
**Example**: `[Assessment: Legacy System Risk]`

### Goal
**Purpose**: Represents a high-level statement of intent or direction.
**Usage**: Model strategic objectives and desired outcomes.
**Example**: `[Goal: Improve Customer Experience]`

### Outcome
**Purpose**: Represents an end result that has been achieved.
**Usage**: Model measurable business results.
**Example**: `[Outcome: 20% Cost Reduction]`

### Principle
**Purpose**: Represents a qualitative statement of intent that guides design decisions.
**Usage**: Model architecture principles and design guidelines.
**Example**: `[Principle: Buy Before Build]`

### Requirement
**Purpose**: Represents a statement of need that must be met by the architecture.
**Usage**: Model functional and non-functional requirements.
**Example**: `[Requirement: 99.9% Availability]`

### Constraint
**Purpose**: Represents a factor that limits the realization of goals.
**Usage**: Model restrictions on architecture choices.
**Example**: `[Constraint: Budget Limit]`

### Meaning
**Purpose**: Represents the knowledge or expertise present in a business object or representation.
**Usage**: Model semantic interpretation of data.
**Example**: `[Meaning: Credit Score Interpretation]`

### Value
**Purpose**: Represents the relative worth, utility, or importance of an element.
**Usage**: Model business value delivered by services/products.
**Example**: `[Value: Customer Convenience]`

## Strategy Layer Elements

### Resource
**Purpose**: Represents an asset owned or controlled by an organization.
**Usage**: Model people, information, money, or other assets.
**Example**: `[Resource: IT Budget]`, `[Resource: Data Scientists]`

### Capability
**Purpose**: Represents an ability that an organization possesses.
**Usage**: Model what the enterprise can do (stable over time).
**Example**: `[Capability: Risk Management]`, `[Capability: Customer Analytics]`

### Value Stream
**Purpose**: Represents a sequence of activities that creates an overall result for a customer/stakeholder.
**Usage**: Model end-to-end value creation.
**Example**: `[Value Stream: Order to Cash]`

### Course of Action
**Purpose**: Represents an approach or plan for configuring capabilities and resources.
**Usage**: Model strategic initiatives and programs.
**Example**: `[Course of Action: Cloud Migration Program]`

## Business Layer Elements

### Business Actor
**Purpose**: Represents a business entity that is capable of performing behavior.
**Usage**: Model specific organizational entities (people, departments, partners).
**Example**: `[Business Actor: Sales Department]`, `[Business Actor: Partner Bank]`

### Business Role
**Purpose**: Represents the responsibility for performing specific behavior.
**Usage**: Model responsibilities that can be assigned to different actors.
**Example**: `[Business Role: Claims Handler]`, `[Business Role: Account Manager]`

### Business Collaboration
**Purpose**: Represents an aggregate of two or more business roles that work together.
**Usage**: Model collaborative relationships.
**Example**: `[Business Collaboration: Sales Team]`

### Business Interface
**Purpose**: Represents a point of access where business services are made available.
**Usage**: Model channels for service delivery.
**Example**: `[Business Interface: Call Center]`, `[Business Interface: Branch Office]`

### Business Process
**Purpose**: Represents a sequence of behaviors that achieves a specific result.
**Usage**: Model workflows with defined start, end, and outcome.
**Example**: `[Business Process: Handle Insurance Claim]`

### Business Function
**Purpose**: Represents a collection of behavior based on a chosen set of criteria.
**Usage**: Model ongoing capabilities grouped by domain.
**Example**: `[Business Function: Financial Management]`

### Business Interaction
**Purpose**: Represents a unit of collective behavior performed by a collaboration.
**Usage**: Model behavior involving multiple roles.
**Example**: `[Business Interaction: Contract Negotiation]`

### Business Event
**Purpose**: Represents an organizational state change.
**Usage**: Model triggers for processes.
**Example**: `[Business Event: Order Received]`

### Business Service
**Purpose**: Represents explicitly defined behavior that a business role exposes to its environment.
**Usage**: Model external-facing business capabilities.
**Example**: `[Business Service: Payment Processing]`

### Business Object
**Purpose**: Represents a concept used within a particular business domain.
**Usage**: Model business-level information concepts.
**Example**: `[Business Object: Customer]`, `[Business Object: Insurance Policy]`

### Contract
**Purpose**: Represents a formal agreement between parties.
**Usage**: Model SLAs, agreements, terms.
**Example**: `[Contract: Service Level Agreement]`

### Representation
**Purpose**: Represents a perceptible form of information.
**Usage**: Model documents, forms, messages.
**Example**: `[Representation: Invoice Document]`

### Product
**Purpose**: Represents a coherent collection of services and/or objects, offered as a whole.
**Usage**: Model bundled offerings to customers.
**Example**: `[Product: Premium Banking Package]`

## Application Layer Elements

### Application Component
**Purpose**: Represents an encapsulation of application functionality.
**Usage**: Model deployable software units.
**Example**: `[Application Component: CRM System]`, `[Application Component: Order Service]`

### Application Collaboration
**Purpose**: Represents an aggregate of application components working together.
**Usage**: Model application integrations.
**Example**: `[Application Collaboration: Payment Gateway Integration]`

### Application Interface
**Purpose**: Represents a point of access where application services are made available.
**Usage**: Model APIs, web interfaces, protocols.
**Example**: `[Application Interface: REST API]`, `[Application Interface: Web Portal]`

### Application Function
**Purpose**: Represents automated behavior performed by an application component.
**Usage**: Model internal application capabilities.
**Example**: `[Application Function: Calculate Premium]`

### Application Interaction
**Purpose**: Represents a unit of collective behavior performed by application components.
**Usage**: Model behavior requiring multiple applications.
**Example**: `[Application Interaction: Payment Authorization]`

### Application Process
**Purpose**: Represents a sequence of application behaviors achieving a specific result.
**Usage**: Model automated workflows within applications.
**Example**: `[Application Process: Order Fulfillment]`

### Application Event
**Purpose**: Represents an application state change.
**Usage**: Model triggers for application behavior.
**Example**: `[Application Event: Transaction Completed]`

### Application Service
**Purpose**: Represents explicitly defined behavior exposed to users or other applications.
**Usage**: Model external-facing application capabilities.
**Example**: `[Application Service: Customer Data Service]`

### Data Object
**Purpose**: Represents data structured for automated processing.
**Usage**: Model logical data entities.
**Example**: `[Data Object: Customer Record]`, `[Data Object: Order Entity]`

## Technology Layer Elements

### Node
**Purpose**: Represents a computational or physical resource.
**Usage**: Model logical infrastructure (can contain devices and system software).
**Example**: `[Node: Application Server]`, `[Node: Kubernetes Cluster]`

### Device
**Purpose**: Represents a physical IT resource.
**Usage**: Model physical hardware.
**Example**: `[Device: Web Server]`, `[Device: Storage Array]`

### System Software
**Purpose**: Represents software that provides an environment for running other software.
**Usage**: Model OS, middleware, DBMS, container runtime.
**Example**: `[System Software: Linux]`, `[System Software: PostgreSQL]`

### Technology Collaboration
**Purpose**: Represents an aggregate of nodes working together.
**Usage**: Model distributed infrastructure.
**Example**: `[Technology Collaboration: Database Cluster]`

### Technology Interface
**Purpose**: Represents a point of access where technology services are available.
**Usage**: Model protocols, ports, APIs.
**Example**: `[Technology Interface: HTTPS Port 443]`

### Path
**Purpose**: Represents a link between two or more nodes.
**Usage**: Model communication channels.
**Example**: `[Path: VPN Connection]`

### Communication Network
**Purpose**: Represents a set of structures connecting nodes for transmission.
**Usage**: Model network infrastructure.
**Example**: `[Communication Network: Corporate LAN]`

### Technology Function
**Purpose**: Represents a collection of technology behavior.
**Usage**: Model infrastructure capabilities.
**Example**: `[Technology Function: Data Backup]`

### Technology Process
**Purpose**: Represents a sequence of technology behavior achieving a result.
**Usage**: Model automated infrastructure processes.
**Example**: `[Technology Process: Automated Scaling]`

### Technology Interaction
**Purpose**: Represents a unit of collective technology behavior.
**Usage**: Model behavior requiring multiple nodes.
**Example**: `[Technology Interaction: Cluster Synchronization]`

### Technology Event
**Purpose**: Represents a technology state change.
**Usage**: Model infrastructure triggers.
**Example**: `[Technology Event: Server Failure]`

### Technology Service
**Purpose**: Represents explicitly defined technology behavior exposed to applications.
**Usage**: Model infrastructure services.
**Example**: `[Technology Service: Database Service]`, `[Technology Service: Message Queue]`

### Artifact
**Purpose**: Represents a piece of data used or produced by technology behavior.
**Usage**: Model deployable files, configurations, data files.
**Example**: `[Artifact: Docker Image]`, `[Artifact: Configuration File]`

## Physical Layer Elements

### Equipment
**Purpose**: Represents one or more physical machines or tools.
**Usage**: Model manufacturing or operational equipment.
**Example**: `[Equipment: Assembly Line]`

### Facility
**Purpose**: Represents a physical structure housing equipment.
**Usage**: Model buildings, data centers, factories.
**Example**: `[Facility: Data Center]`, `[Facility: Warehouse]`

### Distribution Network
**Purpose**: Represents a physical network for transporting materials.
**Usage**: Model logistics infrastructure.
**Example**: `[Distribution Network: Supply Chain]`

### Material
**Purpose**: Represents tangible physical matter.
**Usage**: Model raw materials, products, resources.
**Example**: `[Material: Raw Components]`

## Implementation & Migration Layer Elements

### Work Package
**Purpose**: Represents a series of actions to achieve a result within defined time/resources.
**Usage**: Model projects, tasks, initiatives.
**Example**: `[Work Package: CRM Implementation Project]`

### Deliverable
**Purpose**: Represents a precisely defined outcome of a work package.
**Usage**: Model project outputs.
**Example**: `[Deliverable: System Documentation]`

### Implementation Event
**Purpose**: Represents a state change related to implementation.
**Usage**: Model project milestones.
**Example**: `[Implementation Event: Go-Live]`

### Plateau
**Purpose**: Represents a relatively stable state of the architecture at a point in time.
**Usage**: Model baseline, transition, and target states.
**Example**: `[Plateau: Current State]`, `[Plateau: Target Architecture]`

### Gap
**Purpose**: Represents a statement of difference between two plateaus.
**Usage**: Model what changes between states.
**Example**: `[Gap: Legacy System Retirement]`
