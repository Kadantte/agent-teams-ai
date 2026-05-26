# Phase 4 - Persistence, Transactions, Outbox, Locks Plan

## Status

Draft implementation plan.

This phase adds the durable foundation required before GitHub, messenger,
billing, or any other external side effect can be safely executed.

Phase 4 must preserve the existing direction:

- Clean Architecture inside feature packages
- simple DDD where domain language helps
- SOLID boundaries
- port/adapter dependencies
- no external side effects inside request handlers
- no GitHub, messenger, billing, or queue SDKs

## Primary Outcome

After Phase 4, an API request or future desktop action can durably record
intent, append an outbox event in the same transaction, store encrypted external
action content by reference, and let a worker claim/retry/dead-letter that event
without relying on in-memory state for correctness.

## Summary

Implement a persistence foundation as an optional control-plane capability:

- Postgres-backed metadata and outbox state.
- explicit transaction port for atomic application use cases.
- DB-backed outbox with lease, retry, dead-letter, and stale recovery.
- encrypted ExternalActionContent stored by reference, never inline in event
  payloads or audit metadata.
- DB-backed lock primitive only where row-level outbox claims are insufficient.
- architecture guardrails proving database, crypto, and worker adapters stay out
  of shared/domain/application layers.

Phase 4 is still a foundation phase. It must not post to GitHub, send messages,
charge billing, or perform any external provider side effect.

## Current Understanding

The existing control-plane foundation already has:

- `@agent-teams-control-plane/shared` for dependency-free primitives.
- `platform/config` for safe config parsing and secret-free summaries.
- `platform/api` for public error mapping and request/response observability.
- `platform/logger` for safe structured logs.
- `apps/worker` as a bootable worker process, currently idle.
- architecture checks that already forbid Prisma/pg in shared and
  domain/application layers.

Phase 4 should extend this foundation, not bypass it. Persistence belongs behind
ports and infrastructure adapters. Request handlers and worker loops should
coordinate use cases, not own SQL, encryption, retry, or lock semantics.

## Risks And Weak Spots

High-priority risks to design around before implementation:

- **Stale worker completion**: worker A can claim an event, lease can expire,
  worker B can claim it, and worker A can later write `completed`. The plan must
  use a per-claim token/fencing check for completion, retry, and dead-letter
  writes.
- **Hidden framework leakage**: Prisma/Nest objects can leak through
  `TransactionContext` if the context is not opaque and adapter-owned.
- **Migration risk**: generated migrations can be destructive or environment
  dependent unless migrations are reviewed, committed, and deployed separately
  from app boot.
- **Secret persistence risk**: outbox payloads, audit metadata, dead-letter
  summaries, and logs can accidentally capture plaintext content or raw provider
  errors.
- **Optional backend confusion**: local-disabled mode must still boot without a
  database, otherwise the control-plane looks mandatory for users who do not use
  integrations.
- **Outbox duplication**: Phase 4 cannot fully prevent external duplicate side
  effects because provider calls start later. It must provide idempotency keys,
  claim fencing, and update-or-create hooks for later connector phases.
- **DB test fragility**: concurrency, rollback, and migration behavior must be
  tested against real Postgres, not only mocked repositories.
- **Operational noise**: polling workers can create noisy logs and DB load unless
  empty polls are quiet, backoff is jittered, and kill switches exist.

## Current Dependency Research

Checked with `pnpm view` on 2026-05-26:

- `prisma`: `7.8.0`
- `@prisma/client`: `7.8.0`
- `kysely`: `0.29.2`
- `drizzle-orm`: `0.45.2`
- `pg`: `8.21.0`

Implementation must re-check latest stable versions immediately before adding
dependencies, then pin exact versions in `control-plane/package.json` and
`pnpm-lock.yaml`.

Official docs checked during plan hardening:

- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate) keeps
  generated SQL migration files in version control and lets teams customize SQL
  before applying it.
- [Prisma raw SQL](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries)
  supports database-specific operations, and raw SQL can be used inside Prisma
  transactions.

This supports the recommended Prisma + explicit raw SQL approach, but Phase 4
must still validate the exact Prisma 7 setup before implementation because
Prisma configuration and migration commands have changed across major versions.

## Key Decision - Database Access

### Option 1 - Prisma schema/migrations + raw SQL for claims

🎯 9 🛡️ 9 🧠 6  
Approx change size: 1200-2200 lines.

