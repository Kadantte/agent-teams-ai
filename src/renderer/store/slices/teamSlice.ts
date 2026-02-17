import { api } from '@renderer/api';
import { IpcError, unwrapIpc } from '@renderer/utils/unwrapIpc';

import type { AppState } from '../types';
import type { TeamSummary } from '@shared/types';
import type { StateCreator } from 'zustand';

export interface TeamSlice {
  teams: TeamSummary[];
  teamsLoading: boolean;
  teamsError: string | null;
  fetchTeams: () => Promise<void>;
  openTeamsTab: () => void;
}

export const createTeamSlice: StateCreator<AppState, [], [], TeamSlice> = (set, get) => ({
  teams: [],
  teamsLoading: false,
  teamsError: null,

  fetchTeams: async () => {
    set({ teamsLoading: true, teamsError: null });
    try {
      const teams = await unwrapIpc('team:list', () => api.teams.list());
      set({ teams, teamsLoading: false, teamsError: null });
    } catch (error) {
      set({
        teamsLoading: false,
        teamsError:
          error instanceof IpcError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Failed to fetch teams',
      });
    }
  },

  openTeamsTab: () => {
    const state = get();
    const focusedPane = state.paneLayout.panes.find((p) => p.id === state.paneLayout.focusedPaneId);
    const teamsTab = focusedPane?.tabs.find((tab) => tab.type === 'teams');
    if (teamsTab) {
      state.setActiveTab(teamsTab.id);
      return;
    }

    state.openTab({
      type: 'teams',
      label: 'Teams',
    });
  },
});
