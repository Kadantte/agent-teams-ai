import { describe, expect, it } from "vitest";

import type { ClaimedOutboxEvent } from "@agent-teams-control-plane/features-outbox";
import { toUnixMilliseconds } from "@agent-teams-control-plane/shared";

import {
  GITHUB_ACTION_DISPATCH_EVENT_TYPE,
  GITHUB_ACTION_DISPATCH_EVENT_VERSION,
} from "../../application/ports/github-action-outbox.port.js";
import type { DispatchGitHubActionUseCase } from "../../application/use-cases/dispatch-github-action.use-case.js";
import { GitHubActionDispatchHandler } from "./github-action-dispatch.handler.js";

describe("GitHubActionDispatchHandler", () => {
  it("passes missing content binding into the dispatch use case for terminal status handling", async () => {
    const calls: Array<Parameters<DispatchGitHubActionUseCase["execute"]>[0]> = [];
    const handler = new GitHubActionDispatchHandler({
      execute: async (input: Parameters<DispatchGitHubActionUseCase["execute"]>[0]) => {
        calls.push(input);
        return {
          kind: "dead-letter",
          safeError: {
            category: "validation",
            code: "CONTROL_PLANE_GITHUB_ACTION_OUTBOX_CONTENT_REFERENCE_REQUIRED",
            message:
              "GitHub action outbox event requires content reference and integrity hash.",
            retryable: false,
          },
        };
      },
    } as unknown as DispatchGitHubActionUseCase);

    await expect(
      handler.handle(claimedEvent({ withContentRef: false })),
    ).resolves.toMatchObject({
      error: {
        code: "CONTROL_PLANE_GITHUB_ACTION_OUTBOX_CONTENT_REFERENCE_REQUIRED",
      },
      kind: "dead-letter",
    });
    expect(calls).toEqual([
      {
        actionRequestId: "action-1",
        attemptNumber: 2,
      },
    ]);
  });

  it("rejects mismatched payload and aggregate action ids", async () => {
    let called = false;
    const handler = new GitHubActionDispatchHandler({
      execute: async () => {
        called = true;
        return { kind: "completed" };
      },
    } as unknown as DispatchGitHubActionUseCase);

    await expect(
      handler.handle(
        claimedEvent({
          aggregateId: "action-1",
          payload: { actionRequestId: "action-2" },
        }),
      ),
    ).resolves.toMatchObject({
      error: {
        code: "CONTROL_PLANE_GITHUB_ACTION_OUTBOX_ACTION_ID_MISMATCH",
      },
      kind: "dead-letter",
    });
    expect(called).toBe(false);
  });

  it("passes action id and content binding into the dispatch use case", async () => {
    const calls: Array<Parameters<DispatchGitHubActionUseCase["execute"]>[0]> = [];
    const handler = new GitHubActionDispatchHandler({
      execute: async (input: Parameters<DispatchGitHubActionUseCase["execute"]>[0]) => {
        calls.push(input);
        return { kind: "completed" };
      },
    } as unknown as DispatchGitHubActionUseCase);

    await expect(handler.handle(claimedEvent())).resolves.toEqual({
      kind: "completed",
    });
    expect(calls).toEqual([
      {
        actionRequestId: "action-1",
        attemptNumber: 2,
        contentIntegrityHash: "sha-1",
        contentRefId: "content-1",
      },
    ]);
  });

  it("defers worker-paused retries without consuming outbox attempts", async () => {
    const handler = new GitHubActionDispatchHandler({
      execute: async () => ({
        kind: "retry",
        retryAfterMs: 60_000,
        safeError: {
          category: "authorization",
          code: "CONTROL_PLANE_GITHUB_ACTIONS_WORKER_PAUSED",
          message: "paused",
          retryable: true,
        },
      }),
    } as unknown as DispatchGitHubActionUseCase);

    await expect(handler.handle(claimedEvent())).resolves.toMatchObject({
      consumeAttempt: false,
      kind: "retry",
      retryAfterMs: 60_000,
    });
  });
});

function claimedEvent(
  input: {
    withContentRef?: boolean;
    aggregateId?: string;
    payload?: ClaimedOutboxEvent["payload"];
  } = {},
): ClaimedOutboxEvent {
  return {
    aggregateId: input.aggregateId ?? "action-1",
    attempts: 2,
    claimToken: "claim-1",
    createdAtMs: toUnixMilliseconds(0),
    id: "event-1" as never,
    idempotencyKey: "github-action-dispatch:workspace-1:action-1",
    lockedBy: "worker-1",
    lockedUntilMs: toUnixMilliseconds(10_000),
    maxAttempts: 10,
    nextAttemptAtMs: toUnixMilliseconds(0),
    payload: input.payload ?? { actionRequestId: "action-1" },
    status: "processing",
    type: GITHUB_ACTION_DISPATCH_EVENT_TYPE,
    updatedAtMs: toUnixMilliseconds(0),
    version: GITHUB_ACTION_DISPATCH_EVENT_VERSION,
    workspaceId: "workspace-1" as never,
    ...(input.withContentRef === false
      ? {}
      : {
          contentIntegrityHash: "sha-1",
          contentRefId: "content-1" as never,
        }),
  };
}
