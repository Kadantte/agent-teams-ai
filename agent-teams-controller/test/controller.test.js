const fs = require('fs');
const os = require('os');
const path = require('path');

const { createController } = require('../src/index.js');

describe('agent-teams-controller API', () => {
  function makeClaudeDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-teams-controller-'));
    fs.mkdirSync(path.join(dir, 'teams', 'my-team'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tasks', 'my-team'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'teams', 'my-team', 'config.json'),
      JSON.stringify(
        {
          name: 'my-team',
          members: [
            { name: 'alice', role: 'team-lead' },
            { name: 'bob', role: 'developer' },
          ],
        },
        null,
        2
      )
    );
    return dir;
  }

  it('creates tasks and exposes grouped controller modules', () => {
    const claudeDir = makeClaudeDir();
    const controller = createController({ teamName: 'my-team', claudeDir });

    controller.tasks.createTask({ subject: 'Base task' });
    controller.tasks.createTask({ subject: 'Dependency task' });
    const created = controller.tasks.createTask({
      subject: 'Blocked task',
      owner: 'bob',
      'blocked-by': '1,2',
      related: '1',
    });

    expect(created.id).toBe('3');
    expect(created.status).toBe('pending');
    expect(controller.tasks.getTask('1').blocks).toEqual(['3']);
    expect(controller.tasks.getTask('3').blockedBy).toEqual(['1', '2']);

    controller.kanban.addReviewer('alice');
    controller.kanban.setKanbanColumn('3', 'review');
    controller.review.approveReview('3', { 'notify-owner': true, from: 'alice' });

    const kanbanState = controller.kanban.getKanbanState();
    expect(kanbanState.reviewers).toEqual(['alice']);
    expect(kanbanState.tasks['3'].column).toBe('approved');

    const proc = controller.processes.registerProcess({
      pid: process.pid,
      label: 'dev-server',
      port: '3000',
    });
    expect(proc.port).toBe(3000);
    expect(controller.processes.listProcesses()).toHaveLength(1);
  });
});
