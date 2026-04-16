import { useEffect, useMemo, useRef, useState } from 'react';

import { DISPLAY_STEPS } from '@renderer/components/team/provisioningSteps';
import { StepProgressBar } from '@renderer/components/team/StepProgressBar';
import { TeamProvisioningPanel } from '@renderer/components/team/TeamProvisioningPanel';
import { useTeamProvisioningPresentation } from '@renderer/components/team/useTeamProvisioningPresentation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { cn } from '@renderer/lib/utils';

import type { TeamProvisioningPresentation } from '@renderer/utils/teamProvisioningPresentation';
import type { CSSProperties } from 'react';

const MINI_STEPS = DISPLAY_STEPS.map((step) => ({ key: step.key, label: step.label }));
const HUD_STEPPER_STYLE: CSSProperties = {
  ['--stepper-done' as string]: '#22c55e',
  ['--stepper-done-glow' as string]: 'rgba(34, 197, 94, 0.24)',
  ['--stepper-current' as string]: '#22c55e',
  ['--stepper-current-ring' as string]: 'rgba(34, 197, 94, 0.18)',
  ['--stepper-pending' as string]: 'rgba(148, 163, 184, 0.08)',
  ['--stepper-pending-text' as string]: '#cbd5e1',
  ['--stepper-pending-border' as string]: 'rgba(148, 163, 184, 0.2)',
  ['--stepper-line' as string]: 'rgba(148, 163, 184, 0.14)',
  ['--stepper-line-done' as string]: '#22c55e',
  ['--stepper-label' as string]: '#94a3b8',
  ['--stepper-label-active' as string]: '#e2e8f0',
  ['--stepper-error' as string]: '#ef4444',
  ['--stepper-error-glow' as string]: 'rgba(239, 68, 68, 0.22)',
  ['--stepper-label-error' as string]: '#fca5a5',
};

function shouldRenderLaunchHud(presentation: TeamProvisioningPresentation | null): boolean {
  return presentation != null;
}

function getToneClasses(tone: TeamProvisioningPresentation['compactTone']): {
  border: string;
} {
  switch (tone) {
    case 'error':
      return {
        border: 'border-red-400/35 bg-[rgba(26,10,16,0.9)]',
      };
    case 'warning':
      return {
        border: 'border-amber-400/35 bg-[rgba(31,18,8,0.9)]',
      };
    case 'success':
      return {
        border: 'border-emerald-400/35 bg-[rgba(8,24,18,0.9)]',
      };
    default:
      return {
        border: 'border-cyan-400/25 bg-[rgba(8,14,26,0.9)]',
      };
  }
}

export interface GraphProvisioningHudProps {
  teamName: string;
  enabled?: boolean;
}

export const GraphProvisioningHud = ({
  teamName,
  enabled = true,
}: GraphProvisioningHudProps): React.JSX.Element | null => {
  const { presentation, runInstanceKey } = useTeamProvisioningPresentation(teamName);
  const lastActiveStepRef = useRef(-1);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const shouldRender = enabled && shouldRenderLaunchHud(presentation);
  const tone = presentation ? getToneClasses(presentation.compactTone) : null;
  const errorStepIndex = presentation?.isFailed
    ? lastActiveStepRef.current >= 0
      ? lastActiveStepRef.current
      : 0
    : undefined;

  useEffect(() => {
    setDetailsOpen(false);
    lastActiveStepRef.current = -1;
  }, [runInstanceKey, teamName]);

  useEffect(() => {
    if (presentation && !presentation.isFailed && presentation.currentStepIndex >= 0) {
      lastActiveStepRef.current = presentation.currentStepIndex;
    }
  }, [presentation]);

  const ariaLabel = useMemo(() => {
    const parts = [presentation?.compactTitle, presentation?.compactDetail].filter(Boolean);
    return parts.join(' - ') || 'Open launch details';
  }, [presentation?.compactDetail, presentation?.compactTitle]);

  if (!shouldRender || !presentation || !tone) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          'w-full rounded-xl border px-3 py-2 text-left text-slate-100 shadow-[0_14px_34px_rgba(5,5,16,0.24)] backdrop-blur-xl transition-colors hover:bg-[rgba(12,18,32,0.96)]',
          tone.border
        )}
        onClick={() => setDetailsOpen(true)}
        aria-label={ariaLabel}
      >
        <div
          className="overflow-hidden rounded-lg border border-white/10 bg-[rgba(4,10,20,0.54)] px-2.5 py-1.5"
          style={HUD_STEPPER_STYLE}
        >
          <StepProgressBar
            steps={MINI_STEPS}
            currentIndex={presentation.currentStepIndex}
            errorIndex={errorStepIndex}
            className="w-full origin-top scale-[0.9]"
          />
        </div>
        <span className="sr-only">{ariaLabel}</span>
      </button>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[min(1120px,92vw)] max-w-5xl p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Launch details</DialogTitle>
            <DialogDescription>
              Detailed team launch progress, live output and CLI logs.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[85vh] overflow-y-auto p-4">
            <TeamProvisioningPanel teamName={teamName} surface="flat" defaultLogsOpen />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
