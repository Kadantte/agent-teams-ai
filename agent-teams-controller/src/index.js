const fs = require('fs');
const path = require('path');
const controller = require('./controller.js');

function getLegacyTeamctlCliPath() {
  return path.join(__dirname, 'legacy', 'teamctl.cli.js');
}

function readLegacyTeamctlCliSource() {
  return fs.readFileSync(getLegacyTeamctlCliPath(), 'utf8');
}

module.exports = {
  ...controller,
  getLegacyTeamctlCliPath,
  readLegacyTeamctlCliSource,
};
