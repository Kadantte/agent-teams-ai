import type { DesktopClientActor } from "@agent-teams-control-plane/features-workspace-identity";
import {
  createSafeError,
  parseAgentActionId,
  type SafeError,
} from "@agent-teams-control-plane/shared";

import type { GitHubActionRepository } from "../ports/github-action.repository.js";

export type GetGitHubActionStatusInput = Readonly<{
  actor: DesktopClientActor;
  actionRequestId: string;
}>;

export type GitHubActionStatusView = Readonly<{
  actionRequestId: string;
  actionType: string;
  targetId: string;
  status: string;
  attemptCount: number;
  githubUrl?: string;
  safeFailure?: Pick<SafeError, "category" | "code" | "message" | "retryable">;
}>;

export class GetGitHubActionStatusUseCase {
  public constructor(private readonly repository: GitHubActionRepository) {}

  public async execute(
    input: GetGitHubActionStatusInput,
  ): Promise<GitHubActionStatusView> {
    const actionRequestId = parseAgentActionId(input.actionRequestId);
    if (!actionRequestId.ok) {
      throw actionRequestId.error;
    }
    const request = await this.repository.findStatus({
      actionRequestId: actionRequestId.value,
      workspaceId: input.actor.workspaceId,
    });
    if (request === undefined) {
      throw createSafeError({
        category: "not-found",
        code: "CONTROL_PLANE_GITHUB_ACTION_REQUEST_NOT_FOUND",
        message: "GitHub action request was not found.",
      });
    }
    return {
      actionRequestId: request.id,
      actionType: request.actionType,
      attemptCount: request.attemptCount ?? 0,
      status: request.status,
      targetId: request.integrationTargetId,
      ...(request.githubUrl === undefined ? {} : { githubUrl: request.githubUrl }),
      ...(request.safeError === undefined
        ? {}
        : {
            safeFailure: {
              category: request.safeError.category,
              code: request.safeError.code,
              message: request.safeError.message,
              retryable: request.safeError.retryable,
            },
          }),
    };
  }
}
