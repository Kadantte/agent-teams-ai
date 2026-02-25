import { useCallback, useEffect, useRef, useState } from 'react';

import { acceptChunk, goToNextChunk, goToPreviousChunk } from '@codemirror/merge';
import { getChunks } from '@renderer/components/team/review/CodeMirrorDiffUtils';

import type { EditorView } from '@codemirror/view';
import type { FileChangeSummary } from '@shared/types/review';

interface DiffNavigationState {
  currentHunkIndex: number;
  totalHunks: number;
  goToNextHunk: () => void;
  goToPrevHunk: () => void;
  goToNextFile: () => void;
  goToPrevFile: () => void;
  goToHunk: (index: number) => void;
  acceptCurrentHunk: () => void;
  rejectCurrentHunk: () => void;
  showShortcutsHelp: boolean;
  setShowShortcutsHelp: (show: boolean) => void;
}

export interface ContinuousNavigationOptions {
  editorViewMapRef: React.MutableRefObject<Map<string, EditorView>>;
  activeFilePath: string | null;
  scrollToFile: (filePath: string) => void;
  enabled: boolean;
}

function getEditorViewRefs(
  continuousOptions?: ContinuousNavigationOptions
): Map<string, EditorView> | null {
  return continuousOptions?.enabled ? continuousOptions.editorViewMapRef.current : null;
}

function getActiveEditorView(
  editorViewRef: React.RefObject<EditorView | null>,
  continuousOptions?: ContinuousNavigationOptions
): EditorView | null {
  const editorViewRefs = getEditorViewRefs(continuousOptions);
  if (!editorViewRefs) {
    return editorViewRef.current;
  }

  const { activeFilePath } = continuousOptions!;

  // 1. Focused editor
  for (const [, view] of editorViewRefs) {
    if (view.hasFocus) return view;
  }

  // 2. activeFilePath editor
  if (activeFilePath) {
    const view = editorViewRefs.get(activeFilePath);
    if (view) return view;
  }

  // 3. Fallback: first editor
  const firstEntry = editorViewRefs.values().next();
  return firstEntry.done ? null : firstEntry.value;
}

function getActiveFilePath(
  selectedFilePath: string | null,
  continuousOptions?: ContinuousNavigationOptions
): string | null {
  if (continuousOptions?.enabled && continuousOptions.activeFilePath) {
    return continuousOptions.activeFilePath;
  }
  return selectedFilePath;
}

export function isLastChunkInFile(view: EditorView): boolean {
  const result = getChunks(view.state);
  if (!result || result.chunks.length === 0) return true;

  const cursorPos = view.state.selection.main.head;
  const lastChunk = result.chunks[result.chunks.length - 1];
  return cursorPos >= lastChunk.fromB;
}

export function isFirstChunkInFile(view: EditorView): boolean {
  const result = getChunks(view.state);
  if (!result || result.chunks.length === 0) return true;

  const cursorPos = view.state.selection.main.head;
  const firstChunk = result.chunks[0];
  return cursorPos <= firstChunk.toB;
}

