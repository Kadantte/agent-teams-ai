import type { MemberStatus, ResolvedTeamMember, TeamTaskStatus } from '@shared/types';

export function agentAvatarUrl(name: string, size = 64): string {
  return `https://robohash.org/${encodeURIComponent(name)}?size=${size}x${size}`;
}

export const STATUS_DOT_COLORS: Record<MemberStatus, string> = {
  active: 'bg-emerald-400',
  idle: 'bg-emerald-400/50',
  terminated: 'bg-zinc-500',
  unknown: 'bg-zinc-600',
};

export function getMemberDotClass(member: ResolvedTeamMember, isTeamAlive?: boolean): string {
  if (isTeamAlive === false) return STATUS_DOT_COLORS.terminated;
  if (member.status === 'terminated') return STATUS_DOT_COLORS.terminated;
  return member.currentTaskId ? STATUS_DOT_COLORS.active : STATUS_DOT_COLORS.idle;
}

export function getPresenceLabel(member: ResolvedTeamMember, isTeamAlive?: boolean): string {
  if (isTeamAlive === false) return 'offline';
  if (member.status === 'terminated') return 'terminated';
  return member.currentTaskId ? 'working' : 'idle';
}

export const TASK_STATUS_STYLES: Record<TeamTaskStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
  in_progress: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  completed: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  deleted: { bg: 'bg-red-500/15', text: 'text-red-400' },
};

export const TASK_STATUS_LABELS: Record<TeamTaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  deleted: 'Deleted',
};
