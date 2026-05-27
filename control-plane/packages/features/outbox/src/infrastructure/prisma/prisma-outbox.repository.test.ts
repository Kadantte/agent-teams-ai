import { describe, expect, it } from "vitest";

import { createSafeError, toUnixMilliseconds } from "@agent-teams-control-plane/shared";
import {
  PrismaTransactionRunner,
  type PrismaDatabaseClient,
} from "@agent-teams-control-plane/platform-database";

import type { ClaimedOutboxEvent } from "../../application/ports/outbox.repository.js";
import type { NewOutboxEvent } from "../../domain/outbox-event.js";
import { PrismaOutboxRepository } from "./prisma-outbox.repository.js";

describe("PrismaOutboxRepository", () => {
  it("dead-letters claimed events in the same database transaction", async () => {
    const operations: string[] = [];
    const repository = new PrismaOutboxRepository(
      fakeDatabaseClient({
        $transaction: async (work: (client: unknown) => Promise<unknown>) => {
          operations.push("transaction:start");
          const result = await work({
            deadLetterEvent: {
              upsert: async () => {
                operations.push("dead-letter:upsert");
              },
            },
            outboxEvent: {
              updateMany: async () => {
                operations.push("outbox:update");
                return { count: 1 };
              },
            },
          });
          operations.push("transaction:commit");
          return result;
        },
      }),
    );

    await expect(
      repository.markDeadLettered({
        event: claimedEvent(),
        safeError: createSafeError({
          category: "validation",
          code: "TEST_TERMINAL",
          message: "terminal",
        }),
      }),
    ).resolves.toBe("updated");
    expect(operations).toEqual([
      "transaction:start",
      "outbox:update",
      "dead-letter:upsert",
      "transaction:commit",
    ]);
  });

  it("appends with atomic insert-if-absent semantics before reading duplicates", async () => {
    const operations: string[] = [];
    const event = newOutboxEvent({ id: "event-2" as never });
    const row = {
      ...outboxRow({
        ...event,
        createdAt: new Date(0),
        id: "event-1" as never,
        updatedAt: new Date(0),
      }),
      maxAttempts: 10,
      nextAttemptAt: new Date(60_000),
    };
    const client = {
      outboxEvent: {
        createMany: async () => {
          operations.push("outbox:createMany");
          return { count: 0 };
        },
        findUnique: async () => {
          operations.push("outbox:findUnique");
          return row;
        },
      },
    };
    const repository = new PrismaOutboxRepository(fakeDatabaseClient(client));
    const runner = new PrismaTransactionRunner(
      fakeDatabaseClient({
        $transaction: async (work: (transactionClient: unknown) => Promise<unknown>) =>
          work(client),
      }),
    );

    const appended = await runner.runInTransaction((context) =>
      repository.append(event, context),
    );

    expect(appended.id).toBe("event-1");
    expect(operations).toEqual(["outbox:createMany", "outbox:findUnique"]);
  });

  it("rejects duplicate idempotency keys with different content", async () => {
    const event = newOutboxEvent({ payload: { body: "new" } });
    const client = {
      outboxEvent: {
        createMany: async () => ({ count: 0 }),
        findUnique: async () =>
          outboxRow({
            ...event,
            createdAt: new Date(0),
            id: "event-1" as never,
            payload: { body: "old" },
            updatedAt: new Date(0),
          }),
      },
    };
    const repository = new PrismaOutboxRepository(fakeDatabaseClient(client));
    const runner = new PrismaTransactionRunner(
      fakeDatabaseClient({
        $transaction: async (work: (transactionClient: unknown) => Promise<unknown>) =>
          work(client),
      }),
    );

    await expect(
      runner.runInTransaction((context) => repository.append(event, context)),
    ).rejects.toMatchObject({
      code: "CONTROL_PLANE_OUTBOX_IDEMPOTENCY_CONFLICT",
    });
  });

  it("uses a wide SQL type for explicit retry-after scheduling", async () => {
    let queryText = "";
    const queryValues: unknown[] = [];
    const repository = new PrismaOutboxRepository(
      fakeDatabaseClient({
        $transaction: async (work: (client: unknown) => Promise<unknown>) =>
          work({
            $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
              queryText = strings.join("?");
              queryValues.push(...values);
              return [
                outboxRow({
                  ...newOutboxEvent(),
                  createdAt: new Date(0),
                  updatedAt: new Date(0),
                }),
              ];
            },
          }),
      }),
    );

    await expect(
      repository.markFailedForRetry({
        claimToken: "claim-token",
        eventId: "event-1" as never,
        retryAfterMs: Number.MAX_SAFE_INTEGER,
        safeError: createSafeError({
          category: "external",
          code: "TEST_RATE_LIMITED",
          message: "rate limited",
          retryable: true,
        }),
        workerId: "worker-1",
      }),
    ).resolves.toBe("updated");

    expect(queryText).toContain("::double precision");
    expect(queryText).not.toContain("::integer");
    expect(queryValues).toContain(Number.MAX_SAFE_INTEGER);
  });

  it("does not consume attempts for deferred retries", async () => {
    let queryText = "";
    const queryValues: unknown[] = [];
    const repository = new PrismaOutboxRepository(
      fakeDatabaseClient({
        $transaction: async (work: (client: unknown) => Promise<unknown>) =>
          work({
            $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
              queryText = strings.join("?");
              queryValues.push(...values);
              return [
                outboxRow({
                  ...newOutboxEvent(),
                  createdAt: new Date(0),
                  updatedAt: new Date(0),
                }),
              ];
            },
          }),
      }),
    );

    await expect(
      repository.markFailedForRetry({
        claimToken: "claim-token",
        consumeAttempt: false,
        eventId: "event-1" as never,
        retryAfterMs: 60_000,
        safeError: createSafeError({
          category: "authorization",
          code: "TEST_PAUSED",
          message: "paused",
          retryable: true,
        }),
        workerId: "worker-1",
      }),
    ).resolves.toBe("updated");

    expect(queryText).toContain("GREATEST(attempts - 1, 0)");
    expect(queryValues).toContain(false);
  });
});

