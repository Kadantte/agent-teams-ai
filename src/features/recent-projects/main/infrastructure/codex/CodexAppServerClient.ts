import type { JsonRpcStdioClient } from './JsonRpcStdioClient';

const DEFAULT_REQUEST_TIMEOUT_MS = 3_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 8_000;
const SUPPRESSED_NOTIFICATION_METHODS = [
  'thread/started',
  'thread/status/changed',
  'thread/archived',
  'thread/unarchived',
  'thread/closed',
  'thread/name/updated',
  'turn/started',
  'turn/completed',
  'item/agentMessage/delta',
  'item/agentReasoning/delta',
  'item/execCommandOutputDelta',
];

interface ThreadListResponse {
  data?: CodexThreadSummary[];
}

interface CodexGitInfo {
  branch?: string | null;
  originUrl?: string | null;
  sha?: string | null;
}

export interface CodexThreadSummary {
  id: string;
  createdAt?: number;
  updatedAt?: number;
  cwd?: string | null;
  source?: unknown;
  modelProvider?: string | null;
  gitInfo?: CodexGitInfo | null;
  name?: string | null;
  path?: string | null;
}

export class CodexAppServerClient {
  constructor(private readonly rpcClient: JsonRpcStdioClient) {}

  async listThreads(
    binaryPath: string,
    options: {
      archived: boolean;
      limit: number;
      requestTimeoutMs?: number;
      totalTimeoutMs?: number;
    }
  ): Promise<CodexThreadSummary[]> {
    const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;

    return this.rpcClient.withSession(
      {
        binaryPath,
        args: ['app-server'],
        requestTimeoutMs,
        totalTimeoutMs,
        label: 'codex app-server thread/list',
      },
      async (session) => {
        await session.request(
          'initialize',
          {
            clientInfo: {
              name: 'claude-agent-teams-ui',
              title: 'Claude Agent Teams UI',
              version: '0.1.0',
            },
            capabilities: {
              experimentalApi: false,
              optOutNotificationMethods: SUPPRESSED_NOTIFICATION_METHODS,
            },
          },
          requestTimeoutMs
        );

        await session.notify('initialized');

        const response = await session.request<ThreadListResponse>(
          'thread/list',
          {
            archived: options.archived,
            limit: options.limit,
            sortKey: 'updated_at',
          },
          requestTimeoutMs
        );

        return response.data ?? [];
      }
    );
  }
}
