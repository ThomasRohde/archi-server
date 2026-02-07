# YAML Runbook Specification for Archi REST CLI

## Review Summary

This revision tightens the spec in four areas:

- Removes ambiguous expression symbols like `response.body` as the default authoring pattern.
- Defines a stable runtime context and step-local aliases (`http`, `body`, `out`).
- Unifies polling semantics for `apply` and `wait`.
- Aligns async examples with the current API (`/model/apply` + `/ops/status?opId=...`).

## Goal and Operating Assumptions

The goal is a repeatable, reviewable, automatable runbook format that can be:

1. Authored by humans.
2. Generated or edited by AI agents.
3. Validated before mutating a model.

A runbook is treated as pure data after YAML parsing:

- Parse YAML into a JSON-compatible tree.
- Ignore YAML features that create hidden graph behavior (for example aliases).
- Validate using JSON Schema.

## Design Principles

- Explicit schema versioning (`apiVersion`) so unsupported features fail early.
- Ordered steps executed top to bottom by default.
- Small, explicit expression surface instead of embedding a programming language.
- Deterministic output extraction and variable assignment.
- HTTP-first primitives so new endpoints can be used without CLI release changes.

## Runbook Document Model

### Top-level document

A runbook MUST be a YAML mapping with:

- `apiVersion` (string, required), example: `archi-cli/v1alpha1`
- `kind` (string, required), fixed value: `Runbook`
- `metadata` (mapping, optional)
- `spec` (mapping, required)

### Connection and defaults

`spec.connection`:

- `baseUrl` (string, required), example `http://127.0.0.1:8765`
- `headers` (mapping string -> string, optional)
- `timeoutMs` (integer, optional)
- `retry` (mapping, optional):
  - `maxAttempts` (integer, default `1`)
  - `backoffMs` (integer, default `0`)
  - `retryOnStatus` (array of integers, default `[429, 502, 503, 504]`)

`spec.defaults`:

- `expect.status` (integer or array of integers, optional)

## Runtime Context and Expressions

### Global runtime context

Expressions are evaluated against this context:

```json
{
  "vars": {},
  "env": {},
  "steps": {
    "<stepId>": {
      "status": "success|failed|skipped",
      "http": {
        "status": 200,
        "headers": {},
        "body": {}
      },
      "out": {},
      "error": null
    }
  }
}
```

### Step-local aliases

When evaluating step-local expressions (`when`, `expect`, `outputs`, `that`, `assign`), the CLI MUST also inject:

- `step` -> current step object (`steps.<id>`)
- `http` -> `step.http`
- `body` -> `step.http.body`
- `out` -> `step.out`

This keeps common expressions concise and avoids noisy paths like `response.body`.

### Expression syntax

- Delimiter: `${{ ... }}`
- Language: JMESPath
- Allowed in all YAML string values
- Evaluation rules:
  - If a string is exactly one expression token, the native JSON value is inserted.
  - If a string mixes literals and expression tokens, tokens are stringified and concatenated left-to-right.
- Unknown references are errors (fail fast).
- Leading-dot shorthand (for example `.response.body.id`) is invalid.

### Output extraction

Each step MAY define `outputs`:

- `outputs` is a mapping from output name to expression string.
- Expressions run after the step succeeds and after `expect` passes.
- Results are stored at `steps.<id>.out.<name>`.

Example:

```yaml
outputs:
  viewId: "${{ body.viewId }}"
```

## Expectations and Failure Semantics

Each step MAY define `expect`:

- `expect.status`: integer or array of integers
- `expect.body.hasKeys`: required top-level keys in `body`
- `expect.body.expr`: expression string that MUST evaluate truthy

Failure rules:

- Any `expect` failure marks the step failed.
- The runbook stops unless `continueOnError: true`.

## Step Model and Common Fields

Every step MUST have:

- `id` (string, unique in runbook)
- `type` (string)

Common optional fields:

- `name` (string)
- `when` (expression string)
- `continueOnError` (boolean, default `false`)
- `retry` (override retry policy)
- `timeoutMs` (override timeout)
- `expect`
- `outputs`

## Step Types

### `type: http`

Required:

- `request.method`: `GET|POST|PUT|DELETE|PATCH`
- `request.path`: path relative to `spec.connection.baseUrl`

Optional:

- `request.query`
- `request.headers`
- `request.body`

Execution result is captured in:

- `step.http.status`
- `step.http.headers`
- `step.http.body`

### `type: apply`

Convenience sugar over `POST /model/apply` with optional wait/poll.

Fields:

- `endpoint` (string, default `/model/apply`)
- `changes` (array, required)
- `wait` (boolean, default `true`)
- `operationIdFrom` (expression, default `body.operationId`)
- `poll` (mapping, optional):
  - `endpoint` (string, default `/ops/status`)
  - `opIdParam` (string, default `opId`)
  - `intervalMs` (integer, default `250`)
  - `timeoutMs` (integer, default `60000`)
  - `successStatus` (string, default `complete`)
  - `errorStatus` (string, default `error`)

