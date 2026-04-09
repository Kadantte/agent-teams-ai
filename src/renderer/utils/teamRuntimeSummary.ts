import type { TeamProviderId } from '@shared/types';

const MODEL_LABEL_OVERRIDES: Record<string, string> = {
  default: 'Default',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-4-6[1m]': 'Sonnet 4.6 (1M)',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-opus-4-6[1m]': 'Opus 4.6 (1M)',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5.3-codex': 'GPT-5.3 Codex',
  'gpt-5.3-codex-spark': 'GPT-5.3 Codex Spark',
  'gpt-5.2': 'GPT-5.2',
  'gpt-5.2-codex': 'GPT-5.2 Codex',
  'gpt-5.1-codex-mini': 'GPT-5.1 Codex Mini',
  'gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
};

export function getTeamRuntimeModelLabel(model: string | undefined): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed) return undefined;
  return MODEL_LABEL_OVERRIDES[trimmed] ?? trimmed;
}

export function getTeamRuntimeProviderLabel(
  providerId: TeamProviderId | undefined
): string | undefined {
  switch (providerId) {
    case 'codex':
      return 'Codex';
    case 'gemini':
      return 'Gemini';
    case 'anthropic':
      return 'Anthropic';
    default:
      return undefined;
  }
}

export function getTeamRuntimeEffortLabel(effort: string | undefined): string | undefined {
  const trimmed = effort?.trim();
  if (!trimmed) return undefined;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function formatTeamRuntimeSummary(
  providerId: TeamProviderId | undefined,
  model: string | undefined,
  effort?: string
): string | undefined {
  const providerLabel = getTeamRuntimeProviderLabel(providerId);
  const modelLabel = getTeamRuntimeModelLabel(model);
  const effortLabel = getTeamRuntimeEffortLabel(effort);

  if (!providerLabel && !modelLabel && !effortLabel) {
    return undefined;
  }

  const normalizedProvider = providerLabel?.trim().toLowerCase();
  const normalizedModel = modelLabel?.trim().toLowerCase();
  const modelAlreadyCarriesProviderBrand =
    Boolean(modelLabel) &&
    Boolean(normalizedProvider) &&
    Boolean(normalizedModel) &&
    (normalizedModel!.startsWith(normalizedProvider!) ||
      (providerId === 'anthropic' && normalizedModel!.startsWith('claude')) ||
      (providerId === 'codex' &&
        (normalizedModel!.startsWith('codex') || normalizedModel!.startsWith('gpt'))) ||
      (providerId === 'gemini' && normalizedModel!.startsWith('gemini')));

  const providerActsAsBackendOnly =
    providerId !== 'anthropic' && Boolean(modelLabel) && !modelAlreadyCarriesProviderBrand;

  const parts = modelAlreadyCarriesProviderBrand
    ? [modelLabel, effortLabel]
    : providerActsAsBackendOnly
      ? [modelLabel, `via ${providerLabel}`, effortLabel]
      : [providerLabel, providerLabel && !modelLabel ? 'Default' : modelLabel, effortLabel];

  return parts.filter(Boolean).join(' · ');
}
