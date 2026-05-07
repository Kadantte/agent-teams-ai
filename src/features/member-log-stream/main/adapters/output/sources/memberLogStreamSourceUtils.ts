import { createHash } from 'crypto';

import type {
  MemberLogStreamProvider,
  MemberLogStreamSegmentSource,
} from '../../../../contracts';
import type {
  BoardTaskLogActor,
  BoardTaskLogParticipant,
  BoardTaskLogSegment,
} from '@shared/types';

export function normalizeMemberName(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeTeamName(value: string): string {
  return value.trim().toLowerCase();
}

export function buildMemberParticipant(
  memberName: string,
  role: 'member' | 'lead' = 'member'
): BoardTaskLogParticipant {
  const isLead = role === 'lead';
  return {
    key: `member:${normalizeMemberName(memberName)}`,
    label: memberName,
    role,
    isLead,
    isSidechain: !isLead,
  };
}

export function buildMemberActor(input: {
  memberName: string;
  sessionId: string;
  role?: 'member' | 'lead';
}): BoardTaskLogActor {
  const role = input.role ?? 'member';
  return {
    memberName: input.memberName,
    role,
    sessionId: input.sessionId,
    isSidechain: role !== 'lead',
  };
}

export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function buildSegmentId(input: {
  provider: MemberLogStreamProvider;
  teamName: string;
  memberName: string;
  sessionId: string;
  fingerprint: string;
  startTimestamp: string;
}): string {
  return [
    input.provider,
    normalizeTeamName(input.teamName),
    normalizeMemberName(input.memberName),
    input.sessionId,
    shortHash(`${input.fingerprint}:${input.startTimestamp}`),
  ].join(':');
}

export function withSegmentSource<T extends BoardTaskLogSegment>(
  segment: T,
  source: MemberLogStreamSegmentSource
): T & { source: MemberLogStreamSegmentSource } {
  return { ...segment, source };
}
