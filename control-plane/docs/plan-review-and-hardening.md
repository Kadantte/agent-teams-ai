# Control Plane Plan Review And Hardening

## Summary

The current plan has the right core direction:

```text
NestJS modular monolith
+ Clean Architecture feature packages
+ simple DDD bounded contexts
+ outbox-first external side effects
+ official GitHub App secrets kept server-side
```

The main improvement is to make the plan harder to misread during implementation. The riskiest areas are not NestJS boilerplate. The riskiest areas are identity trust, GitHub App installation binding, token custody, duplicated external side effects, and future confusion between hosted official app mode and self-hosted mode.

## Current Understanding

Agent Teams Desktop stays local-first. Control Plane is optional and exists only for hosted integration workflows:

- official GitHub App installation and token brokering
- GitHub comments, reviews, checks, and webhooks
- future Telegram, Slack, Discord, and other connector flows
- future billing, entitlements, audit, and optional runtime relay

GitHub should not become the center of the architecture. The center is:

```text
desktop/runtime request
  -> agent-actions
  -> integration-registry
  -> connector adapter
  -> outbox worker
```

## Risks And Weak Spots

### 1. Official App vs Self-Hosted Mode

Weak assumption:

- "Users can self-host the control-plane and still use our official GitHub App" sounds simple, but it is not true unless our hosted service still brokers tokens.

Reason:

- the official GitHub App private key cannot be distributed to user machines or self-hosted deployments.

Required decision:

- V1 should be hosted official app only.
- Later self-hosted mode must be either BYO GitHub App or hybrid self-host plus hosted token broker.

### 2. Agent Identity Is Attribution, Not Authority

Weak assumption:

- if an agent says "I am Agent X", the control-plane can show that identity.

Correct rule:

- agent identity must come from a trusted desktop/runtime envelope, not from free-form agent text.
- control-plane validates shape and workspace/client authorization.
- v1 may store only an action-time snapshot of agent/team display metadata.

### 3. GitHub App Installation Binding

Weak assumption:

- GitHub setup callback can always bind installation to the right workspace.
- signed setup state is enough to trust the `installation_id`.

Real cases:

- user starts install from desktop with signed state
- user starts install from GitHub App page without state
- org admin installs app but desktop user is not authorized to bind that org
- setup callback arrives twice
- installation is deleted during onboarding
- attacker calls setup URL with a spoofed `installation_id`

Required approach:

- signed setup state for happy path
- unclaimed installation state for no-state installs
- pending claim state after setup URL callback
- GitHub user authorization verification before binding installation to workspace
- explicit claim flow before repository actions are allowed

Important authority split:

- paired desktop proves Agent Teams workspace/client
- GitHub user authorization proves GitHub-side installation/repository access
- neither side alone should bind the installation

### 4. Public Comment Identity Can Be Spoofed If Rendering Is Loose

Weak assumption:

- putting agent name and avatar in markdown is enough.

Required approach:

- render a standardized attribution block
- escape all display fields
- separate attribution metadata from agent-authored body
- include hidden marker with schema version, opaque marker id, and integrity digest
- do not let agent-authored text create or override the identity header
- do not put internal workspace names, prompts, code, diffs, tokens, reusable model-output logs, or raw external action content in the marker

### 5. Review Comments Are More Complex Than Top-Level Comments

Weak assumption:

- GitHub "PR comments" and "review comments" are the same complexity.

Reality:

- top-level PR comments are issue comments
- line-level review comments need path, diff position, commit context, and failure handling for stale diffs

Recommended V1:

- issue comments and top-level PR comments only
- line-level review comments require a separate ADR before implementation

### 6. NestJS Can Pull Business Logic Outward

Weak assumption:

- using Nest modules automatically gives a clean modular monolith.

Required enforcement:

- domain/application packages compile without Nest
- use case tests do not use `TestingModule`
- controllers map DTOs to commands and return presenters
- no request-scoped providers in use cases
- no `forwardRef()` without ADR

### 7. Outbox Without Recovery Rules Still Duplicates Side Effects

Weak assumption:

- adding an outbox table is enough.
- outbox can retry comments without storing comment content.

Required behavior:

- every side-effect event has deterministic idempotency identity
- external action content is stored separately, encrypted, and short-lived
- outbox payload references content by id/hash instead of embedding raw body
- every connector handler checks persisted result before side effect
- GitHub handlers recover from "external success, DB failure" by searching for hidden marker
- malformed event versions go to dead letter without repeated mutation
- content is deleted or cryptographically shredded after successful dispatch

