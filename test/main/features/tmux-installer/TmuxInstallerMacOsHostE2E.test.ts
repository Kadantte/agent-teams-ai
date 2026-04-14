/**
 * @vitest-environment node
 */

import { execFileSync } from 'node:child_process';

import { beforeAll, describe, expect, it } from 'vitest';

import { TmuxStatusSourceAdapter } from '@features/tmux-installer/main/adapters/output/sources/TmuxStatusSourceAdapter';
import { isTmuxRuntimeReadyForCurrentPlatform } from '@features/tmux-installer/main/composition/runtimeSupport';
import { TmuxInstallStrategyResolver } from '@features/tmux-installer/main/infrastructure/installer/TmuxInstallStrategyResolver';
import { TmuxPackageManagerResolver } from '@features/tmux-installer/main/infrastructure/platform/TmuxPackageManagerResolver';
import { TmuxPlatformResolver } from '@features/tmux-installer/main/infrastructure/platform/TmuxPlatformResolver';
import { buildEnrichedEnv } from '@main/utils/cliEnv';
import { resolveInteractiveShellEnv } from '@main/utils/shellEnv';

const isDarwin = process.platform === 'darwin';
const tmuxPath = isDarwin ? tryResolveBinary('tmux') : null;
const brewPath = isDarwin ? tryResolveBinary('brew') : null;

function tryResolveBinary(command: string): string | null {
  try {
    return execFileSync('/usr/bin/which', [command], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

describe.runIf(isDarwin)('tmux installer macOS host e2e', () => {
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await resolveInteractiveShellEnv();
    env = buildEnrichedEnv();
  });

  it('resolves the current host as native macOS', async () => {
    const result = await new TmuxPlatformResolver().resolve();

    expect(result.platform).toBe('darwin');
    expect(result.nativeSupported).toBe(true);
    expect(result.linux).toBeNull();
  });

  it.skipIf(!brewPath)('chooses Homebrew as the macOS install strategy on this machine', async () => {
    const result = await new TmuxInstallStrategyResolver().resolve();

    expect(result.capability.strategy).toBe('homebrew');
    expect(result.capability.supported).toBe(true);
    expect(result.command).not.toBeNull();
    expect(result.command?.command).toBe('brew');
    expect(result.command?.args).toEqual(['install', 'tmux']);
  });

  it.skipIf(!tmuxPath)('finds the real tmux binary on this macOS host', async () => {
    const resolver = new TmuxPackageManagerResolver();
    const resolvedTmuxPath = await resolver.resolveTmuxBinary(env, 'darwin');

    expect(resolvedTmuxPath).toBe(tmuxPath);
    expect(resolvedTmuxPath).toContain('tmux');
  });

  it.skipIf(!tmuxPath)('reports tmux as runtime-ready for the live macOS host path', async () => {
    const status = await new TmuxStatusSourceAdapter().getStatus();

    expect(status.platform).toBe('darwin');
    expect(status.host.available).toBe(true);
    expect(status.effective.available).toBe(true);
    expect(status.effective.location).toBe('host');
    expect(status.effective.runtimeReady).toBe(true);
    expect(status.host.binaryPath).toBe(tmuxPath);
    expect(status.effective.binaryPath).toBe(tmuxPath);
    expect(status.effective.version ?? status.host.version).toMatch(/^tmux /);
  });

  it.skipIf(!tmuxPath)('keeps the current platform on the tmux runtime path', async () => {
    await expect(isTmuxRuntimeReadyForCurrentPlatform()).resolves.toBe(true);
  });
});
