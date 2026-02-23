import { getMemberColorByName } from '@shared/constants/memberColors';

import { ActivityItem } from './ActivityItem';

import type { InboxMessage, ResolvedTeamMember } from '@shared/types';

interface ActivityTimelineProps {
  messages: InboxMessage[];
  members?: ResolvedTeamMember[];
  onCreateTaskFromMessage?: (subject: string, description: string) => void;
  onReplyToMessage?: (message: InboxMessage) => void;
  onMemberClick?: (member: ResolvedTeamMember) => void;
}

export const ActivityTimeline = ({
  messages,
  members,
  onCreateTaskFromMessage,
  onReplyToMessage,
  onMemberClick,
}: ActivityTimelineProps): React.JSX.Element => {
  const memberInfo = new Map<string, { role?: string; color?: string }>();
  if (members) {
    for (const m of members) {
      const info = {
        role: m.role ?? (m.agentType !== 'general-purpose' ? m.agentType : undefined),
        color: m.color,
      };
      memberInfo.set(m.name, info);
      if (m.agentType && m.agentType !== m.name) {
        memberInfo.set(m.agentType, info);
      }
    }
  }

  const handleMemberNameClick = (name: string): void => {
    const member = members?.find((m) => m.name === name || m.agentType === name);
    if (member) onMemberClick?.(member);
  };

  if (messages.length === 0) {
    return (
      <div className="rounded-md border border-[var(--color-border)] p-3 text-xs text-[var(--color-text-muted)]">
        <p>No messages</p>
        <p className="mt-1 text-[11px]">Send a message to a member to see activity.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {messages.slice(0, 200).map((message, index) => {
        const info = memberInfo.get(message.from);
        const recipientInfo = message.to ? memberInfo.get(message.to) : undefined;
        const recipientColor =
          recipientInfo?.color ?? (message.to ? getMemberColorByName(message.to) : undefined);
        return (
          <ActivityItem
            key={`${message.messageId ?? index}-${message.timestamp}-${message.from}`}
            message={message}
            memberRole={info?.role}
            memberColor={info?.color}
            recipientColor={recipientColor}
            onMemberNameClick={onMemberClick ? handleMemberNameClick : undefined}
            onCreateTask={onCreateTaskFromMessage}
            onReply={onReplyToMessage}
          />
        );
      })}
    </div>
  );
};
