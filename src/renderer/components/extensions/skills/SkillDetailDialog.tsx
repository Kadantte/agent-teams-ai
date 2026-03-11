import { useEffect } from 'react';

import { api } from '@renderer/api';
import { CodeBlockViewer } from '@renderer/components/chat/viewers/CodeBlockViewer';
import { MarkdownViewer } from '@renderer/components/chat/viewers/MarkdownViewer';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { useStore } from '@renderer/store';
import { AlertTriangle, ExternalLink, FolderOpen, Pencil, Trash2 } from 'lucide-react';

interface SkillDetailDialogProps {
  skillId: string | null;
  open: boolean;
  onClose: () => void;
  projectPath: string | null;
  onEdit: () => void;
  onDeleted: () => void;
}

export const SkillDetailDialog = ({
  skillId,
  open,
  onClose,
  projectPath,
  onEdit,
  onDeleted,
}: SkillDetailDialogProps): React.JSX.Element => {
  const fetchSkillDetail = useStore((s) => s.fetchSkillDetail);
  const deleteSkill = useStore((s) => s.deleteSkill);
  const skillsMutationLoading = useStore((s) => s.skillsMutationLoading);
  const detail = useStore((s) => (skillId ? s.skillsDetailsById[skillId] : undefined));
  const loading = useStore((s) =>
    skillId ? (s.skillsDetailLoadingById[skillId] ?? false) : false
  );

  useEffect(() => {
    if (!open || !skillId) return;
    if (detail === undefined) {
      void fetchSkillDetail(skillId, projectPath ?? undefined);
    }
  }, [detail, fetchSkillDetail, open, projectPath, skillId]);

  const item = detail?.item;

  function formatRootKind(rootKind: 'claude' | 'cursor' | 'agents'): string {
    return `.${rootKind}`;
  }

  async function handleDelete(): Promise<void> {
    if (!item) return;
    const confirmed = window.confirm(`Delete skill "${item.name}"? It will be moved to Trash.`);
    if (!confirmed) return;

    await deleteSkill({
      skillId: item.id,
      projectPath: projectPath ?? undefined,
    });
    onDeleted();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{item?.name ?? 'Skill details'}</DialogTitle>
          <DialogDescription>
            {item?.description ?? 'Inspect discovered skill metadata and raw instructions.'}
          </DialogDescription>
        </DialogHeader>

        {(loading || (open && skillId && detail === undefined)) && (
          <p className="text-sm text-text-muted">Loading skill details...</p>
        )}

        {!loading && detail === null && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            Unable to load this skill.
          </div>
        )}

        {!loading && detail && item && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{item.scope}</Badge>
              <Badge variant="outline">{formatRootKind(item.rootKind)}</Badge>
              <Badge variant="secondary">{item.invocationMode}</Badge>
              {item.flags.hasScripts && <Badge variant="destructive">scripts</Badge>}
              {item.flags.hasReferences && <Badge variant="secondary">references</Badge>}
              {item.flags.hasAssets && <Badge variant="secondary">assets</Badge>}
            </div>

            {item.issues.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
                {item.issues.map((issue, index) => (
                  <div
                    key={`${issue.code}-${index}`}
                    className="flex gap-2 text-sm text-amber-700 dark:text-amber-300"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onEdit}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit Skill
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void api.showInFolder(item.skillFile)}
              >
                <FolderOpen className="mr-1.5 size-3.5" />
                Open Folder
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void api.openPath(item.skillFile, projectPath ?? undefined)}
              >
                <ExternalLink className="mr-1.5 size-3.5" />
                Open SKILL.md
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={skillsMutationLoading}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Delete
              </Button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 rounded-lg border border-border p-4">
                <MarkdownViewer
                  content={detail.body || detail.rawContent}
                  baseDir={item.skillDir}
                  bare
                  copyable
                />
              </div>

              <div className="space-y-4">
                <CodeBlockViewer
                  fileName={item.skillFile}
                  content={detail.rawContent}
                  maxHeight="max-h-72"
                />

                <div className="rounded-lg border border-border p-3 text-sm text-text-secondary">
                  <div className="space-y-2">
                    <p className="font-medium text-text">Path</p>
                    <p className="break-all text-xs text-text-muted">{item.skillDir}</p>
                  </div>

                  {detail.scriptFiles.length > 0 && (
                    <div className="mt-4 space-y-1">
                      <p className="font-medium text-text">Scripts</p>
                      {detail.scriptFiles.map((file) => (
                        <p key={file} className="text-xs text-text-muted">
                          {file}
                        </p>
                      ))}
                    </div>
                  )}

                  {detail.referencesFiles.length > 0 && (
                    <div className="mt-4 space-y-1">
                      <p className="font-medium text-text">References</p>
                      {detail.referencesFiles.map((file) => (
                        <p key={file} className="text-xs text-text-muted">
                          {file}
                        </p>
                      ))}
                    </div>
                  )}

                  {detail.assetFiles.length > 0 && (
                    <div className="mt-4 space-y-1">
                      <p className="font-medium text-text">Assets</p>
                      {detail.assetFiles.map((file) => (
                        <p key={file} className="text-xs text-text-muted">
                          {file}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