export function useDiffNavigation(
  files: FileChangeSummary[],
  selectedFilePath: string | null,
  onSelectFile: (path: string) => void,
  editorViewRef: React.RefObject<EditorView | null>,
  isDialogOpen: boolean,
  onHunkAccepted?: (filePath: string, hunkIndex: number) => void,
  onHunkRejected?: (filePath: string, hunkIndex: number) => void,
  onClose?: () => void,
  onSaveFile?: () => void,
  continuousOptions?: ContinuousNavigationOptions
): DiffNavigationState {
  const [hunkState, setHunkState] = useState<{ filePath: string | null; index: number }>({
    filePath: selectedFilePath,
    index: 0,
  });
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const activePath = getActiveFilePath(selectedFilePath, continuousOptions);
  const selectedFile = files.find((f) => f.filePath === activePath);
  const totalHunks = selectedFile?.snippets.length ?? 0;

  const currentHunkIndex = hunkState.filePath === activePath ? hunkState.index : 0;

  const setCurrentHunkIndex = useCallback(
    (updater: number | ((prev: number) => number)) => {
      setHunkState((prev) => {
        const newIndex =
          typeof updater === 'function'
            ? updater(prev.filePath === activePath ? prev.index : 0)
            : updater;
        return { filePath: activePath, index: newIndex };
      });
    },
    [activePath]
  );

  // Stable refs for continuousOptions to avoid stale closures
  const continuousOptionsRef = useRef(continuousOptions);
  useEffect(() => {
    continuousOptionsRef.current = continuousOptions;
  });

  const goToNextFile = useCallback(() => {
    if (files.length === 0) return;

    const currentPath = getActiveFilePath(selectedFilePath, continuousOptionsRef.current);
    const currentIdx = files.findIndex((f) => f.filePath === currentPath);
    const nextIdx = currentIdx < files.length - 1 ? currentIdx + 1 : 0;
    const nextFilePath = files[nextIdx].filePath;

    if (continuousOptionsRef.current?.enabled) {
      continuousOptionsRef.current.scrollToFile(nextFilePath);
    } else {
      onSelectFile(nextFilePath);
    }
  }, [files, selectedFilePath, onSelectFile]);

  const goToPrevFile = useCallback(() => {
    if (files.length === 0) return;

    const currentPath = getActiveFilePath(selectedFilePath, continuousOptionsRef.current);
    const currentIdx = files.findIndex((f) => f.filePath === currentPath);
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : files.length - 1;
    const prevFilePath = files[prevIdx].filePath;

    if (continuousOptionsRef.current?.enabled) {
      continuousOptionsRef.current.scrollToFile(prevFilePath);
    } else {
      onSelectFile(prevFilePath);
    }
  }, [files, selectedFilePath, onSelectFile]);

  const goToNextHunk = useCallback(() => {
    const view = getActiveEditorView(editorViewRef, continuousOptionsRef.current);
    if (!view) return;

    if (continuousOptionsRef.current?.enabled) {
      if (isLastChunkInFile(view)) {
        const currentPath = getActiveFilePath(selectedFilePath, continuousOptionsRef.current);
        const currentIdx = files.findIndex((f) => f.filePath === currentPath);

        if (currentIdx < files.length - 1) {
          const nextFilePath = files[currentIdx + 1].filePath;
          continuousOptionsRef.current.scrollToFile(nextFilePath);

          requestAnimationFrame(() => {
            const opts = continuousOptionsRef.current;
            const nextView = opts?.editorViewMapRef.current.get(nextFilePath);
            if (nextView) {
              nextView.dispatch({ selection: { anchor: 0 } });
              goToNextChunk(nextView);
            }
          });
        }
      } else {
        goToNextChunk(view);
      }
    } else {
      goToNextChunk(view);
    }

    setCurrentHunkIndex((prev) => Math.min(prev + 1, totalHunks - 1));
  }, [editorViewRef, totalHunks, setCurrentHunkIndex, files, selectedFilePath]);

  const goToPrevHunk = useCallback(() => {
    const view = getActiveEditorView(editorViewRef, continuousOptionsRef.current);
    if (!view) return;

    if (continuousOptionsRef.current?.enabled) {
      if (isFirstChunkInFile(view)) {
        const currentPath = getActiveFilePath(selectedFilePath, continuousOptionsRef.current);
        const currentIdx = files.findIndex((f) => f.filePath === currentPath);

        if (currentIdx > 0) {
          const prevFilePath = files[currentIdx - 1].filePath;
          continuousOptionsRef.current.scrollToFile(prevFilePath);

          requestAnimationFrame(() => {
            const opts = continuousOptionsRef.current;
            const prevView = opts?.editorViewMapRef.current.get(prevFilePath);
            if (prevView) {
              const docLength = prevView.state.doc.length;
              prevView.dispatch({ selection: { anchor: docLength } });
              goToPreviousChunk(prevView);
            }
          });
        }
      } else {
        goToPreviousChunk(view);
      }
    } else {
      goToPreviousChunk(view);
    }

    setCurrentHunkIndex((prev) => Math.max(prev - 1, 0));
  }, [editorViewRef, setCurrentHunkIndex, files, selectedFilePath]);

  const goToHunk = useCallback(
    (index: number) => {
      setCurrentHunkIndex(Math.max(0, Math.min(index, totalHunks - 1)));
    },
    [totalHunks, setCurrentHunkIndex]
  );

  const acceptCurrentHunk = useCallback(() => {
    const path = getActiveFilePath(selectedFilePath, continuousOptionsRef.current);
    if (path && onHunkAccepted) {
      onHunkAccepted(path, currentHunkIndex);
    }
  }, [selectedFilePath, currentHunkIndex, onHunkAccepted]);

  const rejectCurrentHunk = useCallback(() => {
    const path = getActiveFilePath(selectedFilePath, continuousOptionsRef.current);
    if (path && onHunkRejected) {
      onHunkRejected(path, currentHunkIndex);
    }
  }, [selectedFilePath, currentHunkIndex, onHunkRejected]);

  // Store refs for stable closure
  const onCloseRef = useRef(onClose);
  const onSaveFileRef = useRef(onSaveFile);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSaveFileRef.current = onSaveFile;
  }, [onClose, onSaveFile]);

  // Keyboard handler
  useEffect(() => {
    if (!isDialogOpen) return;

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;

      // Alt+J -> next hunk (cross-file in continuous mode)
      if (event.altKey && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        goToNextHunk();
        return;
      }

      // Alt+K -> prev hunk (cross-file in continuous mode)
      if (event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        goToPrevHunk();
        return;
      }

      // Alt+ArrowDown -> next file
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        goToNextFile();
        return;
      }

      // Alt+ArrowUp -> prev file
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        goToPrevFile();
        return;
      }

      // Cmd+Enter -> save file
      if (isMeta && event.key === 'Enter') {
        event.preventDefault();
        onSaveFileRef.current?.();
        return;
      }

      // Cmd+Y -> accept chunk + next (cross-file aware)
      if (isMeta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        const view = getActiveEditorView(editorViewRef, continuousOptionsRef.current);
        if (view) {
          acceptChunk(view);
          requestAnimationFrame(() => {
            if (continuousOptionsRef.current?.enabled && isLastChunkInFile(view)) {
              goToNextFile();
            } else {
              goToNextChunk(view);
            }
          });
        }
        return;
      }

      // ? -> toggle shortcuts help
      if (event.key === '?' && !isMeta && !event.altKey) {
        event.preventDefault();
        setShowShortcutsHelp((prev) => !prev);
        return;
      }

      // Escape handling
      if (event.key === 'Escape') {
        if (showShortcutsHelp) {
          event.preventDefault();
          setShowShortcutsHelp(false);
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    isDialogOpen,
    showShortcutsHelp,
    editorViewRef,
    goToNextFile,
    goToPrevFile,
    goToNextHunk,
    goToPrevHunk,
  ]);

  return {
    currentHunkIndex,
    totalHunks,
    goToNextHunk,
    goToPrevHunk,
    goToNextFile,
    goToPrevFile,
    goToHunk,
    acceptCurrentHunk,
    rejectCurrentHunk,
    showShortcutsHelp,
    setShowShortcutsHelp,
  };
}
