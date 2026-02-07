---
name: element
description: Interactive help choosing the right ArchiMate element type
argument-hint: "[description of what you want to model]"
allowed-tools:
  - Read
---

# ArchiMate Element Selection Helper

Help the user select the correct ArchiMate element type for what they want to model.

## Process

1. If the user provided a description, analyze it to determine:
   - What layer it belongs to (Motivation, Strategy, Business, Application, Technology, Physical, Implementation)
   - What aspect it represents (Active Structure, Behavior, Passive Structure)
   - The specific element type that best fits

2. If the description is ambiguous, ask clarifying questions:
   - Is this about who/what performs something (active) or what is acted upon (passive)?
   - Is this a one-time sequence (process) or ongoing capability (function)?
   - Is this internal behavior or externally visible (service)?

3. Provide the recommendation in this format:

**Recommended Element:**
- **Type**: [Element Type]
- **Layer**: [Layer Name]
- **Aspect**: [Active Structure / Behavior / Passive Structure]

**Reasoning**: [Why this element type is appropriate]

**Example notation:**
```
[Element Type: Example Name]
```

**Common alternatives:**
- [Alternative 1]: Use if [condition]
- [Alternative 2]: Use if [condition]

## Quick Reference

Load the archimate-modeling skill for detailed element selection guidance if needed.

### Active Structure Elements
- **Business Actor**: Specific organizational entity (person, department)
- **Business Role**: Responsibility that can be assigned to actors
- **Application Component**: Deployable software unit
- **Node**: Logical computational resource
- **Device**: Physical hardware

### Behavior Elements
- **Process**: Sequence with start, end, and result
- **Function**: Ongoing capability, no specific sequence
- **Service**: Externally visible functionality
- **Event**: State change that triggers behavior

### Passive Structure Elements
- **Business Object**: Business-level concept
- **Data Object**: Structured application data
- **Artifact**: Deployable file or module

## Tips

- If they describe a "system" → likely Application Component
- If they describe a "database" → likely Data Object or Artifact (or System Software for the DBMS)
- If they describe an "API" → likely Application Interface or Application Service
- If they describe a "team" or "department" → likely Business Actor
- If they describe a "responsibility" → likely Business Role
- If they describe "what we can do" → likely Capability
