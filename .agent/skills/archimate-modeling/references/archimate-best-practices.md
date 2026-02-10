# ArchiMate Best Practices Reference

## Naming Conventions

### Structural Elements (Noun Phrases)
- Business Actor: "Customer", "Supplier", "IT Department"
- Business Role: "Account Manager", "Claims Processor"
- Application Component: "CRM System", "Payment Gateway"
- Node: "Application Server", "Database Cluster"
- Data Object: "Customer Record", "Invoice"

### Behavioral Elements (Verb Phrases)
- Business Process: "Handle Insurance Claim", "Process Order"
- Business Function: "Financial Management", "Customer Support"
- Application Function: "Calculate Premium", "Validate Payment"
- Business Service: "Claims Handling", "Account Management"
- Application Service: "Customer Data Retrieval", "Payment Processing"

### Motivation Elements (Descriptive Phrases)
- Goal: "Increase Customer Satisfaction", "Reduce Operating Costs by 20%"
- Principle: "Information Security", "Single Source of Truth"
- Requirement: "99.9% Uptime SLA", "GDPR Compliance"
- Driver: "Digital Transformation", "Regulatory Compliance"
- Stakeholder: "Board of Directors", "End Users"

### Key Naming Rules
1. Use **Title Case** for all element names
2. Avoid technical jargon in business layer names
3. Be specific: "Customer Onboarding" not "Process 1"
4. Avoid abbreviations unless universally understood (API, CRM)
5. Relationship names use lowercase verb phrases: "sends order to", "provides data for"

## Layer Structure and Integration

### The ArchiMate Stack

```
Motivation Layer     (WHY)     Drivers, Goals, Requirements
Strategy Layer       (WHAT)    Capabilities, Value Streams, Resources
Business Layer       (WHO/HOW) Actors, Processes, Services, Objects
Application Layer    (WITH)    Components, Services, Data Objects
Technology Layer     (ON)      Nodes, Devices, Networks, Artifacts
Implementation Layer (WHEN)    Work Packages, Deliverables, Plateaus
```

### Cross-Layer Connection Pattern

Layers connect through **services**. Never connect elements directly across non-adjacent layers.

**Correct pattern:**
```
Business Process
    |-- (served by) --> Application Service
                           |-- (realized by) --> Application Component
                                                    |-- (served by) --> Technology Service
                                                                          |-- (realized by) --> Node
```

**Wrong:** Business Process --> Node (skips Application layer)

### Service Realization Pattern

Every service should be realized by behavioral or structural elements in the same layer:

```
Application Component --realizes--> Application Service --serves--> Business Process
Technology Node --realizes--> Technology Service --serves--> Application Component
```

## Relationship Guidelines

### When to Use Each Relationship

| Scenario | Relationship | Direction |
|----------|-------------|-----------|
| A team performs a process | Assignment | Actor/Role --> Process |
| A component provides a service | Realization | Component --> Service |
| A service is used by a consumer | Serving | Service --> Consumer |
| A process reads/writes data | Access | Process --> Data Object |
| One process triggers another | Triggering | Process A --> Process B |
| Data moves between processes | Flow | Process A --> Process B |
| A component is part of a system | Composition | System --> Component |
| A portfolio contains items | Aggregation | Portfolio --> Item |
| Goal drives principle | Influence | Driver --> Goal |
| A subtype of something | Specialization | Child --> Parent |
| Generic link, no specific meaning | Association | Either direction |

### Relationship Validity Rules

1. **Composition/Aggregation**: Only between same-type elements (e.g., Component-Component)
2. **Assignment**: Active structure to behavioral (Actor --> Process)
3. **Realization**: Same layer, behavioral/structural to passive/service
4. **Serving**: Cross-layer allowed; arrow points toward consumer
5. **Access**: Behavioral to passive structure (Process --> Data Object)
6. **Triggering**: Between behavioral elements (Process --> Process)
7. **Flow**: Between behavioral elements; always label what flows
8. **Specialization**: Same-type elements only (Component --> Component)
9. **Influence**: Primarily motivation layer; can cross to core elements

### Relationship Direction Conventions

- **Serving**: Source provides, target consumes (arrow toward consumer)
- **Realization**: Source realizes, target is abstract concept
- **Triggering**: Source triggers, target is triggered
- **Flow**: Source sends, target receives
- **Composition/Aggregation**: Source is whole, target is part
- **Assignment**: Source is performer, target is behavior

## Viewpoint Selection Guide

### When to Use Each Viewpoint

| Need | Viewpoint | Focus |
|------|-----------|-------|
| Show business processes and actors | Organization | Business structure |
| Show how processes collaborate | Business Process Cooperation | Process interactions |
| Show app-to-app dependencies | Application Cooperation | Integration landscape |
| Map apps to business processes | Application Usage | App-business alignment |
| Show complete stack per service | Layered | Cross-layer realization |
| Show deployment architecture | Implementation and Deployment | Runtime infrastructure |
| Show goals and requirements | Motivation | Why decisions are made |
| Show capability landscape | Capability | Strategic capabilities |
| Show migration timeline | Migration | Transitional architectures |
| Show project deliverables | Project | Implementation planning |
| Show data structure | Information Structure | Data model |
| Show service chains | Service Realization | End-to-end services |

