# Control Plane Architecture Plan

## Status

Phase 1 scaffold exists. Production GitHub integration, persistence, outbox, and external side effects are not implemented yet.

## Executive Summary

Agent Teams Control Plane is an optional hosted integration layer for a local-first desktop application. It should start as a NestJS modular monolith with two deployable processes:

```text
apps/api     - HTTP APIs, webhooks, desktop pairing, health checks
apps/worker  - outbox processing, background jobs, retries, connector side effects
```

Internally, it is organized as feature-first Clean Architecture packages. Each feature owns its domain, application use cases, ports, infrastructure adapters, and interface adapters.

The system should be built as a modular monolith first, but with extractable module boundaries. GitHub is only the first connector. The center of the design is `agent-actions`, `integration-connections`, and `integration-registry`, so Telegram, Slack, Discord, billing, and future Rust runtime services can be added without turning GitHub into the center of the system.

## Why This Exists

The desktop app can run without a backend. The control plane exists for workflows that need a stable public endpoint or protected hosted secrets:

- GitHub App private key custody
- GitHub App installation lifecycle and webhooks
- installation access token creation
- public comments/reviews/checks through a shared official GitHub App
- Telegram or messenger webhook ingress
- future billing and hosted entitlements
- future optional runtime relay and cloud synchronization

## Top-Level Goals

- Keep Agent Teams Desktop local-first.
- Keep GitHub App private key out of Electron and agent runtimes.
- Make integrations self-service for users.
- Make agent identity visible in GitHub and messenger comments.
- Preserve clean boundaries for future connectors.
- Support retries, idempotency, audit, and dead-letter handling from day one.
- Avoid real microservice complexity until there is a hard reason for it.

## Top-Level Non-Goals

- No repository code storage.
- No pull request diff storage.
- No raw prompts or reusable model-output log storage.
- GitHub comment/message bodies may be temporarily stored only as encrypted short-retention ExternalActionContent for explicit dispatch.
- No long-lived GitHub installation tokens in desktop or agent runtimes.
- No direct Prisma, Octokit, Telegram SDK, or Nest imports in domain/application layers.
- No cross-feature infrastructure imports.
- No physical microservices in v1.

## Chosen Architecture

```text
control-plane/
  apps/
    api/
      src/
        main.ts
        app.module.ts
        modules/

    worker/
      src/
        main.ts
        worker.module.ts

  packages/
    features/
      workspace-identity/
      integration-connections/
      github-installation-setup/
      integration-registry/
      agent-actions/
      github-runtime/
      messenger-connectors/
      billing-entitlements/
      audit-log/
      outbox/

    platform/
      config/
      db/
      queue/
      locks/
      logger/
      crypto/
      github-sdk/
      messenger-sdk/

    shared/
      result/
      errors/
      ids/
      validation/
      time/

  docs/
```

## Deployment Model

V1 targets one product mode:

```text
Agent Teams official GitHub App
  -> hosted Agent Teams Control Plane
  -> paired Agent Teams Desktop workspace
```

This is the only mode that gives users a simple "install our GitHub App" flow.

Future modes are allowed, but they are not the same security model:

```text
Hosted official app
  official GitHub App private key is stored only in our hosted control-plane

Self-hosted BYO app
  customer deploys control-plane and creates their own GitHub App/private key

Hybrid self-hosted plus hosted broker
  customer deploys control-plane, but our hosted broker still mints tokens for the official GitHub App
```

Rules:

- the official GitHub App private key is never shipped to Electron, local runtimes, npm packages, Docker images, docs examples, or self-hosted artifacts
- self-hosted V1 must not imply access to the official GitHub App unless a hosted broker protocol exists
- token issuance remains server-side and short-lived
- agents and desktop clients never receive GitHub installation tokens in V1

## Framework Boundary

NestJS is allowed in:

```text
apps/*
packages/features/*/src/interface/*
packages/features/*/src/infrastructure/*
packages/platform/*
```

NestJS is forbidden in:

```text
packages/features/*/src/domain/*
packages/features/*/src/application/*
```

The goal is not to hide NestJS everywhere. The goal is to keep business rules and use cases portable, testable, and independent of framework runtime.

## Standard Feature Layout

