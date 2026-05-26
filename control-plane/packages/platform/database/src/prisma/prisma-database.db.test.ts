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
            contentEncryptionAlgorithm: "AES-256-GCM",
            contentKind: "github.comment.body",
            ciphertextSha256:
              "d95dc1813da7aee01bdc9d85c66309b390c16043b2a2f19744cbdab01c6ed1ca",
            dataKeyAlgorithm: "AES-256-GCM",
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
});

function outboxCreateData(input: {
  id: string;
  idempotencyKey: string;
  contentRefId?: string;
  contentIntegrityHash?: string;
}) {
  return {
    eventType: "db.test",
    eventVersion: 1,
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    maxAttempts: 3,
    nextAttemptAt: new Date(),
    payloadJson: {},
    status: "pending",
    ...(input.contentRefId === undefined ? {} : { contentRefId: input.contentRefId }),
    ...(input.contentIntegrityHash === undefined
      ? {}
      : { contentIntegrityHash: input.contentIntegrityHash }),
  };
}
