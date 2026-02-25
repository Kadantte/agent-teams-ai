import React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip';
import { cn } from '@renderer/lib/utils';
import {
  Check,
  Eye,
  EyeOff,
  FoldVertical,
  GitMerge,
  Loader2,
  Pencil,
  UnfoldVertical,
  X,
} from 'lucide-react';

import type { ChangeStats } from '@shared/types';

interface ReviewToolbarProps {
  stats: { pending: number; accepted: number; rejected: number };
  changeStats: ChangeStats;
  collapseUnchanged: boolean;
  applying: boolean;
  autoViewed: boolean;
  onAutoViewedChange: (auto: boolean) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onApply: () => void;
  onCollapseUnchangedChange: (collapse: boolean) => void;
  editedCount?: number;
}

export const ReviewToolbar = ({
  stats,
  changeStats,
  collapseUnchanged,
  applying,
  autoViewed,
  onAutoViewedChange,
  onAcceptAll,
  onRejectAll,
  onApply,
  onCollapseUnchangedChange,
  editedCount = 0,
}: ReviewToolbarProps): React.ReactElement => {
  const hasRejected = stats.rejected > 0;
  const canApply = hasRejected && !applying;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface-sidebar px-4 py-2">
      {/* Decision stats */}
      <div className="flex items-center gap-2 text-xs">
        {stats.pending > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/20 px-2 py-0.5 text-zinc-400">
            {stats.pending} pending
          </span>
        )}
        {stats.accepted > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-green-400">
            <Check className="size-3" />
            {stats.accepted} accepted
          </span>
        )}
        {stats.rejected > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-red-400">
            <X className="size-3" />
            {stats.rejected} rejected
          </span>
        )}
      </div>

      {/* Change stats */}
      <div className="flex items-center gap-1 text-xs text-text-muted">
        <span className="text-green-400">+{changeStats.linesAdded}</span>
        <span className="text-red-400">-{changeStats.linesRemoved}</span>
        <span className="ml-1">across {changeStats.filesChanged} files</span>
      </div>

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onCollapseUnchangedChange(!collapseUnchanged)}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
              collapseUnchanged ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'
            )}
          >
            {collapseUnchanged ? (
              <FoldVertical className="size-3.5" />
            ) : (
              <UnfoldVertical className="size-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {collapseUnchanged ? 'Show all lines' : 'Collapse unchanged regions'}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onAutoViewedChange(!autoViewed)}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
              autoViewed ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'
            )}
          >
            {autoViewed ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            <span className="text-[10px]">Auto</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {autoViewed
            ? 'Auto-mark files as viewed when scrolled to end (ON)'
            : 'Auto-mark files as viewed when scrolled to end (OFF)'}
        </TooltipContent>
      </Tooltip>

      <div className="h-4 w-px bg-border" />

      {editedCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
          <Pencil className="size-3" /> {editedCount} edited
        </span>
      )}

      {editedCount > 0 && <div className="h-4 w-px bg-border" />}

      {/* Actions */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onAcceptAll}
            className="flex items-center gap-1 rounded bg-green-500/15 px-2.5 py-1 text-xs text-green-400 transition-colors hover:bg-green-500/25"
          >
            <Check className="size-3" />
            Accept All
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Accept all changes in current file</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onRejectAll}
            className="flex items-center gap-1 rounded bg-red-500/15 px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/25"
          >
            <X className="size-3" />
            Reject All
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Reject all changes in current file</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onApply}
            disabled={!canApply}
            className={cn(
              'flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors',
              canApply
                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                : 'cursor-not-allowed bg-zinc-500/10 text-zinc-600'
            )}
          >
            {applying ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <GitMerge className="size-3" />
            )}
            {applying ? 'Applying...' : 'Apply All Changes'}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Apply review decisions across all files</TooltipContent>
      </Tooltip>
    </div>
  );
};
