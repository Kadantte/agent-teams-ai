import { getToolsBasePath } from '@main/utils/pathDecoder';
import * as fs from 'fs';
import * as path from 'path';

import { atomicWriteAsync } from './atomicWrite';

const TOOL_FILE_NAME = 'teamctl.js';

function getCandidateLegacyCliPaths(): string[] {
  const cwd = process.cwd();

  return [
    path.join(cwd, 'agent-teams-controller', 'src', 'legacy', 'teamctl.cli.js'),
    path.join(cwd, 'agent-teams-controller', 'dist', 'legacy', 'teamctl.cli.js'),
  ];
}

async function readExtractedTeamctlSource(): Promise<string> {
  for (const candidatePath of getCandidateLegacyCliPaths()) {
    try {
      return await fs.promises.readFile(candidatePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  throw new Error('Extracted teamctl CLI source not found in agent-teams-controller package');
}

export class TeamAgentToolsInstaller {
  async ensureInstalled(): Promise<string> {
    const toolsDir = getToolsBasePath();
    const toolPath = path.join(toolsDir, TOOL_FILE_NAME);
    await fs.promises.mkdir(toolsDir, { recursive: true });

    const desired = await readExtractedTeamctlSource();
    let current: string | null = null;
    try {
      current = await fs.promises.readFile(toolPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    if (current === desired) {
      return toolPath;
    }

    await atomicWriteAsync(toolPath, desired);
    return toolPath;
  }
}
