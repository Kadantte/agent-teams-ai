import React from 'react';

import { Label } from '@renderer/components/ui/label';
import { cn } from '@renderer/lib/utils';

const MODEL_OPTIONS = [
  { value: '', label: 'Default (account setting)' },
  { value: 'opus', label: 'Opus 4.6' },
  { value: 'sonnet', label: 'Sonnet 4.5' },
  { value: 'haiku', label: 'Haiku 4.5' },
] as const;

export interface TeamModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
}

export const TeamModelSelector: React.FC<TeamModelSelectorProps> = ({
  value,
  onValueChange,
  id,
}) => (
  <div className="flex items-center gap-2.5">
    <Label htmlFor={id} className="label-optional shrink-0">
      Model (optional)
    </Label>
    <div className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
      {MODEL_OPTIONS.map((opt) => (
        <button
          key={opt.value || '__default__'}
          type="button"
          id={opt.value === value ? id : undefined}
          className={cn(
            'rounded-[3px] px-3 py-1 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-sm'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
          )}
          onClick={() => onValueChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);