```text
packages/features/<feature>/src/
  domain/
    entities/
    value-objects/
    services/
    events/
    errors.ts

  application/
    commands/
    queries/
    use-cases/
    ports/
    policies/

  infrastructure/
    prisma/
    github/
    telegram/
    queue/
    locks/

  interface/
    http/
    nest/
    jobs/

  index.ts
```

Small features may collapse folders, but they must not violate dependency direction.

## Dependency Rule

```text
domain -> shared
application -> domain + shared + application ports
infrastructure -> application ports + platform + external SDKs
interface -> application use cases + Nest
apps -> interface modules + platform composition
```

Forbidden:

```text
domain -> Nest, Prisma, Octokit, Telegram SDK, queue SDK, HTTP frameworks
application -> Nest, Prisma, Octokit, Telegram SDK, queue SDK, HTTP frameworks
feature A -> feature B infrastructure
controller -> Prisma directly
worker job -> Octokit directly without use case/port
```

## State Ownership

The control plane is canonical for hosted integration metadata only.

Canonical in control-plane:

- workspace and desktop client registration for hosted integrations
- GitHub installation id and repository connection metadata
- integration capability state
- external action request status
- outbox, dead-letter, and safe audit records

Canonical outside control-plane:

- local projects and local task state in desktop
- local agent runtime process state
- repository code and diffs in GitHub/local git
- raw prompts, reusable model-output logs, local runtime logs, and terminal output

Derived or snapshot data:

- agent display name snapshot
- team display name snapshot
- repository owner/name snapshot
- public avatar asset id or URL
- safe external provider result metadata

The control plane must not silently become the source of truth for local desktop workflows.

## Bounded Contexts

### workspace-identity

Owns workspaces, trusted desktop clients, desktop credentials, and pairing
sessions.

Core concepts:

- `Workspace`
- `DesktopClient`
- `DesktopClientCredential`
- `DesktopPairingSession`

Responsibilities:

- bootstrap a workspace before hosted accounts exist
- authenticate desktop API requests
- rotate and revoke desktop credentials
- create and consume short-lived pairing sessions
- expose workspace/client identity to application use cases

Does not know about GitHub comments, Telegram chats, or billing provider APIs.

### integration-connections

Owns provider-neutral integration connection records and provider availability
snapshots.

Core concepts:

- `IntegrationConnection`
- `ProviderAccountSnapshot`
- `ProviderRepositoryAvailability`
- `ProviderRepositorySyncCursor`

Responsibilities:

- represent a provider installation bound to a workspace
- keep provider-specific setup details out of generic action flows
- expose safe connection state to desktop UI
- track repository availability without granting target authorization

### github-installation-setup

Owns GitHub-specific setup sessions, pending installation claims, and claim
verification.

Core concepts:

- `GitHubSetupSession`
- `GitHubInstallationClaim`
- `GitHubOAuthClaimSession`
- `GitHubInstallationSnapshot`
- `GitHubRepositorySnapshot`

Responsibilities:

- generate GitHub App install URLs with opaque setup state
- treat setup URL `installation_id` as untrusted until provider verification
- run hosted web claim OAuth with `S256` PKCE
- verify user/installation/repository authority with GitHub user-token endpoints
- bind a verified installation through `integration-connections`

Does not post comments and does not mint installation access tokens for agent
actions.

### integration-registry

Owns capabilities and target bindings for already-connected integrations.
Connection ownership stays in `integration-connections`.

Core concepts:

- `IntegrationCapability`
- `ExternalTarget`
- `TargetBinding`

Responsibilities:

- GitHub repository target mapping
- Telegram chat/channel target mapping
- connector availability read model through `integration-connections` ports
- capability resolution
- integration health summary

This context prevents GitHub-specific logic from spreading into generic agent action flows.

Target binding authority:

- local desktop git remote, branch name, and `owner/name` are hints only
- target authority is provider-verified immutable external ids
- GitHub repository targets use immutable `githubRepositoryId`
- GitHub PR targets use base repository `githubRepositoryId` plus PR number
- local fork remotes are never authority for the PR target repository
- Agent Teams target binding is explicit even when the GitHub App installation has access to all repositories
- every action resolves target binding before content is stored or outbox event is appended

### agent-actions

Owns the generic flow where an agent requests an external action.

Core concepts:

- `AgentActionRequest`
- `AgentIdentity`
- `TeamIdentity`
- `ExternalAction`
- `ExternalTarget`
- `IdempotencyKey`

