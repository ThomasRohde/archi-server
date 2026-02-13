# Task Routing Guide

Read this file first for every task. It determines exactly which reference files to load based on what the user is asking for, so you never over-fetch context or miss a critical reference.

## Routing Decision Tree

### A) Analysis Only — no model changes

User wants to understand, inspect, audit, or report on existing model content.

**Load:**
- `10-mcp-tool-catalog.md` — read-only tool subset (search, query, view inspection, diagnostics)
- `20-modeling-playbook.md` — element/relationship semantics for interpreting what you find

**Workflow:** health check → search/query → view summary → summarize findings.

**Do not** load operation recipes or quality gates — nothing is being mutated.

---

### B) Create or Update Elements and Relationships

User wants to add new concepts, change existing ones, or build out a domain.

**Load:**
- `10-mcp-tool-catalog.md` — full tool set including `archi_apply_model_changes`
- `20-modeling-playbook.md` — element selection, relationship semantics, naming rules
- `40-quality-gates.md` — validation before completion

**Also load `30-operation-recipes.md` if:**
- The task involves more than 10 elements/relationships
- Multiple batches will be needed
- Cross-layer relationships are involved

**Workflow:** search for existing → plan batch → apply → wait → validate → report.

---

### C) Create or Modify a View

User wants a new diagram, wants elements placed on a view, or wants layout/styling changes.

**Load:**
- `10-mcp-tool-catalog.md` — view lifecycle, placement, connection, layout, and export tools
- `20-modeling-playbook.md` — viewpoint selection and abstraction guidance
- `30-operation-recipes.md` — view assembly recipe (addToView → addConnectionToView → layout)
- `40-quality-gates.md` — view integrity checks

**Workflow:** find/create view → add visuals → add connections → wait → layout → validate → export if requested.

---

### D) End-to-End Modeling (elements + relationships + view)

User describes a scenario, architecture, or pattern and expects a complete result with a view.

**Load all references:**
- `10-mcp-tool-catalog.md`
- `20-modeling-playbook.md`
- `30-operation-recipes.md`
- `40-quality-gates.md`

**Workflow:** search existing → create elements → create relationships → wait → create view → populate/place → connect → wait → layout → validate → report.

---

### E) Model Quality Audit

User asks to find problems, fix orphans, check naming consistency, or assess model health.

**Load:**
- `10-mcp-tool-catalog.md` — diagnostics, search, and script tools
- `40-quality-gates.md` — full audit checklist

**Also load `20-modeling-playbook.md` if** the audit includes semantic correctness checks (wrong element types, weak relationships, naming violations).

**Workflow:** diagnostics → search for anti-patterns → report with remediation steps → apply fixes only if user approves.

---

### F) Scripting or Diagnostics

User asks for something only achievable via `archi_run_script` or raw model inspection.

**Load:**
- `10-mcp-tool-catalog.md` — scripting section only

**Rule:** Prefer structured tools first. Use `archi_run_script` only when no structured tool can accomplish the task.

---

## Global Rules (Apply to Every Task)

| Rule | Detail |
|---|---|
| **Read before write** | Always search/query before creating. Duplicates are a top-quality concern. For idempotent workflows, use `createOrGetElement`/`createOrGetRelationship` with `onDuplicate: reuse` instead. |
| **Wait after every mutation** | `archi_apply_model_changes` and `archi_populate_view` are async. Call `archi_wait_for_operation` before dependent ops. |
| **No guessing** | If the user's architectural intent is unclear, ask. Do not infer element types or relationship directions. |
| **No unnecessary destruction** | Deleting elements, relationships, or views requires explicit user confirmation. |
| **Batch discipline** | Keep batches ≤8 operations. The MCP layer auto-chunks larger batches, but smaller is more reliable for relationship-heavy work. |
| **Idempotency for pipelines** | When modeling is part of a rerunnable pipeline, add `idempotencyKey` to `archi_apply_model_changes` and use upsert ops. See Recipe 9 in `30-operation-recipes.md`. |
| **Save only on request** | Never auto-save the model. Only call `archi_save_model` when the user explicitly asks. |
| **Summary at completion** | Always report: what was created/changed, element counts, view names, and any unresolved concerns. |
