# Security And Privacy Model

## Trust Boundaries

```text
Agent Teams Desktop
  local-first, user-owned environment

Control Plane
  hosted integration layer, stores integration metadata and server-side secrets

External Providers
  GitHub, Telegram, Slack, Discord, billing providers, future runtime services
```

The control plane should assume that agent-authored content can be wrong or malicious. It must validate targets, capabilities, and tenant boundaries before performing external side effects.

## Secret Custody

Control plane may store:

- GitHub App private key in hosted secret manager/env
- GitHub webhook secret
- GitHub App OAuth client secret for claim verification
- messenger bot tokens
- billing provider secrets
- encrypted or hashed desktop client secrets where appropriate

Control plane must not expose these to:

- Electron renderer
- local MCP server
- agents
- runtime subprocesses
- logs
- audit metadata

GitHub installation access tokens:

- minted server-side
- short-lived
- scoped to installation/repository permission
- scoped to the target repository by `repository_ids` where possible
- narrowed to the minimum permission set required for the action
- not persisted in the database
- never returned to agents or desktop for v1

Deployment mode rules:

- hosted official app mode stores the official GitHub App private key only in our hosted secret manager/env
- self-hosted BYO app mode uses a customer-owned GitHub App and customer-owned private key
- self-hosted deployments must not receive the official app private key
- hybrid self-hosted plus official app requires a separate hosted token broker design before it is allowed

GitHub user access tokens:

- may be used for installation claim verification
- are not needed for posting agent comments in V1
- must not be exposed to desktop, agents, local MCP, or runtime subprocesses
- must not be persisted in V1 unless a future ADR adds retention, refresh, revocation, and audit rules
- OAuth authorization `state`, PKCE verifier, device codes, and user codes are short-lived secrets or secret-adjacent values
- GitHub App OAuth client secret must stay server-side only

## Data Classification

### Allowed Metadata

- workspace id/name
- desktop client id
- team name snapshot
- agent name snapshot
- agent role snapshot
- public avatar URL or hosted avatar asset id
- GitHub installation id
- GitHub user id/login snapshot for claim audit
- GitHub repository id
- repository owner/name snapshot
- issue/PR number
- connector health states
- safe external action status
- safe error codes
- external action content hash
- external action content size and retention metadata

### Sensitive Metadata

- private repository names
- user login/avatar
- org login/avatar
- message target ids
- channel names
- local git remote URLs
- branch names when not required
- PR/issue URLs when not required
- external action content when temporarily persisted for dispatch

Sensitive metadata may be stored when needed, but must be scoped by workspace, protected by authorization, and avoided in public logs.

### Forbidden By Default

- repository source code
- pull request diffs
- issue or PR body text from webhooks
- raw issue/comment body from webhooks
- raw prompts
- reusable model-output logs
- local runtime logs
- environment variables
- secret values
- raw provider tokens
- GitHub user access tokens and refresh tokens after claim verification
- GitHub OAuth authorization codes
- GitHub OAuth client secret
- PKCE verifier values
- device flow device codes and user codes
- raw webhook payloads

If a future feature needs any forbidden field, it must add:

- explicit classification
- retention policy
- user-visible reason
- redaction tests
- logging tests
- architecture decision record

## External Action Content

GitHub comments and messenger messages are user/agent-authored external action content. They may include model-generated text, but they are not general prompt/model-output storage.

V1 rule:

- control-plane may temporarily persist external action content only when needed to dispatch an explicit external action
- content must be encrypted at rest
- content encryption uses envelope encryption with per-content data encryption keys
- content must be scoped by workspace, action id, target, and connector
- content must not be logged, audited, indexed, searched, or exposed in diagnostics
- content retention is short and explicit
- successful dispatch should delete or cryptographically shred the stored content after result metadata is recorded
- failed/dead-letter actions keep content only until a bounded retention window expires or an authorized retry decision is made

Safe permanent records:

- content hash
- content size
- content schema version
- external provider result ids and URLs
- safe error codes
- redacted preview only if a future ADR explicitly allows it

If the product requires zero persistence of model-generated comment text, then V1 cannot use durable async outbox for arbitrary comment bodies. It must either use synchronous dispatch with lower reliability or a pull-from-desktop retry protocol. That tradeoff needs an ADR before implementation.

## Content Encryption And Key Management

V1 should use envelope encryption:

- generate a fresh data encryption key per `ExternalActionContent`
- encrypt content with the data encryption key
- encrypt the data encryption key with a hosted key-encryption key
- store ciphertext, encrypted data encryption key, key id, algorithm, content hash, and retention metadata
- never log plaintext content, plaintext keys, encrypted keys, or decrypted previews

Crypto adapter responsibilities:

- generate data encryption keys
- encrypt/decrypt content
- verify content hash before dispatch
- rewrap encrypted data encryption keys during key rotation
- cryptographically shred content by deleting encrypted data encryption key or making its key reference unrecoverable

Operational rules:

- key-encryption key is loaded only in server-side platform crypto infrastructure
- key rotation must support decrypting existing unexpired content until it is rewrapped or expired
- loss of key-encryption key makes pending content unrecoverable and actions must fail safely
- local development may use an env-provided development key, but production must use hosted secret manager/KMS-equivalent custody

