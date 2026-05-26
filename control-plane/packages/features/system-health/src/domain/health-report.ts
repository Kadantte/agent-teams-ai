import type { ControlPlaneBuildInfo } from "@agent-teams-control-plane/shared";

export type HealthStatus = "ok";
export type ReadinessStatus = "ready" | "degraded";
export type HealthDatabaseStatus = "disabled" | "ready" | "unavailable";
export type HealthDatabaseMigrationStatus = "applied" | "missing" | "not-checked";
export type HealthControlPlaneMode =
  | "local-disabled"
  | "hosted-official-app"
  | "self-hosted-byo-app";

export type HealthReport = Readonly<{
  service: Readonly<{
    name: string;
    version: string;
    build: ControlPlaneBuildInfo;
  }>;
  status: HealthStatus;
  mode: HealthControlPlaneMode;
  uptimeSeconds: number;
  configuration: Readonly<{
    publicBaseUrlConfigured: boolean;
    githubRestApiVersionConfigured: boolean;
  }>;
  readiness: Readonly<{
    status: ReadinessStatus;
    database: Readonly<{
      enabled: boolean;
      status: HealthDatabaseStatus;
      migrationStatus: HealthDatabaseMigrationStatus;
      reasonCode?: string;
    }>;
  }>;
}>;
