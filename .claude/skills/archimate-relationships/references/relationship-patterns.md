# ArchiMate Relationship Patterns

Complete catalog of relationship patterns with detailed examples.

## Structural Relationship Patterns

### Composition Patterns

**Use for**: Strong whole-part relationships where parts cannot exist independently.

**Capability decomposition:**
```
[Capability: Customer Management]
    → [composition] → [Capability: Customer Acquisition]
    → [composition] → [Capability: Customer Retention]
    → [composition] → [Capability: Customer Analytics]
```

**Node structure:**
```
[Node: Application Server]
    → [composition] → [Device: Physical Server]
    → [composition] → [System Software: Operating System]
    → [composition] → [System Software: Application Runtime]
```

**Value stream stages:**
```
[Value Stream: Order to Cash]
    → [composition] → [Value Stream Stage: Receive Order]
    → [composition] → [Value Stream Stage: Process Order]
    → [composition] → [Value Stream Stage: Ship Order]
    → [composition] → [Value Stream Stage: Invoice Customer]
```

### Aggregation Patterns

**Use for**: Weak whole-part relationships where parts can exist independently.

**Product bundling:**
```
[Product: Premium Banking]
    → [aggregation] → [Business Service: Account Management]
    → [aggregation] → [Business Service: Investment Advisory]
    → [aggregation] → [Contract: Premium Terms]
```

**Application portfolio:**
```
[Grouping: CRM Portfolio]
    → [aggregation] → [Application Component: Salesforce]
    → [aggregation] → [Application Component: Marketing Cloud]
    → [aggregation] → [Application Component: Service Cloud]
```

### Assignment Patterns

**Use for**: Linking who/what performs behavior.

**Actor-role-behavior chain:**
```
[Business Actor: Sales Department]
    → [assignment] → [Business Role: Account Manager]
        → [assignment] → [Business Process: Manage Customer Relationship]
```

**Component-function chain:**
```
[Application Component: Order Service]
    → [assignment] → [Application Function: Validate Order]
    → [assignment] → [Application Function: Process Payment]
    → [assignment] → [Application Function: Update Inventory]
```

**Infrastructure assignment:**
```
[Device: Physical Server]
    → [assignment] → [System Software: Linux OS]
        → [assignment] → [System Software: Docker Runtime]
            → [assignment] → [Artifact: Container Image]
```

### Realization Patterns

**Use for**: Logical-to-physical mapping, cross-layer implementation.

**Business-to-application:**
```
[Application Service: Customer Data API]
    → [realizes] → [Business Service: Customer Information Service]
```

**Service implementation:**
```
[Business Process: Handle Insurance Claim]
    → [realization] → [Business Service: Claims Processing]
```

**Application deployment:**
```
[Artifact: order-service.jar]
    → [realizes] → [Application Component: Order Service]
```

**Data realization chain:**
```
[Artifact: customer.db]
    → [realizes] → [Data Object: Customer Record]
        → [realizes] → [Business Object: Customer]
```

## Dependency Relationship Patterns

### Serving Patterns

**Use for**: Service delivery relationships.

**Cross-layer service:**
```
[Technology Service: Database Service]
    → [serves] → [Application Component: Data Access Layer]

[Application Service: Order API]
    → [serves] → [Business Process: Fulfill Order]
```

**Interface-to-service:**
```
[Application Interface: REST API]
    → [serves] → [Application Component: Mobile App]
```

**Capability-value stream:**
```
[Capability: Order Processing]
    → [serves] → [Value Stream Stage: Process Order]
```

### Access Patterns

**Use for**: Data access with read/write modes.

**Process accessing data:**
```
[Business Process: Review Application]
    → [access (read)] → [Business Object: Loan Application]

[Business Process: Approve Application]
    → [access (write)] → [Business Object: Loan Application]

[Application Function: Update Customer]
    → [access (rw)] → [Data Object: Customer Record]
```

**Technology data access:**
```
[System Software: PostgreSQL]
    → [access (rw)] → [Artifact: Database Files]
```

### Influence Patterns

**Use for**: Motivation element relationships with optional strength.

**Goal influence:**
```
[Driver: Digital Transformation]
    → [influence (+)] → [Goal: Improve Customer Experience]

[Constraint: Budget Limit]
    → [influence (-)] → [Goal: Expand Market Presence]
```

**Assessment influence:**
```
[Assessment: High Technical Debt]
    → [influence (-)] → [Goal: Rapid Feature Delivery]
```

