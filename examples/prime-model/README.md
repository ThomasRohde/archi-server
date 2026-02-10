# Archi Server + ArchiCLI Prime Example Model

This folder contains a complete ArchiMate prime example BOM for modeling the Archi Server and ArchiCLI architecture.

## File

- `archi-server-archicli-prime-model.json`
  - Creates a complete cross-layer model (Motivation, Strategy, Business, Application, Technology, Implementation & Migration)
  - Creates 5 curated viewpoints with elements and connections
  - Sets a multi-paragraph Markdown property (`Markdown`) on every element

## Apply From an Empty Model

From repo root:

```bash
npx --yes tsx archicli/src/cli.ts verify ./examples/prime-model/archi-server-archicli-prime-model.json --semantic
npx --yes tsx archicli/src/cli.ts batch apply ./examples/prime-model/archi-server-archicli-prime-model.json --layout --rankdir LR
```

## Notes

- The BOM is self-contained and does not require external `idFiles`.
- `model save` can fail if no model is selected in the Archi UI. If that happens, select the model in Archi and save again.
