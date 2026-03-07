const legacy = require('../legacy/teamctl.cli.js');
const tasks = require('./tasks.js');

function approveReview(context, taskId, flags = {}) {
  legacy.reviewApprove(context.paths, context.teamName, String(taskId), flags);
  return tasks.getTask(context, taskId);
}

function requestChanges(context, taskId, flags = {}) {
  legacy.reviewRequestChanges(context.paths, context.teamName, String(taskId), flags);
  return tasks.getTask(context, taskId);
}

module.exports = {
  approveReview,
  requestChanges,
};
