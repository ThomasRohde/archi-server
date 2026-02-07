---
name: audit
description: Audit an ArchiMate model for quality issues, naming violations, orphans, and anti-patterns
argument-hint: "[optional: specific check to run, e.g., orphans, naming, duplicates]"
allowed-tools:
  - Read
  - Bash
---

# ArchiMate Model Quality Audit

Audit the current ArchiMate model in Archi for quality issues by querying the API. Reports findings and optionally applies fixes.

Load the **archi-server-api** skill for API execution details and the **archimate-quality** skill for quality rules.

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

Search each major element type and check for elements with no relationships:

```bash
# Search all elements of a type
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "business-actor", "limit": 200}'
```

For each element, check if it has zero relationships. Elements with empty relationship arrays are orphans.

For specific elements, get full details:
```bash
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

Report orphans grouped by type.

#### Check 2: Naming Convention Violations

Rules (from archimate-quality skill):
- **Structural elements** (actors, components, nodes): Title Case singular noun phrases
- **Processes**: Present-tense Verb + Noun (e.g., "Handle Claim")
- **Functions**: Gerund or verb phrase (e.g., "Order Management")
- **Services**: Noun or gerund phrase
- **Capabilities**: Compound noun/gerund
- No abbreviations unless domain-standard
- No element type in the name (e.g., "CRM Component" → "CRM")

Search elements and check names against conventions:
```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "business-process", "limit": 200}'
```

Flag violations: names missing verb prefix (processes), names in all-lowercase, names containing type words (e.g., "Process" in a process element name).

#### Check 3: Missing Documentation

Search all elements and flag those with empty or missing documentation:

```bash
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"limit": 500}'
```

Report count and list of undocumented elements by type.

#### Check 4: Duplicate Elements

Search for potential duplicates — elements with same or very similar names:

```bash
# Search with broad patterns
curl -s -X POST http://localhost:8765/model/search \
  -H "Content-Type: application/json" \
  -d '{"type": "application-component", "limit": 200}'
```

Compare names for exact duplicates and near-duplicates (case differences, plural/singular variants).

#### Check 5: Dead Elements (Not in Any View)

For elements returned by search, check if they appear in any view:

```bash
curl -s http://localhost:8765/model/element/ELEMENT_ID
```

If the `views` array is empty, the element is not visualized in any view.

#### Check 6: Relationship Issues

Look for:
- **Association overuse**: Many `association-relationship` where specific types could apply
- **Missing layer intermediation**: Business elements directly connected to Technology (should go through Application layer)
- **Circular dependencies**: A→B and B→A relationships

## Audit Report Format

Present findings as:

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

Offer to fix issues:

```bash
# Fix naming
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "updateElement", "id": "ID", "name": "Corrected Name"}
  ]}'

# Remove orphans
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "deleteElement", "id": "ORPHAN_ID", "cascade": true}
  ]}'

# Add documentation
curl -s -X POST http://localhost:8765/model/apply \
  -H "Content-Type: application/json" \
  -d '{"changes": [
    {"op": "updateElement", "id": "ID", "documentation": "Description of element purpose"}
  ]}'
```

Always poll for completion:
```bash
curl -s "http://localhost:8765/ops/status?opId=OP_ID"
```

### Step 5: Save After Fixes

```bash
curl -s -X POST http://localhost:8765/model/save
```

## Audit Scope Options

If the user specifies a scope, focus on that:
- **"orphans"** → Check 1 only
- **"naming"** → Check 2 only
- **"documentation"** → Check 3 only
- **"duplicates"** → Check 4 only
- **"dead"** → Check 5 only
- **"relationships"** → Check 6 only
- **"full"** or no argument → All checks
