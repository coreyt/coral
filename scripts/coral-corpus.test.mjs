/**
 * Coral corpus guard (Slice 53, R-063 AC-5).
 *
 * Every Coral input the repository keeps is registered in
 * `scripts/coral-corpus-registry.json` and checked against the built
 * `@coral-viz/language`: kept-valid input parses with no diagnostic, kept
 * negative input declares the codes it expects, and a removed spelling (L1,
 * L2) in any Coral text unit fails unless that unit declares its code. Run
 * `npm run build` first; `npm run verify` does.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import test from 'node:test';
import { HEADER_MANIFEST_028, parseDocument028, formatDocument028 } from '@coral-viz/language';
import { parse } from '@coral-viz/language/parser';
import { projectInstalledSourceToSuccessor028, successorCoreValidationInput029 } from '@coral-viz/render';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';

import { embeddedCoralInputs, isEmbeddedCoralSource } from './coral-corpus-embedded.mjs';
import { loadSpellings, validateExpectedPositions, diagnosticExpectationMismatches, validateSourceLineEndings } from './verify-language-spec.mjs';

const { REMOVED_SPELLINGS } = await loadSpellings();
const runtime028 = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
  trustedDigests: Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8'])
    .flatMap((edition) => edition.catalogs.map((catalog) =>
      [`${catalog.id}@${catalog.version}`, catalog.digest]))) };

const CONFORMANCE = 'packages/language/spec/conformance';
const ACCURACY_EXISTING = 'packages/diagram-editor/test/llm/fixtures/accuracy/*/existing.txt';
const TREE_SITTER_CORPUS = 'packages/tree-sitter-coral/test/corpus/*.txt';
/** A line an untagged fence may not hold: an edge, a `type "Label"` node, or a graph header. */
const CORAL_LOOKING = /->|^\s*[A-Za-z_][\w-]*\s+"[^"]*"(?:\s+as\s+\S+)?\s*(?:\{|$)|^\s*@(?:graph|diagram)\b/;
const SAVED_028_HEADER = /(?:^|\n)[ \t]*@diagram(?:[ \t]|$)/;

const matchList = (match) => (Array.isArray(match) ? match : [match]);
const matches = (path, entry) => matchList(entry.match).some((pattern) => matchesGlob(path, pattern));

/** Every Markdown fence, with its info string, first content line, and body. */
export function fences(markdown) {
  const out = [];
  const lines = markdown.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const open = lines[index].match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!open) continue;
    const [, indent, marker, info] = open;
    const body = [];
    let end = index + 1;
    for (; end < lines.length; end++) {
      if (lines[end].trim().startsWith(marker) && lines[end].trim().replace(new RegExp(`^${marker[0]}+`), '') === '') break;
      body.push(lines[end].startsWith(indent) ? lines[end].slice(indent.length) : lines[end]);
    }
    out.push({ info: info.trim(), line: index + 1, firstLine: (body[0] ?? '').trim(), text: body.join('\n') });
    index = end;
  }
  return out;
}

