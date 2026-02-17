import { TEAM_LIST } from '@preload/constants/ipcChannels';
import { createLogger } from '@shared/utils/logger';
import { type IpcMain, type IpcMainInvokeEvent } from 'electron';

import type { TeamDataService } from '../services';
import type { IpcResult, TeamSummary } from '@shared/types';

const logger = createLogger('IPC:teams');

let teamDataService: TeamDataService | null = null;

export function initializeTeamHandlers(service: TeamDataService): void {
  teamDataService = service;
}

export function registerTeamHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(TEAM_LIST, handleListTeams);
  logger.info('Team handlers registered');
}

export function removeTeamHandlers(ipcMain: IpcMain): void {
  ipcMain.removeHandler(TEAM_LIST);
}

function getTeamDataService(): TeamDataService {
  if (!teamDataService) {
    throw new Error('Team handlers are not initialized');
  }
  return teamDataService;
}

async function wrapTeamHandler<T>(
  operation: string,
  handler: () => Promise<T>
): Promise<IpcResult<T>> {
  try {
    const data = await handler();
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[teams:${operation}] ${message}`);
    return { success: false, error: message };
  }
}

async function handleListTeams(_event: IpcMainInvokeEvent): Promise<IpcResult<TeamSummary[]>> {
  return wrapTeamHandler('list', () => getTeamDataService().listTeams());
}
