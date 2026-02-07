# Framework Integration Patterns

How ArchiMate integrates with enterprise architecture frameworks.

## ArchiMate and TOGAF

TOGAF is The Open Group's enterprise architecture framework. ArchiMate provides the modeling language for TOGAF artifacts.

### ADM Phase Mapping

| TOGAF ADM Phase | ArchiMate Support |
|-----------------|-------------------|
| **Preliminary** | Strategy, Motivation elements |
| **Phase A: Architecture Vision** | Goals, Stakeholders, Drivers |
| **Phase B: Business Architecture** | Business Layer elements |
| **Phase C: Information Systems** | Application Layer elements |
| **Phase D: Technology Architecture** | Technology Layer elements |
| **Phase E: Opportunities & Solutions** | Gap relationships, Assessment |
| **Phase F: Migration Planning** | Implementation & Migration elements |
| **Phase G: Implementation Governance** | Work Package, Deliverable |
| **Phase H: Architecture Change Management** | Plateau, Gap analysis |

### Content Metamodel Mapping

| TOGAF Content | ArchiMate Element |
|---------------|-------------------|
| Organization Unit | Business Actor |
| Business Service | Business Service |
| Information System Service | Application Service |
| Platform Service | Technology Service |
| Data Entity | Data Object |
| Application Component | Application Component |
| Technology Component | Node, Device, System Software |
| Physical Data Component | Artifact |

### Artifact Generation

**Architecture Vision Document:**
```
[Stakeholder] → [has] → [Driver] → [influences] → [Goal]
[Goal] → [realized by] → [Capability]
[Capability] → [associated with] → [Value]
```

**Business Architecture:**
```
[Business Actor] → [assignment] → [Business Role]
[Business Role] → [assignment] → [Business Process]
[Business Process] → [realization] → [Business Service]
[Business Process] → [access] → [Business Object]
```

**Information Systems Architecture:**
```
[Application Component] → [realization] → [Application Service]
[Application Service] → [serves] → [Business Process]
[Application Component] → [access] → [Data Object]
[Data Object] → [realizes] → [Business Object]
```

**Technology Architecture:**
```
[Node] → [composition] → [Device + System Software]
[Artifact] → [realizes] → [Application Component]
[Artifact] → [assigned to] → [Node]
[Technology Service] → [serves] → [Application Component]
```

## ArchiMate and BPMN

BPMN (Business Process Model and Notation) provides detailed process modeling. ArchiMate provides enterprise context.

### Level of Detail

- **ArchiMate**: High-level enterprise process context (Level 1-2)
- **BPMN**: Detailed workflow and executable specifications (Level 3-4)

### Element Mapping

| ArchiMate | BPMN |
|-----------|------|
| Business Process | Process/Sub-process |
| Business Event | Start/End/Intermediate Event |
| Business Actor/Role | Pool/Lane |
| Junction | Gateway |
| Flow Relationship | Sequence Flow |
| Business Object | Data Object |
| Triggering | Message Flow (between pools) |

### Integration Pattern

```
# ArchiMate Level (Enterprise Context)
[Business Role: Claims Handler]
    → [assignment] → [Business Process: Handle Insurance Claim]
        → [realization] → [Business Service: Claims Processing]

# BPMN Level (Detailed Workflow) - Referenced
[Business Process: Handle Insurance Claim]
    → [associated with] → [External Reference: BPMN Diagram "claim-handling.bpmn"]
```

### Best Practices

1. Use ArchiMate for process context and relationships
2. Use BPMN for detailed workflow when needed
3. Maintain trace relationships between levels
4. Don't duplicate process logic in both notations

## ArchiMate and IT4IT

IT4IT is The Open Group's reference architecture for IT management.

### IT4IT Value Streams in ArchiMate

IT4IT uses ArchiMate as its modeling language:
- **Functional Components** → Application Components
- **Data Objects** → ArchiMate Data Objects
- **Essential Services** → Application Services
- **Value Streams** → Business Functions

### IT4IT Value Stream Mapping

```
# Strategy to Portfolio
[Value Stream: Strategy to Portfolio]
    → [composition] → [Value Stream Stage: Demand]
    → [composition] → [Value Stream Stage: Portfolio]

[Application Component: IT Portfolio Management]
    → [realizes] → [Application Service: Portfolio Service]
    → [serves] → [Value Stream Stage: Portfolio]

# Requirement to Deploy
[Value Stream: Requirement to Deploy]
    → [composition] → [Value Stream Stage: Design]
    → [composition] → [Value Stream Stage: Build]
    → [composition] → [Value Stream Stage: Test]
    → [composition] → [Value Stream Stage: Deploy]

# Request to Fulfill
[Value Stream: Request to Fulfill]
    → [serves] → [Business Actor: IT Consumer]

# Detect to Correct
[Value Stream: Detect to Correct]
    → [serves] → [Goal: Service Reliability]
```

