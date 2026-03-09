import { describe, expect, it } from 'vitest';

import {
  parseCrossTeamPrefix,
  parseCrossTeamReplyPrefix,
  stripCrossTeamPrefix,
} from '@shared/constants/crossTeam';

describe('crossTeam protocol helpers', () => {
  it('parses canonical cross-team prefix metadata', () => {
    const parsed = parseCrossTeamPrefix(
      '[Cross-team from dream-team.team-lead | depth:0 | conversation:conv-1 | replyTo:conv-0]\nHello'
    );

    expect(parsed).toEqual({
      from: 'dream-team.team-lead',
      chainDepth: 0,
      conversationId: 'conv-1',
      replyToConversationId: 'conv-0',
    });
  });

  it('parses manual cross-team reply prefix metadata', () => {
    const parsed = parseCrossTeamReplyPrefix(
      '[Cross-team reply | conversation:conv-1 | replyTo:conv-1]\nHello'
    );

    expect(parsed).toEqual({
      conversationId: 'conv-1',
      replyToConversationId: 'conv-1',
    });
  });

  it('strips both canonical and reply prefixes from UI text', () => {
    expect(stripCrossTeamPrefix('[Cross-team from a.b | depth:0 | conversation:conv-1]\nHello')).toBe(
      'Hello'
    );
    expect(stripCrossTeamPrefix('[Cross-team reply | conversation:conv-1]\nHello')).toBe('Hello');
  });
});
