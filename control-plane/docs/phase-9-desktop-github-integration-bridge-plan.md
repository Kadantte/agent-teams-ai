# Phase 9 - Desktop GitHub Integration Bridge Plan

## Purpose

Phase 9 connects the implemented control-plane GitHub backend to the desktop app
and local agent runtime without weakening the security model.

The backend can already own workspace identity, installation binding, target
policy, token brokering, and outbox-backed GitHub actions. The missing critical
piece is a trusted desktop/runtime bridge:

```text
desktop workspace
  -> authenticated control-plane client
  -> trusted agent action envelope
  -> control-plane policy and outbox
  -> GitHub App side effect
```

Desktop must remain local-first. If the control-plane is absent or disabled,
normal local teams must keep working.

## Summary

Implement the minimal product path that lets a user:

- see whether hosted GitHub integration is available
- pair this desktop workspace with the hosted control-plane
- start or resume GitHub App setup
- see connected GitHub installations and enabled repositories
- let trusted local agents request GitHub actions through structured envelopes
- inspect action status and safe failure messages

Do not expose GitHub installation tokens to Electron, local agent subprocesses,
MCP tools, logs, or local config files.

## Architecture Decision

Recommended direction:

```text
Desktop-owned integration bridge
+ runtime action envelope port
+ control-plane HTTP adapter
+ no direct GitHub credentials locally
```

Options:

- Desktop bridge through control-plane API
  `🎯 10   🛡️ 10   🧠 7`
  Approx changes: `1600-2800` lines.
  Recommended. Keeps authorization, tokens, retries, and audit centralized.

- Local backend proxy inside desktop
  `🎯 5   🛡️ 5   🧠 7`
  Approx changes: `1200-2200` lines.
  Avoid for V1. It creates another trust boundary and makes users think local
  server deployment is required.

- Agents call GitHub or control-plane directly
  `🎯 2   🛡️ 2   🧠 4`
  Approx changes: `700-1400` lines.
  Reject. Agent processes are not the authority boundary and must not hold
  control-plane client tokens or GitHub tokens.

## Critical Scope

Phase 9 should implement only the pieces required for usable GitHub App flow:

- desktop feature slice for hosted integrations
- control-plane API client adapter in desktop main process
- desktop token storage through existing secure app storage primitives
- pairing/setup state machine in renderer
- runtime action bridge from trusted team/member context to control-plane API
- agent action envelope creation in desktop, not in agent-authored markdown
- action status polling or subscription-shaped polling
- safe user-facing unavailable/version-mismatch states
- contract tests around envelope construction and token redaction

Phase 9 should not implement:

- new GitHub backend features
- self-hosted official-app mode
- BYO GitHub App setup UI
- messenger connectors
- billing, seats, quotas, or entitlements
- broad observability dashboards
- line-level PR review UX unless already supported by backend and explicitly
  enabled

## Plan-Improve Findings

Scope preserved:

- Phase 9 remains a desktop/runtime bridge phase.
- Backend GitHub domain behavior remains in Phases 5-8.
- The bridge must reuse existing `api/desktop/v1` contracts where they already
  exist.

Weak spots studied in current code:

- Current backend controllers already expose concrete desktop routes. The plan
  must not invent parallel `/v1/...` routes unless a compatibility layer is
  intentionally added.
- `POST api/desktop/v1/github-actions` authenticates the desktop with bearer
  token and derives `workspaceId` plus `desktopClientId` from that actor. The
  desktop must not send these as trusted request body fields.
- `pairing/start` requires an authenticated desktop actor, while
  `pairing/complete` is public and returns a new desktop token. Fresh local
  bootstrap and pairing-to-existing-workspace are different flows.
- No server-side setup cancel route is currently present. If Phase 9 keeps
  "cancel setup", it must either be a local "stop polling/dismiss" action or
  add a small backend cancel use case before the UI presents cancellation as
  authoritative.
- Existing desktop feature slices use contracts, preload bridge, main IPC
  registration, and renderer adapters. Phase 9 should follow that structure
  instead of calling backend HTTP directly from renderer.
- Current token rotation accepts a `rotationRequestId` and can return the same
  rotated token for an already completed rotation. Desktop should use that to
  recover from local secure-store write failures instead of creating ambiguous
  multiple rotations.