### IT4IT Data Objects

```
[Data Object: Conceptual Service Blueprint]
    → [realizes] → [Business Object: IT Service]

[Data Object: Service Release Blueprint]
    → [realizes] → [Data Object: Conceptual Service Blueprint]

[Data Object: Service Release Package]
    → [realizes] → [Data Object: Service Release Blueprint]
```

## ArchiMate and SAFe

SAFe (Scaled Agile Framework) can be mapped to ArchiMate for architecture alignment.

### SAFe Levels to ArchiMate

| SAFe Level | ArchiMate Elements |
|------------|-------------------|
| Portfolio | Capability, Value Stream, Course of Action |
| Large Solution | Application Component (Solution), Business Service |
| Program | Work Package (Program Increment), Deliverable (Feature) |
| Team | Business Role (Team), Work Package (Sprint) |

### Epic to Architecture Mapping

```
[Course of Action: Business Epic]
    → [realizes] → [Capability: Target Capability]
    → [associated with] → [Work Package: Implementation]

[Work Package: Feature]
    → [realizes] → [Deliverable: Increment]
    → [realizes] → [Application Component: System Change]
```

### Architectural Runway

```
[Capability: Architectural Runway]
    → [realized by] → [Application Component: Platform Services]
    → [realized by] → [Technology Service: Infrastructure Services]

[Work Package: Enabler Epic]
    → [realizes] → [Capability: Architectural Runway]
```

## ArchiMate and Zachman

The Zachman Framework provides a classification scheme that maps to ArchiMate.

### Zachman Columns to ArchiMate

| Zachman Column | ArchiMate Focus |
|----------------|-----------------|
| What (Data) | Business Object, Data Object, Artifact |
| How (Function) | Process, Function, Service |
| Where (Network) | Location, Node, Communication Network |
| Who (People) | Actor, Role, Interface |
| When (Time) | Event, Plateau, Work Package |
| Why (Motivation) | Goal, Requirement, Driver |

### Zachman Rows to ArchiMate Abstraction

| Zachman Row | ArchiMate Level |
|-------------|-----------------|
| Scope (Planner) | Strategy, Motivation |
| Business Model (Owner) | Business Layer |
| System Model (Designer) | Application Layer |
| Technology Model (Builder) | Technology Layer |
| Detailed Representations | Artifacts, detailed specs |
| Functioning Enterprise | Actual implementation |

## ArchiMate and COBIT

COBIT governance framework maps to ArchiMate for IT governance modeling.

### COBIT Domains to ArchiMate

| COBIT Domain | ArchiMate Elements |
|--------------|-------------------|
| Evaluate, Direct, Monitor (EDM) | Goal, Assessment, Principle |
| Align, Plan, Organize (APO) | Capability, Course of Action, Resource |
| Build, Acquire, Implement (BAI) | Work Package, Deliverable, Plateau |
| Deliver, Service, Support (DSS) | Business Service, Application Service |
| Monitor, Evaluate, Assess (MEA) | Assessment, Constraint |

### Control Objective Mapping

```
[Driver: Regulatory Compliance]
    → [influences] → [Goal: IT Governance]
        → [realized by] → [Requirement: Control Objective]
            → [realized by] → [Business Process: Control Activity]
                → [access] → [Data Object: Control Evidence]
```

## Integration Best Practices

### General Guidelines

1. **Choose primary framework**: Select one framework as primary, others as complementary
2. **Map at appropriate levels**: Don't force detailed mappings where not needed
3. **Maintain traceability**: Document relationships between frameworks
4. **Use ArchiMate as visual language**: Even when using other frameworks for structure

### Common Integration Patterns

**Framework-to-ArchiMate:**
```
[External Reference: Framework Artifact]
    → [associated with] → [ArchiMate Element]
```

**Cross-Framework Alignment:**
```
[Capability: ArchiMate Capability]
    → [realized by] → [Work Package: SAFe Epic]
    → [associated with] → [External Reference: TOGAF Building Block]
```

### Documentation Pattern

When integrating frameworks, document:
1. Which framework provides structure
2. How ArchiMate models represent framework concepts
3. Mapping rules and conventions
4. Tools and automation used
