import { getMemberColor } from '@shared/constants/memberColors';

import type {
  LeadActivityState,
  MemberStatus,
  ResolvedTeamMember,
  TeamTaskStatus,
} from '@shared/types';

export function agentAvatarUrl(name: string, size = 64): string {
  return `https://robohash.org/${encodeURIComponent(name)}?size=${size}x${size}`;
}

export const STATUS_DOT_COLORS: Record<MemberStatus, string> = {
  active: 'bg-emerald-400',
  idle: 'bg-emerald-400/50',
  terminated: 'bg-zinc-500',
  unknown: 'bg-zinc-600',
};

export function getMemberDotClass(
  member: ResolvedTeamMember,
  isTeamAlive?: boolean,
  isTeamProvisioning?: boolean,
  leadActivity?: LeadActivityState
): string {
  if (member.status === 'terminated') return STATUS_DOT_COLORS.terminated;
  if (isTeamProvisioning) return STATUS_DOT_COLORS.unknown;
  if (isTeamAlive === false) return STATUS_DOT_COLORS.terminated;
  if (leadActivity && member.agentType === 'team-lead') {
    return leadActivity === 'active'
      ? `${STATUS_DOT_COLORS.active} animate-pulse`
      : STATUS_DOT_COLORS.active;
  }
  if (member.status === 'unknown') return STATUS_DOT_COLORS.unknown;
  if (member.currentTaskId) return STATUS_DOT_COLORS.active;
  return member.status === 'active' ? STATUS_DOT_COLORS.active : STATUS_DOT_COLORS.idle;
}

export function getPresenceLabel(
  member: ResolvedTeamMember,
  isTeamAlive?: boolean,
  isTeamProvisioning?: boolean,
  leadActivity?: LeadActivityState
): string {
  if (member.status === 'terminated') return 'terminated';
  if (isTeamProvisioning) return 'connecting';
  if (isTeamAlive === false) return 'offline';
  if (leadActivity && member.agentType === 'team-lead') {
    return leadActivity === 'active' ? 'processing' : 'ready';
  }
  if (member.status === 'unknown') return 'idle';
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

interface MemberColorInput {
  name: string;
  color?: string;
  removedAt?: number | string | null;
  agentType?: string;
  role?: string;
}

/**
 * Build a consistent name→colorName map for all members.
 * Replicates the same index-based assignment as MemberList so that
 * every component resolves the same color for a given member.
 * Also maps "user" to the team-lead's color.
 */
export function buildMemberColorMap(members: MemberColorInput[]): Map<string, string> {
  const map = new Map<string, string>();
  const active = members.filter((m) => !m.removedAt);
  const removed = members.filter((m) => m.removedAt);

  for (let i = 0; i < active.length; i++) {
    map.set(active[i].name, active[i].color ?? getMemberColor(i));
  }
  for (let i = 0; i < removed.length; i++) {
    map.set(removed[i].name, removed[i].color ?? getMemberColor(active.length + i));
  }

  // Map "user" to team-lead's resolved color
  const lead = members.find(
    (m) => m.agentType === 'team-lead' || m.role?.toLowerCase().includes('lead')
  );
  if (lead) {
    map.set('user', map.get(lead.name) ?? getMemberColor(0));
  }

  return map;
}

export const KANBAN_COLUMN_DISPLAY: Record<
  'review' | 'approved',
  { label: string; bg: string; text: string }
> = {
  review: { label: 'In Review', bg: 'bg-amber-500/15', text: 'text-amber-400' },
  approved: { label: 'Approved', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
};
