import { createLogger } from '@shared/utils/logger';
import { createReadStream } from 'fs';
import * as readline from 'readline';

import { type TeamMemberLogsFinder } from './TeamMemberLogsFinder';

import type { MemberFullStats } from '@shared/types';

const logger = createLogger('Service:MemberStatsComputer');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  stats: MemberFullStats;
  timestamp: number;
}

export class MemberStatsComputer {
  private cache = new Map<string, CacheEntry>();

  constructor(private readonly logsFinder: TeamMemberLogsFinder) {}

  async getStats(teamName: string, memberName: string): Promise<MemberFullStats> {
    const cacheKey = `${teamName}:${memberName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.stats;
    }

    const paths = await this.logsFinder.findMemberLogPaths(teamName, memberName);

    let linesAdded = 0;
    let linesRemoved = 0;
    const filesTouchedSet = new Set<string>();
    const toolUsage: Record<string, number> = {};
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let messageCount = 0;
    let totalDurationMs = 0;

    for (const filePath of paths) {
      const fileStats = await this.parseFile(filePath);
      linesAdded += fileStats.linesAdded;
      linesRemoved += fileStats.linesRemoved;
      for (const f of fileStats.filesTouched) filesTouchedSet.add(f);
      for (const [tool, count] of Object.entries(fileStats.toolUsage)) {
        toolUsage[tool] = (toolUsage[tool] ?? 0) + count;
      }
      inputTokens += fileStats.inputTokens;
      outputTokens += fileStats.outputTokens;
      cacheReadTokens += fileStats.cacheReadTokens;
      messageCount += fileStats.messageCount;
      totalDurationMs += fileStats.durationMs;
    }

    const stats: MemberFullStats = {
      linesAdded,
      linesRemoved,
      filesTouched: [...filesTouchedSet].sort((a, b) => a.localeCompare(b)),
      toolUsage,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      costUsd: 0,
      tasksCompleted: 0,
      messageCount,
      totalDurationMs,
      sessionCount: paths.length,
      computedAt: new Date().toISOString(),
    };

    this.cache.set(cacheKey, { stats, timestamp: Date.now() });
    return stats;
  }

  private async parseFile(filePath: string): Promise<{
    linesAdded: number;
    linesRemoved: number;
    filesTouched: string[];
    toolUsage: Record<string, number>;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    messageCount: number;
    durationMs: number;
  }> {
    let linesAdded = 0;
    let linesRemoved = 0;
    const filesTouchedSet = new Set<string>();
    const toolUsage: Record<string, number> = {};
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let messageCount = 0;
    let firstTimestamp: string | null = null;
    let lastTimestamp: string | null = null;

    try {
      const stream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;

          if (typeof msg.timestamp === 'string') {
            if (!firstTimestamp) firstTimestamp = msg.timestamp;
            lastTimestamp = msg.timestamp;
          }

          // Count messages
          const role = this.extractRole(msg);
          if (role) messageCount++;

          // Extract token usage
          const usage = this.extractUsage(msg);
          if (usage) {
            inputTokens += usage.inputTokens;
            outputTokens += usage.outputTokens;
            cacheReadTokens += usage.cacheReadTokens;
          }

          // Extract tool_use blocks from assistant messages
          if (role === 'assistant') {
            const content = this.extractContent(msg);
            if (Array.isArray(content)) {
              for (const block of content) {
                if (
                  block &&
                  typeof block === 'object' &&
                  (block as Record<string, unknown>).type === 'tool_use'
                ) {
                  const toolBlock = block as Record<string, unknown>;
                  const rawName = typeof toolBlock.name === 'string' ? toolBlock.name : 'unknown';
                  const toolName = rawName.startsWith('proxy_') ? rawName.slice(6) : rawName;
                  toolUsage[toolName] = (toolUsage[toolName] ?? 0) + 1;

                  const input = toolBlock.input as Record<string, unknown> | undefined;
                  if (!input) continue;

                  // Track files
                  if (typeof input.file_path === 'string') {
                    filesTouchedSet.add(input.file_path);
                  }
                  if (typeof input.path === 'string' && toolName === 'Read') {
                    filesTouchedSet.add(input.path);
                  }

                  // Count lines for Edit
                  if (toolName === 'Edit') {
                    const oldStr = typeof input.old_string === 'string' ? input.old_string : '';
                    const newStr = typeof input.new_string === 'string' ? input.new_string : '';
                    const oldLines = oldStr ? oldStr.split('\n').length : 0;
                    const newLines = newStr ? newStr.split('\n').length : 0;
                    if (newLines > oldLines) linesAdded += newLines - oldLines;
                    if (oldLines > newLines) linesRemoved += oldLines - newLines;
                  }

                  // Count lines for Write
                  if (toolName === 'Write') {
                    const writeContent = typeof input.content === 'string' ? input.content : '';
                    if (writeContent) {
                      linesAdded += writeContent.split('\n').length;
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Skip malformed lines
        }
      }

      rl.close();
      stream.destroy();
    } catch (err) {
      logger.debug(`Failed to parse file ${filePath}: ${String(err)}`);
    }

    let durationMs = 0;
    if (firstTimestamp && lastTimestamp) {
      durationMs = Math.max(
        0,
        new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()
      );
    }

    return {
      linesAdded,
      linesRemoved,
      filesTouched: [...filesTouchedSet],
      toolUsage,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      messageCount,
      durationMs,
    };
  }

  private extractRole(msg: Record<string, unknown>): string | null {
    if (typeof msg.role === 'string') return msg.role;
    if (msg.message && typeof msg.message === 'object') {
      const inner = msg.message as Record<string, unknown>;
      if (typeof inner.role === 'string') return inner.role;
    }
    return null;
  }

  private extractContent(msg: Record<string, unknown>): unknown[] | null {
    const content = msg.content ?? (msg.message as Record<string, unknown> | undefined)?.content;
    if (Array.isArray(content)) return content as unknown[];
    return null;
  }

  private extractUsage(
    msg: Record<string, unknown>
  ): { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null {
    const usage = (msg.usage ?? (msg.message as Record<string, unknown> | undefined)?.usage) as
      | Record<string, unknown>
      | undefined;
    if (!usage || typeof usage !== 'object') return null;

    return {
      inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
      outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
      cacheReadTokens:
        typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0,
    };
  }
}