Use Prisma for schema, migrations, typed basic CRUD, and repository adapters.
Use raw SQL only for Postgres-specific concurrency primitives such as
`FOR UPDATE SKIP LOCKED`, advisory locks if needed, and atomic claim queries.

This is the recommended path because Prisma is familiar, migration workflow is
well understood, and raw SQL can cover the exact concurrency primitives that an
outbox needs.

Risk: Prisma abstractions can tempt infrastructure concerns into application
code. Guardrails must forbid Prisma imports outside database/outbox
infrastructure.

### Option 2 - Kysely + pg + SQL migrations

🎯 7 🛡️ 9 🧠 7  
Approx change size: 1500-2600 lines.

Use explicit SQL migrations and Kysely for typed query construction. This gives
more direct control over Postgres and makes lock/outbox semantics very clear.

Risk: more custom migration/test tooling and more handwritten SQL ownership.
Good for control, slower for the team.

### Option 3 - Drizzle ORM + SQL migrations

🎯 6 🛡️ 8 🧠 7  
Approx change size: 1400-2400 lines.

Drizzle keeps SQL close and typed, but the project already discussed Prisma as
the likely persistence phase dependency. Choose this only if Prisma migrations or
runtime model become a concrete blocker.

## Recommended Decision

Use **Option 1 - Prisma schema/migrations + raw SQL for claim/lock paths**.

Reasoning:

- Prisma is productive for schema ownership and regular repository adapters.
- Postgres-specific outbox claiming is easier and safer as explicit raw SQL.
- The application/domain layers remain database-agnostic through ports.
- Extraction to a separate service later remains possible because the durable
  contracts live in tables and feature application ports, not Nest modules.

## Decision Gates Before Code

Before adding dependencies or migrations, create compact ADR notes inside the
Phase 4 implementation PR or docs:

1. **Persistence adapter ADR**: confirm Prisma 7 + Postgres is still the chosen
   adapter, including exact package versions and migration command shape.
2. **Migration ownership ADR**: confirm migrations are committed SQL artifacts,
   app boot never auto-applies hosted migrations, and destructive changes need a
   separate approved migration plan.
3. **Encryption key ADR**: confirm v1 uses env-loaded master key, define key
   length/encoding, and document rotation/rewrap as required before public
   rollout.
4. **Optional mode ADR**: confirm `local-disabled` can run API and worker
   without `CONTROL_PLANE_DATABASE_URL` or encryption master key.

Do not start feature code until these gates are explicit. They are small, but
they prevent the Phase 4 implementation from quietly choosing irreversible
defaults.

## Non-Goals

Do not implement in Phase 4:

- GitHub App webhook handling
- GitHub installation tokens
- GitHub comments/reviews/checks
- Telegram/Slack/Discord connectors
- billing or entitlements
- desktop pairing/auth flows
- Redis, Kafka, BullMQ, pg-boss, SQS, or RabbitMQ
- external object storage
- cloud KMS integration
- a generic event bus framework
- user-visible UI

## Package Shape

```text
control-plane/
  packages/
    platform/
      database/
        src/
          index.ts
          database.config.ts
          transaction/
          prisma/
          nest/

      crypto/
        src/
          index.ts
          envelope-encryption.ts
          node-crypto-envelope-encryption.adapter.ts
          nest/

    features/
      outbox/
        src/
          index.ts
          domain/
          application/
            ports/
            use-cases/
          infrastructure/
            prisma/
            worker/
          interface/
            nest/

      external-action-content/
        src/
          index.ts
          domain/
          application/
            ports/
            use-cases/
          infrastructure/
            prisma/
          interface/
            nest/
```

Keep `AuditEvent` as a table in this phase, but do not create a full audit
feature unless the implementation starts to need real audit use cases. Avoid
premature package sprawl.

## Dependency Direction

Allowed:

```text
feature domain -> shared
feature application -> domain + shared + application ports
feature infrastructure -> feature application ports + platform/database + platform/crypto
feature interface/nest -> feature use cases + Nest module wiring
platform/database -> shared + Prisma/pg + Nest adapter
platform/crypto -> shared + node:crypto + Nest adapter
apps/api, apps/worker -> feature public Nest modules + platform modules
```

Forbidden:

