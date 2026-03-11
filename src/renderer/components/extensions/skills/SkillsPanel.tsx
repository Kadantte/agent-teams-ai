import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@renderer/api';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover';
import { useStore } from '@renderer/store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip';
import {
  AlertTriangle,
  ArrowUpAZ,
  ArrowUpDown,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Plus,
  Search,
} from 'lucide-react';

import { SearchInput } from '../common/SearchInput';

import { SkillDetailDialog } from './SkillDetailDialog';
import { SkillEditorDialog } from './SkillEditorDialog';
import { SkillImportDialog } from './SkillImportDialog';

import type { SkillCatalogItem } from '@shared/types/extensions';
import type { SkillsSortState } from '@renderer/hooks/useExtensionsTabState';

const SUCCESS_BANNER_MS = 2500;

interface SkillsPanelProps {
  projectPath: string | null;
  projectLabel: string | null;
  skillsSearchQuery: string;
  setSkillsSearchQuery: (value: string) => void;
  skillsSort: SkillsSortState;
  setSkillsSort: (value: SkillsSortState) => void;
  selectedSkillId: string | null;
  setSelectedSkillId: (id: string | null) => void;
}

function sortSkills(skills: SkillCatalogItem[], sort: SkillsSortState): SkillCatalogItem[] {
  const next = [...skills];
  next.sort((a, b) => {
    if (sort === 'recent-desc') {
      return b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name) || b.modifiedAt - a.modifiedAt;
  });
  return next;
}

function formatRootKind(rootKind: SkillCatalogItem['rootKind']): string {
  return `.${rootKind}`;
}

