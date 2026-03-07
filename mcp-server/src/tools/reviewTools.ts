import type { FastMCP } from 'fastmcp';
import { z } from 'zod';

import { getController } from '../controller';
import { jsonTextContent } from '../utils/format';

const toolContextSchema = {
  teamName: z.string().min(1),
  claudeDir: z.string().min(1).optional(),
};

export function registerReviewTools(server: Pick<FastMCP, 'addTool'>) {
  server.addTool({
    name: 'review_approve',
    description: 'Approve task review and move kanban state accordingly',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      from: z.string().optional(),
      note: z.string().optional(),
      notifyOwner: z.boolean().optional(),
    }),
    execute: async ({ teamName, claudeDir, taskId, from, note, notifyOwner }) =>
      jsonTextContent(
        getController(teamName, claudeDir).review.approveReview(taskId, {
          ...(from ? { from } : {}),
          ...(note ? { note } : {}),
          ...(notifyOwner !== false ? { 'notify-owner': true } : {}),
        })
      ),
  });

  server.addTool({
    name: 'review_request_changes',
    description: 'Request changes on a task under review',
    parameters: z.object({
      ...toolContextSchema,
      taskId: z.string().min(1),
      from: z.string().optional(),
      comment: z.string().optional(),
    }),
    execute: async ({ teamName, claudeDir, taskId, from, comment }) =>
      jsonTextContent(
        getController(teamName, claudeDir).review.requestChanges(taskId, {
          ...(from ? { from } : {}),
          ...(comment ? { comment } : {}),
        })
      ),
  });
}
