import { useEffect, useState } from 'react';

import { api } from '@renderer/api';
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
import { useStore } from '@renderer/store';
import { FileSearch, FolderOpen, X } from 'lucide-react';

import { SkillReviewDialog } from './SkillReviewDialog';

import type { SkillReviewPreview } from '@shared/types/extensions';

interface SkillImportDialogProps {
  open: boolean;
  projectPath: string | null;
  projectLabel: string | null;
  onClose: () => void;
  onImported: (skillId: string | null) => void;
}

export const SkillImportDialog = ({
  open,
  projectPath,
  projectLabel,
  onClose,
  onImported,
}: SkillImportDialogProps): React.JSX.Element => {
  const previewSkillImport = useStore((s) => s.previewSkillImport);
  const applySkillImport = useStore((s) => s.applySkillImport);
  const skillsMutationLoading = useStore((s) => s.skillsMutationLoading);
  const skillsMutationError = useStore((s) => s.skillsMutationError);

  const [sourceDir, setSourceDir] = useState('');
  const [folderName, setFolderName] = useState('');
  const [scope, setScope] = useState<'user' | 'project'>('user');
  const [rootKind, setRootKind] = useState<'claude' | 'cursor' | 'agents'>('claude');
  const [preview, setPreview] = useState<SkillReviewPreview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSourceDir('');
    setFolderName('');
    setScope(projectPath ? 'project' : 'user');
    setRootKind('claude');
    setPreview(null);
    setReviewOpen(false);
  }, [open, projectPath]);

  async function handleChooseFolder(): Promise<void> {
    const selected = await api.config.selectFolders();
    const first = selected[0];
    if (!first) return;
    setSourceDir(first);
    if (!folderName) {
      const segments = first.split(/[\\/]/u).filter(Boolean);
      setFolderName(segments.at(-1) ?? '');
    }
  }

  async function handleReview(): Promise<void> {
    const nextPreview = await previewSkillImport({
      sourceDir,
      folderName: folderName || undefined,
      scope,
      rootKind,
      projectPath: scope === 'project' ? (projectPath ?? undefined) : undefined,
    });
    setPreview(nextPreview);
    setReviewOpen(true);
  }

  async function handleConfirmImport(): Promise<void> {
    const detail = await applySkillImport({
      sourceDir,
      folderName: folderName || undefined,
      scope,
      rootKind,
      projectPath: scope === 'project' ? (projectPath ?? undefined) : undefined,
    });
    setReviewOpen(false);
    onImported(detail?.item.id ?? null);
    onClose();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="gap-0 overflow-hidden p-0">
          <div className="flex max-h-[85vh] min-h-0 flex-col">
            <DialogHeader className="border-b border-border px-6 py-5">
              <DialogTitle>Import skill</DialogTitle>
              <DialogDescription>
                Pick an existing skill folder, review the copy plan, then import it into a supported
                root.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="skill-import-source">Source folder</Label>
                  <div className="flex gap-2">
                    <Input
                      id="skill-import-source"
                      value={sourceDir}
                      onChange={(event) => setSourceDir(event.target.value)}
                    />
                    <Button variant="outline" onClick={() => void handleChooseFolder()}>
                      <FolderOpen className="mr-1.5 size-3.5" />
                      Browse
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skill-import-folder">Destination folder name</Label>
                  <Input
                    id="skill-import-folder"
                    value={folderName}
                    onChange={(event) => setFolderName(event.target.value)}
                    placeholder="Defaults to source folder name"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="skill-import-scope">Scope</Label>
                    <Select
                      value={scope}
                      onValueChange={(value) => setScope(value as 'user' | 'project')}
                    >
                      <SelectTrigger id="skill-import-scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="project" disabled={!projectPath}>
                          {projectPath
                            ? `Project: ${projectLabel ?? projectPath}`
                            : 'Project unavailable'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="skill-import-root">Root</Label>
                    <Select
                      value={rootKind}
                      onValueChange={(value) =>
                        setRootKind(value as 'claude' | 'cursor' | 'agents')
                      }
                    >
                      <SelectTrigger id="skill-import-root">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude">.claude</SelectItem>
                        <SelectItem value="cursor">.cursor</SelectItem>
                        <SelectItem value="agents">.agents</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {skillsMutationError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
                    {skillsMutationError}
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-6 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
              <Button variant="outline" onClick={onClose}>
                <X className="mr-1.5 size-3.5" />
                Cancel
              </Button>
              <p className="min-w-[16rem] flex-1 text-sm text-text-muted">
                Review the copied files first, then confirm the import in the next step.
              </p>
              <Button
                onClick={() => void handleReview()}
                disabled={!sourceDir || skillsMutationLoading}
              >
                <FileSearch className="mr-1.5 size-3.5" />
                {skillsMutationLoading ? 'Preparing...' : 'Review And Import'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SkillReviewDialog
        open={reviewOpen}
        preview={preview}
        loading={skillsMutationLoading}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => void handleConfirmImport()}
        confirmLabel="Import Skill"
        reviewLabel="Importing this skill"
      />
    </>
  );
};
