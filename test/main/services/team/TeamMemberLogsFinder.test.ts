import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import * as fs from 'fs/promises';

import { setClaudeBasePathOverride } from '../../../../src/main/utils/pathDecoder';
import { TeamMemberLogsFinder } from '../../../../src/main/services/team/TeamMemberLogsFinder';

describe('TeamMemberLogsFinder', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    setClaudeBasePathOverride(null);
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('returns subagent logs for a member and lead session for team-lead', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-team-logs-'));
    setClaudeBasePathOverride(tmpDir);

    const teamName = 't1';
    const projectPath = '/Users/test/my-proj';
    const projectId = '-Users-test-my-proj';
    const leadSessionId = 's1';

    await fs.mkdir(path.join(tmpDir, 'teams', teamName), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'teams', teamName, 'config.json'),
      JSON.stringify(
        {
          name: teamName,
          projectPath,
          leadSessionId,
          members: [
            { name: 'team-lead', agentType: 'team-lead' },
            { name: 'bob', agentType: 'general-purpose' },
          ],
        },
        null,
        2
      ),
      'utf8'
    );

    const projectRoot = path.join(tmpDir, 'projects', projectId);
    await fs.mkdir(path.join(projectRoot, leadSessionId, 'subagents'), { recursive: true });

    await fs.writeFile(
      path.join(projectRoot, `${leadSessionId}.jsonl`),
      [
        JSON.stringify({
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'user',
          message: { role: 'user', content: 'Lead start' },
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    await fs.writeFile(
      path.join(projectRoot, leadSessionId, 'subagents', 'agent-abc1234.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-01-01T00:00:01.000Z',
          type: 'user',
          message: { role: 'user', content: 'You are bob, a developer on team "t1" (t1).' },
        }),
        JSON.stringify({
          timestamp: '2026-01-01T00:00:02.000Z',
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    const finder = new TeamMemberLogsFinder();

    const bobLogs = await finder.findMemberLogs(teamName, 'bob');
    expect(bobLogs).toHaveLength(1);
    expect(bobLogs[0]?.kind).toBe('subagent');
    if (bobLogs[0]?.kind === 'subagent') {
      expect(bobLogs[0].subagentId).toBe('abc1234');
      expect(bobLogs[0].sessionId).toBe(leadSessionId);
      expect(bobLogs[0].projectId).toBe(projectId);
      expect(bobLogs[0].memberName?.toLowerCase()).toBe('bob');
    }

    const leadLogs = await finder.findMemberLogs(teamName, 'team-lead');
    expect(leadLogs.some((l) => l.kind === 'lead_session')).toBe(true);
    const lead = leadLogs.find((l) => l.kind === 'lead_session');
    expect(lead?.sessionId).toBe(leadSessionId);
    expect(lead?.projectId).toBe(projectId);
  });
});