- Team runtime already has stable member metadata such as `agentId`,
  `member.name`, role, team name, and provider runtime args. The GitHub bridge
  should use this runtime/config metadata, not parsed transcript text.
- Existing `shell:openExternal` permits `http`, `https`, and `mailto` globally.
  GitHub setup must not use that generic opener blindly for server-provided
  setup URLs because a compromised/buggy backend response could exfiltrate user
  flow to an unexpected origin.
- Backend action payload validation caps comment/check body fields at current
  server limits. Desktop should preflight those limits for UX, but backend
  remains authoritative and desktop must not silently truncate content.

## Clean Architecture Shape

Desktop side should follow the repository feature standard.

Recommended feature package:

```text
src/features/hosted-integrations/
  contracts/
  core/
    domain/
    application/
    ports/
  main/
    adapters/
    composition/
  renderer/
    adapters/
    hooks/
    ui/
```

The feature owns the desktop-facing integration workflow. It does not own
GitHub provider logic. GitHub remains behind control-plane API contracts.

### Domain

Domain entities and value objects:

- `HostedIntegrationConnection`
- `HostedIntegrationSetupSession`
- `DesktopControlPlaneSession`
- `AgentGithubActionDraft`
- `AgentActionSubmission`
- `HostedIntegrationAvailability`
- `ControlPlaneApiVersion`

Domain policies:

- desktop can be unpaired, paired, revoked, expired, or version-mismatched
- setup can be idle, opening, pending installation, pending claim, connected,
  failed, expired, or cancelled
- GitHub action submission requires a connected workspace and enabled target
  snapshot from control-plane
- action body and agent attribution are separate values
- agent attribution is derived from trusted team/member metadata

### Application

Use cases:

- `LoadHostedIntegrationState`
- `BootstrapLocalControlPlaneWorkspaceIfNeeded`
- `StartControlPlanePairing`
- `CompleteControlPlanePairing`
- `StartGitHubSetup`
- `ResumeGitHubSetupSession`
- `CancelGitHubSetupSession`
- `RefreshGitHubConnections`
- `ListGithubRepositoryTargets`
- `SubmitAgentGithubAction`
- `GetAgentGithubActionStatus`
- `RevokeControlPlaneDesktopSession`

Application rules:

- use cases depend on ports, not Electron, HTTP, IPC, or React
- no GitHub token type exists in desktop domain/application code
- no control-plane token is passed into renderer unless existing project
  security rules explicitly allow that class of token
- raw action body can be sent to control-plane only as explicit user/agent
  command payload, never persisted locally as reusable logs
- bootstrap creates a new hosted workspace, while pairing attaches this desktop
  to an existing hosted workspace
- renderer may request an action submission, but main/runtime bridge is the only
  place allowed to attach trusted team/member metadata
- local feature state separates canonical server state, cached display state,
  and secret local session state

### Ports

Outbound ports:

- `ControlPlaneConnectionPort`
- `ControlPlanePairingPort`
- `ControlPlaneGithubSetupPort`
- `ControlPlaneGithubTargetsPort`
- `ControlPlaneAgentActionPort`
- `DesktopSecureTokenStorePort`
- `DesktopBrowserOpenPort`
- `RuntimeAgentActionBridgePort`
- `HostedIntegrationClockPort`

Inbound ports:

- IPC handlers for renderer setup/status commands
- runtime bridge entrypoint used by team orchestration layer

Adapters:

- main-process HTTP adapter using the existing safe request utilities
- secure token storage adapter
- browser opener adapter for hosted setup URL
- renderer query/hooks adapter
- runtime bridge adapter near the team launch/runtime boundary

## Control-Plane Contract Requirements

Desktop should call explicit hosted integration APIs. It should not depend on
database internals or GitHub provider details.

Existing backend route capabilities to reuse:

