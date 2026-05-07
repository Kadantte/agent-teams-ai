import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_MEMBER_LOG_STREAM_BUDGET } from '../../../../../core/domain/models/MemberLogStreamBudget';
import { ClaudeMemberTranscriptStreamSource } from '../ClaudeMemberTranscriptStreamSource';
import { CodexNativeMemberTraceStreamSource } from '../CodexNativeMemberTraceStreamSource';
import { OpenCodeMemberRuntimeStreamSource } from '../OpenCodeMemberRuntimeStreamSource';

import type { MemberLogStreamSourceInput } from '../../../../../core/application/ports/MemberLogStreamSource';
import type { EnhancedChunk, ParsedMessage } from '@main/types';

function parsedMessage(uuid: string, timestamp: string): ParsedMessage {
  return {
    uuid,
    parentUuid: null,
    type: 'assistant',
    timestamp: new Date(timestamp),
    role: 'assistant',
    content: `message ${uuid}`,
    isSidechain: true,
    isMeta: false,
    sessionId: 'session-1',
    toolCalls: [],
    toolResults: [],
  };
}

function fakeChunk(id: string): EnhancedChunk {
  return {
    id,
    chunkType: 'ai',
    startTime: new Date('2026-04-04T00:00:00.000Z'),
    endTime: new Date('2026-04-04T00:00:01.000Z'),
    durationMs: 1_000,
    metrics: {
      durationMs: 1_000,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      messageCount: 1,
    },
    responses: [],
    processes: [],
    sidechainMessages: [],
    toolExecutions: [],
    semanticSteps: [],
    rawMessages: [],
  };
}

function sourceInput(overrides: Partial<MemberLogStreamSourceInput> = {}): MemberLogStreamSourceInput {
  return {
    teamName: 'alpha-team',
    memberName: 'alice',
    budget: DEFAULT_MEMBER_LOG_STREAM_BUDGET,
    ...overrides,
  };
}

describe('ClaudeMemberTranscriptStreamSource', () => {
  it('dedupes cumulative subagent refs by member/session before parsing and keeps path-safe segment ids', async () => {
    const parseFiles = vi.fn().mockImplementation(async (paths: string[]) => {
      const parsed = new Map<string, ParsedMessage[]>();
      parsed.set('/transcripts/larger.jsonl', [
        parsedMessage('msg-1', '2026-04-04T00:00:00.000Z'),
        parsedMessage('msg-2', '2026-04-04T00:01:00.000Z'),
      ]);
      expect(paths).toEqual(['/transcripts/larger.jsonl']);
      return parsed;
    });
    const chunkBuilder = {
      buildBundleChunks: vi.fn(() => [fakeChunk('chunk-1')]),
    };
    const source = new ClaudeMemberTranscriptStreamSource(
      {
        findRecentMemberLogFileRefsByMember: vi.fn().mockResolvedValue([
          {
            memberName: 'alice',
            sessionId: 'session-1',
            filePath: '/transcripts/smaller.jsonl',
            mtimeMs: 10,
            sizeBytes: 1_000,
            messageCount: 1,
            kind: 'subagent',
          },
          {
            memberName: 'alice',
            sessionId: 'session-1',
            filePath: '/transcripts/larger.jsonl',
            mtimeMs: 20,
            sizeBytes: 5_000,
            messageCount: 10,
            kind: 'subagent',
          },
        ]),
      } as never,
      { parseFiles } as never,
      chunkBuilder as never,
      { warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    );

    const result = await source.load(sourceInput());

    expect(result.status).toBe('included');
    expect(parseFiles).toHaveBeenCalledWith(['/transcripts/larger.jsonl']);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.id).not.toContain('/transcripts');
    expect(result.segments[0]?.source).toMatchObject({
      provider: 'claude_transcript',
      sessionId: 'session-1',
      messageCount: 2,
    });
  });
});

