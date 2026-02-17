import { createLogger } from '@shared/utils/logger';

const logger = createLogger('Renderer:unwrapIpc');

export class IpcError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly causeError?: unknown
  ) {
    super(message);
    this.name = 'IpcError';
  }
}

export async function unwrapIpc<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[${operation}] ${message}`);
    throw new IpcError(operation, message, error);
  }
}
