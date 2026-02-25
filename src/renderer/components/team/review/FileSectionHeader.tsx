import React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip';
import { Loader2, Save, Undo2 } from 'lucide-react';

import type { FileChangeWithContent, HunkDecision } from '@shared/types';
import type { FileChangeSummary } from '@shared/types/review';

const CONTENT_SOURCE_LABELS: Record<string, string> = {
  'file-history': 'File History',
  'snippet-reconstruction': 'Reconstructed',
  'disk-current': 'Current Disk',
  'git-fallback': 'Git Fallback',
  unavailable: 'Unavailable',
};

interface FileSectionHeaderProps {
  file: FileChangeSummary;
  fileContent: FileChangeWithContent | null;
  fileDecision: HunkDecision | undefined;
  hasEdits: boolean;
  applying: boolean;
  onDiscard: (filePath: string) => void;
  onSave: (filePath: string) => void;
}

export const FileSectionHeader = ({
  file,
  fileContent,
  fileDecision,
  hasEdits,
  applying,
  onDiscard,
  onSave,
}: FileSectionHeaderProps): React.ReactElement => {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-sidebar px-4 py-2">
      <span className="text-xs font-medium text-text">{file.relativePath}</span>

      {file.isNewFile && (
        <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-400">
          NEW
        </span>
      )}

      {fileContent?.contentSource && (
        <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted">
          {CONTENT_SOURCE_LABELS[fileContent.contentSource] ?? fileContent.contentSource}
        </span>
      )}

      {fileDecision && (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${
            fileDecision === 'accepted'
              ? 'bg-green-500/20 text-green-400'
              : fileDecision === 'rejected'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-zinc-500/20 text-zinc-400'
          }`}
        >
          {fileDecision}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {hasEdits && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onDiscard(file.filePath)}
                  className="flex items-center gap-1 rounded bg-orange-500/15 px-2 py-1 text-xs text-orange-400 transition-colors hover:bg-orange-500/25"
                >
                  <Undo2 className="size-3" />
                  Discard
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Discard all edits for this file</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSave(file.filePath)}
                  disabled={applying}
                  className="flex items-center gap-1 rounded bg-green-500/15 px-2 py-1 text-xs text-green-400 transition-colors hover:bg-green-500/25 disabled:opacity-50"
                >
                  {applying ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Save className="size-3" />
                  )}
                  Save File
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>Save file to disk</span>
                <kbd className="ml-2 rounded border border-border bg-surface-raised px-1 py-0.5 font-mono text-[10px] text-text-muted">
                  ⌘↵
                </kbd>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
};
