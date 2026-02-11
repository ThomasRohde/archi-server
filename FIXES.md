# Remaining Work Backlog

Date: 2026-02-11

This file tracks follow-up work after the first-pass CLI experience fixes completed in this session.

## Remaining High-Priority Work

1. Enforce strict machine-output contract for `--output json|yaml`.
   - Goal: stdout must contain only the response payload, with no mixed human guidance.
   - Move non-fatal warnings from ad-hoc stderr lines into structured response fields (`metadata.warnings` or `data.warnings`).
   - Keep stderr only for fatal/runtime failures that terminate the command.

2. Make `--output text` behavior consistent across commands.
   - Standardize around one text renderer path.
   - Remove command-specific ad-hoc text formatting where possible.
   - Keep usage and runtime errors visually consistent.

3. Add integration coverage for real server behavior.
   - Add an end-to-end test for `view export --all` against the `/views` envelope response.
   - Add an end-to-end test that validates `model save` without requiring UI-selected global `model`.
   - Keep current fallback behavior until these tests are stable in CI.

4. Improve first-run/onboarding UX.
   - Add a `doctor`-style command for preflight diagnostics (server, model availability, command stack/view readiness).
   - Add an `init`/template command for bootstrapping a minimal BOM workflow in an empty directory.
   - Add discoverable examples for common tasks (create element, create view, export view, apply/poll cycle).

5. Refresh and automate docs parity.
   - Update `README.md` command inventory so it includes current command surface (`folder`, `ids`, `model save`, `model stats`, `view layout`).
   - Add a docs check that compares README command listings with the Commander command tree.

## Notes

- Completed this session:
  - Fixed `view export --all` parsing to support both legacy array and `{ views, total }` responses.
  - Fixed server `model save` path lookup to use `serverState.modelRef` instead of global UI-selected `model`.
  - Switched completion generation to derive command vocabulary from the live Commander tree (prevents drift).
  - Added unit regression tests for completion vocabulary and view-list response normalization.
