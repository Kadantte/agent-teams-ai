import React from 'react';

import { Checkbox } from '@renderer/components/ui/checkbox';
import { Label } from '@renderer/components/ui/label';

interface LimitContextCheckboxProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const LimitContextCheckbox: React.FC<LimitContextCheckboxProps> = ({
  id,
  checked,
  onCheckedChange,
  disabled = false,
}) => (
  <div className="mt-4 flex items-center gap-2">
    <Checkbox
      id={id}
      checked={checked && !disabled}
      disabled={disabled}
      onCheckedChange={(value) => onCheckedChange(value === true)}
    />
    <Label
      htmlFor={id}
      className={`flex cursor-pointer items-center gap-1.5 text-xs font-normal ${
        disabled ? 'cursor-not-allowed text-text-muted opacity-50' : 'text-text-secondary'
      }`}
    >
      Limit context to 200K tokens
    </Label>
  </div>
);
