# GitHub GraphQL Infrastructure

## Decision

Agent GitHub actions use a dependency-free GraphQL adapter for comment and review
mutations. The adapter calls GitHub GraphQL with the installation access token issued by
the token broker.

No Octokit dependency is required for the current foundation:

- the token broker already owns GitHub App authentication;
- GraphQL is a single JSON POST endpoint;
- keeping the adapter on `fetch` avoids SDK leakage into application/domain layers;
- architecture guardrails stay simple: GitHub transport details remain in infrastructure.

`CONTROL_PLANE_GITHUB_GRAPHQL_ENDPOINT` is optional and defaults to
`https://api.github.com/graphql`. The override is intended for test environments or
future GitHub Enterprise support.

## Current Routing

The runtime dispatcher is a composite adapter:

- GraphQL:
  - `github.issue_comment.create`
  - `github.pull_request_comment.create_top_level`
  - `github.pull_request_review.create`
- REST:
  - `github.check_run.create_or_update`

Check runs stay REST because the Checks API is GitHub App oriented and is already modeled
around REST endpoints and stored check run ids.

## Error And Retry Semantics

GraphQL transport failures during read-only target resolution are retryable.

GraphQL transport failures after a mutation attempt are not retried automatically. GitHub
GraphQL accepts `clientMutationId`, but that field must not be treated as a provider-level
idempotency guarantee for duplicate prevention. Until marker lookup exists for GraphQL
mutations, unknown mutation results are converted to
`CONTROL_PLANE_GITHUB_ACTION_UNKNOWN_RESULT`.

Provider messages and tokens are never copied into safe errors. The adapter maps GitHub
HTTP and GraphQL errors into existing action-level safe error codes.

## Future Action Mapping

Likely GraphQL-first actions:

- create issue: `createIssue`
- create pull request: `createPullRequest`
- create commit on branch: `createCommitOnBranch`
- labels: `addLabelsToLabelable`, `removeLabelsFromLabelable`
- assignees: `addAssigneesToAssignable`, `removeAssigneesFromAssignable`
- PR review decisions: `addPullRequestReview` with `APPROVE` or `REQUEST_CHANGES`
- merge PR: `mergePullRequest`

REST should remain available where GitHub exposes better REST-only semantics or where an
existing REST flow already has stronger idempotency and response handling.
