# Experience Report: Using `archicli`

Date: 2026-02-11  
Environment: Windows PowerShell, `archicli 1.6.1`

## Scope

I explored the CLI directly from an empty workspace and documented behavior from:

- top-level and subcommand `--help`
- read-only model/view/folder/ops commands
- validation and split workflows on scaffolded BOM files
- output format and strictness flags

## What I ran and observed

1. Discovery

- `archicli --help` exposed a clear command structure (`health`, `verify`, `batch`, `model`, `view`, `ops`, `folder`, `ids`, `doctor`, `init`, `completion`).
- `archicli --version` returned `1.6.1`.

2. Environment readiness

- `archicli health` succeeded: server was reachable at `127.0.0.1:8765`.
- `archicli doctor` succeeded with warning state because no views existed yet.

3. Model inspection

- `model query`, `model stats`, `view list`, and `model search` all worked.
- Current model was effectively empty (`0` elements, relationships, and views).
- `folder list` still returned default Archi folder hierarchy.

4. Starter workflow

- `archicli init <dir>` generated:
  - `01-elements.json`
  - `02-view.json`
  - `README.md`
- In a non-empty directory without `--force`, it created a `starter-bom` subfolder and emitted a warning.
- With `--force`, it wrote starter files directly into the non-empty target.

5. Validation behavior

- `verify 01-elements.json --semantic` passed.
- `verify 02-view.json --semantic` failed as expected because required `01-elements.ids.json` did not exist yet.
- `--allow-incomplete-idfiles` suppressed the id-file completeness error, but semantic unresolved tempId errors still failed validation.

6. Batch behavior

- `batch apply 01-elements.json --dry-run` showed default correctness-first mode: chunk size `1`.
- `--fast` switched to chunk size `20` and emitted a warning about speed-oriented settings.
- `batch split --chunk-size 2` generated chunk files and an index BOM.
- `batch split --size 2` worked and returned a deprecation warning.

7. Search strictness

- `model search --type <unknown>` returned success + warning in default mode.
- Adding `--strict-types` turned the same case into an `INVALID_ARGUMENT` failure (exit `1`).

8. Output modes

- `--output json` (default), `--output text`, and `--output yaml` all worked.
- `--quiet` reduced wrapper noise on successful responses.

## Practical takeaways

- The CLI is opinionated in a good way: defaults prioritize safety (`batch apply` chunk-size `1`, polling on).
- Error payloads are actionable; semantic validation gives concrete `path` + hint entries.
- `init` plus staged producer/consumer BOMs is a solid onboarding path.
- For automation, use:
  - `--strict-types` for deterministic validation
  - `verify --semantic` before any apply
  - `batch apply` over `model apply` unless low-level control is required

## Friction points noticed

- The visual ID vs concept ID distinction is easy to miss for view operations.
- Name resolution (`--resolve-names`) cannot replace missing producer-generated IDs in all cases.
- `--size` still works in `batch split`, but it is deprecated and should be avoided.
