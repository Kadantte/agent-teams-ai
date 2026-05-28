import { useEffect } from 'react';

import { useStore } from '@renderer/store';
import { isTeamProvisioningActive, selectTeamDataForName } from '@renderer/store/slices/teamSlice';
import { useShallow } from 'zustand/react/shallow';

const TEAM_AGENT_RUNTIME_ACTIVE_REFRESH_MS = 5_000;
const TEAM_AGENT_RUNTIME_IDLE_REFRESH_MS = 15_000;
const TEAM_AGENT_RUNTIME_REFRESH_GRACE_MS = 500;

type FetchTeamAgentRuntime = (teamName: string) => Promise<void>;

const runtimeRefreshInFlightByTeam = new Map<string, Promise<void>>();
const runtimeRefreshLastStartedAtByTeam = new Map<string, number>();

function getTeamAgentRuntimeRefreshMs({
  isTeamProvisioning,
  leadActivity,
}: {
  isTeamProvisioning: boolean | undefined;
  leadActivity: string | undefined;
}): number {
  return isTeamProvisioning || leadActivity === 'active'
    ? TEAM_AGENT_RUNTIME_ACTIVE_REFRESH_MS
    : TEAM_AGENT_RUNTIME_IDLE_REFRESH_MS;
}

function requestTeamAgentRuntimeRefresh(
  teamName: string,
  fetchTeamAgentRuntime: FetchTeamAgentRuntime,
  minRefreshGapMs: number
): Promise<void> {
  const inFlight = runtimeRefreshInFlightByTeam.get(teamName);
  if (inFlight) {
    return inFlight;
  }

  const now = Date.now();
  const lastStartedAt = runtimeRefreshLastStartedAtByTeam.get(teamName);
  if (lastStartedAt !== undefined && now - lastStartedAt < minRefreshGapMs) {
    return Promise.resolve();
  }

  runtimeRefreshLastStartedAtByTeam.set(teamName, now);

  let refreshPromise: Promise<void>;
  try {
    refreshPromise = fetchTeamAgentRuntime(teamName);
  } catch (error) {
    runtimeRefreshLastStartedAtByTeam.delete(teamName);
    return Promise.reject(error);
  }

  const trackedPromise = refreshPromise.finally(() => {
    if (runtimeRefreshInFlightByTeam.get(teamName) === trackedPromise) {
      runtimeRefreshInFlightByTeam.delete(teamName);
    }
  });
  runtimeRefreshInFlightByTeam.set(teamName, trackedPromise);
  return trackedPromise;
}

export function __resetTeamAgentRuntimeWatcherForTests(): void {
  runtimeRefreshInFlightByTeam.clear();
  runtimeRefreshLastStartedAtByTeam.clear();
}

interface TeamAgentRuntimeWatcherOptions {
  teamName: string;
  enabled: boolean;
  isTeamProvisioning?: boolean;
  isTeamAlive?: boolean;
}

export function useTeamAgentRuntimeWatcher({
  teamName,
  enabled,
  isTeamProvisioning,
  isTeamAlive,
}: TeamAgentRuntimeWatcherOptions): void {
  const { leadActivity, storeIsTeamAlive, storeIsTeamProvisioning, fetchTeamAgentRuntime } =
    useStore(
      useShallow((s) => ({
        leadActivity: s.leadActivityByTeam[teamName],
        storeIsTeamAlive: selectTeamDataForName(s, teamName)?.isAlive,
        storeIsTeamProvisioning: isTeamProvisioningActive(s, teamName),
        fetchTeamAgentRuntime: s.fetchTeamAgentRuntime,
      }))
    );

  const effectiveIsTeamAlive = isTeamAlive ?? storeIsTeamAlive;
  const effectiveIsTeamProvisioning = isTeamProvisioning ?? storeIsTeamProvisioning;

  useEffect(() => {
    if (!enabled) return;
    const shouldWatch =
      effectiveIsTeamProvisioning ||
      effectiveIsTeamAlive === true ||
      leadActivity === 'active' ||
      leadActivity === 'idle';
    if (!shouldWatch) return;

    const refreshMs = getTeamAgentRuntimeRefreshMs({
      isTeamProvisioning: effectiveIsTeamProvisioning,
      leadActivity,
    });
    const minRefreshGapMs = Math.max(0, refreshMs - TEAM_AGENT_RUNTIME_REFRESH_GRACE_MS);

    void requestTeamAgentRuntimeRefresh(teamName, fetchTeamAgentRuntime, minRefreshGapMs);
    const timer = window.setInterval(() => {
      void requestTeamAgentRuntimeRefresh(teamName, fetchTeamAgentRuntime, minRefreshGapMs);
    }, refreshMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [
    effectiveIsTeamAlive,
    effectiveIsTeamProvisioning,
    enabled,
    fetchTeamAgentRuntime,
    leadActivity,
    teamName,
  ]);
}
