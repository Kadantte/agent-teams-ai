import { BoardTaskExactLogChunkBuilder } from '@main/services/team/taskLogs/exact/BoardTaskExactLogChunkBuilder';
import { BoardTaskExactLogStrictParser } from '@main/services/team/taskLogs/exact/BoardTaskExactLogStrictParser';
import { TeamConfigReader } from '@main/services/team/TeamConfigReader';

import { createEmptyMemberLogStreamResponse } from '../../contracts';
import { GetMemberLogStreamUseCase } from '../../core/application/use-cases/GetMemberLogStreamUseCase';
import { SetMemberLogStreamTrackingUseCase } from '../../core/application/use-cases/SetMemberLogStreamTrackingUseCase';
import { ClaudeMemberTranscriptStreamSource } from '../adapters/output/sources/ClaudeMemberTranscriptStreamSource';
import { CodexNativeMemberTraceStreamSource } from '../adapters/output/sources/CodexNativeMemberTraceStreamSource';
import { OpenCodeMemberRuntimeStreamSource } from '../adapters/output/sources/OpenCodeMemberRuntimeStreamSource';
import { isMemberLogStreamReadEnabled } from '../featureGates';

import type { MemberLogStreamResponse } from '../../contracts';
import type { LoggerPort } from '../../core/application/ports/LoggerPort';
import type { MemberLogStreamTrackingPort } from '../../core/application/ports/MemberLogStreamTrackingPort';
import type { GetMemberLogStreamInput } from '../../core/application/use-cases/GetMemberLogStreamUseCase';
import type { ClaudeMultimodelBridgeService } from '@main/services/runtime/ClaudeMultimodelBridgeService';
import type { TeamLogSourceTracker } from '@main/services/team/TeamLogSourceTracker';
import type { TeamMemberLogsFinder } from '@main/services/team/TeamMemberLogsFinder';

export interface MemberLogStreamFeatureFacade {
  getMemberLogStream(input: GetMemberLogStreamInput): Promise<MemberLogStreamResponse>;
  setMemberLogStreamTracking(teamName: string, enabled: boolean): Promise<void>;
}

class TeamLogSourceTrackerMemberStreamPort implements MemberLogStreamTrackingPort {
  constructor(private readonly tracker: TeamLogSourceTracker) {}

  async setTracking(teamName: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await this.tracker.enableTracking(teamName, 'member_log_stream');
      return;
    }
    await this.tracker.disableTracking(teamName, 'member_log_stream');
  }
}

export function createMemberLogStreamFeature(deps: {
  logsFinder: TeamMemberLogsFinder;
  logSourceTracker: TeamLogSourceTracker;
  runtimeBridge: ClaudeMultimodelBridgeService;
  configReader?: TeamConfigReader;
  logger: LoggerPort;
}): MemberLogStreamFeatureFacade {
  const chunkBuilder = new BoardTaskExactLogChunkBuilder();
  const sources = [
    new ClaudeMemberTranscriptStreamSource(
      deps.logsFinder,
      new BoardTaskExactLogStrictParser(),
      chunkBuilder,
      deps.logger
    ),
    new OpenCodeMemberRuntimeStreamSource(deps.runtimeBridge, chunkBuilder),
    new CodexNativeMemberTraceStreamSource(deps.configReader ?? new TeamConfigReader()),
  ];
  const getUseCase = new GetMemberLogStreamUseCase({
    sources,
    clock: { now: () => Date.now() },
    logger: deps.logger,
  });
  const trackingUseCase = new SetMemberLogStreamTrackingUseCase(
    new TeamLogSourceTrackerMemberStreamPort(deps.logSourceTracker)
  );

  return {
    getMemberLogStream: async (input) => {
      if (!isMemberLogStreamReadEnabled()) {
        return createEmptyMemberLogStreamResponse();
      }
      return getUseCase.execute(input);
    },
    setMemberLogStreamTracking: (teamName, enabled) =>
      trackingUseCase.execute(teamName, enabled),
  };
}
