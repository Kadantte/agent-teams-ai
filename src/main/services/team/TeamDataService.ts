import { TeamConfigReader } from './TeamConfigReader';

import type { TeamSummary } from '@shared/types';

export class TeamDataService {
  constructor(private readonly configReader: TeamConfigReader = new TeamConfigReader()) {}

  async listTeams(): Promise<TeamSummary[]> {
    return this.configReader.listTeams();
  }
}