```text
POST api/desktop/v1/workspaces/bootstrap
GET  api/desktop/v1/me
POST api/desktop/v1/pairing/start
POST api/desktop/v1/pairing/complete
POST api/desktop/v1/clients/:desktopClientId/rotate-token
POST api/desktop/v1/clients/:desktopClientId/revoke
POST api/desktop/v1/integrations/github/setup/start
GET  api/desktop/v1/integrations/github/setup/:setupSessionId
GET  api/desktop/v1/integrations/github/connections
GET  api/desktop/v1/integrations/:connectionId/repository-targets/available
POST api/desktop/v1/integrations/:connectionId/repository-targets
GET  api/desktop/v1/repository-targets
GET  api/desktop/v1/repository-targets/:targetId
POST api/desktop/v1/repository-targets/:targetId/disable
POST api/desktop/v1/repository-targets/:targetId/enable
PUT  api/desktop/v1/repository-targets/:targetId/policy
POST api/desktop/v1/repository-targets/:targetId/policy/evaluate
POST api/desktop/v1/github-actions
GET  api/desktop/v1/github-actions/:actionRequestId
```

If existing backend route names differ, desktop must adapt to the implemented
public contracts rather than invent parallel endpoints.

Known backend gap:

- no authoritative setup cancellation endpoint was found in the current
  controller surface. Do not model UI "cancel" as server cancellation until
  `CancelGitHubSetupSession` exists. Use "dismiss" or "stop polling" wording if
  backend session expiry remains the source of truth.

Contract invariants:

- every request includes safe request/correlation ids
- desktop session token is sent only over HTTPS outside local development
- server returns stable `SafeError` codes
- version mismatch returns a stable error code with minimum supported desktop
  contract version
- setup status is resumable after desktop restart
- action status never returns raw GitHub token, raw private key material, or
  raw encrypted action content
- bearer token defines the workspace/client actor
- request body ids are authorization inputs only where backend already validates
  them against the authenticated actor
- desktop must reject configured control-plane base URLs with credentials,
  fragments, non-HTTPS non-localhost schemes, or unexpected path prefixes
- HTTP adapter must not forward Authorization across cross-origin redirects
- setup/open-browser URL must be allowlisted against the configured
  control-plane public base URL and expected GitHub hosts before opening

## Trusted Agent Action Envelope

The desktop/runtime bridge owns the local envelope, but the HTTP request body
must match the current backend action contract:

```text
Authorization: Bearer <desktopToken>

{
  requestId,
  targetId,
  actionType,
  requestedBy: {
    subjectKind,
    subjectId,
    teamId?,
    agentId?
  },
  attribution: {
    agentDisplayName,
    agentAvatarUrl?,
    teamDisplayName?
  },
  payload,
  correlationId?
}
```

Security rules:

- `workspaceId` and `desktopClientId` stay in paired desktop session state and
  bearer-token authentication, not in the action request body
- agent/team identity comes from trusted runtime metadata
- agents may propose content, but not overwrite trusted attribution fields
- idempotency key is generated by desktop/runtime bridge per logical action
- content hash is computed before submission and verified by backend where
  useful
- local filesystem paths are forbidden in avatar URLs
- avatar URLs must be HTTPS or omitted
- `subjectKind` must match the existing target policy model
- `subjectId` must use the same normalized form used when target policy rules
  were created
- `requestId` must be stable for retry of one logical action and unique for
  distinct actions
- desktop may preflight server-known body limits, but it never mutates or
  truncates action content before submission without explicit user/agent action
- backend renders final attribution and hidden markers; desktop must not let
  agent-authored markdown provide those system blocks

Illustrative local bridge shape:

```ts
type SubmitGitHubActionCommand = Readonly<{
  targetId: string;
  actionType: string;
  payload: unknown;
  localAttemptId: string;
  runtimeMember: {
    agentId: string;
    agentName: string;
    teamId: string;
    teamName: string;
    avatarUrl?: string;
  };
}>;
```

The exact code can differ, but the boundary rule cannot: renderer and agent text
must not be the source of trusted attribution.

## Local Data Ownership

Canonical server-side state:

- workspace id
- desktop client id
- desktop credential status
- GitHub setup session state
- integration connection state
- repository target state and policy
- action request status

Local secret state:

- desktop bearer token only
- stored in a main-process-only secure store
- never returned by preload
- never stored in renderer state, Zustand, localStorage, logs, or crash reports

Local non-secret cache:

- last known connection summary
- last known target list
- last known action statuses
- active setup session id
- contract version and availability summary

Cache rules:

- cache is display-only
- cache must include `fetchedAt`
- mutating calls refresh from backend or tolerate stale-state failure
- missing cache never blocks normal local desktop/team workflows