function fakeDatabaseClient(client: unknown): PrismaDatabaseClient {
  return {
    getClient: () => client,
  } as unknown as PrismaDatabaseClient;
}

function claimedEvent(): ClaimedOutboxEvent {
  return {
    attempts: 1,
    claimToken: "claim-token",
    createdAtMs: toUnixMilliseconds(0),
    id: "event-1" as never,
    idempotencyKey: "workspace:event",
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

function newOutboxEvent(overrides: Partial<NewOutboxEvent> = {}): NewOutboxEvent {
  return {
    id: "event-1" as never,
    idempotencyKey: "workspace:event",
    maxAttempts: 3,
    nextAttemptAtMs: toUnixMilliseconds(0),
    payload: {},
    type: "test.event",
    version: 1,
    ...overrides,
  };
}

function outboxRow(input: NewOutboxEvent & { createdAt: Date; updatedAt: Date }) {
  return {
    aggregateId: input.aggregateId ?? null,
    aggregateKind: input.aggregateKind ?? null,
    attempts: 0,
    claimToken: null,
    completedAt: null,
    contentIntegrityHash: input.contentIntegrityHash ?? null,
    contentRefId: input.contentRefId ?? null,
    createdAt: input.createdAt,
    deadLetteredAt: null,
    eventType: input.type,
    eventVersion: input.version,
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    lastErrorCategory: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorRetryable: null,
    lockedBy: null,
    lockedUntil: null,
    maxAttempts: input.maxAttempts,
    nextAttemptAt: new Date(input.nextAttemptAtMs),
    payloadJson: input.payload,
    status: "pending",
    updatedAt: input.updatedAt,
    workspaceId: input.workspaceId ?? null,
  };
}