/** Tree-sitter corpus cases: title, input, and whether the expected tree holds an ERROR or MISSING node. */
export function treeSitterCases(corpus) {
  const cases = [];
  const pattern = /^={3,}\n(.+)\n={3,}\n([\s\S]*?)\n-{3,}\n([\s\S]*?)(?=\n={3,}\n|(?![\s\S]))/gm;
  for (const match of corpus.matchAll(pattern)) {
    cases.push({ title: match[1].trim(), input: match[2], erroneous: /\((?:ERROR|MISSING)\b/.test(match[3]) });
  }
  return cases;
}

const withoutQuotedStrings = (line) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""');

/** The removed spellings (L1, L2) a Coral text unit contains. */
export function removedSpellingsIn(text) {
  const found = [];
  for (const removed of REMOVED_SPELLINGS) {
    const hit = removed.id === 'L2'
      ? text.split('\n').some((line) => removed.pattern.test(withoutQuotedStrings(line)))
      : removed.pattern.test(text);
    if (hit) found.push(removed);
  }
  return found;
}

/**
 * Check every registered corpus. `files` are repository-relative paths; the
 * result lists every failure, so an empty list means the corpus is clean.
 */
export function checkCorpus({ files, read, registry, parse: parseCoral = parse }) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const codesOf = (source) => parseCoral(source).diagnostics.map((diagnostic) => diagnostic);
  const errorCodes = (source, reader) => {
    const installed = reader === 'installed-028' ? parseDocument028(source, runtime028) : undefined;
    const errors = installed
      ? [...installed.header.diagnostics, ...installed.syntax.diagnostics]
        .filter(({ severity }) => severity === undefined || severity === 'error')
      : parseCoral(source).errors;
    return [...new Set(errors.map(({ code }) => code))];
  };

  const checkValid = (label, source) => {
    const diagnostics = SAVED_028_HEADER.test(source)
      ? (() => {
          const document = parseDocument028(source, runtime028);
          if (document.header.source !== source) fail(`${label} did not retain exact source text`);
          return [...document.header.diagnostics, ...document.syntax.diagnostics];
        })()
      : codesOf(source);
    if (diagnostics.length > 0) {
      fail(`${label} must parse with no diagnostic: ${diagnostics.map(({ code, line, range }) =>
        `${code}@${line ?? range?.start.line ?? '?'}`).join(', ')}`);
    }
  };
  const checkNegative = (label, source, declared, reader) => {
    const actual = errorCodes(source, reader);
    if (declared.length === 0) {
      if (actual.length > 0) fail(`${label} declares no language error but reports ${actual.join(', ')}`);
      return;
    }
    if (!actual.some((code) => declared.includes(code))) fail(`${label} reports none of its declared codes ${declared.join(', ')}`);
    const extra = actual.filter((code) => !declared.includes(code));
    if (extra.length > 0) fail(`${label} reports undeclared errors ${extra.join(', ')}`);
  };
  const checkRemoved = (label, text, declared) => {
    for (const removed of removedSpellingsIn(text)) {
      if (!declared.includes(removed.code)) fail(`${label} contains removed spelling ${removed.id} without declaring ${removed.code}`);
    }
  };

  // Registration: every Coral unit belongs to exactly one registry entry.
  const markdownWithCoral = new Set(files.filter((path) => path.endsWith('.md') &&
    fences(read(path)).some(({ info }) => info === 'coral')));
  const units = files.filter((path) => path.endsWith('.coral') || matchesGlob(path, ACCURACY_EXISTING) ||
    matchesGlob(path, TREE_SITTER_CORPUS) || markdownWithCoral.has(path));
  for (const path of units) {
    const owners = registry.entries.filter((entry) => matches(path, entry));
    if (owners.length !== 1) {
      fail(`${path} must match exactly one registry entry, matched ${owners.map(({ id }) => id).join(', ') || 'none'}`);
    }
  }

  const embedded = files.filter(isEmbeddedCoralSource)
    .flatMap((path) => embeddedCoralInputs(path, read(path)));
  const embeddedById = new Map(embedded.map((input) => [input.id, input]));
  const declaredEmbedded = new Map([
    ...(registry.embeddedInputs?.valid ?? []).map((id) => [id, { mode: 'valid', codes: [] }]),
    ...Object.entries(registry.embeddedInputs?.negative ?? {})
      .map(([id, codes]) => [id, { mode: 'negative', codes }]),
    ...(registry.embeddedInputs?.installed028?.valid ?? [])
      .map((id) => [id, { mode: 'installed-028-valid', codes: [] }]),
    ...Object.entries(registry.embeddedInputs?.installed028?.negative ?? {})
      .map(([id, codes]) => [id, { mode: 'installed-028-negative', codes }]),
  ]);
  for (const input of embedded) {
    const declared = declaredEmbedded.get(input.id);
    const label = `${input.file}:${input.line}`;
    if (!declared) {
      fail(`${input.file} has an unregistered embedded Coral input ${input.id}`);
      continue;
    }
    const installed = declared.mode.startsWith('installed-028')
      ? parseDocument028(input.text, runtime028) : undefined;
    const actual = [...new Set((installed
      ? [...installed.header.diagnostics, ...installed.syntax.diagnostics]
      : codesOf(input.text)).map(({ code }) => code))].sort();
    const expected = [...new Set(declared.codes ?? [])].sort();
    if (installed && installed.header.source !== input.text)
      fail(`${label} embedded 0.2.8 input did not retain exact source text`);
    if (declared.mode === 'valid' || declared.mode === 'installed-028-valid') {
      if (actual.length > 0) fail(`${label} embedded valid input reports ${actual.join(', ')}`);
    } else if (declared.mode === 'negative' || declared.mode === 'installed-028-negative') {
      if (expected.length === 0) fail(`${input.id} negative input declares no diagnostic codes`);
      if (!expected.every((code, index) => code === actual[index]) || expected.length !== actual.length) {
        fail(`${label} embedded negative input reports ${actual.join(', ') || 'none'}; expected ${expected.join(', ')}`);
      }
    } else {
      fail(`${input.id} has unknown embedded mode ${declared.mode}`);
    }
    checkRemoved(label, input.text, expected);
  }
  for (const id of declaredEmbedded.keys()) {
    if (!embeddedById.has(id)) fail(`embedded Coral registry input ${id} was not discovered`);
  }

  const manifest = JSON.parse(read(`${CONFORMANCE}/manifest.json`));
  for (const entry of registry.entries) {
    const matched = files.filter((path) => matches(path, entry));
    const own = (path) => registry.entries.filter((other) => matches(path, other)).length === 1;
    if (entry.mode === 'excluded') {
      if (!entry.reason) fail(`registry entry ${entry.id} excludes files without a reason`);
      continue;
    }
    if (entry.mode === 'valid') {
      for (const path of matched.filter(own)) {
        const text = read(path);
        checkValid(path, text);
        checkRemoved(path, text, []);
      }
      continue;
    }
    if (entry.mode === 'negative') {
      for (const path of matched.filter((file) => file.endsWith('.coral') && own(file))) {
        const text = read(path);
        const name = path.split('/').pop();
        let declared;
        let exactOverride = false;
        if (entry.codes) {
          declared = entry.codes[name];
          if (declared === undefined) {
            fail(`${path} declares no codes in registry entry ${entry.id}`);
            continue;
          }
        } else {
          const meta = JSON.parse(read(path.replace(/\.coral$/, '.meta.json')));
          declared = entry.codeOverrides?.[name];
          if (declared === undefined) {
            declared = [];
            for (const { defectType } of meta.injectedDefects) {
              const codes = entry.defectTypeCodes?.[defectType];
              if (codes === undefined) fail(`${path} has defect type ${defectType} with no declared codes`);
              else declared.push(...codes);
            }
            declared = [...new Set(declared)];
          } else exactOverride = true;
        }
        if (exactOverride) {
          const actual = errorCodes(text, entry.reader).sort();
          const expected = [...new Set(declared)].sort();
          if (actual.length !== expected.length || actual.some((code, index) => code !== expected[index])) {
            fail(`${path} reports ${actual.join(', ') || 'no errors'}; exact override expects ${expected.join(', ') || 'no errors'}`);
          }
        } else checkNegative(path, text, declared, entry.reader);
        checkRemoved(path, text, declared);
      }
      for (const name of Object.keys(entry.codes ?? {})) {
        if (!matched.some((path) => path.endsWith(`/${name}`))) fail(`registry entry ${entry.id} declares codes for missing ${name}`);
      }
      for (const name of Object.keys(entry.codeOverrides ?? {})) {
        if (!matched.some((path) => path.endsWith(`/${name}`))) fail(`registry entry ${entry.id} overrides codes for missing ${name}`);
      }
      continue;
    }
    if (entry.mode === 'manifest') {
      const byPath = new Map();
      for (const fixture of manifest.cases) {
        byPath.set(`${CONFORMANCE}/${fixture.source}`, { fixture, role: 'source' });
        if (fixture.canonical) byPath.set(`${CONFORMANCE}/${fixture.canonical}`, { fixture, role: 'canonical' });
        // Writer output for an edition 0.2.9 fixture; the render conformance test owns the comparison.
        if (fixture.successorCanonical)
          byPath.set(`${CONFORMANCE}/${fixture.successorCanonical}`, { fixture, role: 'successor-canonical' });
      }
      for (const path of matched.filter(own)) {
        const reference = byPath.get(path);
        if (!reference) {
          fail(`${path} is not referenced by the conformance manifest`);
          continue;
        }
        const text = read(path);
        const fixture = reference.fixture;
        if (reference.role === 'successor-canonical') {
          const document = parseDocument028(text, runtime028);
          if (document.header.source !== text || document.header.diagnostics.length ||
            document.syntax.diagnostics.length) fail(`${path} is not clean edition 0.2.9 source`);
          checkRemoved(path, text, []);
          continue;
        }
        if (['saved-source', 'saved-source-029', 'source-format'].includes(fixture.entryPoint)) {
          try { validateSourceLineEndings(text, fixture, path); } catch (cause) { fail(cause.message); }
          const document = parseDocument028(text, runtime028);
          if (document.header.source !== text) fail(`${path} did not retain exact source text`);
          const header = document.header.diagnostics.map((diagnostic) => ({ ...diagnostic,
            line: diagnostic.range.start.line, column: diagnostic.range.start.column }));
          const expectedHeader = reference.role === 'canonical' ? [] : fixture.expectedHeaderDiagnostics;
          const expectedSyntax = reference.role === 'canonical' ? [] : fixture.expectedDiagnostics;
          validateExpectedPositions({ id: fixture.id, expectedDiagnostics: expectedHeader });
          validateExpectedPositions({ id: fixture.id, expectedDiagnostics: expectedSyntax });
          for (const [layer, expected, actual] of [['header', expectedHeader, header],
            ['syntax', expectedSyntax, document.syntax.diagnostics]]) {
            const mismatches = diagnosticExpectationMismatches(expected, actual);
            if (mismatches.length) fail(`${path} ${layer}: ${mismatches.join(', ')}`);
          }
          if (reference.role === 'source' &&
            (document.graph !== undefined) !== (fixture.staging === 'available')) {
            fail(`${path} disagrees with its declared staging ownership`);
          }
          if (reference.role === 'canonical') {
            try {
              const original = read(`${CONFORMANCE}/${fixture.source}`);
              const formatted = formatDocument028(original, runtime028);
              if (formatted !== text) fail(`${path} differs from its exact source-format golden`);
              if (formatDocument028(text, runtime028) !== text) fail(`${path} source formatting is not idempotent`);
            } catch (cause) { fail(`${path} source formatting refused: ${cause.message}`); }
          } else if (fixture.category === 'invalid') {
            try {
              formatDocument028(text, runtime028);
              fail(`${path} invalid draft was admitted for source formatting`);
            } catch (cause) {
              if (!cause.message.includes('coral.format028.source.invalid')) fail(`${path} has an unexpected formatting refusal`);
            }
          }
          checkRemoved(path, text, [...expectedHeader, ...expectedSyntax].map(({ code }) => code));
          continue;
        }
        if (reference.fixture.category !== 'invalid') {
          checkValid(path, text);
          checkRemoved(path, text, []);
          continue;
        }
        validateExpectedPositions(reference.fixture);
        const mismatches = diagnosticExpectationMismatches(reference.fixture.expectedDiagnostics, parseCoral(text).errors);
        if (mismatches.length) fail(`${path}: ${mismatches.join(', ')}`);
        checkRemoved(path, text, reference.fixture.expectedDiagnostics.map(({ code }) => code));
      }
      continue;
    }
    if (entry.mode === 'tree-sitter') {
      for (const path of matched.filter(own)) {
        const name = path.split('/').pop();
        const cases = treeSitterCases(read(path));
        for (const title of Object.keys(entry.caseCodes?.[name] ?? {})) {
          if (!cases.some((item) => item.title === title)) fail(`registry entry ${entry.id} declares codes for missing case ${name}: ${title}`);
        }
        for (const item of cases) {
          const label = `${path} case "${item.title}"`;
          const declared = entry.caseCodes?.[name]?.[item.title] ?? [];
          // A case whose tree has no ERROR but declares codes records where the
          // grammar is a syntactic superset of the language: the parser must
          // report exactly those codes.
          if (!item.erroneous && declared.length > 0) checkNegative(label, item.input, declared);
          else if (!item.erroneous) checkValid(label, item.input);
          checkRemoved(label, item.input, declared);
        }
      }
      continue;
    }
    if (entry.mode === 'installed-028' || entry.mode === 'tree-sitter-028') {
      for (const path of matched.filter(own)) {
        const sources = entry.mode === 'tree-sitter-028'
          ? treeSitterCases(read(path)).map(({ title, input, erroneous }) => ({
            label: `${path} case "${title}"`, source: input, erroneous,
            expected: entry.caseCodes?.[path.split('/').pop()]?.[title] ?? [] }))
          : [{ label: path, source: read(path), erroneous: false,
            expected: entry.codes?.[path.split('/').pop()] ?? [] }];
        for (const { label, source, erroneous, expected } of sources) {
          const document = parseDocument028(source, runtime028);
          const diagnostics = [...document.header.diagnostics, ...document.syntax.diagnostics];
          const actualCodes = [...new Set(diagnostics.map(({ code }) => code))].sort();
          const expectedCodes = [...new Set(expected)].sort();
          if ((!erroneous || expectedCodes.length) &&
              (actualCodes.length !== expectedCodes.length ||
                actualCodes.some((code, index) => code !== expectedCodes[index]))) {
            fail(`${label} reports ${actualCodes.join(', ') || 'no 0.2.8 diagnostics'}; ` +
              `expected ${expectedCodes.join(', ') || 'none'}`);
          }
          if (expectedCodes.includes('header.diagram.disabled') && document.graph !== undefined)
            fail(`${label} disabled document projected a semantic graph`);
          if (document.header.source !== source) fail(`${label} did not retain exact source text`);
          checkRemoved(label, source, expectedCodes);
        }
      }
      for (const name of Object.keys(entry.codes ?? {})) {
        if (!matched.some((path) => path.endsWith(`/${name}`)))
          fail(`registry entry ${entry.id} declares codes for missing ${name}`);
      }
      for (const [name, caseCodes] of Object.entries(entry.caseCodes ?? {})) {
        const path = matched.find((item) => item.endsWith(`/${name}`));
        if (!path) {
          fail(`registry entry ${entry.id} declares cases for missing ${name}`);
          continue;
        }
        const cases = treeSitterCases(read(path));
        for (const title of Object.keys(caseCodes)) {
          if (!cases.some((item) => item.title === title))
            fail(`registry entry ${entry.id} declares codes for missing case ${name}: ${title}`);
        }
      }
      continue;
    }
    if (entry.mode === 'fences') {
      const fragments = entry.fragments ?? {};
      const used = new Map();
      for (const path of matched.filter((file) => file.endsWith('.md'))) {
        for (const fence of fences(read(path))) {
          const label = `${path}:${fence.line}`;
          if (fence.info === '') {
            if (fence.text.split('\n').some((line) => CORAL_LOOKING.test(line))) {
              fail(`${label} is an untagged fence that looks like Coral; tag it coral or text`);
            }
            continue;
          }
          if (fence.info !== 'coral') continue;
          const fragment = (fragments[path] ?? []).find(({ firstLine }) => firstLine === fence.firstLine);
          if (!fragment) {
            checkValid(label, fence.text);
            checkRemoved(label, fence.text, []);
            continue;
          }
          const key = `${path}\n${fragment.firstLine}`;
          used.set(key, (used.get(key) ?? 0) + 1);
          if (fragment.reader && fragment.reader !== 'installed-028') {
            fail(`${label} declares unknown fragment reader ${fragment.reader}`);
            continue;
          }
          if (fragment.reader === 'installed-028') {
            const document = parseDocument028(fence.text, runtime028);
            const actual = [...new Set([...document.header.diagnostics,
              ...document.syntax.diagnostics].map(({ code }) => code))].sort();
            const expected = [...new Set(fragment.codes ?? [])].sort();
            if (!isDeepStrictEqual(actual, expected)) {
              fail(`${label} reports ${actual.join(', ') || 'no 0.2.8 diagnostics'}; ` +
                `expected ${expected.join(', ') || 'none'}`);
            }
            if (document.header.source !== fence.text) fail(`${label} did not retain exact source text`);
            checkRemoved(label, fence.text, expected);
            continue;
          }
          const allowed = new Set([...(registry.fragmentCodes ?? []), ...(fragment.codes ?? [])]);
          const lines = fence.text.split('\n');
          for (const diagnostic of parseCoral(fence.text).diagnostics) {
            const placeholder = diagnostic.code === 'coral.line.unparsed' &&
              (fragment.placeholders ?? []).includes((lines[diagnostic.line - 1] ?? '').trim());
            if (!allowed.has(diagnostic.code) && !placeholder) {
              fail(`${label} fragment reports ${diagnostic.code}@${diagnostic.line}, which it does not declare`);
            }
          }
          checkRemoved(label, fence.text, fragment.codes ?? []);
        }
      }
      for (const [path, list] of Object.entries(fragments)) {
        for (const { firstLine } of list) {
          const count = used.get(`${path}\n${firstLine}`) ?? 0;
          if (count !== 1) fail(`fragment ${path} "${firstLine}" matches ${count} coral fences; it must match exactly one`);
        }
      }
      continue;
    }
    fail(`registry entry ${entry.id} has unknown mode ${entry.mode}`);
  }
  return failures;
}

