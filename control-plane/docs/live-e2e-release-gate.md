# Live E2E Release Gate

This document is the Phase 11 release gate for the hosted GitHub App V1 path.
It turns the architecture and operations work into release evidence.

Public beta is blocked until the gate is green or every skipped scenario has an
accepted risk owner and expiry date.

## Scope

The gate proves:

- fresh desktop can connect to hosted control-plane
- GitHub App setup and claim works in a sandbox organization
- repository target enablement uses immutable GitHub repository ids
- trusted agent action creates GitHub-visible App output with attribution
- retries do not create duplicate public comments
- worker/outbox recovery is observable
- disabled/revoked/expired states fail closed
- artifacts and logs do not expose secrets or raw action content

The gate does not add new product behavior. It uses the Phase 9 desktop bridge
and the Phase 10 hosted operations foundation.

## Harness

Dry-run and artifact preflight:

```bash
CONTROL_PLANE_LIVE_E2E_ENVIRONMENT=staging \
CONTROL_PLANE_LIVE_E2E_BASE_URL=https://staging-control-plane.example.test \
CONTROL_PLANE_LIVE_E2E_GITHUB_OWNER=sandbox-org \
CONTROL_PLANE_LIVE_E2E_GITHUB_REPO=sandbox-repo \
CONTROL_PLANE_LIVE_E2E_SANDBOX_ALLOWLIST=sandbox-org/sandbox-repo \
CONTROL_PLANE_LIVE_E2E_EXPECTED_MODE=hosted-official-app \
CONTROL_PLANE_LIVE_E2E_EXPECTED_REVISION=<release revision> \
pnpm --dir control-plane live:e2e:github-app -- --dry-run
```

The harness:

- refuses production-looking hosts unless explicitly overridden
- refuses repos outside `CONTROL_PLANE_LIVE_E2E_SANDBOX_ALLOWLIST`
- writes a manifest before any mutation-capable step
- verifies `/health` and `/ready`
- checks API/readiness build revision parity
- records safe ids and timestamps only
- runs a forbidden-pattern redaction scan over the manifest
- blocks mutation mode until protected CI/manual operator steps are attached

Mutation mode is intentionally guarded:

```bash
pnpm --dir control-plane live:e2e:github-app -- --mutate
```

Use mutation mode only from protected staging CI or a maintainer shell after the
dry-run manifest is reviewed.

## Required Environment

| Key                                        | Required    | Notes                                       |
| ------------------------------------------ | ----------- | ------------------------------------------- |
| `CONTROL_PLANE_LIVE_E2E_ENVIRONMENT`       | yes         | `staging` or `beta`                         |
| `CONTROL_PLANE_LIVE_E2E_BASE_URL`          | yes         | HTTPS staging/beta control-plane URL        |
| `CONTROL_PLANE_LIVE_E2E_GITHUB_OWNER`      | yes         | sandbox owner only                          |
| `CONTROL_PLANE_LIVE_E2E_GITHUB_REPO`       | yes         | sandbox repo only                           |
| `CONTROL_PLANE_LIVE_E2E_SANDBOX_ALLOWLIST` | yes         | comma-separated `owner/repo` entries        |
| `CONTROL_PLANE_LIVE_E2E_EXPECTED_MODE`     | recommended | defaults to `hosted-official-app`           |
| `CONTROL_PLANE_LIVE_E2E_EXPECTED_REVISION` | recommended | release revision expected from `/health`    |
| `CONTROL_PLANE_LIVE_E2E_ARTIFACT_DIR`      | optional    | defaults to `artifacts/live-e2e/github-app` |
| `CONTROL_PLANE_LIVE_E2E_TIMEOUT_MS`        | optional    | 1000..120000                                |

Secrets such as desktop bearer tokens, GitHub tokens, OAuth codes, PKCE
verifiers, private keys, and raw action bodies are never written into the
manifest.

## Manifest

Manifest fields:

```json
{
  "artifactSchemaVersion": 1,
  "runId": "github-app-e2e-staging-...",
  "environment": "staging",
  "controlPlaneBaseUrl": "https://staging-control-plane.example.test",
  "githubOwner": "sandbox-org",
  "githubRepo": "sandbox-repo",
  "sandboxAllowlist": ["sandbox-org/sandbox-repo"],
  "dryRun": true,
  "redactionRules": ["desktop token", "bearer token"],
  "startedAt": "2026-01-01T00:00:00.000Z",
  "steps": []
}
```

Step statuses:

- `passed`
- `failed`
- `blocked`
- `skipped`

Every external mutation scenario must write a manifest step before the mutation
and after the observed result. If the harness crashes after a GitHub mutation,
resume from the manifest instead of creating a new logical action.

## Golden Path

### Setup And Pairing

Manual or guided desktop flow:

1. Start with fresh desktop hosted integration state.
2. Configure staging control-plane URL.
3. Bootstrap or pair desktop.
4. Start GitHub setup session.
5. Install staging GitHub App into sandbox organization.
6. Complete claim flow.
7. Return to desktop.
8. Verify connected state.
9. Verify repository availability snapshot.
10. Enable sandbox repository target.

