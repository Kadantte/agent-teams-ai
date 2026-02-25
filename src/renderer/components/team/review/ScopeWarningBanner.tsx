import { useState } from 'react';

import { cn } from '@renderer/lib/utils';
import { AlertTriangle, ChevronRight, Info, ShieldCheck, X } from 'lucide-react';

import { ConfidenceBadge } from './ConfidenceBadge';

import type { TaskScopeConfidence } from '@shared/types';
import type { FC } from 'react';

interface ScopeWarningBannerProps {
  warnings: string[];
  confidence: TaskScopeConfidence;
  onDismiss?: () => void;
}

interface TierConfig {
  Icon: FC<{ className?: string }>;
  border: string;
  bg: string;
  accentColor: string;
  title: string;
  detail: string;
}

const TIER_CONFIGS: Record<number, TierConfig> = {
  1: {
    Icon: ShieldCheck,
    border: 'border-emerald-500/15',
    bg: 'bg-emerald-500/5',
    accentColor: 'text-emerald-400',
    title: 'Scope determined precisely',
    detail:
      'Both start (TaskUpdate → in_progress) and completion (TaskUpdate → completed) markers found in the session log. The diff includes only file modifications (Edit, Write) between these two boundaries.',
  },
  2: {
    Icon: Info,
    border: 'border-blue-500/15',
    bg: 'bg-blue-500/5',
    accentColor: 'text-blue-400',
    title: 'End boundary estimated',
    detail:
      'Only the start marker (TaskUpdate → in_progress) was found — the task has no completion marker yet. Changes shown from start marker to end of session log.',
  },
  3: {
    Icon: AlertTriangle,
    border: 'border-orange-500/20',
    bg: 'bg-orange-500/5',
    accentColor: 'text-orange-400',
    title: 'Start boundary estimated',
    detail:
      'Only the completion marker (TaskUpdate → completed) was found. The start of work was not captured — this can happen if the task was already in progress when the session began. Changes shown from session start to completion marker.',
  },
  4: {
    Icon: AlertTriangle,
    border: 'border-red-500/20',
    bg: 'bg-red-500/5',
    accentColor: 'text-red-400',
    title: 'Showing all session changes',
    detail:
      'No TaskUpdate markers found in the session log. Cannot determine task-specific boundaries — this can happen with older CLI versions or non-standard workflows. All file modifications from the session are included.',
  },
};

export const ScopeWarningBanner = ({
  warnings,
  confidence,
  onDismiss,
}: ScopeWarningBannerProps): JSX.Element => {
  const [expanded, setExpanded] = useState(false);
  const config = TIER_CONFIGS[confidence.tier] ?? TIER_CONFIGS[4];
  const { Icon } = config;

  return (
    <div className={cn('border-b px-4 py-2', config.border, config.bg)}>
      <div className="flex items-center gap-2">
        <Icon className={cn('size-3.5 shrink-0', config.accentColor)} />
        <span className={cn('text-xs font-medium', config.accentColor)}>{config.title}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          Read more
          <ChevronRight className={cn('size-3 transition-transform', expanded && 'rotate-90')} />
        </button>

        <div className="flex-1" />

        <ConfidenceBadge confidence={confidence} />

        {onDismiss && (
          <button onClick={onDismiss} className="text-text-muted hover:text-text">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 pl-6 text-xs text-text-secondary">
          <p>{config.detail}</p>
          {warnings.length > 0 && (
            <ul className="list-inside list-disc space-y-0.5 text-text-muted">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
