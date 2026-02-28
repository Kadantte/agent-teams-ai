/**
 * Quick Open dialog (Cmd+P) — fuzzy file search using cmdk.
 *
 * Escape closes dialog (not the editor overlay).
 * Flatten file tree on mount, filter with cmdk built-in fuzzy matching.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useStore } from '@renderer/store';
import { Command } from 'cmdk';

import { getFileIcon } from './fileIcons';

import type { FileTreeEntry } from '@shared/types/editor';

// =============================================================================
// Types
// =============================================================================

interface QuickOpenDialogProps {
  onClose: () => void;
  onSelectFile: (filePath: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export const QuickOpenDialog = ({
  onClose,
  onSelectFile,
}: QuickOpenDialogProps): React.ReactElement => {
  const fileTree = useStore((s) => s.editorFileTree);
  const projectPath = useStore((s) => s.editorProjectPath);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Flatten file tree into searchable list
  const flatFiles = useMemo(() => {
    if (!fileTree) return [];
    const files: { path: string; name: string; relativePath: string }[] = [];
    flattenTree(fileTree, files, projectPath ?? '');
    return files;
  }, [fileTree, projectPath]);

  // Escape to close dialog (not overlay)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  const handleSelect = useCallback(
    (value: string) => {
      onSelectFile(value);
      onClose();
    },
    [onSelectFile, onClose]
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        role="presentation"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative z-10 w-[520px] overflow-hidden rounded-lg border border-border-emphasis bg-surface shadow-2xl"
      >
        <Command label="Quick Open" shouldFilter={true}>
          <Command.Input
            placeholder="Search files by name..."
            className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text outline-none placeholder:text-text-muted"
            autoFocus
          />
          <Command.List className="max-h-80 overflow-y-auto p-1">
            <Command.Empty className="p-6 text-center text-sm text-text-muted">
              No files found
            </Command.Empty>
            {flatFiles.map((file) => {
              const iconInfo = getFileIcon(file.name);
              const Icon = iconInfo.icon;
              return (
                <Command.Item
                  key={file.path}
                  value={file.relativePath}
                  onSelect={() => handleSelect(file.path)}
                  className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm text-text-secondary aria-selected:bg-surface-raised aria-selected:text-text"
                >
                  <Icon className="size-4 shrink-0" style={{ color: iconInfo.color }} />
                  <span className="truncate font-medium">{file.name}</span>
                  <span className="ml-auto truncate text-xs text-text-muted">
                    {file.relativePath}
                  </span>
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  );
};

// =============================================================================
// Helpers
// =============================================================================

function flattenTree(
  entries: FileTreeEntry[],
  result: { path: string; name: string; relativePath: string }[],
  projectRoot: string
): void {
  for (const entry of entries) {
    if (entry.type === 'file' && !entry.isSensitive) {
      const relativePath = entry.path.startsWith(projectRoot)
        ? entry.path.slice(projectRoot.length + 1)
        : entry.name;
      result.push({
        path: entry.path,
        name: entry.name,
        relativePath,
      });
    }
    if (entry.children) {
      flattenTree(entry.children, result, projectRoot);
    }
  }
}