Responsibilities:

- validate agent action request
- enforce idempotency
- authorize action against workspace, team, target, and integration capability
- route action to connector through application ports
- record audit and outbox events

This is the central workflow for GitHub comments and future messenger posts.

### github-runtime

Owns GitHub-specific runtime behavior after Phase 5 has already verified and
bound a GitHub App installation to a workspace.

Core concepts:

- `GitHubWebhookDelivery`
- `GitHubInstallationToken`
- `GitHubCommentTarget`

Responsibilities:

- installation/repository change sync for already-bound connections
- webhook verification and normalization
- installation token creation
- GitHub comments, PR reviews, checks, statuses
- GitHub permission and repository access checks

Does not own setup-session correlation, claim OAuth, workspace binding, or
generic agent authorization. It answers GitHub-specific runtime questions and
performs GitHub side effects through ports/adapters.

V1 scope:

- issue comments
- top-level pull request comments, implemented through issue comments

Deferred until a separate ADR:

- line-level pull request review comments
- multi-comment review submission
- check runs and statuses

### messenger-connectors

Owns messenger-specific connector behavior.

Initial scope can be documentation-only until Telegram is implemented.

Core concepts:

- `MessengerConnection`
- `MessengerChannelBinding`
- `MessengerInboundEvent`
- `MessengerOutboundMessage`

Responsibilities:

- Telegram bot webhook verification
- chat/channel binding
- outbound messages
- inbound event normalization
- connector health

Must not depend on GitHub concepts.

### billing-entitlements

Owns plans, limits, quotas, and feature availability.

Core concepts:

- `Plan`
- `Entitlement`
- `Quota`
- `UsageWindow`

Responsibilities:

- allow/deny action by plan
- quota checks
- billing provider integration later
- usage accounting

Should expose application ports used by `agent-actions`, not direct billing SDK access.

### audit-log

Owns append-only audit events.

Core concepts:

- `AuditEvent`
- `AuditActor`
- `AuditSubject`

Responsibilities:

- record safe audit events
- expose authorized audit queries
- enforce privacy classification

Audit metadata must not contain code, diffs, prompts, reusable model-output logs, raw external action content, secrets, or raw webhook payloads.

### outbox

Owns durable side-effect scheduling and processing state.

Core concepts:

- `OutboxEvent`
- `OutboxAttempt`
- `DeadLetter`

Responsibilities:

- event append
- claim pending events
- retry with backoff
- dead-letter permanent failures
- recover stale processing events

Outbox may be implemented as a shared platform capability or a feature package. The important rule is that external side effects go through it.

## External Action Content Storage

There is an important privacy/reliability tradeoff:

```text
durable async outbox
  requires the worker to access the comment/message content later

strict zero persistence of model-generated comment text
  prevents durable retry of arbitrary agent-authored comments
```

V1 recommendation:

- classify GitHub comment/message bodies as `ExternalActionContent`
- persist external action content only for explicit user/agent-requested external actions
- encrypt content at rest with a platform crypto adapter
- use envelope encryption with a per-content data encryption key
- keep content storage in Postgres for V1 so content, action, and outbox append can commit atomically
- store content separately from audit/outbox metadata
- keep only content hash, schema version, size, result ids, and safe status after successful dispatch
- delete or cryptographically shred content after successful dispatch
- enforce a bounded retention window for failed/dead-letter actions
- never log, index, search, or include raw content in audit/diagnostics

Outbox event payload rule:

- outbox payload should contain content reference id and content hash, not raw comment body
- worker loads content through an `ExternalActionContentStore` port only when dispatching
- retry must verify content hash before posting
- manual retry UI must make retention and external posting explicit

Key management rule:

- platform crypto owns key generation, encryption, decryption, rewrap, and shredding
- each `ExternalActionContent` row has its own data encryption key
- the data encryption key is encrypted by a hosted key-encryption key from secret manager/KMS or equivalent
- the plaintext data encryption key never leaves the crypto adapter
- cryptographic shredding deletes the encrypted data encryption key or makes its key reference unrecoverable after result metadata is safely persisted
- key ids and crypto metadata are safe to store; plaintext keys and decrypted content are never logged

V1 storage rule:

- store encrypted content in Postgres, not object storage
- content row, action row, and outbox event are written in one transaction
- external object storage can be added later only with an ADR covering atomicity, orphan cleanup, lifecycle policies, and encryption keys

