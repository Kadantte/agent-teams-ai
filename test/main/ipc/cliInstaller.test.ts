import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  initializeCliInstallerHandlers,
  registerCliInstallerHandlers,
} from '@main/ipc/cliInstaller';
import {
  CLI_INSTALLER_GET_PROVIDER_STATUS,
  CLI_INSTALLER_GET_STATUS,
} from '@preload/constants/ipcChannels';
import { createDefaultCliExtensionCapabilities } from '@shared/utils/providerExtensionCapabilities';

import type { CliInstallerService } from '@main/services';
import type { CliInstallationStatus, CliProviderId, CliProviderStatus, IpcResult } from '@shared/types';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function createMockIpcMain(): IpcMain & {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
} {
  const handlers = new Map<string, IpcHandler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler for ${channel}`);
      }
      return await Promise.resolve(handler({} as IpcMainInvokeEvent, ...args));
    },
  };
  return ipcMain as unknown as IpcMain & {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  };
}

function provider(overrides: Partial<CliProviderStatus> & { providerId: CliProviderId }): CliProviderStatus {
  const { providerId, ...rest } = overrides;
  return {
    providerId,
    displayName: providerId,
    supported: true,
    authenticated: false,
    authMethod: null,
    verificationState: 'unknown',
    modelVerificationState: 'idle',
    modelCatalogRefreshState: 'idle',
    statusMessage: null,
    detailMessage: null,
    models: [],
    modelAvailability: [],
    canLoginFromUi: providerId !== 'opencode',
    capabilities: {
      teamLaunch: true,
      oneShot: true,
      extensions: createDefaultCliExtensionCapabilities(),
    },
    selectedBackendId: null,
    resolvedBackendId: null,
    availableBackends: [],
    externalRuntimeDiagnostics: [],
    backend: null,
    connection: null,
    modelCatalog: null,
    runtimeCapabilities: null,
    subscriptionRateLimits: null,
    ...rest,
  };
}

function status(providers: CliProviderStatus[]): CliInstallationStatus {
  return {
    flavor: 'agent_teams_orchestrator',
    displayName: 'Multimodel runtime',
    supportsSelfUpdate: false,
    showVersionDetails: false,
    showBinaryPath: false,
    installed: true,
    installedVersion: '0.0.3',
    binaryPath: '/mock/agent_teams_orchestrator',
    launchError: null,
    latestVersion: null,
    updateAvailable: false,
    authLoggedIn: false,
    authStatusChecking: false,
    authMethod: null,
    providers,
  };
}

describe('cliInstaller IPC handlers', () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>;
  let service: {
    getLatestStatusSnapshot: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    getProviderStatus: ReturnType<typeof vi.fn>;
    verifyProviderModels: ReturnType<typeof vi.fn>;
    install: ReturnType<typeof vi.fn>;
    invalidateStatusCache: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ipcMain = createMockIpcMain();
    service = {
      getLatestStatusSnapshot: vi.fn(() => null),
      getStatus: vi.fn(),
      getProviderStatus: vi.fn(),
      verifyProviderModels: vi.fn(),
      install: vi.fn(),
      invalidateStatusCache: vi.fn(),
    };
    initializeCliInstallerHandlers(service as unknown as CliInstallerService);
    registerCliInstallerHandlers(ipcMain);
  });

  it('does not let explicit hidden Gemini refresh poison cached frontend auth status', async () => {
    service.getStatus.mockResolvedValue(
      status([
        provider({ providerId: 'anthropic' }),
        provider({ providerId: 'codex' }),
        provider({ providerId: 'opencode', canLoginFromUi: false }),
      ])
    );
    service.getProviderStatus.mockResolvedValue(
      provider({
        providerId: 'gemini',
        authenticated: true,
        authMethod: 'gemini_api_key',
        models: ['gemini-2.5-pro'],
      })
    );

    const initial = (await ipcMain.invoke(CLI_INSTALLER_GET_STATUS)) as IpcResult<CliInstallationStatus>;
    expect(initial.success).toBe(true);
    expect(initial.data?.providers.map((entry) => entry.providerId)).toEqual([
      'anthropic',
      'codex',
      'opencode',
    ]);

    const gemini = (await ipcMain.invoke(
      CLI_INSTALLER_GET_PROVIDER_STATUS,
      'gemini'
    )) as IpcResult<CliProviderStatus | null>;
    expect(gemini.success).toBe(true);
    expect(gemini.data?.authenticated).toBe(true);

    const cached = (await ipcMain.invoke(CLI_INSTALLER_GET_STATUS)) as IpcResult<CliInstallationStatus>;
    expect(service.getStatus).toHaveBeenCalledTimes(1);
    expect(cached.success).toBe(true);
    expect(cached.data?.providers.map((entry) => entry.providerId)).toEqual([
      'anthropic',
      'codex',
      'opencode',
    ]);
    expect(cached.data?.authLoggedIn).toBe(false);
    expect(cached.data?.authMethod).toBeNull();
  });
});