Required evidence:

- setup status transitions
- workspace id and desktop client id
- setup session id
- connection id
- target id
- immutable GitHub repository id
- no OAuth code or PKCE verifier in logs/artifacts
- untrusted setup callback returns safe restart-required state

### Agent Issue Comment

Flow:

1. Submit trusted action envelope from desktop/runtime.
2. Wait for outbox dispatch.
3. Fetch GitHub issue comments.
4. Find exactly one system-owned marker for the run.
5. Verify visible agent and team attribution.
6. Verify action status is terminal `succeeded`.
7. Verify encrypted content cleanup/shred state where available.

Assertions:

- GitHub actor is the App bot.
- Backend status and GitHub-visible output agree.
- Marker is system-owned and unique.
- Raw body is not stored in artifact.
- Audit/status uses normalized `agent:` and `team:` subject ids.

### PR Conversation Comment

Flow:

1. Submit PR top-level conversation comment.
2. Wait for worker dispatch.
3. Fetch PR issue comments.
4. Verify marker and attribution.
5. Retry same idempotency key.
6. Verify only one matching marker exists.

Assertions:

- retry returns existing backend status
- no duplicate public comment
- PR belongs to selected target repository
- cleanup can identify output by marker/run id, not raw body matching

### PR Review And Check Run

Run only when enabled:

- PR review event is `COMMENT` only.
- No approve/request-changes action is available in V1.
- Check run has stable low-cardinality name.
- Check run stores GitHub `check_run_id` for updates.
- `external_id` is correlation metadata, not a uniqueness guarantee.

## Failure And Recovery

Required scenarios:

- desktop token revoked before setup status poll
- setup session expired before callback
- GitHub App installation removed after target enabled
- repository target disabled before action dispatch
- worker crash after claiming outbox event
- GitHub retry-after or secondary rate-limit response
- GitHub permission denied
- DB update failure after GitHub success
- hidden marker manually deleted
- encrypted content decryption failure
- duplicate setup callback delivery
- duplicate OAuth callback delivery
- stale setup session resumed after successful connection
- provider read-after-write initially misses created comment
- E2E process crash after external mutation but before manifest finalization
- repository display name changes after target enablement
- same-name repo exists in another installation or fork
- desktop sends raw agent/team id where backend expects normalized subject id
- raw body fits payload cap but rendered body exceeds attribution/footer cap
- body includes reserved `agent-teams-action` marker text
- token broker returns broader repository or permission scope than requested
- repository availability becomes stale before token issuance

Expected results:

- failures map to safe error codes
- policy failures do not retry forever
- retry-after controls next attempt time
- stale outbox claims recover
- duplicate public comments are avoided
- decryption failure fails closed
- dead-letter is auditable without raw body
- target policy is rechecked during worker dispatch
- rendered-body and reserved-marker failures happen before GitHub mutation
- token scope mismatch blocks dispatch before provider mutation

## Privacy And Redaction Gate

The release is blocked if any artifact contains:

- `agtcp_` desktop token prefix
- `Bearer `
- OAuth `code=`
- PKCE verifier/challenge
- GitHub installation token-like value
- PEM private key header
- raw action body
- raw webhook payload
- raw prompt

Scan inputs:

- harness stdout/stderr
- generated manifest
- selected app/control-plane log excerpts
- failure screenshots if any
- support bundles if generated

The manifest must record which redaction rules ran.

## Operator Checklist

Before marking Phase 11 green:

- Phase 9 desktop bridge commit is present.
- Phase 10 operations commit is present.
- Staging API and worker run the same revision.
- `hosted:smoke` passes against staging.
- `live:e2e:github-app -- --dry-run` passes against staging.
- GitHub App registration settings were reviewed after final deploy.
- Setup/pairing golden path evidence is attached.
- Issue comment evidence is attached.
- PR comment/idempotency evidence is attached.
- Worker crash recovery evidence is attached.
- Disabled target failure evidence is attached.
- Secret rotation drill evidence is attached or accepted as blocker.
- Backup/restore drill evidence is attached or accepted as blocker.
- Artifact redaction scan is clean.
- No critical/high gate findings remain open.
- Every skipped scenario has risk owner and expiry date.

## Accepted Evidence Format

A release evidence bundle should contain:

- dry-run manifest
- live mutation manifest
- GitHub sandbox URLs
- backend status ids
- outbox event ids
- safe correlation ids
- redaction scan result
- cleanup summary
- skipped-scenario risk notes

It must not contain secrets, raw action content, raw prompts, or raw webhook
payloads.

## Rollout Decision

Release decision:

- `green`: all required scenarios passed
- `yellow`: low/medium scenario deferred with owner and expiry
- `red`: critical/high scenario failed or missing

Public beta requires `green`. Internal dogfood can accept `yellow` only with a
named owner and a dated expiry.
