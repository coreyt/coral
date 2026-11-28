import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_VERSION, runCoralCli, type CoralCliIo } from '../src/cliMain.js';

function createMemoryIo(stdinText: string, files: Record<string, string> = {}) {
  let stdout = '';
  let stderr = '';
  const io: CoralCliIo = {
    readStdin: async () => stdinText,
    readFileText: async (filePath) => {
      if (filePath in files) return files[filePath]!;
      throw new Error(`ENOENT: no such file "${filePath}"`);
    },
    writeStdout: (chunk) => {
      stdout += chunk;
    },
    writeStderr: (chunk) => {
      stderr += chunk;
    },
  };
  return {
    io,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

const VALID_ARCH_028 = [
  '@diagram architecture',
  'api service as "API"',
  'db database as "Database"',
  'api -> db [reads]',
  '',
].join('\n');

const VALID_STATE_0217 = [
  '@diagram uml-state',
  '@coralVersion "0.2.17"',
  's initial',
  'Active composite as "Active" {',
  '  i initial',
  '  Run state as "Run"',
  '  i -> Run',
  '}',
  'done final',
  's -> Active',
  'Active -> done',
  '',
].join('\n');

describe('Coral CLI (bin.coral on @coral-viz/render)', () => {
  it('prints help and version with exit code 0', async () => {
    const help = createMemoryIo('');
    expect(await runCoralCli(['--help'], help.io)).toBe(0);
    expect(help.getStdout()).toContain('coral validate');
    expect(help.getStderr()).toBe('');

    const ver = createMemoryIo('');
    expect(await runCoralCli(['--version'], ver.io)).toBe(0);
    expect(ver.getStdout().trim()).toBe(CLI_VERSION);
    expect(ver.getStderr()).toBe('');
  });

  it('returns exit code 2 and empty stdout on invalid command usage', async () => {
    for (const argv of [
      [],
      ['bogus'],
      ['validate', '--unknown'],
      ['validate', 'a.coral', 'b.coral'],
      ['render'],
      ['render', '--format', 'pdf'],
      ['render', '--format', 'svg', '--style', 'neon'],
      ['render', '--format', 'svg', '--theme', 'sepia'],
      ['render', '--format', 'ascii', '--columns', '60'],
      ['convert', '--from', 'yaml', '--to', 'coral'],
      ['convert', '--from', 'mermaid', '--to', 'svg'],
    ]) {
      const mem = createMemoryIo('');
      const code = await runCoralCli(argv, mem.io);
      expect(code, `argv=${argv.join(' ')}`).toBe(2);
      expect(mem.getStdout()).toBe('');
      expect(mem.getStderr()).toContain('Usage error:');
    }
  });

  it('validates saved Coral from stdin, "-", and file path with empty stdout on success', async () => {
    const fromStdin = createMemoryIo(VALID_ARCH_028);
    expect(await runCoralCli(['validate'], fromStdin.io)).toBe(0);
    expect(fromStdin.getStdout()).toBe('');
    expect(fromStdin.getStderr()).toBe('');

    const fromDash = createMemoryIo(VALID_STATE_0217);
    expect(await runCoralCli(['validate', '-'], fromDash.io)).toBe(0);
    expect(fromDash.getStdout()).toBe('');
    expect(fromDash.getStderr()).toBe('');

    const fromFile = createMemoryIo('', { 'sample.coral': VALID_ARCH_028 });
    expect(await runCoralCli(['validate', 'sample.coral'], fromFile.io)).toBe(0);
    expect(fromFile.getStdout()).toBe('');
    expect(fromFile.getStderr()).toBe('');
  });

  it('reports diagnostics on stderr and exit 1 for invalid Coral or missing file', async () => {
    const bad = createMemoryIo('api service\n');
    expect(await runCoralCli(['validate'], bad.io)).toBe(1);
    expect(bad.getStdout()).toBe('');
    expect(bad.getStderr()).toContain('header.diagram.required');

    const missing = createMemoryIo('');
    expect(await runCoralCli(['validate', 'missing.coral'], missing.io)).toBe(1);
    expect(missing.getStdout()).toBe('');
    expect(missing.getStderr()).toContain('coral.cli.io.error');
  });

  it('renders SVG, standalone HTML, and ASCII to stdout cleanly', async () => {
    const svg = createMemoryIo(VALID_STATE_0217);
    expect(await runCoralCli(['render', '--format', 'svg', '--style', 'anemone'], svg.io)).toBe(0);
    expect(svg.getStdout()).toContain('<svg');
    expect(svg.getStdout()).toContain('Active');

    const html = createMemoryIo(VALID_ARCH_028);
    expect(await runCoralCli(['render', '--format', 'html', '--style', 'hifi', '--theme', 'dark'], html.io)).toBe(0);
    expect(html.getStdout()).toContain('<!doctype html>');
    expect(html.getStdout()).toContain('<svg');

    const asciiFlow = [
      '@diagram flowchart',
      'start terminal [variant: "start"] as "Start"',
      'work process as "Process"',
      'done terminal [variant: "end"] as "Done"',
      'start -> work',
      'work -> done',
      '',
    ].join('\n');
    const ascii = createMemoryIo(asciiFlow);
    expect(await runCoralCli(['render', '--format', 'ascii', '--columns', '80'], ascii.io)).toBe(0);
    expect(ascii.getStdout()).toContain('Start');
    expect(ascii.getStdout()).toContain('Process');
  });

  it('emits zero partial stdout when render fails on invalid source or unsupported target', async () => {
    const badSvg = createMemoryIo('not coral source');
    expect(await runCoralCli(['render', '--format', 'svg'], badSvg.io)).toBe(1);
    expect(badSvg.getStdout()).toBe('');
    expect(badSvg.getStderr().length).toBeGreaterThan(0);

    const legacyStateSvg = createMemoryIo('@diagram uml-state\ns initial\nIdle state\nf final\ns -> Idle\nIdle -> f\n');
    expect(await runCoralCli(['render', '--format', 'svg'], legacyStateSvg.io)).toBe(1);
    expect(legacyStateSvg.getStdout()).toBe('');
    expect(legacyStateSvg.getStderr()).toContain('character-only');

    // Six-family ASCII limits refuse unsupported diagram families (e.g. erd)
    const unsupportedAscii = createMemoryIo('@diagram erd\n@coralVersion "0.2.14"\nuser entity\norder entity\nuser ||--o{ order as "places"\n');
    expect(await runCoralCli(['render', '--format', 'ascii'], unsupportedAscii.io)).toBe(1);
    expect(unsupportedAscii.getStdout()).toBe('');
    expect(unsupportedAscii.getStderr().length).toBeGreaterThan(0);
  });

  it('converts Coral-to-Coral byte-identically, Coral-to-JSON as GraphIR 4, and Top-5 Mermaid to Coral', async () => {
    const exactBytes = '// preserve comment\n' + VALID_ARCH_028;
    const coralToCoral = createMemoryIo(exactBytes);
    expect(await runCoralCli(['convert', '--from', 'coral', '--to', 'coral'], coralToCoral.io)).toBe(0);
    expect(coralToCoral.getStdout()).toBe(exactBytes);
    expect(coralToCoral.getStderr()).toBe('');

    const coralToJson = createMemoryIo(VALID_ARCH_028);
    expect(await runCoralCli(['convert', '--from', 'auto', '--to', 'json'], coralToJson.io)).toBe(0);
    const parsedJson = JSON.parse(coralToJson.getStdout());
    expect(parsedJson.version).toBe('4.0.0');

    const mermaidSeq = 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi\n';
    const seqConvert = createMemoryIo(mermaidSeq);
    expect(await runCoralCli(['convert', '--from', 'mermaid', '--to', 'coral'], seqConvert.io)).toBe(0);
    expect(seqConvert.getStdout()).toContain('@diagram uml-sequence');
    expect(seqConvert.getStderr()).toBe('');

    // Lossy flowchart reports loss on stderr and fails in --strict
    const cylinderFlow = 'flowchart LR\n  api[API] --> db[(DB)]\n';
    const bestEffort = createMemoryIo(cylinderFlow);
    expect(await runCoralCli(['convert', '--from', 'auto', '--to', 'coral'], bestEffort.io)).toBe(0);
    expect(bestEffort.getStdout()).toContain('@diagram flowchart');
    expect(bestEffort.getStderr()).toContain('warning');

    const strictLoss = createMemoryIo(cylinderFlow);
    expect(await runCoralCli(['convert', '--from', 'mermaid', '--to', 'coral', '--strict'], strictLoss.io)).toBe(1);
    expect(strictLoss.getStdout()).toBe('');
    expect(strictLoss.getStderr().length).toBeGreaterThan(0);
  });

  it('refuses unavailable writers and unsupported Mermaid diagrams cleanly with empty stdout', async () => {
    const dotToCoral = createMemoryIo('digraph G { a -> b; }\n');
    expect(await runCoralCli(['convert', '--from', 'dot', '--to', 'coral'], dotToCoral.io)).toBe(1);
    expect(dotToCoral.getStdout()).toBe('');
    expect(dotToCoral.getStderr()).toContain('coral.cli.writer.unavailable');

    const dotToJson = createMemoryIo('digraph G { a -> b; }\n');
    expect(await runCoralCli(['convert', '--from', 'dot', '--to', 'json'], dotToJson.io)).toBe(0);
    expect(JSON.parse(dotToJson.getStdout()).nodes.length).toBe(2);

    const gantt = createMemoryIo('gantt\n  title Plan\n  section A\n  Task :a1, 2026-01-01, 5d\n');
    expect(await runCoralCli(['convert', '--from', 'mermaid', '--to', 'coral'], gantt.io)).toBe(1);
    expect(gantt.getStdout()).toBe('');
    expect(gantt.getStderr()).toContain('mermaid.diagram.unsupported');
  });

  it('runs the built dist/cli.js entrypoint over real stdin redirection and file paths', async () => {
    const cliEntry = resolve(import.meta.dirname, '../dist/cli.js');
    const dir = await mkdtemp(join(tmpdir(), 'coral-cli-test-'));
    try {
      const filePath = join(dir, 'sample.coral');
      await writeFile(filePath, VALID_ARCH_028, 'utf8');

      const fromFile = spawnSync(process.execPath, [cliEntry, 'validate', filePath], { encoding: 'utf8' });
      expect(fromFile.status).toBe(0);
      expect(fromFile.stdout).toBe('');

      const fromStdin = spawnSync(process.execPath, [cliEntry, 'render', '--format', 'svg'], {
        input: VALID_ARCH_028,
        encoding: 'utf8',
      });
      expect(fromStdin.status).toBe(0);
      expect(fromStdin.stdout).toContain('<svg');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