If the team rejects temporary encrypted content persistence, then GitHub comments V1 must drop durable async dispatch or use a more complex desktop-online retry protocol.

## Core Flow: Agent GitHub Comment

```text
1. Desktop or MCP calls control-plane:
   POST /api/agent-actions/v1/actions

2. agent-actions validates:
   - desktop client token
   - workspace
   - team identity
   - agent identity
   - target shape
   - idempotency key

3. agent-actions checks:
   - entitlement
   - integration capability
   - target binding
   - authorization policy

4. agent-actions creates AgentActionRequest and outbox event in one transaction.
   ExternalActionContent is stored encrypted with a bounded retention policy.

5. worker claims outbox event.

6. github-runtime connector:
   - resolves installation and repo by immutable GitHub IDs
   - mints short-lived installation token
   - loads encrypted ExternalActionContent by content reference
   - renders agent attribution card
   - posts or updates comment
   - stores safe result metadata
   - deletes or cryptographically shreds content after successful dispatch

7. audit-log records append-only event.
```

## GitHub Installation Setup Flow

Happy path:

```text
1. Desktop starts GitHub integration setup through control-plane.
2. control-plane creates short-lived opaque setup state for workspace/client.
3. user installs the official GitHub App through GitHub.
4. GitHub redirects to setup callback with installation id and state.
5. github-installation-setup validates state and records pending installation claim.
6. user completes hosted GitHub web OAuth claim with `S256` PKCE.
7. github-installation-setup verifies user/installation/repository authority with GitHub.
8. integration-connections binds the verified installation to the workspace.
9. integration-registry later creates target bindings only for explicitly enabled repositories.
10. desktop sees connected state on next refresh.
```

No-state path:

```text
1. user installs GitHub App directly from GitHub.
2. setup callback has no trusted workspace state.
3. control-plane stores short-retention untrusted callback evidence.
4. no repository actions are allowed.
5. user must claim/bind installation from a paired desktop or future dashboard.
```

Required invariants:

- setup state is short-lived and single-use
- installation binding is idempotent
- a repository cannot silently move between workspaces
- untrusted unclaimed callback evidence cannot post comments
- pending claims cannot post comments
- deleted or suspended installations block actions

## GitHub Installation Claim Authority

GitHub setup URL input is not authority.

Rules:

- `state` in the install URL is correlation only
- `installation_id` in the setup URL is untrusted user-controlled input until verified
- paired desktop identity proves the Agent Teams workspace/client, not GitHub org or repository authority
- binding an installation to a workspace requires GitHub-side authority verification

Recommended V1 claim flow:

```text
1. desktop starts GitHub setup and receives install URL with opaque setup state.
2. user installs the app.
3. GitHub redirects to setup URL with state and installation_id.
4. control-plane verifies state and records a pending claim.
5. user completes hosted GitHub web OAuth claim with `S256` PKCE.
6. control-plane checks that the GitHub user can access the installation/repositories.
7. only then integration-connections binds the installation to the workspace.
```

Allowed claim authorities:

- GitHub user access token proving the user and app can access the installation/repository
- future dashboard session with a linked GitHub user identity that passes the same provider check
- future enterprise admin claim flow with explicit audit and policy

Forbidden:

- binding from `installation_id` alone
- binding from setup state alone
- binding because the desktop client is paired
- binding by repository `owner/name` without immutable GitHub repository id verification

User access token rule:

- use only for the claim/verification operation in V1
- do not expose to desktop, agents, or runtime subprocesses
- do not persist unless a future ADR adds retention, refresh, revocation, and privacy rules

## Desktop Setup Session State Machine

The desktop app should not run a local HTTP callback server for GitHub setup in V1.

Recommended protocol:

```text
1. desktop calls authenticated Desktop API to start setup.
2. control-plane creates SetupSession and returns installUrl, setupSessionId, expiresAt.
3. desktop opens installUrl in the user's browser.
4. GitHub redirects to hosted setup URL.
5. hosted setup URL updates SetupSession to pending_claim or records untrusted
   unclaimed callback evidence.
6. hosted claim OAuth updates SetupSession to connected, failed, or expired.
7. desktop polls authenticated Desktop API for setupSessionId status.
```

Setup session states:

