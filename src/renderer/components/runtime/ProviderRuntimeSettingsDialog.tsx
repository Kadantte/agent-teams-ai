import { useEffect, useMemo, useState } from 'react';

import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';
import { useStore } from '@renderer/store';
import { AlertTriangle, Key, Trash2 } from 'lucide-react';

import {
  ProviderRuntimeBackendSelector,
  getProviderRuntimeBackendSummary,
} from './ProviderRuntimeBackendSelector';

import type { CliProviderId, CliProviderStatus } from '@shared/types';
import type { ApiKeyEntry } from '@shared/types/extensions';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: CliProviderStatus[];
  initialProviderId: CliProviderId;
  providerStatusLoading?: Partial<Record<CliProviderId, boolean>>;
  disabled?: boolean;
  onSelectBackend: (providerId: CliProviderId, backendId: string) => void;
  onRefreshProvider?: (providerId: CliProviderId) => Promise<void> | void;
};

export function ProviderRuntimeSettingsDialog({
  open,
  onOpenChange,
  providers,
  initialProviderId,
  providerStatusLoading = {},
  disabled = false,
  onSelectBackend,
  onRefreshProvider,
}: Props): React.JSX.Element {
  const [selectedProviderId, setSelectedProviderId] = useState<CliProviderId>(initialProviderId);
  const [showGeminiApiKeyForm, setShowGeminiApiKeyForm] = useState(false);
  const [geminiApiKeyValue, setGeminiApiKeyValue] = useState('');
  const [geminiApiKeyScope, setGeminiApiKeyScope] = useState<'user' | 'project'>('user');
  const [geminiApiKeyError, setGeminiApiKeyError] = useState<string | null>(null);

  const apiKeys = useStore((s) => s.apiKeys);
  const apiKeysLoading = useStore((s) => s.apiKeysLoading);
  const apiKeysError = useStore((s) => s.apiKeysError);
  const apiKeySaving = useStore((s) => s.apiKeySaving);
  const apiKeyStorageStatus = useStore((s) => s.apiKeyStorageStatus);
  const fetchApiKeys = useStore((s) => s.fetchApiKeys);
  const fetchApiKeyStorageStatus = useStore((s) => s.fetchApiKeyStorageStatus);
  const saveApiKey = useStore((s) => s.saveApiKey);
  const deleteApiKey = useStore((s) => s.deleteApiKey);

  useEffect(() => {
    if (open) {
      setSelectedProviderId(initialProviderId);
      void fetchApiKeys();
      void fetchApiKeyStorageStatus();
    }
  }, [fetchApiKeyStorageStatus, fetchApiKeys, initialProviderId, open]);

  useEffect(() => {
    if (!open) {
      setShowGeminiApiKeyForm(false);
      setGeminiApiKeyValue('');
      setGeminiApiKeyError(null);
    }
  }, [open]);

  const selectedProvider = useMemo(() => {
    return (
      providers.find((provider) => provider.providerId === selectedProviderId) ??
      providers.find(
        (provider) => provider.availableBackends && provider.availableBackends.length > 0
      ) ??
      providers[0] ??
      null
    );
  }, [providers, selectedProviderId]);

  const summary = selectedProvider ? getProviderRuntimeBackendSummary(selectedProvider) : null;
  const canConfigure = (selectedProvider?.availableBackends?.length ?? 0) > 0;
  const geminiApiKey = useMemo(() => {
    const matches = apiKeys.filter((entry) => entry.envVarName === 'GEMINI_API_KEY');
    const preferred = matches.find((entry) => entry.scope === 'user') ?? matches[0] ?? null;
    return preferred;
  }, [apiKeys]);

  const handleSaveGeminiApiKey = async (): Promise<void> => {
    if (!geminiApiKeyValue.trim()) {
      setGeminiApiKeyError('API key is required');
      return;
    }

    setGeminiApiKeyError(null);
    try {
      await saveApiKey({
        id: geminiApiKey?.id,
        name: 'Gemini API Key',
        envVarName: 'GEMINI_API_KEY',
        value: geminiApiKeyValue.trim(),
        scope: geminiApiKeyScope,
      });
      setShowGeminiApiKeyForm(false);
      setGeminiApiKeyValue('');
      await onRefreshProvider?.('gemini');
    } catch (error) {
      setGeminiApiKeyError(error instanceof Error ? error.message : 'Failed to save API key');
    }
  };

  const handleDeleteGeminiApiKey = async (entry: ApiKeyEntry): Promise<void> => {
    setGeminiApiKeyError(null);
    await deleteApiKey(entry.id);
    await fetchApiKeys();
    await onRefreshProvider?.('gemini');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Provider Runtime Settings</DialogTitle>
          <DialogDescription>
            Choose a provider and adjust which internal runtime backend `free-code` should use.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Provider
            </div>
            <Tabs
              value={selectedProvider?.providerId ?? selectedProviderId}
              onValueChange={(value) => setSelectedProviderId(value as CliProviderId)}
            >
              <div
                className="-mx-1 border-b px-1"
                style={{ borderColor: 'var(--color-border-subtle)' }}
              >
                <TabsList className="gap-1 rounded-b-none">
                  {providers.map((provider) => (
                    <TabsTrigger
                      key={provider.providerId}
                      value={provider.providerId}
                      className="relative rounded-b-none data-[state=active]:z-10 data-[state=active]:-mb-px data-[state=active]:bg-[var(--color-surface)] data-[state=active]:shadow-none data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-1 data-[state=active]:after:bg-[var(--color-surface)] data-[state=active]:after:content-['']"
                    >
                      {provider.displayName}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
          </div>

          {selectedProvider ? (
            <div
              className="rounded-lg border px-3 py-2.5"
              style={{
                borderColor: 'var(--color-border-subtle)',
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
              }}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {selectedProvider.displayName}
                </span>
                <span
                  className="text-xs"
                  style={{
                    color: selectedProvider.authenticated ? '#4ade80' : 'var(--color-text-muted)',
                  }}
                >
                  {selectedProvider.authenticated
                    ? selectedProvider.authMethod
                      ? `Authenticated via ${selectedProvider.authMethod}`
                      : 'Authenticated'
                    : selectedProvider.statusMessage || 'Not connected'}
                </span>
                {summary ? (
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Runtime: {summary}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {selectedProvider && canConfigure ? (
            <ProviderRuntimeBackendSelector
              provider={selectedProvider}
              disabled={disabled || providerStatusLoading[selectedProvider.providerId] === true}
              onSelect={onSelectBackend}
            />
          ) : (
            <div
              className="rounded-lg border px-3 py-2.5 text-sm"
              style={{
                borderColor: 'var(--color-border-subtle)',
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
                color: 'var(--color-text-muted)',
              }}
            >
              Runtime backend is not configurable for this provider in the current version.
            </div>
          )}

          {selectedProvider?.providerId === 'gemini' && (
            <div
              className="space-y-3 rounded-lg border p-3"
              style={{
                borderColor: 'var(--color-border-subtle)',
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex size-7 items-center justify-center rounded-md border"
                      style={{
                        borderColor: 'var(--color-border-subtle)',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <Key className="size-3.5" style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        API access
                      </div>
                      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Use `GEMINI_API_KEY` for the Gemini API backend. CLI SDK does not require
                        it.
                      </div>
                    </div>
                  </div>
                </div>
                {!showGeminiApiKeyForm ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowGeminiApiKeyForm(true);
                      setGeminiApiKeyScope(geminiApiKey?.scope ?? 'user');
                      setGeminiApiKeyError(null);
                    }}
                  >
                    {geminiApiKey ? 'Replace key' : 'Set API key'}
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{
                    color: geminiApiKey ? '#86efac' : 'var(--color-text-muted)',
                    backgroundColor: geminiApiKey
                      ? 'rgba(74, 222, 128, 0.14)'
                      : 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {geminiApiKey ? 'Configured' : 'Not configured'}
                </span>
                {geminiApiKey ? (
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {geminiApiKey.maskedValue} · {geminiApiKey.scope}
                  </span>
                ) : null}
                {apiKeyStorageStatus ? (
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    Stored in {apiKeyStorageStatus.backend}
                  </span>
                ) : null}
              </div>

              {selectedProvider.availableBackends?.some(
                (option) => option.id === 'api' && !option.available
              ) ? (
                <div
                  className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
                  style={{
                    borderColor: 'rgba(245, 158, 11, 0.25)',
                    backgroundColor: 'rgba(245, 158, 11, 0.06)',
                    color: '#fbbf24',
                  }}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Gemini API is currently unavailable. Configure `GEMINI_API_KEY` here or use
                    valid Google ADC credentials.
                  </span>
                </div>
              ) : null}

              {showGeminiApiKeyForm ? (
                <div
                  className="space-y-3 rounded-md border p-3"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="gemini-api-key" className="text-xs">
                      Gemini API key
                    </Label>
                    <Input
                      id="gemini-api-key"
                      type="password"
                      value={geminiApiKeyValue}
                      onChange={(e) => setGeminiApiKeyValue(e.target.value)}
                      placeholder="AIza..."
                      className="h-9 text-sm"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Scope</Label>
                    <Select
                      value={geminiApiKeyScope}
                      onValueChange={(value) => setGeminiApiKeyScope(value as 'user' | 'project')}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="project">Project</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(geminiApiKeyError || apiKeysError) && (
                    <div
                      className="rounded-md border px-3 py-2 text-xs"
                      style={{
                        borderColor: 'rgba(248, 113, 113, 0.25)',
                        backgroundColor: 'rgba(248, 113, 113, 0.06)',
                        color: '#fca5a5',
                      }}
                    >
                      {geminiApiKeyError ?? apiKeysError}
                    </div>
                  )}

                  <div className="flex justify-between gap-2">
                    {geminiApiKey ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteGeminiApiKey(geminiApiKey)}
                        disabled={apiKeySaving}
                      >
                        <Trash2 className="mr-1 size-3.5" />
                        Delete
                      </Button>
                    ) : (
                      <span />
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowGeminiApiKeyForm(false);
                          setGeminiApiKeyValue('');
                          setGeminiApiKeyError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSaveGeminiApiKey()}
                        disabled={apiKeySaving || !geminiApiKeyValue.trim()}
                      >
                        {apiKeySaving ? 'Saving...' : geminiApiKey ? 'Update key' : 'Save key'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {apiKeysLoading && !geminiApiKey ? (
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Loading stored credentials...
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