function repositoryFiles() {
  // The repository listing already exceeds Node's 1 MiB default buffer.
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean);
  return [...new Set(listed)].filter((path) => existsSync(path)).sort();
}

const registry = JSON.parse(readFileSync('scripts/coral-corpus-registry.json', 'utf8'));
const read = (path) => readFileSync(path, 'utf8');

test('every registered Coral corpus keeps its declared outcome', () => {
  assert.deepEqual(checkCorpus({ files: repositoryFiles(), read, registry }), []);
});

/** The GraphIR paths at which each saved-source unit exceeds a resolved port
 * limit when exported, with bundled limits in the snapshot (contract §12 item 3). */
export function portLimitExcesses(units) {
  return units.flatMap(({ label, text }) => {
    const projected = projectInstalledSourceToSuccessor028(text);
    if (!projected.graph || projected.diagnostics.length) return [];
    let core;
    try {
      core = successorCoreValidationInput029(projected.graph, { limits: true });
    } catch {
      return []; // An unprojectable unit is the corpus check's concern, not this one.
    }
    return validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options).errors
      .filter(({ code }) => code === 'PORT_CONNECTIONS_EXCEEDED').map(({ path }) => `${label}: ${path}`);
  });
}

/** Every saved-source text unit the repository keeps, by label. */
function savedSourceUnits(files) {
  return files.flatMap((path) => {
    if (path.endsWith('.coral') || matchesGlob(path, ACCURACY_EXISTING)) return [{ label: path, text: read(path) }];
    if (path.endsWith('.md')) return fences(read(path)).filter(({ info }) => info === 'coral')
      .map(({ line, text }) => ({ label: `${path}:${line}`, text }));
    if (matchesGlob(path, TREE_SITTER_CORPUS)) return treeSitterCases(read(path))
      .map(({ title, input }) => ({ label: `${path}: ${title}`, text: input }));
    return embeddedCoralInputs(path, read(path)).map(({ id, text }) => ({ label: id, text }));
  }).filter(({ text }) => SAVED_028_HEADER.test(text));
}

