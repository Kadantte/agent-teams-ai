const DISABLED_HTTP_MCP_VALUES = new Set(['0', 'false', 'no', 'off']);

const LOCAL_MCP_LAUNCH_ENV_KEYS = [
  'CLAUDE_MULTIMODEL_AGENT_TEAMS_MCP_COMMAND',
  'CLAUDE_MULTIMODEL_AGENT_TEAMS_MCP_ENTRY',
  'CLAUDE_MULTIMODEL_AGENT_TEAMS_MCP_ARGS_JSON',
] as const;

export interface OpenCodeMcpHttpBridgeEnv {
  CLAUDE_TEAM_OPENCODE_MCP_HTTP?: string;
}

export function isOpenCodeMcpHttpBridgeEnabled(
  env: OpenCodeMcpHttpBridgeEnv = process.env
): boolean {
  const rawValue = env.CLAUDE_TEAM_OPENCODE_MCP_HTTP?.trim().toLowerCase();
  return rawValue ? !DISABLED_HTTP_MCP_VALUES.has(rawValue) : true;
}

export function clearOpenCodeLocalMcpLaunchEnv(env: NodeJS.ProcessEnv): void {
  for (const key of LOCAL_MCP_LAUNCH_ENV_KEYS) {
    delete env[key];
  }
}