```text
not_started
install_url_created
installation_callback_received
pending_claim
connected
failed
expired
cancelled
```

Rules:

- `setupSessionId` is an opaque correlation id, not a secret by itself
- desktop polling requires desktop client authentication
- setup state, OAuth state, and PKCE verifier are server-side and single-use
- hosted completion page may show "return to desktop", but must not put secrets in deep links
- optional deep link may contain only non-secret correlation data
- desktop restart can resume by listing active setup sessions for its workspace/client
- expired or cancelled setup sessions cannot bind installations later

Repository access rule:

- GitHub installation access is not the same as Agent Teams target enablement
- after claim verification, control-plane may sync accessible repositories
- `integration-registry` must still require explicit target binding before agent actions are allowed
- installing the app on all repositories must not automatically enable agent comments on all repositories

## GitHub App Registration For V1

V1 should use:

- public GitHub App
- setup URL enabled
- webhook active with webhook secret
- callback URL for a separate claim OAuth flow
- device flow deferred behind a future ADR, not the default path

V1 should not enable:

- `Request user authorization (OAuth) during installation`

Reason:

- GitHub's settings make OAuth-during-install and setup URL mutually exclusive
- V1 needs setup URL because the install flow starts from desktop with opaque
  setup state
- claim authorization should be a separate controlled web flow where the control
  plane sets `redirect_uri`, `state`, and `S256` PKCE

Claim OAuth rules:

- OAuth `state` is short-lived and single-use
- web OAuth flow uses `S256` PKCE
- GitHub App `client_secret` is hosted control-plane secret only
- callback `redirect_uri` must exactly match the configured GitHub App callback URL
- after GitHub redirects back, control-plane exchanges the code server-side
- user access token and refresh token are used only to verify accessible
  installations/repositories, then discarded in V1

Device-flow fallback:

- may be added later for headless or browser-hostile environments
- requires enabling GitHub App device flow
- must respect GitHub polling `interval` and `slow_down` responses
- device codes and user codes are ephemeral and must not be logged

## GitHub API Contract Facts

These facts must be re-checked against official GitHub docs during the implementation phase, before adding GitHub dependencies or permissions:

- installation access tokens expire after one hour
- installation tokens may use a new token format and must not be parsed by length or token shape
- installation tokens can be scoped to specific `repository_ids`
- installation token permissions can be narrowed, but not expanded beyond the app permissions
- issue comments can be used for both issues and top-level pull request comments
- creating/updating issue comments requires either `Issues: write` or `Pull requests: write`
- pull request review comments require `Pull requests: write`
- webhook verification must use the raw request body and `X-Hub-Signature-256`
- creating comments can trigger notifications and secondary rate limiting
- GitHub App install URLs can include `state` to correlate installation flow
- GitHub setup URL includes `installation_id`, but GitHub warns it can be spoofed and must not be trusted alone
- enabling GitHub App OAuth during installation redirects users to callback URL instead of setup URL
- web OAuth claim flow supports `state`, exact `redirect_uri`, and `S256` PKCE
- device flow is available only if enabled in the GitHub App settings and has strict polling rules

V1 token rule:

- mint installation tokens only inside server-side GitHub infrastructure adapters
- request `repository_ids` for the exact target repository
- request only the permissions required for the action
- do not persist installation tokens in the database
- if GitHub returns `401` for an expired token, mint a new token and retry through the normal idempotent worker path

V1 permission rule:

- issue comments and top-level PR comments should start with the narrowest app permissions that official GitHub docs allow
- line-level review comments are deferred partly because they require a different permission and target model
- any new GitHub capability adds an explicit permission mapping in `integration-registry`

## Connector Contract

The generic dispatch layer should depend on small connector ports.

```ts
export interface IntegrationCapabilityResolver {
  resolve(input: ResolveCapabilityInput): Promise<CapabilityResolution>;
}

export interface ExternalActionDispatcher {
  dispatch(input: ExternalActionDispatchInput): Promise<ExternalActionDispatchResult>;
}
```

Connector-specific ports stay small:

```ts
export interface GitHubInstallationTokenIssuer {
  issueRepositoryToken(
    input: IssueRepositoryTokenInput,
  ): Promise<IssuedInstallationToken>;
}

export interface GitHubCommentGateway {
  upsertIssueComment(input: UpsertIssueCommentInput): Promise<PostedGitHubComment>;
  upsertPullRequestComment(
    input: UpsertPullRequestCommentInput,
  ): Promise<PostedGitHubComment>;
}
```

