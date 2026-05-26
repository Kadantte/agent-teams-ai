import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import type { ControlPlaneConfigService } from "@agent-teams-control-plane/platform-config";
import type { ControlPlaneLogger } from "@agent-teams-control-plane/platform-logger";
import { PrismaDatabaseClient } from "@agent-teams-control-plane/platform-database";

import { PrismaOutboxRepository } from "./prisma-outbox.repository.js";

const databaseUrl = process.env.CONTROL_PLANE_TEST_DATABASE_URL;
const describeDb = databaseUrl === undefined ? describe.skip : describe;

describeDb("PrismaOutboxRepository DB integration", () => {
  let primaryDatabase: PrismaDatabaseClient;
  let secondaryDatabase: PrismaDatabaseClient;
  let primaryRepository: PrismaOutboxRepository;
  let secondaryRepository: PrismaOutboxRepository;

  beforeAll(async () => {
    primaryDatabase = createDatabaseClient();
    secondaryDatabase = createDatabaseClient();
    await primaryDatabase.connect();
    await secondaryDatabase.connect();
    primaryRepository = new PrismaOutboxRepository(primaryDatabase);
    secondaryRepository = new PrismaOutboxRepository(secondaryDatabase);
  });

  afterAll(async () => {
    await primaryDatabase?.disconnect();
    await secondaryDatabase?.disconnect();
  });

  it("claims distinct outbox rows across independent database clients", async () => {
    const eventIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

    try {
      await primaryDatabase.getClient().outboxEvent.createMany({
        data: eventIds.map((id) =>
          outboxCreateData({
            id,
            idempotencyKey: `db-test:${id}`,
            nextAttemptAt: new Date(Date.now() - 60_000),
          }),
        ),
      });

      const [batchA, batchB] = await Promise.all([
        primaryRepository.claimNextBatch({
          batchSize: 2,
          leaseSeconds: 30,
          workerId: "worker-a",
        }),
        secondaryRepository.claimNextBatch({
          batchSize: 2,
          leaseSeconds: 30,
          workerId: "worker-b",
        }),
      ]);
      const claimedIds = [...batchA, ...batchB].map((event) => event.id);

      expect(batchA).toHaveLength(2);
      expect(batchB).toHaveLength(2);
      expect(new Set(claimedIds).size).toBe(4);
      expect([...claimedIds].sort()).toEqual([...eventIds].sort());
    } finally {
      await cleanupOutboxRows(eventIds);
    }
  });

  it("prevents stale completion after an event is re-claimed", async () => {
    const eventId = randomUUID();

    try {
      await primaryDatabase.getClient().outboxEvent.create({
        data: outboxCreateData({
          id: eventId,
          idempotencyKey: `db-test:${eventId}`,
          nextAttemptAt: new Date(Date.now() - 60_000),
        }),
      });

      const [firstClaim] = await primaryRepository.claimNextBatch({
        batchSize: 1,
        leaseSeconds: 30,
        workerId: "worker-a",
      });
      if (firstClaim === undefined) {
        throw new Error("Expected worker-a to claim the seeded event.");
      }

      await primaryDatabase.getClient().outboxEvent.update({
        data: {
          claimToken: null,
          lockedBy: null,
          lockedUntil: null,
          nextAttemptAt: new Date(Date.now() - 60_000),
          status: "pending",
        },
        where: { id: eventId },
      });

      const [secondClaim] = await secondaryRepository.claimNextBatch({
        batchSize: 1,
        leaseSeconds: 30,
        workerId: "worker-b",
      });
      if (secondClaim === undefined) {
        throw new Error("Expected worker-b to re-claim the seeded event.");
      }

      await expect(
        primaryRepository.markCompleted({
          claimToken: firstClaim.claimToken,
          eventId: firstClaim.id,
          workerId: firstClaim.lockedBy,
        }),
      ).resolves.toBe("stale-claim");
      await expect(
        primaryDatabase.getClient().outboxEvent.findUniqueOrThrow({
          select: {
            attempts: true,
            claimToken: true,
            completedAt: true,
            lockedBy: true,
            status: true,
          },
          where: { id: eventId },
        }),
      ).resolves.toEqual({
        attempts: 2,
        claimToken: secondClaim.claimToken,
        completedAt: null,
        lockedBy: "worker-b",
        status: "processing",
      });
    } finally {
      await cleanupOutboxRows([eventId]);
    }
  });

  it("recovers stale processing rows and writes final dead letters atomically", async () => {
    const retryableId = randomUUID();
    const exhaustedId = randomUUID();

    try {
      await primaryDatabase.getClient().outboxEvent.createMany({
        data: [
          outboxCreateData({
            attempts: 1,
            claimToken: "retryable-claim",
            id: retryableId,
            idempotencyKey: `db-test:${retryableId}`,
            lockedBy: "worker-a",
            lockedUntil: new Date(Date.now() - 60_000),
            maxAttempts: 3,
            status: "processing",
          }),
          outboxCreateData({
            attempts: 3,
            claimToken: "exhausted-claim",
            id: exhaustedId,
            idempotencyKey: `db-test:${exhaustedId}`,
            lockedBy: "worker-a",
            lockedUntil: new Date(Date.now() - 60_000),
            maxAttempts: 3,
            status: "processing",
          }),
        ],
      });

      await expect(primaryRepository.recoverStaleProcessing()).resolves.toBe(2);
      await expect(
        primaryDatabase.getClient().outboxEvent.findMany({
          select: {
            claimToken: true,
            deadLetteredAt: true,
            id: true,
            lockedBy: true,
            lockedUntil: true,
            status: true,
          },
          where: { id: { in: [retryableId, exhaustedId] } },
        }),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            claimToken: null,
            id: retryableId,
            lockedBy: null,
            lockedUntil: null,
            status: "pending",
          }),
          expect.objectContaining({
            claimToken: null,
            deadLetteredAt: expect.any(Date),
            id: exhaustedId,
            lockedBy: null,
            lockedUntil: null,
            status: "dead-lettered",
          }),
        ]),
      );
      await expect(
        primaryDatabase.getClient().deadLetterEvent.findUnique({
          where: { outboxEventId: exhaustedId },
        }),
      ).resolves.toMatchObject({
        attempts: 3,
        outboxEventId: exhaustedId,
      });
    } finally {
      await cleanupOutboxRows([retryableId, exhaustedId]);
    }
  });

  async function cleanupOutboxRows(eventIds: readonly string[]): Promise<void> {
    await primaryDatabase.getClient().deadLetterEvent.deleteMany({
      where: { outboxEventId: { in: [...eventIds] } },
    });
    await primaryDatabase.getClient().outboxEvent.deleteMany({
      where: { id: { in: [...eventIds] } },
    });
  }
});