export const SkillsPanel = ({
  projectPath,
  projectLabel,
  skillsSearchQuery,
  setSkillsSearchQuery,
  skillsSort,
  setSkillsSort,
  selectedSkillId,
  setSelectedSkillId,
}: SkillsPanelProps): React.JSX.Element => {
  const fetchSkillsCatalog = useStore((s) => s.fetchSkillsCatalog);
  const fetchSkillDetail = useStore((s) => s.fetchSkillDetail);
  const skillsLoading = useStore((s) => s.skillsLoading);
  const skillsError = useStore((s) => s.skillsError);
  const detailById = useStore((s) => s.skillsDetailsById);
  const userSkills = useStore((s) => s.skillsUserCatalog);
  const projectSkills = useStore((s) =>
    projectPath ? (s.skillsProjectCatalogByProjectPath[projectPath] ?? []) : []
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const selectedSkillIdRef = useRef<string | null>(selectedSkillId);
  selectedSkillIdRef.current = selectedSkillId;

  const mergedSkills = useMemo(
    () => [...projectSkills, ...userSkills],
    [projectSkills, userSkills]
  );
  const selectedDetail = selectedSkillId ? (detailById[selectedSkillId] ?? null) : null;

  useEffect(() => {
    if (!selectedSkillId) return;
    if (mergedSkills.some((skill) => skill.id === selectedSkillId)) return;
    setSelectedSkillId(null);
  }, [mergedSkills, selectedSkillId, setSelectedSkillId]);

  useEffect(() => {
    if (!successMessage) return;
    const timeoutId = window.setTimeout(() => setSuccessMessage(null), SUCCESS_BANNER_MS);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  useEffect(() => {
    const skillsApi = api.skills;
    if (!skillsApi) return;

    let watchId: string | null = null;
    let disposed = false;
    void skillsApi.startWatching(projectPath ?? undefined).then((id) => {
      if (disposed) {
        void skillsApi.stopWatching(id);
        return;
      }
      watchId = id;
    });
    const changeCleanup = skillsApi.onChanged((event) => {
      const shouldRefresh =
        event.scope === 'user' ||
        (event.scope === 'project' && event.projectPath === (projectPath ?? null));
      if (!shouldRefresh) return;

      void fetchSkillsCatalog(projectPath ?? undefined);
      if (selectedSkillIdRef.current) {
        void fetchSkillDetail(selectedSkillIdRef.current, projectPath ?? undefined);
      }
    });

    return () => {
      disposed = true;
      changeCleanup();
      if (watchId) {
        void skillsApi.stopWatching(watchId);
      }
    };
  }, [fetchSkillDetail, fetchSkillsCatalog, projectPath]);

  const visibleSkills = useMemo(() => {
    const q = skillsSearchQuery.trim().toLowerCase();
    const filtered = q
      ? mergedSkills.filter(
          (skill) =>
            skill.name.toLowerCase().includes(q) ||
            skill.description.toLowerCase().includes(q) ||
            skill.folderName.toLowerCase().includes(q)
        )
      : mergedSkills;
    return sortSkills(filtered, skillsSort);
  }, [mergedSkills, skillsSearchQuery, skillsSort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface-raised/20 rounded-xl border border-border p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-1 xl:max-w-2xl">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text">Local skills catalog</h2>
            </div>
            <p className="max-w-2xl text-sm leading-5 text-text-muted">
              {projectPath
                ? `Project skills for ${projectLabel ?? projectPath} plus your user-level skills.`
                : 'User-level skills only. Select a project to include project-scoped skill roots.'}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[32rem] xl:max-w-[40rem]">
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center xl:justify-end">
              <div className="w-full lg:min-w-[18rem] lg:flex-1 xl:w-80 xl:flex-none">
                <SearchInput
                  value={skillsSearchQuery}
                  onChange={setSkillsSearchQuery}
                  placeholder="Search skills..."
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 size-3.5" />
                  Create Skill
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Download className="mr-1.5 size-3.5" />
                  Import
                </Button>
                <Popover open={sortMenuOpen} onOpenChange={setSortMenuOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0"
                          aria-label="Sort skills"
                        >
                          <ArrowUpDown className="size-4" />
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Sort skills</TooltipContent>
                  </Tooltip>
                  <PopoverContent align="end" className="w-44 p-1">
                    <button
                      type="button"
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-text hover:bg-surface-raised"
                      onClick={() => {
                        setSkillsSort('name-asc');
                        setSortMenuOpen(false);
                      }}
                    >
                      <ArrowUpAZ className="mr-2 size-3.5" />
                      Name
                      {skillsSort === 'name-asc' && <Check className="ml-auto size-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-text hover:bg-surface-raised"
                      onClick={() => {
                        setSkillsSort('recent-desc');
                        setSortMenuOpen(false);
                      }}
                    >
                      <Clock3 className="mr-2 size-3.5" />
                      Recent
                      {skillsSort === 'recent-desc' && <Check className="ml-auto size-3.5" />}
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] text-text-muted xl:justify-end">
              <Badge variant="secondary" className="font-normal">
                {mergedSkills.length} discovered
              </Badge>
              <Badge variant="secondary" className="font-normal">
                {projectSkills.length} project
              </Badge>
              <Badge variant="secondary" className="font-normal">
                {userSkills.length} user
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {skillsError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          {skillsError}
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {skillsLoading && visibleSkills.length === 0 && (
        <div className="rounded-lg border border-border p-6 text-sm text-text-muted">
          Loading skills...
        </div>
      )}

      {!skillsLoading && !skillsError && visibleSkills.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-sm border border-dashed border-border px-8 py-16">
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface-raised">
            <Search className="size-5 text-text-muted" />
          </div>
          <p className="text-sm text-text-secondary">
            {skillsSearchQuery ? 'No skills match your search' : 'No local skills found'}
          </p>
          <p className="text-xs text-text-muted">
            {skillsSearchQuery
              ? 'Try a different search term.'
              : 'Skills are discovered from .claude/skills, .cursor/skills, and .agents/skills roots.'}
          </p>
        </div>
      )}

      {visibleSkills.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {visibleSkills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => setSelectedSkillId(skill.id)}
              className="bg-surface-raised/10 rounded-xl border border-border p-4 text-left transition-colors hover:border-border-emphasis"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-text">{skill.name}</h3>
                    {!skill.isValid && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-amber-700 dark:text-amber-300"
                      >
                        Needs attention
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                    {skill.description}
                  </p>
                </div>
                <Badge variant="outline">{skill.scope}</Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary" className="font-normal">
                  {formatRootKind(skill.rootKind)}
                </Badge>
                <Badge variant="secondary" className="font-normal">
                  {skill.invocationMode}
                </Badge>
                {skill.flags.hasScripts && (
                  <Badge variant="destructive" className="font-normal">
                    scripts
                  </Badge>
                )}
                {skill.flags.hasReferences && (
                  <Badge variant="secondary" className="font-normal">
                    references
                  </Badge>
                )}
                {skill.flags.hasAssets && (
                  <Badge variant="secondary" className="font-normal">
                    assets
                  </Badge>
                )}
              </div>

              {skill.issues.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{skill.issues[0]?.message}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <SkillDetailDialog
        skillId={selectedSkillId}
        open={selectedSkillId !== null}
        onClose={() => setSelectedSkillId(null)}
        projectPath={projectPath}
        onEdit={() => setEditOpen(true)}
        onDeleted={() => setSelectedSkillId(null)}
      />

      <SkillEditorDialog
        open={createOpen}
        mode="create"
        projectPath={projectPath}
        projectLabel={projectLabel}
        detail={null}
        onClose={() => setCreateOpen(false)}
        onSaved={(skillId) => {
          setCreateOpen(false);
          setSuccessMessage('Skill created successfully.');
          setSelectedSkillId(skillId);
        }}
      />

      <SkillEditorDialog
        open={editOpen}
        mode="edit"
        projectPath={projectPath}
        projectLabel={projectLabel}
        detail={selectedDetail}
        onClose={() => setEditOpen(false)}
        onSaved={(skillId) => {
          setEditOpen(false);
          setSuccessMessage('Skill saved successfully.');
          setSelectedSkillId(skillId);
        }}
      />

      <SkillImportDialog
        open={importOpen}
        projectPath={projectPath}
        projectLabel={projectLabel}
        onClose={() => setImportOpen(false)}
        onImported={(skillId) => {
          setImportOpen(false);
          setSuccessMessage('Skill imported successfully.');
          setSelectedSkillId(skillId);
        }}
      />
    </div>
  );
};
