# Modeling Playbook — ArchiMate Semantics

Practical guidance for choosing element types, relationship types, naming conventions, and abstraction levels. Derived from the ArchiMate 3.1 specification and `archimate-guide.md`.

---

## 1. Layering Principle

ArchiMate models flow across layers from intent to implementation:

```
Motivation → Strategy → Business → Application → Technology → Physical
                                                      ↑
                                    Implementation & Migration (overlays any layer)
```

**Rule:** Do not skip layers. If a business process depends on technology, the application layer should mediate. Direct business-to-technology links ("strict layer violation") are an anti-pattern unless explicitly justified.

---

## 2. Element Selection Decision Guide

### Active Structure — who/what performs behavior?

| You need to model… | Use this type | Not this |
|---|---|---|
| A specific person, team, or organization | `business-actor` | `business-role` |
| A responsibility that can be filled by different actors | `business-role` | `business-actor` |
| Two+ actors working together | `business-collaboration` | Multiple separate actors |
| An external access point / channel | `business-interface` | `business-actor` |
| A software system or module | `application-component` | `application-function` |
| A physical server, router, or device | `device` | `node` |
| A logical computational resource (VM, container, cluster) | `node` | `device` |
| An OS, middleware, DBMS, or container runtime | `system-software` | `node` |

### Behavior — what is performed?

| You need to model… | Use this type | Not this |
|---|---|---|
| An ordered sequence with defined start/end and outcome | `*-process` | `*-function` |
| A stable grouping of behavior by domain/competency | `*-function` | `*-process` |
| Externally visible behavior consumed by someone else | `*-service` | `*-process`/`*-function` |
| Something that happens and triggers behavior | `*-event` | `*-process` |

**Key distinction:** Processes have temporal sequence; functions are grouped by capability. Services are the external contract; processes/functions are internal realization.

### Passive Structure — what is acted upon?

| You need to model… | Use this type | Not this |
|---|---|---|
| A conceptual business-level information entity | `business-object` | `data-object` |
| Structured data processed by applications | `data-object` | `business-object` |
| A human-readable representation of information | `representation` | `artifact` |
| A deployable file, package, container image, or binary | `artifact` | `data-object` |

### Strategy Layer

| You need to model… | Use this type |
|---|---|
| A stable ability the enterprise possesses | `capability` |
| An end-to-end value-creating activity sequence | `value-stream` |
| An asset owned or controlled | `resource` |
| An approach/plan to achieve goals | `course-of-action` |

### Motivation Layer

| You need to model… | Use this type |
|---|---|
| An interested party | `stakeholder` |
| An external/internal condition motivating change | `driver` |
| An end state someone intends to achieve | `goal` |
| A result that has been achieved | `outcome` |
| A qualitative intent statement | `principle` |
| A need that must be realized | `requirement` |
| A limiting factor | `constraint` |

### Implementation & Migration

| You need to model… | Use this type |
|---|---|
| A series of implementation actions | `work-package` |
| A precise result of a work package | `deliverable` |
| A relatively stable architecture state | `plateau` |
| A difference between two plateaus | `gap` |

---

## 3. Relationship Selection Rules

Always prefer the most specific relationship type. **Association is the weakest choice** — use it only when no other type applies.

### Structural Relationships

| Relationship | Direction | When to use |
|---|---|---|
| `composition-relationship` | Whole → Part | Part cannot exist independently (e.g., component composed of functions) |
| `aggregation-relationship` | Whole → Part | Part can exist independently or belong to multiple wholes |
| `assignment-relationship` | Performer → Behavior | Who/what performs the behavior (actor→role, role→process, component→function) |
| `realization-relationship` | Concrete → Abstract | Implementation realizes specification (process→service, artifact→component, data-object→business-object) |

### Dependency Relationships

| Relationship | Direction | When to use |
|---|---|---|
| `serving-relationship` | Provider → Consumer | Provider delivers functionality to consumer. Arrow points **toward consumer**. |
| `access-relationship` | Behavior → Passive | Behavior reads/writes data. Use `accessType`: `Read`, `Write`, `ReadWrite`. |
| `influence-relationship` | Source → Target | One motivation element affects another. Can include strength (+/-). |
| `association-relationship` | Either direction | **Last resort.** Generic untyped link when nothing specific applies. |

### Dynamic Relationships

| Relationship | Direction | When to use |
|---|---|---|
| `triggering-relationship` | Cause → Effect | Temporal/causal ordering between behaviors or events |
| `flow-relationship` | Source → Destination | Transfer of information/material between behaviors. **Label what flows.** |

### Other

| Relationship | Direction | When to use |
|---|---|---|
| `specialization-relationship` | Specific → General | Type hierarchy. Same-type elements only. |

### Common Direction Mistakes

| Wrong | Correct | Why |
|---|---|---|
| Consumer → Provider (serving) | Provider → Consumer | Serving arrow points toward who is served |
| Abstract → Concrete (realization) | Concrete → Abstract | The implementer realizes the specification |
| Business → Technology (direct) | Business → App → Technology | Missing application layer intermediation |

---

## 4. Naming Conventions