### 8. Privacy Goal Conflicts With Durable Comment Dispatch

Weak assumption:

- "no persistence of model-generated comment text" and "durable async GitHub comments" can both be absolute.

Reality:

- a worker cannot post an arbitrary comment later unless it can access the comment body
- the comment body may be model-generated
- storing it in raw outbox/audit would violate the privacy goal

Required approach:

- introduce `ExternalActionContent` as a special short-retention encrypted dispatch payload
- make this an explicit ADR decision before GitHub comments implementation
- store only hash/size/schema/result metadata permanently
- if zero persistence is required, switch to synchronous dispatch or a desktop-online retry protocol and accept lower reliability

### 9. Encryption Without Key Lifecycle Is Not Enough

Weak assumption:

- "encrypted at rest" is enough to make ExternalActionContent safe.

Reality:

- if all content shares one long-lived app key, compromise blast radius is broad
- cryptographic shredding is meaningless unless content has key material that can be destroyed independently
- key rotation can break pending dispatch if old key material disappears too early
- object storage would make action/content/outbox atomicity harder in V1

Required approach:

- use envelope encryption with per-content data encryption keys
- store encrypted content in Postgres for V1 so content/action/outbox commit atomically
- keep key-encryption key in hosted secret manager/KMS-equivalent custody
- delete encrypted data encryption key only after result metadata is safely committed
- implement or explicitly gate key rotation/rewrap before public rollout

## ExternalActionContent Key Management Options

### Option 1 - Postgres encrypted column + per-content DEK + hosted KEK

🎯 9 🛡️ 9 🧠 6
Approx changes: +700-1500 lines over persistence/platform crypto phases.

Store ciphertext and encrypted DEK in Postgres in the same transaction as action/outbox metadata. KEK lives in hosted secret manager/KMS-equivalent custody. Crypto-shred deletes encrypted DEK after successful result persistence.

Recommended for V1 because it keeps atomicity simple and makes shredding/retention enforceable.

### Option 2 - Object storage encrypted blobs + DB metadata

🎯 7 🛡️ 8 🧠 8
Approx changes: +1200-2500 lines plus lifecycle/orphan cleanup.

Blob storage scales better for large content, but introduces object lifecycle, orphan cleanup, multi-write atomicity, and more operational surface.

Good later if messenger/file payloads grow beyond comment-sized content.

### Option 3 - One shared application encryption key

🎯 5 🛡️ 5 🧠 4
Approx changes: +300-700 lines.

Simpler, but broad blast radius and weak crypto-shredding semantics.

Not recommended for production V1.

### 10. Missing Operational Baseline

Weak assumption:

- architecture can be implemented before deciding basic operations.

Minimum baseline:

- public HTTPS endpoint for GitHub webhooks
- Postgres-backed persistence and migrations
- worker concurrency policy
- health and readiness endpoints
- structured logs with correlation ids
- metrics for webhook accepted/rejected, outbox lag, retries, dead letters, rate limits
- backup and restore expectations for metadata

### 11. GitHub API Details Can Leak Into Generic Design

Weak assumption:

- "GitHub comments" is one capability.

Reality:

- issue comments and top-level PR comments use the issue comments API because every pull request is also an issue
- line-level review comments use a different API, target model, and permission model
- installation tokens can and should be narrowed by repository and permissions
- webhook signature verification needs the raw request body, which must be handled before framework body parsing mutates it

Required approach:

- model `github.issue_comment.write` separately from future `github.review_comment.write`
- token issuance policy receives target repository id and required permission set
- GitHub adapter owns API-version header policy
- webhook route has an explicit raw-body adapter test

### 12. Desktop-First Onboarding Can Skip GitHub Authority By Accident

Weak assumption:

- because the user starts from desktop, the control-plane can trust the install callback.

Reality:

- desktop auth and GitHub org/repo authority are separate trust domains
- GitHub setup URL `installation_id` is explicitly not enough authority
- GitHub user access tokens are useful for claim verification but should not be stored for V1 comment posting

Required approach:

- introduce a pending installation claim state
- require GitHub-side verification before binding targets
- discard user access token after claim verification in V1
- make "claim verification not completed" a first-class integration state in desktop UI/API

### 13. GitHub App Registration Settings Can Break The Flow

Weak assumption:

- setup URL and OAuth during installation can be enabled together.

