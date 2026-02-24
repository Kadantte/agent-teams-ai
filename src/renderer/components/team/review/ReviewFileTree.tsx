import { useMemo } from 'react';

import { cn } from '@renderer/lib/utils';
import { useStore } from '@renderer/store';
import { Check, Circle, CircleDot, File, FolderOpen, X as XIcon } from 'lucide-react';

import type { HunkDecision } from '@shared/types';
import type { FileChangeSummary } from '@shared/types/review';

interface ReviewFileTreeProps {
  files: FileChangeSummary[];
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
  viewedSet?: Set<string>;
  onMarkViewed?: (filePath: string) => void;
  onUnmarkViewed?: (filePath: string) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isFile: boolean;
  file?: FileChangeSummary;
  children: TreeNode[];
}

type FileStatus = 'pending' | 'accepted' | 'rejected' | 'mixed';

function buildTree(files: FileChangeSummary[]): TreeNode[] {
  const root: TreeNode = { name: '', fullPath: '', isFile: false, children: [] };

  for (const file of files) {
    const parts = file.relativePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath,
          isFile: isLast,
          file: isLast ? file : undefined,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  function collapse(node: TreeNode): TreeNode {
    const collapsed: TreeNode = { ...node, children: node.children.map(collapse) };
    if (!collapsed.isFile && collapsed.children.length === 1 && !collapsed.children[0].isFile) {
      const child = collapsed.children[0];
      return {
        ...child,
        name: `${collapsed.name}/${child.name}`,
        children: child.children,
      };
    }
    return collapsed;
  }

  return collapse(root).children;
}

function getFileStatus(
  file: FileChangeSummary,
  hunkDecisions: Record<string, HunkDecision>
): FileStatus {
  if (file.snippets.length === 0) return 'pending';

  const decisions: HunkDecision[] = [];
  for (let i = 0; i < file.snippets.length; i++) {
    const key = `${file.filePath}:${i}`;
    decisions.push(hunkDecisions[key] ?? 'pending');
  }

  const allAccepted = decisions.every((d) => d === 'accepted');
  const allRejected = decisions.every((d) => d === 'rejected');
  const allPending = decisions.every((d) => d === 'pending');

  if (allPending) return 'pending';
  if (allAccepted) return 'accepted';
  if (allRejected) return 'rejected';
  return 'mixed';
}

const FileStatusIcon = ({ status }: { status: FileStatus }) => {
  switch (status) {
    case 'accepted':
      return <Check className="size-3 shrink-0 text-green-400" />;
    case 'rejected':
      return <XIcon className="size-3 shrink-0 text-red-400" />;
    case 'mixed':
      return <CircleDot className="size-3 shrink-0 text-yellow-400" />;
    case 'pending':
    default:
      return <Circle className="size-3 shrink-0 text-zinc-500" />;
  }
};

const TreeItem = ({
  node,
  selectedFilePath,
  onSelectFile,
  depth,
  hunkDecisions,
  viewedSet,
  onMarkViewed,
  onUnmarkViewed,
}: {
  node: TreeNode;
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
  depth: number;
  hunkDecisions: Record<string, HunkDecision>;
  viewedSet?: Set<string>;
  onMarkViewed?: (filePath: string) => void;
  onUnmarkViewed?: (filePath: string) => void;
}) => {
  if (node.isFile && node.file) {
    const isSelected = node.file.filePath === selectedFilePath;
    const status = getFileStatus(node.file, hunkDecisions);
    return (
      <button
        onClick={() => onSelectFile(node.file!.filePath)}
        className={cn(
          'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors',
          isSelected
            ? 'bg-blue-500/20 text-blue-300'
            : 'text-text-secondary hover:bg-surface-raised hover:text-text'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <FileStatusIcon status={status} />
        <File className="size-3.5 shrink-0" />
        {viewedSet && (
          <input
            type="checkbox"
            checked={viewedSet.has(node.file.filePath)}
            onChange={(e) => {
              e.stopPropagation();
              if (e.target.checked) {
                onMarkViewed?.(node.file!.filePath);
              } else {
                onUnmarkViewed?.(node.file!.filePath);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="size-3 shrink-0 rounded border-zinc-600 accent-green-500"
            aria-label={`Mark ${node.name} as viewed`}
          />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            viewedSet?.has(node.file.filePath) && 'text-text-muted line-through'
          )}
        >
          {node.name}
        </span>
        <span className="ml-1 flex shrink-0 items-center gap-1">
          {node.file.linesAdded > 0 && (
            <span className="text-green-400">+{node.file.linesAdded}</span>
          )}
          {node.file.linesRemoved > 0 && (
            <span className="text-red-400">-{node.file.linesRemoved}</span>
          )}
        </span>
      </button>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 px-2 py-1 text-xs text-text-muted"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <FolderOpen className="size-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>
      {[...node.children]
        .sort((a, b) => {
          if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
          return a.name.localeCompare(b.name);
        })
        .map((child) => (
          <TreeItem
            key={child.fullPath}
            node={child}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            depth={depth + 1}
            hunkDecisions={hunkDecisions}
            viewedSet={viewedSet}
            onMarkViewed={onMarkViewed}
            onUnmarkViewed={onUnmarkViewed}
          />
        ))}
    </div>
  );
};

export const ReviewFileTree = ({
  files,
  selectedFilePath,
  onSelectFile,
  viewedSet,
  onMarkViewed,
  onUnmarkViewed,
}: ReviewFileTreeProps) => {
  const hunkDecisions = useStore((state) => state.hunkDecisions);
  const tree = useMemo(() => buildTree(files), [files]);

  if (files.length === 0) {
    return <div className="p-4 text-center text-xs text-text-muted">No changed files</div>;
  }

  return (
    <div className="py-1">
      {[...tree]
        .sort((a, b) => {
          if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
          return a.name.localeCompare(b.name);
        })
        .map((node) => (
          <TreeItem
            key={node.fullPath}
            node={node}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            depth={0}
            hunkDecisions={hunkDecisions}
            viewedSet={viewedSet}
            onMarkViewed={onMarkViewed}
            onUnmarkViewed={onUnmarkViewed}
          />
        ))}
    </div>
  );
};
