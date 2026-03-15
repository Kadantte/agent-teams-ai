import { useCallback, useEffect, useRef } from 'react';

import { markAsRead } from '@renderer/services/commentReadStorage';

import { useViewportObserver } from './useViewportObserver';

import type { RefObject } from 'react';

interface UseViewportCommentReadOptions {
  teamName: string;
  taskId: string;
  /**
   * Scrollable ancestor element (e.g. DialogContent) used as IO root.
   * Required for portalled Dialogs where the default viewport root
   * would not detect intersections correctly.
   */
  scrollContainerRef: RefObject<HTMLElement | null>;
}

/**
 * Marks task comments as read based on viewport visibility.
 *
 * Instead of marking all comments read on mount, this hook uses
 * IntersectionObserver (via useViewportObserver) to detect which
 * comment elements are visible in the scroll container and updates
 * the per-task read timestamp to the newest visible comment.
 *
 * Each comment element should be registered via the returned
 * `registerComment(commentTimestampMs)` ref callback.
 *
 * Compatible with the existing per-task timestamp storage format
 * in commentReadStorage — no storage schema changes needed.
 */
export function useViewportCommentRead({
  teamName,
  taskId,
  scrollContainerRef,
}: UseViewportCommentReadOptions): {
  /** Ref callback factory. Call with the comment's createdAt timestamp (ms). */
  registerComment: (timestampMs: number) => (el: HTMLElement | null) => void;
  /**
   * Flush the highest observed timestamp now. Call on dialog close
   * as a safety fallback (e.g. if IO did not fire for portal reasons).
   */
  flush: () => void;
} {
  const highestSeenRef = useRef(0);
  const teamNameRef = useRef(teamName);
  const taskIdRef = useRef(taskId);
  teamNameRef.current = teamName;
  taskIdRef.current = taskId;

  // Reset tracked state when team/task changes
  useEffect(() => {
    highestSeenRef.current = 0;
  }, [teamName, taskId]);

  const handleVisibleChange = useCallback((visibleValues: string[]) => {
    let maxTs = 0;
    for (const v of visibleValues) {
      const ts = Number(v);
      if (Number.isFinite(ts) && ts > maxTs) {
        maxTs = ts;
      }
    }
    if (maxTs > 0 && maxTs > highestSeenRef.current) {
      highestSeenRef.current = maxTs;
      markAsRead(teamNameRef.current, taskIdRef.current, maxTs);
    }
  }, []);

  const { registerElement } = useViewportObserver({
    rootRef: scrollContainerRef,
    threshold: 0.1,
    onVisibleChange: handleVisibleChange,
  });

  const registerComment = useCallback(
    (timestampMs: number) => registerElement(String(timestampMs)),
    [registerElement]
  );

  const flush = useCallback(() => {
    if (highestSeenRef.current > 0) {
      markAsRead(teamNameRef.current, taskIdRef.current, highestSeenRef.current);
    }
  }, []);

  return { registerComment, flush };
}
