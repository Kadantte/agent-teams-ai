import type { CliProviderStatus, TeamProviderId } from '@shared/types';

function normalizeOptionalBackendId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveEffectiveProviderBackendId(
  provider: Pick<CliProviderStatus, 'selectedBackendId' | 'resolvedBackendId'> | null | undefined
): string | undefined {
  return normalizeOptionalBackendId(provider?.resolvedBackendId ?? provider?.selectedBackendId);
}

export function formatTeamProviderBackendLabel(
  providerId: TeamProviderId | undefined,
  providerBackendId: string | undefined
): string | undefined {
  const normalizedProviderId = providerId ?? 'anthropic';
  const normalizedBackendId = normalizeOptionalBackendId(providerBackendId);
  if (!normalizedBackendId) {
    return undefined;
  }

  if (normalizedProviderId === 'codex') {
    switch (normalizedBackendId) {
      case 'codex-native':
        return 'Codex native';
      case 'adapter':
        return 'Default adapter';
      case 'api':
        return 'OpenAI API';
      case 'auto':
        return undefined;
      default:
        return normalizedBackendId;
    }
  }

  if (normalizedProviderId === 'gemini') {
    switch (normalizedBackendId) {
      case 'cli-sdk':
        return 'CLI SDK';
      case 'api':
        return 'API';
      case 'auto':
        return undefined;
      default:
        return normalizedBackendId;
    }
  }

  return normalizedBackendId;
}