Reality:

- GitHub App OAuth-during-install redirects users through the callback URL flow
- GitHub docs say setup URL is not available when OAuth-during-install is selected
- desktop-first setup needs setup URL state correlation, then a separate claim authorization flow

Required approach:

- V1 uses setup URL plus separate controlled claim OAuth
- V1 does not enable OAuth-during-install
- claim OAuth uses short-lived `state`, exact `redirect_uri`, and PKCE
- GitHub App client secret stays only in hosted control-plane secrets
- device flow is optional fallback and must obey provider polling interval/`slow_down`

### 14. Desktop Browser Handoff Can Create Stale Or Unsafe State

Weak assumption:

- after hosted setup finishes, desktop will just know.

Reality:

- browser flow runs outside Electron
- desktop may restart while setup is pending
- stale browser tabs can finish old setup sessions
- local callback servers and deep links can accidentally expose tokens

Required approach:

- use a hosted setup session state machine
- desktop polls authenticated Desktop API for setup status
- setup session state is resumable after desktop restart
- completion pages/deep links contain only non-secret correlation data
- GitHub installation access does not automatically enable all repositories for agent actions

### 15. Target Resolution Can Confuse Local Git Hints With Authority

Weak assumption:

- desktop knows the repository because it can read `git remote`, branch name, PR URL, or `owner/name`.

Reality:

- local remotes often point to forks
- PR and issue numbers are repository-local
- repository names can be renamed or transferred
- GitHub issue comments can comment on both issues and PR conversations
- installation repository access is not the same as Agent Teams target enablement

Required approach:

- desktop target data is only a candidate
- control-plane authorizes by workspace, active installation, immutable GitHub repository id, explicit `IntegrationTargetBinding`, and enabled capability
- top-level PR comments must verify that the PR exists and that its base repository id equals the bound repository id
- issue comments must reject PR-backed issues unless the action kind or policy explicitly allows them
- target validation must happen before ExternalActionContent is stored or an outbox event is appended
- issue/PR bodies and pull request diffs are not needed for this check and must not be stored

## Target Resolution Options

### Option 1 - Control-plane resolves immutable GitHub ids and explicit target bindings

🎯 10 🛡️ 10 🧠 6
Approx changes: +800-1600 lines across integration-registry, github-app, agent-actions, and tests.

Desktop sends hints, but control-plane verifies installation repository access, resolves immutable repository id, checks `IntegrationTargetBinding`, and validates PR base repository before posting.

Recommended for V1 because it survives forks, repo renames, stale desktop state, and same-number issue/PR collisions.

### Option 2 - Desktop sends owner/repo/PR and control-plane verifies before action

🎯 7 🛡️ 7 🧠 5
Approx changes: +500-1000 lines.

This is acceptable only if `owner/repo` and PR URL remain input hints. The control-plane still must call GitHub or use a recent verified repository cache before storing content or appending outbox.

Good as an optimization path, not as an authority model.

### Option 3 - Trust local git remote, PR URL, or owner/repo

🎯 3 🛡️ 3 🧠 3
Approx changes: +200-500 lines.

This is simpler, but it can post to the wrong repository for fork PRs, break after repo rename/transfer, and confuse same-number issues/PRs.

Not recommended.

## Desktop Handoff Options

### Option 1 - Authenticated desktop polling of hosted setup session

🎯 10 🛡️ 9 🧠 5
Approx changes: +500-1200 lines over desktop integration and pairing phases.

Desktop starts setup, opens browser, then polls `setupSessionId` status through authenticated Desktop API. Hosted callbacks update server-side state. Desktop can resume after restart by listing active sessions.

Recommended for V1 because it avoids local callback servers, avoids secrets in deep links, and fits local-first desktop behavior.

### Option 2 - Custom app deep link from hosted completion page

🎯 7 🛡️ 6 🧠 6
Approx changes: +700-1500 lines plus platform-specific deep-link handling.

Hosted page redirects to a desktop deep link. This can feel smoother, but it is more fragile across OS/browser defaults and must never carry secrets. It can be a non-secret convenience on top of polling.

### Option 3 - Localhost callback server in Electron

🎯 5 🛡️ 5 🧠 7
Approx changes: +900-1800 lines plus OS/firewall/error handling.

Desktop opens a local server and receives callback directly. This increases local networking, CSRF/open-redirect concerns, port conflicts, and firewall failures. Not recommended for V1.

## Claim Flow Options