Execution:

1. POST `{ "changes": [...] }` to `endpoint`.
2. Record immediate response in `step.http`.
3. If `wait: false`, step ends.
4. If `wait: true`, extract operation ID via `operationIdFrom`.
5. Poll `poll.endpoint` with query `{ [poll.opIdParam]: operationId }` until:
   - `body.status == successStatus` -> success.
   - `body.status == errorStatus` -> failure.
   - timeout -> failure.
6. Final poll response replaces `step.http`.

### `type: wait`

General-purpose polling wait.

Fields:

- `until` (expression, required)
- `failWhen` (expression, optional)
- `poll` (mapping, required):
  - `request` (same shape as `http.request`, required)
  - `intervalMs` (integer, default `250`)
  - `timeoutMs` (integer, default `60000`)

Execution:

- Repeatedly perform `poll.request`.
- After each response, set `step.http`.
- Stop when `until` is truthy.
- Fail when `failWhen` becomes truthy or timeout is reached.

### `type: set`

Assigns values into `vars`.

Fields:

- `assign` (mapping string -> any, required)

Rules:

- Each assigned value may use `${{ ... }}` expressions.
- Keys in `assign` are variable names (not JSON paths).
- Assigned values are written to `vars.<key>`.

### `type: assert`

Stops execution unless condition is truthy.

Fields:

- `that` (expression, required)
- `message` (string, optional)

### `type: foreach`

Runs nested steps for each array item.

Fields:

- `items` (expression, required, must evaluate to array)
- `as` (string, default `item`)
- `steps` (array, required)

Loop context per iteration:

- `vars.loop.index`
- `vars.loop.<as>`

### `type: parallel`

Runs branches concurrently.

Fields:

- `maxConcurrency` (integer, default `4`)
- `branches` (array of `{ name, steps }`, required)

Rules:

- Each branch sees the same initial `vars` snapshot.
- `set` in one branch is branch-local only.
- Branch step results are exposed under `steps.<parallelId>.branches.<name>`.

### `type: script`

Privileged sugar over script endpoint.

Runbook gate:

- `spec.permissions.scripts: true` is required.

Fields:

- `endpoint` (string, default `/scripts/run`)
- `code` (string, required)

## Validation and Tooling

### Schema validation

Publish a JSON Schema (draft 2020-12) with the CLI and validate runbooks before execution.

Editor wiring (VS Code + Red Hat YAML extension / yaml-language-server):

```yaml
# yaml-language-server: $schema=./archi-runbook.schema.json
apiVersion: archi-cli/v1alpha1
kind: Runbook
spec: {}
```

Alternative workspace mapping (`.vscode/settings.json`):

```json
{
  "yaml.schemas": {
    "./archi-cli/archi-runbook.schema.json": [
      "archi-cli/*.runbook.yaml",
      "archi-cli/*.runbook.yml"
    ]
  }
}
```

### Versioning

- Use `apiVersion` to gate features.
- Backward-incompatible changes require a new `apiVersion`.

### Linting recommendations

- Enforce unique step IDs.
- Disallow unknown top-level keys.
- Disallow ambiguous expression roots.
- Warn when `continueOnError: true` is used without explicit logging/assertion later.

## Canonical Spec Shape (YAML by Example)

```yaml
apiVersion: archi-cli/v1alpha1
kind: Runbook

metadata:
  name: string
  description: string
  labels: { string: string }

spec:
  connection:
    baseUrl: string
    headers: { string: string }
    timeoutMs: int
    retry:
      maxAttempts: int
      backoffMs: int
      retryOnStatus: [int]

  permissions:
    scripts: false

  vars: {}

  defaults:
    expect:
      status: int|[int]

  steps:
    # common fields available on every step
    - id: string
      type: http|apply|wait|set|assert|foreach|parallel|script
      name: string
      when: "${{ <jmespath expr> }}"
      continueOnError: false
      timeoutMs: int
      retry:
        maxAttempts: int
        backoffMs: int
        retryOnStatus: [int]
      expect:
        status: int|[int]
        body:
          hasKeys: [string]
          expr: string
      outputs:
        someName: "${{ <jmespath expr> }}"   # stored in steps.<id>.out.someName

    # http step
    - id: string
      type: http
      request:
        method: GET|POST|PUT|DELETE|PATCH
        path: string
        query: { string: string }
        headers: { string: string }
        body: {}|[]|string|number|boolean|null

    # apply step
    - id: string
      type: apply
      endpoint: string
      changes: []
      wait: true
      operationIdFrom: string
      poll:
        endpoint: string
        opIdParam: string
        intervalMs: int
        timeoutMs: int
        successStatus: string
        errorStatus: string

    # wait step
    - id: string
      type: wait
      until: "${{ <jmespath expr> }}"
      failWhen: "${{ <jmespath expr> }}"
      poll:
        request:
          method: GET|POST|PUT|DELETE|PATCH
          path: string
          query: { string: string }
          headers: { string: string }
          body: {}|[]|string|number|boolean|null
        intervalMs: int
        timeoutMs: int

    # set step
    - id: string
      type: set
      assign: { string: any }

    # assert step
    - id: string
      type: assert
      that: "${{ <jmespath expr> }}"
      message: string

    # foreach step
    - id: string
      type: foreach
      items: "${{ <jmespath expr> }}"
      as: string
      steps: []

    # parallel step
    - id: string
      type: parallel
      maxConcurrency: int
      branches:
        - name: string
          steps: []

    # script step
    - id: string
      type: script
      code: string
```

