import { describe, expect, it } from "vitest";

import { createSafeError, toUnixMilliseconds } from "@agent-teams-control-plane/shared";

import type { GitHubActionRepository } from "../ports/github-action.repository.js";
import { GetGitHubActionStatusUseCase } from "./get-github-action-status.use-case.js";

describe("GetGitHubActionStatusUseCase", () => {
  it("returns a safe status read model with attempt count", async () => {
    const useCase = new GetGitHubActionStatusUseCase(repository());

    await expect(
      useCase.execute({
        actionRequestId: "action-1",
        actor: {
          credentialId: "credential-1",
          desktopClientId: "desktop-1" as never,
          workspaceId: "workspace-1" as never,
        },
      }),
    ).resolves.toEqual({
      actionRequestId: "action-1",
      actionType: "github.issue_comment.create",
      attemptCount: 2,
      githubUrl: "https://github.com/octo/repo/issues/1#issuecomment-1",
      safeFailure: {
        category: "external",
        code: "CONTROL_PLANE_GITHUB_ACTION_RATE_LIMITED",
        message: "rate limited",
        retryable: true,
      },
      status: "queued",
      targetId: "target-1",
    });
  });
});

function repository(): GitHubActionRepository {
  return {
    createQueued: async () => {
      throw new Error("unused");
    },
    findByIdempotency: async () => undefined,
    findForDispatch: async () => undefined,
    findStatus: async () => ({
      actionType: "github.issue_comment.create",
      assertedByDesktopClientId: "desktop-1" as never,
      attemptCount: 2,
      attribution: {
        agentDisplayName: "Review Agent",
      },
      createdAtMs: toUnixMilliseconds(0),
      externalContentIntegrityHash: "sha-1",
      externalContentRefId: "content-1" as never,
      githubUrl: "https://github.com/octo/repo/issues/1#issuecomment-1",
      id: "action-1" as never,
      idempotencyKey: "request-1",
      integrationTargetId: "target-1",
      requestedBySubjectId: "agent:reviewer",
      requestedBySubjectKind: "agent",
      safeError: createSafeError({
        category: "external",
        code: "CONTROL_PLANE_GITHUB_ACTION_RATE_LIMITED",
        message: "rate limited",
        retryable: true,
      }),
      status: "queued",
      updatedAtMs: toUnixMilliseconds(0),
      workspaceId: "workspace-1" as never,
    }),
    finishAttempt: async () => undefined,
    markDispatching: async () => undefined,
    markRetryableFailure: async () => undefined,
    markSucceeded: async () => undefined,
    markTerminalFailure: async () => undefined,
    recordAttemptStarted: async () => undefined,
  };
}
