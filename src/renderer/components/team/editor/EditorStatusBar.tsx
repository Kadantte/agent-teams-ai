/**
 * Status bar: cursor position, language, encoding, indent style, git branch.
 */

import React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip';
import { useStore } from '@renderer/store';
import { GitBranch } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

interface EditorStatusBarProps {
  line: number;
  col: number;
  language: string;
}

export const EditorStatusBar = React.memo(function EditorStatusBar({
  line,
  col,
  language,
}: EditorStatusBarProps): React.ReactElement {
  const { gitBranch, isGitRepo, watcherEnabled } = useStore(
    useShallow((s) => ({
      gitBranch: s.editorGitBranch,
      isGitRepo: s.editorIsGitRepo,
      watcherEnabled: s.editorWatcherEnabled,
    }))
  );

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-surface-sidebar px-3 text-[11px] text-text-muted">
      <div className="flex items-center gap-4">
        <span>
          Ln {line}, Col {col}
        </span>
        {isGitRepo && gitBranch && (
          <span className="flex items-center gap-1">
            <GitBranch className="size-3" />
            {gitBranch}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {watcherEnabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default text-green-400">watching</span>
            </TooltipTrigger>
            <TooltipContent side="top">File watcher active</TooltipContent>
          </Tooltip>
        )}
        <span>{language}</span>
        <span>UTF-8</span>
        <span>Spaces: 2</span>
      </div>
    </div>
  );
});
