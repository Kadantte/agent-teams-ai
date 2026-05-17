import { describe, expect, it } from 'vitest';

import {
  buildMemberLaunchDiagnosticsPayload,
  formatMemberLaunchDiagnosticsPayload,
  hasMemberLaunchDiagnosticsDetails,
  getMemberLaunchDiagnosticsErrorMessage,
} from '@renderer/utils/memberLaunchDiagnostics';

describe('member launch diagnostics', () => {
  it('builds a bounded copy payload from spawn and runtime evidence', () => {
    const payload = buildMemberLaunchDiagnosticsPayload({
      teamName: 'demo-team',
      runId: 'run-42',
      memberName: 'bob',
      spawnEntry: {
        status: 'waiting',
        launchState: 'runtime_pending_bootstrap',
        runtimeAlive: false,
        bootstrapConfirmed: false,
        hardFailure: false,
        agentToolAccepted: true,
        livenessKind: 'shell_only',
        livenessSource: 'process',
        runtimeDiagnostic: 'tmux pane foreground command is zsh',
        runtimeDiagnosticSeverity: 'warning',
        updatedAt: '2026-04-24T12:00:00.000Z',
      },
      runtimeEntry: {
        memberName: 'bob',
        alive: false,
        restartable: true,
        pid: 26676,
        pidSource: 'tmux_pane',
        paneId: '%42',
        panePid: 26676,
        paneCurrentCommand: 'zsh',
        processCommand: 'node runtime --token super-secret --team-name demo-team',
        diagnostics: ['tmux pane foreground command is zsh', 'no runtime child found'],
        updatedAt: '2026-04-24T12:00:01.000Z',
      },
    });

    expect(payload).toMatchObject({
      teamName: 'demo-team',
      runId: 'run-42',
      memberName: 'bob',
      launchState: 'runtime_pending_bootstrap',
      spawnStatus: 'waiting',
      livenessKind: 'shell_only',
      pid: 26676,
      pidSource: 'tmux_pane',
      paneCurrentCommand: 'zsh',
      runtimeDiagnostic: 'tmux pane foreground command is zsh',
      runtimeDiagnosticSeverity: 'warning',
    });
    expect(payload.processCommand).toContain('--token [redacted]');
    expect(payload.processCommand).not.toContain('super-secret');
    expect(payload.diagnostics).toEqual([
      'tmux pane foreground command is zsh',
      'no runtime child found',
    ]);
    expect(hasMemberLaunchDiagnosticsDetails(payload)).toBe(true);
    expect(formatMemberLaunchDiagnosticsPayload(payload)).toContain('"livenessKind": "shell_only"');
  });

  it('includes the exact normalized member card error in copy diagnostics', () => {
    const payload = buildMemberLaunchDiagnosticsPayload({
      memberName: 'jack',
      spawnEntry: {
        status: 'error',
        launchState: 'failed_to_start',
        hardFailure: true,
        hardFailureReason:
          'Latest assistant message msg_123 failed with APIError - OpenCode quota exhausted. Visit https://openrouter.ai/settings/keys',
        runtimeDiagnostic: 'persisted runtime pid is not alive',
        runtimeDiagnosticSeverity: 'error',
        updatedAt: '2026-05-08T12:00:00.000Z',
      },
    });

    expect(payload.memberCardError).toBe(
      'OpenCode quota exhausted. Visit https://openrouter.ai/settings/keys'
    );
    expect(payload.diagnostics?.[0]).toBe(
      'OpenCode quota exhausted. Visit https://openrouter.ai/settings/keys'
    );
    expect(getMemberLaunchDiagnosticsErrorMessage(payload)).toBe(
      'OpenCode quota exhausted. Visit https://openrouter.ai/settings/keys'
    );
    expect(formatMemberLaunchDiagnosticsPayload(payload)).toContain('"memberCardError"');
  });

  it('includes runtime advisory evidence in copy diagnostics', () => {
    const payload = buildMemberLaunchDiagnosticsPayload({
      memberName: 'alice',
      runtimeAdvisoryLabel: 'OpenCode delivery error',
      runtimeAdvisoryTitle: 'OpenCode accepted the prompt, but no assistant turn was recorded.',
      runtimeAdvisory: {
        kind: 'api_error',
        observedAt: '2026-05-17T22:11:38.239Z',
        reasonCode: 'backend_error',
        message: 'OpenCode accepted the prompt, but no assistant turn was recorded.',
      },
    });

    expect(payload.memberCardError).toBe(
      'OpenCode accepted the prompt, but no assistant turn was recorded.'
    );
    expect(payload.runtimeAdvisoryKind).toBe('api_error');
    expect(payload.runtimeAdvisoryReasonCode).toBe('backend_error');
    expect(payload.diagnostics).toContain(
      'OpenCode accepted the prompt, but no assistant turn was recorded.'
    );
    expect(hasMemberLaunchDiagnosticsDetails(payload)).toBe(true);
  });
});
