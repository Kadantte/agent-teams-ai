import { getTeamsBasePath } from '@main/utils/pathDecoder';
import * as fs from 'fs';
import * as path from 'path';

import { atomicWriteAsync } from './atomicWrite';

import type { InboxMessage } from '@shared/types';

const MAX_MESSAGES = 200;

export class TeamSentMessagesStore {
  private getFilePath(teamName: string): string {
    return path.join(getTeamsBasePath(), teamName, 'sentMessages.json');
  }

  async readMessages(teamName: string): Promise<InboxMessage[]> {
    const filePath = this.getFilePath(teamName);

    let raw: string;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    const messages: InboxMessage[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Partial<InboxMessage>;
      if (
        typeof row.from !== 'string' ||
        typeof row.text !== 'string' ||
        typeof row.timestamp !== 'string'
      ) {
        continue;
      }
      messages.push({
        from: row.from,
        to: typeof row.to === 'string' ? row.to : undefined,
        text: row.text,
        timestamp: row.timestamp,
        read: typeof row.read === 'boolean' ? row.read : true,
        summary: typeof row.summary === 'string' ? row.summary : undefined,
        messageId: typeof row.messageId === 'string' ? row.messageId : undefined,
        source: 'user_sent',
      });
    }

    return messages;
  }

  async appendMessage(teamName: string, message: InboxMessage): Promise<void> {
    const existing = await this.readMessages(teamName);
    existing.push(message);

    // Trim to MAX_MESSAGES (keep newest)
    const trimmed = existing.length > MAX_MESSAGES ? existing.slice(-MAX_MESSAGES) : existing;

    await atomicWriteAsync(this.getFilePath(teamName), JSON.stringify(trimmed, null, 2));
  }
}
