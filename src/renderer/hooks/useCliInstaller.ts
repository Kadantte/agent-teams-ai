/**
 * useCliInstaller — shared hook for CLI installer state.
 *
 * Centralizes all store selectors and computed state for CLI installation.
 * Used by both CliStatusBanner (Dashboard) and CliStatusSection (Settings).
 */

import { useStore } from '@renderer/store';
import { useShallow } from 'zustand/react/shallow';

import type { CliInstallationStatus } from '@shared/types';

export function useCliInstaller(): {
  cliStatus: CliInstallationStatus | null;
  cliStatusLoading: boolean;
  cliStatusError: string | null;
  installerState:
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'verifying'
    | 'installing'
    | 'completed'
    | 'error';
  downloadProgress: number;
  downloadTransferred: number;
  downloadTotal: number;
  installerError: string | null;
  installerDetail: string | null;
  installerRawChunks: string[];
  completedVersion: string | null;
  fetchCliStatus: () => Promise<void>;
  invalidateCliStatus: () => Promise<void>;
  installCli: () => void;
  isBusy: boolean;
} {
  const {
    cliStatus,
    cliStatusLoading,
    cliStatusError,
    installerState,
    downloadProgress,
    downloadTransferred,
    downloadTotal,
    installerError,
    installerDetail,
    installerRawChunks,
    completedVersion,
    fetchCliStatus,
    invalidateCliStatus,
    installCli,
  } = useStore(
    useShallow((s) => ({
      cliStatus: s.cliStatus,
      cliStatusLoading: s.cliStatusLoading,
      cliStatusError: s.cliStatusError,
      installerState: s.cliInstallerState,
      downloadProgress: s.cliDownloadProgress,
      downloadTransferred: s.cliDownloadTransferred,
      downloadTotal: s.cliDownloadTotal,
      installerError: s.cliInstallerError,
      installerDetail: s.cliInstallerDetail,
      installerRawChunks: s.cliInstallerRawChunks,
      completedVersion: s.cliCompletedVersion,
      fetchCliStatus: s.fetchCliStatus,
      invalidateCliStatus: s.invalidateCliStatus,
      installCli: s.installCli,
    }))
  );

  const isBusy = installerState !== 'idle' && installerState !== 'error';

  return {
    cliStatus,
    cliStatusLoading,
    cliStatusError,
    installerState,
    downloadProgress,
    downloadTransferred,
    downloadTotal,
    installerError,
    installerDetail,
    installerRawChunks,
    completedVersion,
    fetchCliStatus,
    invalidateCliStatus,
    installCli,
    isBusy,
  };
}
