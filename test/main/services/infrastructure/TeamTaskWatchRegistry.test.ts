import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockChokidarWatcher = {
  targets: string[];
  options: unknown;
  on: (event: string, handler: (...args: unknown[]) => void) => MockChokidarWatcher;
  close: ReturnType<typeof vi.fn>;
};

const chokidarMock = vi.hoisted(() => {
  const instances: MockChokidarWatcher[] = [];
  const make = () => (targets: string | string[], options: unknown) => {
    const watcher = {
      targets: (Array.isArray(targets) ? targets : [targets]).map((t) => String(t)),
      options,
      close: vi.fn().mockResolvedValue(undefined),
    } as MockChokidarWatcher;
    watcher.on = vi.fn(() => watcher);
    instances.push(watcher);
    return watcher;
  };
  const watch = vi.fn(make());
  return {
    instances,
    watch,
    reset() {
      instances.length = 0;
      watch.mockReset();
      watch.mockImplementation(make());
    },
  };
});

vi.mock('chokidar', () => ({ watch: chokidarMock.watch }));

import { TeamTaskWatchRegistry } from '../../../../src/main/services/infrastructure/TeamTaskWatchRegistry';

function latestTargets(): string[] {
  const last = chokidarMock.instances.at(-1);
  return (last?.targets ?? []).map((t) => path.normalize(t));
}

describe('TeamTaskWatchRegistry scoping', () => {
  let root: string;

  beforeEach(() => {
    chokidarMock.reset();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ttwr-scope-'));
    for (const team of ['alpha', 'beta', 'gamma']) {
      fs.mkdirSync(path.join(root, team, 'inboxes'), { recursive: true });
      fs.writeFileSync(path.join(root, team, 'config.json'), '{}');
      fs.writeFileSync(path.join(root, team, 'inboxes', 'team-lead.json'), '[]');
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('watches only scoped team dirs but every team inbox (teams kind)', async () => {
    const registry = new TeamTaskWatchRegistry({
      kind: 'teams',
      rootPath: root,
      onChange: () => {},
      onError: () => {},
      getScopedTeamNames: () => new Set(['alpha']),
    });
    await registry.start();
    const targets = latestTargets();
    await registry.close();

    expect(targets).toContain(path.normalize(root));
    // scoped team root watched, unscoped team roots not watched
    expect(targets).toContain(path.normalize(path.join(root, 'alpha')));
    expect(targets).not.toContain(path.normalize(path.join(root, 'beta')));
    expect(targets).not.toContain(path.normalize(path.join(root, 'gamma')));
    // ALL inboxes watched regardless of scope (cross-team delivery)
    expect(targets).toContain(path.normalize(path.join(root, 'alpha', 'inboxes')));
    expect(targets).toContain(path.normalize(path.join(root, 'beta', 'inboxes')));
    expect(targets).toContain(path.normalize(path.join(root, 'gamma', 'inboxes')));
  });

  it('falls back to watching every team when no scope provider is given', async () => {
    const registry = new TeamTaskWatchRegistry({
      kind: 'teams',
      rootPath: root,
      onChange: () => {},
      onError: () => {},
    });
    await registry.start();
    const targets = latestTargets();
    await registry.close();

    for (const team of ['alpha', 'beta', 'gamma']) {
      expect(targets).toContain(path.normalize(path.join(root, team)));
      expect(targets).toContain(path.normalize(path.join(root, team, 'inboxes')));
    }
  });

  it('falls back to watching every team when the scope provider returns null', async () => {
    const registry = new TeamTaskWatchRegistry({
      kind: 'teams',
      rootPath: root,
      onChange: () => {},
      onError: () => {},
      getScopedTeamNames: () => null,
    });
    await registry.start();
    const targets = latestTargets();
    await registry.close();

    for (const team of ['alpha', 'beta', 'gamma']) {
      expect(targets).toContain(path.normalize(path.join(root, team)));
    }
  });

  it('scopes task dirs and never adds inboxes (tasks kind)', async () => {
    const registry = new TeamTaskWatchRegistry({
      kind: 'tasks',
      rootPath: root,
      onChange: () => {},
      onError: () => {},
      getScopedTeamNames: () => new Set(['beta']),
    });
    await registry.start();
    const targets = latestTargets();
    await registry.close();

    expect(targets).toContain(path.normalize(root));
    expect(targets).toContain(path.normalize(path.join(root, 'beta')));
    expect(targets).not.toContain(path.normalize(path.join(root, 'alpha')));
    expect(targets).not.toContain(path.normalize(path.join(root, 'gamma')));
    // tasks kind never watches inboxes
    expect(targets).not.toContain(path.normalize(path.join(root, 'beta', 'inboxes')));
  });

  it('re-resolves scope on requestReconcile (newly scoped team gets watched)', async () => {
    const scoped = new Set<string>(['alpha']);
    const registry = new TeamTaskWatchRegistry({
      kind: 'teams',
      rootPath: root,
      onChange: () => {},
      onError: () => {},
      getScopedTeamNames: () => scoped,
    });
    await registry.start();
    expect(latestTargets()).not.toContain(path.normalize(path.join(root, 'beta')));

    scoped.add('beta');
    await registry.requestReconcile();
    const targets = latestTargets();
    await registry.close();

    expect(targets).toContain(path.normalize(path.join(root, 'beta')));
  });
});
