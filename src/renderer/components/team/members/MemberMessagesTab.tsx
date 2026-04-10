import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@renderer/api';
import { Button } from '@renderer/components/ui/button';
import { mergeTeamMessages } from '@renderer/utils/mergeTeamMessages';
import { filterTeamMessages } from '@renderer/utils/teamMessageFiltering';

import { ActivityItem } from '../activity/ActivityItem';

import type { InboxMessage } from '@shared/types';

interface MemberMessagesTabProps {
  messages: InboxMessage[];
  teamName: string;
  memberName: string;
  onCreateTask?: (subject: string, description: string) => void;
}

const MAX_MESSAGES = 100;
const MEMBER_MESSAGES_PAGE_SIZE = 50;

export const MemberMessagesTab = ({
  messages,
  teamName,
  memberName,
  onCreateTask,
}: MemberMessagesTabProps): React.JSX.Element => {
  const [pagedMessages, setPagedMessages] = useState<InboxMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPagedMessages([]);
    setNextCursor(null);
    setHasMore(false);
    setLoading(true);

    void (async () => {
      try {
        const page = await api.teams.getMessagesPage(teamName, { limit: MEMBER_MESSAGES_PAGE_SIZE });
        if (cancelled) return;
        const memberPageMessages = page.messages.filter(
          (message) => message.from === memberName || message.to === memberName
        );
        setPagedMessages(memberPageMessages);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch {
        if (!cancelled) {
          setPagedMessages([]);
          setNextCursor(null);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamName, memberName]);

  const loadOlderMessages = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const page = await api.teams.getMessagesPage(teamName, {
        beforeTimestamp: nextCursor,
        limit: MEMBER_MESSAGES_PAGE_SIZE,
      });
      const memberPageMessages = page.messages.filter(
        (message) => message.from === memberName || message.to === memberName
      );
      setPagedMessages((prev) => mergeTeamMessages(prev, memberPageMessages));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, [teamName, memberName, nextCursor, loading]);

  const effectiveMessages = useMemo(
    () => mergeTeamMessages(messages, pagedMessages),
    [messages, pagedMessages]
  );

  const displayMessages = useMemo(
    () =>
      filterTeamMessages(effectiveMessages, {
        timeWindow: null,
        filter: { from: new Set(), to: new Set(), showNoise: true },
        searchQuery: '',
      }).slice(0, MAX_MESSAGES),
    [effectiveMessages]
  );

  const emptyStateText = loading
    ? 'Loading messages...'
    : hasMore
      ? 'No loaded messages for this member yet'
      : 'No messages with this member';

  return (
    <div className="max-h-[320px] space-y-2 overflow-y-auto">
      {displayMessages.length > 0 ? (
        displayMessages.map((msg, idx) => (
          <ActivityItem
            key={msg.messageId ?? idx}
            message={msg}
            teamName={teamName}
            onCreateTask={onCreateTask}
          />
        ))
      ) : (
        <div className="rounded-md border border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
          {emptyStateText}
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" size="sm" className="text-xs" disabled={loading} onClick={() => void loadOlderMessages()}>
            {loading ? 'Loading...' : 'Load older messages'}
          </Button>
        </div>
      )}
    </div>
  );
};
