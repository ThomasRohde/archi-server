# Experience Report: Using `archicli`

Date: `2026-02-11`  
CLI version tested: `archicli 1.6.1`  
Server observed: Archi Model API Server `1.1.0`

## Setup Experience
- `archicli --help` was clear and gave a full workflow and prerequisites.
- `archicli health` immediately confirmed connectivity and model/server state.
- Server was reachable at `http://127.0.0.1:8765`.

## What I Ran
- Command discovery:
  - `archicli --help`
  - `<command> --help` for `health`, `verify`, `batch`, `model`, `view`, `ops`, `folder`, `ids`, `completion`
- Read operations:
  - `model query`, `model search`, `model stats`, `view list`, `view get`, `folder list`, `ops list`, `ops status`
- Write operations (with cleanup):
  - `view create` + `view delete`
  - `batch apply` create element + delete element
  - async path with `batch apply --no-poll` then `ops status --poll`
- Validation/splitting:
  - `verify` on valid/invalid BOM files
  - `batch split` with `--chunk-size` and deprecated `--size`
- Output modes:
  - `--output json`, `--output text`, `--output yaml`
  - text table truncation with and without `--wide`

## What Worked Well
- Help text quality is high and practical.
- `health` gives immediately useful diagnostics.
- `batch apply` default behavior is safety-oriented and predictable.
- `verify --semantic` gave precise preflight diagnostics.
- `ids lookup` and `--id-file` support made tempId workflows easy to manage.
- `ops` commands made async tracking straightforward.

## Frictions and Surprises
- Some commands append warnings after JSON output, which can break strict JSON parsing in scripts.
  - Seen with `batch apply --no-poll`
  - Seen with `batch apply --fast`
  - Seen with `batch split --size` (deprecation warning)
- `--output text` is not uniform:
  - some responses are tables
  - some look YAML-like
  - usage errors are plain strings
- `model save` failed in this session with:
  - `Could not get the currently selected model. Select a model before running this script.`
  - This happened even though `health` reported an open model.
- `view export --all` returned `NO_VIEWS` while `view list` showed one view.
- Generated PowerShell completion script looked behind current CLI surface:
  - it did not include `folder`/`ids`, and missed some newer subcommands.

## Performance and Stability
- Most read commands returned in well under a second.
- Apply operations completed quickly on tiny batches.
- Error messages were specific and actionable.

## Overall
`archicli` is usable and well-structured for automated model workflows, especially around BOM validation, chunked apply, async tracking, and tempId mapping. The biggest practical issue for automation is mixed/extra output lines in cases where strict JSON-only stdout would be expected.