Avoid one large `GitHubService` or `IntegrationService` with many unrelated methods.

Connector contracts must stay capability-oriented. GitHub comments, check runs, messenger messages, and billing usage accounting should not share one large port just because they are "integrations".

## Target Resolution Contract

Desktop can submit a target candidate, but the control-plane resolves and authorizes the canonical target.

Allowed desktop hints:

- provider kind
- repository remote URL or `owner/name` display name
- issue or pull request number
- local branch/current project metadata
- optional known GitHub repository id when desktop has one from a prior verified lookup

Forbidden authority:

- local git remote alone
- branch name alone
- repository `owner/name` string alone
- issue/PR number without verified repository id
- agent-provided target text

Canonical binding record:

```text
IntegrationTargetBinding
  workspaceId
  integrationConnectionId
  providerInstallationId
  githubInstallationId when provider is GitHub
  githubRepositoryId
  targetKind
  capability
  enabledState
  displayOwnerNameSnapshot
  displayRepositoryNameSnapshot
  lastProviderSyncAt
```

Binding rules:

- `githubRepositoryId` is the authorization key; `owner/name` is a display snapshot
- capability is explicit per target, not inferred from GitHub installation repository access
- installation access and workspace target enablement are checked separately
- disabled, suspended, removed, or stale bindings fail closed with stable safe error codes
- target resolution happens before encrypted ExternalActionContent is stored

GitHub repository resolution:

```text
1. normalize desktop hint as display candidate
2. resolve candidate through GitHub connector
3. require immutable githubRepositoryId
4. require active GitHubInstallation for that repository id
5. require IntegrationTargetBinding for workspace + repository id + capability
6. only then create AgentActionRequest
```

GitHub pull request top-level comment resolution:

```text
1. resolve base repository by immutable githubRepositoryId
2. fetch or validate pull request by base repository owner/name + PR number
3. verify returned base repository id equals target githubRepositoryId
4. create issue comment only after PR existence and base repository match are confirmed
5. store safe PR number/result metadata, not diff/body content
```

GitHub issue comment resolution:

```text
1. resolve repository by immutable githubRepositoryId
2. fetch or validate issue by repository owner/name + issue number
3. for github_issue_comment, decide by policy whether PR-backed issues are allowed
4. for github_issue_comment when PR-backed issues are not allowed, reject if the issue has pull_request metadata
5. store safe issue number/result metadata, not issue body content
```

Fork PR rule:

- for pull requests from forks, the target repository is the PR base repository
- local `origin` may point to the fork and must not decide where the app comments
- if desktop sends a PR URL or local remote for the head repository, control-plane still resolves the base repository through GitHub before posting
- if base repository id does not match an enabled `IntegrationTargetBinding`, action is rejected

Rationale:

- GitHub treats pull requests as issues for issue comments, but not every issue is a pull request
- forks can make local remotes point at a different repository than the PR base repository
- repository rename/transfer makes `owner/name` unsafe as authority
- a GitHub App installation can have provider access without Agent Teams target enablement

Safe failure codes should distinguish at least:

- `GITHUB_TARGET_NOT_BOUND`
- `GITHUB_REPOSITORY_NOT_IN_INSTALLATION`
- `GITHUB_REPOSITORY_RENAMED_OR_TRANSFERRED`
- `GITHUB_PULL_REQUEST_NOT_FOUND`
- `GITHUB_PULL_REQUEST_BASE_REPOSITORY_MISMATCH`
- `GITHUB_ISSUE_NOT_FOUND`
- `GITHUB_TARGET_KIND_MISMATCH`

## Agent Identity And Attribution

GitHub will show the GitHub App bot as the comment author. The virtual agent identity must be visible inside the comment body.

Required attribution:

- agent display name
- team display name
- role if available
- avatar URL
- optional task/run metadata
- hidden idempotency/update marker

Authority rule:

- agent identity is not free-form text from the agent
- v1 accepts an agent identity snapshot from a paired desktop/runtime client
- control-plane stores the snapshot used for the action
- authorization is based on workspace, desktop client, target binding, integration capability, and entitlement, not on the agent name alone

Rendering rule:

