ArchiCLI Blind Test Report

Context
- OS: Windows 11 (PowerShell)
- CLI: archicli v0.1.0 (global script at %APPDATA%\npm\archicli.ps1)
- Server: Model API Server v1.1.0 at http://127.0.0.1:8765
- Initial model: 0 elements, 0 relationships, 1 view

Commands Exercised
- archicli health: OK; returned server status, JVM memory, and model counts.
- archicli model query: OK; empty summary initially, then 1 element after mutations.
- archicli model search --type application-component: OK; empty before creation.
- archicli view list / view create "CLI Test View": OK; created view id-8b113c076d3342d7a77616c4295c2fe2.
- archicli verify changes.json: OK; schema bom valid.
- archicli batch apply changes.json --poll: First attempt failed, second attempt succeeded.
- archicli view get <id>: OK; returned visual objects (archimate object, note, group) with positions and visual IDs.

Test BOM (changes.json)
- Intended: create view (tempId cli-view), create application-component (cli-app), addToView (cli-app-vis), createNote (test-note), createGroup (test-group).
- First run failed with error: "Cannot find view: cli-view" (partial failure of chunk 1/1).
- Resolution: created view via CLI (view create) and updated BOM to use the real viewId; re-verified and applied successfully.

Observed Issues
1) TempId resolution for viewId within the same batch failed
- Repro: BOM includes createView (tempId cli-view) followed by addToView/createNote/createGroup using viewId=cli-view.
- Expected: Later ops in the same batch can reference earlier tempIds (per help text).
- Actual: batch apply returned error "Cannot find view: cli-view"; no operations executed.
- Impact: Forces a two-step workflow (create view first, then apply a second BOM) or manual viewId injection; breaks the advertised tempId behavior for viewId.

2) Incorrect id mapping saved for createNote/createGroup in <file>.ids.json
- After successful apply, auto-saved C:\Users\thoma\Projects\archicli-test\changes.ids.json contained:
  {
    "cli-app": "id-844e90bf23b8483a854ae4bff56189fa",            // correct (conceptId)
    "cli-app-vis": "id-0b393e971ff64d0d9db1258e0f4a0e8b",           // correct (visualId)
    "test-note": "id-8b113c076d3342d7a77616c4295c2fe2",            // WRONG (this is the viewId)
    "test-group": "id-8b113c076d3342d7a77616c4295c2fe2"            // WRONG (viewId again)
  }
- Expected: test-note mapped to noteId (id-0ecb0dca47e3423fa9eb9d4315b1dd20), test-group mapped to groupId (id-d51dc074ca7e4b94a20ed2b975ddd648).
- Impact: idFiles feature becomes unreliable for notes/groups; downstream BOMs will reference incorrect IDs.

3) Verify command checks schema only, not inter-op semantics
- verify reported valid for the failing BOM; it did not detect the unresolved tempId reference to an unpublished view.
- Suggest adding optional semantic validation (e.g., order-dependent tempId resolution, referential checks within a single BOM).

4) Batch apply error reporting could be more actionable
- Console showed: "Chunk 1/1: error (2)" and a top-level error; no per-op index or operation context was surfaced.
- Suggest including failing op index, type, and a short hint (e.g., "viewId refers to unknown tempId 'cli-view'") in both JSON and text output.

Strengths
- Excellent, comprehensive help text with clear concepts (tempIds, async ops, visual vs concept IDs).
- Consistent JSON output with requestId and timestamps; good performance (sub-10ms operations locally).
- View APIs are practical (list, get, create, export) and model query/search behave predictably.

Recommendations
- Fix tempId handling for viewId inside the same batch, or document a limitation and provide a two-pass example using idFiles.
- Correct id mapping logic for createNote/createGroup so tempIds map to noteId/groupId, not viewId.
- Enhance verify with optional semantic checks: --semantic or --preflight to catch intra-batch reference issues.
- Improve batch apply error messages with failing op index and context; add a text-mode summary when --output text is used.
- Consider a special placeholder for the active view (e.g., viewId="current") to simplify common tasks.
- Add a minimal BOM example in docs demonstrating createView + addToView with tempIds that works end-to-end.

Artifacts
- changes.json (final, applied successfully)
- changes.ids.json (auto-saved; demonstrates the incorrect mappings for note/group)
- Created view: id-8b113c076d3342d7a77616c4295c2fe2 containing the app object, a note, and a group.
