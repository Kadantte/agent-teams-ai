import type { TeamProviderId } from '@shared/types';

import { ConfigManager } from '../infrastructure/ConfigManager';

const THIRD_PARTY_PROVIDER_ENV_KEYS = [
  'CLAUDE_CODE_ENTRY_PROVIDER',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_GEMINI',
] as const;

const BACKEND_SELECTION_ENV_KEYS = [
  'CLAUDE_CODE_GEMINI_BACKEND',
  'CLAUDE_CODE_CODEX_BACKEND',
] as const;

export function applyConfiguredRuntimeBackendsEnv(
  env: NodeJS.ProcessEnv,
  runtimeConfig = ConfigManager.getInstance().getConfig().runtime
): NodeJS.ProcessEnv {
  for (const key of BACKEND_SELECTION_ENV_KEYS) {
    env[key] = undefined;
  }

  env.CLAUDE_CODE_GEMINI_BACKEND = runtimeConfig.providerBackends.gemini;
  env.CLAUDE_CODE_CODEX_BACKEND = runtimeConfig.providerBackends.codex;
  return env;
}

export function applyProviderRuntimeEnv(
  env: NodeJS.ProcessEnv,
  providerId: TeamProviderId | undefined
): NodeJS.ProcessEnv {
  const resolvedProvider: TeamProviderId =
    providerId === 'codex' || providerId === 'gemini' ? providerId : 'anthropic';

  for (const key of THIRD_PARTY_PROVIDER_ENV_KEYS) {
    env[key] = undefined;
  }

  if (resolvedProvider === 'codex') {
    env.CLAUDE_CODE_ENTRY_PROVIDER = 'codex';
  } else if (resolvedProvider === 'gemini') {
    env.CLAUDE_CODE_ENTRY_PROVIDER = 'gemini';
  }

  return env;
}

export function resolveTeamProviderId(providerId: TeamProviderId | undefined): TeamProviderId {
  return providerId === 'codex' || providerId === 'gemini' ? providerId : 'anthropic';
}
