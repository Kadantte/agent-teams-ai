import type { TargetPolicySubjectKind } from "@agent-teams-control-plane/features-integration-targets";
import {
  createSafeError,
  isSafeError,
  parseWorkspaceId,
  SystemClock,
  toSafeError,
  type Clock,
} from "@agent-teams-control-plane/shared";
import {
  normalizeTargetPolicySubjectId,
  parseIntegrationTargetId,
} from "@agent-teams-control-plane/features-integration-targets";

import {
  mapCapabilityToGitHubPermissions,
  permissionSummary,
  toGitHubRepositoryJsonId,
  validateIssuedTokenScope,
  type GitHubInstallationTokenLease,
} from "../../domain/index.js";
import type { GitHubInstallationTokenIssuer } from "../ports/github-installation-token-issuer.port.js";
import type {
  GitHubTokenBrokerAbuseControlPolicy,
  GitHubTokenBrokerAuditLog,
  GitHubTokenBrokerFeatureGatePolicy,
} from "../ports/policies.js";
import type {
  GitHubTokenTargetAuthorizationInput,
  GitHubTokenTargetAuthorizationPort,
  GitHubTokenTargetAuthorizationResult,
} from "../ports/target-authorization.port.js";

export type IssueGitHubInstallationTokenInput = Readonly<{
  workspaceId: string;
  targetId: string;
  capability: string;
  subjectKind: TargetPolicySubjectKind;
  subjectId: string;
  desktopClientSubjectId?: string;
  teamSubjectId?: string;
  agentSubjectId?: string;
  correlationId?: string;
}>;

export class IssueGitHubInstallationTokenUseCase {
  public constructor(
    private readonly featureGate: GitHubTokenBrokerFeatureGatePolicy,
    private readonly targetAuthorization: GitHubTokenTargetAuthorizationPort,
    private readonly abuseControl: GitHubTokenBrokerAbuseControlPolicy,
    private readonly tokenIssuer: GitHubInstallationTokenIssuer,
    private readonly auditLog: GitHubTokenBrokerAuditLog,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    input: IssueGitHubInstallationTokenInput,
  ): Promise<GitHubInstallationTokenLease> {
    await this.featureGate.assertEnabled("github-token-broker");
    const workspaceId = parseWorkspaceId(input.workspaceId);
    if (!workspaceId.ok) {
      throw workspaceId.error;
    }
    const targetId = parseIntegrationTargetId(input.targetId);
    const subjectId = normalizeTokenSubjectId(input);
    const permissions = mapCapabilityToGitHubPermissions(input.capability);
    const nowMs = this.clock.nowMs();
    let auditScope:
      | {
          githubInstallationId?: string;
          repositoryCount?: number;
          permissionSummary?: Readonly<Record<string, string>>;
        }
      | undefined;

    try {
      const authorizationInput: GitHubTokenTargetAuthorizationInput = {
        capability: input.capability,
        nowMs,
        subjectId,
        subjectKind: input.subjectKind,
        targetId,
        workspaceId: workspaceId.value,
        ...(input.agentSubjectId === undefined
          ? {}
          : { agentSubjectId: input.agentSubjectId }),
        ...(input.desktopClientSubjectId === undefined
          ? {}
          : { desktopClientSubjectId: input.desktopClientSubjectId }),
        ...(input.teamSubjectId === undefined
          ? {}
          : { teamSubjectId: input.teamSubjectId }),
      };
      const authorization = await this.targetAuthorization.authorize(authorizationInput);
      if (!authorization.allowed || authorization.scope === undefined) {
        throw createSafeError({
          category: "authorization",
          code: authorization.reasonCode,
          message: "GitHub installation token request is not authorized.",
          safeDetails: {
            policyVersion: authorization.policyVersion ?? null,
          },
        });
      }

      const repositoryId = toGitHubRepositoryJsonId(
        authorization.scope.githubRepositoryId,
      );
      auditScope = {
        githubInstallationId: authorization.scope.githubInstallationId,
        permissionSummary: permissionSummary(permissions),
        repositoryCount: 1,
      };
      await this.abuseControl.assertAllowed({
        capability: input.capability,
        githubInstallationId: authorization.scope.githubInstallationId,
        workspaceId: workspaceId.value,
      });

      const issued = await this.tokenIssuer.issue({
        githubInstallationId: authorization.scope.githubInstallationId,
        nowMs,
        permissions,
        repositoryIds: [repositoryId],
        ...(input.correlationId === undefined
          ? {}
          : { correlationId: input.correlationId }),
      });
      const scopeError = validateIssuedTokenScope({
        requestedPermissions: permissions,
        requestedRepositoryIds: [repositoryId],
        ...(issued.grantedPermissions === undefined
          ? {}
          : { grantedPermissions: issued.grantedPermissions }),
        ...(issued.grantedRepositoryIds === undefined
          ? {}
          : { grantedRepositoryIds: issued.grantedRepositoryIds }),
      });
      if (scopeError !== undefined) {
        throw scopeError;
      }
      await this.assertAuthorizationStable({
        authorizationInput,
        initialPolicyVersion: authorization.policyVersion,
        initialScope: authorization.scope,
      });

      await this.auditLog.record({
        capability: input.capability,
        eventType: "github_token_broker.installation_token_requested",
        githubInstallationId: authorization.scope.githubInstallationId,
        integrationTargetId: targetId,
        permissionSummary: permissionSummary(permissions),
        repositoryCount: 1,
        status: "allowed",
        workspaceId: workspaceId.value,
        ...(input.correlationId === undefined
          ? {}
          : { correlationId: input.correlationId }),
      });

      return {
        expiresAtMs: issued.expiresAtMs,
        githubInstallationId: authorization.scope.githubInstallationId,
        permissions,
        repositoryIds: [repositoryId],
        token: issued.token,
      };
    } catch (error) {
      const safeError = isSafeError(error) ? error : toSafeError(error);
      try {
        await this.auditLog.record({
          capability: input.capability,
          eventType: "github_token_broker.installation_token_requested",
          integrationTargetId: targetId,
          safeErrorCode: safeError.code,
          status: safeError.category === "authorization" ? "denied" : "failed",
          workspaceId: workspaceId.value,
          ...(auditScope?.githubInstallationId === undefined
            ? {}
            : { githubInstallationId: auditScope.githubInstallationId }),
          ...(auditScope?.permissionSummary === undefined
            ? {}
            : { permissionSummary: auditScope.permissionSummary }),
          ...(auditScope?.repositoryCount === undefined
            ? {}
            : { repositoryCount: auditScope.repositoryCount }),
          ...(input.correlationId === undefined
            ? {}
            : { correlationId: input.correlationId }),
        });
      } catch {
        // Failure audit must not leak or replace the original safe broker failure.
      }
      throw safeError;
    }
  }