test('no shipped saved source exceeds a bundled port limit under GraphIR 4 (contract §12 item 3)', () => {
  assert.deepEqual(portLimitExcesses(savedSourceUnits(repositoryFiles())), []);
  assert.deepEqual(portLimitExcesses([{ label: 'over', text:
    '@diagram flowchart\na process\nb process\nd decision\na -> d:in\nb -> d:in\n' }]),
  ['over: /edges/1/second/port']);
});

// Guard proofs: each mutation must fail closed.

test('installed 0.2.8 diagnostic declarations require live files and corpus cases', () => {
  const changed = structuredClone(registry);
  const browser = changed.entries.find(({ id }) => id === 'browser-028-fixtures');
  browser.codes['missing-chen.coral'] = ['header.diagram.disabled'];
  browser.codes['erd-hub.coral'] = ['header.diagram.unsupported'];
  changed.entries.find(({ id }) => id === 'tree-sitter-corpus')
    .caseCodes['coral-028.txt']['Missing Chen case'] = ['header.diagram.disabled'];
  const failures = checkCorpus({ files: repositoryFiles(), read, registry: changed });
  assert.ok(failures.some((failure) => failure.includes('declares codes for missing missing-chen.coral')),
    failures.join('\n'));
  assert.ok(failures.some((failure) => failure.includes('erd-hub.coral reports header.diagram.disabled; expected header.diagram.unsupported')),
    failures.join('\n'));
  assert.ok(failures.some((failure) => failure.includes('declares codes for missing case coral-028.txt: Missing Chen case')),
    failures.join('\n'));
});

