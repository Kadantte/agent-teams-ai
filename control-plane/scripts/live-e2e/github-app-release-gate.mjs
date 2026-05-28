#!/usr/bin/env node
/* global AbortController */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const NON_PRODUCTION_HOST_PATTERN = /(staging|stage|sandbox|dev|test|preview|beta)/i;
const VALID_ENVIRONMENTS = new Set(["staging", "beta"]);
const FORBIDDEN_ARTIFACT_PATTERNS = [
  { label: "desktop token", pattern: /\bagtcp_[A-Za-z0-9._~+/=-]+/ },
  { label: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  { label: "oauth code", pattern: /[?&]code=[^&\s]+/i },
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "github token", pattern: /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/ },
  { label: "raw action body", pattern: /CONTROL_PLANE_LIVE_E2E_ACTION_BODY/i },
];

export function validateLiveE2EConfig(env = process.env, argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const environment = readRequired(env, "CONTROL_PLANE_LIVE_E2E_ENVIRONMENT");
  if (!VALID_ENVIRONMENTS.has(environment)) {
    throw new Error("CONTROL_PLANE_LIVE_E2E_ENVIRONMENT must be staging or beta.");
  }

  const controlPlaneBaseUrl = new URL(
    readRequired(env, "CONTROL_PLANE_LIVE_E2E_BASE_URL"),
  );
  validateSafeBaseUrl(controlPlaneBaseUrl, env);

  const githubOwner = readRequired(env, "CONTROL_PLANE_LIVE_E2E_GITHUB_OWNER");
  const githubRepo = readRequired(env, "CONTROL_PLANE_LIVE_E2E_GITHUB_REPO");
  const sandboxAllowlist = parseSandboxAllowlist(
    readRequired(env, "CONTROL_PLANE_LIVE_E2E_SANDBOX_ALLOWLIST"),
  );
  const target = `${githubOwner}/${githubRepo}`;
  if (!sandboxAllowlist.has(target)) {
    throw new Error(`GitHub target ${target} is not in sandbox allowlist.`);
  }

  const artifactDir = resolve(
    env.CONTROL_PLANE_LIVE_E2E_ARTIFACT_DIR?.trim() || "artifacts/live-e2e/github-app",
  );
  const mutate = args.mutate || env.CONTROL_PLANE_LIVE_E2E_MUTATE === "1";
  const dryRun = args.dryRun || !mutate;
  const runId = args.resumeRunId || createRunId(environment);

  return {
    artifactDir,
    controlPlaneBaseUrl,
    dryRun,
    environment,
    expectedAppSlug:
      env.CONTROL_PLANE_LIVE_E2E_EXPECTED_GITHUB_APP_SLUG?.trim() || undefined,
    expectedMode:
      env.CONTROL_PLANE_LIVE_E2E_EXPECTED_MODE?.trim() || "hosted-official-app",
    expectedRevision: env.CONTROL_PLANE_LIVE_E2E_EXPECTED_REVISION?.trim() || undefined,
    githubOwner,
    githubRepo,
    mutate,
    resumeRunId: args.resumeRunId,
    runId,
    sandboxAllowlist: [...sandboxAllowlist],
    timeoutMs: parseTimeoutMs(env.CONTROL_PLANE_LIVE_E2E_TIMEOUT_MS),
  };
}

export async function runGithubAppReleaseGate(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const manifestPath = resolve(config.artifactDir, `${config.runId}.json`);
  const manifest =
    config.resumeRunId === undefined
      ? createLiveE2EManifest(config)
      : await readManifest(manifestPath);

  await writeManifest(manifestPath, manifest);
  await appendManifestStep(manifestPath, {
    name: "environment_validation",
    status: "passed",
    summary: "Sandbox allowlist, base URL, artifact path, and run id are valid.",
  });

  const health = await getJson(
    fetchImpl,
    config.controlPlaneBaseUrl,
    "/health",
    config.timeoutMs,
  );
  const ready = await getJson(
    fetchImpl,
    config.controlPlaneBaseUrl,
    "/ready",
    config.timeoutMs,
  );
  assertControlPlanePreflight({ config, health, ready });
  await appendManifestStep(manifestPath, {
    name: "control_plane_preflight",
    safeDetails: {
      buildRevisionConfigured: health.body.service.build?.revision !== undefined,
      mode: health.body.mode,
      readiness: ready.body.readiness.status,
    },
    status: "passed",
    summary: "Health and readiness are usable for release evidence.",
  });

  if (config.dryRun) {
    await appendManifestStep(manifestPath, {
      name: "dry_run_gate",
      status: "passed",
      summary: "No external mutation attempted.",
    });
  } else {
    await appendManifestStep(manifestPath, {
      name: "mutation_guard",
      status: "blocked",
      summary:
        "Live mutation mode requires protected CI/manual operator steps from the release runbook.",
    });
    throw new Error(
      "Live mutation mode is intentionally guarded. Run the Phase 11 manual/live scenarios from the release runbook and attach this manifest.",
    );
  }

  const redaction = await scanManifestForForbiddenPatterns(manifestPath);
  await appendManifestStep(manifestPath, {
    name: "artifact_redaction_scan",
    safeDetails: { scannedPatternCount: FORBIDDEN_ARTIFACT_PATTERNS.length },
    status: redaction.ok ? "passed" : "failed",
    summary: redaction.ok
      ? "Manifest contains no forbidden secret patterns."
      : "Manifest contains forbidden secret patterns.",
  });
  if (!redaction.ok) {
    throw new Error(`Manifest redaction scan failed: ${redaction.matches.join(", ")}`);
  }

  return {
    dryRun: config.dryRun,
    manifestPath,
    runId: config.runId,
  };
}

