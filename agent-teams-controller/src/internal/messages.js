const legacy = require('../legacy/teamctl.cli.js');

function sendMessage(context, flags) {
  return legacy.sendInboxMessage(context.paths, context.teamName, flags);
}

module.exports = {
  sendMessage,
};
