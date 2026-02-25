import React, { useEffect, useRef } from 'react';

import { CodeMirrorDiffView } from './CodeMirrorDiffView';
import { DiffErrorBoundary } from './DiffErrorBoundary';
import { FileSectionPlaceholder } from './FileSectionPlaceholder';
import { ReviewDiffContent } from './ReviewDiffContent';

import type { EditorView } from '@codemirror/view';
import type { FileChangeWithContent } from '@shared/types';
import type { FileChangeSummary } from '@shared/types/review';

interface FileSectionDiffProps {
  file: FileChangeSummary;
  fileContent: FileChangeWithContent | null;
  isLoading: boolean;
  collapseUnchanged: boolean;
  onHunkAccepted: (filePath: string, hunkIndex: number) => void;
  onHunkRejected: (filePath: string, hunkIndex: number) => void;
  onFullyViewed: (filePath: string) => void;
  onContentChanged: (filePath: string, content: string) => void;
  onEditorViewReady: (filePath: string, view: EditorView | null) => void;
  discardCounter: number;
  autoViewed: boolean;
  isViewed: boolean;
}

export const FileSectionDiff = ({
  file,
  fileContent,
  isLoading,
  collapseUnchanged,
  onHunkAccepted,
  onHunkRejected,
  onFullyViewed,
  onContentChanged,
  onEditorViewReady,
  discardCounter,
  autoViewed,
  isViewed,
}: FileSectionDiffProps): React.ReactElement => {
  const localEditorViewRef = useRef<EditorView | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Register/unregister EditorView with parent Map
  useEffect(() => {
    return () => {
      onEditorViewReady(file.filePath, null);
    };
  }, [file.filePath, onEditorViewReady]);

  // Sync EditorView ref to parent after CM creates the view
  useEffect(() => {
    if (localEditorViewRef.current) {
      onEditorViewReady(file.filePath, localEditorViewRef.current);
    }
  });

  // Auto-viewed sentinel observer
  useEffect(() => {
    if (!sentinelRef.current || !autoViewed || isViewed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onFullyViewed(file.filePath);
          }
        }
      },
      { threshold: 0.85 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [autoViewed, isViewed, file.filePath, onFullyViewed]);

  // Loading state
  if (isLoading) {
    return <FileSectionPlaceholder fileName={file.relativePath} />;
  }

  // Unavailable / no content fallback
  const hasCodeMirrorContent =
    fileContent &&
    fileContent.contentSource !== 'unavailable' &&
    fileContent.modifiedFullContent !== null;

  if (!hasCodeMirrorContent) {
    return (
      <div className="overflow-auto">
        <ReviewDiffContent file={file} />
        <div ref={sentinelRef} className="h-1 shrink-0" />
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <DiffErrorBoundary
        filePath={file.filePath}
        oldString={fileContent.originalFullContent ?? ''}
        newString={fileContent.modifiedFullContent!}
      >
        <CodeMirrorDiffView
          key={`${file.filePath}:${discardCounter}`}
          original={fileContent.originalFullContent ?? ''}
          modified={fileContent.modifiedFullContent!}
          fileName={file.relativePath}
          readOnly={false}
          showMergeControls={true}
          collapseUnchanged={collapseUnchanged}
          usePortionCollapse={true}
          onHunkAccepted={(idx) => onHunkAccepted(file.filePath, idx)}
          onHunkRejected={(idx) => onHunkRejected(file.filePath, idx)}
          onContentChanged={(content) => onContentChanged(file.filePath, content)}
          editorViewRef={localEditorViewRef}
        />
      </DiffErrorBoundary>
      <div ref={sentinelRef} className="h-1 shrink-0" />
    </div>
  );
};
