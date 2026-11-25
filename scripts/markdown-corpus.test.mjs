import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { listRepositoryPaths, validateMarkdownSources, validateRepository } from './check-markdown-links.mjs';

const validate = (entries, extra = []) => validateMarkdownSources(
  new Map(Object.entries(entries)),
  { existingPaths: new Set([...Object.keys(entries), ...extra]) },
);

test('repository validation resolves newly written non-ignored Markdown before staging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'coral-markdown-corpus-'));
  try {
    await writeFile(join(root, 'index.md'), '# Index\n\n[New plan](plan.md)\n');
    await writeFile(join(root, 'plan.md'), '# New plan\n');
    let command;
    const paths = listRepositoryPaths(root, (binary, args, options) => {
      command = { binary, args, options };
      return { status: 0, stdout: 'index.md\nplan.md\n' };
    });
    assert.equal(command.binary, 'git');
    assert.deepEqual(command.args, ['ls-files', '--cached', '--others', '--exclude-standard']);
    assert.equal(command.options.cwd, root);
    assert.equal(command.options.encoding, 'utf8');
    assert.deepEqual(await validateRepository(root, paths), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('repository inventory includes the final paths when experimental corpora exceed one MiB', () => {
  const emitInventory = 'process.stdout.write(Array.from({length:40000},(_,i)=>"dev/experiments/corpus/candidate-"+i+".json").join("\\n"))';
  const paths = listRepositoryPaths(process.cwd(), (_binary, _args, options) =>
    spawnSync(process.execPath, ['-e', emitInventory], options));
  assert.equal(paths.size, 40000);
  assert.ok(paths.has('dev/experiments/corpus/candidate-0.json'));
  assert.ok(paths.has('dev/experiments/corpus/candidate-39999.json'));
});

test('accepts relative Markdown links and rejects root or extensionless forms', () => {
  assert.deepEqual(validate({
    'docs/index.md': '# Index\n\n[Guide](guide.md)\n',
    'docs/guide.md': '# Guide\n',
  }), []);
  const failures = validate({
    'docs/index.md': '# Index\n\n[Root](/guide.md)\n[Short](guide)\n',
    'docs/guide.md': '# Guide\n',
  });
  assert.ok(failures.some((value) => /docs\/index\.md:3: root-absolute/.test(value)));
  assert.ok(failures.some((value) => /docs\/index\.md:4: Markdown link must retain \.md/.test(value)));
});

test('resolves cross-file anchors and rejects missing fragments', () => {
  assert.deepEqual(validate({
    'docs/index.md': '# Index\n\n[Details](guide.md#accepted-details)\n',
    'docs/guide.md': '# Guide\n\n## Accepted details\n',
  }), []);
  assert.match(
    validate({
      'docs/index.md': '# Index\n\n[Details](guide.md#missing)\n',
      'docs/guide.md': '# Guide\n',
    }).join('\n'),
    /docs\/index\.md:3: cross-file anchor does not exist/,
  );
});

test('leaves same-file fragment validation to markdownlint MD051', () => {
  assert.deepEqual(validate({
    'docs/index.md': '# Index\n\n[Missing](#not-present)\n',
  }), []);
});

test('parses balanced and angle-bracket destinations with query, title, and fragment', () => {
  assert.deepEqual(validate({
    'docs/index.md': [
      '# Index',
      '',
      '[Balanced](guide(foo).md#details)',
      '[Angle](<guide (bar).md#details>)',
      '[Query](guide.md?mode=full#details "Guide title")',
      '[Escaped](guide\\(foo\\).md#details)',
      '[Escaped external](https\\://example.com)',
      '[Escaped fragment](guide.md\\#details)',
      '[Escaped angle close](<guide\\>foo.md>)',
      '[Custom scheme](vscode://file/example)',
      '',
    ].join('\n'),
    'docs/guide(foo).md': '# Guide\n\n## Details\n',
    'docs/guide (bar).md': '# Guide\n\n## Details\n',
    'docs/guide>foo.md': '# Guide\n',
    'docs/guide.md': '# Guide\n\n## Details\n',
  }), []);
});

test('does not invent links from escaped or incomplete Markdown', () => {
  assert.deepEqual(validate({
    'docs/index.md': [
      '# Index',
      '',
      'Literal \\](missing.md) and [incomplete](<missing.md> remain text.',
      '[Whitespace is plain text](missing file.md)',
      '[Backslash-space is plain text](missing\\ file.md)',
      '',
    ].join('\n'),
  }), []);
});

test('requires lowercase unique custom anchors', () => {
  const failures = validate({
    'docs/index.md': '# Index\n\n## One {#Bad-Anchor}\n\n## Two {#repeat}\n\n## Three {#repeat}\n',
  });
  assert.ok(failures.some((value) => /docs\/index\.md:3: custom heading anchor/.test(value)));
  assert.ok(failures.some((value) => /docs\/index\.md:7: heading anchor "repeat" duplicates line 5/.test(value)));
  assert.deepEqual(validate({
    'docs/index.md': '# Index\n\n## One {#one_anchor}\n',
  }), []);
});

test('uses VitePress suffixes for repeated generated headings', () => {
  assert.deepEqual(validate({
    'docs/index.md': '# Index\n\n[Second](guide.md#same-1)\n',
    'docs/guide.md': '# Guide\n\n## Same\n\n## Same\n',
  }), []);
});

test('validates container type, closure, and matching close', () => {
  assert.deepEqual(validate({
    'docs/index.md': '# Index\n\n::: warning\nCareful.\n:::\n',
  }), []);
  const failures = validate({
    'docs/index.md': '# Index\n\n::: custom\nNo close.\n',
    'docs/other.md': '# Other\n\n:::\n',
  });
  assert.ok(failures.some((value) => /docs\/index\.md:3: container type "custom" is not allowed/.test(value)));
  assert.ok(failures.some((value) => /docs\/index\.md:3: container type "custom" is not closed/.test(value)));
  assert.ok(failures.some((value) => /docs\/other\.md:3: container close has no matching open/.test(value)));
});

test('matches nested VitePress containers by marker width', () => {
  assert.deepEqual(validate({
    'docs/index.md': [
      '# Index',
      '',
      ':::: details Outer',
      '::: warning Inner',
      'Careful.',
      ':::',
      '::::',
      '',
    ].join('\n'),
  }), []);
  assert.match(validate({
    'docs/index.md': '# Index\n\n:::: details Outer\n::: warning Inner\n::::\n',
  }).join('\n'), /container type "details" is not closed/);
  assert.match(validate({
    'docs/index.md': '# Index\n\n::: details Outer\n:::: warning Inner\n::::\n:::\n',
  }).join('\n'), /nested container marker must be shorter/);
});

test('rejects remaining corpus prohibitions with line-specific diagnostics', () => {
  const failures = validate({
    'docs/index.md': '# Index\n\n[[toc]]\n\n<!-- hidden -->\n\n0. zero\n\n',
  });
  for (const expected of [
    /docs\/index\.md:3: \[\[toc\]\] is prohibited/,
    /docs\/index\.md:5: HTML comments are prohibited/,
    /docs\/index\.md:7: zero-based ordered lists are prohibited/,
    /docs\/index\.md:8: multiple trailing newlines are prohibited/,
  ]) assert.ok(failures.some((value) => expected.test(value)), expected);
  assert.deepEqual(validate({ 'docs/index.md': '# Index\n\n1. one\n' }), []);
});

test('ignores corpus syntax inside inline and fenced code', () => {
  assert.deepEqual(validate({
    'docs/index.md': [
      '# Index',
      '',
      '`[literal](missing.md)` and ``[[toc]] <!-- literal -->``.',
      '',
      '```markdown',
      '[literal](missing.md)',
      '[[toc]]',
      '<!-- literal -->',
      '0. literal',
      '::: custom',
      '```',
      '',
    ].join('\n'),
  }), []);
});

test('ignores corpus syntax inside multiline inline code spans', () => {
  assert.deepEqual(validate({
    'docs/index.md': '# Index\n\nBefore ``code\n[no](missing.md) [[toc]] <!-- literal -->\n0. literal`` after.\n',
  }), []);
});

test('escaped backticks do not hide live links', () => {
  assert.match(validate({
    'docs/index.md': '# Index\n\n\\`[live](missing.md)\\`\n',
  }).join('\n'), /link target does not exist/);
});

test('canonical language references permit only their exact native includes and live owners', () => {
  const specPage = 'docs/embed/reference/language-specification-1.3.0.md';
  const policyPage = 'docs/contribute/reference/language-evolution.md';
  const specOwner = 'packages/language/SPEC.md';
  const policyOwner = 'dev/designs/language-design-and-evolution.md';
  const specInclude = '<!-- @include: ../../../packages/language/SPEC.md{3,} -->';
  const policyInclude = '<!-- @include: ../../../dev/designs/language-design-and-evolution.md#policy -->';
  const files = { [specPage]: `# Spec\n\n${specInclude}\n`,
    [policyPage]: `# Policy\n\n${policyInclude}\n`,
    [specOwner]: '# Spec\n\nCanonical rules.\n',
    [policyOwner]: '# Policy\n\n<!-- #region policy -->\nRules.\n<!-- #endregion policy -->\n' };
  assert.deepEqual(validate(files), []);
  const absent = { ...files }; delete absent[specOwner];
  assert.match(validate(absent).join('\n'), /link target does not exist/);
  assert.match(validate({ ...files, [policyOwner]: '# Policy\n' }).join('\n'), /include region does not exist/);
  assert.match(validate({ ...files, [specOwner]: '# Spec\n' }).join('\n'), /include range does not exist/);
  for (const [file, directive] of [[specPage, '<!-- hidden -->'],
    [specPage, specInclude.replace('SPEC.md', 'private.md')],
    ['docs/index.md', specInclude], [specPage, `${specInclude} <!-- hidden -->`]]) {
    assert.match(validate({ ...files, [file]: `# Spec\n\n${directive}\n` }).join('\n'), /HTML comments are prohibited/);
  }
});