## Agent Identity Trust

Agent identity is public attribution metadata, not a security authority.

Allowed source for V1:

- structured action envelope from paired desktop/runtime client

Forbidden source for V1:

- free-form agent-authored markdown
- user-provided hidden markers
- untrusted webhook payload text

Rules:

- attribution block is rendered by control-plane
- agent/team fields are escaped before rendering
- action stores an identity snapshot for historical audit
- authorization still checks workspace, desktop client, integration target, capability, and entitlement
- hidden comment markers are not secrets and must contain only opaque recovery metadata plus integrity digest

## Authorization Principles

- UI filtering is not authorization.
- Every operation is workspace-scoped.
- Repository authorization uses immutable GitHub repository id.
- Installation authorization uses immutable GitHub installation id.
- Local git remote URLs, branch names, PR URLs, `owner/name`, and issue/PR numbers are target hints, not authorization.
- Target authorization requires workspace + active installation + immutable repository id + explicit target binding + enabled capability.
- GitHub installation binding requires provider-side user/installation authority verification.
- GitHub setup URL `installation_id` is not authority by itself.
- Desktop client identity is not enough by itself; action target and capability must be checked.
- Desktop client identity does not prove GitHub org/repo authority.
- Agent identity is attribution, not authorization by itself.
- Integration capability must be enabled for the workspace/target.

## Tenant Isolation Invariants

- A repository connection belongs to one workspace in v1.
- Every tenant-owned row has `workspaceId` directly or through required parent.
- Action session cannot list workspace resources unless explicitly allowed.
- Webhook delivery cannot mutate a workspace unless installation/repo mapping is active.
- Suspended/deleted installation blocks GitHub actions.
- Removed repository blocks GitHub actions.

## Token And Session Rules

Desktop client tokens:

- scoped to workspace and client id
- rotatable
- revocable
- never grant direct GitHub access
- should expire or support session rotation

Pairing codes:

- short-lived
- single-use
- stored hashed if practical
- audited on successful pairing

GitHub claim OAuth state:

- short-lived
- single-use
- bound to pending installation claim
- validates exact callback flow before exchanging code
- PKCE verifier is never logged

Hosted setup sessions:

- scoped to workspace and desktop client
- short-lived and cancellable
- resumable by authenticated desktop client after restart
- setup session id is correlation data, not authentication
- deep links and hosted completion pages must not contain OAuth codes, PKCE verifiers, desktop tokens, GitHub tokens, or client secrets

Action idempotency keys:

- required for external actions
- scoped to workspace/action/target
- not reusable across unrelated targets

## Webhook Privacy

Webhook route flow:

```text
verify signature using raw body
compute payload hash
normalize safe fields
store normalized event
enqueue job
discard raw payload
```

Unsupported signed events:

- return accepted/ignored
- do not persist raw payload
- may record aggregate metric only

Raw body handling:

- raw body may exist in memory for signature verification
- raw body must not be logged
- raw body must not be persisted by default
- failed verification should store only safe reason, delivery id if available, and correlation id
- missing webhook secret is a hosted-mode deployment failure

## Logging Rules

Logs may include:

- correlation id
- workspace id
- connector kind
- stable safe error code
- external id type and hashed/truncated id when needed
- provider API version when useful for debugging

Logs must not include:

- tokens
- raw webhook payload
- prompts
- reusable model-output logs
- external action content
- diffs
- source code
- local file content
- secret values

## Audit Rules

Audit every cross-boundary action:

- desktop paired
- desktop revoked
- integration connected/disconnected
- GitHub App installed/suspended/deleted
- repository enabled/disabled
- agent external action requested
- agent external action posted
- agent external action rejected
- billing entitlement denied
- manual dead-letter retry
- support/admin action

Audit metadata must be safe and minimal.
Audit must not include raw external action content. Store content hash/result ids instead.

## Retention Rules

Initial retention expectations:

- audit events: retained long enough for support/security review, with safe metadata only
- normalized webhook deliveries: retained for duplicate detection and debugging, no raw payload
- outbox/dead-letter events: retained for operational recovery, with encrypted external action content only when required for retry
- dispatched external action content: deleted or cryptographically shredded after successful dispatch and result persistence
- desktop sessions/tokens: revocable, expired sessions cleaned up
- unclaimed GitHub installations: expire or require periodic cleanup

Exact retention windows can be configured later, but adding forbidden data requires an ADR first.

## Public API Error Rules

Public errors should use the stable safe contract from
[Public Error Contract](error-contract.md):

```json
{
  "error": {
    "code": "GITHUB_REPOSITORY_NOT_ENABLED",
    "message": "Repository is not enabled for Agent Teams GitHub integration.",
    "category": "authorization",
    "retryable": false,
    "correlationId": "..."
  }
}
```

No stack traces, raw provider messages, tokens, or internal SQL errors in public responses.

## Required Security Tests

- domain/application forbidden import check
- user/client cannot access another workspace
- agent cannot post to unbound GitHub repo
- suspended installation blocks action
- removed repo blocks action
- duplicate webhook does not duplicate side effect
- raw webhook payload is not stored
- logs redact token-like values
- public API errors do not expose internals
- pairing code is single-use and expires