| Element category | Convention | Examples |
|---|---|---|
| **Active structure** (actors, components, nodes) | Singular noun phrase | `Customer Portal`, `Order Service`, `API Gateway` |
| **Behavior** (processes) | Present-tense verb + noun | `Process Payment`, `Handle Claim`, `Validate Order` |
| **Behavior** (functions) | Verb phrase or gerund | `Payment Processing`, `Risk Assessment` |
| **Services** | Noun or gerund phrase | `Payment Processing`, `Customer Onboarding Service` |
| **Capabilities** | Stable compound noun/gerund | `Risk Management`, `Digital Customer Engagement` |
| **Value stream stages** | Active verb-noun phrase | `Acquire Insurance Product`, `Deliver Customer Order` |
| **Business objects / data objects** | Singular noun | `Customer Record`, `Insurance Policy`, `Order` |
| **Artifacts** | Specific file/package name | `order-service.jar`, `customer-db-schema.sql` |

**General rules:**
- Use **Title Case** for all element names.
- Do not include element type in the name (the tool shows type visually).
- Avoid abbreviations unless they are domain-standard (API, CRM, ERP).
- Keep names concise but unambiguous — compound terms over single words.

---

## 5. Abstraction and View Complexity

### Match detail to audience

| Audience | Abstraction level | Typical elements per view |
|---|---|---|
| CxOs, senior management | High (strategic overview) | 8–15 |
| Managers, analysts | Medium (coherence/decisions) | 15–25 |
| Subject matter experts, developers | Low (detailed design) | 20–40 (absolute max) |

**Rule:** Do not mix high-level strategic elements with low-level technical detail in the same view unless the user explicitly requests it. Create separate views at different abstraction levels instead.

### View complexity bounds

- **Target:** ~20 elements per view for readability.
- **Upper bound:** ~40 elements. Beyond this, split into multiple views.
- **Connections:** Each element should have 2–5 relationships in a view. A single element with 10+ connections signals a "god component" that should be decomposed.

---

## 6. Cross-Layer Patterns

### Business ↔ Application

```
Application Service  → [serves]    → Business Process/Function
Application Process  → [realizes]  → Business Process (automation)
Data Object          → [realizes]  → Business Object
Application Interface → [serves]   → Business Role
```

### Application ↔ Technology

```
Technology Service → [serves]   → Application Component
Artifact           → [realizes] → Application Component (deployment)
Artifact           → [realizes] → Data Object
Node/Device        → [assigned] → System Software → [assigned] → Artifact
```

### Service Chain (full stack)

```
Business Actor   ← [served by] ← Business Service
Business Service ← [realized by] ← Business Process
Business Process ← [served by] ← Application Service
Application Service ← [realized by] ← Application Component
Application Component ← [served by] ← Technology Service
Technology Service ← [realized by] ← Node
```

---

## 7. Architecture Pattern Templates

### Microservices

| Concept | Element type |
|---|---|
| Individual microservice | `application-component` |
| Business functionality it provides | `application-service` |
| REST/gRPC endpoint | `application-interface` |
| Docker image / container image | `artifact` |
| Kubernetes pod/namespace/cluster | `node` |
| Container runtime | `system-software` |

```
application-component → [realizes] → application-service
application-component → [composition] → application-function(s)
application-interface → [assigned to] → application-service
artifact → [realizes] → application-component
system-software → [assigned to] → artifact
node → [composition] → node (cluster → namespace → pod)
```

### API Gateway

```
node (API Gateway) → [assignment] → technology-function (Request Routing)
technology-function → [realization] → technology-service (API Management)
technology-service → [serves] → application-component (Backend Service)
```

### Event-Driven / Message Queue

```
application-component (Producer) → [flow "Order Event"] → application-component (Consumer)
application-component (Message Broker) → [realizes] → application-service (Async Messaging)
```

### CQRS

```
application-component (Command Service) → [access Write] → data-object (Write Model)
application-component (Query Service)   → [access Read]  → data-object (Read Model)
application-event (State Changed)       → [flow]         → sync process
```

### Capability Map

```
goal → [realized by] → capability
capability → [composition] → sub-capability (2–3 levels max)
capability → [realized by] → business-process and/or application-component
capability → [serves] → value-stream stage
```

### Migration Roadmap

```
plateau (Baseline) → [triggering] → plateau (Transition) → [triggering] → plateau (Target)
gap → [associated with] → plateau (Baseline), plateau (Target)
work-package → [realizes] → deliverable
deliverable → [realizes] → plateau
implementation-event → [triggering] → work-package
```

### Cloud Infrastructure

```
IaaS: technology-service (Compute) → [realizes] → node (VM)
PaaS: technology-service (Runtime) → [serves] → application-component
SaaS: application-service (SaaS Capability) → [serves] → business-actor
Serverless: technology-service (Lambda) → [assigned to] → artifact (Function Code)
```

---

## 8. Anti-Patterns to Avoid

| Anti-pattern | What it looks like | Fix |
|---|---|---|
| **Lonely component** | Element with zero relationships | Connect it or remove it |
| **Strict layer violation** | Business element directly linked to technology | Add application layer intermediation |
| **God component** | One element with 10+ relationships | Decompose into focused components |
| **Lazy association** | Association used where serving/realization/assignment applies | Replace with specific relationship |
| **Mixed abstraction** | Strategic capabilities alongside deployment artifacts in one view | Split into separate views |
| **Duplicate elements** | Same concept modeled twice with different names | Merge into single element, reuse across views |
| **View-centric thinking** | Elements created for a single view, never reused | Model elements as reusable concepts first |
| **Missing service layer** | Direct connections bypassing service abstraction | Add service elements between layers |
| **Circular dependencies** | Cyclic relationship chains | Restructure to eliminate cycles |
