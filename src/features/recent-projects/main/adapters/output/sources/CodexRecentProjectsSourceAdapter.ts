import { normalizeIdentityPath } from '@features/recent-projects/main/infrastructure/identity/normalizeIdentityPath';
import path from 'path';

import type { LoggerPort } from '@features/recent-projects/core/application/ports/LoggerPort';
import type { RecentProjectsSourcePort } from '@features/recent-projects/core/application/ports/RecentProjectsSourcePort';
import type { RecentProjectCandidate } from '@features/recent-projects/core/domain/models/RecentProjectCandidate';
import type {
  CodexAppServerClient,
  CodexThreadSummary,
} from '@features/recent-projects/main/infrastructure/codex/CodexAppServerClient';
import type { RecentProjectIdentityResolver } from '@features/recent-projects/main/infrastructure/identity/RecentProjectIdentityResolver';
import type { ServiceContext } from '@main/services';

const CODEX_THREAD_LIMIT = 40;
const CODEX_LIVE_FETCH_TIMEOUT_MS = 1_200;
const CODEX_ARCHIVED_FETCH_TIMEOUT_MS = 1_800;
const CODEX_REQUEST_TIMEOUT_MS = 1_800;
const CODEX_SOURCE_TIMEOUT_MS = 1_500;
const FAST_ARCHIVED_MERGE_TIMEOUT_MS = 150;

function isInteractiveSource(source: unknown): boolean {
  return source === 'vscode' || source === 'cli';
}

function normalizeTimestamp(value: number | undefined): number {
  if (!value) {
    return 0;
  }
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

export class CodexRecentProjectsSourceAdapter implements RecentProjectsSourcePort {
  readonly sourceId = 'codex';
  readonly timeoutMs = CODEX_SOURCE_TIMEOUT_MS;

  constructor(
    private readonly deps: {
      getActiveContext: () => ServiceContext;
      getLocalContext: () => ServiceContext | undefined;
      resolveBinary: () => Promise<string | null>;
      appServerClient: CodexAppServerClient;
      identityResolver: RecentProjectIdentityResolver;
      logger: LoggerPort;
    }
  ) {}

  async list(): Promise<RecentProjectCandidate[]> {
    const activeContext = this.deps.getActiveContext();
    const localContext = this.deps.getLocalContext();

    if (activeContext.type !== 'local' || activeContext.id !== localContext?.id) {
      return [];
    }

    const binaryPath = await this.deps.resolveBinary();
    if (!binaryPath) {
      this.deps.logger.info('codex recent-projects source skipped - binary unavailable');
      return [];
    }

    const liveThreads = await this.#listThreadsSegmentSafe(binaryPath, 'live', {
      archived: false,
      totalTimeoutMs: CODEX_LIVE_FETCH_TIMEOUT_MS,
    });
    const archivedPromise = this.#listThreadsSegmentSafe(binaryPath, 'archived', {
      archived: true,
      totalTimeoutMs: CODEX_ARCHIVED_FETCH_TIMEOUT_MS,
    });
    const archivedThreads =
      liveThreads.length > 0
        ? await this.#awaitWithTimeout(archivedPromise, FAST_ARCHIVED_MERGE_TIMEOUT_MS)
        : await archivedPromise;

    const interactiveThreads = [...liveThreads, ...archivedThreads].filter(
      (thread) => Boolean(thread.cwd) && isInteractiveSource(thread.source)
    );

    const candidates = (
      await Promise.all(interactiveThreads.map((thread) => this.#toCandidate(thread)))
    ).filter((candidate): candidate is RecentProjectCandidate => candidate !== null);

    this.deps.logger.info('codex recent-projects source loaded', {
      count: candidates.length,
    });

    return candidates;
  }

  async #listThreadsSegment(
    binaryPath: string,
    segment: 'live' | 'archived',
    options: {
      archived: boolean;
      totalTimeoutMs: number;
    }
  ): Promise<CodexThreadSummary[]> {
    const result = await this.deps.appServerClient.listThreads(binaryPath, {
      archived: options.archived,
      limit: CODEX_THREAD_LIMIT,
      requestTimeoutMs: CODEX_REQUEST_TIMEOUT_MS,
      totalTimeoutMs: options.totalTimeoutMs,
    });

    this.deps.logger.info('codex recent-projects thread list loaded', {
      segment,
      count: result.length,
    });
    return result;
  }

  async #awaitWithTimeout(
    promise: Promise<CodexThreadSummary[]>,
    timeoutMs: number
  ): Promise<CodexThreadSummary[]> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<CodexThreadSummary[]>((resolve) => {
          timer = setTimeout(() => resolve([]), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  #unwrapThreadListError(error: unknown, segment: 'live' | 'archived'): CodexThreadSummary[] {
    this.deps.logger.warn('codex recent-projects thread list failed', {
      segment,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  async #listThreadsSegmentSafe(
    binaryPath: string,
    segment: 'live' | 'archived',
    options: {
      archived: boolean;
      totalTimeoutMs: number;
    }
  ): Promise<CodexThreadSummary[]> {
    try {
      return await this.#listThreadsSegment(binaryPath, segment, options);
    } catch (error) {
      return this.#unwrapThreadListError(error, segment);
    }
  }

  async #toCandidate(thread: CodexThreadSummary): Promise<RecentProjectCandidate | null> {
    const cwd = thread.cwd?.trim();
    if (!cwd) {
      return null;
    }

    const identity = await this.deps.identityResolver.resolve(cwd);
    const displayName = identity?.name ?? path.basename(cwd) ?? thread.name?.trim() ?? cwd;

    return {
      identity: identity?.id ?? `path:${normalizeIdentityPath(cwd)}`,
      displayName,
      primaryPath: cwd,
      associatedPaths: [cwd],
      lastActivityAt: normalizeTimestamp(thread.updatedAt ?? thread.createdAt),
      providerIds: ['codex'],
      sourceKind: 'codex',
      openTarget: {
        type: 'synthetic-path',
        path: cwd,
      },
      branchName: thread.gitInfo?.branch ?? undefined,
    };
  }
}
