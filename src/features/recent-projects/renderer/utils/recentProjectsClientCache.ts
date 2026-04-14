import type { DashboardRecentProject } from '@features/recent-projects/contracts';

const RECENT_PROJECTS_CLIENT_CACHE_TTL_MS = 15_000;

let cachedProjects: DashboardRecentProject[] | null = null;
let cachedAt = 0;
let inFlightLoad: Promise<DashboardRecentProject[]> | null = null;

export interface RecentProjectsClientSnapshot {
  projects: DashboardRecentProject[];
  fetchedAt: number;
  isStale: boolean;
}

export function getRecentProjectsClientSnapshot(): RecentProjectsClientSnapshot | null {
  if (!cachedProjects) {
    return null;
  }

  return {
    projects: cachedProjects,
    fetchedAt: cachedAt,
    isStale: Date.now() - cachedAt > RECENT_PROJECTS_CLIENT_CACHE_TTL_MS,
  };
}

export async function loadRecentProjectsWithClientCache(
  loader: () => Promise<DashboardRecentProject[]>,
  options?: { force?: boolean }
): Promise<DashboardRecentProject[]> {
  const force = options?.force ?? false;
  const snapshot = getRecentProjectsClientSnapshot();

  if (!force && snapshot && !snapshot.isStale) {
    return snapshot.projects;
  }

  if (inFlightLoad) {
    return inFlightLoad;
  }

  const request = loader()
    .then((projects) => {
      cachedProjects = projects;
      cachedAt = Date.now();
      return projects;
    })
    .finally(() => {
      if (inFlightLoad === request) {
        inFlightLoad = null;
      }
    });

  inFlightLoad = request;
  return request;
}

export function __resetRecentProjectsClientCacheForTests(): void {
  cachedProjects = null;
  cachedAt = 0;
  inFlightLoad = null;
}
