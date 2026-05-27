import type {
  ClaimedOutboxEvent,
  OutboxEventHandler,
  OutboxHandlerResult,
} from "@agent-teams-control-plane/features-outbox";
import { createSafeError } from "@agent-teams-control-plane/shared";

import {
  GITHUB_ACTION_DISPATCH_EVENT_TYPE,
  GITHUB_ACTION_DISPATCH_EVENT_VERSION,
} from "../../application/ports/github-action-outbox.port.js";
import type { DispatchGitHubActionUseCase } from "../../application/use-cases/dispatch-github-action.use-case.js";

export class GitHubActionDispatchHandler implements OutboxEventHandler {
  public constructor(
    private readonly dispatchGitHubAction: DispatchGitHubActionUseCase,
  ) {}

  public async handle(event: ClaimedOutboxEvent): Promise<OutboxHandlerResult> {
    if (
      event.type !== GITHUB_ACTION_DISPATCH_EVENT_TYPE ||
      event.version !== GITHUB_ACTION_DISPATCH_EVENT_VERSION
    ) {
      return {
        error: createSafeError({
          category: "validation",
          code: "CONTROL_PLANE_GITHUB_ACTION_OUTBOX_EVENT_UNSUPPORTED",
          message: "GitHub action outbox event is not supported.",
        }),
        kind: "dead-letter",
      };
    }
    const actionRequestId =
      typeof event.payload.actionRequestId === "string"
        ? event.payload.actionRequestId
        : event.aggregateId;
    if (
      typeof event.payload.actionRequestId === "string" &&
      event.aggregateId !== undefined &&
      event.payload.actionRequestId !== event.aggregateId
    ) {
      return {
        error: createSafeError({
          category: "conflict",
          code: "CONTROL_PLANE_GITHUB_ACTION_OUTBOX_ACTION_ID_MISMATCH",
          message: "GitHub action outbox payload does not match its aggregate id.",
        }),
        kind: "dead-letter",
      };
    }
    if (actionRequestId === undefined) {
      return {
        error: createSafeError({
          category: "validation",
          code: "CONTROL_PLANE_GITHUB_ACTION_OUTBOX_PAYLOAD_INVALID",
          message: "GitHub action outbox payload is invalid.",
        }),
        kind: "dead-letter",
      };
    }
    const result = await this.dispatchGitHubAction.execute({
      actionRequestId,
      attemptNumber: event.attempts,
      ...(event.contentIntegrityHash === undefined
        ? {}
        : { contentIntegrityHash: event.contentIntegrityHash }),
      ...(event.contentRefId === undefined ? {} : { contentRefId: event.contentRefId }),
    });
    if (result.kind === "completed") {
      return { kind: "completed" };
    }
    if (result.kind === "retry") {
      return {
        error: result.safeError,
        kind: "retry",
        ...(result.safeError.code === "CONTROL_PLANE_GITHUB_ACTIONS_WORKER_PAUSED"
          ? { consumeAttempt: false }
          : {}),
        ...(result.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: result.retryAfterMs }),
      };
    }
    return {
      error: result.safeError,
      kind: "dead-letter",
    };
  }
}
