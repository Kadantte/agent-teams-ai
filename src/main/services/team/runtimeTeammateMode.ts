import { execFile } from 'child_process';

import { parseCliArgs } from '@shared/utils/cliArgsParser';

let tmuxAvailablePromise: Promise<boolean> | null = null;

function execFileAsync(command: string, args: string[], timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function hasExplicitTeammateMode(rawExtraCliArgs: string | undefined): boolean {
  return parseCliArgs(rawExtraCliArgs).some(
    (token) => token === '--teammate-mode' || token.startsWith('--teammate-mode=')
  );
}

async function isTmuxAvailable(): Promise<boolean> {
  if (!tmuxAvailablePromise) {
    tmuxAvailablePromise = execFileAsync('tmux', ['-V'], 3_000)
      .then(() => true)
      .catch(() => false);
  }

  return tmuxAvailablePromise;
}

export async function getDesktopPreferredTeammateMode(
  rawExtraCliArgs: string | undefined
): Promise<'tmux' | null> {
  if (process.platform === 'win32') {
    return null;
  }

  if (hasExplicitTeammateMode(rawExtraCliArgs)) {
    return null;
  }

  return (await isTmuxAvailable()) ? 'tmux' : null;
}
