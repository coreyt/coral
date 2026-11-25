import assert from 'node:assert/strict';
import test from 'node:test';
import { npmCommand } from './npm-command.mjs';

test('npm launch uses the active CLI with literal arguments, not a Windows shell', () => {
  const args = ['install', 'a path with spaces', 'literal&argument'];
  assert.deepEqual(npmCommand(args, {
    platform: 'win32', execPath: 'C:\\Node\\node.exe', env: { npm_execpath: 'C:\\npm 12\\npm-cli.js' },
  }), { command: 'C:\\Node\\node.exe', args: ['C:\\npm 12\\npm-cli.js', ...args] });
});

test('standalone Windows npm launch finds CLI beside Node or PATH shims', () => {
  const options = { platform: 'win32', execPath: 'C:\\Node\\node.exe', env: {} };
  assert.deepEqual(npmCommand(['--version'], {
    ...options, fileExists: path => path === 'C:\\Node\\node_modules\\npm\\bin\\npm-cli.js',
    findNpm: () => '',
  }), { command: options.execPath, args: ['C:\\Node\\node_modules\\npm\\bin\\npm-cli.js', '--version'] });
  assert.deepEqual(npmCommand(['--version'], {
    ...options, fileExists: path => path === 'C:\\npm 12\\node_modules\\npm\\bin\\npm-cli.js',
    findNpm: () => 'C:\\npm 12\\npm\r\nC:\\npm 12\\npm.cmd\r\n',
  }), { command: options.execPath, args: ['C:\\npm 12\\node_modules\\npm\\bin\\npm-cli.js', '--version'] });
  assert.throws(() => npmCommand([], { ...options, fileExists: () => false, findNpm: () => '' }), /npm CLI/);
});

test('standalone npm follows PATH ahead of a different bundled npm beside Node', () => {
  assert.deepEqual(npmCommand(['--version'], {
    platform: 'win32', execPath: 'C:\\Node\\node.exe', env: {}, fileExists: () => true,
    findNpm: () => 'C:\\npm 12\\npm.cmd\r\nC:\\Node\\npm.cmd\r\n',
  }), { command: 'C:\\Node\\node.exe', args: ['C:\\npm 12\\node_modules\\npm\\bin\\npm-cli.js', '--version'] });
});

test('standalone Unix npm keeps executable launch', () => {
  assert.deepEqual(npmCommand(['audit'], { platform: 'linux', env: {} }), { command: 'npm', args: ['audit'] });
});
