import { AlertTriangle, X } from 'lucide-react';

import type { TaskScopeConfidence } from '@shared/types';

interface ScopeWarningBannerProps {
  warnings: string[];
  confidence: TaskScopeConfidence;
  onDismiss?: () => void;
}

export const ScopeWarningBanner = ({
  warnings,
  confidence,
  onDismiss,
}: ScopeWarningBannerProps) => {
  if (warnings.length === 0 && confidence.tier <= 2) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-400" />
      <div className="flex-1">
        <p className="font-medium text-yellow-300">
          {confidence.tier >= 3
            ? 'Task boundary detection is approximate'
            : 'Note about these changes'}
        </p>
        {warnings.map((w, i) => (
          <p key={i} className="mt-1 text-text-secondary">
            {w}
          </p>
        ))}
        <p className="mt-1 text-xs text-text-muted">Detection: {confidence.reason}</p>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-text-muted hover:text-text">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
};