- attribution header is rendered by control-plane, not by the agent
- display fields are escaped/sanitized
- agent-authored body cannot override hidden marker or identity metadata
- agent-authored body is treated as external action content with temporary encrypted persistence only
- comment body includes a schema version for future rendering changes

Public avatar issue:

- GitHub comments need public image URLs.
- Local desktop avatars are not enough.
- V1 should use deterministic hosted avatars or control-plane-hosted avatar assets.
- Do not proxy arbitrary local files from desktop.

Custom avatar uploads can be added later only with explicit file type, size, malware scanning, retention, and public asset rules.

## Idempotency Strategy

Every external action must include an idempotency key.

For agent action requests:

```text
workspaceId + integrationKind + externalTarget + stableAgentIdentityKey + idempotencyKey
```

`stableAgentIdentityKey` should be a local runtime/team member id when available. Display name is a snapshot for attribution and must not be the idempotency authority.

For GitHub comment updates:

```text
hidden marker contains:
- schema version
- opaque public action marker id
- connector kind
- target kind
- GitHub repository id when needed for recovery
- issue or PR number
- marker digest/signature for integrity checking
```

If the API request retries after a timeout, control-plane returns the existing action result when possible.

If GitHub succeeded but DB update failed, worker recovery should search for the hidden marker before posting again.

Hidden marker rules:

- marker is not a secret
- marker must not contain tokens, prompts, reusable model-output logs, raw external action content, code, diffs, internal workspace names, or display names
- internal ids should be opaque or hashed when possible
- visible attribution contains human-readable agent/team names; hidden marker is only for idempotency and recovery

## Webhook Strategy

Webhook processing must be:

- verified
- normalized
- idempotent
- async
- privacy-preserving
- based on the raw request body for signature verification

Flow:

```text
1. verify signature
2. ignore unsupported signed events with 202
3. compute payload hash
4. normalize safe fields
5. store delivery id and normalized event
6. enqueue outbox/job
7. discard raw payload
```

Do not store raw GitHub or Telegram payloads by default.

Raw body exception:

- raw request body may exist only in memory long enough to verify signature
- if a provider requires retry/debug storage later, that needs a separate ADR, retention policy, redaction rules, and tests

NestJS adapter requirement:

- the GitHub webhook route must preserve raw body access before any JSON parser mutates it
- failed signature verification returns a safe unauthorized response and does not enqueue work
- missing webhook secret is a deployment/configuration failure, not a runtime warning

## Data Model Draft

Initial tables should be designed around immutable IDs and tenant isolation.

```text
Workspace
DesktopClient
DesktopClientCredential
DesktopPairingSession

IntegrationConnection
ProviderRepositoryAvailability
IntegrationTargetBinding
IntegrationCapabilityState

GitHubSetupSession
GitHubInstallationClaim
GitHubOAuthClaimSession
GitHubWebhookDelivery
GitHubNormalizedEvent

AgentActionRequest
AgentActionAttempt
AgentActionResult

OutboxEvent
DeadLetterEvent
AuditEvent
ExternalActionContent
ExternalActionContentKeyRef

Entitlement
UsageCounter
```

Key invariants:

- every tenant-owned row has `workspaceId` directly or through a required parent
- repository authority uses immutable `githubRepositoryId`
- installation authority uses immutable `githubInstallationId`
- names such as `owner/repo` are display snapshots, not authority
- one GitHub repository belongs to one workspace in v1 unless an explicit transfer flow exists

## API Categories

### Desktop API

Versioned public API used by Agent Teams Desktop.

```text
/api/desktop/v1/pairing/start
/api/desktop/v1/pairing/complete
/api/desktop/v1/integrations
/api/desktop/v1/agent-actions
```

Must be backward compatible across desktop releases.

### Agent Actions API

Versioned API for external action requests.

```text
/api/agent-actions/v1/actions
/api/agent-actions/v1/actions/:id
```

May be called by desktop, local MCP gateway, or future runtime bridge.

### GitHub Webhook API

GitHub-controlled route.

```text
/api/webhooks/github
```

Deferred for the current V1 release. Do not configure this URL in GitHub App
settings until a signed webhook ingress controller is shipped. Signature
verification is required before any future side effects.

### Messenger Webhook API

Connector-specific webhook routes.

```text
/api/webhooks/telegram
/api/webhooks/slack
```

