import { getTeamsBasePath } from '@main/utils/pathDecoder';
import { createLogger } from '@shared/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

import { atomicWriteAsync } from './atomicWrite';

import type { AttachmentFileData, AttachmentPayload } from '@shared/types';

const logger = createLogger('Service:TeamAttachmentStore');

const ATTACHMENTS_DIR = 'attachments';

export class TeamAttachmentStore {
  private getDir(teamName: string): string {
    return path.join(getTeamsBasePath(), teamName, ATTACHMENTS_DIR);
  }

  private getFilePath(teamName: string, messageId: string): string {
    return path.join(this.getDir(teamName), `${messageId}.json`);
  }

  async saveAttachments(
    teamName: string,
    messageId: string,
    attachments: AttachmentPayload[]
  ): Promise<void> {
    if (attachments.length === 0) return;

    const fileData: AttachmentFileData[] = attachments.map((a) => ({
      id: a.id,
      data: a.data,
      mimeType: a.mimeType,
    }));

    await atomicWriteAsync(this.getFilePath(teamName, messageId), JSON.stringify(fileData));
    logger.debug(
      `[${teamName}] Saved ${attachments.length} attachment(s) for message ${messageId}`
    );
  }

  async getAttachments(teamName: string, messageId: string): Promise<AttachmentFileData[]> {
    const filePath = this.getFilePath(teamName, messageId);

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

    const result: AttachmentFileData[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Partial<AttachmentFileData>;
      if (
        typeof row.id !== 'string' ||
        typeof row.data !== 'string' ||
        typeof row.mimeType !== 'string'
      ) {
        continue;
      }
      result.push({
        id: row.id,
        data: row.data,
        mimeType: row.mimeType,
      });
    }

    return result;
  }
}
