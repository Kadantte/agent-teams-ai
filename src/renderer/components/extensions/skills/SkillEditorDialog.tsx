import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MarkdownPreviewPane } from '@renderer/components/team/editor/MarkdownPreviewPane';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Checkbox } from '@renderer/components/ui/checkbox';
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
import { FileSearch, RotateCcw, X } from 'lucide-react';

import { SkillCodeEditor } from './SkillCodeEditor';
import { SkillReviewDialog } from './SkillReviewDialog';
import {
  buildSkillDraftFiles,
  buildSkillTemplate,
  readSkillTemplateInput,
  updateSkillTemplateFrontmatter,
} from './skillDraftUtils';

import type {
  SkillCatalogItem,
  SkillDetail,
  SkillInvocationMode,
  SkillReviewPreview,
} from '@shared/types/extensions';

type EditorMode = 'create' | 'edit';

interface SkillEditorDialogProps {
  open: boolean;
  mode: EditorMode;
  projectPath: string | null;
  projectLabel: string | null;
  detail: SkillDetail | null;
  onClose: () => void;
  onSaved: (skillId: string | null) => void;
}

function parseInitialName(detail: SkillDetail | null): string {
  return detail?.item.name ?? '';
}

function parseInitialDescription(detail: SkillDetail | null): string {
  return detail?.item.description ?? '';
}

