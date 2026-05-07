import { describe, expect, it, vi } from 'vitest';

import { MEMBER_LOG_STREAM_GET, MEMBER_LOG_STREAM_SET_TRACKING } from '../../../../../contracts';
import {
  registerMemberLogStreamIpc,
  removeMemberLogStreamIpc,
} from '../registerMemberLogStreamIpc';

import type { MemberLogStreamResponse } from '../../../../../contracts';
import type { MemberLogStreamFeatureFacade } from '../../../../composition/createMemberLogStreamFeature';
import type { IpcMainInvokeEvent } from 'electron';

vi.mock('@shared/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function emptyResponse(): MemberLogStreamResponse {
  return {
    participants: [],
    defaultFilter: 'all',
    segments: [],
    source: 'member_empty',
    coverage: [],
    warnings: [],
    truncated: false,
    generatedAt: '2026-03-01T00:00:00.000Z',
    metadata: {
      scannedTranscriptFileCount: 0,
      includedTranscriptFileCount: 0,
      droppedSegmentCount: 0,
      droppedChunkCount: 0,
      droppedMessageCount: 0,
    },
  };
}

function createFakeIpcMain(): {
  handlers: Map<string, (...args: unknown[]) => unknown>;
  ipcMain: {
    handle: ReturnType<typeof vi.fn>;
    removeHandler: ReturnType<typeof vi.fn>;
  };
} {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      }),
    },
  };
}

describe('registerMemberLogStreamIpc', () => {
  it('validates and normalizes getMemberLogStream options before calling the feature facade', async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const getMemberLogStream = vi.fn().mockResolvedValue(emptyResponse());
    const feature: MemberLogStreamFeatureFacade = {
      getMemberLogStream,
      setMemberLogStreamTracking: vi.fn(),
    };

    registerMemberLogStreamIpc(ipcMain as never, feature);
    const result = await handlers.get(MEMBER_LOG_STREAM_GET)?.(
      {} as IpcMainInvokeEvent,
      'alpha-team',
      'alice',
      {
        limitSegments: 200,
        since: '2026-03-01T12:34:56.000Z',
        laneId: ' secondary:opencode:alice ',
        forceRefresh: true,
      }
    );

    expect(result).toEqual({ success: true, data: emptyResponse() });
    expect(getMemberLogStream).toHaveBeenCalledWith({
      teamName: 'alpha-team',
      memberName: 'alice',
      limitSegments: 80,
      sinceMs: Date.parse('2026-03-01T12:34:56.000Z'),
      laneId: 'secondary:opencode:alice',
      forceRefresh: true,
    });
  });

  it('rejects unknown options and unsafe runtime lane ids', async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const getMemberLogStream = vi.fn().mockResolvedValue(emptyResponse());
    const feature: MemberLogStreamFeatureFacade = {
      getMemberLogStream,
      setMemberLogStreamTracking: vi.fn(),
    };

    registerMemberLogStreamIpc(ipcMain as never, feature);
    const get = handlers.get(MEMBER_LOG_STREAM_GET)!;

    await expect(
      get({} as IpcMainInvokeEvent, 'alpha-team', 'alice', { unknown: true })
    ).resolves.toEqual({
      success: false,
      error: 'Unknown getMemberLogStream option: unknown',
    });
    await expect(
      get({} as IpcMainInvokeEvent, 'alpha-team', 'alice', { laneId: '../bad' })
    ).resolves.toEqual({
      success: false,
      error: 'laneId contains invalid characters',
    });
    expect(getMemberLogStream).not.toHaveBeenCalled();
  });

  it('accepts primary lane ids and rejects malformed optional values', async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const getMemberLogStream = vi.fn().mockResolvedValue(emptyResponse());
    const feature: MemberLogStreamFeatureFacade = {
      getMemberLogStream,
      setMemberLogStreamTracking: vi.fn(),
    };

    registerMemberLogStreamIpc(ipcMain as never, feature);
    const get = handlers.get(MEMBER_LOG_STREAM_GET)!;

    await expect(
      get({} as IpcMainInvokeEvent, 'alpha-team', 'alice', { laneId: 'primary' })
    ).resolves.toEqual({ success: true, data: emptyResponse() });
    expect(getMemberLogStream).toHaveBeenCalledWith({
      teamName: 'alpha-team',
      memberName: 'alice',
      laneId: 'primary',
    });
    getMemberLogStream.mockClear();

    await expect(
      get({} as IpcMainInvokeEvent, 'alpha-team', 'alice', { since: 'not-a-date' })
    ).resolves.toEqual({
      success: false,
      error: 'since must be a valid timestamp',
    });
    await expect(
      get({} as IpcMainInvokeEvent, 'alpha-team', 'alice', { forceRefresh: 'true' })
    ).resolves.toEqual({
      success: false,
      error: 'forceRefresh must be a boolean',
    });
    await expect(
      get({} as IpcMainInvokeEvent, 'alpha-team', 'alice', { laneId: 'bad\nlane' })
    ).resolves.toEqual({
      success: false,
      error: 'laneId contains invalid characters',
    });
    await expect(
      get({} as IpcMainInvokeEvent, 'alpha-team', 'alice', { laneId: 'x'.repeat(257) })
    ).resolves.toEqual({
      success: false,
      error: 'laneId exceeds max length (256)',
    });
    expect(getMemberLogStream).not.toHaveBeenCalled();
  });

  it('validates tracking calls and unregisters both handlers', async () => {
    const { handlers, ipcMain } = createFakeIpcMain();
    const setMemberLogStreamTracking = vi.fn().mockResolvedValue(undefined);
    const feature: MemberLogStreamFeatureFacade = {
      getMemberLogStream: vi.fn().mockResolvedValue(emptyResponse()),
      setMemberLogStreamTracking,
    };

    registerMemberLogStreamIpc(ipcMain as never, feature);
    const setTracking = handlers.get(MEMBER_LOG_STREAM_SET_TRACKING)!;

    await expect(setTracking({} as IpcMainInvokeEvent, 'alpha-team', true)).resolves.toEqual({
      success: true,
    });
    await expect(setTracking({} as IpcMainInvokeEvent, 'alpha-team', 'yes')).resolves.toEqual({
      success: false,
      error: 'enabled must be a boolean',
    });
    expect(setMemberLogStreamTracking).toHaveBeenCalledWith('alpha-team', true);

    removeMemberLogStreamIpc(ipcMain as never);

    expect(handlers.has(MEMBER_LOG_STREAM_GET)).toBe(false);
    expect(handlers.has(MEMBER_LOG_STREAM_SET_TRACKING)).toBe(false);
  });
});
