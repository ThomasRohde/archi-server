# ArchiMate Element Types for archicli

CLI type strings used in `createElement` operations, organized by layer.

## Strategy Layer

| CLI Type | ArchiMate Name | Aspect | Usage |
|----------|---------------|--------|-------|
| `resource` | Resource | Active Structure | Tangible/intangible assets |
| `capability` | Capability | Behavior | What the org can do (stable, tech-agnostic) |
| `value-stream` | Value Stream | Behavior | End-to-end value creation stages |
| `course-of-action` | Course of Action | Behavior | Approach to achieve a goal |

## Business Layer

| CLI Type | ArchiMate Name | Aspect | Usage |
|----------|---------------|--------|-------|
| `business-actor` | Business Actor | Active Structure | Specific person, department, or org |
| `business-role` | Business Role | Active Structure | Responsibility "hat" (can be filled by different actors) |
| `business-collaboration` | Business Collaboration | Active Structure | Temporary grouping for joint behavior |
| `business-interface` | Business Interface | Active Structure | Access point for business services |
| `business-process` | Business Process | Behavior | Sequence with defined start, end, outcome |
| `business-function` | Business Function | Behavior | Ongoing capability grouped by competency |
| `business-interaction` | Business Interaction | Behavior | Joint behavior of a collaboration |
| `business-event` | Business Event | Behavior | Something that triggers processes |
| `business-service` | Business Service | Behavior | Externally visible functionality |
| `business-object` | Business Object | Passive Structure | Conceptual information entity |
| `contract` | Contract | Passive Structure | Formal agreement |
| `representation` | Representation | Passive Structure | Perceptible form of information |
| `product` | Product | Composite | Bundle of services + contract for customer |

## Application Layer

| CLI Type | ArchiMate Name | Aspect | Usage |
|----------|---------------|--------|-------|
| `application-component` | Application Component | Active Structure | Deployable software unit |
| `application-collaboration` | Application Collaboration | Active Structure | Joint application behavior group |
| `application-interface` | Application Interface | Active Structure | API endpoint, UI screen |
| `application-function` | Application Function | Behavior | Internal automated behavior |
| `application-process` | Application Process | Behavior | Sequence of automated steps |
| `application-interaction` | Application Interaction | Behavior | Joint application behavior |
| `application-event` | Application Event | Behavior | Application state change |
| `application-service` | Application Service | Behavior | Externally visible app functionality |
| `data-object` | Data Object | Passive Structure | Structured data for automated processing |

## Technology Layer

| CLI Type | ArchiMate Name | Aspect | Usage |
|----------|---------------|--------|-------|
| `node` | Node | Active Structure | Logical computational resource |
| `device` | Device | Active Structure | Physical hardware |
| `system-software` | System Software | Active Structure | OS, middleware, DBMS, runtime |
| `technology-collaboration` | Technology Collaboration | Active Structure | Joint infra behavior group |
| `technology-interface` | Technology Interface | Active Structure | Infra access point |
| `path` | Path | Active Structure | Communication link |
| `communication-network` | Communication Network | Active Structure | Network infrastructure |
| `technology-function` | Technology Function | Behavior | Infra behavior (ongoing) |
| `technology-process` | Technology Process | Behavior | Infra behavior (sequence) |
| `technology-interaction` | Technology Interaction | Behavior | Joint infra behavior |
| `technology-event` | Technology Event | Behavior | Infra state change |
| `technology-service` | Technology Service | Behavior | Externally visible infra functionality |
| `artifact` | Artifact | Passive Structure | Physical data (file, package, image) |

## Physical Layer

| CLI Type | ArchiMate Name | Aspect | Usage |
|----------|---------------|--------|-------|
| `equipment` | Equipment | Active Structure | Physical processing machine |
| `facility` | Facility | Active Structure | Physical location |
| `distribution-network` | Distribution Network | Active Structure | Physical transport link |
| `material` | Material | Passive Structure | Physical substance |

## Motivation Layer

| CLI Type | ArchiMate Name | Usage |
|----------|---------------|-------|
| `stakeholder` | Stakeholder | Person or group with interest |
| `driver` | Driver | External or internal condition |
| `assessment` | Assessment | Analysis of a driver |
| `goal` | Goal | Desired end state |
| `outcome` | Outcome | Measurable result |
| `principle` | Principle | Guiding statement |
| `requirement` | Requirement | Formal need |
| `constraint` | Constraint | Limitation |
| `meaning` | Meaning | Interpretation of information |
| `value` | Value | Worth or benefit |

## Implementation & Migration Layer

| CLI Type | ArchiMate Name | Usage |
|----------|---------------|-------|
| `work-package` | Work Package | Project/task unit of work |
| `deliverable` | Deliverable | Output of a work package |
| `implementation-event` | Implementation Event | Milestone or trigger |
| `plateau` | Plateau | Stable architecture state |
| `gap` | Gap | Difference between plateaus |

## Other

| CLI Type | ArchiMate Name | Usage |
|----------|---------------|-------|
| `location` | Location | Place (logical or physical) |
| `grouping` | Grouping | Visual grouping (no semantic meaning) |
| `junction` | Junction | AND/OR split-join for relationships |

## Element Selection Quick Guide

| Need to model... | Use | Not |
|-----------------|-----|-----|
| Specific person/system | `business-actor` / `application-component` | role |
| Responsibility pattern | `business-role` | actor |
| Sequence with result | `*-process` | function |
| Ongoing capability | `*-function` | process |
| External functionality | `*-service` | process/function |
| Business-level concept | `business-object` | data-object |
| Application-level data | `data-object` | business-object |
| Deployable file/image | `artifact` | data-object |

## Naming Conventions

| Element Category | Convention | Examples |
|-----------------|------------|----------|
| Structural (actors, components, nodes) | Singular noun phrases, Title Case | `Customer Portal`, `Data Warehouse` |
| Behavioral (processes) | Verb + noun, present tense | `Handle Claim`, `Process Order` |
| Services | Noun or gerund phrase | `Payment Processing`, `Customer Information Service` |
| Capabilities | Compound noun/gerund | `Risk Management`, `Customer Onboarding` |
| Value Streams | Verb-noun active | `Acquire Insurance Product` |
| Passive (objects) | Singular nouns | `Insurance Policy`, `Customer Record` |
