# Relationship Types and Rules

## Relationship Types

### Structural Relationships

| CLI Type | Direction | Usage |
|----------|-----------|-------|
| `composition-relationship` | whole -> part | Strong containment; parts cannot exist independently |
| `aggregation-relationship` | whole -> part | Weak containment; parts may exist independently |
| `assignment-relationship` | performer -> behavior | Who/what performs behavior (actor->role, component->function) |
| `realization-relationship` | realizer -> realized | Logical-to-physical mapping; cross-layer implementation |

### Dependency Relationships

| CLI Type | Direction | Usage |
|----------|-----------|-------|
| `serving-relationship` | provider -> consumer | Service delivery; "used by" |
| `access-relationship` | behavior -> object | Data access (use `accessType`: 0=write, 1=read, 2=access, 3=rw) |
| `influence-relationship` | influencer -> influenced | Between motivation elements (use `strength`: +, -, ++, --) |
| `association-relationship` | either direction | Generic; use when no specific type applies |

### Dynamic Relationships

| CLI Type | Direction | Usage |
|----------|-----------|-------|
| `triggering-relationship` | cause -> effect | Temporal/causal precedence between behaviors |
| `flow-relationship` | source -> target | Transfer of objects between behaviors; label what flows |

### Other

| CLI Type | Direction | Usage |
|----------|-----------|-------|
| `specialization-relationship` | specific -> general | Type hierarchy; same-type elements only |

## Key Cross-Layer Patterns

### Business -> Application

| Pattern | Relationship |
|---------|-------------|
| App supports business process | `application-service` --serving--> `business-process` |
| App automates business process | `application-process` --realization--> `business-process` |
| Data implements business concept | `data-object` --realization--> `business-object` |

### Application -> Technology

| Pattern | Relationship |
|---------|-------------|
| Infra supports application | `technology-service` --serving--> `application-component` |
| Artifact deploys application | `artifact` --realization--> `application-component` |
| Artifact stores data | `artifact` --realization--> `data-object` |

### Strategy -> Business

| Pattern | Relationship |
|---------|-------------|
| Process realizes capability | `business-process` --realization--> `capability` |
| App realizes capability | `application-component` --realization--> `capability` |
| Capability serves value stream | `capability` --serving--> `value-stream` |

## Direction Rule

ArchiMate relationships point **toward goals and results**: Technology -> Application -> Business, Active Structure -> Behavior -> Passive Structure.

- `serving-relationship`: source serves target (source provides, target consumes)
- `realization-relationship`: source realizes target (source implements, target is abstract)
- `assignment-relationship`: source is assigned to target (source performs, target is behavior)
- `composition/aggregation`: source contains target

## Common Mistakes

1. **Swapped serving direction**: The provider (app service) is source, the consumer (business process) is target
2. **Using association as default**: When a specific relationship type applies, use it
3. **Skipping the application layer**: Business directly linked to technology (always add app layer intermediation)
4. **Wrong realization direction**: The implementing element is source, the abstract element is target
5. **Circular dependencies**: Restructure to eliminate cycles
