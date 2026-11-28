#!/usr/bin/env node
/** Standalone Coral CLI entry point (`bin.coral` on `@coral-viz/render`). */
import { readFile } from 'node:fs/promises';
import { runCoralCli, type CoralCliIo } from './cliMain.js';

const io: CoralCliIo = {
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  },
  readFileText: (filePath: string) => readFile(filePath, 'utf8'),
  writeStdout: (text: string) => {
    process.stdout.write(text);
  },
  writeStderr: (text: string) => {
    process.stderr.write(text);
  },
};

const exitCode = await runCoralCli(process.argv.slice(2), io);
process.exitCode = exitCode;
