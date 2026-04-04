import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@renderer/components/ui/button';
import { useStore } from '@renderer/store';
import { getCurrentProvisioningProgressForTeam } from '@renderer/store/slices/teamSlice';
import { isLeadMember } from '@shared/utils/leadDetection';
import { X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { ProvisioningProgressBlock } from './ProvisioningProgressBlock';
import { getDisplayStepIndex } from './provisioningSteps';

interface TeamProvisioningBannerProps {
  teamName: string;
}

export const TeamProvisioningBanner = ({
  teamName,
}: TeamProvisioningBannerProps): React.JSX.Element | null => {
  const { progress, cancelProvisioning, teamMembers, memberSpawnStatuses } = useStore(
    useShallow((s) => ({
      progress: getCurrentProvisioningProgressForTeam(s, teamName),
      cancelProvisioning: s.cancelProvisioning,
      teamMembers: s.selectedTeamData?.members,
      memberSpawnStatuses: s.memberSpawnStatusesByTeam[teamName],
    }))
  );
  const [dismissed, setDismissed] = useState(false);
  const lastActiveStepRef = useRef(-1);
  const bannerInstanceKey = useMemo(() => {
    if (!progress) return null;
    return `${teamName}:${progress.runId}:${progress.startedAt}`;
  }, [teamName, progress?.runId, progress?.startedAt]);

  useEffect(() => {
    setDismissed(false);
  }, [bannerInstanceKey]);

  // NOTE: we intentionally do NOT auto-dismiss "ready" banners.
  // Users frequently need to inspect launch output after fast stop→start cycles,
  // and auto-dismiss can make it look like no progress/logs were produced.

  if (!progress || dismissed) {
    return null;
  }

  if (progress.state === 'cancelled' || progress.state === 'disconnected') {
    return null;
  }

  const isReady = progress.state === 'ready';
  const isFailed = progress.state === 'failed';
  const isActive =
    progress.state === 'validating' ||
    progress.state === 'spawning' ||
    progress.state === 'configuring' ||
    progress.state === 'assembling' ||
    progress.state === 'finalizing' ||
    progress.state === 'verifying';

  const canCancel =
    progress.state === 'spawning' ||
    progress.state === 'configuring' ||
    progress.state === 'assembling' ||
    progress.state === 'finalizing' ||
    progress.state === 'verifying';

  const progressStepIndex = getDisplayStepIndex(progress.state);

  // Remember last active step so we can show it as the error location when failed
  if (progressStepIndex >= 0 && !isFailed) {
    lastActiveStepRef.current = progressStepIndex;
  }

  if (isFailed) {
    return (
      <div className="mb-3">
        <div className="mb-2 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
          <p className="flex-1 text-xs text-[var(--step-error-text)]">{progress.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 border-red-500/40 px-2 text-xs text-[var(--step-error-text)] hover:bg-red-500/10"
            onClick={() => setDismissed(true)}
          >
            <X size={12} />
          </Button>
        </div>
        <ProvisioningProgressBlock
          key={progress.runId}
          title="Launch failed"
          message={progress.error ?? null}
          tone="error"
          currentStepIndex={lastActiveStepRef.current}
          errorStepIndex={lastActiveStepRef.current >= 0 ? lastActiveStepRef.current : 0}
          startedAt={progress.startedAt}
          pid={progress.pid}
          cliLogsTail={progress.cliLogsTail}
          assistantOutput={progress.assistantOutput}
          defaultLiveOutputOpen
          onCancel={null}
        />
      </div>
    );
  }

  const teammates = (teamMembers ?? []).filter((member) => !isLeadMember(member));
  const failedSpawnEntries = Object.entries(memberSpawnStatuses ?? {}).filter(
    ([, entry]) => entry.status === 'error'
  );
  const failedSpawnCount = failedSpawnEntries.length;
  const heartbeatConfirmedCount = teammates.filter((member) => {
    const entry = memberSpawnStatuses?.[member.name];
    return entry?.status === 'online' && entry.livenessSource === 'heartbeat';
  }).length;
  const processOnlyAliveCount = teammates.filter((member) => {
    const entry = memberSpawnStatuses?.[member.name];
    return entry?.status === 'online' && entry.livenessSource === 'process';
  }).length;
  const awaitingHeartbeatCount = teammates.filter((member) => {
    const entry = memberSpawnStatuses?.[member.name];
    return entry?.status === 'waiting';
  }).length;
  const allTeammatesConfirmedAlive =
    teammates.length > 0 && failedSpawnCount === 0 && heartbeatConfirmedCount === teammates.length;

  if (isReady) {
    const readyMessage =
      failedSpawnCount > 0
        ? `Launch finished with errors — ${failedSpawnCount}/${Math.max(teammates.length, failedSpawnCount)} teammates failed to start`
        : teammates.length === 0
          ? 'Team launched — lead online'
          : allTeammatesConfirmedAlive
            ? `Team launched — all ${teammates.length} teammates confirmed alive`
            : processOnlyAliveCount > 0 || awaitingHeartbeatCount > 0
              ? `Team launched — ${heartbeatConfirmedCount}/${teammates.length} teammates confirmed alive${processOnlyAliveCount > 0 ? `, ${processOnlyAliveCount} runtime${processOnlyAliveCount === 1 ? '' : 's'} alive but bootstrap still pending` : ''}${awaitingHeartbeatCount > 0 ? `${processOnlyAliveCount > 0 ? ', ' : ', '}${awaitingHeartbeatCount} awaiting first heartbeat` : ''}`
              : 'Team launched — teammate liveness is still being confirmed';

    return (
      <div className="mb-3">
        <ProvisioningProgressBlock
          key={progress.runId}
          title="Launch details"
          message={progress.message}
          messageSeverity={progress.messageSeverity}
          currentStepIndex={progressStepIndex >= 0 ? progressStepIndex : -1}
          startedAt={progress.startedAt}
          pid={progress.pid}
          cliLogsTail={progress.cliLogsTail}
          assistantOutput={progress.assistantOutput}
          defaultLiveOutputOpen={false}
          onCancel={null}
          successMessage={readyMessage}
          successMessageSeverity={failedSpawnCount > 0 ? 'warning' : 'success'}
          onDismiss={() => setDismissed(true)}
        />
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="mb-3">
        <ProvisioningProgressBlock
          key={progress.runId}
          title="Launching team"
          message={progress.message}
          messageSeverity={progress.messageSeverity}
          currentStepIndex={progressStepIndex >= 0 ? progressStepIndex : -1}
          loading
          startedAt={progress.startedAt}
          pid={progress.pid}
          cliLogsTail={progress.cliLogsTail}
          assistantOutput={progress.assistantOutput}
          defaultLiveOutputOpen
          onCancel={
            canCancel
              ? () => {
                  void cancelProvisioning(progress.runId);
                }
              : null
          }
        />
      </div>
    );
  }

  return null;
};