**Principle influence:**
```
[Principle: Cloud-First]
    → [influence (+)] → [Requirement: Scalable Infrastructure]
```

## Dynamic Relationship Patterns

### Triggering Patterns

**Use for**: Temporal/causal precedence between behaviors.

**Process chain:**
```
[Business Event: Order Received]
    → [triggers] → [Business Process: Validate Order]
        → [triggers] → [Business Process: Process Payment]
            → [triggers] → [Business Process: Ship Order]
```

**Event-driven:**
```
[Application Event: Payment Completed]
    → [triggers] → [Application Process: Generate Invoice]
```

**Plateau transitions:**
```
[Plateau: Baseline]
    → [triggers] → [Plateau: Transition 1]
        → [triggers] → [Plateau: Target]
```

### Flow Patterns

**Use for**: Transfer of objects between behaviors (always label what flows).

**Business process flow:**
```
[Business Process: Receive Order]
    → [flow: Order Data] → [Business Process: Validate Order]
        → [flow: Validated Order] → [Business Process: Fulfill Order]
```

**Application integration:**
```
[Application Component: Order Service]
    → [flow: Order Event] → [Application Component: Inventory Service]
        → [flow: Stock Update] → [Application Component: Notification Service]
```

**Event streaming:**
```
[Application Component: Event Producer]
    → [flow: Domain Events] → [Application Component: Message Broker]
        → [flow: Domain Events] → [Application Component: Event Consumer]
```

## Specialization Patterns

**Use for**: Type hierarchies (same-type elements only).

**Element hierarchy:**
```
[Application Component: Service]
    ← [specialization] ← [Application Component: Order Service]
    ← [specialization] ← [Application Component: Payment Service]
    ← [specialization] ← [Application Component: Inventory Service]
```

**Capability hierarchy:**
```
[Capability: Customer Management]
    ← [specialization] ← [Capability: B2B Customer Management]
    ← [specialization] ← [Capability: B2C Customer Management]
```

**Role specialization:**
```
[Business Role: Employee]
    ← [specialization] ← [Business Role: Manager]
    ← [specialization] ← [Business Role: Individual Contributor]
```

## Application Integration Patterns (10 Alternatives)

### Pattern 1 - Simple Flow
```
[Application A] → [flow: Data Object] → [Application B]
```
**When to use**: High-level overview, informal communication.

### Pattern 3 - Service-Based
```
[Application A] → [realizes] → [Application Service A-1]
[Application Service A-1] → [serves] → [Application B]
[Data Object A-1] ← [accessed by] ← [Application Service A-1]
```
**When to use**: Service-oriented view, API focus.

### Pattern 5 - Interface-Based
```
[Application A] → [composition] → [Application Interface A-1]
[Application Interface A-1] → [serves] → [Application B]
```
**When to use**: Showing connection points.

### Pattern 10 - Full Detail
```
[Application A] → [assigned] → [Application Interface A-1]
[Application Interface A-1] → [realizes] → [Application Service A-1]
[Application Service A-1] → [serves] → [Application B]
[Data Object] → [flows via] → Flow relationship
```
**When to use**: Detailed design, formal documentation.

**Recommendation**: Standardize on patterns 1, 3, and 10 based on required detail level.

## Cross-Layer Complete Examples

### Customer Order Processing (Full Stack)

```
# Business Layer
[Business Actor: Customer]
    → [served by] → [Business Service: Order Processing]
[Business Role: Order Clerk]
    → [assignment] → [Business Process: Process Customer Order]
[Business Process: Process Customer Order]
    → [realization] → [Business Service: Order Processing]
    → [access (rw)] → [Business Object: Customer Order]

# Application Layer
[Application Service: Order API]
    → [serves] → [Business Process: Process Customer Order]
[Application Component: Order Management System]
    → [realizes] → [Application Service: Order API]
    → [assignment] → [Application Function: Validate Order]
    → [access (rw)] → [Data Object: Order Record]
[Data Object: Order Record]
    → [realizes] → [Business Object: Customer Order]

# Technology Layer
[Technology Service: Container Platform]
    → [serves] → [Application Component: Order Management System]
[Node: Kubernetes Cluster]
    → [realizes] → [Technology Service: Container Platform]
[Artifact: order-service:v1.2]
    → [realizes] → [Application Component: Order Management System]
    → [assigned to] → [Node: Kubernetes Cluster]
```
