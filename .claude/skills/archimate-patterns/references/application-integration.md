# Application Integration Patterns

Detailed alternatives for modeling application integration in ArchiMate.

## The 10 Integration Pattern Alternatives

ArchiMate supports multiple ways to model application integration, from simple to detailed.

### Pattern 1: Simple Flow

```
[Application A] → [flow: Data Object] → [Application B]
```

**Characteristics:**
- Minimum detail
- Shows data exchange direction
- Good for high-level overviews

**When to use:**
- Executive presentations
- Initial architecture drafts
- Landscape overviews

### Pattern 2: Flow with Data Object Element

```
[Application A] → [flow] → [Data Object] → [flow] → [Application B]
```

**Characteristics:**
- Data object as intermediary
- Shows what data is exchanged
- Slightly more detail than Pattern 1

**When to use:**
- When data structure is important
- Data-centric views

### Pattern 3: Service-Based

```
[Application A] → [realizes] → [Application Service A-1]
[Application Service A-1] → [serves] → [Application B]
[Data Object A-1] ← [accessed by] ← [Application Service A-1]
```

**Characteristics:**
- Service-oriented perspective
- Shows service contracts
- Data accessed by service

**When to use:**
- SOA architectures
- API-first designs
- Service catalogs

### Pattern 4: Service with Explicit Consumer

```
[Application A] → [realizes] → [Application Service A-1]
[Application B] → [assignment] → [Application Function B-1]
[Application Function B-1] → [served by] → [Application Service A-1]
```

**Characteristics:**
- Shows consuming function
- Explicit service usage
- Good for detailed design

**When to use:**
- Consumer behavior analysis
- Dependency mapping

### Pattern 5: Interface-Based

```
[Application A] → [composition] → [Application Interface A-1]
[Application Interface A-1] → [serves] → [Application B]
```

**Characteristics:**
- Focus on connection points
- Interface as first-class element
- Technical perspective

**When to use:**
- Integration point inventory
- Interface contracts

### Pattern 6: Interface with Service

```
[Application A] → [composition] → [Application Interface A-1]
[Application Interface A-1] → [realizes] → [Application Service A-1]
[Application Service A-1] → [serves] → [Application B]
```

**Characteristics:**
- Interface realizes service
- Clear separation of concerns
- Shows both what and how

**When to use:**
- API documentation
- Service mesh architectures

### Pattern 7: Access-Based

```
[Application A] → [access (write)] → [Data Object]
[Application B] → [access (read)] → [Data Object]
```

**Characteristics:**
- Data-centric view
- Shows access modes
- No direct connection between apps

**When to use:**
- Database integration
- Shared data scenarios
- Batch processing

### Pattern 8: Event-Based

```
[Application A] → [triggers] → [Application Event]
[Application Event] → [triggers] → [Application B]
```

**Characteristics:**
- Event-driven perspective
- Loose coupling
- Asynchronous communication

**When to use:**
- Event-driven architectures
- Message queue integration
- Pub/sub patterns

### Pattern 9: Full Service Stack

```
[Application A]
    → [assignment] → [Application Function A-1]
        → [realization] → [Application Service A-1]
[Application Service A-1] → [serves] → [Application B]
[Application Interface A-1] → [assignment] → [Application Service A-1]
```

**Characteristics:**
- Complete service realization
- Function to service mapping
- Interface assignment

**When to use:**
- Detailed service design
- Contract-first development

### Pattern 10: Full Detail (Recommended for Detailed Design)

```
[Application A]
    → [assignment] → [Application Function A-1]
        → [realization] → [Application Service A-1]
[Application Interface A-1]
    → [realizes] → [Application Service A-1]
[Application Service A-1] → [serves] → [Application B]
[Data Object] → [flow] → (on relationship or separate)
```

**Characteristics:**
- Maximum detail
- All elements explicit
- Complete traceability

**When to use:**
- Formal documentation
- Contract specifications
- Detailed design reviews

## Choosing the Right Pattern

| Scenario | Recommended Pattern |
|----------|---------------------|
| Executive overview | Pattern 1 (Simple Flow) |
| Data flow analysis | Pattern 2 or 7 (Data Object) |
| Service inventory | Pattern 3 (Service-Based) |
| API documentation | Pattern 6 or 10 (Interface + Service) |
| Event-driven architecture | Pattern 8 (Event-Based) |
| Detailed design | Pattern 10 (Full Detail) |
| Database integration | Pattern 7 (Access-Based) |

## Standardization Recommendation

For consistency, standardize on three patterns based on detail level:

1. **Overview level**: Pattern 1 (Simple Flow)
2. **Analysis level**: Pattern 3 (Service-Based)
3. **Design level**: Pattern 10 (Full Detail)

## Integration Technology Mapping

### REST API Integration

```
[Application Component: Service A]
    → [composition] → [Application Interface: REST API]
        → [realizes] → [Application Service: Resource Operations]
            → [serves] → [Application Component: Client App]

[Technology Interface: HTTPS Endpoint]
    → [realizes] → [Application Interface: REST API]
```

### Message Queue Integration

```
[Application Component: Producer]
    → [flow: Message] → [Application Component: Message Broker]
        → [flow: Message] → [Application Component: Consumer]

[Technology Service: Queue Service]
    → [realizes] → [Application Component: Message Broker]
```

### GraphQL Integration

```
[Application Component: GraphQL Server]
    → [composition] → [Application Interface: GraphQL Endpoint]
        → [realizes] → [Application Service: Data Query Service]
            → [serves] → [Application Component: Client]

[Application Function: Query Resolver]
    → [assignment] → [Application Component: GraphQL Server]
    → [access] → [Data Object: Domain Data]
```

### gRPC Integration

```
[Application Component: gRPC Service]
    → [composition] → [Application Interface: gRPC Endpoint]
        → [realizes] → [Application Service: Remote Procedure]
            → [serves] → [Application Component: gRPC Client]

[Artifact: Protocol Buffer Definition]
    → [associated with] → [Application Interface: gRPC Endpoint]
```

### Webhook Integration

```
[Application Component: Source System]
    → [triggers] → [Application Event: State Change]
        → [flow: Webhook Payload] → [Application Interface: Webhook Endpoint]
            → [assigned to] → [Application Component: Target System]
```

## Anti-Patterns to Avoid

### Spaghetti Integration

**Problem:**
```
[App A] → [flow] → [App B] → [flow] → [App C]
[App A] → [flow] → [App C]
[App B] → [flow] → [App A]
```

**Solution:** Introduce integration layer
```
[App A] → [served by] → [Application Service: Integration Hub]
[App B] → [served by] → [Application Service: Integration Hub]
[App C] → [served by] → [Application Service: Integration Hub]
```

### Missing Data Objects

**Problem:**
```
[App A] → [flow] → [App B]  # What flows?
```

**Solution:** Always label flows or include data objects
```
[App A] → [flow: Customer Order] → [App B]
```

### Direct Database Access

**Problem:**
```
[App A] → [access] → [Data Object: App B Database]
```

**Solution:** Access through services
```
[App A] → [served by] → [Application Service: App B Data Service]
[Application Service: App B Data Service] → [access] → [Data Object]
```
