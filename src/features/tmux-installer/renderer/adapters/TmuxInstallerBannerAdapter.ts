import {
  defaultTmuxInstallerT,
  formatInstallButtonLabel,
  formatTmuxInstallerProgress,
  formatTmuxInstallerTitle,
  formatTmuxLocationLabel,
  formatTmuxOptionalBenefits,
  formatTmuxPlatformLabel,
} from '@features/tmux-installer/renderer/utils/formatTmuxInstallerText';

import type { useAppTranslation } from '@features/localization/renderer';
import type {
  TmuxInstallerSnapshot,
  TmuxInstallHint,
  TmuxStatus,
} from '@features/tmux-installer/contracts';

export interface TmuxInstallerBannerViewModel {
  visible: boolean;
  loading: boolean;
  title: string;
  body: string;
  benefitsBody: string | null;
  error: string | null;
  platformLabel: string | null;
  locationLabel: string | null;
  runtimeReadyLabel: string | null;
  versionLabel: string | null;
  phase: TmuxInstallerSnapshot['phase'];
  progressPercent: number | null;
  logs: string[];
  manualHints: TmuxInstallHint[];
  manualHintsCollapsible: boolean;
  primaryGuideUrl: string | null;
  installSupported: boolean;
  installDisabled: boolean;
  installLabel: string;
  installButtonPrimary: boolean;
  showRefreshButton: boolean;
  canCancel: boolean;
  acceptsInput: boolean;
  inputPrompt: string | null;
  inputSecret: boolean;
  detailsOpen: boolean;
}

interface AdaptInput {
  status: TmuxStatus | null;
  snapshot: TmuxInstallerSnapshot;
  loading: boolean;
  error: string | null;
  detailsOpen: boolean;
  t?: ReturnType<typeof useAppTranslation>['t'];
}

const RESTART_REQUIRED_PATTERNS = ['restart', 'reboot', 'перезагруз', 'требуется перезагрузка'];

export class TmuxInstallerBannerAdapter {
  static create(): TmuxInstallerBannerAdapter {
    return new TmuxInstallerBannerAdapter();
  }

  adapt(input: AdaptInput): TmuxInstallerBannerViewModel {
    const status = input.status;
    const snapshot = input.snapshot;
    const t = input.t ?? defaultTmuxInstallerT;
    const displayPhase = this.#resolveDisplayPhase(snapshot, status);
    const hasActiveInstallFlow =
      displayPhase !== 'idle' && displayPhase !== 'completed' && displayPhase !== 'cancelled';
    const tmuxMissing = status ? !status.effective.available : !input.loading;
    const visible =
      hasActiveInstallFlow || (displayPhase !== 'completed' && !input.loading && tmuxMissing);
    const title =
      snapshot.message &&
      (displayPhase === 'pending_external_elevation' ||
        displayPhase === 'waiting_for_external_step' ||
        displayPhase === 'needs_restart' ||
        displayPhase === 'needs_manual_step')
        ? snapshot.message
        : formatTmuxInstallerTitle(displayPhase, t);
    const primaryGuideUrl =
      status?.autoInstall.manualHints.find((hint) => typeof hint.url === 'string')?.url ?? null;
    const body =
      input.error ??
      snapshot.error ??
      snapshot.detail ??
      snapshot.message ??
      status?.effective.detail ??
      status?.wsl?.statusDetail ??
      t('tmuxInstaller.optionalBenefits.default');
    const benefitsBody =
      status && !status.effective.available ? formatTmuxOptionalBenefits(status.platform, t) : null;
    const runtimeReadyLabel = status
      ? status.effective.runtimeReady
        ? t('tmuxInstaller.runtimeReady.ready')
        : status.effective.available
          ? t('tmuxInstaller.runtimeReady.inactive')
          : null
      : null;
    const versionLabel =
      status?.effective.version ?? status?.host.version ?? status?.wsl?.tmuxVersion ?? null;
    const manualHints = status?.autoInstall.manualHints ?? [];
    const manualHintsCollapsible = status?.platform === 'win32' && manualHints.length > 0;
    const installLabel =
      displayPhase === 'idle' &&
      status?.platform === 'win32' &&
      status.autoInstall.strategy === 'wsl' &&
      status.autoInstall.supported
        ? !status.wsl?.wslInstalled
          ? t('tmuxInstaller.installLabels.installWsl')
          : !status.wsl?.distroName
            ? t('tmuxInstaller.installLabels.installUbuntuInWsl')
            : t('tmuxInstaller.installLabels.installTmuxInWsl')
        : formatInstallButtonLabel(displayPhase, t);
    const installDisabled =
      input.loading ||
      displayPhase === 'preparing' ||
      displayPhase === 'checking' ||
      displayPhase === 'requesting_privileges' ||
      displayPhase === 'pending_external_elevation' ||
      displayPhase === 'waiting_for_external_step' ||
      displayPhase === 'installing' ||
      displayPhase === 'verifying';
    const installButtonPrimary =
      !installDisabled &&
      (displayPhase === 'idle' || displayPhase === 'error' || displayPhase === 'needs_manual_step');
    const showRefreshButton =
      !(status?.autoInstall.supported ?? false) ||
      (displayPhase !== 'needs_manual_step' && displayPhase !== 'needs_restart');

    return {
      visible,
      loading: input.loading,
      title,
      body,
      benefitsBody,
      error: input.error ?? snapshot.error ?? status?.error ?? null,
      platformLabel: formatTmuxPlatformLabel(status?.platform ?? null, t),
      locationLabel: formatTmuxLocationLabel(status?.effective.location ?? null, t),
      runtimeReadyLabel,
      versionLabel,
      phase: displayPhase,
      progressPercent: formatTmuxInstallerProgress(displayPhase),
      logs: snapshot.logs,
      manualHints,
      manualHintsCollapsible,
      primaryGuideUrl,
      installSupported: status?.autoInstall.supported ?? false,
      installDisabled,
      installLabel,
      installButtonPrimary,
      showRefreshButton,
      canCancel: snapshot.canCancel,
      acceptsInput: snapshot.acceptsInput,
      inputPrompt: snapshot.inputPrompt,
      inputSecret: snapshot.inputSecret,
      detailsOpen: input.detailsOpen,
    };
  }

  #resolveDisplayPhase(
    snapshot: TmuxInstallerSnapshot,
    status: TmuxStatus | null
  ): TmuxInstallerSnapshot['phase'] {
    if (snapshot.phase !== 'waiting_for_external_step') {
      return snapshot.phase;
    }

    const combinedSignals = [
      snapshot.message,
      snapshot.detail,
      status?.wsl?.statusDetail,
      ...snapshot.logs,
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    const restartRequired =
      status?.wsl?.rebootRequired === true ||
      RESTART_REQUIRED_PATTERNS.some((pattern) => combinedSignals.includes(pattern));

    return restartRequired ? 'needs_restart' : snapshot.phase;
  }
}
