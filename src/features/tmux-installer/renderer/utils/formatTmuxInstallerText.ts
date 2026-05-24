import type { useAppTranslation } from '@features/localization/renderer';
import type { TmuxInstallerPhase } from '@features/tmux-installer/contracts';
import type { TmuxPlatform } from '@features/tmux-installer/contracts';

type CommonT = ReturnType<typeof useAppTranslation>['t'];
type TmuxTextOptions = Record<string, unknown>;

const defaultTmuxInstallerText: Record<string, string> = {
  'tmuxInstaller.summaryTitle': 'tmux is not installed',
  'tmuxInstaller.titles.preparing': 'Preparing tmux installation',
  'tmuxInstaller.titles.pendingExternalElevation': 'Waiting for an administrator step',
  'tmuxInstaller.titles.waitingForExternalStep': 'Finish the external setup step',
  'tmuxInstaller.titles.installing': 'Installing tmux',
  'tmuxInstaller.titles.verifying': 'Verifying tmux installation',
  'tmuxInstaller.titles.needsRestart': 'Restart required before tmux setup can continue',
  'tmuxInstaller.titles.error': 'tmux installation failed',
  'tmuxInstaller.titles.needsManualStep': 'tmux needs a manual step',
  'tmuxInstaller.titles.completed': 'tmux installed',
  'tmuxInstaller.titles.cancelled': 'tmux installation cancelled',
  'tmuxInstaller.installLabels.retryInstall': 'Retry install',
  'tmuxInstaller.actions.recheck': 'Re-check',
  'tmuxInstaller.installLabels.recheckAfterRestart': 'Re-check after restart',
  'tmuxInstaller.installLabels.installing': 'Installing...',
  'tmuxInstaller.installLabels.installTmux': 'Install tmux',
  'tmuxInstaller.installLabels.installWsl': 'Install WSL',
  'tmuxInstaller.installLabels.installUbuntuInWsl': 'Install Ubuntu in WSL',
  'tmuxInstaller.installLabels.installTmuxInWsl': 'Install tmux in WSL',
  'tmuxInstaller.platforms.unknown': 'Unknown OS',
  'tmuxInstaller.locations.host': 'Host runtime',
  'tmuxInstaller.locations.wsl': 'WSL runtime',
  'tmuxInstaller.runtimeReady.ready': 'Pane transport ready',
  'tmuxInstaller.runtimeReady.inactive': 'Installed, optional transport inactive',
  'tmuxInstaller.optionalBenefits.default':
    'Optional. The app works without tmux. Install tmux only if you want pane-based terminal transport for long-running teammate sessions.',
  'tmuxInstaller.optionalBenefits.windows':
    'Optional. The app works without tmux. Install WSL-backed tmux only if you want pane-based terminal transport for long-running teammate sessions.',
};

export const defaultTmuxInstallerT = ((key: Parameters<CommonT>[0], _options?: TmuxTextOptions) =>
  defaultTmuxInstallerText[String(key)] ?? String(key)) as CommonT;

export function formatTmuxInstallerTitle(phase: TmuxInstallerPhase, t: CommonT): string {
  if (phase === 'preparing' || phase === 'checking') return t('tmuxInstaller.titles.preparing');
  if (phase === 'pending_external_elevation')
    return t('tmuxInstaller.titles.pendingExternalElevation');
  if (phase === 'waiting_for_external_step')
    return t('tmuxInstaller.titles.waitingForExternalStep');
  if (phase === 'installing') return t('tmuxInstaller.titles.installing');
  if (phase === 'verifying') return t('tmuxInstaller.titles.verifying');
  if (phase === 'needs_restart') return t('tmuxInstaller.titles.needsRestart');
  if (phase === 'error') return t('tmuxInstaller.titles.error');
  if (phase === 'needs_manual_step') return t('tmuxInstaller.titles.needsManualStep');
  if (phase === 'completed') return t('tmuxInstaller.titles.completed');
  if (phase === 'cancelled') return t('tmuxInstaller.titles.cancelled');
  return t('tmuxInstaller.summaryTitle');
}

export function formatInstallButtonLabel(phase: TmuxInstallerPhase, t: CommonT): string {
  if (phase === 'error') return t('tmuxInstaller.installLabels.retryInstall');
  if (phase === 'needs_manual_step') return t('tmuxInstaller.actions.recheck');
  if (phase === 'needs_restart') return t('tmuxInstaller.installLabels.recheckAfterRestart');
  if (
    phase === 'preparing' ||
    phase === 'checking' ||
    phase === 'pending_external_elevation' ||
    phase === 'waiting_for_external_step' ||
    phase === 'installing' ||
    phase === 'verifying'
  ) {
    return t('tmuxInstaller.installLabels.installing');
  }
  return t('tmuxInstaller.installLabels.installTmux');
}

export function formatTmuxInstallerProgress(phase: TmuxInstallerPhase): number | null {
  if (phase === 'checking') return 8;
  if (phase === 'preparing') return 18;
  if (phase === 'requesting_privileges') return 32;
  if (phase === 'pending_external_elevation') return 32;
  if (phase === 'waiting_for_external_step') return 48;
  if (phase === 'installing') return 68;
  if (phase === 'verifying') return 90;
  if (phase === 'needs_restart') return 96;
  if (phase === 'completed') return 100;
  if (phase === 'needs_manual_step') return 82;
  if (phase === 'error') return 100;
  if (phase === 'cancelled') return 0;
  return null;
}

export function formatTmuxPlatformLabel(platform: TmuxPlatform | null, t: CommonT): string | null {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  if (platform === 'win32') return 'Windows';
  if (platform === 'unknown') return t('tmuxInstaller.platforms.unknown');
  return null;
}

export function formatTmuxLocationLabel(
  location: 'host' | 'wsl' | null,
  t: CommonT
): string | null {
  if (location === 'host') return t('tmuxInstaller.locations.host');
  if (location === 'wsl') return t('tmuxInstaller.locations.wsl');
  return null;
}

export function formatTmuxOptionalBenefits(
  platform: TmuxPlatform | null,
  t: CommonT
): string | null {
  if (!platform) {
    return null;
  }

  if (platform === 'win32') {
    return t('tmuxInstaller.optionalBenefits.windows');
  }

  return t('tmuxInstaller.optionalBenefits.default');
}
