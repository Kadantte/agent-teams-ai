const legacy = require('../legacy/teamctl.cli.js');
const { captureStreamOutput } = require('./capture.js');

function createTask(context, flags) {
  return legacy.createTask(context.paths, flags);
}

function getTask(context, taskId) {
  return legacy.readTask(context.paths, String(taskId)).task;
}

function listTasks(context) {
  return legacy.listTaskIds(context.paths.tasksDir).map((taskId) => getTask(context, taskId));
}

function setTaskStatus(context, taskId, status, actor) {
  legacy.setTaskStatus(context.paths, String(taskId), String(status), actor);
  return getTask(context, taskId);
}

function startTask(context, taskId, actor) {
  return setTaskStatus(context, taskId, 'in_progress', actor);
}

function completeTask(context, taskId, actor) {
  return setTaskStatus(context, taskId, 'completed', actor);
}

function setTaskOwner(context, taskId, owner) {
  return legacy.setTaskOwner(
    context.paths,
    String(taskId),
    owner == null || owner === 'clear' || owner === 'none' ? null : String(owner)
  );
}

function addTaskComment(context, taskId, flags) {
  const result = legacy.addTaskComment(context.paths, String(taskId), flags);
  return {
    ...result,
    task: getTask(context, taskId),
  };
}

function attachTaskFile(context, taskId, flags) {
  const saved = legacy.saveTaskAttachmentFile(context.paths, String(taskId), flags);
  legacy.addAttachmentToTask(context.paths, String(taskId), saved.meta);
  return saved.meta;
}

function attachCommentFile(context, taskId, commentId, flags) {
  const saved = legacy.saveTaskAttachmentFile(context.paths, String(taskId), flags);
  legacy.addAttachmentToComment(context.paths, String(taskId), String(commentId), saved.meta);
  return saved.meta;
}

function setNeedsClarification(context, taskId, value) {
  const normalized = value == null ? 'clear' : String(value);
  legacy.setNeedsClarification(context.paths, String(taskId), normalized);
  return getTask(context, taskId);
}

function linkTask(context, taskId, targetId, linkType) {
  legacy.linkTasks(context.paths, String(taskId), String(targetId), String(linkType));
  return getTask(context, taskId);
}

function unlinkTask(context, taskId, targetId, linkType) {
  legacy.unlinkTasks(context.paths, String(taskId), String(targetId), String(linkType));
  return getTask(context, taskId);
}

async function taskBriefing(context, memberName) {
  const { output } = await captureStreamOutput(process.stdout, () =>
    legacy.taskBriefing(context.paths, context.teamName, { for: memberName })
  );
  return output;
}

module.exports = {
  createTask,
  getTask,
  listTasks,
  setTaskStatus,
  startTask,
  completeTask,
  setTaskOwner,
  addTaskComment,
  attachTaskFile,
  attachCommentFile,
  setNeedsClarification,
  linkTask,
  unlinkTask,
  taskBriefing,
};
