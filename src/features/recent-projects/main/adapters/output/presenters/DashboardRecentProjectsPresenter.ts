import type { DashboardRecentProject } from '@features/recent-projects/contracts';
import type { ListDashboardRecentProjectsResponse } from '@features/recent-projects/core/application/models/ListDashboardRecentProjectsResponse';
import type { ListDashboardRecentProjectsOutputPort } from '@features/recent-projects/core/application/ports/ListDashboardRecentProjectsOutputPort';

export class DashboardRecentProjectsPresenter implements ListDashboardRecentProjectsOutputPort<
  DashboardRecentProject[]
> {
  present(response: ListDashboardRecentProjectsResponse): DashboardRecentProject[] {
    return response.projects.map((aggregate) => ({
      id: aggregate.identity,
      name: aggregate.displayName,
      primaryPath: aggregate.primaryPath,
      associatedPaths: aggregate.associatedPaths,
      mostRecentActivity: aggregate.lastActivityAt,
      providerIds: aggregate.providerIds,
      source: aggregate.source,
      openTarget: aggregate.openTarget,
      primaryBranch: aggregate.branchName,
    }));
  }
}