## End-to-End Example Runbook

```yaml
apiVersion: archi-cli/v1alpha1
kind: Runbook

metadata:
  name: create-view-and-export
  description: Create a view, apply model changes, validate, and export.

spec:
  connection:
    baseUrl: "http://127.0.0.1:8765"
    headers:
      Accept: "application/json"
      Content-Type: "application/json"
    timeoutMs: 30000
    retry:
      maxAttempts: 3
      backoffMs: 250
      retryOnStatus: [429, 502, 503, 504]

  permissions:
    scripts: false

  vars:
    viewName: "Payments - Capability Map"
    exportFormat: "PNG"

  steps:
    - id: health
      type: http
      request:
        method: GET
        path: "/health"
      expect:
        status: 200

    - id: createView
      type: http
      request:
        method: POST
        path: "/views"
        body:
          name: "${{ vars.viewName }}"
      expect:
        status: 200
        body:
          hasKeys: ["viewId"]
      outputs:
        viewId: "${{ body.viewId }}"

    - id: applyChanges
      type: apply
      endpoint: "/model/apply"
      changes:
        - op: createElement
          type: capability
          name: "Payments"
          tempId: cap
        - op: addToView
          viewId: "${{ steps.createView.out.viewId }}"
          elementId: cap
          x: 120
          y: 120
          tempId: capVisual
      wait: true
      poll:
        endpoint: "/ops/status"
        opIdParam: opId
        intervalMs: 250
        timeoutMs: 60000
      outputs:
        finalStatus: "${{ body.status }}"

    - id: validateView
      type: http
      request:
        method: GET
        path: "/views/${{ steps.createView.out.viewId }}/validate"
      expect:
        status: 200
      outputs:
        valid: "${{ body.valid }}"

    - id: assertValid
      type: assert
      that: "${{ steps.validateView.out.valid }}"
      message: "View validation failed."

    - id: exportView
      type: http
      request:
        method: POST
        path: "/views/${{ steps.createView.out.viewId }}/export"
        body:
          format: "${{ vars.exportFormat }}"
      expect:
        status: 200
        body:
          hasKeys: ["filePath"]
      outputs:
        exportedFile: "${{ body.filePath }}"
```

## Optional JSON Schema Skeleton

Use this as a starting point. Expand with `oneOf` per step type for full validation.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.invalid/archi-runbook.schema.json",
  "title": "Archi CLI Runbook",
  "type": "object",
  "required": ["apiVersion", "kind", "spec"],
  "properties": {
    "apiVersion": { "type": "string" },
    "kind": { "const": "Runbook" },
    "metadata": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "description": { "type": "string" },
        "labels": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        }
      },
      "additionalProperties": true
    },
    "spec": {
      "type": "object",
      "required": ["connection", "steps"],
      "properties": {
        "connection": {
          "type": "object",
          "required": ["baseUrl"],
          "properties": {
            "baseUrl": { "type": "string" },
            "headers": {
              "type": "object",
              "additionalProperties": { "type": "string" }
            },
            "timeoutMs": { "type": "integer", "minimum": 1 },
            "retry": {
              "type": "object",
              "properties": {
                "maxAttempts": { "type": "integer", "minimum": 1 },
                "backoffMs": { "type": "integer", "minimum": 0 },
                "retryOnStatus": {
                  "type": "array",
                  "items": { "type": "integer", "minimum": 100, "maximum": 599 }
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "permissions": {
          "type": "object",
          "properties": {
            "scripts": { "type": "boolean", "default": false }
          },
          "additionalProperties": false
        },
        "vars": {
          "type": ["object", "array", "string", "number", "boolean", "null"]
        },
        "steps": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["id", "type"],
            "properties": {
              "id": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_-]{0,63}$"
              },
              "type": {
                "enum": [
                  "http",
                  "apply",
                  "wait",
                  "set",
                  "assert",
                  "foreach",
                  "parallel",
                  "script"
                ]
              },
              "when": { "type": "string" },
              "continueOnError": { "type": "boolean" },
              "outputs": {
                "type": "object",
                "additionalProperties": { "type": "string" }
              }
            },
            "additionalProperties": true
          }
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```
