import { spawn, StdioOptions } from 'child_process';
import fs from 'fs';

const isWindows = process.platform === 'win32';

export const args = process.argv.splice(2);

export const runShellCommand = (command, args, dir) => {
  const cmd = isWindows ? `${command}.cmd` : command;
  const options = {
    cwd: dir,
    detached: true,
    stdio: 'inherit' as StdioOptions
  };

  return new Promise((resolve) => {
    const childProcess = spawn(cmd, [args], options);
    childProcess.on('close', () => {
      resolve();
    });
  });
};

export const makeDir = (name) => {
  if (!fs.existsSync(name)) {
    fs.mkdirSync(name);
  }
};