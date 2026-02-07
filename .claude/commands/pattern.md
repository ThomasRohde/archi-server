---
name: pattern
description: Look up ArchiMate patterns for specific architecture scenarios
argument-hint: "[architecture type, e.g., microservices, cloud, API gateway]"
allowed-tools:
  - Read
---

# ArchiMate Pattern Lookup

Help the user find the right ArchiMate pattern for their architecture scenario.

## Process

1. Identify the architecture pattern from the user's query
2. Load the archimate-patterns skill if needed for detailed patterns
3. Present the pattern with:
   - Element mappings (what ArchiMate elements to use)
   - Relationship patterns (how to connect them)
   - Notation examples
   - Variations for different detail levels

## Common Patterns Quick Reference

### Microservices
```
[Application Component: Service Name] → [realizes] → [Application Service: Capability]
    → [composition] → [Application Function: Internal Behavior]
    → [serves] → [Application Interface: API]
```
- Services → Application Component
- APIs → Application Interface
- Docker images → Artifact
- Kubernetes → Node

### API Gateway
```
[Technology Node: API Gateway]
    → [realization] → [Technology Service: API Management]
    → [serves] → [Application Component: Backend]
```

### Event-Driven
```
[Application Component: Producer] → [triggers] → [Application Event: Event Name]
[Application Event] → [flow] → [Application Component: Consumer]
```

### Cloud (IaaS/PaaS/SaaS)
- IaaS: Technology Service → realizes → Node
- PaaS: Technology Service → serves → Application Component
- SaaS: Application Service → serves → Business Actor

### Capability Mapping
```
[Capability] → [realized by] → [Business Process]
[Capability] → [realized by] → [Application Component]
```

### Value Stream
```
[Value Stream] → [composition] → [Value Stream Stage]
[Value Stream Stage] ← [served by] ← [Capability]
```

## Pattern Categories

If user asks generally, offer categories:
1. **Application patterns**: Microservices, API, integration, data
2. **Infrastructure patterns**: Cloud, containers, serverless
3. **Strategy patterns**: Capability, value stream, course of action
4. **Security patterns**: IAM, zero-trust, security zones
5. **Industry patterns**: BIAN (banking), FHIR (healthcare), EIRA (government)

## Output Format

Present patterns as both:
1. **Notation format** (for quick reference)
2. **Textual description** (for clarity)

Include:
- When to use this pattern
- Key elements involved
- Key relationships
- Variations by detail level
