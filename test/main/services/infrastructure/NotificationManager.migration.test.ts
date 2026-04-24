import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  Notification: Object.assign(
    vi.fn().mockImplementation(() => ({
      show: vi.fn(),
      on: vi.fn(),
    })),
    { isSupported: vi.fn().mockReturnValue(false) }
  ),
  BrowserWindow: vi.fn(),
}));

function createConfigManagerStub() {
  return {
    getConfig: vi.fn().mockReturnValue({
      notifications: {
        enabled: true,
        soundEnabled: false,
        snoozedUntil: null,
        ignoredRegex: [],
        ignoredRepositories: [],
      },
    }),
    clearSnooze: vi.fn(),
  };
}

describe('NotificationManager storage migration', () => {
  let tempHome: string | null = null;

  afterEach(() => {
    if (tempHome) {
      fs.rmSync(tempHome, { recursive: true, force: true });
      tempHome = null;
    }
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function useTempHome(): string {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-migration-home-'));
    vi.stubEnv('HOME', tempHome);
    return tempHome;
  }

  it('copies legacy notification history to the new Agent Teams filename', async () => {
    const home = useTempHome();
    const legacyPath = path.join(home, '.claude', 'claude-devtools-notifications.json');
    const currentPath = path.join(home, '.claude', 'agent-teams-notifications.json');
    const legacyNotifications = [
      {
        id: 'legacy-notification',
        title: 'Legacy',
        message: 'Copied',
        timestamp: new Date().toISOString(),
        type: 'error',
        isRead: false,
        createdAt: Date.now(),
      },
    ];
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(legacyNotifications), 'utf8');

    const { NotificationManager } =
      await import('../../../../src/main/services/infrastructure/NotificationManager');
    const manager = new NotificationManager(createConfigManagerStub() as never);
    await manager.initialize();

    const result = await manager.getNotifications({ limit: 10 });
    expect(result.notifications.map((notification) => notification.id)).toEqual([
      'legacy-notification',
    ]);
    expect(JSON.parse(fs.readFileSync(currentPath, 'utf8'))).toEqual(legacyNotifications);
    expect(fs.existsSync(legacyPath)).toBe(true);
  });

  it('keeps existing Agent Teams notification history when legacy history also exists', async () => {
    const home = useTempHome();
    const legacyPath = path.join(home, '.claude', 'claude-devtools-notifications.json');
    const currentPath = path.join(home, '.claude', 'agent-teams-notifications.json');
    const currentNotifications = [
      {
        id: 'current-notification',
        title: 'Current',
        message: 'Kept',
        timestamp: new Date().toISOString(),
        type: 'error',
        isRead: false,
        createdAt: Date.now(),
      },
    ];
    fs.mkdirSync(path.dirname(currentPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      JSON.stringify([{ ...currentNotifications[0], id: 'legacy-notification' }]),
      'utf8'
    );
    fs.writeFileSync(currentPath, JSON.stringify(currentNotifications), 'utf8');

    const { NotificationManager } =
      await import('../../../../src/main/services/infrastructure/NotificationManager');
    const manager = new NotificationManager(createConfigManagerStub() as never);
    await manager.initialize();

    const result = await manager.getNotifications({ limit: 10 });
    expect(result.notifications.map((notification) => notification.id)).toEqual([
      'current-notification',
    ]);
    expect(JSON.parse(fs.readFileSync(currentPath, 'utf8'))).toEqual(currentNotifications);
  });

  it('copies pre-devtools notification history when newer legacy history is absent', async () => {
    const home = useTempHome();
    const legacyPath = path.join(home, '.claude', 'claude-code-context-notifications.json');
    const currentPath = path.join(home, '.claude', 'agent-teams-notifications.json');
    const legacyNotifications = [
      {
        id: 'pre-devtools-notification',
        title: 'Old',
        message: 'Copied',
        timestamp: new Date().toISOString(),
        type: 'error',
        isRead: false,
        createdAt: Date.now(),
      },
    ];
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(legacyNotifications), 'utf8');

    const { NotificationManager } =
      await import('../../../../src/main/services/infrastructure/NotificationManager');
    const manager = new NotificationManager(createConfigManagerStub() as never);
    await manager.initialize();

    const result = await manager.getNotifications({ limit: 10 });
    expect(result.notifications.map((notification) => notification.id)).toEqual([
      'pre-devtools-notification',
    ]);
    expect(JSON.parse(fs.readFileSync(currentPath, 'utf8'))).toEqual(legacyNotifications);
    expect(fs.existsSync(legacyPath)).toBe(true);
  });

  it('prefers valid older notification history over an invalid newer legacy file', async () => {
    const home = useTempHome();
    const invalidNewerLegacyPath = path.join(home, '.claude', 'claude-devtools-notifications.json');
    const validOlderLegacyPath = path.join(
      home,
      '.claude',
      'claude-code-context-notifications.json'
    );
    const currentPath = path.join(home, '.claude', 'agent-teams-notifications.json');
    const legacyNotifications = [
      {
        id: 'older-valid-notification',
        title: 'Old',
        message: 'Copied',
        timestamp: new Date().toISOString(),
        type: 'error',
        isRead: false,
        createdAt: Date.now(),
      },
    ];
    fs.mkdirSync(path.dirname(invalidNewerLegacyPath), { recursive: true });
    fs.writeFileSync(invalidNewerLegacyPath, '', 'utf8');
    fs.writeFileSync(validOlderLegacyPath, JSON.stringify(legacyNotifications), 'utf8');

    const { NotificationManager } =
      await import('../../../../src/main/services/infrastructure/NotificationManager');
    const manager = new NotificationManager(createConfigManagerStub() as never);
    await manager.initialize();

    const result = await manager.getNotifications({ limit: 10 });
    expect(result.notifications.map((notification) => notification.id)).toEqual([
      'older-valid-notification',
    ]);
    expect(JSON.parse(fs.readFileSync(currentPath, 'utf8'))).toEqual(legacyNotifications);
  });
});
