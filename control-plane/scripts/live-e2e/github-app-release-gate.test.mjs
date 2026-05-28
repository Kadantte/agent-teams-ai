/* global Response */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createLiveE2EManifest,
  runGithubAppReleaseGate,
  scanForbiddenArtifactText,
  validateLiveE2EConfig,
} from "./github-app-release-gate.mjs";

describe("github-app-release-gate", () => {
  it("refuses non-sandbox repositories", () => {
    expect(() =>
      validateLiveE2EConfig({
        CONTROL_PLANE_LIVE_E2E_BASE_URL: "https://staging-control-plane.example.test",
        CONTROL_PLANE_LIVE_E2E_ENVIRONMENT: "staging",
        CONTROL_PLANE_LIVE_E2E_GITHUB_OWNER: "real-org",
        CONTROL_PLANE_LIVE_E2E_GITHUB_REPO: "real-repo",
        CONTROL_PLANE_LIVE_E2E_SANDBOX_ALLOWLIST: "sandbox-org/sandbox-repo",
      }),
    ).toThrow(/not in sandbox allowlist/);
  });

  it("creates a safe manifest without secret-bearing action content", () => {
    const config = createConfig();
    const manifest = createLiveE2EManifest(config);

    expect(manifest).toMatchObject({
      controlPlaneBaseUrl: "https://staging-control-plane.example.test",
      dryRun: true,
      environment: "staging",
      githubOwner: "sandbox-org",
      githubRepo: "sandbox-repo",
      runId: "github-app-e2e-test",
    });
    expect(JSON.stringify(manifest)).not.toContain("CONTROL_PLANE_LIVE_E2E_ACTION_BODY");
  });

  it("runs dry-run preflight and writes a redaction-scanned manifest", async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), "github-app-release-gate-"));
    const config = createConfig({ artifactDir });
    const healthPayload = {
      mode: "hosted-official-app",
      readiness: {
        database: {
          enabled: true,
          migrationStatus: "applied",
          status: "ready",
        },
        status: "ready",
      },
      service: {
        build: {
          createdAt: "2026-05-26T10:20:30.000Z",
          revision: "abc123",
        },
        name: "agent-teams-control-plane",
        version: "0.0.0",
      },
      status: "ok",
      uptimeSeconds: 12,
    };
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(healthPayload), { status: 200 }),
    );

    const result = await runGithubAppReleaseGate(config, { fetchImpl });
    const manifestText = await readFile(result.manifestPath, "utf8");
    const manifest = JSON.parse(manifestText);

    expect(result).toMatchObject({
      dryRun: true,
      runId: "github-app-e2e-test",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(manifest.steps.map((step) => step.name)).toEqual([
      "environment_validation",
      "control_plane_preflight",
      "dry_run_gate",
      "artifact_redaction_scan",
    ]);
    await expect(scanForbiddenArtifactText(manifestText)).resolves.toEqual({
      matches: [],
      ok: true,
    });
  });

  it("detects forbidden artifact patterns", async () => {
    await expect(scanForbiddenArtifactText("Bearer secret-token-value")).resolves.toEqual(
      {
        matches: ["bearer token"],
        ok: false,
      },
    );
  });
});

function createConfig(overrides = {}) {
  return {
    artifactDir: "artifacts/live-e2e/github-app",
    controlPlaneBaseUrl: new URL("https://staging-control-plane.example.test"),
    dryRun: true,
    environment: "staging",
    expectedMode: "hosted-official-app",
    expectedRevision: "abc123",
    githubOwner: "sandbox-org",
    githubRepo: "sandbox-repo",
    mutate: false,
    resumeRunId: undefined,
    runId: "github-app-e2e-test",
    sandboxAllowlist: ["sandbox-org/sandbox-repo"],
    timeoutMs: 1000,
    ...overrides,
  };
}