## Desktop Token Storage Decision

Recommended option:

- Main-process OS-backed secure store with non-secret metadata sidecar
  `🎯 9   🛡️ 8   🧠 5`
  Approx changes: `250-500` lines.
  Recommended. Keeps token out of renderer and ordinary config files. Must fail
  closed if the platform secure store is unavailable or locked.

Alternatives:

- Main-process encrypted file using an app-managed local key
  `🎯 6   🛡️ 6   🧠 6`
  Approx changes: `300-700` lines.
  Accept only if OS secure storage is unavailable and the limitation is shown in
  UI. Machine migration and backup behavior are weaker.

- Plain JSON config or renderer storage
  `🎯 1   🛡️ 1   🧠 2`
  Approx changes: `80-200` lines.
  Reject. It leaks the desktop control-plane credential to local files or
  renderer compromise.

Token lifecycle:

- bootstrap/pairing returns token once; main stores it before reporting
  connected to renderer
- token rotation uses a stable `rotationRequestId` until local secure-store
  write succeeds
- if secure-store write fails after backend rotation, retry the same
  `rotationRequestId` to recover the rotated token
- revoke clears local token after backend revoke succeeds, or marks it
  locally-revoked if backend is unreachable
- auth failure clears only the hosted integration session, not local teams or
  provider credentials

## URL And Redirect Guardrails

Control-plane base URL:

- configured only through main-process owned settings
- normalized once before storing
- must be `https://` outside explicit localhost/dev mode
- must not contain username/password credentials
- must not contain a fragment
- must not point at link-local metadata hosts, private network ranges, or local
  file protocols unless local development mode explicitly allows localhost
- must be shown to the user before first token-bearing request when manually
  configured

HTTP adapter:

- sends desktop bearer token only to the normalized control-plane origin
- rejects cross-origin redirects before following them with Authorization
- applies request timeout and bounded response body size
- maps network, timeout, TLS, and DNS failures into stable hosted integration
  unavailable states
- logs URL origin and route template only, never full query strings containing
  setup or OAuth values

Browser opener:

- opens setup URLs only after validating scheme and origin allowlist
- rejects `javascript:`, `file:`, custom schemes, and `mailto:`
- does not scrape browser callback pages for claim tokens
- relies on backend status polling for setup progress

## Implementation Ordering

Recommended order:

1. add contracts and DTO normalizers for hosted integration state
2. add main-process HTTP adapter with safe error mapping and token redaction
3. add secure desktop token store adapter
4. add preload bridge and IPC handlers for setup/status only
5. add renderer state machine using mocked main adapter
6. wire real backend setup/status/target endpoints
7. add runtime action bridge from trusted team/member metadata
8. add action status polling and idempotent retry behavior
9. enable behind a desktop feature flag

Ordering guards:

- do not expose action submission UI until connection and target state can be
  refreshed from backend
- do not pass desktop token into renderer while IPC main boundary is the chosen
  model
- do not start runtime action bridge until the API adapter has redaction tests
- do not store action request payloads in local durable queues
- do not treat local cached target state as authorization
- do not mark pairing/bootstrap complete in renderer until token store write has
  completed
- do not rotate token during a running setup/action mutation unless the adapter
  can serialize those calls
- serialize setup start/resume/cancel-like local dismiss actions per workspace
- validate and store control-plane base URL before bootstrap/pairing
- add redirect/base-url tests before any token-bearing HTTP calls
- add setup URL allowlist tests before wiring `openExternal`

## UI Requirements

Keep UI operational and compact. This is not a marketing screen.

Required screens/states:

- hosted integration unavailable
- connect GitHub
- pairing pending/failed
- setup pending installation
- setup pending claim
- setup connected
- setup expired/cancelled
- repository targets list
- enabled/disabled repository target state
- action submitted, processing, succeeded, failed, dead-lettered
- version mismatch requiring app update

Required actions:

- connect
- resume setup
- dismiss local setup state, or cancel setup only after a backend cancel endpoint
  exists
- refresh status
- revoke desktop connection
- open GitHub setup page

Do not show:

- GitHub tokens
- private keys
- webhook secrets
- raw OAuth codes
- PKCE verifier
- internal installation token response
- full setup callback query string
- desktop bearer token prefix or lookup prefix

## Runtime Integration

