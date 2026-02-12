# Progressive Discovery Workflow

Use this file first. It defines what to load next and prevents over-fetching context.

## Mandatory Loading Order

1. Read `reference/10-mcp-tool-catalog.md` before calling any Archi MCP tool.
2. Read `reference/20-modeling-playbook.md` before selecting element or relationship types.
3. Read `reference/40-quality-gates.md` before finalizing or saving model changes.
4. Read `reference/30-operation-recipes.md` only for complex tasks (multi-view, migration, or large batches).

## Discovery Decision Tree

## A) User asks for analysis only (no changes)

Load:
- `10-mcp-tool-catalog.md` (read-only tool subset)
- `20-modeling-playbook.md` (to interpret semantics)
- `40-quality-gates.md` (read-only checks)

Then use read-only tools only.

## B) User asks to create/update model content

Load:
- `10-mcp-tool-catalog.md`
- `20-modeling-playbook.md`
- `30-operation-recipes.md`
- `40-quality-gates.md`

Then execute safe mutation sequence: discover → plan batch → apply → wait → validate.

## C) User asks to create or fix a view

Load:
- `10-mcp-tool-catalog.md` (view + layout tools)
- `20-modeling-playbook.md` (viewpoint and abstraction guidance)
- `30-operation-recipes.md` (view assembly recipe)
- `40-quality-gates.md` (view integrity checks)

## D) User asks for script-level diagnostics

Load:
- `10-mcp-tool-catalog.md` (only `archi_run_script` section + diagnostics)
- `40-quality-gates.md`

Use `archi_run_script` sparingly; prefer structured tools first.

## Global Rules

- Do not mutate model content until scope is clear.
- Treat ambiguous requirements as blocking uncertainty and ask a clarifying question.
- Prefer read tools before write tools.
- After each async mutation, call wait/status tools before dependent operations.
- Keep relationship-heavy batches at 20 operations or fewer.