test('an unregistered .coral file fails registration', () => {
  const files = [...repositoryFiles(), 'examples/unregistered.coral'];
  const failures = checkCorpus({ files, registry, read: (path) => (path === 'examples/unregistered.coral' ? 'service "A"\n' : read(path)) });
  assert.ok(failures.some((failure) => failure.startsWith('examples/unregistered.coral must match exactly one registry entry')), failures.join('\n'));
});

test('an unregistered parser-consumed TypeScript literal fails registration', () => {
  const target = 'packages/diagram-editor/test/parsers.test.ts';
  const injected = `\nparseCoralDSL('a -> b data {"style":{"targetArrow":"arrow"}}');\n`;
  const failures = checkCorpus({
    files: repositoryFiles(), registry,
    read: (path) => (path === target ? `${read(path)}${injected}` : read(path)),
  });
  assert.ok(failures.some((failure) => failure.includes(`${target} has an unregistered embedded Coral input`)),
    failures.join('\n'));
});

test('per-file diagnostic overrides require every exact code and a live target', () => {
  const target = 'airline-reservation-class-missing-closing-brace-1.coral';
  const missingCodeRegistry = structuredClone(registry);
  const syntax = missingCodeRegistry.entries.find(({ id }) => id === 'llm-syntax-defects');
  syntax.codeOverrides[target].push('coral.uml.classifier.nested.invalid');
  let failures = checkCorpus({ files: repositoryFiles(), read, registry: missingCodeRegistry });
  assert.ok(failures.some((failure) => failure.includes(`${target} reports`) && failure.includes('exact override expects')),
    failures.join('\n'));

  const staleTargetRegistry = structuredClone(registry);
  const staleSyntax = staleTargetRegistry.entries.find(({ id }) => id === 'llm-syntax-defects');
  staleSyntax.codeOverrides['missing-class-fixture.coral'] = ['coral.line.unparsed'];
  failures = checkCorpus({ files: repositoryFiles(), read, registry: staleTargetRegistry });
  assert.ok(failures.some((failure) => failure.includes('overrides codes for missing missing-class-fixture.coral')),
    failures.join('\n'));
});

