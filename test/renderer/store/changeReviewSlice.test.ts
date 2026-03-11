import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

import { createChangeReviewSlice } from '../../../src/renderer/store/slices/changeReviewSlice';
import { buildTaskChangePresenceKey } from '../../../src/renderer/utils/taskChangeRequest';

const hoisted = vi.hoisted(() => ({
  getTaskChanges: vi.fn(),
  getAgentChanges: vi.fn(),
  getChangeStats: vi.fn(),
  getFileContent: vi.fn(),
  applyDecisions: vi.fn(),
  saveEditedFile: vi.fn(),
  checkConflict: vi.fn(),
  rejectHunks: vi.fn(),
  rejectFile: vi.fn(),
  previewReject: vi.fn(),
}));

vi.mock('@renderer/api', () => ({
  api: {
    review: {
      getTaskChanges: hoisted.getTaskChanges,
      getAgentChanges: hoisted.getAgentChanges,
      getChangeStats: hoisted.getChangeStats,
      getFileContent: hoisted.getFileContent,
      applyDecisions: hoisted.applyDecisions,
      saveEditedFile: hoisted.saveEditedFile,
      checkConflict: hoisted.checkConflict,
      rejectHunks: hoisted.rejectHunks,
      rejectFile: hoisted.rejectFile,
      previewReject: hoisted.previewReject,
    },
  },
}));

