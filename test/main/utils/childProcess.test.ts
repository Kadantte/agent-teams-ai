import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the entire child_process module so that we can inspect how our helpers
// invoke spawn/exec without hitting the real filesystem or spawning anything.
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
  exec: vi.fn(),
}));

// Import after the mock call so that the mocked module is returned.
import * as child from 'child_process';
import { spawnCli, execCli } from '@main/utils/childProcess';

// Helper to temporarily override process.platform
function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', {
    value,
  });
}

// restore platform after tests
const originalPlatform = process.platform;

describe('cli child process helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  describe('spawnCli', () => {
    it('calls spawn directly when path is ascii on windows', () => {
      setPlatform('win32');
      (child.spawn as unknown as vi.Mock).mockReturnValue({} as any);

      const result = spawnCli('C:\\bin\\claude.exe', ['--version'], { cwd: 'x' });
      expect(child.spawn).toHaveBeenCalledWith('C:\\bin\\claude.exe', ['--version'], { cwd: 'x' });
      expect(result).toEqual({} as any);
    });

    it('falls back to shell when spawn throws EINVAL', () => {
      setPlatform('win32');
      const error: any = new Error('spawn EINVAL');
      error.code = 'EINVAL';
      const fake = {} as any;
      const spawnMock = child.spawn as unknown as vi.Mock;
      spawnMock.mockImplementationOnce(() => {
        throw error;
      });
      spawnMock.mockImplementationOnce(() => fake);

      const result = spawnCli('C:\\Users\\Алексей\\AppData\\Roaming\\npm\\claude.cmd', ['a', 'b'], {
        env: { FOO: 'bar' },
      });
      expect(spawnMock).toHaveBeenCalledTimes(2);
      const secondArg0 = spawnMock.mock.calls[1][0] as string;
      expect(secondArg0).toMatch(/claude\.cmd/);
      expect(spawnMock.mock.calls[1][2]).toMatchObject({ shell: true, env: { FOO: 'bar' } });
      expect(result).toBe(fake);
    });

    it('does not use shell when not on windows', () => {
      setPlatform('linux');
      (child.spawn as unknown as vi.Mock).mockReturnValue({} as any);
      const result = spawnCli('/usr/bin/claude', ['--help']);
      expect(child.spawn).toHaveBeenCalledWith('/usr/bin/claude', ['--help'], {});
      expect(result).toEqual({} as any);
    });
  });

  describe('execCli', () => {
    it('invokes execFile when path is normal', async () => {
      setPlatform('win32');
      const execFileMock = child.execFile as unknown as vi.Mock;
      execFileMock.mockImplementation((cmd, args, opts, cb) => {
        cb(null, 'ok', '');
        return {} as any;
      });
      const result = await execCli('C:\\bin\\claude.exe', ['--version']);
      expect(execFileMock).toHaveBeenCalledWith('C:\\bin\\claude.exe', ['--version'], {}, expect.any(Function));
      expect(result.stdout).toBe('ok');
    });

    it('falls back to exec shell when execFile throws EINVAL or path contains non-ascii', async () => {
      setPlatform('win32');
      const execFileMock = child.execFile as unknown as vi.Mock;
      execFileMock.mockImplementation((cmd, args, opts, cb) => {
        const err: any = new Error('spawn EINVAL');
        err.code = 'EINVAL';
        cb(err, '', '');
        return {} as any;
      });
      const execMock = child.exec as unknown as vi.Mock;
      execMock.mockImplementation((cmd, opts, cb) => {
        cb(null, '1.2.3', '');
        return {} as any;
      });

      const result = await execCli('C:\\Users\\Алексей\\AppData\\Roaming\\npm\\claude.cmd', ['--version']);
      expect(execFileMock).toHaveBeenCalled();
      expect(execMock).toHaveBeenCalled();
      expect(result.stdout).toBe('1.2.3');
    });
  });
});