```text
domain/application -> Prisma
domain/application -> Nest
domain/application -> pg
domain/application -> node:crypto
platform/database -> feature packages
shared -> platform/features/Nest/Prisma/pg
request handlers -> external side effects
```

## Domain Model

### OutboxEvent

Aggregate root for durable side-effect intent.

Fields:

- `id: OutboxEventId`
- `type: string`
- `version: number`
- `status: pending | processing | completed | dead-lettered | cancelled`
- `aggregateKind?: string`
- `aggregateId?: string`
- `workspaceId?: WorkspaceId`
- `idempotencyKey: string`
- `payload: JsonObject`
- `contentRefId?: ExternalActionContentId`
- `contentHash?: string`
- `attempts: number`
- `maxAttempts: number`
- `nextAttemptAt: UnixMilliseconds`
- `lockedBy?: string`
- `lockedUntil?: UnixMilliseconds`
- `claimToken?: string`
- `lastSafeError?: SafeError`
- `createdAt`
- `updatedAt`
- `completedAt?`
- `deadLetteredAt?`

Domain invariants:

- `pending` can be claimed only when `nextAttemptAt <= now`.
- `processing` must have `lockedBy`, `lockedUntil`, and `claimToken`.
- completion, retry, and dead-letter writes for a claimed event must match
  `id + lockedBy + claimToken`; stale workers must update zero rows.
- claim increments `attempts` so crash loops cannot retry forever without being
  counted.
- retry sets future `nextAttemptAt` from the already-incremented attempt count.
- `attempts >= maxAttempts` transitions to `dead-lettered` after a failed or
  stale final attempt.
- `completed` and `dead-lettered` are terminal.
- payload must never contain raw external action content when content is large,
  sensitive, or intended for deletion.

### ExternalActionContent

Encrypted content referenced by outbox events.

Fields:

- `id`
- `kind`
- `ciphertext`
- `encryptedDataKey`
- `dataKeyAlgorithm`
- `contentEncryptionAlgorithm`
- `nonce`
- `authTag`
- `sha256`
- `keyRef`
- `expiresAt`
- `deletedAt?`
- `shreddedAt?`
- `createdAt`

Domain invariants:

- plaintext is accepted only at the application boundary and is never persisted.
- every row uses a unique per-content data encryption key.
- ciphertext must be hash-verifiable.
- content can be deleted or cryptographically shredded after successful dispatch.
- expired content cannot be dispatched.
- active content must have ciphertext, encrypted data key, nonce, and auth tag.
- shredded content must not be decryptable even if the database row remains for
  retention/audit reference.

### DeadLetterEvent

Durable terminal failure record.

Fields:

- `id`
- `outboxEventId`
- `eventType`
- `eventVersion`
- `finalSafeError`
- `attempts`
- `payloadSummary`
- `contentRefId?`
- `createdAt`

Domain invariants:

- dead-letter metadata is safe.
- no raw content body is copied into dead-letter.
- content retention policy is explicit.

### DistributedLock

DB-backed lease for coordination where row-level outbox claims are not enough.

Fields:

- `name`
- `ownerId`
- `lockedUntil`
- `fencingToken`
- `createdAt`
- `updatedAt`

Domain invariants:

- a lock is valid only until `lockedUntil`.
- every successful acquire increments `fencingToken`.
- correctness must not depend on an in-memory mutex.
- distributed locks are not used for outbox claiming; row-level claims are the
  primary outbox concurrency control.
- operations protected by a distributed lock must persist/check `fencingToken`
  where stale owners could otherwise commit after lease expiry.

## Application Ports

### Transaction Port

```ts
export interface TransactionRunner {
  runInTransaction<T>(work: (context: TransactionContext) => Promise<T>): Promise<T>;
}

export interface TransactionContext {
  readonly transactionId: string;
}
```

Repository ports that need atomicity receive `TransactionContext`.

Important rule: application use cases must not receive Prisma transaction
objects. `TransactionContext` is opaque and adapter-owned.

Additional rules:

- transaction context cannot be reused after commit or rollback.
- repositories must reject a context created by another database adapter.
- do not use hidden ambient transactions in application code unless a later ADR
  explicitly allows `AsyncLocalStorage`; explicit context passing stays clearer
  for Clean Architecture boundaries.

### Outbox Ports

