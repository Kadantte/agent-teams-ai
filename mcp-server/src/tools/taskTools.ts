import type { FastMCP } from 'fastmcp';
import { z } from 'zod';

import { getController } from '../controller';
import { jsonTextContent } from '../utils/format';

const toolContextSchema = {
  teamName: z.string().min(1),
  claudeDir: z.string().min(1).optional(),
};

const relationshipTypeSchema = z.enum(['blocked-by', 'blocks', 'related']);

/** Agent-only block tag used for hidden instructions — must be stripped from provenance snapshots. */
const AGENT_BLOCK_RE = /<info_for_agent>[\s\S]*?<\/info_for_agent>/g;

/** Allowed message source types for task_create_from_message provenance. Fail closed — only explicit user-originated sources. */
const USER_ORIGINATED_SOURCES = new Set(['user_sent', 'inbox']);

/**
 * Shared payload builder for both task_create and task_create_from_message.
 * Keeps the canonical create-task shape in one place to avoid divergence.
 */
function buildCreateTaskPayload(params: {
  subject: string;
  description?: string;
  owner?: string;
  createdBy?: string;
  from?: string;
  blockedBy?: string[];
  related?: string[];
  prompt?: string;
  startImmediately?: boolean;
  sourceMessageId?: string;
  sourceMessage?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    subject: params.subject,
    ...(params.description ? { description: params.description } : {}),
    ...(params.owner ? { owner: params.owner } : {}),
    ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    ...(!params.createdBy && params.from ? { from: params.from } : {}),
    ...(params.blockedBy?.length ? { 'blocked-by': params.blockedBy.join(',') } : {}),
    ...(params.related?.length ? { related: params.related.join(',') } : {}),
    ...(params.prompt ? { prompt: params.prompt } : {}),
    ...(params.startImmediately !== undefined ? { startImmediately: params.startImmediately } : {}),
    ...(params.sourceMessageId ? { sourceMessageId: params.sourceMessageId } : {}),
    ...(params.sourceMessage ? { sourceMessage: params.sourceMessage } : {}),
  };
}

/**
 * Strip agent-only `<info_for_agent>` blocks from message text.
 * Returns trimmed text with agent blocks removed.
 */
function stripAgentBlocks(text: string): string {
  return text.replace(AGENT_BLOCK_RE, '').trim();
}

