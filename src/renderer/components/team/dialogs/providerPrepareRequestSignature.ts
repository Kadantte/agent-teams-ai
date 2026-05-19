import type { MemberDraft } from '@renderer/components/team/members/membersEditorTypes';
import type {
  CliProviderStatus,
  TeamProviderId,
  TeamProvisioningModelCheckRequest,
} from '@shared/types';

type RuntimeProviderStatusById = ReadonlyMap<TeamProviderId, CliProviderStatus | null | undefined>;
type ProviderModelCheckSignatureInput =
  | string
  | Pick<TeamProvisioningModelCheckRequest, 'model' | 'effort'>;
type SelectedModelChecksByProvider = ReadonlyMap<
  TeamProviderId,
  readonly ProviderModelCheckSignatureInput[]
>;

function normalizeModelIds(modelIds: readonly string[] | null | undefined): string[] {
  return Array.from(
    new Set((modelIds ?? []).map((modelId) => modelId.trim()).filter(Boolean))
  ).sort();
}

function normalizeModelChecks(
  checks: readonly ProviderModelCheckSignatureInput[] | null | undefined
): { model: string; effort: string | null }[] {
  const seen = new Set<string>();
  const normalized: { model: string; effort: string | null }[] = [];
  for (const check of checks ?? []) {
    const model = (typeof check === 'string' ? check : check.model).trim();
    if (!model) {
      continue;
    }
    const effort = typeof check === 'string' ? null : (check.effort ?? null);
    const key = `${model}\n${effort ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ model, effort });
  }
  return normalized.sort(
    (left, right) =>
      left.model.localeCompare(right.model) || (left.effort ?? '').localeCompare(right.effort ?? '')
  );
}

export function buildProviderPrepareMembersSignature(members: readonly MemberDraft[]): string {
  return JSON.stringify(
    members.map((member) => ({
      providerId: member.providerId ?? null,
      model: member.model?.trim() || null,
      effort: member.effort ?? null,
      removed: Boolean(member.removedAt),
    }))
  );
}

export function buildProviderPrepareModelChecksSignature(
  modelChecksByProvider: SelectedModelChecksByProvider
): string {
  return JSON.stringify(
    Array.from(modelChecksByProvider.entries())
      .map(([providerId, modelIds]) => ({
        providerId,
        modelIds: normalizeModelIds(
          modelIds.map((modelId) => (typeof modelId === 'string' ? modelId : modelId.model))
        ),
        modelChecks: normalizeModelChecks(modelIds),
      }))
      .sort((left, right) => left.providerId.localeCompare(right.providerId))
  );
}

export function buildProviderPrepareRuntimeStatusSignature(
  providerIds: readonly TeamProviderId[],
  runtimeProviderStatusById: RuntimeProviderStatusById
): string {
  return JSON.stringify(
    Array.from(new Set(providerIds))
      .sort()
      .map((providerId) => {
        const provider = runtimeProviderStatusById.get(providerId) ?? null;
        return {
          providerId,
          supported: provider?.supported ?? null,
          authenticated: provider?.authenticated ?? null,
          authMethod: provider?.authMethod ?? null,
          selectedBackendId: provider?.selectedBackendId ?? null,
          resolvedBackendId: provider?.resolvedBackendId ?? null,
          // Facts:
          // - Selected models are already represented by modelChecksSignature.
          // - OpenCode/Codex live catalogs can expand while preflight is running.
          // - Including catalog contents here retriggers duplicate preflights and can
          //   make still-running OpenCode PONG probes look like persistent busy.
          connection: provider?.connection
            ? {
                supportsOAuth: provider.connection.supportsOAuth,
                supportsApiKey: provider.connection.supportsApiKey,
                configuredAuthMode: provider.connection.configuredAuthMode ?? null,
                apiKeyConfigured: provider.connection.apiKeyConfigured,
                apiKeySource: provider.connection.apiKeySource ?? null,
                codex: provider.connection.codex
                  ? {
                      preferredAuthMode: provider.connection.codex.preferredAuthMode,
                      effectiveAuthMode: provider.connection.codex.effectiveAuthMode,
                      appServerState: provider.connection.codex.appServerState,
                      managedAccountType: provider.connection.codex.managedAccount?.type ?? null,
                      managedAccountEmail: provider.connection.codex.managedAccount?.email ?? null,
                      requiresOpenaiAuth: provider.connection.codex.requiresOpenaiAuth ?? null,
                      localAccountArtifactsPresent:
                        provider.connection.codex.localAccountArtifactsPresent ?? null,
                      localActiveChatgptAccountPresent:
                        provider.connection.codex.localActiveChatgptAccountPresent ?? null,
                      loginStatus: provider.connection.codex.login?.status ?? null,
                      launchAllowed: provider.connection.codex.launchAllowed,
                      launchIssueMessage: provider.connection.codex.launchIssueMessage ?? null,
                      launchReadinessState: provider.connection.codex.launchReadinessState,
                    }
                  : null,
              }
            : null,
        };
      })
  );
}

export function buildProviderPrepareRequestSignature(input: {
  cwd: string;
  selectedProviderId: TeamProviderId;
  selectedModel: string;
  selectedMemberProviders: readonly TeamProviderId[];
  limitContext?: boolean;
  runtimeStatusSignature: string;
  membersSignature?: string;
  modelChecksSignature?: string;
}): string {
  return JSON.stringify({
    cwd: input.cwd,
    selectedProviderId: input.selectedProviderId,
    selectedModel: input.selectedModel.trim(),
    selectedMemberProviders: Array.from(new Set(input.selectedMemberProviders)).sort(),
    limitContext: Boolean(input.limitContext),
    runtimeStatusSignature: input.runtimeStatusSignature,
    membersSignature: input.membersSignature ?? null,
    modelChecksSignature: input.modelChecksSignature ?? null,
  });
}