The runtime bridge should be explicit and narrow.

Recommended behavior:

- team runtime asks desktop main process to submit a GitHub action
- desktop validates that hosted integration is connected
- desktop builds the trusted envelope from runtime/team metadata
- desktop sends envelope to control-plane
- desktop returns action id/status to runtime
- runtime displays safe status, not provider credentials

Failure behavior:

- control-plane unavailable: fail fast with `HOSTED_INTEGRATION_UNAVAILABLE`
- target disabled: return policy failure without retrying locally
- token revoked: clear local session and surface reconnect state
- version mismatch: stop submission and show update-required state
- duplicate idempotency key: return existing action status
- secure token store locked/unavailable: stop hosted calls and show reconnect or
  unlock guidance without affecting local teams

Trusted identity source:

- prefer configured member `agentId` when present
- otherwise use the existing runtime convention equivalent to
  `<memberName>@<teamName>`
- use current team display name and member role from team config/meta
- do not derive agent identity from JSONL transcript messages, GitHub comment
  body, model output, or renderer-provided text
- if a member was renamed, use the runtime member identity active for that
  specific action attempt, not the newest display name retroactively

Idempotency source:

- one logical user/agent command gets one `requestId`
- retry after IPC/network failure reuses the same `requestId`
- double-click or duplicate renderer event collapses to the same pending
  submission when command fingerprint matches
- editing the action body or target creates a new `requestId`

Runtime tool surface:

- expose a narrow `request_github_action` style capability only when hosted
  integration is connected
- do not expose generic HTTP, GitHub token, installation id, or arbitrary REST
  path access to agents
- runtime capability receives target/action/body fields, not desktop token
- main process attaches trusted identity snapshot and performs final DTO
  normalization
- capability is disabled for stopped runs, replaced members, or teams whose
  current project no longer matches the selected hosted workspace
- action content is not stored in local durable run manifests, inbox messages,
  or task logs unless it was already user-visible task content

## Edge Cases

Critical edge cases:

- fresh desktop has no hosted workspace and hosted bootstrap is disabled
- user wants to pair this desktop to an existing workspace instead of creating a
  new one
- bootstrap succeeds but secure token store write fails
- token rotation succeeds on backend but local secure token write fails
- secure store is unavailable after OS login, keychain lock, Linux secret
  service absence, or app sandbox change
- configured control-plane URL changes after token was stored
- token-bearing request receives a redirect to another origin
- backend returns a setup URL outside the expected origin allowlist
- setup URL contains OAuth-like secrets in query and a renderer tries to log it
- two app windows start setup at the same time
- two desktop clients are paired to the same hosted workspace and one revokes
  the other
- desktop restarts after setup start but before GitHub callback completes
- browser callback arrives after setup expiry
- user closes browser before claim OAuth starts
- public callback returns `restart_required` for an untrusted setup callback
- user revokes desktop client from another machine
- desktop token rotates on server while app still holds the old token
- GitHub App installation is removed while UI still shows connected
- repository target is disabled after agent action button is opened
- repository availability snapshot becomes stale between list and enable
- action succeeds in GitHub but status polling temporarily fails
- control-plane rotates API contract while old desktop is still running
- renderer is compromised or sends modified attribution fields
- agent subprocess tries to include fake agent/team in content markdown
- network outage happens after request reaches control-plane
- user changes team/member config between action draft and action submit
- local clock is wrong and makes cached setup/action state look fresh or stale
- control-plane public base URL changes while desktop has an active setup
  session
- action payload exceeds server limit, includes binary-like data, or contains
  control characters in attribution fields
- agent action request arrives after team run stopped or member was replaced

Expected decisions:

- desktop polls setup/action status by server ids, not by local browser state
- backend remains source of truth for connection and target state
- renderer input is never trusted for agent attribution
- local retry of action submission uses same idempotency key
- failed secure token store write invalidates the local session and asks the
  user to retry pairing/bootstrap
- failed token rotation store write retries with the same `rotationRequestId`
  before forcing reconnect
- target list cache is display-only and must be refreshed before action submit
- setup dismiss does not imply server-side cancellation unless a backend cancel
  use case exists
- version mismatch stops mutating calls but can still allow read-only diagnostic
  state when backend supports it
- local clock is never trusted for authorization; it only controls UI refresh
  hints
