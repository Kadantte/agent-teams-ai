import fs from 'fs';
import os from 'os';
import path from 'path';

import { registerTools } from '../src/tools';

type RegisteredTool = {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
};

function collectTools() {
  const tools = new Map<string, RegisteredTool>();

  registerTools({
    addTool(config: RegisteredTool) {
      tools.set(config.name, config);
    },
  } as never);

  return tools;
}

function parseJsonToolResult(result: unknown) {
  const text = (result as { content: Array<{ text: string }> }).content[0]?.text;
  return JSON.parse(text);
}

describe('agent-teams-mcp tools', () => {
  const tools = collectTools();

  function getTool(name: string) {
    const tool = tools.get(name);
    expect(tool).toBeDefined();
    return tool!;
  }

  function makeClaudeDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-teams-mcp-'));
  }

  it('covers task clarification and comment attachment flows', async () => {
    const claudeDir = makeClaudeDir();
    const teamName = 'alpha';
    const attachmentPath = path.join(claudeDir, 'note.txt');
    fs.writeFileSync(attachmentPath, 'ship it');

    const createdTask = parseJsonToolResult(
      await getTool('task_create').execute({
        claudeDir,
        teamName,
        subject: 'Review MCP adapter',
        owner: 'alice',
      })
    );

    const commented = parseJsonToolResult(
      await getTool('task_add_comment').execute({
        claudeDir,
        teamName,
        taskId: createdTask.id,
        text: 'Need one more check',
        from: 'lead',
      })
    );

    const commentId = commented.commentId;
    expect(commentId).toBeTruthy();

    const attachment = parseJsonToolResult(
      await getTool('task_attach_comment_file').execute({
        claudeDir,
        teamName,
        taskId: createdTask.id,
        commentId,
        filePath: attachmentPath,
        mode: 'copy',
      })
    );

    expect(attachment.filename).toBe('note.txt');

    await getTool('task_set_clarification').execute({
      claudeDir,
      teamName,
      taskId: createdTask.id,
      value: 'user',
    });

    const loadedTask = parseJsonToolResult(
      await getTool('task_get').execute({
        claudeDir,
        teamName,
        taskId: createdTask.id,
      })
    );

    expect(loadedTask.needsClarification).toBe('user');
    expect(loadedTask.comments).toHaveLength(1);
    expect(loadedTask.comments[0].attachments).toHaveLength(1);
  });

  it('covers process register/list/unregister without legacy stdout leaking into results', async () => {
    const claudeDir = makeClaudeDir();
    const teamName = 'beta';

    const registered = parseJsonToolResult(
      await getTool('process_register').execute({
        claudeDir,
        teamName,
        pid: 43210,
        label: 'vite',
        command: 'pnpm dev',
        from: 'lead',
        port: 3000,
      })
    );

    expect(registered.pid).toBe(43210);
    expect(registered.label).toBe('vite');

    const listed = parseJsonToolResult(
      await getTool('process_list').execute({
        claudeDir,
        teamName,
      })
    );

    expect(listed).toHaveLength(1);
    expect(listed[0].pid).toBe(43210);

    const afterUnregister = parseJsonToolResult(
      await getTool('process_unregister').execute({
        claudeDir,
        teamName,
        pid: 43210,
      })
    );

    expect(afterUnregister).toEqual([]);
  });
});
