/**
 * Status bar: cursor position, language, encoding, indent style, git branch.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip';
import { useStore } from '@renderer/store';
import { GitBranch } from 'lucide-react';

interface EditorStatusBarProps {
  line: number;
  col: number;
  language: string;
}

export const EditorStatusBar = ({
  line,
  col,
  language,
}: EditorStatusBarProps): React.ReactElement => {
  const gitBranch = useStore((s) => s.editorGitBranch);
  const isGitRepo = useStore((s) => s.editorIsGitRepo);
  const watcherEnabled = useStore((s) => s.editorWatcherEnabled);

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
};