```ts
export interface OutboxWriter {
  append(event: NewOutboxEvent, context: TransactionContext): Promise<OutboxEvent>;
}

export interface OutboxClaimer {
  claimNextBatch(input: ClaimOutboxBatchInput): Promise<readonly ClaimedOutboxEvent[]>;
  markCompleted(input: CompleteOutboxEventInput): Promise<void>;
  markFailedForRetry(input: RetryOutboxEventInput): Promise<void>;
  markDeadLettered(input: DeadLetterOutboxEventInput): Promise<void>;
  recoverStaleProcessing(input: RecoverStaleOutboxInput): Promise<number>;
}
```

`ClaimedOutboxEvent` and all completion/retry/dead-letter inputs must carry a
`claimToken`. The infrastructure adapter must update with predicates equivalent
to:

```text
where id = eventId
  and status = 'processing'
  and locked_by = workerId
  and claim_token = claimToken
```

If the update affects zero rows, the worker treats it as a stale claim and does
not attempt a best-effort overwrite.

### External Content Ports

```ts
export interface ExternalActionContentStore {
  storeEncrypted(
    input: StoreExternalActionContentInput,
    context: TransactionContext,
  ): Promise<ExternalActionContentRef>;
  loadDecrypted(ref: ExternalActionContentRef): Promise<DecryptedExternalActionContent>;
  shred(ref: ExternalActionContentRef, context: TransactionContext): Promise<void>;
}
```

### Lock Ports

```ts
export interface DistributedLockPort {
  acquire(input: AcquireLockInput): Promise<AcquireLockResult>;
  renew(input: RenewLockInput): Promise<RenewLockResult>;
  release(input: ReleaseLockInput): Promise<void>;
}
```

## Database Schema

### `outbox_events`

Recommended columns:

```text
id uuid primary key
event_type text not null
event_version integer not null
status text not null
aggregate_kind text null
aggregate_id text null
workspace_id text null
idempotency_key text not null
payload_json jsonb not null
content_ref_id uuid null
content_sha256 text null
attempts integer not null default 0
max_attempts integer not null default 10
next_attempt_at timestamptz not null
locked_by text null
locked_until timestamptz null
claim_token text null
last_error_code text null
last_error_category text null
last_error_message text null
last_error_retryable boolean null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
completed_at timestamptz null
dead_lettered_at timestamptz null
```

Indexes:

```text
unique(idempotency_key)
index(status, next_attempt_at)
index(locked_until) where status = 'processing'
index(claim_token) where status = 'processing'
index(workspace_id, created_at)
index(content_ref_id)
```

The `idempotency_key` must either be globally namespaced by the application
(`workspace:event-type:logical-action`) or the schema must use a composite
unique index such as `(workspace_id, idempotency_key)`. Do not rely on a
client-provided opaque key being globally unique across workspaces.

### `external_action_contents`

Recommended columns:

```text
id uuid primary key
content_kind text not null
ciphertext bytea null
encrypted_data_key bytea null
data_key_algorithm text not null
content_encryption_algorithm text not null
nonce bytea null
auth_tag bytea null
sha256 text not null
key_ref text not null
expires_at timestamptz not null
deleted_at timestamptz null
shredded_at timestamptz null
created_at timestamptz not null default now()
```

`ciphertext`, `encrypted_data_key`, `nonce`, and `auth_tag` are nullable so
cryptographic shredding can keep a safe reference row while removing the
material required to decrypt. Application invariants must enforce that active
rows have all encryption fields present and shredded rows cannot be loaded.

Indexes:

```text
index(expires_at)
index(deleted_at)
index(shredded_at)
```

### `external_action_content_key_refs`

Recommended columns:

```text
key_ref text primary key
key_version integer not null
algorithm text not null
status text not null
created_at timestamptz not null default now()
retired_at timestamptz null
```

This table stores references and rotation metadata only. It must not store raw
master keys.

### `dead_letter_events`

Recommended columns:

```text
id uuid primary key
outbox_event_id uuid not null unique
event_type text not null
event_version integer not null
final_error_json jsonb not null
attempts integer not null
payload_summary_json jsonb not null
content_ref_id uuid null
created_at timestamptz not null default now()
```

### `audit_events`

Recommended columns:

```text
id uuid primary key
event_type text not null
actor_kind text not null
actor_id text null
workspace_id text null
subject_kind text null
subject_id text null
safe_metadata_json jsonb not null
correlation_id text null
request_id text null
created_at timestamptz not null default now()
```

### `distributed_locks`

Recommended columns:

