import { useState } from 'react';

import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Textarea } from '@renderer/components/ui/textarea';
import { formatAgentRole } from '@renderer/utils/formatAgentRole';

import type { ResolvedTeamMember, TeamTask } from '@shared/types';

interface CreateTaskDialogProps {
  open: boolean;
  members: ResolvedTeamMember[];
  tasks: TeamTask[];
  defaultSubject?: string;
  defaultDescription?: string;
  defaultOwner?: string;
  onClose: () => void;
  onSubmit: (
    subject: string,
    description: string,
    owner?: string,
    blockedBy?: string[],
    prompt?: string
  ) => void;
  submitting?: boolean;
}

export const CreateTaskDialog = ({
  open,
  members,
  tasks,
  defaultSubject = '',
  defaultDescription = '',
  defaultOwner = '',
  onClose,
  onSubmit,
  submitting = false,
}: CreateTaskDialogProps): React.JSX.Element => {
  const [subject, setSubject] = useState(defaultSubject);
  const [description, setDescription] = useState(defaultDescription);
  const [owner, setOwner] = useState<string>(defaultOwner);
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [prevOpen, setPrevOpen] = useState(false);

  if (open && !prevOpen) {
    setSubject(defaultSubject);
    setDescription(defaultDescription);
    setOwner(defaultOwner);
    setBlockedBy([]);
    setPrompt('');
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  const canSubmit = subject.trim().length > 0 && !submitting;

  // Only show non-internal, non-deleted tasks as candidates for blocking
  const availableTasks = tasks.filter((t) => t.status !== 'deleted');

  const toggleBlockedBy = (taskId: string): void => {
    setBlockedBy((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    onSubmit(
      subject.trim(),
      description.trim(),
      owner || undefined,
      blockedBy.length > 0 ? blockedBy : undefined,
      prompt.trim() || undefined
    );
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>
            The task will be created in the team&apos;s tasks/ directory and appear on the Kanban
            board.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="task-subject">Subject</Label>
            <Input
              id="task-subject"
              placeholder="What needs to be done?"
              value={subject}
              autoFocus
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) handleSubmit();
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-description">Description (optional)</Label>
            <Textarea
              id="task-description"
              placeholder="Task details..."
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-prompt">Prompt for assignee (optional)</Label>
            <Textarea
              id="task-prompt"
              placeholder="Custom instructions for the team member..."
              value={prompt}
              rows={3}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Assignee (optional)</Label>
            <Select
              value={owner || '__unassigned__'}
              onValueChange={(v) => setOwner(v === '__unassigned__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {members.map((m) => {
                  const role = formatAgentRole(m.agentType);
                  return (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name}
                      {role ? ` (${role})` : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {availableTasks.length > 0 ? (
            <div className="grid gap-2">
              <Label>Blocked by tasks (optional)</Label>
              <div className="max-h-32 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                {availableTasks.map((t) => {
                  const isSelected = blockedBy.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)]'
                      }`}
                      onClick={() => toggleBlockedBy(t.id)}
                    >
                      <span
                        className={`flex size-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px] ${
                          isSelected
                            ? 'border-blue-400 bg-blue-500/30 text-blue-300'
                            : 'border-[var(--color-border-emphasis)]'
                        }`}
                      >
                        {isSelected ? '\u2713' : ''}
                      </span>
                      <Badge
                        variant="secondary"
                        className="shrink-0 px-1 py-0 text-[10px] font-normal"
                      >
                        #{t.id}
                      </Badge>
                      <span className="truncate">{t.subject}</span>
                    </button>
                  );
                })}
              </div>
              {blockedBy.length > 0 ? (
                <p className="text-[11px] text-yellow-300">
                  Task will be blocked by: {blockedBy.map((id) => `#${id}`).join(', ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
