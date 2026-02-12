# Archi MCP Modeling

Model and evolve an ArchiMate architecture using the local Archi MCP server with progressive discovery, explicit tool usage, and strict semantic correctness.

## Load This Skill First

Read and follow this skill entrypoint:
- `./.agents/skills/archi-mcp-modeling/SKILL.md`

Then follow its progressive loading order:
1. `./.agents/skills/archi-mcp-modeling/reference/00-progressive-discovery.md`
2. `./.agents/skills/archi-mcp-modeling/reference/10-mcp-tool-catalog.md`
3. `./.agents/skills/archi-mcp-modeling/reference/20-modeling-playbook.md`
4. `./.agents/skills/archi-mcp-modeling/reference/40-quality-gates.md`
5. `./.agents/skills/archi-mcp-modeling/reference/30-operation-recipes.md` (for complex or multi-step work)

## Mandatory Clarification Protocol (Before Mutation)

If any requirement is ambiguous or missing, ask clarifying questions before calling mutation tools.

- In Copilot, use `askQuestions`.
- In Claude Code, use `AskUserQuestion`.

Ask about:
- Scope and objective (what should be modeled or changed)
- Target viewpoint or audience
- Reuse vs create-new preference
- Save/export expectations

Do not run model mutation operations until ambiguity is resolved, unless the user explicitly says to make reasonable assumptions.

## Tooling Discipline

- Prefer read tools before write tools.
- Use the explicit catalog in `10-mcp-tool-catalog.md` for tool selection.
- Treat async mutation as incomplete until wait/status confirms completion.
- Keep relationship-heavy batches at ≤20 operations.
- Use visual IDs (not concept IDs) for `addConnectionToView`.

## Output Contract

Return a concise handoff including:
- What changed (elements, relationships, views)
- Which quality gates were checked
- Any assumptions or unresolved decisions
- Whether model save/export was performed
