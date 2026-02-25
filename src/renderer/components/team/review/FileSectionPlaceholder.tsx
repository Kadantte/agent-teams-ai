import React from 'react';

interface FileSectionPlaceholderProps {
  fileName: string;
}

export const FileSectionPlaceholder = ({
  fileName,
}: FileSectionPlaceholderProps): React.ReactElement => (
  <div className="animate-pulse">
    <div className="flex items-center gap-2 border-b border-border bg-surface-sidebar px-4 py-2">
      <span className="text-xs font-medium text-text-muted">{fileName}</span>
      <div className="h-4 w-16 rounded bg-surface-raised" />
    </div>

    <div className="space-y-2 p-4">
      <div className="h-4 w-3/4 rounded bg-surface-raised" />
      <div className="h-4 w-1/2 rounded bg-surface-raised" />
      <div className="h-4 w-5/6 rounded bg-surface-raised" />
      <div className="h-4 w-2/3 rounded bg-surface-raised" />
    </div>
  </div>
);
