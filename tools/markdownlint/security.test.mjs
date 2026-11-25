import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { micromark } from 'micromark';
import { math, mathHtml } from 'micromark-extension-math';

test('Markdown CLI preserves the Coral JSONC rule-options contract after dependency security fixes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'coral-markdown-security-'));
  try {
    writeFileSync(join(directory, 'config.jsonc'), '// Coral uses JSONC configuration.\n' +
      JSON.stringify({ config: { default: false, MD004: { style: 'dash' } } }));
    writeFileSync(join(directory, 'valid.md'), '- Valid item\n');
    writeFileSync(join(directory, 'invalid.md'), '* Invalid item\n');
    const cli = resolve('node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs');
    const run = file => spawnSync(process.execPath, [cli, '--config', 'config.jsonc', '--no-globs', file], {
      cwd: directory, encoding: 'utf8',
    });
    const valid = run('valid.md');
    assert.equal(valid.status, 0, valid.error?.message || valid.stderr || valid.stdout);
    assert.match(valid.stdout, /Linting: 1 file/);
    const invalid = run('invalid.md');
    assert.equal(invalid.status, 1, invalid.error?.message || invalid.stderr || invalid.stdout);
    assert.match(invalid.stdout + invalid.stderr, /MD004/);
    assert.match(invalid.stdout, /Linting: 1 file/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the Markdown math extension renders inline and display math after the KaTeX security update', () => {
  const html = micromark('Inline $x^2$\n\n$$\n\\frac{1}{2}\n$$\n', {
    extensions: [math()], htmlExtensions: [mathHtml()],
  });
  assert.match(html, /math-inline/);
  assert.match(html, /math-display/);
  assert.match(html, /class="katex/);
  assert.doesNotMatch(html, /katex-error/);
});

test('pre-existing prototype pollution cannot enable trusted links in Markdown math', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'trust');
  try {
    Object.defineProperty(Object.prototype, 'trust', { configurable: true, writable: true, value: true });
    const html = micromark('$\\href{https://example.test/untrusted}{link}$', {
      extensions: [math()], htmlExtensions: [mathHtml()],
    });
    assert.doesNotMatch(html, /href="https:\/\/example\.test\/untrusted"/);
    assert.match(html, /class="katex/);
  } finally {
    if (descriptor) Object.defineProperty(Object.prototype, 'trust', descriptor);
    else delete Object.prototype.trust;
  }
});