```text
name text primary key
owner_id text not null
locked_until timestamptz not null
fencing_token bigint not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Migration Policy

Phase 4 migrations must be treated as production artifacts, not generated
scratch files:

- commit generated SQL migrations to version control.
- review generated SQL before merge, especially indexes, defaults, enum-like
  checks, and nullable changes.
- prefer expand-only migrations in Phase 4; destructive migrations require a
  separate ADR and rollback plan.
- application and worker boot must not auto-run hosted migrations.
- local development may use a convenience migrate command, but production-like
  deploy uses an explicit migration command.
- migration state must be observable through a safe health/readiness check or
  operational command without exposing connection strings.
- avoid relying on database extensions unless the migration creates/checks them
  explicitly and the dependency is documented.

Use Prisma Migrate for baseline schema history, but keep hand-edited SQL where
Postgres-specific constraints, partial indexes, or lock semantics need exact
control.

## Outbox Claim Algorithm

Use one atomic Postgres operation:

```sql
UPDATE outbox_events
SET
  status = 'processing',
  attempts = attempts + 1,
  locked_by = $worker_id,
  locked_until = now() + $lease_duration::interval,
  claim_token = $claim_token,
  updated_at = now()
WHERE id IN (
  SELECT id
  FROM outbox_events
  WHERE status = 'pending'
    AND next_attempt_at <= now()
    AND attempts < max_attempts
  ORDER BY next_attempt_at ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT $batch_size
)
RETURNING *;
```

Important details:

- use `FOR UPDATE SKIP LOCKED` for concurrent workers.
- never claim events in memory after a non-locking select.
- keep claim batch size configurable.
- keep lease duration configurable.
- worker identity must be stable for process lifetime.
- stale `processing` events become `pending` only after `locked_until < now()`.
- generate a fresh claim token for every claim batch or event.
- mark-completed, mark-retry, and mark-dead-letter SQL must include
  `id + locked_by + claim_token` predicates.
- stale recovery must clear `locked_by`, `locked_until`, and `claim_token`.
- if stale recovery finds `attempts >= max_attempts`, move the event to
  `dead-lettered` instead of making it pending again.

## Retry Policy

Default policy:

```text
attempt 1: immediate
attempt 2: 30 seconds
attempt 3: 2 minutes
attempt 4: 10 minutes
attempt 5+: min(1 hour, exponential backoff)
```

Add jitter to avoid synchronized retry bursts.

Retry stores only safe error fields:

- `code`
- `category`
- `message`
- `retryable`

Raw provider errors, stack traces, tokens, SQL messages, and plaintext content
must not be stored.

Attempt counting rule:

- `attempts` counts started processing attempts, not only failed handler calls.
- claim moves `attempts` from `0` to `1` for the first processing attempt.
- retry delay is calculated from the current attempt count.
- crash-before-handler and crash-during-handler are still bounded by
  `maxAttempts` after stale recovery.

## Idempotency Rules

Phase 4 idempotency is database-backed, but provider-level deduplication starts
in later connector phases.

- `idempotencyKey` must be deterministic for the logical action request, not a
  random per-call value.
- duplicate append under concurrency is resolved by the unique database
  constraint.
- duplicate append behavior must be explicit: return existing compatible event
  or return a safe conflict when payload/content hash differs.
- outbox handlers receive the idempotency key and future connector phases must
  use it for update-or-create markers or provider-native idempotency where
  available.
- audit/dead-letter records must not contain enough raw payload to reconstruct
  sensitive content.

## Transaction Rules

Every future request that records side-effect intent must:

1. validate input and authorization in application use case.
2. open one transaction through `TransactionRunner`.
3. write canonical state.
4. store encrypted content if needed.
5. append outbox event with content reference/hash.
6. commit.
7. return without performing external side effects.

Rollback must leave no orphaned outbox/content rows.

## Worker Rules

Worker responsibilities in Phase 4:

- recover stale `processing` events.
- claim pending event batches.
- route event to registered in-process handlers.
- handle unknown event type/version by dead-lettering.
- mark completed events.
- mark retryable failures with next attempt.
- mark terminal failures as dead-lettered.
- treat zero-row completion/retry/dead-letter updates as stale claims.
- emit safe logs with correlation/request/event ids when available.

Worker non-goals in Phase 4:

- GitHub dispatch
- messenger dispatch
- billing dispatch
- external provider calls

Use fake handlers in tests to prove worker lifecycle without real providers.

Worker polling rules:

- empty polls should be debug-level or silent to avoid noisy logs.
- polling interval and batch size must be configurable.
- failed loops use bounded backoff with jitter.
- shutdown stops new claims first, then lets in-flight fake handlers finish
  within a timeout.
- Phase 4 handlers must be deterministic and side-effect-free, so retry tests
  prove lifecycle without touching external systems.

## Encryption Design

Recommended v1:

- Node `crypto` only, no external encryption dependency.
- master key loaded from env as base64.
- per-content random data encryption key.
- content encrypted with AES-256-GCM.
- data key wrapped/encrypted by the master key.
- `sha256` stored for integrity/reference checks.
- auth tag and nonce stored separately.

Config:

```text
CONTROL_PLANE_DATABASE_URL
CONTROL_PLANE_DATABASE_SSL_MODE
CONTROL_PLANE_ENCRYPTION_MASTER_KEY
CONTROL_PLANE_PERSISTENCE_ENABLED
CONTROL_PLANE_OUTBOX_WORKER_ENABLED
CONTROL_PLANE_OUTBOX_BATCH_SIZE
CONTROL_PLANE_OUTBOX_LEASE_SECONDS
CONTROL_PLANE_OUTBOX_POLL_INTERVAL_MS
CONTROL_PLANE_OUTBOX_MAX_ATTEMPTS
```

Hosted mode must fail fast if database URL or encryption master key is missing.
Local-disabled mode may boot without DB only if DB-backed features are disabled.

Encryption key rules:

- accept master key only through secret config, never through public config
  summaries.
- validate base64 decoding and exact 32-byte key length at startup when
  persistence is enabled.
- include `keyRef` on every content row to support later rotation/rewrap.
- do not implement cloud KMS in Phase 4, but keep the port shape compatible
  with replacing env-loaded master keys later.

## Observability

Add low-noise operational signals:

- startup logs show persistence enabled/disabled and outbox worker enabled/
  disabled, never database URLs or key material.
- health/readiness can report database connectivity and migration availability
  as booleans/status labels, not raw env values.
- worker logs include event id, event type, event version, attempt, claim token
  presence, worker id, and safe error code/category.
- claim loop logs batch counts and state transitions, not one info log per empty
  poll.
- dead-letter events are easy to query by event type/version/error code.
- transaction failures surface as safe errors through the Phase 3 public error
  contract.

Metrics can be log-derived in Phase 4; do not add a metrics dependency unless a
later observability phase chooses one.

## Architecture Guardrails

Update `architecture:check`:

- keep shared dependency-free.
- continue forbidding Prisma/pg/Nest in domain/application.
- allow Prisma/pg only in:
  - `packages/platform/database/src/**`
  - `packages/features/*/src/infrastructure/**`
  - database migration/config scripts explicitly owned by Phase 4
  - tests
- forbid external provider SDKs in Phase 4.
- forbid raw external action content in outbox/audit field names where practical.
- forbid feature infrastructure imports across bounded contexts.
- ensure feature public exports remain explicit.
- replace the temporary "Prisma starts in persistence phase" dependency block
  with a Phase-aware allowlist, not a blanket dependency ban.
- keep `platform/database` forbidden from importing feature packages.

Add regression tests:

- domain importing Prisma fails.
- application importing Prisma fails.
- shared declaring dependency fails.
- feature infrastructure importing another feature infrastructure fails.
- outbox package exporting private layers fails.

## Implementation Steps

### Step 0 - Phase 4 Readiness ADRs

Write the compact ADR notes listed in [Decision Gates Before Code](#decision-gates-before-code).

Verification:

- exact DB dependency versions are re-checked and pinned.
- migration commands are documented before the first migration lands.
- local-disabled and hosted mode behavior is specified in config tests.
- no code imports Prisma/pg yet.

### Step 1 - Database Platform

Create:

```text
packages/platform/database
```

Add:

- Prisma schema and migration command.
- `DatabaseModule`.
- `DatabaseClient` adapter.
- `TransactionRunner` implementation.
- config parsing for DB env.
- safe health summary fields only.

Verification:

- package builds.
- config fails fast in hosted mode without DB URL.
- local-disabled mode starts without DB URL when persistence is disabled.
- no Prisma imports outside allowed infrastructure.
- transaction context is opaque and rejected after commit/rollback.

### Step 2 - Crypto Platform

Create:

```text
packages/platform/crypto
```

Add:

- envelope encryption port.
- Node crypto adapter.
- key reference metadata.
- tests for encrypt/decrypt/hash/shred semantics.

Verification:

- plaintext never appears in persisted fixture output.
- wrong key/auth tag fails closed.
- safe errors are returned.

### Step 3 - External Action Content Feature

Create:

```text
packages/features/external-action-content
```

Add:

- content domain model.
- store/load/shred use cases.
- repository port.
- Prisma repository adapter.
- Nest module wiring.

Verification:

- store + load roundtrip.
- expired content cannot be loaded for dispatch.
- shredded content cannot be decrypted.

### Step 4 - Outbox Feature

Create:

```text
packages/features/outbox
```

Add:

- outbox domain model.
- writer and claimer ports.
- append/claim/complete/retry/dead-letter use cases.
- Prisma repository adapter.
- worker runner.
- fake handler registry for tests.

Verification:

- append inside transaction.
- duplicate idempotency key returns existing or conflicts deterministically.
- concurrent workers claim distinct events.
- stale claim token cannot complete/retry/dead-letter a re-claimed event.
- stale processing recovers.
- unknown version dead-letters.

### Step 5 - Worker Integration

Wire outbox worker into `apps/worker` behind config.

Phase 4 worker can process fake/no-op event handlers only. Real provider
dispatch begins later.

Verification:

- worker smoke still works without DB in local-disabled mode.
- DB-enabled smoke claims and completes a fake event.
- SIGTERM stops polling without losing claimed events.

### Step 6 - Documentation And Runbooks

Add docs:

- migration runbook.
- outbox worker operational runbook.
- encryption and retention policy.
- local DB setup.
- dead-letter recovery procedure.

### Step 7 - DB Test And CI Harness

Add a real-Postgres integration test path without making unit tests depend on a
developer's local database.

Recommended v1:

- `docker compose` service or documented local Postgres URL.
- `CONTROL_PLANE_TEST_DATABASE_URL` for DB integration tests.
- `test:db` fails clearly when CI expects DB tests but the URL is absent.
- local unit tests remain runnable without Postgres.

Avoid Testcontainers in Phase 4 unless Docker Compose becomes a concrete
blocker; it would add another external dependency before the basic DB contract
is proven.

## Test Plan

Unit tests:

- outbox status transitions.
- claim token/fencing state transitions.
- retry/backoff calculation.
- dead-letter transition.
- lock lease validity.
- envelope encryption roundtrip.
- safe error conversion for DB/encryption errors.

Integration tests:

- migrations apply to empty database.
- migration command does not run automatically on app boot.
- transaction rollback removes outbox/content writes.
- append event inside transaction.
- `FOR UPDATE SKIP LOCKED` claim split across concurrent workers.
- stale worker with old `claimToken` cannot mark completed after re-claim.
- stale processing recovery.
- final stale processing attempt becomes dead-lettered instead of looping.
- idempotency uniqueness.
- encrypted content store/load/shred.
- dead-letter rows contain no plaintext.
- database fixture grep does not find sample plaintext after content storage.

Architecture tests:

- domain/application cannot import Prisma/pg/Nest.
- shared remains dependency-free.
- external SDKs still forbidden.
- only infrastructure/platform packages can import DB clients.
- platform/database cannot import feature packages.
- Prisma/pg are allowed only in the explicit Phase 4 allowlist.

Smoke tests:

- API still starts in local-disabled mode.
- worker still starts in local-disabled mode.
- local-disabled smoke does not require DB URL or encryption master key.
- DB-enabled worker processes fake outbox event.

Recommended commands:

```bash
pnpm --dir control-plane install --frozen-lockfile
pnpm --dir control-plane architecture:check
pnpm --dir control-plane lint
pnpm --dir control-plane typecheck
pnpm --dir control-plane test
pnpm --dir control-plane build
pnpm --dir control-plane api:smoke
pnpm --dir control-plane api:smoke:dist
pnpm --dir control-plane worker:smoke
pnpm --dir control-plane worker:smoke:dist
```

Run these from the control-plane package scope. Do not use root workspace
commands as the primary Phase 4 proof unless a change intentionally touches the
Electron app or root workspace wiring.

Add DB-specific scripts during implementation:

```bash
pnpm --dir control-plane db:migrate
pnpm --dir control-plane db:test:prepare
pnpm --dir control-plane test:db
pnpm --dir control-plane worker:smoke:db
```

## Edge Cases

- API request succeeds but transaction commit fails: no outbox event exists,
  response must be safe 5xx.
- canonical state write succeeds but outbox append fails: transaction rolls back.
- content row write succeeds but outbox append fails: transaction rolls back.
- worker claims event and crashes before dispatch: lease expires and event
  becomes claimable.
- worker A lease expires, worker B reclaims, worker A later finishes: worker A
  completion update must affect zero rows because claim token changed.
- worker dispatch succeeds but completion write fails: later phases need
  provider-level idempotency/update-or-create markers.
- unknown event type/version: dead-letter, do not drop.
- decryption failure: dead-letter, never regenerate content.
- expired content: dead-letter or cancel with safe error.
- duplicate idempotency key under concurrency: one winner, deterministic return.
- DB clock skew: use database `now()` for claim/lease SQL.
- long transaction: keep request transactions short, never call external
  providers inside them.
- migration partially applied: migration tool must fail fast before app starts.
- DB unavailable in local-disabled mode: API/worker still boot with persistence
  disabled and expose safe degraded status.
- DB unavailable in hosted mode: API/worker fail fast or readiness fails before
  accepting integration traffic.
- encryption master key changes accidentally: decrypt fails safe; do not
  rewrite/shred content automatically.
- content is shredded before completion is persisted: worker must surface safe
  terminal failure and runbook must explain recovery.
- duplicate dead-letter write under concurrent stale recovery: unique
  `outbox_event_id` keeps one terminal record.
- lock owner pauses longer than lease: fencing token prevents stale owner from
  committing guarded maintenance work.

## Security And Privacy Requirements

- never store raw external action content in outbox payload or audit metadata.
- never log plaintext content.
- never store raw provider errors.
- dead-letter stores safe summaries only.
- encryption master key is never logged or exposed in config summary.
- `safeDetails` remain primitive and non-secret.
- DB URL must be redacted in logs.
- audit metadata must be allowlisted, not arbitrary request bodies.

## Rollback / Kill Switch

Phase 4 needs narrow operational off switches:

- `CONTROL_PLANE_PERSISTENCE_ENABLED=false` disables DB-backed features in
  local-disabled mode and keeps API/worker bootable.
- `CONTROL_PLANE_OUTBOX_WORKER_ENABLED=false` prevents new claims while leaving
  API persistence available.
- worker shutdown stops claiming first, then waits for in-flight claimed work to
  finish or time out.
- no hosted deployment should auto-run migrations during app rollback; migration
  rollback is a separate operator action.
- additive migrations are preferred so app rollback can run against the newer
  schema during Phase 4.
- dead-letter and outbox tables are append/status based; do not physically
  delete failed operational evidence during rollback.

If Phase 4 causes instability, the intended rollback path is: disable outbox
worker, stop new persistence-backed integration traffic, inspect dead letters
and processing leases, then roll back application code. Database down migrations
are a last resort, not the default rollback.

## Done Criteria

Phase 4 is complete when:

- database platform package exists and builds.
- migrations create all Phase 4 tables.
- transaction runner is used by outbox/content writes.
- outbox append and content store can commit atomically.
- outbox worker can claim, retry, recover stale, complete, and dead-letter.
- stale claim completion is prevented by claim token/fencing checks.
- encrypted content can be stored, loaded, and shredded.
- DB-backed idempotency is proven by tests.
- local-disabled mode works without database and encryption secrets.
- no in-memory lock is required for correctness.
- architecture checker enforces DB dependency boundaries.
- docs explain migration, worker, encryption, and dead-letter operations.
- full control-plane verification passes.

## Suggested Commit Split

1. `docs(control-plane): record phase four persistence decisions`
2. `feat(control-plane): add database platform foundation`
3. `feat(control-plane): add envelope encryption platform`
4. `feat(control-plane): add external action content storage`
5. `feat(control-plane): add outbox domain and repositories`
6. `feat(control-plane): add outbox worker lifecycle`
7. `test(control-plane): cover persistence outbox and lock behavior`
8. `docs(control-plane): document persistence and outbox operations`

Keep commits small enough that every one can pass `architecture:check`,
`typecheck`, and focused tests.
