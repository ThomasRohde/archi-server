---
name: element
description: Interactive help choosing the right ArchiMate element type — and optionally create it in Archi via the API
argument-hint: "[description of what you want to model]"
tools: ['runInTerminal', 'terminalLastCommand', 'codebase']
agent: agent
---

# ArchiMate Element Selection & Creation

Help the user select the correct ArchiMate element type for what they want to model, then optionally create it in Archi via the API.

The **archi-server-api** skill (in `.claude/skills/archi-server-api/`) has full API execution details. The **archimate-modeling** skill (in `.claude/skills/archimate-modeling/`) has element selection guidance.

## Process

1. If the user provided a description, analyze it to determine:
   - What layer it belongs to (Motivation, Strategy, Business, Application, Technology, Physical, Implementation)
   - What aspect it represents (Active Structure, Behavior, Passive Structure)
   - The specific element type that best fits

2. If the description is ambiguous, ask clarifying questions:
   - Is this about who/what performs something (active) or what is acted upon (passive)?
   - Is this a one-time sequence (process) or ongoing capability (function)?
   - Is this internal behavior or externally visible (service)?

3. Provide the recommendation:

**Recommended Element:**
- **Type**: [Element Type]
- **Layer**: [Layer Name]
- **Aspect**: [Active Structure / Behavior / Passive Structure]
- **API type**: `[kebab-case-type]`

**Reasoning**: [Why this element type is appropriate]

**Common alternatives:**
- [Alternative 1]: Use if [condition]
- [Alternative 2]: Use if [condition]

4. **Create in Archi** — After recommending, offer to create the element:

   Run the following terminal commands:

   ```bash
   # Check server health
   curl -s http://localhost:8765/health
   ```

   ```bash
   # Search for duplicates first
   curl -s -X POST http://localhost:8765/model/search \
     -H "Content-Type: application/json" \
     -d '{"type": "ELEMENT_TYPE", "namePattern": "ELEMENT_NAME", "limit": 10}'
   ```

   If no duplicates:
   ```bash
   curl -s -X POST http://localhost:8765/model/apply \
     -H "Content-Type: application/json" \
     -d '{"changes": [{"op": "createElement", "type": "ELEMENT_TYPE", "name": "ELEMENT_NAME", "tempId": "e1", "documentation": "DESCRIPTION"}]}'
   ```

   ```bash
   # Poll for result
   curl -s "http://localhost:8765/ops/status?opId=OP_ID"
   ```

   Report the created element: name, type, and Archi ID. If duplicates found, report them and ask whether to reuse or create a new one.

## Quick Reference

### Active Structure Elements
| Element | API Type | Description |
|---------|----------|-------------|
| Business Actor | `business-actor` | Specific organizational entity (person, department) |
| Business Role | `business-role` | Responsibility that can be assigned to actors |
| Application Component | `application-component` | Deployable software unit |
| Node | `node` | Logical computational resource |
| Device | `device` | Physical hardware |

### Behavior Elements
| Element | API Type | Description |
|---------|----------|-------------|
| Business Process | `business-process` | Sequence with start, end, and result |
| Business Function | `business-function` | Ongoing capability, no specific sequence |
| Business Service | `business-service` | Externally visible functionality |
| Business Event | `business-event` | State change that triggers behavior |
| Application Service | `application-service` | Software-provided service |
| Application Function | `application-function` | Internal software behavior |

### Passive Structure Elements
| Element | API Type | Description |
|---------|----------|-------------|
| Business Object | `business-object` | Business-level concept |
| Data Object | `data-object` | Structured application data |
| Artifact | `artifact` | Deployable file or module |

## Tips

- "system" → likely `application-component`
- "database" → likely `data-object` or `system-software`
- "API" → likely `application-interface` or `application-service`
- "team" or "department" → likely `business-actor`
- "responsibility" → likely `business-role`
- "what we can do" → likely `capability`
