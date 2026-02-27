import { spawn, execFile, exec, SpawnOptions, ExecFileOptions } from 'child_process';
import { promisify } from 'util';

// re-exported helpers used throughout the codebase
export const execFileAsync = promisify(execFile);
export const execAsync = promisify(exec);

/**
 * Returns true if the string contains any non-ASCII character.
 */
function containsNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

/**
 * On Windows, creating a process whose *path* contains non-ASCII
 * characters will often fail with `spawn EINVAL`.  Detect that case so
 * callers can automatically fall back to launching via a shell.
 */
function needsShell(binaryPath: string): boolean {
  if (process.platform !== 'win32') return false;
  if (!binaryPath) return false;
  return containsNonAscii(binaryPath);
}

/**
 * Minimal quoting for command‑line arguments when building a shell
 * invocation.  We only escape spaces and double quotes since our
 * callers only ever use simple strings (paths, flags, literals) and
 * the shell itself will handle most quoting rules.
 */
function quoteArg(arg: string): string {
  if (/[^A-Za-z0-9_\-\/.]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

/**
 * Execute a CLI binary, falling back to running the command through a
 * shell on Windows if the normal path-based spawn fails.  `binaryPath`
 * may be `null` which causes `claude` (lookup via PATH) to be used.
 *
 * The return value matches the shape of Node's `execFile` promise: an
 * object with `stdout` and `stderr` strings.
 */
export async function execCli(
  binaryPath: string | null,
  args: string[],
  options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const target = binaryPath || 'claude';

  // attempt the normal execFile path first
  if (!needsShell(target)) {
    try {
      const result = await execFileAsync(target, args, options);
      return { stdout: String(result.stdout), stderr: String(result.stderr) };
    } catch (err: any) {
      // fall through to shell fallback only when the error matches the
      // Windows "invalid argument" problem; otherwise rethrow.
      if (!(err && err.code === 'EINVAL')) {
        throw err;
      }
    }
  }

  // shell fallback (Windows only; others shouldn't reach here)
  const cmd = [target, ...args].map(quoteArg).join(' ');
  const shellResult = await execAsync(cmd, options as unknown as import('child_process').ExecOptions);
  return { stdout: String(shellResult.stdout), stderr: String(shellResult.stderr) };
}

/**
 * Spawn a child process.  If the initial `spawn()` call throws
 * synchronously with EINVAL on Windows, retry using a shell-based
 * command string.  The returned `ChildProcess` is whatever the
 * underlying call returned; listeners may safely be attached to it.
 */
export function spawnCli(
  binaryPath: string,
  args: string[],
  options: SpawnOptions = {}
) {
  if (process.platform === 'win32' && needsShell(binaryPath)) {
    const cmd = [binaryPath, ...args].map(quoteArg).join(' ');
    return spawn(cmd, { shell: true, ...options });
  }

  try {
    return spawn(binaryPath, args, options);
  } catch (err: any) {
    if (process.platform === 'win32' && err && err.code === 'EINVAL') {
      const cmd = [binaryPath, ...args].map(quoteArg).join(' ');
      return spawn(cmd, { shell: true, ...options });
    }
    throw err;
  }
}
