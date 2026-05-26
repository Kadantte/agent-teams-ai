import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

const fakeNoopEventType = "control-plane.fake.noop";
const fakeNoopEventVersion = 1;

const databaseUrl = process.env.CONTROL_PLANE_TEST_DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("CONTROL_PLANE_TEST_DATABASE_URL is required for DB worker smoke.");
}

const controlPlaneRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
  errorFormat: "minimal",
});

const eventId = randomUUID();

try {
  await prisma.$connect();
  await prisma.outboxEvent.create({
    data: {
      eventType: fakeNoopEventType,
      eventVersion: fakeNoopEventVersion,
      id: eventId,
      idempotencyKey: `worker-smoke:${eventId}`,
      maxAttempts: 3,
      nextAttemptAt: new Date(Date.now() - 60_000),
      payloadJson: {},
      status: "pending",
    },
  });

  await runWorkerSmoke();

  const row = await prisma.outboxEvent.findUnique({
    select: { attempts: true, completedAt: true, status: true },
    where: { id: eventId },
  });
  if (row?.status !== "completed" || row.completedAt === null || row.attempts !== 1) {
    throw new Error(
      `DB worker smoke did not complete fake outbox event. Actual row: ${JSON.stringify(row)}`,
    );
  }

  console.log(`DB worker smoke processed fake outbox event ${eventId}`);
} finally {
  await prisma.deadLetterEvent.deleteMany({ where: { outboxEventId: eventId } });
  await prisma.outboxEvent.deleteMany({ where: { id: eventId } });
  await prisma.$disconnect();
}

async function runWorkerSmoke(): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      ["--dir", controlPlaneRoot, "exec", "tsx", "apps/worker/src/main.ts"],
      {
        cwd: controlPlaneRoot,
        env: {
          ...process.env,
          CONTROL_PLANE_DATABASE_URL: databaseUrl,
          CONTROL_PLANE_ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 9).toString("base64"),
          CONTROL_PLANE_MODE: "local-disabled",
          CONTROL_PLANE_OUTBOX_BATCH_SIZE: "100",
          CONTROL_PLANE_OUTBOX_LEASE_SECONDS: "30",
          CONTROL_PLANE_OUTBOX_WORKER_ENABLED: "true",
          CONTROL_PLANE_PERSISTENCE_ENABLED: "true",
          CONTROL_PLANE_WORKER_SMOKE: "1",
          NODE_ENV: "test",
        },
        stdio: "inherit",
      },
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`DB worker smoke exited with code ${code ?? "unknown"}.`));
    });
  });
}
