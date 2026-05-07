import type { MemberLogStreamResponse } from './dto';

export function createEmptyMemberLogStreamResponse(
  generatedAt = new Date().toISOString()
): MemberLogStreamResponse {
  return {
    participants: [],
    defaultFilter: 'all',
    segments: [],
    source: 'member_empty',
    coverage: [],
    warnings: [],
    truncated: false,
    generatedAt,
    metadata: {
      scannedTranscriptFileCount: 0,
      includedTranscriptFileCount: 0,
      droppedSegmentCount: 0,
      droppedChunkCount: 0,
      droppedMessageCount: 0,
    },
  };
}

export function normalizeMemberLogStreamResponse(
  response: MemberLogStreamResponse | null | undefined
): MemberLogStreamResponse {
  if (!response) {
    return createEmptyMemberLogStreamResponse();
  }

  return {
    ...createEmptyMemberLogStreamResponse(response.generatedAt),
    ...response,
    participants: Array.isArray(response.participants) ? response.participants : [],
    segments: Array.isArray(response.segments) ? response.segments : [],
    coverage: Array.isArray(response.coverage) ? response.coverage : [],
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
    metadata: {
      ...createEmptyMemberLogStreamResponse(response.generatedAt).metadata,
      ...(response.metadata ?? {}),
    },
  };
}
