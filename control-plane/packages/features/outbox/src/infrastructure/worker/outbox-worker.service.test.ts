import { describe, expect, it } from "vitest";

import type { ControlPlaneConfigService } from "@agent-teams-control-plane/platform-config";
import type { ControlPlaneLogger } from "@agent-teams-control-plane/platform-logger";

import type { OutboxRepository } from "../../application/ports/outbox.repository.js";
import type { ProcessOutboxBatchUseCase } from "../../application/use-cases/process-outbox-batch.use-case.js";
import { OutboxWorkerService } from "./outbox-worker.service.js";

describe("OutboxWorkerService", () => {
  it("logs empty polls at debug level without info noise", async () => {
    const logs: Array<{ level: string; message: string }> = [];
    const service = new OutboxWorkerService(
      fakeConfigService(),
      {
        claimNextBatch: async () => [],
        recoverStaleProcessing: async () => 0,
      } as unknown as OutboxRepository,
      {
        execute: async () => ({
          completed: 0,
          deadLettered: 0,
          retried: 0,
          staleClaims: 0,
        }),
      } as unknown as ProcessOutboxBatchUseCase,
      fakeLogger(logs),
    );

    await expect(service.runOnce()).resolves.toMatchObject({
      claimed: 0,
      completed: 0,
      deadLettered: 0,
      retried: 0,
      skipped: false,
      staleClaims: 0,
    });
    expect(logs).toContainEqual({
      level: "debug",
      message: "Outbox worker idle",
    });
    expect(logs.some((entry) => entry.level === "info")).toBe(false);
  });
});

function fakeConfigService(): ControlPlaneConfigService {
  return {
    getConfig: () => ({
      outbox: {
        batchSize: 10,
        leaseSeconds: 30,
        workerEnabled: true,
      },
      persistence: {
        enabled: true,
      },
    }),
  } as unknown as ControlPlaneConfigService;
}

function fakeLogger(logs: Array<{ level: string; message: string }>): ControlPlaneLogger {
  return {
    child: () => fakeLogger(logs),
    debug: (message) => logs.push({ level: "debug", message }),
    error: (message) => logs.push({ level: "error", message }),
    info: (message) => logs.push({ level: "info", message }),
    warn: (message) => logs.push({ level: "warn", message }),
  };
}
