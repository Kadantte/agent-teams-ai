import { describe, expect, it } from 'vitest';

import { getTeamEffortOptions } from '../teamEffortOptions';

import type { CliProviderStatus } from '@shared/types';

function createProviderStatus(
  providerId: CliProviderStatus['providerId'],
  model: NonNullable<CliProviderStatus['modelCatalog']>['models'][number],
  options: {
    source?: 'anthropic-models-api' | 'app-server' | 'static-fallback';
    configPassthrough?: boolean;
    runtimeValues?: CliProviderStatus['runtimeCapabilities'];
  } = {}
): CliProviderStatus {
  const source =
    options.source ?? (providerId === 'anthropic' ? 'anthropic-models-api' : 'app-server');

  return {
    providerId,
    displayName: providerId === 'anthropic' ? 'Anthropic' : 'Codex',
    supported: true,
    authenticated: true,
    authMethod: providerId === 'anthropic' ? 'claude.ai' : 'chatgpt',
    verificationState: 'verified',
    models: [model.launchModel],
    modelCatalog: {
      schemaVersion: 1,
      providerId,
      source,
      status: 'ready',
      fetchedAt: '2026-04-21T00:00:00.000Z',
      staleAt: '2026-04-21T00:10:00.000Z',
      defaultModelId: model.id,
      defaultLaunchModel: model.launchModel,
      models: [model],
      diagnostics: {
        configReadState: 'ready',
        appServerState: 'healthy',
      },
    },
    modelAvailability: [],
    runtimeCapabilities: options.runtimeValues ?? {
      modelCatalog: { dynamic: true, source },
      reasoningEffort: {
        supported: true,
        values: model.supportedReasoningEfforts,
        configPassthrough: options.configPassthrough === true,
      },
    },
    canLoginFromUi: true,
    capabilities: {
      teamLaunch: true,
      oneShot: true,
      extensions: {
        plugins: { status: 'supported', ownership: 'shared', reason: null },
        mcp: { status: 'supported', ownership: 'shared', reason: null },
        skills: { status: 'supported', ownership: 'shared', reason: null },
        apiKeys: { status: 'supported', ownership: 'shared', reason: null },
      },
    },
  };
}

describe('team effort options', () => {
  it('keeps Codex xhigh when runtime catalog and passthrough say it is valid', () => {
    const providerStatus = createProviderStatus(
      'codex',
      {
        id: 'gpt-5.4',
        launchModel: 'gpt-5.4',
        displayName: 'GPT-5.4',
        hidden: false,
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'medium',
        inputModalities: ['text', 'image'],
        supportsPersonality: false,
        isDefault: true,
        upgrade: false,
        source: 'app-server',
      },
      { configPassthrough: true }
    );

    expect(getTeamEffortOptions({ providerId: 'codex', model: 'gpt-5.4', providerStatus })).toEqual(
      [
        { value: '', label: 'Default (Medium)' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'xhigh', label: 'XHigh' },
      ]
    );
  });

  it('shows only supported low/medium/high efforts for Anthropic and never leaks max', () => {
    const providerStatus = createProviderStatus('anthropic', {
      id: 'opus',
      launchModel: 'opus',
      displayName: 'Opus 4.7',
      hidden: false,
      supportedReasoningEfforts: ['low', 'medium', 'high'],
      defaultReasoningEffort: null,
      inputModalities: ['text', 'image'],
      supportsPersonality: false,
      isDefault: true,
      upgrade: false,
      source: 'anthropic-models-api',
    });

    expect(
      getTeamEffortOptions({ providerId: 'anthropic', model: 'opus', providerStatus })
    ).toEqual([
      { value: '', label: 'Default' },
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ]);
  });

  it('shows only Default when the selected Anthropic model does not support effort', () => {
    const providerStatus = createProviderStatus('anthropic', {
      id: 'haiku',
      launchModel: 'haiku',
      displayName: 'Haiku 4.5',
      hidden: false,
      supportedReasoningEfforts: [],
      defaultReasoningEffort: null,
      inputModalities: ['text', 'image'],
      supportsPersonality: false,
      isDefault: false,
      upgrade: false,
      source: 'anthropic-models-api',
    });

    expect(
      getTeamEffortOptions({ providerId: 'anthropic', model: 'haiku', providerStatus })
    ).toEqual([{ value: '', label: 'Default' }]);
  });
});
