export const TASK_COMMENT_FORWARDING_ENV = 'CLAUDE_TEAM_TASK_COMMENT_FORWARDING';

export type TaskCommentForwardingMode = 'off' | 'dry-run' | 'on';

export function getTaskCommentForwardingMode(): TaskCommentForwardingMode {
  const raw = process.env[TASK_COMMENT_FORWARDING_ENV]?.trim().toLowerCase();
  if (raw === 'dry-run' || raw === 'on') {
    return raw;
  }
  return 'off';
}

export function isTaskCommentForwardingLive(): boolean {
  return getTaskCommentForwardingMode() === 'on';
}