test('unregistered direct and const-bound static array joins fail registration', () => {
  const target = 'packages/diagram-editor/test/parsers.test.ts';
  const injected = [
    "parseCoralDSL(['service as joinedA', 'service as joinedB', 'joinedA -> joinedB'].join('\\n'));",
    "const joinedCoral = ['service as boundA', 'service as boundB', 'boundA -> boundB'];",
    "parseCoralDSL(joinedCoral.join('\\n'));",
  ].join('\n');
  const failures = checkCorpus({
    files: repositoryFiles(), registry,
    read: (path) => (path === target ? `${read(path)}\n${injected}\n` : read(path)),
  });
  assert.equal(failures.filter((failure) =>
    failure.includes(`${target} has an unregistered embedded Coral input`)).length, 2,
  failures.join('\n'));
});

test('embedded discovery is import-scoped and resolves static aliases and templates', () => {
  assert.equal(isEmbeddedCoralSource(
    'packages/diagram-editor/test/llm/spatial/integration.test.ts',
  ), true);
  const source = [
    "import { parse as parseCoral } from '@coral-viz/language';",
    "import { parseCoralDSL as parseEditorCoral } from '../src/parsers';",
    "import { parse as parseOther } from 'unrelated-parser';",
    "import { parseCoralDSL as parseOtherCoral } from 'unrelated/src/parsers';",
    "const nodes = 'service \\\"A\\\" as a\\nservice \\\"B\\\" as b';",
    'parseCoral(`${nodes}\\na -> b`);',
    "parseEditorCoral('service \\\"C\\\"');",
    "describe('local', () => {",
    "  const local = 'service \\\"D\\\" as d';",
    "  parseCoral(`${local}\\nd -> d`);",
    "});",
    "parseCoral(['service \\\"E\\\" as e', 'database \\\"F\\\" as f', 'e -> f'].join('\\n'));",
    "const joined = ['service \\\"G\\\" as g', 'g -> g'];",
    "parseEditorCoral(joined.join('\\n'));",
    "const mutated = ['service \\\"H\\\" as h'];",
    "mutated.push('h -> h data {\\\"style\\\":{\\\"targetArrow\\\":\\\"arrow\\\"}}');",
    "parseCoral(mutated.join('\\n'));",
    "{ let parseCoral = (value) => value; parseCoral('ordinary shadowed input'); }",
    "{ function parseEditorCoral(value) { return value; } parseEditorCoral('ordinary local input'); }",
    "let mutable = 'service \\\"stale\\\"';",
    "mutable = 'ordinary dynamic input';",
    "parseCoral(mutable);",
    "parseOther('ordinary non-Coral input');",
    "parseOtherCoral('ordinary non-Coral input');",
    "JSON.parse('not Coral');",
    "localParse('also not Coral');",
  ].join('\n');
  const inputs = embeddedCoralInputs('packages/diagram-editor/test/sample.test.ts', source);
  assert.deepEqual(inputs.map(({ text }) => text).sort(), [
    'service "A" as a\nservice "B" as b\na -> b',
    'service "C"',
    'service "D" as d\nd -> d',
    'service "E" as e\ndatabase "F" as f\ne -> f',
    'service "G" as g\ng -> g',
  ]);
});

