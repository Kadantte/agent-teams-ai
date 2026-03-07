import type { FastMCP } from 'fastmcp';
import { z } from 'zod';

import { getController } from '../controller';
import { jsonTextContent } from '../utils/format';

const toolContextSchema = {
  teamName: z.string().min(1),
  claudeDir: z.string().min(1).optional(),
};

export function registerMessageTools(server: Pick<FastMCP, 'addTool'>) {
  server.addTool({
    name: 'message_send',
    description: 'Send a message into team inbox',
    parameters: z.object({
      ...toolContextSchema,
      to: z.string().min(1),
      text: z.string().min(1),
      from: z.string().optional(),
      summary: z.string().optional(),
    }),
    execute: async ({ teamName, claudeDir, to, text, from, summary }) =>
      jsonTextContent(
        getController(teamName, claudeDir).messages.sendMessage({
          to,
          text,
          ...(from ? { from } : {}),
          ...(summary ? { summary } : {}),
        })
      ),
  });
}