export function createLiveE2EManifest(config) {
  return {
    artifactSchemaVersion: 1,
    controlPlaneBaseUrl: safeUrl(config.controlPlaneBaseUrl),
    dryRun: config.dryRun,
    environment: config.environment,
    githubOwner: config.githubOwner,
    githubRepo: config.githubRepo,
    redactionRules: FORBIDDEN_ARTIFACT_PATTERNS.map((item) => item.label),
    runId: config.runId,
    sandboxAllowlist: config.sandboxAllowlist,
    startedAt: new Date().toISOString(),
    steps: [],
  };
}

export async function scanForbiddenArtifactText(text) {
  const matches = FORBIDDEN_ARTIFACT_PATTERNS.filter((item) =>
    item.pattern.test(text),
  ).map((item) => item.label);
  return {
    matches,
    ok: matches.length === 0,
  };
}

async function scanManifestForForbiddenPatterns(manifestPath) {
  return scanForbiddenArtifactText(await readFile(manifestPath, "utf8"));
}

function assertControlPlanePreflight({ config, health, ready }) {
  assertHealthShape(health, "health");
  assertHealthShape(ready, "ready");

  if (ready.httpStatus !== 200 || ready.body.readiness.status !== "ready") {
    throw new Error("Control-plane readiness is not ready.");
  }
  if (config.expectedMode && health.body.mode !== config.expectedMode) {
    throw new Error(
      `Control-plane mode mismatch. Expected ${config.expectedMode}, got ${health.body.mode}.`,
    );
  }
  if (
    config.expectedRevision &&
    health.body.service.build?.revision !== config.expectedRevision
  ) {
    throw new Error("Health build revision does not match expected revision.");
  }
  if (
    health.body.service.build?.revision !== undefined &&
    ready.body.service.build?.revision !== health.body.service.build.revision
  ) {
    throw new Error("Health and readiness revisions differ.");
  }
}

function assertHealthShape(result, label) {
  if (result.httpStatus < 200 || result.httpStatus >= 300) {
    throw new Error(`${label} returned HTTP ${result.httpStatus}.`);
  }
  const body = result.body;
  if (body?.service?.name !== "agent-teams-control-plane") {
    throw new Error(`${label} service name is invalid.`);
  }
  if (typeof body.service.version !== "string") {
    throw new Error(`${label} service version is invalid.`);
  }
  if (typeof body.mode !== "string" || typeof body.status !== "string") {
    throw new Error(`${label} mode/status is invalid.`);
  }
  if (!body.readiness || typeof body.readiness.status !== "string") {
    throw new Error(`${label} readiness is invalid.`);
  }
}

async function getJson(fetchImpl, baseUrl, path, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(path, baseUrl).href, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`${path} redirected unexpectedly.`);
    }
    const text = await response.text();
    return {
      body: text.trim() ? JSON.parse(text) : null,
      httpStatus: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

async function appendManifestStep(manifestPath, step) {
  const manifest = await readManifest(manifestPath);
  manifest.steps.push({
    ...step,
    finishedAt: new Date().toISOString(),
  });
  await writeManifest(manifestPath, manifest);
}

async function writeManifest(manifestPath, manifest) {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function validateSafeBaseUrl(baseUrl, env) {
  if (baseUrl.protocol !== "https:") {
    throw new Error("CONTROL_PLANE_LIVE_E2E_BASE_URL must use https.");
  }
  if (baseUrl.username || baseUrl.password || baseUrl.hash) {
    throw new Error(
      "CONTROL_PLANE_LIVE_E2E_BASE_URL must not include credentials or hash.",
    );
  }
  if (
    !NON_PRODUCTION_HOST_PATTERN.test(baseUrl.hostname) &&
    env.CONTROL_PLANE_LIVE_E2E_ALLOW_PRODUCTION !== "1"
  ) {
    throw new Error(
      "Live E2E refuses production-looking hosts unless CONTROL_PLANE_LIVE_E2E_ALLOW_PRODUCTION=1.",
    );
  }
}

function readRequired(env, key) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function parseSandboxAllowlist(value) {
  const entries = new Set();
  for (const item of value.split(",")) {
    const normalized = item.trim();
    if (normalized) {
      entries.add(normalized);
    }
  }
  if (entries.size === 0) {
    throw new Error("CONTROL_PLANE_LIVE_E2E_SANDBOX_ALLOWLIST must not be empty.");
  }
  return entries;
}

function parseTimeoutMs(value) {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 120_000) {
    throw new Error("CONTROL_PLANE_LIVE_E2E_TIMEOUT_MS must be 1000..120000.");
  }
  return parsed;
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    mutate: false,
    resumeRunId: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--mutate") {
      args.mutate = true;
    } else if (arg === "--resume") {
      args.resumeRunId = argv[index + 1];
      index += 1;
    }
  }
  if (args.dryRun && args.mutate) {
    throw new Error("Use either --dry-run or --mutate, not both.");
  }
  return args;
}

function createRunId(environment) {
  return `github-app-e2e-${environment}-${new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function safeUrl(url) {
  return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
}

async function main() {
  const config = validateLiveE2EConfig();
  const result = await runGithubAppReleaseGate(config);
  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        manifestPath: result.manifestPath,
        runId: result.runId,
      },
      null,
      2,
    ),
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  await main();
}
