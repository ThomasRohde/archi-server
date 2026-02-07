---
name: archimate-patterns
description: This skill should be used when the user asks about "ArchiMate patterns", "microservices in ArchiMate", "cloud architecture ArchiMate", "API gateway pattern", "event-driven architecture", "container architecture", "Kubernetes ArchiMate", "data architecture pattern", "security architecture", "capability mapping", "value stream", or needs to model modern architecture patterns in ArchiMate.
---

# ArchiMate Architecture Patterns

This skill provides patterns for modeling modern architectures in ArchiMate.

## Microservices Architecture

**Element mapping:**
- Individual microservices → **Application Component**
- Business functionality → **Application Service**
- REST/gRPC endpoints → **Application Interface**
- Docker images → **Artifact**
- Kubernetes pods/namespaces → **Node**
- Container runtime → **System Software**

**Basic pattern:**
```
[Application Component: Order Service] → [realizes] → [Application Service: Order Processing]
    → [composition] → [Application Function: Validate Order]
    → [composition] → [Application Function: Process Payment]
    → [serves] → [Application Interface: Order API (REST)]
```

**Container orchestration:**
```
[Node: Kubernetes Cluster]
    → [composition] → [Node: Namespace]
        → [composition] → [Node: Pod]
            → [assigned to] → [Artifact: Container Image]
```

**Key principle**: Model microservices at **Application Layer**, not Technology Layer.

## API and Integration Patterns

**API Gateway:**
```
[Technology Node: API Gateway]
    → [assignment] → [Technology Function: Request Routing]
    → [realization] → [Technology Service: API Management]
    → [serves] → [Application Component: Backend Service]
```

**Message Queue/Event Bus:**
```
[Application Component: Message Broker]
    → [realization] → [Application Service: Async Messaging]
    → [served by] → [Application Interface: Topic/Queue Endpoint]
[Application Component: Producer] → [flow (labeled)] → [Application Component: Consumer]
```

## Cloud Infrastructure Patterns

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

**Serverless:**
```
[Technology Service: Lambda/Functions] → [assigned to] → [Artifact: Function Code]
[Technology Interface: API Gateway Trigger] → [triggers] → [Application Event]
```

**Multi-cloud:** Use **Location** elements for cloud providers/regions, **Groupings** for provider-specific services.

## Event-Driven Architecture

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

## Strategy Layer Patterns

**Capability modeling:**
```
[Goal] → [realized by] → [Capability] → [realized by] → [Business Process/Application Component]
[Capability] → [composition] → [Sub-Capability]
[Capability] → [serves] → [Value Stream Stage]
```

**Value stream:**
```
[Value Stream] → [composition] → [Value Stream Stages] (with flow between stages)
[Value Stream Stage] ← [served by] ← [Capability]
[Value Stream] → [realizes] → [Outcome]
```

**Capability-to-application mapping:**
```
[Capability: Customer Management]
    ← [realized by] ← [Business Process: Handle Customer Inquiry]
    ← [realized by] ← [Application Component: CRM System]
```

## Data Architecture Patterns

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

**Key principle**: Separate conceptual (Business Object), logical (Data Object), and physical (Artifact) levels.

## Security Architecture Patterns

**Identity and access management:**
```
[Application Component: Identity Provider]
    → [realizes] → [Application Service: Authentication Service]
    → [realizes] → [Application Service: Authorization Service]
    → [serves] → [Application Component: Protected Application]
```

**Security zones:** Use **Location** or **Grouping** for security boundaries (DMZ, Internal, External). Model firewalls as **Technology Interface** elements.

**Zero-trust:**
```
[Principle: Never Trust, Always Verify]
    → [influences] → [Requirement: Continuous Authentication]
    → [realizes] → [Application Service: Identity Verification]
```

## Additional Resources

### Reference Files

For complete pattern catalog with industry-specific patterns:
- **`references/patterns-catalog.md`** - Extended patterns: BIAN, GDPR, HL7/FHIR, EIRA
- **`references/application-integration.md`** - 10 application integration pattern alternatives