function outboxCreateData(input: {
  id: string;
  idempotencyKey: string;
  attempts?: number;
  claimToken?: string;
  lockedBy?: string;
  lockedUntil?: Date;
  maxAttempts?: number;
  nextAttemptAt?: Date;
  status?: "pending" | "processing";
}) {
  return {
    attempts: input.attempts ?? 0,
    eventType: "db.test",
    eventVersion: 1,
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    maxAttempts: input.maxAttempts ?? 3,
    nextAttemptAt: input.nextAttemptAt ?? new Date(),
    payloadJson: {},
    status: input.status ?? "pending",
    ...(input.claimToken === undefined ? {} : { claimToken: input.claimToken }),
    ...(input.lockedBy === undefined ? {} : { lockedBy: input.lockedBy }),
    ...(input.lockedUntil === undefined ? {} : { lockedUntil: input.lockedUntil }),
  };
}

function createDatabaseClient(): PrismaDatabaseClient {
  return new PrismaDatabaseClient(fakeConfigService(), fakeLogger());
}

function fakeConfigService(): ControlPlaneConfigService {
  return {
    getConfig: () => ({
      database: {
        poolMax: 5,
        sslMode: "disable",
        url: databaseUrl,
      },
      persistence: {
        enabled: true,
      },
    }),
    getSafeSummary: () => ({
      database: {
        poolMax: 5,
        sslMode: "disable",
      },
    }),
  } as unknown as ControlPlaneConfigService;
}

function fakeLogger(): ControlPlaneLogger {
  return {
    child: () => fakeLogger(),
    debug: () => undefined,
    error: () => undefined,
    info: () => undefined,
    warn: () => undefined,
  };
}