### View Sizing Guidelines

- **Target**: ~20 elements per view (comfortable readability)
- **Maximum**: 40 elements (beyond this, split into sub-views)
- **Minimum**: 5 elements (if fewer, consider merging with another view)
- **Connections**: Keep to ~2x element count (avoid spaghetti diagrams)

## Common Patterns

### Pattern 1: Application Integration

```
App A --realizes--> App Service A
                        |
                        |-- (flow: "customer data") --> App Service B
                                                           |
                                                    App B --realizes-->
```

### Pattern 2: Business-Application Alignment

```
Business Actor --assigned to--> Business Process
                                      |
                                      |-- (served by) --> Application Service
                                                              |
                                                       Application Component --realizes-->
```

### Pattern 3: Capability to Application Mapping

```
Capability --realized by--> Business Process --served by--> Application Service
                                                                  |
                                                           Application Component --realizes-->
```

### Pattern 4: Technology Stack

```
Application Component
    |-- (served by) --> Technology Service (e.g., "Container Hosting")
                             |-- (realized by) --> System Software (e.g., "Kubernetes")
                                                       |-- (assigned to) --> Node (e.g., "Cloud VM")
                                                                                |-- (assigned to) --> Device (e.g., "x86 Server")
```

### Pattern 5: Motivation Chain

```
Stakeholder --has--> Driver --influences--> Goal --realized by--> Requirement --realized by--> Constraint
                                             |
                                             |-- (realized by) --> Principle
```

## Anti-Patterns to Avoid

### 1. God Component
**Problem**: One application-component with 20+ relationships
**Fix**: Decompose into sub-components with specific responsibilities

### 2. Orphaned Elements
**Problem**: Elements with no relationships (disconnected from model)
**Fix**: Connect to at least one other element or remove if unused

### 3. Layer Violation
**Problem**: Business Process directly connected to Node
**Fix**: Insert Application and Technology services between layers

### 4. Missing Services
**Problem**: Components connected directly to processes in other layers
**Fix**: Always use Service elements as the interface between layers

### 5. Spaghetti View
**Problem**: View with 50+ elements and 100+ connections
**Fix**: Split into focused sub-views; use viewpoints to constrain scope

### 6. Wrong Relationship Type
**Problem**: Using Association when Serving or Realization is appropriate
**Fix**: Choose the most specific relationship type that fits the semantics

### 7. Reversed Relationships
**Problem**: Flow or Serving pointing the wrong direction
**Fix**: Serving points toward consumer; Flow points toward receiver

### 8. Actors as Roles
**Problem**: "Sales Manager" modeled as Business Actor instead of Business Role
**Fix**: Business Actor = specific person/org; Business Role = responsibility/function assigned to actors

### 9. Processes as Functions
**Problem**: "Customer Management" modeled as Business Process
**Fix**: Processes have clear start/end; Functions are ongoing. "Handle Complaint" = Process; "Customer Management" = Function

### 10. No Documentation
**Problem**: Elements with names only, no description
**Fix**: Add documentation to every element explaining its purpose and scope

## Model Organization

### Recommended Folder Structure

```
Business/
  Actors & Roles/
  Processes/
  Services/
  Objects/
Application/
  Components/
  Services/
  Data Objects/
Technology/
  Infrastructure/
  Services/
  Artifacts/
Strategy/
  Capabilities/
  Value Streams/
Motivation/
  Goals & Drivers/
  Requirements/
Implementation/
  Work Packages/
  Plateaus/
Relations/
  (auto-managed by Archi)
Views/
  Business Views/
  Application Views/
  Technology Views/
  Cross-Layer Views/
  Strategy Views/
```

### Properties for Metadata

Use `setProperty` to enrich elements with metadata:

| Property Key | Example Values | Purpose |
|-------------|---------------|---------|
| `lifecycle-status` | `Planning`, `Development`, `Production`, `Retiring` | Element lifecycle tracking |
| `maturity` | `Gap`, `Initial`, `Developing`, `Mature`, `Optimized` | Capability maturity |
| `owner` | `IT Department`, `Business Unit A` | Ownership |
| `cost-center` | `CC-1234` | Financial tracking |
| `criticality` | `High`, `Medium`, `Low` | Business criticality |
| `data-classification` | `Public`, `Internal`, `Confidential`, `Restricted` | Data governance |
| `compliance` | `SOX`, `GDPR`, `HIPAA` | Regulatory compliance |

## Quality Checklist

Before finalizing a model, verify:

- [ ] Every element has correct type (not just "Grouping" for everything)
- [ ] Naming follows conventions (Title Case, verb vs noun phrases)
- [ ] No orphaned elements (everything has at least one relationship)
- [ ] No layer violations (services connect layers, not direct links)
- [ ] Relationships use correct types (not just Association everywhere)
- [ ] Serving relationships point toward consumer
- [ ] Flow relationships are labeled with what flows
- [ ] Views use appropriate viewpoints matching their content
- [ ] Views have ~20 elements (not overloaded)
- [ ] Documentation exists for key elements
- [ ] Folder organization is consistent
- [ ] Properties are set for governance metadata