Each connector must normalize payloads and avoid raw body persistence.

## Security Principles

- GitHub App private key only lives in hosted control-plane secrets.
- Installation tokens are minted server-side and short-lived.
- Agents never receive GitHub tokens.
- Desktop tokens are scoped, revocable, and rotatable.
- Raw code, diffs, prompts, reusable model-output logs, and raw external action content outside the encrypted dispatch store are forbidden by default.
- Logs must use safe error codes and redacted metadata.
- Audit is append-only and safe.
- Authorization is application-layer policy, not UI filtering.

## Microservice Readiness

Do not start with physically separate microservices.

Design for future extraction:

- each feature owns its domain/application
- ports define external dependencies
- outbox events define async integration contracts
- no direct cross-feature infrastructure imports
- no shared in-memory state for correctness
- version persisted events

Potential future extractions:

```text
github-runtime -> github connector service
messenger-connectors -> messenger connector service
billing-entitlements -> billing service
runtime-bridge -> runtime relay service
```

Extraction is justified only when there is a real reason:

- independent scaling
- independent deployment cadence
- different language/runtime
- separate security boundary
- separate team ownership
- strict availability isolation

Extraction is not justified only because a new connector exists. Add the connector as a feature package first, then extract after operational pressure appears.

## NestJS Risks And Mitigations

| Risk                                             | Mitigation                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `@Injectable()` leaks into application use cases | application/domain cannot import `@nestjs/*`                              |
| God services such as `GitHubService`             | small ports + explicit use cases                                          |
| circular module graph and `forwardRef()`         | feature communication through ports/events/public APIs                    |
| DTO becomes domain model                         | DTO -> command -> domain mapping                                          |
| tests become Nest-heavy                          | use case tests without Nest TestingModule                                 |
| hidden magic in guards/interceptors              | guards only for transport concerns, no business decisions                 |
| request-scoped providers spread into use cases   | request context is mapped to explicit command objects                     |
| global pipes/interceptors hide policy            | validation/auth stay visible at interface boundary                        |
| DI token sprawl makes dependencies unclear       | feature composition exports named provider factories                      |
| false microservice confidence                    | outbox/idempotency/versioned events first, Nest transport later if needed |

## Operational Baseline

The first production-capable version needs:

- public HTTPS endpoint for GitHub webhooks
- Postgres-backed metadata, idempotency, locks, and outbox
- repeatable migrations
- `health` and `readiness` endpoints
- structured logs with correlation ids
- metrics for webhook delivery, outbox lag, retries, dead letters, rate limits, and connector failures
- worker concurrency limit and graceful shutdown
- backup/restore expectation for metadata
- feature flags and kill switches for outbound side effects
- pinned GitHub REST API version in configuration
- startup validation for GitHub App id, private key, webhook secret, callback URL, and app slug

Do not add Redis, Kafka, or a separate queue service until DB-backed outbox and locks are proven insufficient.

## Kill Switches

Required before public GitHub comments rollout:

- disable all outbound GitHub actions globally
- disable outbound actions per workspace
- disable a connector kind
- pause worker side effects while keeping webhook ingestion
- mark a GitHub installation unavailable
- revoke a desktop client
- stop processing a poisoned outbox event type

Kill switches fail closed for external side effects and must not block local-only desktop workflows.

## Architecture Enforcement

V1 scaffold should include:

- `architecture:check` script
- forbidden import scan for domain/application
- forbidden dependency scan for SDKs that belong to later phases
- no `@nestjs/*`, Prisma, Octokit, queue SDK, or messenger SDK in domain/application
- no cross-feature infrastructure imports
- no `forwardRef()` without explicit ADR
- use case tests without Nest
- controller tests only for HTTP mapping/auth/status codes

## Definition Of Done For The Foundation

- `control-plane/README.md` clearly says the control plane is optional.
- NestJS API and worker apps boot.
- Domain/application code is framework-free.
- First feature packages compile.
- Architecture boundary check exists and fails on forbidden imports.
- Architecture boundary check exists and fails on forbidden pre-phase dependencies.
- Outbox, idempotency, audit, and dead-letter concepts are present before GitHub side effects.
- GitHub App private key is only read by server-side infrastructure.
- Desktop pairing uses short-lived pairing code and revocable client token.
- Documentation explains privacy boundaries and data classification.
