---
name: audit
description: Audit an ArchiMate model for quality issues, naming violations, orphans, and anti-patterns
argument-hint: "[optional: specific check — orphans, naming, duplicates, documentation, dead, relationships, or full]"
tools: ['runInTerminal', 'terminalLastCommand', 'codebase']
agent: agent
---

# ArchiMate Model Quality Audit

Audit the current ArchiMate model in Archi for quality issues by querying the API. Reports findings and optionally applies fixes.

The **archi-server-api** skill (in `.claude/skills/archi-server-api/`) has full API execution details. The **archimate-quality** skill (in `.claude/skills/archimate-quality/`) has quality rules.

## Process

### Step 1: Health Check
```bash
curl -s http://localhost:8765/health
```

### Step 2: Get Model Overview
```bash
curl -s -X POST http://localhost:8765/model/query \
  -H "Content-Type: application/json" \
  -d '{"limit": 0}'
```

Report: total elements, relationships, views, and element type distribution.

### Step 3: Run Audit Checks

Run all checks or specific ones based on user request.

#### Check 1: Orphan Elements (Lonely Components)

Search each major element type and check for elements with zero relationships:

```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "business-actor", "limit": 200}'
```

For specific elements, get full details:
```bash
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

Elements where the `relationships` array is empty are orphans. Report grouped by type.

#### Check 2: Naming Convention Violations

Rules:
- **Structural elements** (actors, components, nodes): Title Case singular noun phrases
- **Processes**: Present-tense Verb + Noun (e.g., "Handle Claim")
- **Functions**: Gerund or verb phrase (e.g., "Order Management")
- **Services**: Noun or gerund phrase
- No abbreviations unless domain-standard
- No element type in the name (e.g., "CRM Component" → "CRM")

#### Check 3: Missing Documentation

Search all elements and flag those with empty documentation:
```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"limit": 500}'
```

#### Check 4: Duplicate Elements

Search for same-type elements with identical or near-identical names:
```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "application-component", "limit": 200}'
```

#### Check 5: Dead Elements (Not in Any View)

For elements returned by search, check if they appear in any view:
```bash
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

If the `views` array is empty, the element is not visualized.

#### Check 6: Relationship Issues

Look for:
- **Association overuse**: Many `association-relationship` where specific types could apply
- **Missing layer intermediation**: Business directly connected to Technology
- **Circular dependencies**: A→B and B→A relationships

## Report Format

```
## Model Quality Audit Report

### Summary
- Total elements: N
- Total relationships: N
- Total views: N
- Issues found: N

### Critical Issues
- [LIST] Orphan elements (no connections)
- [LIST] Possible duplicates

### Warnings
- [LIST] Naming convention violations
- [LIST] Missing documentation
- [LIST] Dead elements (not in any view)

### Suggestions
- [LIST] Association relationships that could be more specific
- [LIST] Layer violations
```

### Step 4: Apply Fixes (if user confirms)

```bash
# Fix naming
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [{"op": "updateElement", "id": "ID", "name": "Corrected Name"}]}'

# Remove orphans
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [{"op": "deleteElement", "id": "ORPHAN_ID", "cascade": true}]}'

# Add documentation
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [{"op": "updateElement", "id": "ID", "documentation": "Description of element purpose"}]}'
```

Always poll for completion, then save:
```bash
curl -s "http://localhost:8765/ops/status?opId=OP_ID"
curl -s -X POST http://localhost:8765/model/save
```

## Scope Options

- **"orphans"** → Check 1 only
- **"naming"** → Check 2 only
- **"documentation"** → Check 3 only
- **"duplicates"** → Check 4 only
- **"dead"** → Check 5 only
- **"relationships"** → Check 6 only
- **"full"** or no argument → All checks
