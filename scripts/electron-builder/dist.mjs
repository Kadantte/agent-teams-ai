#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const PLATFORM_FLAGS = new Map([
  ['--mac', 'mac'],
  ['-m', 'mac'],
  ['--win', 'win'],
  ['-w', 'win'],
  ['--linux', 'linux'],
  ['-l', 'linux'],
]);

const PLATFORM_ARGS = {
  mac: '--mac',
  win: '--win',
  linux: '--linux',
};

const LINUX_PACKAGE_NAME_OVERRIDES = [
  '--config.productName=Agent-Teams-UI',
  '--config.linux.desktop.entry.Name=Agent Teams UI',
];

export function buildElectronBuilderInvocations(argv) {
  const targets = [];
  const sharedArgs = [];

  for (const arg of argv) {
    const target = PLATFORM_FLAGS.get(arg);
    if (target) {
      if (!targets.includes(target)) {
        targets.push(target);
      }
      continue;
    }
    sharedArgs.push(arg);
  }

  if (targets.length === 0) {
    return [{ args: sharedArgs }];
  }

  return targets.map((target) => ({
    args: [
      PLATFORM_ARGS[target],
      ...sharedArgs,
      ...(target === 'linux' ? LINUX_PACKAGE_NAME_OVERRIDES : []),
    ],
  }));
}

async function runElectronBuilder(args) {
  const cliPath = require.resolve('electron-builder/cli.js');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`electron-builder failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

async function main(argv) {
  const invocations = buildElectronBuilderInvocations(argv);

  if (process.env.ELECTRON_BUILDER_DIST_DRY_RUN === '1') {
    console.log(
      JSON.stringify(
        invocations.map((invocation) => invocation.args),
        null,
        2
      )
    );
    return;
  }

  for (const invocation of invocations) {
    await runElectronBuilder(invocation.args);
  }
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPointUrl === import.meta.url) {
  await main(process.argv.slice(2));
}