export function registerTaskTools(server: Pick<FastMCP, 'addTool'>) {
  server.addTool({
    name: 'task_create',
    description: 'Create a team task',
    parameters: z.object({
      ...toolContextSchema,
      subject: z.string().min(1),
      description: z.string().optional(),
      owner: z.string().optional(),
      createdBy: z.string().optional(),
      from: z.string().optional(),
      blockedBy: z.array(z.string().min(1)).optional(),
      related: z.array(z.string().min(1)).optional(),
      prompt: z.string().optional(),
      startImmediately: z.boolean().optional(),
    }),
    execute: async ({
      teamName,
      claudeDir,
      subject,
      description,
      owner,
      createdBy,
      from,
      blockedBy,
      related,
      prompt,
      startImmediately,
    }) => {
      const controller = getController(teamName, claudeDir);
      return await Promise.resolve(
        jsonTextContent(
          controller.tasks.createTask(
            buildCreateTaskPayload({
              subject,
              description,
              owner,
              createdBy,
              from,
              blockedBy,
              related,
              prompt,
              startImmediately,
            })
          )
        )
      );
    },
  });

  server.addTool({
    name: 'task_create_from_message',
    description:
      'Create a task from a persisted user message. Resolves the message by exact messageId, builds sanitized provenance, and creates the task through the canonical path.',
    parameters: z.object({
      ...toolContextSchema,
      messageId: z.string().min(1),
      subject: z.string().min(1),
      description: z.string().optional(),
      owner: z.string().optional(),
      blockedBy: z.array(z.string().min(1)).optional(),
      related: z.array(z.string().min(1)).optional(),
      prompt: z.string().optional(),
      startImmediately: z.boolean().optional(),
    }),
    execute: async ({
      teamName,
      claudeDir,
      messageId,
      subject,
      description,
      owner,
      blockedBy,
      related,
      prompt,
      startImmediately,
    }) => {
      const controller = getController(teamName, claudeDir);

      // 1. Lookup message by exact messageId
      const { message } = controller.messages.lookupMessage(messageId);

      // 2. Reject if message source is not user-originated
      const source = typeof message.source === 'string' ? message.source : '';
      if (!USER_ORIGINATED_SOURCES.has(source)) {
        throw new Error(
          `Message source "${source}" is not user-originated. Only user_sent and inbox messages are eligible.`
        );
      }

      // 3. Reject relay copies explicitly
      if (typeof message.relayOfMessageId === 'string' && message.relayOfMessageId.trim()) {
        throw new Error(
          'Cannot create task from a relay copy. Use the original message instead.'
        );
      }

      // 4. Build sanitized source snapshot
      const rawText = typeof message.text === 'string' ? message.text : '';
      const sanitizedText = stripAgentBlocks(rawText);

      const sourceMessage: Record<string, unknown> = {
        text: sanitizedText,
        from: typeof message.from === 'string' ? message.from : 'unknown',
        timestamp: typeof message.timestamp === 'string' ? message.timestamp : '',
        ...(source ? { source } : {}),
      };

      // Preserve attachment metadata by reference only — no blob copying
      if (Array.isArray(message.attachments) && message.attachments.length > 0) {
        sourceMessage.attachments = (message.attachments as Array<Record<string, unknown>>)
          .filter(
            (a) =>
              a &&
              typeof a === 'object' &&
              typeof a.id === 'string' &&
              typeof a.filename === 'string'
          )
          .map((a) => ({
            id: String(a.id),
            filename: String(a.filename),
            mimeType: typeof a.mimeType === 'string' ? a.mimeType : '',
            size: typeof a.size === 'number' ? a.size : 0,
          }));
      }

      // 5. Forward into canonical create-task path
      return await Promise.resolve(
        jsonTextContent(
          controller.tasks.createTask(
            buildCreateTaskPayload({
              subject,
              description,
              owner,
              blockedBy,
              related,
              prompt,
              startImmediately,
              sourceMessageId: messageId,
              sourceMessage,
            })
          )
        )
      );
    },
  });

  server.addTool({
    name: 'task_get',
    description: 'Get a task by id',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
    }),
    execute: async ({ teamName, claudeDir, taskId }) =>
      await Promise.resolve(jsonTextContent(getController(teamName, claudeDir).tasks.getTask(taskId))),
  });

  server.addTool({
    name: 'task_list',
    description: 'List tasks for a team',
    parameters: z.object({
      ...toolContextSchema,
    }),
    execute: async ({ teamName, claudeDir }) =>
      await Promise.resolve(jsonTextContent(getController(teamName, claudeDir).tasks.listTasks())),
  });

  server.addTool({
    name: 'task_set_status',
    description: 'Set task work status',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      status: z.enum(['pending', 'in_progress', 'completed', 'deleted']),
      actor: z.string().optional(),
    }),
    execute: async ({ teamName, claudeDir, taskId, status, actor }) =>
      await Promise.resolve(
        jsonTextContent(getController(teamName, claudeDir).tasks.setTaskStatus(taskId, status, actor))
      ),
  });

  server.addTool({
    name: 'task_start',
    description: 'Mark task as in progress',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      actor: z.string().optional(),
    }),
    execute: async ({ teamName, claudeDir, taskId, actor }) =>
      await Promise.resolve(jsonTextContent(getController(teamName, claudeDir).tasks.startTask(taskId, actor))),
  });

  server.addTool({
    name: 'task_complete',
    description: 'Mark task as completed',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      actor: z.string().optional(),
    }),
    execute: async ({ teamName, claudeDir, taskId, actor }) =>
      await Promise.resolve(
        jsonTextContent(getController(teamName, claudeDir).tasks.completeTask(taskId, actor))
      ),
  });

  server.addTool({
    name: 'task_set_owner',
    description: 'Assign or clear task owner',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      owner: z.string().nullable(),
    }),
    execute: async ({ teamName, claudeDir, taskId, owner }) =>
      await Promise.resolve(
        jsonTextContent(getController(teamName, claudeDir).tasks.setTaskOwner(taskId, owner))
      ),
  });

  server.addTool({
    name: 'task_add_comment',
    description: 'Add task comment',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      text: z.string().min(1),
      from: z.string().optional(),
    }),
    execute: async ({ teamName, claudeDir, taskId, text, from }) =>
      await Promise.resolve(
        jsonTextContent(
          getController(teamName, claudeDir).tasks.addTaskComment(taskId, {
          text,
          ...(from ? { from } : {}),
          })
        )
      ),
  });

  server.addTool({
    name: 'task_attach_file',
    description: 'Attach a file to a task',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      filePath: z.string().min(1),
      mode: z.enum(['copy', 'link']).optional(),
      filename: z.string().optional(),
      mimeType: z.string().optional(),
      noFallback: z.boolean().optional(),
    }),
    execute: async ({
      teamName,
      claudeDir,
      taskId,
      filePath,
      mode,
      filename,
      mimeType,
      noFallback,
    }) =>
      await Promise.resolve(
        jsonTextContent(
          getController(teamName, claudeDir).tasks.attachTaskFile(taskId, {
          file: filePath,
          ...(mode ? { mode } : {}),
          ...(filename ? { filename } : {}),
          ...(mimeType ? { 'mime-type': mimeType } : {}),
          ...(noFallback ? { 'no-fallback': true } : {}),
          })
        )
      ),
  });

  server.addTool({
    name: 'task_attach_comment_file',
    description: 'Attach a file to a task comment',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      commentId: z.string().min(1),
      filePath: z.string().min(1),
      mode: z.enum(['copy', 'link']).optional(),
      filename: z.string().optional(),
      mimeType: z.string().optional(),
      noFallback: z.boolean().optional(),
    }),
    execute: async ({
      teamName,
      claudeDir,
      taskId,
      commentId,
      filePath,
      mode,
      filename,
      mimeType,
      noFallback,
    }) =>
      await Promise.resolve(
        jsonTextContent(
          getController(teamName, claudeDir).tasks.attachCommentFile(taskId, commentId, {
          file: filePath,
          ...(mode ? { mode } : {}),
          ...(filename ? { filename } : {}),
          ...(mimeType ? { 'mime-type': mimeType } : {}),
          ...(noFallback ? { 'no-fallback': true } : {}),
          })
        )
      ),
  });

  server.addTool({
    name: 'task_set_clarification',
    description: 'Set or clear task clarification state',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      value: z.enum(['lead', 'user', 'clear']),
    }),
    execute: async ({ teamName, claudeDir, taskId, value }) =>
      await Promise.resolve(
        jsonTextContent(
          getController(teamName, claudeDir).tasks.setNeedsClarification(
          taskId,
          value === 'clear' ? null : value
          )
        )
      ),
  });

  server.addTool({
    name: 'task_link',
    description: 'Link tasks by blockedBy, blocks, or related relationship',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      targetId: z.string().min(1),
      relationship: relationshipTypeSchema,
    }),
    execute: async ({ teamName, claudeDir, taskId, targetId, relationship }) =>
      await Promise.resolve(
        jsonTextContent(getController(teamName, claudeDir).tasks.linkTask(taskId, targetId, relationship))
      ),
  });

  server.addTool({
    name: 'task_unlink',
    description: 'Remove task relationship link',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      targetId: z.string().min(1),
      relationship: relationshipTypeSchema,
    }),
    execute: async ({ teamName, claudeDir, taskId, targetId, relationship }) =>
      await Promise.resolve(
        jsonTextContent(
          getController(teamName, claudeDir).tasks.unlinkTask(taskId, targetId, relationship)
        )
      ),
  });

  server.addTool({
    name: 'member_briefing',
    description: 'Get bootstrap briefing for a team member',
    parameters: z.object({
      ...toolContextSchema,
      memberName: z.string().min(1),
    }),
    execute: async ({ teamName, claudeDir, memberName }) => ({
      content: [
        {
          type: 'text' as const,
          text: await getController(teamName, claudeDir).tasks.memberBriefing(memberName),
        },
      ],
    }),
  });

  server.addTool({
    name: 'task_briefing',
    description: 'Get formatted task briefing for a member',
    parameters: z.object({
      ...toolContextSchema,
      memberName: z.string().min(1),
    }),
    execute: async ({ teamName, claudeDir, memberName }) => ({
      content: [
        {
          type: 'text' as const,
          text: await getController(teamName, claudeDir).tasks.taskBriefing(memberName),
        },
      ],
    }),
  });
}
