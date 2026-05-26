# Public Error Contract

This contract defines the safe error shape that can cross public HTTP, webhook,
desktop pairing, worker, and connector boundaries.

## Shape

```json
{
  "error": {
    "code": "CONTROL_PLANE_CONFIG_INVALID",
    "message": "Invalid control-plane configuration.",
    "category": "validation",
    "retryable": false,
    "safeDetails": {
      "issueCount": 1
    },
    "correlationId": "..."
  }
}
```

`correlationId` is added by outer adapters when available. It is not part of the
shared `SafeError` value because correlation is transport/runtime context.

## Required Fields

- `code`: stable machine-readable string.
- `message`: safe human-readable message.
- `category`: one of `validation`, `authorization`, `not-found`, `conflict`,
  `external`, `internal`.
- `retryable`: explicit retry hint.

## Optional Fields

- `safeDetails`: flat primitive metadata only. Values must be string, number,
  boolean, or null. No nested request payloads, tokens, provider bodies, stack
  traces, SQL messages, prompts, diffs, or local filesystem paths.
- `correlationId`: safe operational trace id added outside the domain.

## Shared Kernel Rules

The canonical shared primitives live in `@agent-teams-control-plane/shared`:

- `createSafeError`
- `toSafeError`
- `CONTROL_PLANE_INTERNAL_ERROR`
- `ValidationIssue`
- `ValidationResult`

Unknown exceptions must be converted through `toSafeError`. The fallback is
`CONTROL_PLANE_INTERNAL_ERROR` with a generic message, so accidental internal
details do not leak.

## Non-Goals

Phase 2 does not add global HTTP exception filters, persistence error mapping,
GitHub provider error mapping, or queue dead-letter contracts. Those mappings
must adapt provider/runtime errors into this contract in later phases.

Phase 3 adds the API adapter for this contract through
`@agent-teams-control-plane/platform-api`. Provider-specific mappings, auth
mappings, persistence mappings, and queue dead-letter contracts remain later
feature/platform work.
