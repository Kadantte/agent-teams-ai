import { Badge } from '@renderer/components/ui/badge';
import { DialogDescription, DialogTitle } from '@renderer/components/ui/dialog';
import { formatAgentRole } from '@renderer/utils/formatAgentRole';
import { agentAvatarUrl, getMemberDotClass, getPresenceLabel } from '@renderer/utils/memberHelpers';

import type { ResolvedTeamMember } from '@shared/types';

interface MemberDetailHeaderProps {
  member: ResolvedTeamMember;
}

export const MemberDetailHeader = ({ member }: MemberDetailHeaderProps): React.JSX.Element => {
  const role = member.role || formatAgentRole(member.agentType);
  const presenceLabel = getPresenceLabel(member);
  const dotClass = getMemberDotClass(member);

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <img
          src={agentAvatarUrl(member.name, 96)}
          alt={member.name}
          className="size-12 rounded-full bg-[var(--color-surface-raised)]"
          loading="lazy"
        />
        <span
          className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[var(--color-surface)] ${dotClass}`}
          aria-label={member.status}
        />
      </div>
      <div className="min-w-0 flex-1">
        <DialogTitle className="truncate">{member.name}</DialogTitle>
        <DialogDescription className="mt-1 flex items-center gap-2">
          {role && <span>{role}</span>}
          <Badge
            variant="secondary"
            className="px-1.5 py-0.5 text-[10px] font-normal leading-none text-[var(--color-text-muted)]"
          >
            {presenceLabel}
          </Badge>
        </DialogDescription>
      </div>
    </div>
  );
};
