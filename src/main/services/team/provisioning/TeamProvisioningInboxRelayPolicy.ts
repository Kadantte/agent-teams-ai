import type { InboxMessage } from '@shared/types';

export type InboxRelayComparableMessage = Pick<
  InboxMessage,
  'messageKind' | 'source' | 'timestamp'
> & { messageId: string };

export function normalizeSameTeamText(text: string): string {
  return text.trim().replace(/\r\n/g, '\n');
}

const SUPPRESSED_LEAD_RELAY_STATE_PHRASES = [
  'open',
  'closed',
  'merged',
  'approved',
  'complete',
  'completed',
  'done',
  'blocked',
  'pending',
  'in_progress',
  'in progress',
  'needsfix',
  'needs fix',
  'in review',
  'clear',
] as const;

function startsWithSuppressedLeadRelayStatePhrase(text: string): boolean {
  const lowerText = text.toLowerCase();
  return SUPPRESSED_LEAD_RELAY_STATE_PHRASES.some((phrase) => {
    if (!lowerText.startsWith(phrase)) {
      return false;
    }

    const nextChar = lowerText.charAt(phrase.length);
    return nextChar.length === 0 || !/[a-z0-9_]/i.test(nextChar);
  });
}

function hasSuppressedLeadRelayStatePredicate(normalized: string): boolean {
  const match = /\b(?:is|are|was|were|stays?|still|now)\s+/i.exec(normalized);
  if (!match) {
    return false;
  }

  return startsWithSuppressedLeadRelayStatePhrase(normalized.slice(match.index + match[0].length));
}

export function shouldSuppressUnverifiedLeadRelayStateLine(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    return false;
  }

  const hasStateSubject =
    /#[a-z0-9]{4,}/i.test(normalized) ||
    /\bpr\s*#?\d+\b/i.test(normalized) ||
    /\bpull request\b/i.test(normalized) ||
    /\b(?:task|tasks|kanban|board|review|approval|merge|merged|branch|queue|worktree|commit|mergecommit|mergedat)\b/i.test(
      normalized
    );
  if (!hasStateSubject) {
    return false;
  }

  return (
    /\b(?:confirmed|verified|already|claims?|false|phantom|ground[- ]truth)\b/i.test(normalized) ||
    /\b(?:done|complete(?:d)?|approved|merged|closed|blocked|resolved|failed|succeeded)\b/i.test(
      normalized
    ) ||
    hasSuppressedLeadRelayStatePredicate(normalized) ||
    /\b(?:mergecommit|mergedat)\s*=\s*(?:null|[^\s,;]+)/i.test(normalized) ||
    /\bqueue\b.*\bclear\b/i.test(normalized)
  );
}

export function getOpenCodeInboxRelayPriority(
  message: Pick<InboxMessage, 'messageKind' | 'source'>
): number {
  if (message.messageKind === 'member_work_sync_nudge') {
    return 30;
  }
  if (message.source === 'system_notification') {
    return 20;
  }
  return 0;
}

export function getMemberInboxRelayPriority(
  message: Pick<InboxMessage, 'messageKind' | 'source'>
): number {
  if (message.messageKind === 'member_work_sync_nudge') {
    return 30;
  }
  return 0;
}

export function getLeadInboxRelayPriority(message: Pick<InboxMessage, 'messageKind'>): number {
  return message.messageKind === 'member_work_sync_nudge' ? 30 : 0;
}

function compareInboxRelayMessages(
  a: InboxRelayComparableMessage,
  b: InboxRelayComparableMessage,
  getPriority: (message: Pick<InboxMessage, 'messageKind' | 'source'>) => number
): number {
  const priorityDelta = getPriority(b) - getPriority(a);
  if (priorityDelta !== 0) return priorityDelta;
  const aTime = Date.parse(a.timestamp);
  const bTime = Date.parse(b.timestamp);
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
    const timeDelta = aTime - bTime;
    if (timeDelta !== 0) return timeDelta;
  } else if (Number.isFinite(aTime)) {
    return -1;
  } else if (Number.isFinite(bTime)) {
    return 1;
  }
  return a.messageId.localeCompare(b.messageId);
}

export function compareOpenCodeInboxRelayMessagesByPriority(
  a: InboxRelayComparableMessage,
  b: InboxRelayComparableMessage
): number {
  return compareInboxRelayMessages(a, b, getOpenCodeInboxRelayPriority);
}

export function compareMemberInboxRelayMessagesByPriority(
  a: InboxRelayComparableMessage,
  b: InboxRelayComparableMessage
): number {
  return compareInboxRelayMessages(a, b, getMemberInboxRelayPriority);
}

export function compareLeadInboxRelayMessagesByPriority(
  a: InboxRelayComparableMessage,
  b: InboxRelayComparableMessage
): number {
  return compareInboxRelayMessages(a, b, getLeadInboxRelayPriority);
}
