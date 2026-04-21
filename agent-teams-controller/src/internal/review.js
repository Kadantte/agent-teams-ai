const kanban = require('./kanban.js');
const messages = require('./messages.js');
const runtimeHelpers = require('./runtimeHelpers.js');
const tasks = require('./tasks.js');
const { withTeamBoardLock } = require('./boardLock.js');
const { wrapAgentBlock } = require('./agentBlocks.js');

function warnNonCritical(message, error) {
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }
  console.warn(`${message}: ${error instanceof Error ? error.message : String(error)}`);
}

function getReviewer(context, flags) {
  if (typeof flags.reviewer === 'string' && flags.reviewer.trim()) {
    return flags.reviewer.trim();
  }
  const state = kanban.getKanbanState(context);
  return typeof state.reviewers[0] === 'string' && state.reviewers[0].trim()
    ? state.reviewers[0].trim()
    : null;
}

function resolveLeadSessionId(context, flags) {
  return runtimeHelpers.resolveCanonicalLeadSessionId(context.paths, flags.leadSessionId);
}

function getCurrentReviewState(task) {
  const events = Array.isArray(task.historyEvents) ? task.historyEvents : [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'review_requested' || e.type === 'review_changes_requested' || e.type === 'review_approved' || e.type === 'review_started') {
      return e.to;
    }
    if (e.type === 'status_changed' && e.to === 'in_progress') {
      return 'none';
    }
  }
  return 'none';
}

function getLatestReviewLifecycleEvent(task) {
  const events = Array.isArray(task.historyEvents) ? task.historyEvents : [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (
      e.type === 'review_requested' ||
      e.type === 'review_changes_requested' ||
      e.type === 'review_approved' ||
      e.type === 'review_started'
    ) {
      return e;
    }
    if (e.type === 'status_changed' && e.to === 'in_progress') {
      return e;
    }
    if (e.type === 'task_created') {
      return e;
    }
  }
  return null;
}

function startReview(context, taskId, flags = {}) {
  return withTeamBoardLock(context.paths, () => {
    const task = tasks.getTask(context, taskId);
    if (task.status === 'deleted') {
      throw new Error(`Task #${task.displayId || task.id} is deleted`);
    }

    const from =
      typeof flags.from === 'string' && flags.from.trim() ? flags.from.trim() : 'reviewer';
    const latestReviewEvent = getLatestReviewLifecycleEvent(task);
    const prevReviewState = getCurrentReviewState(task);

    if (latestReviewEvent && latestReviewEvent.type === 'review_started') {
      return { ok: true, taskId: task.id, displayId: task.displayId, column: 'review' };
    }

    try {
      kanban.setKanbanColumn(context, task.id, 'review');
      tasks.updateTask(context, task.id, (t) => {
        t.historyEvents = tasks.appendHistoryEvent(t.historyEvents, {
          type: 'review_started',
          from: prevReviewState,
          to: 'review',
          actor: from,
        });
        t.reviewState = 'review';
        return t;
      });
      return { ok: true, taskId: task.id, displayId: task.displayId, column: 'review' };
    } catch (error) {
      try {
        kanban.clearKanban(context, task.id);
      } catch (rollbackError) {
        warnNonCritical(`[review] rollback failed while starting review for ${task.id}`, rollbackError);
      }
      throw error;
    }
  });
}

function requestReview(context, taskId, flags = {}) {
  const { task, reviewer, from, leadSessionId } = withTeamBoardLock(context.paths, () => {
    const currentTask = tasks.getTask(context, taskId);
    if (currentTask.status !== 'completed') {
      throw new Error(`Task #${currentTask.displayId || currentTask.id} must be completed before review`);
    }

    const nextFrom =
      typeof flags.from === 'string' && flags.from.trim() ? flags.from.trim() : 'team-lead';
    const nextReviewer = getReviewer(context, flags);
    const prevReviewState = getCurrentReviewState(currentTask);

    try {
      kanban.setKanbanColumn(context, currentTask.id, 'review');
      tasks.updateTask(context, currentTask.id, (t) => {
        t.historyEvents = tasks.appendHistoryEvent(t.historyEvents, {
          type: 'review_requested',
          from: prevReviewState,
          to: 'review',
          ...(nextReviewer ? { reviewer: nextReviewer } : {}),
          actor: nextFrom,
        });
        t.reviewState = 'review';
        return t;
      });
    } catch (error) {
      try {
        kanban.clearKanban(context, currentTask.id);
      } catch (rollbackError) {
        warnNonCritical(`[review] rollback failed while requesting review for ${currentTask.id}`, rollbackError);
      }
      throw error;
    }

    return {
      task: tasks.getTask(context, currentTask.id),
      reviewer: nextReviewer,
      from: nextFrom,
      leadSessionId: resolveLeadSessionId(context, flags),
    };
  });

  if (!reviewer) {
    return task;
  }

  try {
    messages.sendMessage(context, {
      to: reviewer,
      from,
      text:
        `**Please review** task #${task.displayId || task.id}\n\n` +
        wrapAgentBlock(
          `FIRST call review_start to signal you are beginning the review:\n` +
            `{ teamName: "${context.teamName}", taskId: "${task.id}", from: "<your-name>" }\n\n` +
            `When approved, use MCP tool review_approve:\n` +
            `{ teamName: "${context.teamName}", taskId: "${task.id}", note?: "<optional note>", notifyOwner: true }\n\n` +
            `If changes are needed, use MCP tool review_request_changes:\n` +
            `{ teamName: "${context.teamName}", taskId: "${task.id}", comment: "..." }`
        ),
      summary: `Review request for #${task.displayId || task.id}`,
      source: 'system_notification',
      ...(leadSessionId ? { leadSessionId } : {}),
    });
  } catch (error) {
    warnNonCritical(`[review] reviewer notification failed for task ${task.id}`, error);
  }

  return task;
}

