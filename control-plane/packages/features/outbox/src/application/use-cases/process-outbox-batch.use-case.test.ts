import { describe, expect, it } from "vitest";

import { createSafeError, toUnixMilliseconds } from "@agent-teams-control-plane/shared";

import type { OutboxHandlerRegistry } from "../ports/outbox-handler.js";
import type { ClaimedOutboxEvent, OutboxRepository } from "../ports/outbox.repository.js";
import { ProcessOutboxBatchUseCase } from "./process-outbox-batch.use-case.js";

describe("ProcessOutboxBatchUseCase", () => {
  it("dead-letters unknown event versions", async () => {
    const calls: string[] = [];
    const repository = createRepository(calls);
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => undefined,
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    const result = await useCase.execute({ batch: [claimedEvent()] });

    expect(result.deadLettered).toBe(1);
    expect(calls).toEqual(["dead-letter"]);
  });

  it("counts stale claim completion separately", async () => {
    const repository = createRepository([]);
    repository.markCompleted = async () => "stale-claim";
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => ({
        handle: async () => ({ kind: "completed" }),
      }),
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    const result = await useCase.execute({ batch: [claimedEvent()] });

    expect(result).toMatchObject({ completed: 0, staleClaims: 1 });
  });

  it("dead-letters thrown non-retryable safe errors", async () => {
    const calls: string[] = [];
    const repository = createRepository(calls);
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => ({
        handle: async () => {
          throw createSafeError({
            category: "validation",
            code: "TEST_TERMINAL",
            message: "terminal",
            retryable: false,
          });
        },
      }),
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    const result = await useCase.execute({ batch: [claimedEvent()] });

    expect(result).toMatchObject({ deadLettered: 1, retried: 0 });
    expect(calls).toEqual(["dead-letter"]);
  });

  it("retries unexpected thrown handler errors with a safe retryable error", async () => {
    const calls: string[] = [];
    const repository = createRepository(calls);
    let storedError: unknown;
    repository.markFailedForRetry = async (input) => {
      calls.push("retry");
      storedError = input.safeError;
      return "updated";
    };
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => ({
        handle: async () => {
          throw new Error("raw failure with implementation detail");
        },
      }),
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    const result = await useCase.execute({ batch: [claimedEvent()] });

    expect(result).toMatchObject({ deadLettered: 0, retried: 1 });
    expect(calls).toEqual(["retry"]);
    expect(storedError).toMatchObject({
      code: "CONTROL_PLANE_OUTBOX_HANDLER_FAILED",
      retryable: true,
    });
    expect(JSON.stringify(storedError)).not.toContain("implementation detail");
  });

  it("counts exhausted retry mutations as dead-lettered", async () => {
    const repository = createRepository([]);
    repository.markFailedForRetry = async () => "dead-lettered";
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => ({
        handle: async () => ({
          error: createSafeError({
            category: "external",
            code: "TEST_RETRYABLE",
            message: "retryable",
            retryable: true,
          }),
          kind: "retry",
        }),
      }),
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    const result = await useCase.execute({ batch: [claimedEvent()] });

    expect(result).toMatchObject({ deadLettered: 1, retried: 0 });
  });

  it("passes provider retry-after scheduling metadata to the repository", async () => {
    const repository = createRepository([]);
    let retryAfterMs: number | undefined;
    repository.markFailedForRetry = async (input) => {
      retryAfterMs = input.retryAfterMs;
      return "updated";
    };
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => ({
        handle: async () => ({
          error: createSafeError({
            category: "external",
            code: "TEST_RATE_LIMITED",
            message: "rate limited",
            retryable: true,
          }),
          kind: "retry",
          retryAfterMs: 120_000,
        }),
      }),
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    await useCase.execute({ batch: [claimedEvent()] });

    expect(retryAfterMs).toBe(120_000);
  });

  it("passes non-consuming retry metadata to the repository", async () => {
    const repository = createRepository([]);
    let consumeAttempt: boolean | undefined;
    repository.markFailedForRetry = async (input) => {
      consumeAttempt = input.consumeAttempt;
      return "updated";
    };
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => ({
        handle: async () => ({
          consumeAttempt: false,
          error: createSafeError({
            category: "authorization",
            code: "TEST_PAUSED",
            message: "paused",
            retryable: true,
          }),
          kind: "retry",
          retryAfterMs: 60_000,
        }),
      }),
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    await expect(useCase.execute({ batch: [claimedEvent()] })).resolves.toMatchObject({
      retried: 1,
    });

    expect(consumeAttempt).toBe(false);
  });

  it("dead-letters retry results that carry non-retryable safe errors", async () => {
    const calls: string[] = [];
    const repository = createRepository(calls);
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => ({
        handle: async () => ({
          error: createSafeError({
            category: "validation",
            code: "TEST_NOT_RETRYABLE",
            message: "not retryable",
            retryable: false,
          }),
          kind: "retry",
        }),
      }),
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    const result = await useCase.execute({ batch: [claimedEvent()] });

    expect(result).toMatchObject({ deadLettered: 1, retried: 0 });
    expect(calls).toEqual(["dead-letter"]);
  });

  it("sanitizes raw retry result errors as retryable handler failures", async () => {
    const calls: string[] = [];
    const repository = createRepository(calls);
    let storedError: unknown;
    repository.markFailedForRetry = async (input) => {
      calls.push("retry");
      storedError = input.safeError;
      return "updated";
    };
    const handlers: OutboxHandlerRegistry = {
      getHandler: () => ({
        handle: async () => ({
          error: new Error("raw retry result detail"),
          kind: "retry",
        }),
      }),
    };
    const useCase = new ProcessOutboxBatchUseCase(repository, handlers);

    const result = await useCase.execute({ batch: [claimedEvent()] });

    expect(result).toMatchObject({ deadLettered: 0, retried: 1 });
    expect(calls).toEqual(["retry"]);
    expect(storedError).toMatchObject({
      code: "CONTROL_PLANE_OUTBOX_HANDLER_FAILED",
      retryable: true,
    });
    expect(JSON.stringify(storedError)).not.toContain("raw retry result detail");
  });
});

function createRepository(calls: string[]): OutboxRepository {
  return {
    append: async () => {
      throw new Error("unused");
    },
    claimNextBatch: async () => [],
    markCompleted: async () => {
      calls.push("complete");
      return "updated";
    },
    markDeadLettered: async () => {
      calls.push("dead-letter");
      return "updated";
    },
    markFailedForRetry: async () => {
      calls.push("retry");
      return "updated";
    },
    recoverStaleProcessing: async () => 0,
  };
}

function claimedEvent(): ClaimedOutboxEvent {
  return {
    attempts: 1,
    claimToken: "claim-token",
    createdAtMs: toUnixMilliseconds(0),
    id: "event-1" as never,
    idempotencyKey: "workspace:event",
    lastSafeError: createSafeError({
      category: "internal",
      code: "TEST",
      message: "test",
    }),
    lockedBy: "worker-1",
    lockedUntilMs: toUnixMilliseconds(1000),
    maxAttempts: 3,
    nextAttemptAtMs: toUnixMilliseconds(0),
    payload: {},
    status: "processing",
    type: "test.event",
    updatedAtMs: toUnixMilliseconds(0),
    version: 1,
  };
}