- concurrent setup starts are coalesced by active setup session id when possible
- member rename after action submit does not rewrite existing action
  attribution
- changing control-plane base URL invalidates stored desktop token unless the
  new origin matches the old normalized origin
- cross-origin redirect with Authorization is treated as security failure, not
  network retry
- oversized action content fails locally with a safe validation message and is
  not truncated silently

## Architecture Guardrails

Add or extend checks so that:

- renderer cannot import control-plane token storage implementation
- renderer cannot call backend HTTP adapter directly if main-process IPC is the
  intended boundary
- hosted integrations feature does not import GitHub SDKs
- domain/application layers do not import Electron, React, HTTP clients, or
  runtime process services
- runtime bridge cannot accept raw GitHub credentials
- tests assert redaction of session token and action content in logs
- IPC payload normalizers live in contracts or adapters, not renderer UI files
- local action bridge cannot import control-plane backend packages directly
- hosted integration token store cannot be imported from renderer/preload
- hosted integration feature cannot write to generic config files with token-like
  values
- hosted integration HTTP adapter cannot accept a URL argument from renderer
- browser opener adapter cannot use generic `shell:openExternal` without
  setup-specific allowlist validation

## Test Plan

Unit tests:

- state machine transitions
- envelope construction
- idempotency key behavior
- version mismatch mapping
- safe error mapping
- token redaction
- avatar URL validation
- bootstrap vs pairing state transitions
- setup dismiss vs server cancellation behavior
- action request DTO normalizer rejects workspace/client ids in body
- token rotation recovery with repeated `rotationRequestId`
- local cache freshness rules never authorize an action
- runtime identity resolver handles member rename without transcript parsing
- control-plane base URL normalization rejects credentialed, cross-origin,
  private-network, fragment, and non-HTTPS non-localhost URLs
- action payload preflight mirrors backend size/control-character limits without
  truncation

Integration tests:

- IPC handler validates renderer input
- secure token store read/write/revoke flow
- control-plane adapter serializes headers and request ids
- setup resume after app restart using mocked backend
- runtime bridge submits an action with trusted agent metadata
- token store write failure clears partial session state
- revoked token maps to reconnect state
- target cache refresh happens before action submit
- two simultaneous renderer calls coalesce or serialize correctly
- app restart restores setup session id but not action content payload
- HTTP adapter rejects Authorization-bearing cross-origin redirects
- setup browser opener rejects unexpected origins and query logging

Security tests:

- renderer-provided fake attribution is ignored
- agent-authored markdown cannot set hidden attribution
- local logs do not contain desktop session token, OAuth code, or GitHub token
- unavailable control-plane does not create local durable GitHub action queue
- renderer never receives the desktop token through preload API
- renderer cannot directly call the HTTP adapter
- persisted local hosted-integration files contain no bearer token
- runtime subprocess environment contains no desktop token
- generic renderer `openExternal` path is not used for setup URLs
- hosted integration logs redact setup/OAuth query values and bearer prefixes

Smoke tests:

- app starts with no control-plane config
- app starts with hosted integration disabled
- app shows connected GitHub state with mocked backend
- submitting a mocked action shows processing and final status

## Acceptance Criteria

- desktop remains fully usable without control-plane
- user can connect and resume hosted GitHub setup
- user can see connected installation and repository target state
- trusted runtime can submit a GitHub action through control-plane
- local agents never receive GitHub installation tokens
- renderer never receives GitHub installation tokens
- desktop session token can be revoked and recovered by reconnect
- stale setup sessions cannot become connected
- action status is visible without raw content/token leakage
- all public failures map to safe user-facing messages
- architecture checks and focused tests pass

## Rollout

Recommended rollout:

1. hidden feature flag for desktop integration UI
2. mocked control-plane adapter smoke
3. real hosted control-plane in developer environment
4. sandbox GitHub installation
5. limited internal dogfood
6. public beta after Phase 10 and Phase 11 gates pass

## Open Questions

Only blockers before implementation:

- exact desktop secure token store primitive to reuse
- final backend route names after Phase 8 API surface review
- whether action status should be polling-only in V1 or prepared for future
  server-sent events

Non-blocking:

- richer repository target management UI
- action history filters
- per-team permission UI
- BYO GitHub App