function approveReview(context, taskId, flags = {}) {
  const result = withTeamBoardLock(context.paths, () => {
    const currentTask = tasks.getTask(context, taskId);
    const nextFrom =
      typeof flags.from === 'string' && flags.from.trim() ? flags.from.trim() : 'team-lead';
    const nextNote =
      typeof flags.note === 'string' && flags.note.trim() ? flags.note.trim() : 'Approved';
    const suppressTaskComment = flags.suppressTaskComment === true;
    const prevReviewState = getCurrentReviewState(currentTask);

    if (prevReviewState === 'approved') {
      return {
        alreadyApproved: true,
        payload: {
          ok: true,
          taskId: currentTask.id,
          displayId: currentTask.displayId,
          column: 'approved',
          alreadyApproved: true,
        },
      };
    }

    kanban.setKanbanColumn(context, currentTask.id, 'approved');
    tasks.updateTask(context, currentTask.id, (t) => {
      t.historyEvents = tasks.appendHistoryEvent(t.historyEvents, {
        type: 'review_approved',
        from: prevReviewState,
        to: 'approved',
        ...(nextNote ? { note: nextNote } : {}),
        actor: nextFrom,
      });
      t.reviewState = 'approved';
      return t;
    });

    if (!suppressTaskComment) {
      tasks.addTaskComment(context, currentTask.id, {
        text: nextNote,
        from: nextFrom,
        type: 'review_approved',
        notifyOwner: false,
      });
    }

    return {
      alreadyApproved: false,
      payload: tasks.getTask(context, currentTask.id),
      from: nextFrom,
      note: nextNote,
      leadSessionId: resolveLeadSessionId(context, flags),
      shouldNotifyOwner:
        (flags.notify === true || flags['notify-owner'] === true) && Boolean(currentTask.owner),
    };
  });

  if (result.alreadyApproved) {
    return result.payload;
  }

  const { payload: task, from, note, leadSessionId, shouldNotifyOwner } = result;

  if (shouldNotifyOwner && task.owner) {
    try {
      messages.sendMessage(context, {
        to: task.owner,
        from,
        text:
          note && note !== 'Approved'
            ? `@${from} **approved** task #${task.displayId || task.id}\n\n${note}`
            : `@${from} **approved** task #${task.displayId || task.id}`,
        summary: `Approved #${task.displayId || task.id}`,
        source: 'system_notification',
        ...(leadSessionId ? { leadSessionId } : {}),
      });
    } catch (error) {
      warnNonCritical(`[review] owner approval notification failed for task ${task.id}`, error);
    }
  }

  return task;
}

function requestChanges(context, taskId, flags = {}) {
  const { task, from, comment, leadSessionId } = withTeamBoardLock(context.paths, () => {
    const currentTask = tasks.getTask(context, taskId);
    if (!currentTask.owner) {
      throw new Error(`No owner found for task ${String(taskId)}`);
    }

    const nextFrom =
      typeof flags.from === 'string' && flags.from.trim() ? flags.from.trim() : 'team-lead';
    const nextComment =
      typeof flags.comment === 'string' && flags.comment.trim()
        ? flags.comment.trim()
        : 'Reviewer requested changes.';
    const prevReviewState = getCurrentReviewState(currentTask);

    tasks.updateTask(context, currentTask.id, (t) => {
      t.historyEvents = tasks.appendHistoryEvent(t.historyEvents, {
        type: 'review_changes_requested',
        from: prevReviewState,
        to: 'needsFix',
        ...(nextComment ? { note: nextComment } : {}),
        actor: nextFrom,
      });
      t.reviewState = 'needsFix';
      return t;
    });

    kanban.clearKanban(context, currentTask.id, { nextReviewState: 'needsFix' });
    tasks.setTaskStatus(context, currentTask.id, 'pending', nextFrom);
    tasks.addTaskComment(context, currentTask.id, {
      text: nextComment,
      from: nextFrom,
      type: 'review_request',
      ...(Array.isArray(flags.taskRefs) ? { taskRefs: flags.taskRefs } : {}),
      notifyOwner: false,
    });

    return {
      task: tasks.getTask(context, currentTask.id),
      from: nextFrom,
      comment: nextComment,
      leadSessionId: resolveLeadSessionId(context, flags),
    };
  });

  try {
    messages.sendMessage(context, {
      to: task.owner,
      from,
      text:
        `@${from} **requested changes** for task #${task.displayId || task.id}\n\n${comment}\n\n` +
        'The task has been moved back to pending. When you are ready to resume, review the task context, start it explicitly, implement the fixes, mark it completed, and request review again.',
      ...(Array.isArray(flags.taskRefs) ? { taskRefs: flags.taskRefs } : {}),
      summary: `Fix request for #${task.displayId || task.id}`,
      source: 'system_notification',
      ...(leadSessionId ? { leadSessionId } : {}),
    });
  } catch (error) {
    warnNonCritical(`[review] owner fix-request notification failed for task ${task.id}`, error);
  }

  return task;
}

module.exports = {
  approveReview,
  requestReview,
  requestChanges,
  startReview,
};
