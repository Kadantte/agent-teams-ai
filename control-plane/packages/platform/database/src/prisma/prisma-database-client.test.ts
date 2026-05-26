import { describe, expect, it } from "vitest";

import type { ControlPlaneConfigService } from "@agent-teams-control-plane/platform-config";
import type { ControlPlaneLogger } from "@agent-teams-control-plane/platform-logger";

import { PrismaDatabaseClient } from "./prisma-database-client.js";

describe("PrismaDatabaseClient readiness", () => {
  it("reports applied migration status when required tables exist", async () => {
    const databaseClient = prismaDatabaseClientWithQueryResults([
      [{ ready: 1 }],
      requiredTableRows(),
    ]);

    await expect(databaseClient.check()).resolves.toMatchObject({
      enabled: true,
      migrationStatus: "applied",
      status: "ready",
    });
  });

  it("reports unavailable readiness when required migration tables are missing", async () => {
    const databaseClient = prismaDatabaseClientWithQueryResults([
      [{ ready: 1 }],
      requiredTableRows().filter((row) => row.table_name !== "outbox_events"),
    ]);

    await expect(databaseClient.check()).resolves.toMatchObject({
      enabled: true,
      migrationStatus: "missing",
      reasonCode: "CONTROL_PLANE_DATABASE_MIGRATIONS_MISSING",
      status: "unavailable",
    });
  });
});

function prismaDatabaseClientWithQueryResults(
  results: readonly unknown[],
): PrismaDatabaseClient {
  let queryCount = 0;
  const databaseClient = new PrismaDatabaseClient(fakeConfigService(), fakeLogger());
  (databaseClient as unknown as { client: unknown }).client = {
    $queryRaw: async () => results[queryCount++],
  };
  return databaseClient;
}

function requiredTableRows(): Array<{ table_name: string }> {
  return [
    { table_name: "audit_events" },
    { table_name: "dead_letter_events" },
    { table_name: "distributed_locks" },
    { table_name: "external_action_content_key_refs" },
    { table_name: "external_action_contents" },
    { table_name: "outbox_events" },
  ];
}

function fakeConfigService(): ControlPlaneConfigService {
  return {
    getConfig: () => ({
      persistence: {
        enabled: true,
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
