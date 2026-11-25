import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('built MCP server', () => {
  it('starts on stdio and identifies itself as Coral', ({ skip }) => {
    const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
    const child = spawnSync(process.execPath, [entry], { input: '', encoding: 'utf8' });
    if ((child.error as NodeJS.ErrnoException | undefined)?.code === 'EPERM') {
      skip('The local sandbox blocks child processes; CI executes this test.');
    }
    expect(child.status).toBe(0);
    expect(child.stderr).toContain('Coral MCP Server running on stdio');
  });
});
