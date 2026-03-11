import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip';
import { MessageSquare } from 'lucide-react';

interface UnreadCommentsBadgeProps {
  unreadCount: number;
  totalCount: number;
}

export const UnreadCommentsBadge = ({
  unreadCount,
  totalCount,
}: UnreadCommentsBadgeProps): React.JSX.Element | null => {
  if (totalCount === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] shadow-sm transition-colors hover:bg-[var(--color-surface-raised)]">
          <MessageSquare size={14} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-slate-200 px-1 text-[7px] font-bold leading-none text-slate-700 shadow-sm dark:bg-slate-200 dark:text-slate-900">
            {totalCount}
          </span>
          {unreadCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-[9px] font-bold leading-none text-white shadow-sm ring-2 ring-[var(--color-surface-raised)]">
              {unreadCount}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {unreadCount > 0
          ? `${unreadCount} unread comments, ${totalCount} total`
          : `${totalCount} comments`}
      </TooltipContent>
    </Tooltip>
  );
};