describe('OpenCodeMemberRuntimeStreamSource', () => {
  it('enforces member message and content budgets before building OpenCode chunks', async () => {
    const getOpenCodeTranscript = vi.fn().mockResolvedValue({
      sessionId: 'opencode-session',
      logProjection: {
        messages: [0, 1, 2].map((index) => ({
          uuid: `opencode-${index}`,
          parentUuid: index === 0 ? null : `opencode-${index - 1}`,
          type: 'assistant',
          timestamp: `2026-04-04T00:00:0${index}.000Z`,
          role: 'assistant',
          content: `long OpenCode runtime message ${index} ${'x'.repeat(80)}`,
          toolCalls: [],
          toolResults: [],
          isMeta: false,
          sessionId: 'opencode-session',
        })),
      },
    });
    const buildBundleChunks = vi.fn((_: ParsedMessage[]) => [
      fakeChunk('opencode-budgeted-chunk'),
    ]);
    const source = new OpenCodeMemberRuntimeStreamSource(
      { getOpenCodeTranscript } as never,
      { buildBundleChunks } as never,
      { resolve: vi.fn().mockResolvedValue('/mock/orchestrator') }
    );

    const result = await source.load(
      sourceInput({
        budget: {
          ...DEFAULT_MEMBER_LOG_STREAM_BUDGET,
          maxMessagesPerSegment: 2,
          maxTotalContentChars: 60,
          maxMessageContentChars: 40,
        },
      })
    );

    expect(result.status).toBe('included');
    expect(result.metadata?.droppedMessageCount).toBe(1);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['segment_message_window_limited', 'message_content_limited'])
    );
    expect(result.segments[0]?.source).toMatchObject({
      provider: 'opencode_runtime',
      messageCount: 2,
      truncated: true,
    });
    expect(buildBundleChunks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ uuid: 'opencode-1' }),
        expect.objectContaining({ uuid: 'opencode-2' }),
      ])
    );
    expect(JSON.stringify(buildBundleChunks.mock.calls[0]?.[0])).toContain(
      '[content truncated by member log stream budget]'
    );
  });

  it('joins active bridge calls, uses TTL cache, and lets forceRefresh bypass completed cache only', async () => {
    const getOpenCodeTranscript = vi.fn().mockResolvedValue({
      sessionId: 'opencode-session',
      logProjection: {
        messages: [
          {
            uuid: 'opencode-1',
            parentUuid: null,
            type: 'assistant',
            timestamp: '2026-04-04T00:00:00.000Z',
            role: 'assistant',
            content: 'hello',
            toolCalls: [],
            toolResults: [],
            isMeta: false,
            sessionId: 'opencode-session',
          },
        ],
      },
    });
    const source = new OpenCodeMemberRuntimeStreamSource(
      { getOpenCodeTranscript } as never,
      { buildBundleChunks: vi.fn(() => [fakeChunk('opencode-chunk')]) } as never,
      { resolve: vi.fn().mockResolvedValue('/mock/orchestrator') }
    );
    const input = sourceInput({ laneId: 'secondary:opencode:alice' });

    const [first, second] = await Promise.all([source.load(input), source.load(input)]);

    expect(first.status).toBe('included');
    expect(second.status).toBe('included');
    expect(getOpenCodeTranscript).toHaveBeenCalledTimes(1);

    await source.load(input);
    expect(getOpenCodeTranscript).toHaveBeenCalledTimes(1);

    await source.load({ ...input, forceRefresh: true });
    expect(getOpenCodeTranscript).toHaveBeenCalledTimes(2);
    expect(getOpenCodeTranscript).toHaveBeenLastCalledWith(
      '/mock/orchestrator',
      expect.objectContaining({
        teamId: 'alpha-team',
        memberName: 'alice',
        laneId: 'secondary:opencode:alice',
        timeoutMs: DEFAULT_MEMBER_LOG_STREAM_BUDGET.openCodeTimeoutMs,
      })
    );
  });

  it('reports ambiguous OpenCode lane errors as skipped provider warnings', async () => {
    const source = new OpenCodeMemberRuntimeStreamSource(
      {
        getOpenCodeTranscript: vi.fn().mockRejectedValue(new Error('multiple records, pass --lane')),
      } as never,
      { buildBundleChunks: vi.fn(() => [fakeChunk('opencode-chunk')]) } as never,
      { resolve: vi.fn().mockResolvedValue('/mock/orchestrator') }
    );

    const result = await source.load(sourceInput());

    expect(result).toMatchObject({
      provider: 'opencode_runtime',
      status: 'skipped',
      warnings: [
        {
          code: 'opencode_ambiguous_lane',
          message: 'OpenCode runtime session is ambiguous without a safe lane id.',
        },
      ],
    });
  });
});

describe('CodexNativeMemberTraceStreamSource', () => {
  it('returns an honest skipped warning for Codex members only', async () => {
    const codexSource = new CodexNativeMemberTraceStreamSource({
      getConfig: vi.fn().mockResolvedValue({
        members: [{ name: 'alice', providerId: 'codex' }],
      }),
    } as never);
    const nonCodexSource = new CodexNativeMemberTraceStreamSource({
      getConfig: vi.fn().mockResolvedValue({
        members: [{ name: 'alice', providerId: 'opencode' }],
      }),
    } as never);

    await expect(codexSource.load(sourceInput())).resolves.toMatchObject({
      status: 'skipped',
      warnings: [{ code: 'codex_member_wide_not_supported' }],
    });
    await expect(nonCodexSource.load(sourceInput())).resolves.toMatchObject({
      status: 'skipped',
      warnings: [],
    });
  });
});
