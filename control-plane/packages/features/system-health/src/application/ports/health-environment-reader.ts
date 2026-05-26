import type { ControlPlaneBuildInfo } from "@agent-teams-control-plane/shared";

import type {
  HealthControlPlaneMode,
  HealthDatabaseMigrationStatus,
} from "../../domain/health-report.js";

export type HealthEnvironment = Readonly<{
  build: ControlPlaneBuildInfo;
  mode: HealthControlPlaneMode;
  publicBaseUrlConfigured: boolean;
  githubRestApiVersionConfigured: boolean;
  uptimeSeconds: number;
  database: Readonly<{
    enabled: boolean;
    status: "disabled" | "ready" | "unavailable";
    migrationStatus: HealthDatabaseMigrationStatus;
    reasonCode?: string;
  }>;
}>;

export interface HealthEnvironmentReader {
  read(): Promise<HealthEnvironment>;
}
