import { MarkdownViewer } from '@renderer/components/chat/viewers/MarkdownViewer';
import {
  CARD_BG,
  CARD_BORDER_STYLE,
  CARD_ICON_MUTED,
  CARD_TEXT_LIGHT,
} from '@renderer/constants/cssVariables';
import { getTeamColorSet } from '@renderer/constants/teamColors';
import {
  getMessageTypeLabel,
  getStructuredMessageSummary,
  parseStructuredAgentMessage,
} from '@renderer/utils/agentMessageFormatting';
import { formatAgentRole } from '@renderer/utils/formatAgentRole';
import { Bot, ListPlus, MessageSquare } from 'lucide-react';

import type { TeamColorSet } from '@renderer/constants/teamColors';
import type { InboxMessage } from '@shared/types';

type StructuredMessage = Record<string, unknown>;

interface ActivityItemProps {
  message: InboxMessage;
  memberRole?: string;
  memberColor?: string;
  onCreateTask?: (subject: string, description: string) => void;
}

function getStringField(obj: StructuredMessage, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function getNoiseLabel(parsed: StructuredMessage): string | null {
  const type = getStringField(parsed, 'type');

  if (type === 'idle_notification') {
    const reason = getStringField(parsed, 'idleReason');
    return reason ? `Idle (${reason})` : 'Idle';
  }

  if (type === 'shutdown_response') {
    return parsed.approve === true ? 'Shut down' : 'Rejected shutdown';
  }

  if (type === 'shutdown_request') {
    return 'Shutdown requested';
  }

  if (type === 'shutdown_approved' || type === 'teammate_terminated') {
    return type === 'shutdown_approved' ? 'Shutdown confirmed' : 'Terminated';
  }

  if (type === 'task_completed') {
    const rawTaskId = parsed.taskId;
    const taskId =
      typeof rawTaskId === 'string' || typeof rawTaskId === 'number' ? rawTaskId : null;
    return taskId !== null ? `Completed task #${taskId}` : 'Completed a task';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Compact noise row (idle, shutdown, terminated) — minimal dot + name + label
// ---------------------------------------------------------------------------

const NoiseRow = ({
  name,
  label,
  colors,
}: {
  name: string;
  label: string;
  colors: TeamColorSet;
}): React.JSX.Element => (
  <div className="flex items-center gap-2 px-3 py-1" style={{ opacity: 0.45 }}>
    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colors.border }} />
    <span className="text-[11px]" style={{ color: CARD_ICON_MUTED }}>
      {name}
    </span>
    <span className="text-[11px]" style={{ color: CARD_ICON_MUTED }}>
      {label}
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// Full message card — left colored border, name badge, expanded content
// ---------------------------------------------------------------------------

export const ActivityItem = ({
  message,
  memberRole,
  memberColor,
  onCreateTask,
}: ActivityItemProps): React.JSX.Element => {
  const colors = getTeamColorSet(memberColor ?? message.color ?? '');
  const formattedRole = formatAgentRole(memberRole);

  const timestamp = Number.isNaN(Date.parse(message.timestamp))
    ? message.timestamp
    : new Date(message.timestamp).toLocaleString();

  const structured = parseStructuredAgentMessage(message.text);
  const noiseLabel = structured ? getNoiseLabel(structured) : null;

  // Noise messages: minimal inline row
  if (noiseLabel) {
    return <NoiseRow name={message.from} label={noiseLabel} colors={colors} />;
  }

  const messageType =
    structured && typeof structured.type === 'string' ? getMessageTypeLabel(structured.type) : null;
  const autoSummary = structured ? getStructuredMessageSummary(structured) : null;

  const handleCreateTask = (): void => {
    const subject = message.summary || autoSummary || `Task from ${message.from}`;
    const plainText = structured ? JSON.stringify(structured, null, 2) : message.text;
    const description = `From: ${message.from}\nAt: ${timestamp}\n\n${plainText}`.slice(0, 2000);
    onCreateTask?.(subject, description);
  };

  const summaryText = message.summary || autoSummary || '';

  return (
    <article
      className="group overflow-hidden rounded-md"
      style={{
        backgroundColor: CARD_BG,
        border: CARD_BORDER_STYLE,
        borderLeft: `3px solid ${colors.border}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {message.source === 'lead_session' ? (
          <Bot className="size-3.5 shrink-0" style={{ color: colors.border }} />
        ) : (
          <MessageSquare className="size-3.5 shrink-0" style={{ color: colors.border }} />
        )}

        {/* Name badge */}
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide"
          style={{
            backgroundColor: colors.badge,
            color: colors.text,
            border: `1px solid ${colors.border}40`,
          }}
        >
          {message.from}
        </span>

        {/* Role */}
        {formattedRole ? (
          <span className="text-[10px]" style={{ color: CARD_ICON_MUTED }}>
            {formattedRole}
          </span>
        ) : null}

        {/* Message type label */}
        {messageType ? (
          <span className="text-[10px] uppercase tracking-wide" style={{ color: CARD_ICON_MUTED }}>
            {messageType}
          </span>
        ) : null}

        {/* Lead session marker */}
        {message.source === 'lead_session' ? (
          <span className="text-[10px] uppercase tracking-wide" style={{ color: CARD_ICON_MUTED }}>
            session
          </span>
        ) : null}

        {/* Recipient */}
        {message.to && message.to !== message.from ? (
          <span className="text-[10px]" style={{ color: CARD_ICON_MUTED }}>
            &rarr; {message.to}
          </span>
        ) : null}

        {/* Summary */}
        <span className="flex-1 truncate text-xs" style={{ color: CARD_TEXT_LIGHT }}>
          {summaryText}
        </span>

        {/* Timestamp + create task */}
        <div className="flex shrink-0 items-center gap-1.5">
          {onCreateTask && (
            <button
              type="button"
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-[var(--color-surface-raised)] group-hover:opacity-100"
              style={{ color: CARD_ICON_MUTED }}
              title="Create task from message"
              onClick={handleCreateTask}
            >
              <ListPlus size={14} />
            </button>
          )}
          <span className="text-[10px]" style={{ color: CARD_ICON_MUTED }}>
            {timestamp}
          </span>
        </div>
      </div>

      {/* Content — always expanded */}
      <div className="px-3 pb-3">
        {structured ? (
          <div className="space-y-2">
            {autoSummary && autoSummary !== messageType ? (
              <p className="text-xs text-[var(--color-text-secondary)]">{autoSummary}</p>
            ) : null}
            <details className="rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
              <summary className="cursor-pointer px-2 py-1 text-[11px] text-[var(--color-text-muted)]">
                Raw JSON
              </summary>
              <pre className="overflow-auto px-2 pb-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                {JSON.stringify(structured, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <MarkdownViewer content={message.text} maxHeight="max-h-56" copyable />
        )}
      </div>
    </article>
  );
};
