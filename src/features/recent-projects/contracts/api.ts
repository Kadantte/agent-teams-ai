import type { DashboardRecentProject } from './dto';

export interface RecentProjectsElectronApi {
  getDashboardRecentProjects(): Promise<DashboardRecentProject[]>;
}