  private async assertAuthorizationStable(input: {
    authorizationInput: GitHubTokenTargetAuthorizationInput;
    initialPolicyVersion: number | undefined;
    initialScope: NonNullable<GitHubTokenTargetAuthorizationResult["scope"]>;
  }): Promise<void> {
    const latest = await this.targetAuthorization.authorize({
      ...input.authorizationInput,
      nowMs: this.clock.nowMs(),
    });
    if (
      latest.allowed &&
      latest.scope !== undefined &&
      latest.policyVersion === input.initialPolicyVersion &&
      sameTokenScope(latest.scope, input.initialScope)
    ) {
      return;
    }
    throw createSafeError({
      category: "authorization",
      code: "CONTROL_PLANE_GITHUB_TOKEN_POLICY_CHANGED",
      message: "GitHub installation token authorization changed before token use.",
      safeDetails: {
        currentPolicyVersion: latest.policyVersion ?? null,
        previousPolicyVersion: input.initialPolicyVersion ?? null,
        reasonCode: latest.reasonCode,
      },
    });
  }
}

function normalizeTokenSubjectId(input: IssueGitHubInstallationTokenInput): string {
  if (
    input.subjectKind === "desktop_client" &&
    input.desktopClientSubjectId !== undefined
  ) {
    return normalizeTargetPolicySubjectId({
      subjectId: input.desktopClientSubjectId,
      subjectKind: "desktop_client",
    });
  }
  return normalizeTargetPolicySubjectId({
    subjectId: input.subjectId,
    subjectKind: input.subjectKind,
  });
}

function sameTokenScope(
  left: NonNullable<GitHubTokenTargetAuthorizationResult["scope"]>,
  right: NonNullable<GitHubTokenTargetAuthorizationResult["scope"]>,
): boolean {
  return (
    left.githubInstallationId === right.githubInstallationId &&
    left.githubRepositoryId === right.githubRepositoryId &&
    left.integrationTargetId === right.integrationTargetId &&
    left.workspaceId === right.workspaceId
  );
}
