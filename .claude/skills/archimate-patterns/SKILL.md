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

---

## Instantiating Patterns via the API

To create pattern elements and relationships in Archi, use the Archi Model API Server. Load the **archi-server-api** skill for full API workflow details.

### Pattern Execution Steps

1. **Health check**: `curl -s http://localhost:8765/health`
2. **Search for existing elements** that overlap with the pattern
3. **Batch create** all elements + relationships in one `/model/apply` call (tempId cross-references work within a batch)
4. **Poll** for real IDs
5. **Create view**, add elements, add connections, auto-layout
6. **Save**

### tempId Naming Conventions for Patterns

Use pattern-specific prefixes to keep IDs organized:

| Pattern | Element prefix | Relationship prefix |
|---------|----------------|---------------------|
| Microservices | `ms-[service]` | `ms-r[n]` |
| API Gateway | `gw-[component]` | `gw-r[n]` |
| Event-Driven | `ed-[component]` | `ed-r[n]` |
| Cloud | `cl-[resource]` | `cl-r[n]` |
| Capability | `cap-[name]` | `cap-r[n]` |
| Value Stream | `vs-[stage]` | `vs-r[n]` |
| Cross-Layer | `b-`, `a-`, `t-` | `xl-r[n]` |
| Security | `sec-[component]` | `sec-r[n]` |

### Microservices Pattern — Full Executable

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createElement", "type": "application-component", "name": "API Gateway", "tempId": "ms-gw", "documentation": "Entry point for all client requests"},
      {"op": "createElement", "type": "application-component", "name": "Order Service", "tempId": "ms-order", "documentation": "Handles order lifecycle management"},
      {"op": "createElement", "type": "application-component", "name": "Inventory Service", "tempId": "ms-inv", "documentation": "Manages product inventory and stock"},
      {"op": "createElement", "type": "application-component", "name": "Payment Service", "tempId": "ms-pay", "documentation": "Processes payment transactions"},
      {"op": "createElement", "type": "application-service", "name": "Order Management", "tempId": "ms-order-svc"},
      {"op": "createElement", "type": "application-service", "name": "Inventory Management", "tempId": "ms-inv-svc"},
      {"op": "createElement", "type": "application-service", "name": "Payment Processing", "tempId": "ms-pay-svc"},
      {"op": "createElement", "type": "application-interface", "name": "Order API", "tempId": "ms-order-api"},
      {"op": "createElement", "type": "application-interface", "name": "Inventory API", "tempId": "ms-inv-api"},
      {"op": "createElement", "type": "application-interface", "name": "Payment API", "tempId": "ms-pay-api"},
      {"op": "createElement", "type": "application-event", "name": "Order Created", "tempId": "ms-evt-order"},
      {"op": "createElement", "type": "application-event", "name": "Payment Received", "tempId": "ms-evt-pay"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "ms-gw", "targetId": "ms-order", "tempId": "ms-r1"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "ms-gw", "targetId": "ms-inv", "tempId": "ms-r2"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "ms-gw", "targetId": "ms-pay", "tempId": "ms-r3"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ms-order", "targetId": "ms-order-svc", "tempId": "ms-r4"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ms-inv", "targetId": "ms-inv-svc", "tempId": "ms-r5"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ms-pay", "targetId": "ms-pay-svc", "tempId": "ms-r6"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "ms-order", "targetId": "ms-order-api", "tempId": "ms-r7"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "ms-inv", "targetId": "ms-inv-api", "tempId": "ms-r8"},
      {"op": "createRelationship", "type": "assignment-relationship", "sourceId": "ms-pay", "targetId": "ms-pay-api", "tempId": "ms-r9"},
      {"op": "createRelationship", "type": "triggering-relationship", "sourceId": "ms-order", "targetId": "ms-evt-order", "tempId": "ms-r10"},
      {"op": "createRelationship", "type": "triggering-relationship", "sourceId": "ms-pay", "targetId": "ms-evt-pay", "tempId": "ms-r11"},
      {"op": "createRelationship", "type": "flow-relationship", "sourceId": "ms-evt-order", "targetId": "ms-inv", "name": "Order Data", "tempId": "ms-r12"},
      {"op": "createRelationship", "type": "flow-relationship", "sourceId": "ms-evt-order", "targetId": "ms-pay", "name": "Payment Request", "tempId": "ms-r13"}
    ]
  }'