### Option 1 - Setup URL plus separate web OAuth claim

🎯 9 🛡️ 9 🧠 7
Approx changes: +900-1800 lines over the GitHub foundation phase.

Desktop creates setup state and opens the install URL. Setup URL callback creates a pending claim. The user then completes a separate web OAuth claim flow, and control-plane verifies that the GitHub user can access the installation/repositories before binding.

Recommended for V1 because it keeps official-app self-service and closes the spoofed `installation_id` gap.

### Option 2 - OAuth-during-install callback-only flow

🎯 6 🛡️ 7 🧠 7
Approx changes: +900-1800 lines, but it changes app registration and install UX.

GitHub starts user authorization immediately after install and redirects to callback URL. This can work, but setup URL is not available in this mode, callback URL selection is less flexible, and desktop state correlation needs a separate design.

Not recommended for V1 unless we decide to abandon setup URL-based desktop correlation.

### Option 3 - Device flow claim after setup URL

🎯 7 🛡️ 8 🧠 8
Approx changes: +1200-2400 lines.

Desktop starts install with setup URL state, then uses GitHub device flow to authorize the user for claim verification. This is good for headless/browser-hostile environments, but it adds polling, `slow_down`, expiration, and UI state complexity.

Useful as a later fallback, not the default V1 path.

## Deployment Options

### Option 1 - Hosted official GitHub App and hosted control-plane

🎯 10 🛡️ 9 🧠 6
Approx changes: 8k-18k lines across foundation and GitHub V1.

Users install our official GitHub App. Our hosted control-plane owns the private key, webhook secret, installation mapping, and token issuance.

Recommended for V1 because it matches the product goal: simple user installation without each user creating their own GitHub App.

### Option 2 - Self-hosted control-plane with BYO GitHub App

🎯 8 🛡️ 8 🧠 7
Approx changes: +2k-5k lines after hosted mode.

Users deploy their own control-plane and create their own GitHub App/private key. This is clean from a security perspective, but it loses the "one official app" product simplicity.

Good later for enterprise/self-hosted customers.

### Option 3 - Hybrid self-hosted control-plane plus hosted token broker

🎯 6 🛡️ 7 🧠 9
Approx changes: +5k-10k lines after hosted mode.

Users self-host most metadata and workflows, but our hosted broker still owns the official app private key and mints scoped tokens.

This keeps official app branding but creates a harder distributed trust model: broker authorization, tenant mapping, revocation, audit split, and support complexity.

Recommendation: document as future possibility only.

## Required Decision Gates Before Code

Do not start Phase 1 implementation until these are accepted or explicitly deferred:

- official hosted mode is the V1 target
- self-hosted V1 does not use the official app private key
- top-level GitHub comments are V1, line-level review comments are V2/ADR
- agent identity source is a trusted desktop/runtime envelope, not agent-authored text
- no raw prompts, code, diffs, reusable model-output logs, or raw webhook payloads are stored by default
- external action content persistence is explicitly allowed only as encrypted short-retention dispatch payload
- ExternalActionContent uses per-content data encryption keys and server-side key-encryption key custody
- Postgres is the canonical store for v1 metadata, outbox, locks, and idempotency
- architecture boundary checks are part of the first scaffold PR
- GitHub token requests are scoped to exact repository and minimum permissions where possible
- webhook signature verification uses raw body and fails closed when secret is missing
- GitHub API version is pinned explicitly during implementation
- setup URL creates pending claim only; binding requires GitHub-side authority verification
- GitHub user access tokens used for claim verification are not persisted in V1
- GitHub App registration uses setup URL plus separate claim OAuth, not OAuth-during-install
- claim OAuth uses short-lived `state`, exact `redirect_uri`, and PKCE
- desktop browser handoff uses authenticated setup-session polling, not local callback server
- deep links/completion pages carry no secrets
- target authorization uses immutable GitHub repository id and explicit target binding, not local git metadata
- PR top-level comment target validation checks PR base repository id before creating an issue comment

## Detailed Implementation Steps

### Phase 0.5 - Decision Lock

Add ADRs for:

- deployment modes and GitHub App secret custody
- agent identity envelope and attribution rendering
- GitHub comment modes and why line-level review comments are deferred
- outbox transaction and recovery strategy
- external action content storage, encryption, and retention
- ExternalActionContent key management, rotation, and crypto-shredding
- data retention and privacy classifications
- GitHub API version and permission mapping policy
- GitHub installation claim authority and transient user-token policy
- GitHub App registration settings, callback URLs, and device-flow policy
- desktop setup-session handoff and polling state machine

