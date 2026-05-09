#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  exitForSkippedPreflight,
  preflightOpenCodeLiveEnvironment,
} from './lib/opencode-live-preflight.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const orchestratorRoot = process.env.CLAUDE_DEV_RUNTIME_ROOT?.trim();
const siblingOrchestrator = path.resolve(repoRoot, '..', 'agent_teams_orchestrator');
const order = process.env.PROVIDER_LAUNCH_STRESS_ORDER?.trim() || 'anthropic,codex,opencode,mixed';

const env = {
  ...process.env,
  PROVIDER_LAUNCH_STRESS_LIVE: '1',
  PROVIDER_LAUNCH_STRESS_ORDER: order,
  PROVIDER_LAUNCH_STRESS_MEMBER_COUNT:
    process.env.PROVIDER_LAUNCH_STRESS_MEMBER_COUNT?.trim() || '5',
  PROVIDER_LAUNCH_STRESS_ANTHROPIC_AUTH:
    process.env.PROVIDER_LAUNCH_STRESS_ANTHROPIC_AUTH?.trim() ||
    (process.env.ANTHROPIC_API_KEY?.trim() ? 'api-key' : 'subscription'),
  OPENCODE_E2E: '1',
  OPENCODE_E2E_USE_REAL_APP_CREDENTIALS: '1',
  OPENCODE_DISABLE_AUTOUPDATE: process.env.OPENCODE_DISABLE_AUTOUPDATE ?? '1',
};

if (!env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH?.trim()) {
  const runtimeRoot = orchestratorRoot ? path.resolve(orchestratorRoot) : siblingOrchestrator;
  env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH = path.join(runtimeRoot, 'cli');
}

console.log('Running provider launch stress live smoke');
console.log(`Order: ${env.PROVIDER_LAUNCH_STRESS_ORDER}`);
console.log(`Members per scenario: ${env.PROVIDER_LAUNCH_STRESS_MEMBER_COUNT}`);
console.log(`Anthropic auth: ${env.PROVIDER_LAUNCH_STRESS_ANTHROPIC_AUTH}`);
console.log(
  `Models: anthropic=${env.PROVIDER_LAUNCH_STRESS_ANTHROPIC_MODEL || 'haiku'}, codex=${
    env.PROVIDER_LAUNCH_STRESS_CODEX_MODEL || 'gpt-5.4-mini'
  }, opencode=${env.PROVIDER_LAUNCH_STRESS_OPENCODE_MODEL || 'openai/gpt-5.4-mini'}`
);
console.log(`Orchestrator CLI: ${env.CLAUDE_AGENT_TEAMS_ORCHESTRATOR_CLI_PATH}`);

if (order.split(',').some((item) => ['opencode', 'mixed'].includes(item.trim()))) {
  const preflight = await preflightOpenCodeLiveEnvironment({ repoRoot });
  exitForSkippedPreflight(preflight);
}

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--maxWorkers',
    '1',
    '--minWorkers',
    '1',
    'test/main/services/team/ProviderLaunchStress.live-e2e.test.ts',
  ],
  {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

if (result.error) {
  console.error(`Failed to run provider launch stress smoke: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