test('embedded discovery resolves canonical language imports from nested tests', () => {
  const source = [
    "import { parse } from '../../src/index.js';",
    "parse('service as a\\nservice as b\\na -> b');",
  ].join('\n');
  assert.deepEqual(
    embeddedCoralInputs('packages/language/test/nested/parser.test.ts', source)
      .map(({ text }) => text),
    ['service as a\nservice as b\na -> b'],
  );
});

test('embedded discovery rejects indirect uses of recognized parser imports', () => {
  const source = [
    "import { parse } from '@coral-viz/language';",
    "parse.call(undefined, 'service as a');",
    'const parser = parse;',
    "parser('service as b');",
  ].join('\n');
  assert.throws(
    () => embeddedCoralInputs('packages/diagram-editor/test/indirect.test.ts', source),
    /:2 recognized Coral parser import must be called directly.*:3 recognized Coral parser import must be called directly/s,
  );

  const namespaceSource = [
    "import * as language from '@coral-viz/language';",
    'const parser = language.parse;',
    "parser('service as c');",
  ].join('\n');
  assert.throws(
    () => embeddedCoralInputs('packages/diagram-editor/test/namespace-indirect.test.ts', namespaceSource),
    /:2 recognized Coral parser import must be called directly/,
  );

  const namespaceEscape = [
    "import * as language from '@coral-viz/language';",
    'const { parse } = language;',
    'const alias = language;',
    "const key = 'parse';",
    "language[key]('service as d');",
  ].join('\n');
  assert.throws(
    () => embeddedCoralInputs('packages/diagram-editor/test/namespace-escape.test.ts', namespaceEscape),
    /:2 recognized Coral parser namespace must not escape.*:3.*:5/s,
  );
});

test('embedded discovery inventories direct namespace parser calls', () => {
  const source = [
    "import * as language from '@coral-viz/language';",
    "language.parse('service as namespaceNode');",
    "language['parse']('service as bracketNode');",
  ].join('\n');
  assert.deepEqual(
    embeddedCoralInputs('packages/diagram-editor/test/namespace-direct.test.ts', source)
      .map(({ text }) => text).sort(),
    ['service as bracketNode', 'service as namespaceNode'],
  );

  const editorSource = [
    "import * as parsers from '../src/parsers';",
    "parsers.parseCoralDSL('service as editorNamespace');",
  ].join('\n');
  assert.deepEqual(
    embeddedCoralInputs('packages/diagram-editor/test/editor-namespace.test.ts', editorSource)
      .map(({ text }) => text),
    ['service as editorNamespace'],
  );
});

test('embedded discovery permits namespace parser references inside type queries', () => {
  const languageSource = [
    "import * as language from '@coral-viz/language';",
    'type LanguageParser = typeof language.parse;',
  ].join('\n');
  const editorSource = [
    "import * as parsers from '../src/parsers';",
    'type EditorParser = typeof parsers.parseCoralDSL;',
  ].join('\n');
  assert.deepEqual(
    embeddedCoralInputs('packages/diagram-editor/test/language-type-query.test.ts', languageSource),
    [],
  );
  assert.deepEqual(
    embeddedCoralInputs('packages/diagram-editor/test/editor-type-query.test.ts', editorSource),
    [],
  );
});

test('a kept-valid input with a removed = spelling fails', () => {
  const target = 'packages/language/test/fixtures/roundtrip/01-escaped-labels.coral';
  const failures = checkCorpus({
    files: repositoryFiles(), registry,
    read: (path) => (path === target ? `${read(path)}\na -> b [label = "x"]\n` : read(path)),
  });
  assert.ok(failures.some((failure) => failure.includes(`${target} contains removed spelling L2`)), failures.join('\n'));
});

test('a registered fragment containing a removed legacy arrow fails', () => {
  const target = 'packages/language/SPEC.md';
  const failures = checkCorpus({
    files: repositoryFiles(), registry,
    read: (path) => (path === target
      ? read(path).replace('require api above orders\n', 'require api above orders\na -> b data {"style":{"targetArrow":"arrow"}}\n')
      : read(path)),
  });
  assert.ok(failures.some((failure) => failure.includes('contains removed spelling L1')), failures.join('\n'));
});

test('a fragment entry that matches two fences fails', () => {
  const target = 'packages/language/SPEC.md';
  const failures = checkCorpus({
    files: repositoryFiles(), registry,
    read: (path) => (path === target ? `${read(path)}\n\`\`\`coral\nrequire api above orders\n\`\`\`\n` : read(path)),
  });
  assert.ok(failures.some((failure) => failure.includes('"require api above orders" matches 2 coral fences')), failures.join('\n'));
});