Acceptance:

- no production code added
- all open V1 decisions are either accepted or marked deferred
- README states that control-plane is optional for desktop

### Phase 1 - Scaffold With Guardrails

Implement the NestJS workspace only after the decision lock.

Acceptance:

- `domain` and `application` packages can compile without Nest
- architecture check fails on forbidden imports
- architecture check fails on forbidden pre-phase dependencies
- API and worker boot with no DB side effects
- no GitHub SDK or Prisma before their phases unless a phase explicitly asks for it

### Phase 2 - Shared Kernel And Config

Keep shared primitives boring and framework-free.

Acceptance:

- stable error shape
- typed ids
- clock abstraction
- env validation
- safe logging foundation

### Phase 3 - API/Error/Observability Platform Layer

Implement the API boundary before persistence and external side effects.

Acceptance:

- public API errors use the shared safe error contract
- unknown exceptions do not expose stack traces, provider messages, or secrets
- request and correlation ids are generated or propagated
- request logs contain safe method/path/status/duration metadata
- global API adapters stay in platform packages, not feature domain/application code

### Phase 4 - Persistence, Outbox, Locks

Implement persistence before GitHub side effects.

Acceptance:

- transaction port covers action request plus outbox append
- worker can claim, retry, recover stale, and dead-letter
- DB-backed uniqueness protects idempotency
- ExternalActionContent is encrypted, hash-verified, short-retention, and referenced from outbox by id
- ExternalActionContent is stored in Postgres with per-content encrypted data encryption key
- successful dispatch deletes or cryptographically shreds raw content
- key rotation/rewrap is documented or gated before public rollout
- no in-memory lock is required for correctness

### Phase 5 - Identity, Pairing, Setup State

Implement workspace/client identity and GitHub setup state before GitHub connector side effects.

Acceptance:

- pairing code is single-use and expires
- desktop token is scoped, revocable, and rotatable
- GitHub setup state creates a pending claim only
- installation binding requires GitHub-side authority verification
- unclaimed and pending-claim installation flows are represented, even if UI is deferred

### Phase 6 - Generic Integration And Agent Actions

Implement generic external action flow.

Acceptance:

- agent action authorization checks workspace, client, target binding, integration capability, and entitlement
- target binding resolution rejects local git metadata as authority
- PR top-level target resolution validates PR base repository id
- issue target resolution rejects target-kind mismatch
- duplicate request returns existing action
- allowed request creates outbox event
- allowed comment action stores encrypted ExternalActionContent, not raw body in outbox/audit
- denied request is safe, auditable, and does not enqueue side effects

### Phase 7 - GitHub Foundation

Implement installation lifecycle and webhook normalization before posting comments.

Acceptance:

- webhook signature verification uses raw body
- duplicate delivery is idempotent
- repository authorization uses immutable GitHub repository id
- deleted/suspended installation blocks actions
- setup URL `installation_id` creates pending claim only
- claim completion verifies GitHub user/installation/repository access
- transient GitHub user token is discarded after claim verification
- OAuth-during-install is disabled for V1 setup URL flow
- claim OAuth validates short-lived `state` and PKCE
- desktop setup session is resumable after restart
- stale setup sessions cannot overwrite connected state

### Phase 8 - GitHub Comments V1

Implement top-level issue/PR comments with attribution.

Acceptance:

- standardized agent attribution block
- hosted or deterministic public avatar
- hidden marker schema version with opaque public marker id
- update-or-create by marker
- recovery from external success and DB failure

### Phase 9 - Desktop Integration

Expose control-plane as an optional capability.

Acceptance:

- app starts without control-plane config
- integrations show unavailable when not paired
- local work remains unaffected by hosted outage
- agents never receive GitHub tokens

## Edge Cases To Add To The Main Plan

