import { useCallback, useEffect, useRef, useState } from 'react';

import { goToNextChunk, goToPreviousChunk } from '@codemirror/merge';

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

export function useDiffNavigation(
  files: FileChangeSummary[],
  selectedFilePath: string | null,
  onSelectFile: (path: string) => void,
  editorViewRef: React.RefObject<EditorView | null>,
  isDialogOpen: boolean,
  onHunkAccepted?: (filePath: string, hunkIndex: number) => void,
  onHunkRejected?: (filePath: string, hunkIndex: number) => void,
  onClose?: () => void
): DiffNavigationState {
  // Track hunk index keyed by file path to auto-reset on file change
  const [hunkState, setHunkState] = useState<{ filePath: string | null; index: number }>({
    filePath: selectedFilePath,
    index: 0,
  });
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const selectedFile = files.find((f) => f.filePath === selectedFilePath);
  const totalHunks = selectedFile?.snippets.length ?? 0;

  // Derive currentHunkIndex: reset to 0 when selectedFilePath changes
  const currentHunkIndex = hunkState.filePath === selectedFilePath ? hunkState.index : 0;

  const setCurrentHunkIndex = useCallback(
    (updater: number | ((prev: number) => number)) => {
      setHunkState((prev) => {
        const newIndex =
          typeof updater === 'function'
            ? updater(prev.filePath === selectedFilePath ? prev.index : 0)
            : updater;
        return { filePath: selectedFilePath, index: newIndex };
      });
    },
    [selectedFilePath]
  );

  const goToNextHunk = useCallback(() => {
    const view = editorViewRef.current;
    if (view) {
      goToNextChunk(view);
    }
    setCurrentHunkIndex((prev) => Math.min(prev + 1, totalHunks - 1));
  }, [editorViewRef, totalHunks, setCurrentHunkIndex]);

  const goToPrevHunk = useCallback(() => {
    const view = editorViewRef.current;
    if (view) {
      goToPreviousChunk(view);
    }
    setCurrentHunkIndex((prev) => Math.max(prev - 1, 0));
  }, [editorViewRef, setCurrentHunkIndex]);

  const goToNextFile = useCallback(() => {
    if (files.length === 0) return;
    const currentIdx = files.findIndex((f) => f.filePath === selectedFilePath);
    const nextIdx = currentIdx < files.length - 1 ? currentIdx + 1 : 0;
    onSelectFile(files[nextIdx].filePath);
  }, [files, selectedFilePath, onSelectFile]);

  const goToPrevFile = useCallback(() => {
    if (files.length === 0) return;
    const currentIdx = files.findIndex((f) => f.filePath === selectedFilePath);
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : files.length - 1;
    onSelectFile(files[prevIdx].filePath);
  }, [files, selectedFilePath, onSelectFile]);

  const goToHunk = useCallback(
    (index: number) => {
      setCurrentHunkIndex(Math.max(0, Math.min(index, totalHunks - 1)));
    },
    [totalHunks, setCurrentHunkIndex]
  );

  const acceptCurrentHunk = useCallback(() => {
    if (selectedFilePath && onHunkAccepted) {
      onHunkAccepted(selectedFilePath, currentHunkIndex);
    }
  }, [selectedFilePath, currentHunkIndex, onHunkAccepted]);

  const rejectCurrentHunk = useCallback(() => {
    if (selectedFilePath && onHunkRejected) {
      onHunkRejected(selectedFilePath, currentHunkIndex);
    }
  }, [selectedFilePath, currentHunkIndex, onHunkRejected]);

  // Store refs for stable closure
  const goToNextHunkRef = useRef(goToNextHunk);
  const goToPrevHunkRef = useRef(goToPrevHunk);
  const goToNextFileRef = useRef(goToNextFile);
  const goToPrevFileRef = useRef(goToPrevFile);
  const acceptCurrentHunkRef = useRef(acceptCurrentHunk);
  const rejectCurrentHunkRef = useRef(rejectCurrentHunk);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    goToNextHunkRef.current = goToNextHunk;
    goToPrevHunkRef.current = goToPrevHunk;
    goToNextFileRef.current = goToNextFile;
    goToPrevFileRef.current = goToPrevFile;
    acceptCurrentHunkRef.current = acceptCurrentHunk;
    rejectCurrentHunkRef.current = rejectCurrentHunk;
    onCloseRef.current = onClose;
  }, [
    goToNextHunk,
    goToPrevHunk,
    goToNextFile,
    goToPrevFile,
    acceptCurrentHunk,
    rejectCurrentHunk,
    onClose,
  ]);

  // Keyboard handler
  useEffect(() => {
    if (!isDialogOpen) return;

    const handler = (event: KeyboardEvent) => {
      // Don't intercept when focus is in input/textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          if (!event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            goToNextHunkRef.current();
          }
          break;
        case 'k':
        case 'ArrowUp':
          if (!event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            goToPrevHunkRef.current();
          }
          break;
        case 'n':
          if (!event.shiftKey) {
            event.preventDefault();
            goToNextFileRef.current();
          } else {
            event.preventDefault();
            goToPrevFileRef.current();
          }
          break;
        case 'p':
          event.preventDefault();
          goToPrevFileRef.current();
          break;
        case 'a':
          event.preventDefault();
          acceptCurrentHunkRef.current();
          break;
        case 'x':
          event.preventDefault();
          rejectCurrentHunkRef.current();
          break;
        case '?':
          event.preventDefault();
          setShowShortcutsHelp((prev) => !prev);
          break;
        case 'Escape':
          if (showShortcutsHelp) {
            event.preventDefault();
            setShowShortcutsHelp(false);
          }
          // Note: main Escape handling for closing dialog is in ChangeReviewDialog itself
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isDialogOpen, showShortcutsHelp]);

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
