import { createSafeError } from "@agent-teams-control-plane/shared";

export type AgentGitHubActionsFeature = "agent-github-actions";

export interface AgentGitHubActionsFeatureGatePolicy {
  assertEnabled(feature: AgentGitHubActionsFeature): Promise<void>;
  isEnabled(feature: AgentGitHubActionsFeature): boolean;
}

export interface AgentGitHubActionsSettings {
  defaultAgentAvatarUrl(): string | undefined;
  agentAvatarAllowedOrigins(): readonly string[];
  externalContentRetentionDays(): number | undefined;
  githubGraphqlEndpoint(): string | undefined;
  githubRestApiVersion(): string | undefined;
}

export interface AgentGitHubActionsAuditLog {
  record(input: {
    eventType: string;
    workspaceId?: string;
    actionRequestId?: string;
    integrationTargetId?: string;
    actorKind: "desktop_client" | "system";
    actorId?: string;
    subjectKind?: string;
    subjectId?: string;
    status: "accepted" | "denied" | "queued" | "dispatching" | "succeeded" | "failed";
    safeErrorCode?: string;
    safeMetadata?: Readonly<Record<string, boolean | number | string | null>>;
    correlationId?: string;
  }): Promise<void>;
}

export function agentGitHubActionsFeatureDisabledError(
  feature: AgentGitHubActionsFeature,
) {
  return createSafeError({
    category: "authorization",
    code: "CONTROL_PLANE_FEATURE_DISABLED",
    message: "Control-plane feature is disabled.",
    safeDetails: { feature },
  });
}

export function agentGitHubActionsWorkerPausedError() {
  return createSafeError({
    category: "authorization",
    code: "CONTROL_PLANE_GITHUB_ACTIONS_WORKER_PAUSED",
    message: "GitHub action dispatch is paused by feature gate.",
    retryable: true,
    safeDetails: { feature: "agent-github-actions" },
  });
}
