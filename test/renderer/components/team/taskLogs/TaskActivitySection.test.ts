import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BoardTaskActivityEntry } from '../../../../../src/shared/types';

const apiState = {
  getTaskActivity: vi.fn<(teamName: string, taskId: string) => Promise<BoardTaskActivityEntry[]>>(),
};

vi.mock('@renderer/api', () => ({
  api: {
    teams: {
      getTaskActivity: (...args: Parameters<typeof apiState.getTaskActivity>) =>
        apiState.getTaskActivity(...args),
    },
  },
}));

import { TaskActivitySection } from '@renderer/components/team/taskLogs/TaskActivitySection';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

function makeEntry(
  overrides: Partial<BoardTaskActivityEntry> & Pick<BoardTaskActivityEntry, 'id' | 'linkKind'>
): BoardTaskActivityEntry {
  const { id, linkKind, ...rest } = overrides;

  return {
    id,
    timestamp: '2026-04-13T10:33:00.000Z',
    task: {
      locator: {
        ref: 'abc12345',
        refKind: 'display',
      },
      resolution: 'resolved',
      taskRef: {
        taskId: 'task-1',
        displayId: 'abc12345',
        teamName: 'demo',
      },
    },
    linkKind,
    targetRole: 'subject',
    actor: {
      memberName: 'bob',
      role: 'member',
      sessionId: 'session-1',
      agentId: 'agent-1',
      isSidechain: true,
    },
    actorContext: {
      relation: 'same_task',
    },
    source: {
      messageUuid: `${overrides.id}-message`,
      filePath: '/tmp/transcript.jsonl',
      sourceOrder: 1,
      ...(rest.source?.toolUseId ? { toolUseId: rest.source.toolUseId } : {}),
    },
    ...rest,
  };
}

describe('TaskActivitySection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    apiState.getTaskActivity.mockReset();
    vi.unstubAllGlobals();
  });

  it('hides low-signal execution rows while keeping key task activity in descending time order', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    apiState.getTaskActivity.mockResolvedValue([
      makeEntry({
        id: 'viewed',
        timestamp: '2026-04-13T10:33:00.000Z',
        linkKind: 'board_action',
        action: {
          canonicalToolName: 'task_get',
          category: 'read',
        },
      }),
      makeEntry({
        id: 'started',
        timestamp: '2026-04-13T10:34:00.000Z',
        linkKind: 'lifecycle',
        action: {
          canonicalToolName: 'task_start',
          category: 'status',
        },
      }),
      makeEntry({
        id: 'worked-1',
        linkKind: 'execution',
      }),
      makeEntry({
        id: 'worked-2',
        linkKind: 'execution',
      }),
    ]);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(TaskActivitySection, { teamName: 'demo', taskId: 'task-a' }));
      await flushMicrotasks();
    });

    expect(host.textContent).toContain('Viewed task');
    expect(host.textContent).toContain('Started work');
    expect(host.textContent).not.toContain('Worked on task');
    expect(host.textContent?.indexOf('Started work')).toBeLessThan(
      host.textContent?.indexOf('Viewed task') ?? Number.POSITIVE_INFINITY
    );

    await act(async () => {
      root.unmount();
      await flushMicrotasks();
    });
  });

  it('shows a task-log-stream hint when only low-signal execution rows exist', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    apiState.getTaskActivity.mockResolvedValue([
      makeEntry({
        id: 'worked-1',
        linkKind: 'execution',
      }),
    ]);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(TaskActivitySection, { teamName: 'demo', taskId: 'task-a' }));
      await flushMicrotasks();
    });

    expect(host.textContent).toContain('No key task activity was found yet');
    expect(host.textContent).toContain('Task Log Stream');
    expect(host.textContent).not.toContain('Worked on task');

    await act(async () => {
      root.unmount();
      await flushMicrotasks();
    });
  });
});
