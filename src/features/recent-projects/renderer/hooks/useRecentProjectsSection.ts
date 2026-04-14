import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type DashboardRecentProject } from '@features/recent-projects/contracts';
import { api, isElectronMode } from '@renderer/api';
import { useStore } from '@renderer/store';
import { buildTaskCountsByProject, normalizePath } from '@renderer/utils/pathNormalize';
import { useShallow } from 'zustand/react/shallow';

import { adaptRecentProjectsSection } from '../adapters/RecentProjectsSectionAdapter';

import { useOpenRecentProject } from './useOpenRecentProject';

import type { RecentProjectCardModel } from '../adapters/RecentProjectsSectionAdapter';
import type { TeamSummary } from '@shared/types';

const INITIAL_RECENT_PROJECTS = 11;
const LOAD_MORE_STEP = 8;

function matchesSearch(project: DashboardRecentProject, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    project.name.toLowerCase().includes(normalizedQuery) ||
    project.primaryPath.toLowerCase().includes(normalizedQuery) ||
    project.associatedPaths.some((projectPath) =>
      projectPath.toLowerCase().includes(normalizedQuery)
    ) ||
    project.primaryBranch?.toLowerCase().includes(normalizedQuery) === true
  );
}

export function useRecentProjectsSection(
  searchQuery: string,
  maxProjects = INITIAL_RECENT_PROJECTS
): {
  cards: RecentProjectCardModel[];
  loading: boolean;
  error: string | null;
  canLoadMore: boolean;
  isElectron: boolean;
  loadMore: () => void;
  reload: () => Promise<void>;
  openRecentProject: (project: DashboardRecentProject) => Promise<void>;
  openProjectPath: (projectPath: string) => Promise<void>;
  selectProjectFolder: () => Promise<void>;
} {
  const { globalTasks, globalTasksLoading, fetchAllTasks, teams } = useStore(
    useShallow((state) => ({
      globalTasks: state.globalTasks,
      globalTasksLoading: state.globalTasksLoading,
      fetchAllTasks: state.fetchAllTasks,
      teams: state.teams,
    }))
  );
  const { openRecentProject, openProjectPath, selectProjectFolder } = useOpenRecentProject();
  const [recentProjects, setRecentProjects] = useState<DashboardRecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleProjects, setVisibleProjects] = useState(maxProjects);
  const [aliveTeams, setAliveTeams] = useState<string[]>([]);
  const hasFetchedTasksRef = useRef(false);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const projects = await api.getDashboardRecentProjects();
      setRecentProjects(projects);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load recent projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (recentProjects.length === 0 || hasFetchedTasksRef.current) {
      return;
    }

    hasFetchedTasksRef.current = true;
    void fetchAllTasks();
  }, [fetchAllTasks, recentProjects.length]);

  useEffect(() => {
    let cancelled = false;

    void api.teams
      .aliveList()
      .then((teamNames) => {
        if (!cancelled) {
          setAliveTeams(teamNames);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [teams]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setVisibleProjects(maxProjects);
    }
  }, [maxProjects, searchQuery]);

  const taskCountsByProject = useMemo(() => buildTaskCountsByProject(globalTasks), [globalTasks]);

  const activeTeamsByProject = useMemo(() => {
    const aliveSet = new Set(aliveTeams);
    const teamsByProject = new Map<string, TeamSummary[]>();

    for (const team of teams) {
      if (!team.projectPath || !aliveSet.has(team.teamName)) {
        continue;
      }

      const key = normalizePath(team.projectPath);
      const existing = teamsByProject.get(key);
      if (existing) {
        existing.push(team);
      } else {
        teamsByProject.set(key, [team]);
      }
    }

    return teamsByProject;
  }, [aliveTeams, teams]);

  const decoratedCards = useMemo(
    () =>
      adaptRecentProjectsSection({
        projects: recentProjects,
        taskCountsByProject,
        activeTeamsByProject,
        tasksLoading: globalTasksLoading,
      }),
    [activeTeamsByProject, globalTasksLoading, recentProjects, taskCountsByProject]
  );

  const filteredCards = useMemo(
    () => decoratedCards.filter((card) => matchesSearch(card.project, searchQuery)),
    [decoratedCards, searchQuery]
  );

  const cards = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredCards;
    }

    return filteredCards.slice(0, visibleProjects);
  }, [filteredCards, searchQuery, visibleProjects]);

  return {
    cards,
    loading,
    error,
    canLoadMore: !searchQuery.trim() && filteredCards.length > visibleProjects,
    isElectron: isElectronMode(),
    loadMore: () => setVisibleProjects((current) => current + LOAD_MORE_STEP),
    reload,
    openRecentProject,
    openProjectPath,
    selectProjectFolder,
  };
}