export const SkillEditorDialog = ({
  open,
  mode,
  projectPath,
  projectLabel,
  detail,
  onClose,
  onSaved,
}: SkillEditorDialogProps): React.JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rawContentRef = useRef('');
  const previewSkillUpsert = useStore((s) => s.previewSkillUpsert);
  const applySkillUpsert = useStore((s) => s.applySkillUpsert);
  const skillsMutationLoading = useStore((s) => s.skillsMutationLoading);
  const skillsMutationError = useStore((s) => s.skillsMutationError);

  const [scope, setScope] = useState<'user' | 'project'>('user');
  const [rootKind, setRootKind] = useState<'claude' | 'cursor' | 'agents'>('claude');
  const [folderName, setFolderName] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [license, setLicense] = useState('');
  const [compatibility, setCompatibility] = useState('');
  const [invocationMode, setInvocationMode] = useState<SkillInvocationMode>('auto');
  const [includeScripts, setIncludeScripts] = useState(false);
  const [includeReferences, setIncludeReferences] = useState(false);
  const [includeAssets, setIncludeAssets] = useState(false);
  const [rawContent, setRawContent] = useState('');
  const [manualRawEdit, setManualRawEdit] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.52);
  const [isResizing, setIsResizing] = useState(false);
  const [reviewPreview, setReviewPreview] = useState<SkillReviewPreview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const applyMetadataToRawContent = useCallback(
    (
      nextValues: Partial<{
        name: string;
        description: string;
        license: string;
        compatibility: string;
        invocationMode: SkillInvocationMode;
      }>
    ) => {
      const merged = {
        name,
        description,
        license,
        compatibility,
        invocationMode,
        ...nextValues,
      };
      const nextRawContent =
        mode === 'create' && !manualRawEdit
          ? buildSkillTemplate(merged)
          : updateSkillTemplateFrontmatter(rawContentRef.current, merged);

      rawContentRef.current = nextRawContent;
      setRawContent(nextRawContent);
    },
    [compatibility, description, invocationMode, license, manualRawEdit, mode, name]
  );

  useEffect(() => {
    if (!open) return;

    const item = detail?.item;
    const nextScope = item?.scope ?? (projectPath ? 'project' : 'user');
    const nextRootKind = item?.rootKind ?? 'claude';
    const nextFolderName = item?.folderName ?? '';
    const nextName = parseInitialName(detail);
    const nextDescription = parseInitialDescription(detail);
    const nextLicense = item?.license ?? '';
    const nextCompatibility = item?.compatibility ?? '';
    const nextInvocationMode = item?.invocationMode ?? 'auto';
    const nextRawContent =
      detail?.rawContent ??
      buildSkillTemplate({
        name: nextName || 'New Skill',
        description: nextDescription || 'Describe what this skill helps with.',
        license: nextLicense,
        compatibility: nextCompatibility,
        invocationMode: nextInvocationMode,
      });
    const rawInput = readSkillTemplateInput(nextRawContent);

    setScope(nextScope);
    setRootKind(nextRootKind);
    setFolderName(nextFolderName || nextName || '');
    setName(rawInput.name || nextName || 'New Skill');
    setDescription(
      rawInput.description || nextDescription || 'Describe what this skill helps with.'
    );
    setLicense(rawInput.license ?? nextLicense);
    setCompatibility(rawInput.compatibility ?? nextCompatibility);
    setInvocationMode(rawInput.invocationMode ?? nextInvocationMode);
    setIncludeScripts(item?.flags.hasScripts ?? false);
    setIncludeReferences(item?.flags.hasReferences ?? false);
    setIncludeAssets(item?.flags.hasAssets ?? false);
    rawContentRef.current = nextRawContent;
    setRawContent(nextRawContent);
    setManualRawEdit(false);
    setReviewPreview(null);
    setReviewOpen(false);
  }, [detail, mode, open, projectPath]);

  useEffect(() => {
    rawContentRef.current = rawContent;
  }, [rawContent]);

  const request = useMemo(
    () => ({
      scope,
      rootKind,
      projectPath: scope === 'project' ? (projectPath ?? undefined) : undefined,
      folderName,
      existingSkillId: mode === 'edit' ? detail?.item.id : undefined,
      files: buildSkillDraftFiles({
        rawContent,
        includeScripts,
        includeReferences,
        includeAssets,
      }),
    }),
    [
      detail?.item.id,
      folderName,
      includeAssets,
      includeReferences,
      includeScripts,
      mode,
      projectPath,
      rawContent,
      rootKind,
      scope,
    ]
  );
  const draftFilePaths = useMemo(
    () => request.files.map((file) => file.relativePath),
    [request.files]
  );
  const auxiliaryDraftFilePaths = useMemo(
    () => draftFilePaths.filter((filePath) => filePath !== 'SKILL.md'),
    [draftFilePaths]
  );

  const canUseProjectScope = Boolean(projectPath);
  const title = mode === 'create' ? 'Create skill' : 'Edit skill';
  const descriptionText =
    mode === 'create'
      ? 'Draft a new local skill, review the filesystem changes, then save it into a supported skill root.'
      : 'Update the selected skill and review the resulting file changes before saving.';

  const handleMouseMove = useCallback((event: MouseEvent): void => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setSplitRatio(Math.min(0.75, Math.max(0.25, ratio)));
  }, []);

  const handleMouseUp = useCallback((): void => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [handleMouseMove, handleMouseUp, isResizing]);

  async function handleReview(): Promise<void> {
    const preview = await previewSkillUpsert(request);
    setReviewPreview(preview);
    setReviewOpen(true);
  }

  async function handleConfirmSave(): Promise<void> {
    const saved = await applySkillUpsert(request);
    setReviewOpen(false);
    onSaved(saved?.item.id ?? detail?.item.id ?? null);
    onClose();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0">
          <div className="flex max-h-[85vh] min-h-0 flex-col">
            <DialogHeader className="border-b border-border px-6 py-5">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{descriptionText}</DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="skill-scope">Scope</Label>
                    <Select
                      value={scope}
                      onValueChange={(value) => setScope(value as 'user' | 'project')}
                      disabled={mode === 'edit'}
                    >
                      <SelectTrigger id="skill-scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="project" disabled={!canUseProjectScope}>
                          {canUseProjectScope
                            ? `Project: ${projectLabel ?? projectPath}`
                            : 'Project unavailable'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="skill-root">Root</Label>
                    <Select
                      value={rootKind}
                      onValueChange={(value) =>
                        setRootKind(value as 'claude' | 'cursor' | 'agents')
                      }
                      disabled={mode === 'edit'}
                    >
                      <SelectTrigger id="skill-root">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude">.claude</SelectItem>
                        <SelectItem value="cursor">.cursor</SelectItem>
                        <SelectItem value="agents">.agents</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="skill-folder">Folder name</Label>
                    <Input
                      id="skill-folder"
                      value={folderName}
                      onChange={(event) => setFolderName(event.target.value)}
                      disabled={mode === 'edit'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="skill-invocation">Invocation</Label>
                    <Select
                      value={invocationMode}
                      onValueChange={(value) => {
                        const nextValue = value as SkillInvocationMode;
                        setInvocationMode(nextValue);
                        applyMetadataToRawContent({ invocationMode: nextValue });
                      }}
                    >
                      <SelectTrigger id="skill-invocation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="manual-only">Manual only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="skill-name">Skill name</Label>
                    <Input
                      id="skill-name"
                      value={name}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setName(nextValue);
                        applyMetadataToRawContent({ name: nextValue });
                      }}
                      placeholder="Write concise skill name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skill-license">License</Label>
                    <Input
                      id="skill-license"
                      value={license}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setLicense(nextValue);
                        applyMetadataToRawContent({ license: nextValue });
                      }}
                      placeholder="MIT"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="skill-description">Description</Label>
                    <Input
                      id="skill-description"
                      value={description}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setDescription(nextValue);
                        applyMetadataToRawContent({ description: nextValue });
                      }}
                      placeholder="What this skill helps with"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skill-compatibility">Compatibility</Label>
                    <Input
                      id="skill-compatibility"
                      value={compatibility}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setCompatibility(nextValue);
                        applyMetadataToRawContent({ compatibility: nextValue });
                      }}
                      placeholder="claude-code, cursor"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-text">Optional files</p>
                      <p className="mt-1 text-xs text-text-muted">
                        Add starter files that will be included in the review and written together
                        with `SKILL.md`.
                      </p>
                    </div>
                    {mode === 'edit' && (
                      <Badge variant="outline" className="font-normal">
                        Root and folder are locked for edits
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="bg-surface-raised/10 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
                      <Checkbox
                        checked={includeReferences}
                        onCheckedChange={(value) => setIncludeReferences(Boolean(value))}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="font-medium text-text">References</p>
                        <p className="mt-1 text-xs text-text-muted">
                          Add `references/README.md` for docs, links, and examples.
                        </p>
                      </div>
                    </label>

                    <label className="bg-surface-raised/10 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
                      <Checkbox
                        checked={includeScripts}
                        onCheckedChange={(value) => setIncludeScripts(Boolean(value))}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="font-medium text-text">Scripts</p>
                        <p className="mt-1 text-xs text-text-muted">
                          Add `scripts/README.md` for helper commands or setup notes.
                        </p>
                      </div>
                    </label>

                    <label className="bg-surface-raised/10 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
                      <Checkbox
                        checked={includeAssets}
                        onCheckedChange={(value) => setIncludeAssets(Boolean(value))}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="font-medium text-text">Assets</p>
                        <p className="mt-1 text-xs text-text-muted">
                          Add `assets/README.md` for screenshots or bundled media.
                        </p>
                      </div>
                    </label>
                  </div>

                  {auxiliaryDraftFilePaths.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                        Added files:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {auxiliaryDraftFilePaths.map((filePath) => (
                          <Badge key={filePath} variant="outline" className="font-normal">
                            {filePath}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {skillsMutationError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
                    {skillsMutationError}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="skill-raw">SKILL.md</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setManualRawEdit(false);
                        const nextRawContent = buildSkillTemplate({
                          name,
                          description,
                          license,
                          compatibility,
                          invocationMode,
                        });
                        rawContentRef.current = nextRawContent;
                        setRawContent(nextRawContent);
                      }}
                    >
                      <RotateCcw className="mr-1.5 size-3.5" />
                      Reset From Template
                    </Button>
                  </div>

                  <div
                    ref={containerRef}
                    className="flex h-[520px] min-h-0 overflow-hidden rounded-lg border border-border"
                  >
                    <div className="min-w-0" style={{ width: `${splitRatio * 100}%` }}>
                      <SkillCodeEditor
                        value={rawContent}
                        onChange={(value) => {
                          setManualRawEdit(true);
                          rawContentRef.current = value;
                          setRawContent(value);

                          const rawInput = readSkillTemplateInput(value);
                          if (rawInput.name !== undefined) setName(rawInput.name);
                          if (rawInput.description !== undefined)
                            setDescription(rawInput.description);
                          if (rawInput.license !== undefined) setLicense(rawInput.license);
                          if (rawInput.compatibility !== undefined)
                            setCompatibility(rawInput.compatibility);
                          if (rawInput.invocationMode !== undefined)
                            setInvocationMode(rawInput.invocationMode);
                        }}
                      />
                    </div>
                    <div
                      className={`w-1 shrink-0 cursor-col-resize border-x border-border ${
                        isResizing ? 'bg-blue-500/50' : 'hover:bg-blue-500/30'
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setIsResizing(true);
                      }}
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <MarkdownPreviewPane content={rawContent} baseDir={detail?.item.skillDir} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-6 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
              <Button variant="outline" onClick={onClose}>
                <X className="mr-1.5 size-3.5" />
                Cancel
              </Button>
              <p className="min-w-[16rem] flex-1 text-sm text-text-muted">
                Review the file changes first, then confirm save in the next step.
              </p>
              <Button onClick={() => void handleReview()} disabled={skillsMutationLoading}>
                <FileSearch className="mr-1.5 size-3.5" />
                {skillsMutationLoading
                  ? 'Preparing...'
                  : mode === 'create'
                    ? 'Review And Create'
                    : 'Review And Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SkillReviewDialog
        open={reviewOpen}
        preview={reviewPreview}
        loading={skillsMutationLoading}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => void handleConfirmSave()}
        confirmLabel={mode === 'create' ? 'Create Skill' : 'Save Skill'}
        reviewLabel={mode === 'create' ? 'Creating a skill' : 'Saving this skill'}
      />
    </>
  );
};
