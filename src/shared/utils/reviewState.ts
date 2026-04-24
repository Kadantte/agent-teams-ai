import { getDerivedReviewStateFromHistory } from '@shared/utils/taskHistory';

import type { TaskHistoryEvent, TeamReviewState } from '@shared/types';

interface ReviewStateLike {
  reviewState?: TeamReviewState | null;
  historyEvents?: unknown[];
  kanbanColumn?: 'review' | 'approved' | null;
  status?: string | null;
}

export function normalizeReviewState(value: unknown): TeamReviewState {
  return value === 'review' || value === 'needsFix' || value === 'approved' ? value : 'none';
}

export function getReviewStateFromTask(task: ReviewStateLike): TeamReviewState {
  // Prefer derivation from historyEvents when available
  if (Array.isArray(task.historyEvents) && task.historyEvents.length > 0) {
    const derived = getDerivedReviewStateFromHistory({
      historyEvents: task.historyEvents as TaskHistoryEvent[],
    });
    if (derived) {
      return derived;
    }
  }

  const explicit = normalizeReviewState(task.reviewState);
  if (explicit !== 'none') {
    return explicit;
  }

  if (task.kanbanColumn === 'review' || task.kanbanColumn === 'approved') {
    return task.kanbanColumn;
  }

  return 'none';
}

export function getKanbanColumnFromReviewState(
  reviewState: TeamReviewState
): 'review' | 'approved' | undefined {
  return reviewState === 'review' || reviewState === 'approved' ? reviewState : undefined;
}

export function getTaskKanbanColumn(task: ReviewStateLike): 'review' | 'approved' | undefined {
  return getKanbanColumnFromReviewState(getReviewStateFromTask(task));
}

export function isApprovedTask(task: ReviewStateLike): boolean {
  return getReviewStateFromTask(task) === 'approved';
}

export function isReviewTask(task: ReviewStateLike): boolean {
  return getReviewStateFromTask(task) === 'review';
}

export function isNeedsFixTask(task: ReviewStateLike): boolean {
  return getReviewStateFromTask(task) === 'needsFix';
}
