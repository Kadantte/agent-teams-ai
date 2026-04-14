import { execCli } from '@main/utils/childProcess';

const CACHE_VERIFY_TTL_MS = 30_000;

let cachedBinaryPath: string | null | undefined;
let cacheVerifiedAt = 0;
let resolveInFlight: Promise<string | null> | null = null;

async function verifyBinary(candidate: string): Promise<string | null> {
  try {
    await execCli(candidate, ['--version'], { timeout: 2_000, windowsHide: true });
    return candidate;
  } catch {
    return null;
  }
}

export class CodexBinaryResolver {
  static clearCache(): void {
    cachedBinaryPath = undefined;
    cacheVerifiedAt = 0;
    resolveInFlight = null;
  }

  static async resolve(): Promise<string | null> {
    if (cachedBinaryPath !== undefined) {
      if (cachedBinaryPath === null) {
        return null;
      }

      if (Date.now() - cacheVerifiedAt <= CACHE_VERIFY_TTL_MS) {
        return cachedBinaryPath;
      }

      const verified = await verifyBinary(cachedBinaryPath);
      if (verified) {
        cacheVerifiedAt = Date.now();
        return verified;
      }

      cachedBinaryPath = undefined;
      cacheVerifiedAt = 0;
    }

    if (!resolveInFlight) {
      resolveInFlight = CodexBinaryResolver.runResolve().finally(() => {
        resolveInFlight = null;
      });
    }

    return resolveInFlight;
  }

  private static async runResolve(): Promise<string | null> {
    const override = process.env.CODEX_CLI_PATH?.trim();
    const candidates = override ? [override, 'codex'] : ['codex'];

    for (const candidate of candidates) {
      const resolved = await verifyBinary(candidate);
      if (resolved) {
        cachedBinaryPath = resolved;
        cacheVerifiedAt = Date.now();
        return resolved;
      }
    }

    cachedBinaryPath = null;
    cacheVerifiedAt = Date.now();
    return null;
  }
}
