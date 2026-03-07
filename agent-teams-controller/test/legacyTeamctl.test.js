const { readLegacyTeamctlCliSource } = require('../src/index.js');

describe('agent-teams-controller legacy teamctl source', () => {
  it('exposes the extracted CLI source', () => {
    const source = readLegacyTeamctlCliSource();

    expect(source.startsWith('#!/usr/bin/env node')).toBe(true);
    expect(source).toContain("if (domain === 'task')");
    expect(source).toContain("if (domain === 'process')");
    expect(source).toContain('task comment-attach');
    expect(source).toContain('process unregister --id <uuid>');
  });
});
