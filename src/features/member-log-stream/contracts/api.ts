import type { MemberLogStreamRequestOptions, MemberLogStreamResponse } from './dto';

export interface MemberLogStreamApi {
  getMemberLogStream(
    teamName: string,
    memberName: string,
    options?: MemberLogStreamRequestOptions
  ): Promise<MemberLogStreamResponse>;
  setMemberLogStreamTracking(teamName: string, enabled: boolean): Promise<void>;
}
