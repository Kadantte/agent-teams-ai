import type { BoardTaskLogParticipant, BoardTaskLogSegment } from '@shared/types';

export type MemberLogStreamProvider =
  | 'claude_transcript'
  | 'opencode_runtime'
  | 'codex_native_trace';

export type MemberLogStreamSource =
  | 'member_transcript'
  | 'member_mixed_runtime'
  | 'member_runtime_only'
  | 'member_empty';

export interface MemberLogStreamRequestOptions {
  limitSegments?: number;
  since?: string;
  laneId?: string;
  forceRefresh?: boolean;
}

export interface MemberLogStreamCoverage {
  provider: MemberLogStreamProvider;
  status: 'included' | 'partial' | 'skipped';
  reason?: string;
}

export interface MemberLogStreamWarning {
  code:
    | 'opencode_ambiguous_lane'
    | 'opencode_missing_runtime_session'
    | 'opencode_runtime_unavailable'
    | 'opencode_runtime_timeout'
    | 'codex_member_wide_not_supported'
    | 'large_log_window_limited'
    | 'segment_message_window_limited'
    | 'message_content_limited'
    | 'unreadable_transcript_file';
  message: string;
}

export interface MemberLogStreamMetadata {
  scannedTranscriptFileCount: number;
  includedTranscriptFileCount: number;
  droppedSegmentCount: number;
  droppedChunkCount: number;
  droppedMessageCount: number;
}

export interface MemberLogStreamSegmentSource {
  provider: MemberLogStreamProvider;
  label: string;
  sessionId?: string;
  laneId?: string;
  messageCount?: number;
  truncated?: boolean;
}

export interface MemberLogStreamSegment extends BoardTaskLogSegment {
  source: MemberLogStreamSegmentSource;
}

export interface MemberLogStreamResponse {
  participants: BoardTaskLogParticipant[];
  defaultFilter: string;
  segments: MemberLogStreamSegment[];
  source: MemberLogStreamSource;
  coverage: MemberLogStreamCoverage[];
  warnings: MemberLogStreamWarning[];
  truncated: boolean;
  generatedAt: string;
  metadata: MemberLogStreamMetadata;
}