```

### Event-Driven / CQRS Pattern — Full Executable

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createElement", "type": "application-component", "name": "Command Service", "tempId": "ed-cmd", "documentation": "Handles write operations"},
      {"op": "createElement", "type": "application-component", "name": "Query Service", "tempId": "ed-qry", "documentation": "Handles read operations"},
      {"op": "createElement", "type": "application-component", "name": "Event Store", "tempId": "ed-store", "documentation": "Persists domain events"},
      {"op": "createElement", "type": "data-object", "name": "Write Model", "tempId": "ed-write-model"},
      {"op": "createElement", "type": "data-object", "name": "Read Model", "tempId": "ed-read-model"},
      {"op": "createElement", "type": "application-event", "name": "State Changed", "tempId": "ed-evt"},
      {"op": "createElement", "type": "application-service", "name": "Command Processing", "tempId": "ed-cmd-svc"},
      {"op": "createElement", "type": "application-service", "name": "Query Processing", "tempId": "ed-qry-svc"},
      {"op": "createRelationship", "type": "access-relationship", "sourceId": "ed-cmd", "targetId": "ed-write-model", "accessType": "write", "tempId": "ed-r1"},
      {"op": "createRelationship", "type": "access-relationship", "sourceId": "ed-qry", "targetId": "ed-read-model", "accessType": "read", "tempId": "ed-r2"},
      {"op": "createRelationship", "type": "triggering-relationship", "sourceId": "ed-cmd", "targetId": "ed-evt", "tempId": "ed-r3"},
      {"op": "createRelationship", "type": "flow-relationship", "sourceId": "ed-evt", "targetId": "ed-qry", "name": "Event Notification", "tempId": "ed-r4"},
      {"op": "createRelationship", "type": "access-relationship", "sourceId": "ed-store", "targetId": "ed-write-model", "accessType": "write", "tempId": "ed-r5"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ed-cmd", "targetId": "ed-cmd-svc", "tempId": "ed-r6"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "ed-qry", "targetId": "ed-qry-svc", "tempId": "ed-r7"}
    ]
  }'
```

### Capability Mapping Pattern — Full Executable

```bash
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      {"op": "createElement", "type": "capability", "name": "Customer Management", "tempId": "cap-cust"},
      {"op": "createElement", "type": "capability", "name": "Order Management", "tempId": "cap-order"},
      {"op": "createElement", "type": "capability", "name": "Payment Processing", "tempId": "cap-pay"},
      {"op": "createElement", "type": "business-process", "name": "Handle Customer Inquiry", "tempId": "cap-proc-cust"},
      {"op": "createElement", "type": "business-process", "name": "Process Order", "tempId": "cap-proc-order"},
      {"op": "createElement", "type": "application-component", "name": "CRM System", "tempId": "cap-app-crm"},
      {"op": "createElement", "type": "application-component", "name": "Order Platform", "tempId": "cap-app-order"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "cap-proc-cust", "targetId": "cap-cust", "tempId": "cap-r1"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "cap-proc-order", "targetId": "cap-order", "tempId": "cap-r2"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "cap-app-crm", "targetId": "cap-cust", "tempId": "cap-r3"},
      {"op": "createRelationship", "type": "realization-relationship", "sourceId": "cap-app-order", "targetId": "cap-order", "tempId": "cap-r4"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "cap-app-crm", "targetId": "cap-proc-cust", "tempId": "cap-r5"},
      {"op": "createRelationship", "type": "serving-relationship", "sourceId": "cap-app-order", "targetId": "cap-proc-order", "tempId": "cap-r6"}
    ]
  }'
```

After any pattern creation, follow up with: view creation → `addToView` for each element (use `parentVisualId` for compound/nested elements) → `addConnectionToView` for each relationship → `layout` → `save`. See the **archi-server-api** skill for full workflow details.
