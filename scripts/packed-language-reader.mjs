/** Saved-source reader assertions for one installed @coral-viz/language package.
 * Shared by the installed consumer and the local packed check; reads fixtures
 * from the source checkout and the package under test from its own directory. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyLanguageReader028(language, { root, packageDirectory }) {
  assert.equal(language.CORAL_LANGUAGE_VERSION, '1.3.0', 'Packed public language version');
  const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  const sourceDirectory = path.join(root, 'packages/language');
  for (const file of ['SPEC.md', 'spec/grammar.ebnf', 'spec/grammar-028.ebnf',
    'spec/diagnostics.json', 'spec/behavior-matrix.json', 'spec/graphir-field-matrix.json',
    'spec/implementation-deltas.json', 'spec/upstream/graph-ir.schema.json',
    'spec/upstream/graph-ir-4.0.candidate.schema.json', 'spec/conformance']) {
    assert.ok(manifest.files.includes(file), `Packed package manifest omits normative asset ${file}`);
  }
  const compareAsset = (file) => {
    const packed = path.join(packageDirectory, file);
    assert.ok(existsSync(packed), `Package omits ${file}`);
    if (statSync(packed).isDirectory()) {
      assert.deepEqual(readdirSync(packed).sort(), readdirSync(path.join(sourceDirectory, file)).sort(), file);
      for (const child of readdirSync(packed)) compareAsset(path.join(file, child));
    } else {
      assert.deepEqual(readFileSync(packed), readFileSync(path.join(sourceDirectory, file)),
        `Packed normative asset drift: ${file}`);
    }
  };
  for (const file of manifest.files.filter(file => file === 'SPEC.md' || file.startsWith('spec/'))) compareAsset(file);
  assert.match(readFileSync(path.join(packageDirectory, 'SPEC.md'), 'utf8'),
    /^# Coral Language Specification 1\.3\.0\b/);
  for (const file of ['behavior-matrix.json', 'implementation-deltas.json', 'conformance/manifest.json']) {
    assert.equal(JSON.parse(readFileSync(path.join(packageDirectory, 'spec', file), 'utf8')).languageVersion,
      language.CORAL_LANGUAGE_VERSION, file);
  }
  const contract = JSON.parse(readFileSync(path.join(packageDirectory, 'spec/conformance/manifest.json'), 'utf8'));
  for (const [name, edition, representation, grammar] of [
    ['saved-source', '0.2.8', 'source-document', 'grammar-028.ebnf'],
    ['source-format', '0.2.8', 'source-document', 'grammar-028.ebnf'],
    ['graph-interchange', 'graph-interchange-v1', 'graphir-3', 'grammar.ebnf'],
    ['graph-print', 'graph-interchange-v1', 'graphir-3', 'grammar.ebnf'],
  ]) {
    assert.equal(contract.entryPoints[name].edition, edition, name);
    assert.equal(contract.entryPoints[name].representation, representation, name);
    assert.equal(contract.entryPoints[name].grammar, grammar, name);
  }
  const importEntry = (name) => import(pathToFileURL(path.join(packageDirectory,
    manifest.exports[name].import)).href);
  const [interchange, printer] = await Promise.all([importEntry('./parser'), importEntry('./printer')]);
  assert.notEqual(interchange.parse, language.parse, 'Saved and graph interchange readers must remain distinct');
  const graphText = '@graph {"id":"packed-contract"}\nservice "API" as api\ndatabase "DB" as db\napi -> db as writes [label: "writes"]\n';
  const graph = interchange.parse(graphText);
  assert.equal(graph.success, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.graph.version, '3.0.0');
  const canonical = printer.printWithDiagnostics(graph.graph);
  assert.deepEqual(canonical.diagnostics, []);
  assert.equal(canonical.text, language.printWithDiagnostics(graph.graph).text);
  assert.deepEqual(interchange.parse(canonical.text).graph, graph.graph);
  for (const file of ['dist/index.js', 'dist/index.d.ts',
    'dist/parser/document028.js', 'dist/parser/header-manifest028.js',
    'spec/grammar-028.ebnf']) {
    assert.ok(existsSync(path.join(packageDirectory, file)), `Package omits ${file}`);
  }
  const profiles = language.HEADER_MANIFEST_028['0.2.8'];
  const runtime = { manifest: language.HEADER_MANIFEST_028, currentVersion: '0.2.8',
    trustedDigests: Object.fromEntries(Object.values(profiles).flatMap((edition) =>
      edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest]))) };
  const retiredSavedSource = language.parse(graphText, runtime);
  assert.equal(retiredSavedSource.header.source, graphText);
  assert.equal(retiredSavedSource.graph, undefined);
  assert.ok(retiredSavedSource.header.diagnostics.some(finding => finding.code === 'header.diagram.required'));
  const currentSource = '@diagram flowchart\na process\nb process\na -> b\n';
  assert.equal(interchange.parse(currentSource).success, false,
    'The explicit graph interchange reader must not accept saved source');
  const typeWords = {
    architecture: ['service', 'database'], flowchart: ['process', 'terminal'],
    block: ['block', 'block'], bpmn: ['task', 'task'],
    code: ['function', 'class'], aiml: ['model', 'dataset'],
    'data-engineering': ['source', 'warehouse'], sketch: ['box', 'box'],
    'uml-class': ['class', 'interface'], 'uml-sequence': ['participant', 'participant'],
    'uml-state': ['state', 'state'],
  };
  assert.deepEqual(Object.keys(typeWords).sort(),
    Object.keys(profiles).filter((profile) => profiles[profile].enabled !== false).sort());
  for (const [profile, [first, second]] of Object.entries(typeWords)) {
    const source = `@diagram ${profile}\na ${first}\nb ${second}\nlink = a -> b\n`;
    const document = language.parse(source, runtime);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], [], profile);
    assert.equal(document.header.source, source, profile);
    assert.equal(document.syntax.statements.find((item) => item.kind === 'edge')?.id?.value,
      'link', profile);
  }
  const fixture = (name) => readFileSync(path.join(root,
    `packages/browser/test/fixtures/acceptance028/${name}.coral`), 'utf8');
  for (const name of ['architecture-ports', 'block-ports', 'flowchart-draft',
    'bpmn-event', 'uml-class-named', 'uml-sequence-flat']) {
    const source = fixture(name);
    const document = language.parse(source, runtime);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], [], name);
    assert.equal(document.header.source, source, name);
  }
  const disabledSource = fixture('erd-relationship');
  const disabled = language.parse(disabledSource, runtime);
  assert.equal(disabled.header.source, disabledSource);
  assert.equal(disabled.header.header, undefined);
  assert.equal(disabled.graph, undefined);
  assert.ok(disabled.header.diagnostics.some((finding) =>
    finding.code === 'header.diagram.disabled' &&
    finding.range?.start.offset === disabledSource.indexOf('erd')));
  assert.ok(disabled.syntax.statements.length > 0,
    'disabled ERD text must remain available as recovered syntax');
  for (const [source, code, token] of [
    ['@diagram architecture\na service\nb service\na -> b [firstEnd: inventedMark]\n',
      'coral.syntax.connector.end-unknown', 'inventedMark'],
    ['@diagram architecture\na service\nb service\na -> b [style: "dotted,\tred"]\n',
      'coral.syntax.string.control', '\t'],
    ['@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "only" {\n  a -> b\n}\n',
    'coral.sequence.fragment.operands', 'alt'],
  ]) {
    const document = language.parse(source, runtime);
    assert.ok(document.syntax.diagnostics.some((finding) => finding.code === code &&
      finding.range?.start.offset === source.indexOf(token)), code);
    assert.equal(document.header.source, source);
  }
  const crlf = '@diagram architecture\r\n// Keep these bytes\r\na service\r\n' +
    'b service\r\na -> b [secondEnd: zeroToMany]\r\n';
  const typed = language.parse(crlf, runtime);
  assert.equal(language.parse, language.parseDocument028,
    'The packed root reader must be the 0.2.8 saved-document reader');
  assert.deepEqual([...typed.header.diagnostics, ...typed.syntax.diagnostics], []);
  assert.equal(typed.header.source, crlf);
  assert.equal(language.formatDocument028(crlf, runtime), crlf);
  const indented = '@diagram flowchart\r\n// Keep this comment\r\n\ta process\r\n';
  assert.equal(language.formatDocument028(indented, runtime), indented.replace('\ta', '  a'));
  assert.throws(() => language.formatDocument028('@diagram flowchart\na =\n', runtime),
    /coral\.format028\.source\.invalid/);
  assert.deepEqual(typed.graph?.edges[0]?.targetEnd?.marker,
    { kind: 'zero-or-many', fill: 'unspecified' });
}
