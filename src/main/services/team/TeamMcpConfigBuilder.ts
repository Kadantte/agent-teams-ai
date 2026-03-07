import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { atomicWriteAsync } from './atomicWrite';

interface McpLaunchSpec {
  command: string;
  args: string[];
}

const MCP_SERVER_NAME = 'agent-teams';

function getWorkspaceRoot(): string {
  return process.cwd();
}

function getMcpServerDir(): string {
  return path.join(getWorkspaceRoot(), 'mcp-server');
}

function getBuiltServerEntry(): string {
  return path.join(getMcpServerDir(), 'dist', 'index.js');
}

function getSourceServerEntry(): string {
  return path.join(getMcpServerDir(), 'src', 'index.ts');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveMcpLaunchSpec(): Promise<McpLaunchSpec> {
  const builtEntry = getBuiltServerEntry();
  if (await pathExists(builtEntry)) {
    return {
      command: process.execPath,
      args: [builtEntry],
    };
  }

  const sourceEntry = getSourceServerEntry();
  if (await pathExists(sourceEntry)) {
    return {
      command: 'pnpm',
      args: ['--dir', getMcpServerDir(), 'exec', 'tsx', sourceEntry],
    };
  }

  throw new Error('agent-teams-mcp entrypoint not found in mcp-server package');
}

export class TeamMcpConfigBuilder {
  async writeConfigFile(): Promise<string> {
    const launchSpec = await resolveMcpLaunchSpec();
    const configDir = path.join(os.tmpdir(), 'claude-team-mcp');
    const configPath = path.join(configDir, `agent-teams-mcp-${randomUUID()}.json`);

    await fs.promises.mkdir(configDir, { recursive: true });
    await atomicWriteAsync(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            [MCP_SERVER_NAME]: {
              command: launchSpec.command,
              args: launchSpec.args,
            },
          },
        },
        null,
        2
      )
    );

    return configPath;
  }
}