- GitHub App installed from GitHub without desktop setup state
- setup state expires after GitHub install starts
- installation callback delivered twice
- spoofed setup URL `installation_id`
- GitHub user authorization revoked during claim
- OAuth-during-install enabled by mistake
- claim OAuth state or PKCE mismatch
- device flow polling too fast, if fallback is enabled
- desktop restart during setup
- stale browser tab completes old setup
- hosted completion deep link leaks secret
- GitHub SAML SSO blocks claim visibility
- GitHub App installed on all repositories
- local git remote points to a fork while the PR base is upstream
- PR number belongs to another repository
- issue number is not a PR for a PR action
- issue action points at a PR-backed issue and policy forbids it
- repository renamed after target binding
- external action content retention expires before retry
- external action content hash mismatch
- external action content decryption fails
- crypto shred runs before result persistence
- key rotation during pending dispatch
- org admin installs app but local workspace user is not allowed to bind it
- repository is already bound to another workspace
- agent display name changes between request and worker execution
- avatar host fails or image is blocked
- hidden marker is deleted or edited by a human
- GitHub issue is transferred or converted
- PR head changes before line-level review comments, if/when supported
- worker is deployed twice with different versions
- public API version mismatch with older desktop

## Tests

Minimum test matrix before GitHub comments are considered production-ready:

- architecture boundary tests for Nest/Prisma/Octokit imports
- use case unit tests without Nest
- repository adapter tenant isolation tests
- idempotency concurrency tests
- outbox retry and dead-letter tests
- webhook signature and duplicate delivery tests
- raw-body webhook signature regression test
- external action content encryption/redaction/retention tests
- per-content data encryption key and key rotation/rewrap tests
- crypto-shred happens only after result metadata persistence
- outbox payload does not contain raw comment body
- setup state single-use and expired-state tests
- spoofed setup URL `installation_id` cannot bind installation
- claim cannot complete without GitHub user/installation verification
- GitHub user token is not persisted after claim verification
- OAuth-during-install config mismatch is caught before public rollout
- claim OAuth state/PKCE mismatch fails closed
- desktop setup-session polling/resume tests
- stale browser completion cannot connect expired/cancelled session
- app installed on all repos still requires explicit target binding
- fork PR remote resolves against PR base repository, not local origin
- PR number from another repository is rejected
- issue-not-PR target is rejected for PR action
- PR-backed issue is rejected for issue action when policy forbids it
- repository rename preserves immutable-id authorization and updates display snapshot
- unauthorized workspace/repo action tests
- comment marker recovery test
- scoped installation token request test
- log redaction test for token-like values

## Verification Commands

Expected command shape once implementation exists:

```text
pnpm --dir control-plane typecheck
pnpm --dir control-plane test
pnpm --dir control-plane architecture:check
pnpm --dir control-plane lint
```

Avoid broad root repo commands for early control-plane-only PRs unless the PR touches shared root config.

## External References Checked

Use these official docs again during implementation, because provider behavior and API examples can change:

- GitHub Docs: [Create an installation access token for an app](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app)
- GitHub Docs: [REST API endpoints for issue comments](https://docs.github.com/en/rest/issues/comments)
- GitHub Docs: [REST API endpoints for issues](https://docs.github.com/en/rest/issues/issues)
- GitHub Docs: [REST API endpoints for pull requests](https://docs.github.com/en/rest/pulls/pulls)
- GitHub Docs: [REST API endpoints for pull request review comments](https://docs.github.com/en/rest/pulls/comments)
- GitHub Docs: [List repositories accessible to the app installation](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation)
- GitHub Docs: [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- GitHub Docs: [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- GitHub Docs: [About the setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url)
- GitHub Docs: [Sharing your GitHub App](https://docs.github.com/en/apps/sharing-github-apps/sharing-your-github-app)
- GitHub Docs: [Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- GitHub Docs: [Modifying a GitHub App registration](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration)
- NestJS Docs: [Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes)

## Rollback / Kill Switch

V1 needs kill switches before public rollout:

- disable all outbound GitHub actions globally
- disable integration actions per workspace
- disable a connector kind
- pause worker side effects while keeping webhook ingestion
- mark an installation unavailable
- revoke a desktop client
- stop processing a poisoned outbox event type

Kill switches must fail closed for external side effects and must not make local desktop workflows unusable.

## Acceptance Criteria

The plan is ready for implementation when:

- deployment mode is explicit
- top-level comment scope is explicit
- identity envelope authority is explicit
- outbox recovery behavior is explicit
- external action content storage is explicitly classified, encrypted, short-retention, and not logged/audited
- tenant isolation invariants are covered by tests
- NestJS boundary enforcement is included in the first scaffold
- every phase can be reviewed independently
- no phase requires storing code, diffs, raw prompts, raw webhook payloads, or general model-output logs
- GitHub comment bodies are treated only as bounded ExternalActionContent for explicit dispatch, not as reusable model-output storage
