# Modeling Playbook (ArchiMate Semantics)

This playbook encodes practical element and relationship selection guidance derived from `context/archimate.md`.

## Layering Principle

Model intent typically flows across layers:
- Strategy → Business → Application → Technology
- Implementation & Migration overlays transition execution

Use this layering unless a justified exception exists.

## Element Selection Rules

### Active structure
- Use actor/component/node when modeling concrete performers.
- Use role/interface when modeling responsibilities or access points.

### Behavior
- Use process for ordered behavior with outcome.
- Use function for stable grouped behavior without explicit sequence.
- Use service for externally visible behavior consumed by others.

### Passive structure
- Use business object for conceptual business information.
- Use data object for logical application data.
- Use artifact for physical/deployable representations.

## Relationship Selection Rules

Prefer specific semantics:
- Serving: provider serves consumer (arrow toward consumer).
- Realization: concrete implementation realizes abstract/logical element.
- Assignment: active structure performs behavior.
- Access: behavior reads/writes objects.
- Triggering: temporal/causal order between behaviors.
- Flow: transfer of object/information.
- Composition vs aggregation: strong vs weak whole-part.

Use association only when intent is genuinely generic.

## Naming Rules

- Structural elements: singular noun phrase (`Customer Portal`).
- Behavioral elements: verb phrase (`Process Payment`).
- Services: noun/gerund phrase (`Payment Processing`).
- Capabilities: stable compound noun (`Risk Management`).
- Value stream stages: active verb-noun phrase (`Acquire Insurance Product`).

## Abstraction Control

- Strategy views: high-level, low detail.
- Decision support views: medium detail.
- Design views: lower-level detail in bounded scope.

Do not mix highly strategic and deeply technical detail in one view unless explicitly required.

## Pattern Starters

### Capability mapping
- Goal realized by capability.
- Capability realized by business process and/or application component.

### Service chain
- Business service realized by process.
- Application service serves business behavior.
- Technology service serves application component.

### Migration roadmap
- Plateaus linked by triggering.
- Work packages realize deliverables/plateaus.
- Gaps associate changes between plateaus.
