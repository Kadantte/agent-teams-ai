const legacy = require('../legacy/teamctl.cli.js');

function getKanbanState(context) {
  return legacy.readKanbanState(context.paths, context.teamName);
}

function setKanbanColumn(context, taskId, column) {
  legacy.setKanbanColumn(context.paths, context.teamName, String(taskId), String(column));
  return getKanbanState(context);
}

function clearKanban(context, taskId) {
  legacy.clearKanban(context.paths, context.teamName, String(taskId));
  return getKanbanState(context);
}

function listReviewers(context) {
  return getKanbanState(context).reviewers;
}

function addReviewer(context, reviewer) {
  const state = getKanbanState(context);
  const next = new Set(state.reviewers);
  next.add(String(reviewer));
  legacy.writeKanbanState(context.paths, {
    ...state,
    reviewers: [...next],
  });
  return listReviewers(context);
}

function removeReviewer(context, reviewer) {
  const state = getKanbanState(context);
  const next = state.reviewers.filter((entry) => entry !== reviewer);
  legacy.writeKanbanState(context.paths, {
    ...state,
    reviewers: next,
  });
  return listReviewers(context);
}

module.exports = {
  getKanbanState,
  setKanbanColumn,
  clearKanban,
  listReviewers,
  addReviewer,
  removeReviewer,
};
