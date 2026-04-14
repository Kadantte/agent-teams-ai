import { ListDashboardRecentProjectsUseCase } from '../../core/application/use-cases/ListDashboardRecentProjectsUseCase';
import { DashboardRecentProjectsPresenter } from '../adapters/output/presenters/DashboardRecentProjectsPresenter';
import { ClaudeRecentProjectsSourceAdapter } from '../adapters/output/sources/ClaudeRecentProjectsSourceAdapter';
import { CodexRecentProjectsSourceAdapter } from '../adapters/output/sources/CodexRecentProjectsSourceAdapter';
import { InMemoryRecentProjectsCache } from '../infrastructure/cache/InMemoryRecentProjectsCache';
import { CodexAppServerClient } from '../infrastructure/codex/CodexAppServerClient';
import { CodexBinaryResolver } from '../infrastructure/codex/CodexBinaryResolver';
import { JsonRpcStdioClient } from '../infrastructure/codex/JsonRpcStdioClient';
import { RecentProjectIdentityResolver } from '../infrastructure/identity/RecentProjectIdentityResolver';

import type { ClockPort } from '../../core/application/ports/ClockPort';
import type { LoggerPort } from '../../core/application/ports/LoggerPort';
import type { DashboardRecentProject } from '@features/recent-projects/contracts';
import type { ServiceContext } from '@main/services';

export interface RecentProjectsFeatureFacade {
  listDashboardRecentProjects(): Promise<DashboardRecentProject[]>;
}

export function createRecentProjectsFeature(deps: {
  getActiveContext: () => ServiceContext;
  getLocalContext: () => ServiceContext | undefined;
  logger: LoggerPort;
}): RecentProjectsFeatureFacade {
  const cache = new InMemoryRecentProjectsCache<DashboardRecentProject[]>();
  const presenter = new DashboardRecentProjectsPresenter();
  const clock: ClockPort = { now: () => Date.now() };
  const jsonRpcStdioClient = new JsonRpcStdioClient(deps.logger);
  const codexAppServerClient = new CodexAppServerClient(jsonRpcStdioClient);
  const identityResolver = new RecentProjectIdentityResolver();
  const sources = [
    new ClaudeRecentProjectsSourceAdapter(deps.getActiveContext, deps.logger),
    new CodexRecentProjectsSourceAdapter({
      getActiveContext: deps.getActiveContext,
      getLocalContext: deps.getLocalContext,
      resolveBinary: () => CodexBinaryResolver.resolve(),
      appServerClient: codexAppServerClient,
      identityResolver,
      logger: deps.logger,
    }),
  ];
  const useCase = new ListDashboardRecentProjectsUseCase({
    sources,
    cache,
    output: presenter,
    clock,
    logger: deps.logger,
  });

  return {
    listDashboardRecentProjects: () => {
      const activeContext = deps.getActiveContext();
      return useCase.execute(`dashboard-recent-projects:${activeContext.id}`);
    },
  };
}
