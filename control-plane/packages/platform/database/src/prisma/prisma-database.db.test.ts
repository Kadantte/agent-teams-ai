import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

const databaseUrl = process.env.CONTROL_PLANE_TEST_DATABASE_URL;
const describeDb = databaseUrl === undefined ? describe.skip : describe;

describeDb("Phase 4 database schema", () => {
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    if (databaseUrl === undefined) {
      throw new Error("CONTROL_PLANE_TEST_DATABASE_URL is required.");
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
      errorFormat: "minimal",
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("has the Phase 4 outbox and content tables after migrations", async () => {
    if (prisma === undefined) {
      throw new Error("Prisma client was not initialized.");
    }
    const rows = await prisma.$queryRaw<readonly { table_name: string | null }[]>`
      SELECT to_regclass('public.outbox_events')::text AS table_name
      UNION ALL
      SELECT to_regclass('public.external_action_contents')::text AS table_name
      UNION ALL
      SELECT to_regclass('public.dead_letter_events')::text AS table_name
      UNION ALL
      SELECT to_regclass('public.distributed_locks')::text AS table_name
    `;

    expect(rows.map((row) => row.table_name).sort()).toEqual([
      "dead_letter_events",
      "distributed_locks",
      "external_action_contents",
      "outbox_events",
    ]);
  });

  it("deduplicates outbox writes by idempotency key without raising unique errors", async () => {
    if (prisma === undefined) {
      throw new Error("Prisma client was not initialized.");
    }
    const idempotencyKey = `db-test:${randomUUID()}`;

    try {
      await Promise.all([
        prisma.outboxEvent.createMany({
          data: outboxCreateData({ id: randomUUID(), idempotencyKey }),
          skipDuplicates: true,
        }),
        prisma.outboxEvent.createMany({
          data: outboxCreateData({ id: randomUUID(), idempotencyKey }),
          skipDuplicates: true,
        }),
      ]);

      await expect(prisma.outboxEvent.count({ where: { idempotencyKey } })).resolves.toBe(
        1,
      );
    } finally {
      await prisma.outboxEvent.deleteMany({ where: { idempotencyKey } });
    }
  });

  it("rolls back external content and outbox rows in the same transaction", async () => {
    if (prisma === undefined) {
      throw new Error("Prisma client was not initialized.");
    }
    const contentId = randomUUID();
    const outboxId = randomUUID();
    const idempotencyKey = `db-test:${randomUUID()}`;

    await expect(
      prisma.$transaction(async (client) => {
        await client.externalActionContent.create({
          data: {
            ciphertext: Buffer.from("ciphertext"),
            contentEncryptionAlgorithm: "AES-256-GCM",
            contentAuthTag: Buffer.alloc(16, 1),
            contentKind: "github.comment.body",
            contentNonce: Buffer.alloc(12, 2),
            ciphertextSha256:
              "d95dc1813da7aee01bdc9d85c66309b390c16043b2a2f19744cbdab01c6ed1ca",
            dataKeyAlgorithm: "AES-256-GCM",
            dataKeyAuthTag: Buffer.alloc(16, 3),
            dataKeyNonce: Buffer.alloc(12, 4),
            encryptedDataKey: Buffer.alloc(32, 5),
            expiresAt: new Date(Date.now() + 60_000),
            id: contentId,
            keyRef: "db-test",
          },
        });
        await client.outboxEvent.create({
          data: outboxCreateData({
            contentIntegrityHash:
              "d95dc1813da7aee01bdc9d85c66309b390c16043b2a2f19744cbdab01c6ed1ca",
            contentRefId: contentId,
            id: outboxId,
            idempotencyKey,
          }),
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    await expect(
      prisma.externalActionContent.findUnique({ where: { id: contentId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.outboxEvent.findUnique({ where: { id: outboxId } }),
    ).resolves.toBeNull();
  });

  it("claims distinct outbox rows across concurrent workers", async () => {
    if (prisma === undefined) {
      throw new Error("Prisma client was not initialized.");
    }
    const clientA = await createConnectedPrismaClient();
    const clientB = await createConnectedPrismaClient();
    const eventIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

    try {
      await prisma.outboxEvent.createMany({
        data: eventIds.map((id) =>
          outboxCreateData({
            id,
            idempotencyKey: `db-test:${id}`,
            nextAttemptAt: new Date(Date.now() - 60_000),
          }),
        ),
      });

      const [batchA, batchB] = await Promise.all([
        claimOutboxBatch(clientA, { batchSize: 2, workerId: "worker-a" }),
        claimOutboxBatch(clientB, { batchSize: 2, workerId: "worker-b" }),
      ]);
      const claimedIds = [...batchA, ...batchB].map((row) => row.id);

      expect(batchA).toHaveLength(2);
      expect(batchB).toHaveLength(2);
      expect(new Set(claimedIds).size).toBe(4);
      expect([...new Set(claimedIds)].sort()).toEqual([...eventIds].sort());
      await expect(
        prisma.outboxEvent.findMany({
          orderBy: { id: "asc" },
          select: {
            attempts: true,
            claimToken: true,
            id: true,
            lockedBy: true,
            status: true,
          },
          where: { id: { in: eventIds } },
        }),
      ).resolves.toEqual(
        expect.arrayContaining(
          eventIds.map((id) =>
            expect.objectContaining({
              attempts: 1,
              claimToken: expect.any(String),
              id,
              lockedBy: expect.stringMatching(/^worker-[ab]$/),
              status: "processing",
            }),
          ),
        ),
      );
    } finally {
      await cleanupOutboxRows(prisma, eventIds);
      await clientA.$disconnect();
      await clientB.$disconnect();
    }
  });

  it("prevents stale claim tokens from completing a re-claimed event", async () => {
    if (prisma === undefined) {
      throw new Error("Prisma client was not initialized.");
    }
    const clientA = await createConnectedPrismaClient();
    const clientB = await createConnectedPrismaClient();
    const eventId = randomUUID();

    try {
      await prisma.outboxEvent.create({
        data: outboxCreateData({
          id: eventId,
          idempotencyKey: `db-test:${eventId}`,
          nextAttemptAt: new Date(Date.now() - 60_000),
        }),
      });

      const [firstClaim] = await claimOutboxBatch(clientA, {
        batchSize: 1,
        workerId: "worker-a",
      });
      if (firstClaim === undefined) {
        throw new Error("Expected worker-a to claim the seeded event.");
      }
      expect(firstClaim).toMatchObject({
        id: eventId,
        lockedBy: "worker-a",
      });

      await prisma.outboxEvent.update({
        data: {
          claimToken: null,
          lockedBy: null,
          lockedUntil: null,
          nextAttemptAt: new Date(Date.now() - 60_000),
          status: "pending",
        },
        where: { id: eventId },
      });

      const [secondClaim] = await claimOutboxBatch(clientB, {
        batchSize: 1,
        workerId: "worker-b",
      });
      if (secondClaim === undefined) {
        throw new Error("Expected worker-b to re-claim the seeded event.");
      }
      expect(secondClaim).toMatchObject({
        id: eventId,
        lockedBy: "worker-b",
      });

      const staleCompletion = await clientA.outboxEvent.updateMany({
        data: {
          claimToken: null,
          completedAt: new Date(),
          lockedBy: null,
          lockedUntil: null,
          status: "completed",
          updatedAt: new Date(),
        },
        where: {
          claimToken: firstClaim.claimToken,
          id: eventId,
          lockedBy: "worker-a",
          status: "processing",
        },
      });
      const row = await prisma.outboxEvent.findUniqueOrThrow({
        select: {
          attempts: true,
          claimToken: true,
          completedAt: true,
          lockedBy: true,
          status: true,
        },
        where: { id: eventId },
      });

      expect(staleCompletion.count).toBe(0);
      expect(row).toEqual({
        attempts: 2,
        claimToken: secondClaim.claimToken,
        completedAt: null,
        lockedBy: "worker-b",
        status: "processing",
      });
    } finally {
      await cleanupOutboxRows(prisma, [eventId]);
      await clientA.$disconnect();
      await clientB.$disconnect();
    }
  });

  it("recovers stale processing rows and dead-letters exhausted stale attempts", async () => {
    if (prisma === undefined) {
      throw new Error("Prisma client was not initialized.");
    }
    const retryableId = randomUUID();
    const exhaustedId = randomUUID();

    try {
      await prisma.outboxEvent.createMany({
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

      const result = await recoverStaleProcessing(prisma);
      const rows = await prisma.outboxEvent.findMany({
        select: {
          claimToken: true,
          deadLetteredAt: true,
          id: true,
          lockedBy: true,
          lockedUntil: true,
          status: true,
        },
        where: { id: { in: [retryableId, exhaustedId] } },
      });
      const deadLetter = await prisma.deadLetterEvent.findUnique({
        where: { outboxEventId: exhaustedId },
      });

      expect(result).toEqual({
        recoveredIds: [retryableId],
        terminalIds: [exhaustedId],
      });
      expect(rows).toEqual(
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
      expect(deadLetter).toMatchObject({
        attempts: 3,
        outboxEventId: exhaustedId,
      });
    } finally {
      await cleanupOutboxRows(prisma, [retryableId, exhaustedId]);
    }
  });
});

function outboxCreateData(input: {
  id: string;
  idempotencyKey: string;
  attempts?: number;
  claimToken?: string;
  contentRefId?: string;
  contentIntegrityHash?: string;
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
    ...(input.contentRefId === undefined ? {} : { contentRefId: input.contentRefId }),
    ...(input.contentIntegrityHash === undefined
      ? {}
      : { contentIntegrityHash: input.contentIntegrityHash }),
    ...(input.lockedBy === undefined ? {} : { lockedBy: input.lockedBy }),
    ...(input.lockedUntil === undefined ? {} : { lockedUntil: input.lockedUntil }),
  };
}

type ClaimedOutboxRow = Readonly<{
  attempts: number;
  claimToken: string;
  id: string;
  lockedBy: string;
}>;

async function claimOutboxBatch(
  client: PrismaClient,
  input: { batchSize: number; workerId: string },
): Promise<readonly ClaimedOutboxRow[]> {
  const claimToken = randomUUID();
  return client.$queryRaw<ClaimedOutboxRow[]>`
    UPDATE outbox_events
    SET
      status = 'processing',
      attempts = attempts + 1,
      locked_by = ${input.workerId},
      locked_until = now() + interval '30 seconds',
      claim_token = ${claimToken},
      updated_at = now()
    WHERE id IN (
      SELECT id
      FROM outbox_events
      WHERE status = 'pending'
        AND next_attempt_at <= now()
        AND attempts < max_attempts
      ORDER BY next_attempt_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.batchSize}
    )
    RETURNING
      id,
      attempts,
      locked_by AS "lockedBy",
      claim_token AS "claimToken";
  `;
}

async function recoverStaleProcessing(
  client: PrismaClient,
): Promise<
  Readonly<{ recoveredIds: readonly string[]; terminalIds: readonly string[] }>
> {
  const terminalRows = await client.$queryRaw<
    readonly { attempts: number; id: string }[]
  >`
    UPDATE outbox_events
    SET
      status = 'dead-lettered',
      locked_by = NULL,
      locked_until = NULL,
      claim_token = NULL,
      last_error_code = 'CONTROL_PLANE_OUTBOX_STALE_MAX_ATTEMPTS',
      last_error_category = 'internal',
      last_error_message = 'Outbox event exhausted attempts after stale processing recovery.',
      last_error_retryable = false,
      dead_lettered_at = now(),
      updated_at = now()
    WHERE status = 'processing'
      AND locked_until < now()
      AND attempts >= max_attempts
    RETURNING id, attempts;
  `;

  for (const row of terminalRows) {
    await client.deadLetterEvent.upsert({
      create: {
        attempts: row.attempts,
        eventType: "db.test",
        eventVersion: 1,
        finalErrorJson: {
          category: "internal",
          code: "CONTROL_PLANE_OUTBOX_STALE_MAX_ATTEMPTS",
          message: "Outbox event exhausted attempts after stale processing recovery.",
          retryable: false,
        },
        id: randomUUID(),
        outboxEventId: row.id,
        payloadSummary: {
          eventId: row.id,
          eventType: "db.test",
          eventVersion: 1,
        },
      },
      update: {},
      where: { outboxEventId: row.id },
    });
  }

  const recoveredRows = await client.$queryRaw<readonly { id: string }[]>`
    UPDATE outbox_events
    SET
      status = 'pending',
      locked_by = NULL,
      locked_until = NULL,
      claim_token = NULL,
      updated_at = now()
    WHERE status = 'processing'
      AND locked_until < now()
      AND attempts < max_attempts
    RETURNING id;
  `;

  return {
    recoveredIds: recoveredRows.map((row) => row.id).sort(),
    terminalIds: terminalRows.map((row) => row.id).sort(),
  };
}

async function createConnectedPrismaClient(): Promise<PrismaClient> {
  if (databaseUrl === undefined) {
    throw new Error("CONTROL_PLANE_TEST_DATABASE_URL is required.");
  }
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    errorFormat: "minimal",
  });
  await client.$connect();
  return client;
}

async function cleanupOutboxRows(
  client: PrismaClient,
  eventIds: readonly string[],
): Promise<void> {
  await client.deadLetterEvent.deleteMany({
    where: { outboxEventId: { in: [...eventIds] } },
  });
  await client.outboxEvent.deleteMany({ where: { id: { in: [...eventIds] } } });
}