function createSliceStore() {
  return create<any>()((set, get, store) => ({
    ...createChangeReviewSlice(set as never, get as never, store as never),
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const OPTIONS_A = {
  owner: 'alice',
  status: 'completed',
  intervals: [{ startedAt: '2026-03-01T10:00:00.000Z' }],
  since: '2026-03-01T09:58:00.000Z',
  stateBucket: 'completed' as const,
};

const OPTIONS_B = {
  owner: 'bob',
  status: 'completed',
  intervals: [{ startedAt: '2026-03-01T11:00:00.000Z' }],
  since: '2026-03-01T10:58:00.000Z',
  stateBucket: 'completed' as const,
};

const REVIEW_OPTIONS = {
  owner: 'alice',
  status: 'completed',
  intervals: [{ startedAt: '2026-03-01T10:00:00.000Z' }],
  since: '2026-03-01T09:58:00.000Z',
  stateBucket: 'review' as const,
};

describe('changeReviewSlice task changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not cache errors as negative task-change results', async () => {
    const store = createSliceStore();
    hoisted.getTaskChanges.mockRejectedValue(new Error('transient'));

    await store.getState().checkTaskHasChanges('team-a', '1', OPTIONS_A);
    await store.getState().checkTaskHasChanges('team-a', '1', OPTIONS_A);

    expect(hoisted.getTaskChanges).toHaveBeenCalledTimes(2);
  });

  it('negative-caches confirmed empty results per request signature', async () => {
    const store = createSliceStore();
    hoisted.getTaskChanges.mockResolvedValue({
      files: [],
      totalFiles: 0,
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      teamName: 'team-a',
      taskId: '1',
      confidence: 'fallback',
      computedAt: '2026-03-01T12:00:00.000Z',
      scope: {
        taskId: '1',
        memberName: '',
        startLine: 0,
        endLine: 0,
        startTimestamp: '',
        endTimestamp: '',
        toolUseIds: [],
        filePaths: [],
        confidence: { tier: 4, label: 'fallback', reason: 'No log files found for task' },
      },
      warnings: [],
    });

    await store.getState().checkTaskHasChanges('team-a', '1', OPTIONS_A);
    await store.getState().checkTaskHasChanges('team-a', '1', OPTIONS_A);
    await store.getState().checkTaskHasChanges('team-a', '1', OPTIONS_B);

    expect(hoisted.getTaskChanges).toHaveBeenCalledTimes(2);
  });

  it('ignores stale fetchTaskChanges responses when a newer task request wins', async () => {
    const store = createSliceStore();
    const first = deferred<any>();
    const second = deferred<any>();
    hoisted.getTaskChanges.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const firstFetch = store.getState().fetchTaskChanges('team-a', '1', OPTIONS_A);
    const secondFetch = store.getState().fetchTaskChanges('team-a', '2', OPTIONS_B);

    second.resolve({
      teamName: 'team-a',
      taskId: '2',
      files: [{ filePath: '/repo/new.ts', relativePath: 'new.ts', snippets: [], linesAdded: 1, linesRemoved: 0, isNewFile: true }],
      totalFiles: 1,
      totalLinesAdded: 1,
      totalLinesRemoved: 0,
      confidence: 'fallback',
      computedAt: '2026-03-01T12:00:00.000Z',
      scope: {
        taskId: '2',
        memberName: 'bob',
        startLine: 0,
        endLine: 0,
        startTimestamp: '',
        endTimestamp: '',
        toolUseIds: [],
        filePaths: ['/repo/new.ts'],
        confidence: { tier: 4, label: 'fallback', reason: 'No task boundaries found in JSONL' },
      },
      warnings: [],
    });
    await secondFetch;

    first.resolve({
      teamName: 'team-a',
      taskId: '1',
      files: [{ filePath: '/repo/old.ts', relativePath: 'old.ts', snippets: [], linesAdded: 1, linesRemoved: 0, isNewFile: true }],
      totalFiles: 1,
      totalLinesAdded: 1,
      totalLinesRemoved: 0,
      confidence: 'fallback',
      computedAt: '2026-03-01T12:00:00.000Z',
      scope: {
        taskId: '1',
        memberName: 'alice',
        startLine: 0,
        endLine: 0,
        startTimestamp: '',
        endTimestamp: '',
        toolUseIds: [],
        filePaths: ['/repo/old.ts'],
        confidence: { tier: 4, label: 'fallback', reason: 'No task boundaries found in JSONL' },
      },
      warnings: [],
    });
    await firstFetch;

    expect(store.getState().activeChangeSet?.taskId).toBe('2');
    expect(store.getState().selectedReviewFilePath).toBe('/repo/new.ts');
  });

  it('does not treat review-state summaries as permanently cacheable', async () => {
    const store = createSliceStore();
    hoisted.getTaskChanges.mockResolvedValue({
      files: [],
      totalFiles: 0,
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      teamName: 'team-a',
      taskId: '1',
      confidence: 'fallback',
      computedAt: '2026-03-01T12:00:00.000Z',
      scope: {
        taskId: '1',
        memberName: '',
        startLine: 0,
        endLine: 0,
        startTimestamp: '',
        endTimestamp: '',
        toolUseIds: [],
        filePaths: [],
        confidence: { tier: 4, label: 'fallback', reason: 'No log files found for task' },
      },
      warnings: [],
    });

    await store.getState().checkTaskHasChanges('team-a', '1', REVIEW_OPTIONS);
    await store.getState().checkTaskHasChanges('team-a', '1', REVIEW_OPTIONS);

    expect(hoisted.getTaskChanges).toHaveBeenCalledTimes(2);
  });

  it('re-warms terminal summaries after an earlier empty result', async () => {
    const store = createSliceStore();
    const teamName = 'team-warm';
    const taskId = 'late-log-task';
    hoisted.getTaskChanges
      .mockResolvedValueOnce({
        files: [],
        totalFiles: 0,
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        teamName,
        taskId,
        confidence: 'fallback',
        computedAt: '2026-03-01T12:00:00.000Z',
        scope: {
          taskId: '1',
          memberName: '',
          startLine: 0,
          endLine: 0,
          startTimestamp: '',
          endTimestamp: '',
          toolUseIds: [],
          filePaths: [],
          confidence: { tier: 4, label: 'fallback', reason: 'No log files found for task' },
        },
        warnings: [],
      })
      .mockResolvedValueOnce({
        teamName,
        taskId,
        files: [
          {
            filePath: '/repo/new.ts',
            relativePath: 'new.ts',
            snippets: [],
            linesAdded: 1,
            linesRemoved: 0,
            isNewFile: true,
          },
        ],
        totalFiles: 1,
        totalLinesAdded: 1,
        totalLinesRemoved: 0,
        confidence: 'fallback',
        computedAt: '2026-03-01T12:01:00.000Z',
        scope: {
          taskId: '1',
          memberName: 'alice',
          startLine: 0,
          endLine: 0,
          startTimestamp: '',
          endTimestamp: '',
          toolUseIds: [],
          filePaths: ['/repo/new.ts'],
          confidence: { tier: 4, label: 'fallback', reason: 'No task boundaries found in JSONL' },
        },
        warnings: [],
      })
      .mockResolvedValueOnce({
        teamName,
        taskId,
        files: [
          {
            filePath: '/repo/new.ts',
            relativePath: 'new.ts',
            snippets: [],
            linesAdded: 1,
            linesRemoved: 0,
            isNewFile: true,
          },
        ],
        totalFiles: 1,
        totalLinesAdded: 1,
        totalLinesRemoved: 0,
        confidence: 'fallback',
        computedAt: '2026-03-01T12:01:01.000Z',
        scope: {
          taskId: '1',
          memberName: 'alice',
          startLine: 0,
          endLine: 0,
          startTimestamp: '',
          endTimestamp: '',
          toolUseIds: [],
          filePaths: ['/repo/new.ts'],
          confidence: { tier: 4, label: 'fallback', reason: 'No task boundaries found in JSONL' },
        },
        warnings: [],
      });

    await store.getState().checkTaskHasChanges(teamName, taskId, OPTIONS_A);
    await store
      .getState()
      .warmTaskChangeSummaries([{ teamName, taskId, options: OPTIONS_A }]);

    expect(hoisted.getTaskChanges).toHaveBeenCalledTimes(3);
    expect(
      store.getState().taskHasChanges[buildTaskChangePresenceKey(teamName, taskId, OPTIONS_A)]
    ).toBe(true);
  });

  it('clears optimistic terminal presence after background forceFresh revalidation', async () => {
    const store = createSliceStore();
    const teamName = 'team-revalidate';
    const taskId = 'persisted-hit';
    hoisted.getTaskChanges
      .mockResolvedValueOnce({
        teamName,
        taskId,
        files: [
          {
            filePath: '/repo/persisted.ts',
            relativePath: 'persisted.ts',
            snippets: [],
            linesAdded: 1,
            linesRemoved: 0,
            isNewFile: true,
          },
        ],
        totalFiles: 1,
        totalLinesAdded: 1,
        totalLinesRemoved: 0,
        confidence: 'medium',
        computedAt: '2026-03-01T12:00:00.000Z',
        scope: {
          taskId: '1',
          memberName: 'alice',
          startLine: 0,
          endLine: 0,
          startTimestamp: '',
          endTimestamp: '',
          toolUseIds: [],
          filePaths: ['/repo/persisted.ts'],
          confidence: { tier: 2, label: 'medium', reason: 'Persisted summary' },
        },
        warnings: [],
      })
      .mockResolvedValueOnce({
        teamName,
        taskId,
        files: [],
        totalFiles: 0,
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        confidence: 'fallback',
        computedAt: '2026-03-01T12:01:00.000Z',
        scope: {
          taskId: '1',
          memberName: '',
          startLine: 0,
          endLine: 0,
          startTimestamp: '',
          endTimestamp: '',
          toolUseIds: [],
          filePaths: [],
          confidence: { tier: 4, label: 'fallback', reason: 'No log files found for task' },
        },
        warnings: [],
      });

    await store.getState().checkTaskHasChanges(teamName, taskId, OPTIONS_A);
    await flushAsyncWork();

    expect(hoisted.getTaskChanges).toHaveBeenNthCalledWith(1, teamName, taskId, {
      ...OPTIONS_A,
      summaryOnly: true,
    });
    expect(hoisted.getTaskChanges).toHaveBeenNthCalledWith(2, teamName, taskId, {
      ...OPTIONS_A,
      summaryOnly: true,
      forceFresh: true,
    });
    expect(store.getState().taskHasChanges[buildTaskChangePresenceKey(teamName, taskId, OPTIONS_A)]).toBe(false);
  });
});
