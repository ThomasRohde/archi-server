# ArchiMate Layer Details

Detailed patterns and guidance for each ArchiMate layer.

## Business Layer Patterns

### Actor-Role-Function Pattern

Separating actors from roles provides flexibility for organizational changes.

```
[Business Actor] → [assignment] → [Business Role] → [assignment] → [Business Process/Function]
```

**Key distinctions:**
- **Business Actor**: Specific organizational entity (person, department, partner)
- **Business Role**: Responsibility or "hat" that can be filled by different actors
- **Business Function**: Stable grouping of behavior based on competency or domain
- **Business Process**: Specific sequence with defined start, end, and outcome

### Business Service Pattern

Services expose externally visible behavior to consumers.

```
[Business Role] → [assignment] → [Business Process] → [realization] → [Business Service]
[Business Interface] → [assignment] → [Business Service]
[External Actor] → [served by] → [Business Service]
```

**Naming conventions:**
- Services: Noun phrases with "-ing" ("Payment Processing", "Customer Onboarding")
- Processes: Verb phrases ("Handle Insurance Claim", "Process Order")
- Objects: Nouns ("Insurance Policy", "Customer Record")

### Product Pattern

Products bundle services with agreements for customer consumption.

```
[Business Service(s) + Contract + Application Services] → [aggregation] → [Product]
[Product] → [associated with] → [Value]
[Customer] → [served by] → [Product]
```

### Business Objects and Access Pattern

```
[Business Process/Function] → [access (r/w/rw)] → [Business Object]
[Representation] → [realizes] → [Business Object]
```

**Common mistakes to avoid:**
- Confusing actors with roles
- Using visual nesting without actual relationships
- Not distinguishing internal behavior (processes) from external (services)
- Modeling processes too granularly (use BPMN for detailed workflow)

## Application Layer Patterns

### Basic Application Pattern

```
[Application Component] → [assignment] → [Application Function] → [realization] → [Application Service]
[Application Interface] → [assignment] → [Application Service]
[Consumer] → [served by] → [Application Service] (via Interface)
```

### Data Access Pattern

```
[Application Function/Service] → [access] → [Data Object]
[Data Object] → [realization] → [Business Object] (cross-layer)
[Data Object] ← [realized by] ← [Artifact] (to Technology Layer)
```

### Application Sequence Pattern

```
[Application Event] → [triggers] → [Application Process] → [served by] → [Application Service 1] → [triggers] → [Application Service 2]
```

**Best practices:**
- Use components for deployable, replaceable units
- Functions are internal behavior; services are external contracts
- Show interfaces explicitly when modeling integration points
- Keep services meaningful from consumer perspective

## Technology Layer Patterns

### Basic Node Pattern

```
[Node] → [composition] → [Device + System Software]
[Device] → [assignment] → [System Software]
[System Software] → [assignment] → [Artifact]
```

**Key distinctions:**
- **Node**: Logical computational resource
- **Device**: Physical hardware (server, router)
- **System Software**: OS, middleware, DBMS, container runtime

### Deployment Pattern

```
[Application Component] ← [realized by] ← [Artifact] → [assigned to] → [Node/System Software]
```

This critical cross-layer pattern shows how applications map to infrastructure.

### Network Infrastructure Pattern

```
[Device A] → [connected via] → [Communication Network] → [connected to] → [Device B]
[Communication Network] → [realization] → [Path]
[Node] → [composition] → [Technology Interface]
```

### Virtualization Pattern

```
[Device: Physical Server]
    → [assignment] → [System Software: Hypervisor]
        → [assignment] → [System Software: Virtual OS]
            = [Node: Virtual Host]
```

### Database Pattern

```
[System Software: DBMS] → [realization] → [Technology Service: Database Service]
[Artifact: Data Files] → [assigned to] → [System Software]
[Data Object] ← [realized by] ← [Artifact]
```

## Strategy Layer Patterns

### Capability Modeling

Capabilities represent stable, technology-agnostic abilities. Model at **2-3 levels of decomposition**.

```
[Goal] → [realized by] → [Capability] → [realized by] → [Business Process/Application Component]
[Capability] → [composition] → [Sub-Capability]
[Capability] → [serves] → [Value Stream Stage]
```

**Best practices:**
- Name capabilities using compound nouns or gerunds ("Risk Management", "Customer Onboarding")
- Keep capabilities stable over time; they describe *what* not *how*
- Use capability increments for time-based planning via specialization
- Color-code capabilities by maturity gap for heat map views

### Value Stream Pattern

Value streams show end-to-end value creation from stakeholder perspective.

```
[Value Stream] → [composition] → [Value Stream Stages] (with flow between stages)
[Value Stream Stage] ← [served by] ← [Capability]
[Value Stream] → [realizes] → [Outcome]
[Outcome] → [associated with] → [Value]
```

**Naming convention**: Verb-noun active tense ("Acquire Insurance Product")

### Course of Action Pattern

```
[Driver/Assessment] → [influences] → [Goal] → [realized by] → [Course of Action]
[Course of Action] → [realizes] → [Capability]
[Course of Action] → [associated with] → [Resource]
```

## Physical Layer Patterns

### Manufacturing Pattern

```
[Equipment: Assembly Line] → [assigned to] → [Facility: Factory]
[Material: Raw Materials] ← [accessed by] ← [Equipment] → [produces] → [Material: Product]
```

### Logistics/Distribution Pattern

```
[Facility A] → [connected via] → [Distribution Network] → [connected to] → [Facility B]
[Distribution Network(s)] → [realization] → [Path]
```

### IoT/OT Integration Pattern

```
[Equipment: Sensor] → [served by] → [Technology Service: Data Collection]
[Equipment] → [composed of] → [Device: embedded computer]
[Device] → [assignment] → [System Software: firmware]
```

## Implementation & Migration Patterns

### Program/Project Structure

```
[Work Package: Program]
    → [composition] → [Work Package: Project 1]
        → [composition] → [Work Package: Task 1.1, Task 1.2]
[Business Role: Project Manager] → [assignment] → [Work Package]
```

### Plateau/Gap Pattern

```
[Plateau: Baseline] → [triggers] → [Plateau: Transition 1] → [triggers] → [Plateau: Target]
[Gap: Baseline-to-Transition] → [associated with] → [Plateau: Baseline], [Plateau: Transition 1]
[Gap] → [associated with] → Core elements being added/removed
```

### Roadmap Pattern

```
[Implementation Event: Program Approved] → [triggers] → [Work Package 1] → [triggers] → [Work Package 2]
[Work Package] → [accesses] → [Deliverable: input]
[Work Package] → [realizes] → [Deliverable: output]
[Deliverables] → [realize] → [Plateau]
```

**Color coding for gap analysis:**
- White = unchanged
- Green = new additions
- Orange = modified
- Red = removed/deprecated
