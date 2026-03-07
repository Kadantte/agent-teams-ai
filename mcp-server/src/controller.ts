import { createController } from 'agent-teams-controller';

export function getController(teamName: string, claudeDir?: string) {
  return createController({
    teamName,
    ...(claudeDir ? { claudeDir } : {}),
  });
}
