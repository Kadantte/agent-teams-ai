import { useMemo } from 'react';

import { diffLines } from 'diff';

import type { FileChangeSummary, SnippetDiff } from '@shared/types/review';

interface ReviewDiffContentProps {
  file: FileChangeSummary;
}

const SnippetDiffView = ({ snippet, index }: { snippet: SnippetDiff; index: number }) => {
  const diffResult = useMemo(() => {
    if (snippet.type === 'write-new') {
      // Весь файл — новый
      return diffLines('', snippet.newString);
    }
    if (snippet.type === 'write-update') {
      // Полная перезапись
      return diffLines('', snippet.newString);
    }
    return diffLines(snippet.oldString, snippet.newString);
  }, [snippet]);

  const toolLabel =
    snippet.type === 'write-new'
      ? 'New file'
      : snippet.type === 'write-update'
        ? 'Full rewrite'
        : snippet.type === 'multi-edit'
          ? 'Multi-edit'
          : 'Edit';

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {/* Заголовок snippet */}
      <div className="flex items-center justify-between border-b border-border bg-surface-raised px-3 py-1.5">
        <span className="text-xs text-text-muted">
          #{index + 1} {toolLabel}
        </span>
        <span className="text-xs text-text-muted">
          {snippet.timestamp ? new Date(snippet.timestamp).toLocaleTimeString() : ''}
        </span>
      </div>

      {/* Строки диффа */}
      <div className="overflow-x-auto font-mono text-xs leading-5">
        {diffResult.map((part, i) => {
          const lines = part.value.replace(/\n$/, '').split('\n');
          return lines.map((line, j) => {
            let bgClass = '';
            let prefix = ' ';
            let textClass = 'text-text-secondary';

            if (part.added) {
              bgClass = 'bg-[var(--diff-added-bg,rgba(46,160,67,0.15))]';
              prefix = '+';
              textClass = 'text-[var(--diff-added-text,#3fb950)]';
            } else if (part.removed) {
              bgClass = 'bg-[var(--diff-removed-bg,rgba(248,81,73,0.15))]';
              prefix = '-';
              textClass = 'text-[var(--diff-removed-text,#f85149)]';
            }

            return (
              <div key={`${i}-${j}`} className={`px-3 ${bgClass} ${textClass}`}>
                <span className="inline-block w-4 select-none text-text-muted opacity-50">
                  {prefix}
                </span>
                <span className="whitespace-pre">{line}</span>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
};

export const ReviewDiffContent = ({ file }: ReviewDiffContentProps) => {
  const nonErrorSnippets = useMemo(() => file.snippets.filter((s) => !s.isError), [file.snippets]);

  return (
    <div className="space-y-4 p-4">
      {/* Заголовок файла */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text">{file.relativePath}</span>
        {file.isNewFile && (
          <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-400">
            NEW
          </span>
        )}
        <span className="ml-auto text-xs text-text-muted">
          {nonErrorSnippets.length} change{nonErrorSnippets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Snippets */}
      {nonErrorSnippets.map((snippet, index) => (
        <SnippetDiffView key={snippet.toolUseId} snippet={snippet} index={index} />
      ))}

      {nonErrorSnippets.length === 0 && (
        <div className="py-8 text-center text-sm text-text-muted">No changes to display</div>
      )}
    </div>
  );
};
