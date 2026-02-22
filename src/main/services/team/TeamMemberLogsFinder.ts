import { encodePath, extractBaseDir, getProjectsBasePath } from '@main/utils/pathDecoder';
import { createLogger } from '@shared/utils/logger';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

import { TeamConfigReader } from './TeamConfigReader';
import { TeamInboxReader } from './TeamInboxReader';
import { TeamMembersMetaStore } from './TeamMembersMetaStore';

import type { MemberLogSummary, MemberSubagentLogSummary } from '@shared/types';

const logger = createLogger('Service:TeamMemberLogsFinder');

const MAX_LINES_TO_SCAN = 30;

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0) {
    const ch = value.charCodeAt(end - 1);
    // '/' or '\'
    if (ch === 47 || ch === 92) {
      end--;
      continue;
    }
    break;
  }
  return end === value.length ? value : value.slice(0, end);
}

export class TeamMemberLogsFinder {
  constructor(
    private readonly configReader: TeamConfigReader = new TeamConfigReader(),
    private readonly inboxReader: TeamInboxReader = new TeamInboxReader(),
    private readonly membersMetaStore: TeamMembersMetaStore = new TeamMembersMetaStore()
  ) {}

  async findMemberLogs(teamName: string, memberName: string): Promise<MemberLogSummary[]> {
    const discovery = await this.discoverMemberFiles(teamName, memberName);
    if (!discovery) return [];

    const { projectDir, projectId, config, sessionIds, knownMembers, isLeadMember } = discovery;
    const results: MemberLogSummary[] = [];

    const leadMemberName =
      config.members?.find((m) => m?.agentType === 'team-lead')?.name?.trim() || 'team-lead';
    if (isLeadMember && config.leadSessionId) {
      const leadJsonl = path.join(projectDir, `${config.leadSessionId}.jsonl`);
      const leadSummary = await this.parseLeadSessionSummary(
        leadJsonl,
        projectId,
        config.leadSessionId,
        leadMemberName
      );
      if (leadSummary) {
        results.push(leadSummary);
      }
    }

    for (const sessionId of sessionIds) {
      const subagentsDir = path.join(projectDir, sessionId, 'subagents');

      let files: string[];
      try {
        files = await fs.readdir(subagentsDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.startsWith('agent-') || !file.endsWith('.jsonl')) continue;
        if (file.startsWith('agent-acompact')) continue;

        const filePath = path.join(subagentsDir, file);
        const summary = await this.parseSubagentSummary(
          filePath,
          projectId,
          sessionId,
          file,
          memberName,
          knownMembers
        );
        if (summary) results.push(summary);
      }
    }

    return results.sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  /**
   * Returns absolute paths to all JSONL files belonging to the specified member.
   * Uses the same discovery logic as findMemberLogs but collects file paths.
   */
  async findMemberLogPaths(teamName: string, memberName: string): Promise<string[]> {
    const discovery = await this.discoverMemberFiles(teamName, memberName);
    if (!discovery) return [];

    const { projectDir, projectId, config, sessionIds, knownMembers, isLeadMember } = discovery;
    const paths: string[] = [];

    if (isLeadMember && config.leadSessionId) {
      const leadJsonl = path.join(projectDir, `${config.leadSessionId}.jsonl`);
      try {
        await fs.access(leadJsonl);
        paths.push(leadJsonl);
      } catch {
        // File doesn't exist
      }
    }

    for (const sessionId of sessionIds) {
      const subagentsDir = path.join(projectDir, sessionId, 'subagents');

      let files: string[];
      try {
        files = await fs.readdir(subagentsDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.startsWith('agent-') || !file.endsWith('.jsonl')) continue;
        if (file.startsWith('agent-acompact')) continue;

        const filePath = path.join(subagentsDir, file);
        // Quick attribution check — reuse parseSubagentSummary to verify membership
        const summary = await this.parseSubagentSummary(
          filePath,
          projectId,
          sessionId,
          file,
          memberName,
          knownMembers
        );
        if (summary) paths.push(filePath);
      }
    }

    return paths;
  }

  private async discoverMemberFiles(
    teamName: string,
    memberName: string
  ): Promise<{
    projectDir: string;
    projectId: string;
    config: NonNullable<Awaited<ReturnType<TeamConfigReader['getConfig']>>>;
    sessionIds: string[];
    knownMembers: Set<string>;
    isLeadMember: boolean;
  } | null> {
    const config = await this.configReader.getConfig(teamName);
    if (!config?.projectPath) {
      logger.debug(`No projectPath for team "${teamName}"`);
      return null;
    }

    const normalizedProjectPath = trimTrailingSlashes(config.projectPath);
    const projectId = encodePath(normalizedProjectPath);
    const baseDir = extractBaseDir(projectId);
    const projectDir = path.join(getProjectsBasePath(), baseDir);

    const leadMemberName =
      config.members?.find((m) => m?.agentType === 'team-lead')?.name?.trim() || 'team-lead';
    const isLeadMember = leadMemberName.toLowerCase() === memberName.trim().toLowerCase();

    let sessionIds: string[];
    if (config.leadSessionId) {
      const leadDir = path.join(projectDir, config.leadSessionId);
      try {
        const stat = await fs.stat(leadDir);
        if (stat.isDirectory()) {
          sessionIds = [config.leadSessionId];
        } else {
          logger.debug(`leadSessionId dir is not a directory: ${leadDir}`);
          sessionIds = await this.listSessionDirs(projectDir);
        }
      } catch {
        logger.debug(`leadSessionId dir not found: ${leadDir}, falling back to full scan`);
        sessionIds = await this.listSessionDirs(projectDir);
      }
    } else {
      sessionIds = await this.listSessionDirs(projectDir);
    }

    const knownMembers = new Set<string>(
      (config.members ?? [])
        .map((member) => member.name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name && name.length > 0))
    );
    try {
      const metaMembers = await this.membersMetaStore.getMembers(teamName);
      for (const member of metaMembers) {
        const normalized = member.name.trim().toLowerCase();
        if (normalized.length > 0) {
          knownMembers.add(normalized);
        }
      }
    } catch {
      // Best-effort enrichment.
    }
    try {
      const inboxMembers = await this.inboxReader.listInboxNames(teamName);
      for (const memberNameFromInbox of inboxMembers) {
        const normalized = memberNameFromInbox.trim().toLowerCase();
        if (normalized.length > 0) {
          knownMembers.add(normalized);
        }
      }
    } catch {
      // Best-effort enrichment.
    }

    return { projectDir, projectId, config, sessionIds, knownMembers, isLeadMember };
  }

