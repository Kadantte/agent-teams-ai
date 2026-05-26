import {
  DASHBOARD_RECENT_PROJECTS_ROUTE,
  type DashboardRecentProjectsPayload,
  normalizeDashboardRecentProjectsPayload,
} from '@features/recent-projects/contracts';
import { createLogger } from '@shared/utils/logger';

import type { RecentProjectsFeatureFacade } from '@features/recent-projects/main/composition/createRecentProjectsFeature';
import type { FastifyInstance } from 'fastify';

const logger = createLogger('Feature:RecentProjects:HTTP');

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

export function registerRecentProjectsHttp(
  app: FastifyInstance,
  feature: RecentProjectsFeatureFacade
): void {
  app.get(DASHBOARD_RECENT_PROJECTS_ROUTE, async (): Promise<DashboardRecentProjectsPayload> => {
    const startedAt = Date.now();
    try {
      const payload = normalizeDashboardRecentProjectsPayload(
        await feature.listDashboardRecentProjects()
      ) ?? {
        projects: [],
        degraded: true,
      };
      logger.info('dashboard recent-projects HTTP loaded', {
        count: payload.projects.length,
        degraded: payload.degraded,
        durationMs: Date.now() - startedAt,
        payloadBytes: getPayloadBytes(payload),
        ...getMemoryDiagnostics(),
      });
      return payload;
    } catch (error) {
      logger.error('Failed to load dashboard recent projects via HTTP', error);
      return { projects: [], degraded: true };
    }
  });
}
