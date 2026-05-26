export type DatabaseReadinessStatus = "disabled" | "ready" | "unavailable";
export type DatabaseMigrationStatus = "applied" | "missing" | "not-checked";

export type DatabaseReadinessReport = Readonly<{
  enabled: boolean;
  status: DatabaseReadinessStatus;
  migrationStatus: DatabaseMigrationStatus;
  reasonCode?: string;
}>;

export interface DatabaseReadinessProbe {
  check(input?: { timeoutMs?: number }): Promise<DatabaseReadinessReport>;
}