test('Tree-sitter corpus registration names current packaged 0.2.8 cases', () => {
  const entry = registry.entries.find((item) => item.id === 'tree-sitter-corpus');
  assert.ok(entry);
  const corpus = 'packages/tree-sitter-coral/test/corpus/coral-028.txt';
  assert.ok(existsSync(corpus));
  assert.ok(treeSitterCases(read(corpus)).length > 0);
  for (const filename of Object.keys(entry.caseCodes ?? {})) {
    assert.ok(existsSync(`packages/tree-sitter-coral/test/corpus/${filename}`), filename);
  }
});

test('an untagged fence that looks like Coral fails', () => {
  const target = 'README.md';
  const failures = checkCorpus({
    files: repositoryFiles(), registry,
    read: (path) => (path === target ? `${read(path)}\n\`\`\`\napi -> orders\n\`\`\`\n` : read(path)),
  });
  assert.ok(failures.some((failure) => failure.includes('untagged fence that looks like Coral')), failures.join('\n'));
});

// Joined source-entrypoint cases use the same registry and built reader as the full corpus.
const sourceConformance = JSON.parse(read(`${CONFORMANCE}/manifest.json`)).cases
  .filter(({ entryPoint }) => ['saved-source', 'saved-source-029', 'source-format'].includes(entryPoint));
const sourceCorpusFiles = sourceConformance.flatMap(({ source, canonical, successorCanonical }) => [
  `${CONFORMANCE}/${source}`, ...(canonical ? [`${CONFORMANCE}/${canonical}`] : []),
  ...(successorCanonical ? [`${CONFORMANCE}/${successorCanonical}`] : []),
]);
const sourceCorpusRegistry = { entries: registry.entries.filter(({ id }) => id === 'conformance') };
const checkSourceCorpus = (readOverride = read) => checkCorpus({
  files: sourceCorpusFiles, read: readOverride, registry: sourceCorpusRegistry,
});

test('the manifest corpus checks every source case and its exact CRLF formatter golden', () => {
  assert.equal(sourceConformance.length, 23);
  assert.equal(sourceCorpusFiles.length, 25);
  const exact = read(`${CONFORMANCE}/source/source-exact-crlf.coral`);
  assert.match(exact, /\r\n/);
  assert.doesNotMatch(exact, /(?<!\r)\n|\r(?!\n)/);
  assert.deepEqual(checkSourceCorpus(), []);
});

test('source manifest header and syntax findings require exact counts and ranges', () => {
  const manifestPath = `${CONFORMANCE}/manifest.json`;
  const changed = JSON.parse(read(manifestPath));
  changed.cases.find(({ id }) => id === 'source-header-unavailable')
    .expectedHeaderDiagnostics[0].range.end.offset++;
  changed.cases.find(({ id }) => id === 'source-unresolved-reference')
    .expectedDiagnostics[0].range.end.offset++;
  const failures = checkSourceCorpus(path => path === manifestPath ? JSON.stringify(changed) : read(path));
  assert.ok(failures.some(failure => failure.includes('source-header-unavailable.coral header:') &&
    failure.includes('range differs')), failures.join('\n'));
  assert.ok(failures.some(failure => failure.includes('source-unresolved-reference.coral syntax:') &&
    failure.includes('range differs')), failures.join('\n'));
  changed.cases.find(({ id }) => id === 'source-header-unavailable').expectedHeaderDiagnostics = [];
  const missing = checkSourceCorpus(path => path === manifestPath ? JSON.stringify(changed) : read(path));
  assert.ok(missing.some(failure => failure.includes('unexpected header.version.unavailable@2')), missing.join('\n'));
});

test('source canonical CRLF and staging-ownership drift fail the existing corpus guard', () => {
  const canonical = `${CONFORMANCE}/source/source-format-tabs.expected.coral`;
  const exact = `${CONFORMANCE}/source/source-exact-crlf.coral`;
  const manifestPath = `${CONFORMANCE}/manifest.json`;
  const changed = JSON.parse(read(manifestPath));
  changed.cases.find(({ id }) => id === 'source-successor-only-style').staging = 'available';
  const failures = checkSourceCorpus(path => [canonical, exact].includes(path) ? read(path).replaceAll('\r\n', '\n') :
    path === manifestPath ? JSON.stringify(changed) : read(path));
  assert.ok(failures.some(failure => failure.includes('source-exact-crlf.coral must retain CRLF bytes')), failures.join('\n'));
  assert.ok(failures.some(failure => failure.includes('differs from its exact source-format golden')), failures.join('\n'));
  assert.ok(failures.some(failure => failure.includes('source-successor-only-style.coral disagrees with its declared staging ownership')), failures.join('\n'));
});

test('the specification saved-source example uses the saved reader for located errors', () => {
  const target = 'packages/language/SPEC.md';
  const markdownRegistry = structuredClone(registry.entries.find(({ id }) => id === 'markdown'));
  markdownRegistry.fragments = { [target]: markdownRegistry.fragments[target] };
  const failures = checkCorpus({ files: [target], registry: { entries: [markdownRegistry],
    fragmentCodes: registry.fragmentCodes }, read: path => path === target ? read(path)
      .replace('request = api -> db [data]', 'request = api -> missing [data]') : read(path) });
  assert.ok(failures.some(failure => failure.includes('coral.reference.target.unresolved@4')), failures.join('\n'));
});
