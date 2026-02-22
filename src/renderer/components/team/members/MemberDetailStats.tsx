import { formatDistanceToNow } from 'date-fns';

interface MemberDetailStatsProps {
  totalTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  messageCount: number;
  lastActiveAt: string | null;
}

const StatBlock = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}): React.JSX.Element => (
  <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2">
    <p className="text-lg font-semibold text-[var(--color-text)]">{value}</p>
    <p className="text-[11px] text-[var(--color-text-muted)]">{label}</p>
    {sub && <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{sub}</p>}
  </div>
);

export const MemberDetailStats = ({
  totalTasks,
  inProgressTasks,
  completedTasks,
  messageCount,
  lastActiveAt,
}: MemberDetailStatsProps): React.JSX.Element => {
  const lastActive = lastActiveAt
    ? formatDistanceToNow(new Date(lastActiveAt), { addSuffix: true })
    : '—';

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatBlock
        label="Tasks"
        value={totalTasks}
        sub={inProgressTasks > 0 ? `in progress: ${inProgressTasks}` : undefined}
      />
      <StatBlock label="Completed" value={completedTasks} />
      <StatBlock label="Messages" value={messageCount} />
      <StatBlock label="Activity" value={lastActive} />
    </div>
  );
};
