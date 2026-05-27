import { describe, expect, it } from "vitest";

import { createSafeError, FixedClock } from "@agent-teams-control-plane/shared";

import type {
  GitHubTokenBrokerAuditLog,
  GitHubTokenBrokerFeatureGatePolicy,
} from "../ports/policies.js";
import type { GitHubTokenTargetAuthorizationPort } from "../ports/target-authorization.port.js";
import { CheckGitHubTokenBrokerReadinessUseCase } from "./check-github-token-broker-readiness.use-case.js";
import { DryRunGitHubTokenScopeUseCase } from "./dry-run-github-token-scope.use-case.js";
import { IssueGitHubInstallationTokenUseCase } from "./issue-github-installation-token.use-case.js";

describe("github token broker use cases", () => {
  it("mints a narrowed token only after target policy and abuse checks allow it", async () => {
    const issuerInputs: unknown[] = [];
    const auditEvents: Array<Parameters<GitHubTokenBrokerAuditLog["record"]>[0]> = [];
    const useCase = new IssueGitHubInstallationTokenUseCase(
      enabledGate(),
      authorizedTarget("123456"),
      {
        assertAllowed: async () => undefined,
      },
      {
        issue: async (input) => {
          issuerInputs.push(input);
          return {
            expiresAtMs: 1_700_000_600_000 as never,
            grantedPermissions: { pull_requests: "write" },
            grantedRepositoryIds: [123456],
            token: "installation-token",
          };
        },
      },
      {
        record: async (event) => {
          auditEvents.push(event);
        },
      },
      new FixedClock(1_700_000_000_000),
    );

    const lease = await useCase.execute({
      capability: "github.pr_review.request",
      correlationId: "corr-1",
      desktopClientSubjectId: "desktop-client:desktop-1",
      subjectId: "agent:agent-1",
      subjectKind: "agent",
      targetId: "target-1",
      workspaceId: "workspace-1",
    });

    expect(issuerInputs).toEqual([
      expect.objectContaining({
        correlationId: "corr-1",
        githubInstallationId: "installation-1",
        permissions: { pull_requests: "write" },
        repositoryIds: [123456],
      }),
    ]);
    expect(lease).toMatchObject({
      githubInstallationId: "installation-1",
      permissions: { pull_requests: "write" },
      repositoryIds: [123456],
      token: "installation-token",
    });
    expect(auditEvents).toEqual([
      expect.objectContaining({
        capability: "github.pr_review.request",
        eventType: "github_token_broker.installation_token_requested",
        repositoryCount: 1,
        status: "allowed",
      }),
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain("installation-token");
  });

  it("blocks policy denies before GitHub HTTP and records a safe denial", async () => {
    let issuerCalls = 0;
    const auditEvents: Array<Parameters<GitHubTokenBrokerAuditLog["record"]>[0]> = [];
    const useCase = new IssueGitHubInstallationTokenUseCase(
      enabledGate(),
      {
        authorize: async () => ({
          allowed: false,
          policyVersion: 7,
          reasonCode: "CONTROL_PLANE_TARGET_POLICY_NO_MATCHING_ALLOW",
        }),
      },
      {
        assertAllowed: async () => undefined,
      },
      {
        issue: async () => {
          issuerCalls += 1;
          throw new Error("not used");
        },
      },
      {
        record: async (event) => {
          auditEvents.push(event);
        },
      },
      new FixedClock(1_700_000_000_000),
    );

    await expect(useCase.execute(baseInput())).rejects.toMatchObject({
      code: "CONTROL_PLANE_TARGET_POLICY_NO_MATCHING_ALLOW",
    });
    expect(issuerCalls).toBe(0);
    expect(auditEvents).toEqual([
      expect.objectContaining({
        safeErrorCode: "CONTROL_PLANE_TARGET_POLICY_NO_MATCHING_ALLOW",
        status: "denied",
      }),
    ]);
  });

  it("runs abuse control before GitHub HTTP", async () => {
    let issuerCalls = 0;
    const useCase = new IssueGitHubInstallationTokenUseCase(
      enabledGate(),
      authorizedTarget("123456"),
      {
        assertAllowed: async () => {
          throw createSafeError({
            category: "authorization",
            code: "CONTROL_PLANE_GITHUB_TOKEN_BROKER_RATE_LIMITED",
            message: "GitHub token broker request limit exceeded.",
            retryable: true,
          });
        },
      },
      {
        issue: async () => {
          issuerCalls += 1;
          throw new Error("not used");
        },
      },
      quietAuditLog(),
      new FixedClock(1_700_000_000_000),
    );

    await expect(useCase.execute(baseInput())).rejects.toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_BROKER_RATE_LIMITED",
    });
    expect(issuerCalls).toBe(0);
  });

  it("rejects broader scopes returned by GitHub before returning a lease", async () => {
    const useCase = new IssueGitHubInstallationTokenUseCase(
      enabledGate(),
      authorizedTarget("123456"),
      {
        assertAllowed: async () => undefined,
      },
      {
        issue: async () => ({
          expiresAtMs: 1_700_000_600_000 as never,
          grantedPermissions: { contents: "write" },
          grantedRepositoryIds: [123456, 999999],
          token: "broader-token",
        }),
      },
      quietAuditLog(),
      new FixedClock(1_700_000_000_000),
    );

    await expect(useCase.execute(baseInput())).rejects.toMatchObject({
      code: "CONTROL_PLANE_GITHUB_TOKEN_SCOPE_MISMATCH",
    });
  });

  it("records safe audit metadata even when token issuer throws a raw error", async () => {
    const auditEvents: Array<Parameters<GitHubTokenBrokerAuditLog["record"]>[0]> = [];
    const useCase = new IssueGitHubInstallationTokenUseCase(
      enabledGate(),
      authorizedTarget("123456"),
      {
        assertAllowed: async () => undefined,
      },
      {
        issue: async () => {
          throw new Error("network socket leaked a raw error");
        },
      },
      {
        record: async (event) => {
          auditEvents.push(event);
        },
      },
      new FixedClock(1_700_000_000_000),
    );

    await expect(useCase.execute(baseInput())).rejects.toThrow(
      "network socket leaked a raw error",
    );
    expect(auditEvents).toEqual([
      expect.objectContaining({
        safeErrorCode: "CONTROL_PLANE_INTERNAL_ERROR",
        status: "failed",
      }),
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain("network socket leaked");
  });

  it("dry-runs safe scope summaries without issuing tokens", async () => {
    const useCase = new DryRunGitHubTokenScopeUseCase(
      enabledGate(),
      authorizedTarget("123456"),
      new FixedClock(1_700_000_000_000),
    );

    await expect(useCase.execute(baseInput())).resolves.toEqual({
      allowed: true,
      permissionSummary: { issues: "write" },
      policyVersion: 3,
      reasonCode: "CONTROL_PLANE_GITHUB_TOKEN_SCOPE_ALLOWED",
      repositoryCount: 1,
    });
  });

  it("dry-run denies unsupported repository ids without GitHub HTTP", async () => {
    const useCase = new DryRunGitHubTokenScopeUseCase(
      enabledGate(),
      authorizedTarget("repo-name"),
      new FixedClock(1_700_000_000_000),
    );

    await expect(useCase.execute(baseInput())).resolves.toEqual({
      allowed: false,
      permissionSummary: { issues: "write" },
      policyVersion: 3,
      reasonCode: "CONTROL_PLANE_GITHUB_REPOSITORY_ID_UNSUPPORTED",
      repositoryCount: 0,
    });
  });

  it("reports broker readiness without minting a live token", async () => {
    const useCase = new CheckGitHubTokenBrokerReadinessUseCase(
      enabledGate(),
      {
        appJwtIssuer: () => "app-client-id",
        privateKey: () => undefined,
        readinessSnapshot: () => ({
          appClientIdConfigured: true,
          appIdConfigured: true,
          appSlugConfigured: true,
          mode: "hosted-official-app",
          privateKeyConfigured: false,
          publicBaseUrlConfigured: true,
          restApiVersionConfigured: true,
        }),
        restApiVersion: () => "2022-11-28",
      },
      {
        checkReadiness: async () => ({
          privateKeyConfigured: false,
          privateKeyParseable: false,
          safeErrorCode: "CONTROL_PLANE_GITHUB_PRIVATE_KEY_MISSING",
        }),
        sign: async () => {
          throw new Error("readiness must not mint a JWT");
        },
      },
    );

    await expect(useCase.execute()).resolves.toMatchObject({
      checks: expect.arrayContaining([
        {
          name: "private_key_configured",
          safeErrorCode: "CONTROL_PLANE_GITHUB_PRIVATE_KEY_MISSING",
          status: "fail",
        },
      ]),
      status: "not_ready",
    });
  });
});

function baseInput() {
  return {
    capability: "github.issue_comment.request",
    desktopClientSubjectId: "desktop-client:desktop-1",
    subjectId: "agent:agent-1",
    subjectKind: "agent" as const,
    targetId: "target-1",
    workspaceId: "workspace-1",
  };
}

function enabledGate(): GitHubTokenBrokerFeatureGatePolicy {
  return {
    assertEnabled: async () => undefined,
    isEnabled: () => true,
  };
}

function authorizedTarget(
  githubRepositoryId: string,
): GitHubTokenTargetAuthorizationPort {
  return {
    authorize: async (input) => ({
      allowed: true,
      policyVersion: 3,
      reasonCode: "CONTROL_PLANE_TARGET_POLICY_ALLOWED",
      scope: {
        githubInstallationId: "installation-1",
        githubRepositoryId,
        integrationTargetId: input.targetId,
        workspaceId: input.workspaceId,
      },
    }),
  };
}

function quietAuditLog(): GitHubTokenBrokerAuditLog {
  return {
    record: async () => undefined,
  };
}
