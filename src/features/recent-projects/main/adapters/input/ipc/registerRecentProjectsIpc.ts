import {
  GET_DASHBOARD_RECENT_PROJECTS,
  normalizeDashboardRecentProjectsPayload,
} from '@features/recent-projects/contracts';
import { createLogger } from '@shared/utils/logger';

import type { RecentProjectsFeatureFacade } from '@features/recent-projects/main/composition/createRecentProjectsFeature';
import type { IpcMain } from 'electron';

const logger = createLogger('Feature:RecentProjects:IPC');

function getPayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return -1;
  }
}

function getMemoryDiagnostics(): {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
} {
  const memory = process.memoryUsage();
  return {
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
  };
}

export function registerRecentProjectsIpc(
  ipcMain: IpcMain,
  feature: RecentProjectsFeatureFacade
): void {
  ipcMain.handle(GET_DASHBOARD_RECENT_PROJECTS, async () => {
    const startedAt = Date.now();
    try {
      const payload = normalizeDashboardRecentProjectsPayload(
        await feature.listDashboardRecentProjects()
      ) ?? {
        projects: [],
        degraded: true,
      };
      logger.info('dashboard recent-projects IPC loaded', {
        count: payload.projects.length,
        degraded: payload.degraded,
        durationMs: Date.now() - startedAt,
        payloadBytes: getPayloadBytes(payload),
        ...getMemoryDiagnostics(),
      });
      return payload;
    } catch (error) {
      logger.error('Failed to load dashboard recent projects via IPC', error);
      return { projects: [], degraded: true };
    }
  });
}

export function removeRecentProjectsIpc(ipcMain: IpcMain): void {
  ipcMain.removeHandler(GET_DASHBOARD_RECENT_PROJECTS);
}
