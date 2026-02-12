---
name: archi-mcp-modeling
description: 'Model and evolve ArchiMate architectures through the local Archi MCP server with semantically correct element and relationship choices. Use when asked to create/update Archi models, generate views, map capabilities to applications/technology, or apply migration roadmaps using safe async operations.'
license: Complete terms in LICENSE.txt
---

# Archi MCP Modeling Skill

## Overview

Use this skill to model ArchiMate content through the Archi MCP server with progressive discovery, explicit tool selection, and safe async mutation handling.

This skill is intentionally structured across files. Start with the discovery guide and load only the references needed for the current task.

## When to Use This Skill

Use when the user asks to:
- Create or update ArchiMate elements/relationships via MCP tools
- Build a new architecture view from requirements or patterns
- Map strategy/capabilities to business/application/technology layers
- Model microservices, integration, cloud, migration, or roadmap structures
- Audit and improve model quality (orphans, wrong relationships, layer violations)

## Prerequisites

- Archi model is open
- Archi API server is running
- The agent can call Archi MCP tools (list/search/apply/view/layout/save)

## Progressive Discovery (Load in This Order)

1. Read `reference/00-progressive-discovery.md` first.
2. Read `reference/10-mcp-tool-catalog.md` before selecting any MCP tool.
3. Read `reference/20-modeling-playbook.md` before deciding element or relationship types.
4. Read `reference/40-quality-gates.md` before completion.
5. Read `reference/30-operation-recipes.md` for complex or multi-step mutations.

## Execution Contract

- Prefer read tools before write tools.
- Treat async mutations as incomplete until wait/status confirms completion.
- Use `tempId` and visual ID mapping rigorously.
- Keep relationship-heavy batches at or below 20 operations.
- Ask clarifying questions when user intent is ambiguous.
- Do not perform destructive operations without explicit user intent.

## Explicit Tooling Requirement

The complete available tool inventory, with usage timing and sequencing, is documented in:

- `reference/10-mcp-tool-catalog.md`

Do not improvise tool usage outside this catalog unless a structured tool is unavailable and script execution is justified.

## Outcome Standard

Successful completion means:
- Semantically correct ArchiMate elements and relationships
- Valid model/view integrity checks
- Clear summary of what changed and what remains uncertain
- Model saved/exported only when requested

## References

- [Progressive discovery workflow](./reference/00-progressive-discovery.md)
- [Explicit Archi MCP tool catalog](./reference/10-mcp-tool-catalog.md)
- [Modeling semantics playbook](./reference/20-modeling-playbook.md)
- [Operation recipes](./reference/30-operation-recipes.md)
- [Quality gates](./reference/40-quality-gates.md)
- [ArchiMate best practices](../../../context/archimate.md)
- [Archi API OpenAPI spec](../../../openapi.yaml)
- [Script Development Guide for Agents](../../../context/Script Development Guide for Agents.md)
- [Project-level runtime instructions](../../../.github/copilot-instructions.md)
