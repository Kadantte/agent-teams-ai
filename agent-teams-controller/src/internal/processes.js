const legacy = require('../legacy/teamctl.cli.js');
const { captureStreamOutput } = require('./capture.js');

function registerProcess(context, flags) {
  captureStreamOutput(process.stdout, () => legacy.processRegister(context.paths, flags));
  return listProcesses(context).find((entry) => entry.pid === Number(flags.pid)) || null;
}

function unregisterProcess(context, flags) {
  captureStreamOutput(process.stdout, () => legacy.processUnregister(context.paths, flags));
  return listProcesses(context);
}

function listProcesses(context) {
  return legacy.readProcessesSafe(context.paths.processesPath).map((entry) => ({
    ...entry,
    alive: Number.isFinite(Number(entry && entry.pid))
      ? legacy.isProcessAlive(Number(entry.pid))
      : false,
  }));
}

module.exports = {
  registerProcess,
  unregisterProcess,
  listProcesses,
};