  private async listSessionDirs(projectDir: string): Promise<string[]> {
    try {
      const dirEntries = await fs.readdir(projectDir, { withFileTypes: true });
      return dirEntries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      logger.debug(`Cannot read project dir: ${projectDir}`);
      return [];
    }
  }

  private async parseSubagentSummary(
    filePath: string,
    projectId: string,
    sessionId: string,
    fileName: string,
    targetMember: string,
    knownMembers: Set<string>
  ): Promise<MemberSubagentLogSummary | null> {
    const subagentId = fileName.replace(/^agent-/, '').replace(/\.jsonl$/, '');
    const lines: string[] = [];

    try {
      const stream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      let count = 0;
      for await (const line of rl) {
        if (count >= MAX_LINES_TO_SCAN) break;
        const trimmed = line.trim();
        if (trimmed) {
          lines.push(trimmed);
          count++;
        }
      }
      rl.close();
      stream.destroy();
    } catch {
      return null;
    }

    if (lines.length === 0) return null;

    let firstTimestamp: string | null = null;
    let lastTimestamp: string | null = null;
    let messageCount = 0;
    let description = '';
    const targetLower = targetMember.toLowerCase();

    // Multi-signal member detection with priority levels:
    //   3 = routing sender (highest — directly identifies the agent)
    //   2 = "You are {name}" spawn prompt (high — reliable identification)
    //   1 = text-based fallback (low — may match wrong member from teammate_id etc.)
    let detectedMember: string | null = null;
    let detectionPriority = 0;

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;

        const role = this.extractRole(msg);
        const textContent = this.extractTextContent(msg);

        // Skip warmup messages
        if (role === 'user' && textContent?.trim() === 'Warmup') {
          return null;
        }

        // Track timestamps
        if (typeof msg.timestamp === 'string') {
          if (!firstTimestamp) firstTimestamp = msg.timestamp;
          lastTimestamp = msg.timestamp;
        }

        messageCount++;

        // Extract description from first user message
        if (role === 'user' && !description && textContent) {
          description = textContent.slice(0, 200);
        }

        // --- Multi-signal member detection ---
        // Higher priority signals override lower priority ones
        const detection = this.detectMemberFromMessage(msg, knownMembers);
        if (detection && detection.priority > detectionPriority) {
          detectedMember = detection.name;
          detectionPriority = detection.priority;
        }

        // Check toolUseResult routing (highest priority — directly identifies the agent)
        if (detectionPriority < 3 && msg.toolUseResult && typeof msg.toolUseResult === 'object') {
          const routing = (msg.toolUseResult as Record<string, unknown>).routing as
            | Record<string, unknown>
            | undefined;
          if (routing && typeof routing.sender === 'string') {
            const sender = routing.sender.toLowerCase();
            if (knownMembers.has(sender)) {
              detectedMember = routing.sender;
              detectionPriority = 3;
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Match: the detected member must match the target member
    if (detectedMember?.toLowerCase() !== targetLower) {
      return null;
    }

    if (!firstTimestamp) {
      // Fallback: use file mtime
      try {
        const stat = await fs.stat(filePath);
        firstTimestamp = stat.mtime.toISOString();
        lastTimestamp = firstTimestamp;
      } catch {
        firstTimestamp = new Date().toISOString();
        lastTimestamp = firstTimestamp;
      }
    }

    const startTime = new Date(firstTimestamp);
    const endTime = lastTimestamp ? new Date(lastTimestamp) : startTime;
    const durationMs = endTime.getTime() - startTime.getTime();

    // Check if the file might still be active (modified recently)
    let isOngoing = false;
    try {
      const stat = await fs.stat(filePath);
      const ageMs = Date.now() - stat.mtimeMs;
      isOngoing = ageMs < 60_000; // Active within last minute
    } catch {
      // ignore
    }

    return {
      kind: 'subagent',
      subagentId,
      sessionId,
      projectId,
      description: description || `Subagent ${subagentId}`,
      memberName: targetMember,
      startTime: firstTimestamp,
      durationMs: Math.max(0, durationMs),
      messageCount,
      isOngoing,
    };
  }

  /**
   * Detects the member name from a parsed JSONL message using multiple signals.
   * Returns a detection result with the name and a priority level:
   *   3 = routing sender (highest, handled outside this method)
   *   2 = "You are {name}" spawn prompt
   *   1 = text-based fallback (single member match or task assignment context)
   */
  private detectMemberFromMessage(
    msg: Record<string, unknown>,
    knownMembers: Set<string>
  ): { name: string; priority: number } | null {
    const text = this.extractTextContent(msg);
    if (!text) return null;

    // Signal 1 (priority 2): "You are {name}, a {role}" pattern (spawn prompt)
    const youAreMatch = /\bYou are (\w[\w-]*),\s+a\s+/i.exec(text);
    if (youAreMatch) {
      const name = youAreMatch[1].toLowerCase();
      if (knownMembers.has(name)) {
        return { name: youAreMatch[1], priority: 2 };
      }
    }

    // Signal 2 (priority 1): Task assignment — look for member name in the task content
    if (text.includes('New task assigned to you') || text.includes('task assigned')) {
      for (const name of knownMembers) {
        const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
        if (regex.test(text)) {
          return { name: findOriginalCase(text, name), priority: 1 };
        }
      }
    }

    // Signal 3 (priority 1): General fallback — check if exactly one known member
    // name appears in the first user message content (word-boundary match)
    if (msg.role === 'user') {
      const matches: string[] = [];
      for (const name of knownMembers) {
        const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
        if (regex.test(text)) {
          matches.push(name);
        }
      }
      // Only attribute if exactly one member matches (avoid ambiguity)
      if (matches.length === 1) {
        return { name: findOriginalCase(text, matches[0]), priority: 1 };
      }
    }

    return null;
  }

  private extractTextContent(msg: Record<string, unknown>): string | null {
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    if (Array.isArray(msg.content)) {
      const textParts = (msg.content as Record<string, unknown>[])
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text as string);
      if (textParts.length > 0) return textParts.join(' ');
    }
    // Also check message wrapper
    if (msg.message && typeof msg.message === 'object') {
      return this.extractTextContent(msg.message as Record<string, unknown>);
    }
    return null;
  }

  private extractRole(msg: Record<string, unknown>): string | null {
    if (typeof msg.role === 'string') {
      return msg.role;
    }
    if (msg.message && typeof msg.message === 'object') {
      const inner = msg.message as Record<string, unknown>;
      if (typeof inner.role === 'string') {
        return inner.role;
      }
    }
    return null;
  }

  private async parseLeadSessionSummary(
    jsonlPath: string,
    projectId: string,
    sessionId: string,
    memberName: string
  ): Promise<MemberLogSummary | null> {
    try {
      await fs.access(jsonlPath);
    } catch {
      return null;
    }

    let firstTimestamp: string | null = null;
    let lastTimestamp: string | null = null;
    let messageCount = 0;

    try {
      const stream = createReadStream(jsonlPath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let count = 0;
      for await (const line of rl) {
        if (count >= MAX_LINES_TO_SCAN) break;
        const trimmed = line.trim();
        if (!trimmed) continue;
        count++;
        messageCount++;
        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof msg.timestamp === 'string') {
            if (!firstTimestamp) firstTimestamp = msg.timestamp;
            lastTimestamp = msg.timestamp;
          }
        } catch {
          // ignore
        }
      }
      rl.close();
      stream.destroy();
    } catch {
      // ignore
    }

    if (!firstTimestamp) {
      try {
        const stat = await fs.stat(jsonlPath);
        firstTimestamp = stat.mtime.toISOString();
        lastTimestamp = firstTimestamp;
      } catch {
        firstTimestamp = new Date().toISOString();
        lastTimestamp = firstTimestamp;
      }
    }

    const startTime = new Date(firstTimestamp);
    const endTime = lastTimestamp ? new Date(lastTimestamp) : startTime;
    const durationMs = endTime.getTime() - startTime.getTime();

    let isOngoing = false;
    try {
      const stat = await fs.stat(jsonlPath);
      const ageMs = Date.now() - stat.mtimeMs;
      isOngoing = ageMs < 60_000;
    } catch {
      // ignore
    }

    return {
      kind: 'lead_session',
      sessionId,
      projectId,
      description: 'Lead session',
      memberName,
      startTime: firstTimestamp,
      durationMs: Math.max(0, durationMs),
      messageCount,
      isOngoing,
    };
  }
}

function findOriginalCase(text: string, lowerName: string): string {
  const regex = new RegExp(`\\b(${escapeRegex(lowerName)})\\b`, 'i');
  const match = regex.exec(text);
  return match ? match[1] : lowerName;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
