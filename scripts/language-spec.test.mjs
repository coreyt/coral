import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  validateSourceLineEndings,
  SOURCE_DIAGNOSTIC_OWNERS,
  validateEntryPoints,
  validateCurrentSupport,
  validateSourceGrammar,
  validateSourceDiagnosticCatalog,
  validateConsumerDiagnosticCatalog,
  validateSymbolDiagnosticFixtures,
  validateConsumerDiagnosticFixtures,
  validateSuccessorProvenance,
  deriveCorpusCoverage,
  diagnosticExpectationMismatches,
  loadSpellings,
  validateCanonicalText,
  validateDiagnosticCatalog,
  validateFieldCoverage,
  validateLanguageVersion,
  validateParserCodes,
  validateProvenance,
  validateRequiredCoverage,
  validateSpellingCollisionFixtures,
  validateExpectedPositions,
  validateSpellings,
  verifyLanguageSpec,
} from './verify-language-spec.mjs';

const REQUIRED_PACKAGE_FILES = [
  'SPEC.md',
  'spec/grammar.ebnf',
  'spec/grammar-028.ebnf',
  'spec/upstream/graph-ir-4.0.candidate.schema.json',
  'spec/diagnostics.json',
  'spec/behavior-matrix.json',
  'spec/graphir-field-matrix.json',
  'spec/upstream/graph-ir.schema.json',
  'spec/conformance',
];

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('the language specification and conformance corpus verify', async () => {
  const summary = await verifyLanguageSpec();
  assert.match(summary, /language specification verified/);
});

test('the language package ships every normative artifact', async () => {
  const manifest = await readJson('packages/language/package.json');
  for (const file of REQUIRED_PACKAGE_FILES) {
    assert.ok(manifest.files.includes(file), `package files is missing ${file}`);
  }
});

test('the verifier fails closed when diagnostic triggers disappear', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  delete catalog.codes[0].trigger;
  assert.throws(() => validateDiagnosticCatalog(catalog), /missing trigger/);
});

test('the verifier fails closed when required branch coverage disappears', async () => {
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  for (const fixture of manifest.cases) {
    fixture.coverage = fixture.coverage.filter((item) => item !== 'route-relative-source-target-node-port');
  }
  assert.throws(
    () => validateRequiredCoverage(manifest.requiredCoverage, manifest.cases),
    /route-relative-source-target-node-port/
  );
});

test('the verifier fails closed when a pinned GraphIR field loses its disposition', async () => {
  const schema = await readJson('packages/language/spec/upstream/graph-ir.schema.json');
  const matrix = await readJson('packages/language/spec/graphir-field-matrix.json');
  matrix.dispositions = matrix.dispositions.filter(
    ({ record, field }) => !(record === 'GraphIR' && field === 'version')
  );
  assert.throws(() => validateFieldCoverage(schema, matrix.dispositions), /GraphIR.version/);
});

test('canonical validation rejects compact equals and wrong edge ID replay', () => {
  assert.throws(
    () => validateCanonicalText('@graph {"id":"g"}\nservice "A"\nservice "B"\na -> b [label="x"]\n', 'mutation'),
    /compatibility equals/
  );
  assert.throws(
    () => validateCanonicalText('@graph {"id":"g"}\nservice "A"\nservice "B"\na -> b data {"style":{"sourceArrow":"arrow"}}\n', 'mutation'),
    /removed legacy arrow/
  );
  assert.throws(
    () => validateCanonicalText('@graph {"id":"g"}\nservice "A"\nservice "B"\na -> b as custom\na -> b as a_to_b\n', 'mutation'),
    /redundant edge id/
  );
});

test('derived coverage fails when route-anchor syntax is removed', () => {
  const records = [{
    fixture: { id: 'route' },
    source: 'a -> b via waypoint p relative to source offset (1, 0), waypoint q relative to target offset (1, 0), waypoint n relative to b offset (1, 0)',
    graph: { version: '3.0.0', nodes: [], edges: [{ routeIntent: { waypoints: [
      { placement: { anchor: { kind: 'source' } } }, { placement: { anchor: { kind: 'target' } } },
      { placement: { anchor: { kind: 'node' } } }, { placement: { anchor: { kind: 'port' } } },
    ] } }] },
  }];
  assert.ok(!deriveCorpusCoverage(records).has('route-relative-source-target-node-port'));
});

test('provenance validation pins revision, schema, and type digests', async () => {
  const matrix = await readJson('packages/language/spec/graphir-field-matrix.json');
  matrix.typesSha256 = '0'.repeat(64);
  assert.throws(() => validateProvenance(matrix), /provenance/);
});

// Slice 53 spelling guard (R-063 AC-5, design section 9). Each check fails closed.

const spellingInputs = async () => ({
  matrix: await readJson('packages/language/spec/graphir-field-matrix.json'),
  module: await loadSpellings(),
});

test('spelling check 1: every in-scope row declares spellings and no other row does', async () => {
  const { matrix, module } = await spellingInputs();
  assert.doesNotThrow(() => validateSpellings(matrix, module.SPELLINGS));
  const missing = structuredClone(matrix);
  delete missing.dispositions.find(({ record, field }) => record === 'GraphEdge' && field === 'label').spellings;
  assert.throws(() => validateSpellings(missing, module.SPELLINGS), /GraphEdge.label declares no spellings/);
  const extra = structuredClone(matrix);
  extra.dispositions.find(({ record, field }) => record === 'GraphNode' && field === 'children').spellings = ['clause:body'];
  assert.throws(() => validateSpellings(extra, module.SPELLINGS), /GraphNode.children is out of the spelling scope/);
});

test('spelling check 2: SPELLINGS and the matrix declare the same pairs in both directions', async () => {
  const { matrix, module } = await spellingInputs();
  assert.throws(() => validateSpellings(matrix, [...module.SPELLINGS, ['GraphEdge.label', 'data:label']]),
    /GraphEdge.label data:label is in SPELLINGS but not the field matrix/);
  assert.throws(() => validateSpellings(matrix, module.SPELLINGS.filter(([row]) => row !== 'GraphNode.pinned')),
    /GraphNode.pinned clause:pinned is in the field matrix but not SPELLINGS/);
});

test('spelling check 4: no matrix entry names a removed spelling', async () => {
  const { matrix, module } = await spellingInputs();
  const legacy = structuredClone(matrix);
  legacy.dispositions.find(({ record, field }) => record === 'GraphEdge' && field === 'targetEnd').spellings.push('data:style.targetArrow');
  assert.throws(() => validateSpellings(legacy, [...module.SPELLINGS, ['GraphEdge.targetEnd', 'data:style.targetArrow']]),
    /removed spelling GraphEdge.targetEnd data:style.targetArrow/);
});

test('spelling check 5: every two-spelling row has a both-given invalid fixture', async () => {
  const { matrix } = await spellingInputs();
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  assert.doesNotThrow(() => validateSpellingCollisionFixtures(matrix, manifest.cases));
  for (const fixture of manifest.cases) {
    if (fixture.collides) fixture.collides = fixture.collides.filter((row) => row !== 'GraphEdge.properties');
  }
  assert.throws(() => validateSpellingCollisionFixtures(matrix, manifest.cases), /GraphEdge.properties has two spellings and no both-given invalid fixture/);
});

test('spelling check 6: parser codes are cataloged and parser-phase codes are errors', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const parser = await readFile('packages/language/src/parser/index.ts', 'utf8');
  assert.doesNotThrow(() => validateParserCodes(parser, catalog));
  assert.throws(() => validateParserCodes(`${parser}\nreport(ctx, 'error', 'coral.invented.code.invalid', '')`, catalog),
    /coral.invented.code.invalid is not cataloged/);
  assert.throws(() => validateParserCodes(`${parser}\nreportAt(ctx, \`coral.\${kind}.new-family.invalid\`, '')`, catalog),
    /undeclared dynamic parser code family/);
  const warning = structuredClone(catalog);
  warning.codes.find(({ code }) => code === 'coral.node.data-field.unsupported').severity = 'warning';
  assert.throws(() => validateParserCodes(parser, warning), /coral.node.data-field.unsupported is a parser-phase code without error severity/);
});

test('spelling check 7: every language version equals CORAL_LANGUAGE_VERSION', async () => {
  const { module } = await spellingInputs();
  const spec = await readFile('packages/language/SPEC.md', 'utf8');
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  const behavior = await readJson('packages/language/spec/behavior-matrix.json');
  assert.doesNotThrow(() => validateLanguageVersion(module.CORAL_LANGUAGE_VERSION, spec, manifest, behavior));
  assert.throws(() => validateLanguageVersion('9.9.9', spec, manifest, behavior), /SPEC.md title/);
  assert.throws(() => validateLanguageVersion(module.CORAL_LANGUAGE_VERSION, spec, { ...manifest, languageVersion: '0.0.1' }, behavior),
    /conformance manifest languageVersion/);
});

test('invalid expectations require exact numeric lines and validate related ranges', () => {
  assert.doesNotThrow(() => validateExpectedPositions({ id: 'x', expectedDiagnostics: [
    { code: 'coral.constraint.scope.invalid', line: 2 }, { code: 'coral.edge.field.duplicate', line: 3 },
  ] }));
  assert.throws(() => validateExpectedPositions({ id: 'x', expectedDiagnostics: ['coral.edge.field.duplicate'] }), /\{ code, line \}/);
  assert.throws(() => validateExpectedPositions({ id: 'x', expectedDiagnostics: [{ code: 'coral.edge.field.duplicate', line: null }] }),
    /no line/);
  assert.throws(() => validateExpectedPositions({ id: 'x', expectedDiagnostics: [{ code: 'coral.constraint.scope.invalid', line: null }] }), /no line/);
  assert.throws(() => validateExpectedPositions({ id: 'x', expectedDiagnostics: [{ code: 'coral.edge.field.duplicate', line: 1, related: [{}] }] }), /related/);
});

test('compact spelling guard rejects missing declarations and missing both-given fixtures', async () => {
  const { matrix, module } = await spellingInputs();
  const missingPair = structuredClone(matrix);
  missingPair.dispositions.find(row => row.record === 'GraphEdge' && row.field === 'sourceEnd').spellings = ['data:sourceEnd'];
  assert.throws(() => validateSpellings(missingPair, module.SPELLINGS), /GraphEdge.sourceEnd compact:end/);
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  for (const fixture of manifest.cases) if (fixture.collides) fixture.collides = fixture.collides.filter(row => row !== 'GraphEdge.targetEnd');
  assert.throws(() => validateSpellingCollisionFixtures(matrix, manifest.cases), /GraphEdge.targetEnd has two spellings/);
});

test('related expectations compare the complete ordered list and exact ranges', () => {
  const position = { line: 1, column: 0, offset: 0 };
  const range = { start: position, end: { line: 1, column: 1, offset: 1 } };
  const related = [{ message: 'again', position: { ...position }, range: structuredClone(range) }];
  const expected = [{ code: 'coral.edge.field.duplicate', line: 1, column: 0, range, related }];
  assert.doesNotThrow(() => validateExpectedPositions({ id: 'x', expectedDiagnostics: expected }));
  assert.deepEqual(diagnosticExpectationMismatches(expected, expected), []);
  const reordered = structuredClone(expected);
  reordered[0].related[0].position = { offset: 0, column: 0, line: 1 };
  assert.doesNotThrow(() => validateExpectedPositions({ id: 'x', expectedDiagnostics: reordered }));
  assert.deepEqual(diagnosticExpectationMismatches(expected, reordered), []);
  assert.match(diagnosticExpectationMismatches(expected, [{ ...expected[0], related: [] }]).join(), /related differs/);
  assert.match(diagnosticExpectationMismatches(expected, [{ ...expected[0], range: { start: position, end: { line: 1, column: 2, offset: 2 } } }]).join(), /range differs/);
  const broken = structuredClone(expected);
  broken[0].related[0].range.end.offset = -1;
  assert.throws(() => validateExpectedPositions({ id: 'x', expectedDiagnostics: broken }), /related/);
});

// Language 1.2 joins source edition 0.2.8 to explicit graph interchange.
test('entry point contracts reject source/interchange edition conflation', async () => {
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  assert.doesNotThrow(() => validateEntryPoints(manifest));
  manifest.cases.find(({ entryPoint }) => entryPoint === 'saved-source').edition = manifest.languageVersion;
  assert.throws(() => validateEntryPoints(manifest), /entry point edition\/representation/);
});

test('current support rejects historical slice labels as present support', async () => {
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  const behavior = await readJson('packages/language/spec/behavior-matrix.json');
  const deltas = await readJson('packages/language/spec/implementation-deltas.json');
  assert.doesNotThrow(() => validateCurrentSupport(manifest, behavior, deltas));
  manifest.cases[0].typescript = 'slice-52-delta';
  assert.throws(() => validateCurrentSupport(manifest, behavior, deltas), /stale or untested current support/);
  manifest.cases[0].typescript = 'supported';
  deltas.deltas[0].status = 'slice-20';
  assert.throws(() => validateCurrentSupport(manifest, behavior, deltas), /stale current support/);
});

test('source grammar drift fails even when graph grammar is unchanged', async () => {
  const grammar = await readFile('packages/language/spec/grammar-028.ebnf', 'utf8');
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  const entry = manifest.entryPoints['saved-source'];
  assert.doesNotThrow(() => validateSourceGrammar(grammar, entry));
  assert.throws(() => validateSourceGrammar(grammar.replace(/^diagram_line\s*=/m, 'wrong_header ='), entry), /missing production: diagram_line/);
  assert.throws(() => validateSourceGrammar(grammar.replace('"@diagram"', '"@unknown"'), entry), /header contract/);
  assert.throws(() => validateSourceGrammar(`${grammar}\n(* unreviewed grammar drift *)\n`, entry), /grammar digest drift/);
});

test('saved-source diagnostic namespace is checked independently of graph codes', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const header = await readFile('packages/language/src/parser/header028.ts', 'utf8');
  assert.doesNotThrow(() => validateSourceDiagnosticCatalog(catalog, [header]));
  catalog.sourceCodes = catalog.sourceCodes.filter(({ code }) => code !== 'header.version.unavailable');
  assert.throws(() => validateSourceDiagnosticCatalog(catalog, [header]), /header.version.unavailable is not cataloged/);
});

test('successor candidate provenance and every union-branch disposition fail closed', async () => {
  const fields = await readJson('packages/language/spec/graphir-field-matrix.json');
  const schema = await readFile('packages/language/spec/upstream/graph-ir-4.0.candidate.schema.json', 'utf8');
  const core = await readJson('node_modules/@graph-ir/core/package.json');
  const types = await readFile('node_modules/@graph-ir/core/dist/graph-ir-4.candidate.d.ts', 'utf8');
  const check = (successor = fields.successor, text = schema) => validateSuccessorProvenance(successor, text, core, types);
  assert.doesNotThrow(() => check());
  assert.throws(() => check({ ...fields.successor, status: 'released' }), /provenance drift/);
  assert.throws(() => check(fields.successor, `${schema}\n`), /provenance drift/);
  const missing = structuredClone(fields.successor);
  missing.dispositions = missing.dispositions.filter(({ pointer }) => pointer !== '#/$defs/InteractionMessageSuccessor/oneOf/1/properties/missingReceiver');
  assert.throws(() => check(missing), /missingReceiver/);
});


test('removing a whole saved-source diagnostic owner cannot hide its implementation', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const sources = await Promise.all(SOURCE_DIAGNOSTIC_OWNERS.map(owner => readFile(owner, 'utf8')));
  catalog.sourceCodes = catalog.sourceCodes.filter(({ owner }) => owner !== 'packages/language/src/parser/header028.ts');
  assert.throws(() => validateSourceDiagnosticCatalog(catalog, sources), /header\.[a-z.-]+ is not cataloged/);
});


test('exact source CRLF cannot silently normalize to LF', async () => {
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  const fixture = manifest.cases.find(({ id }) => id === 'source-exact-crlf');
  assert.equal(fixture.lineEndings, 'crlf');
  const source = await readFile(`packages/language/spec/conformance/${fixture.source}`, 'utf8');
  assert.doesNotThrow(() => validateSourceLineEndings(source, fixture));
  assert.throws(() => validateSourceLineEndings(source.replaceAll('\r\n', '\n'), fixture), /retain CRLF bytes/);
});

// Slice 60 (R-065): every code in the approved user-symbol diagnostics table,
// and the existing unregistered codes it relies on, is cataloged.
const SLICE_60_CODES = [
  'coral.symbol.unknown', 'coral.symbol.local.duplicate', 'coral.symbol.local.unused',
  'coral.symbol.local.late', 'coral.symbol.local.edition', 'coral.symbol.local.syntax', 'coral.symbol.local.unclosed', 'coral.symbol.local.field.required',
  'coral.symbol.local.field.duplicate', 'coral.symbol.local.field.invalid', 'coral.symbol.local.field.unknown',
  'coral.symbol.local.anchor.duplicate', 'coral.symbol.local.anchor.invalid',
  'coral.symbol.local.artwork.unclosed', 'coral.symbol.local.reserved-prefix',
  'coral.syntax.port.label.invalid', 'coral.syntax.port.max-connections.invalid',
  'coral.syntax.port.label.duplicate', 'coral.syntax.port.max-connections.duplicate',
  'coral.port.connections.exceeded',
  ...['parse', 'element.unsupported', 'attribute.unsupported', 'reference.unsupported', 'reference.cycle',
    'budget.exceeded', 'geometry.invalid', 'viewbox.invalid'].map((code) => `coral.artwork.svg.${code}`),
  'character.symbol.local-fallback', 'export.graphir.local-symbol.unsupported',
  'export.graphir.port-limit.exceeded', 'import.graphir.local-symbol.id-unsupported',
  'import.graphir.local-symbol.digest-mismatch', 'import.graphir.artwork.profile-unsupported',
  'import.graphir.artwork.rejected', 'import.graphir.artwork.noncanonical',
  'coral.port.duplicate', 'coral.port.anchor.symbol-unknown', 'coral.port.reference.missing',
  'coral.port.reference.direction',
];

test('Slice 60 user-symbol diagnostics are all cataloged', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const declared = new Set([...catalog.codes, ...catalog.sourceCodes, ...catalog.consumerCodes ?? []]
    .map(({ code }) => code));
  assert.deepEqual(SLICE_60_CODES.filter((code) => !declared.has(code)), []);
});

test('symbol definition parser codes are owned and checked like other saved-source codes', async () => {
  assert.ok(SOURCE_DIAGNOSTIC_OWNERS.includes('packages/language/src/parser/symbolDefinitions029.ts'));
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const sources = await Promise.all(SOURCE_DIAGNOSTIC_OWNERS.map(owner => readFile(owner, 'utf8')));
  assert.doesNotThrow(() => validateSourceDiagnosticCatalog(catalog, sources));
  catalog.sourceCodes = catalog.sourceCodes.filter(({ owner }) =>
    owner !== 'packages/language/src/parser/symbolDefinitions029.ts');
  assert.throws(() => validateSourceDiagnosticCatalog(catalog, sources), /coral\.symbol\.local\.[a-z.-]+ is not cataloged/);
});

test('consumer diagnostics fail closed on shape, duplication and owner drift', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const read = (path) => readFile(path, 'utf8');
  await assert.doesNotReject(() => validateConsumerDiagnosticCatalog(catalog, read));
  const withEntry = (entry) => ({ ...catalog, consumerCodes: [...catalog.consumerCodes, entry] });
  await assert.rejects(() => validateConsumerDiagnosticCatalog(withEntry({ ...catalog.consumerCodes[0] }), read),
    /duplicate/);
  await assert.rejects(() => validateConsumerDiagnosticCatalog(withEntry({ code: 'coral.symbol.local.new',
    severity: 'loud', phase: 'resolution', trigger: 'x', owner: 'slice-60:C3' }), read), /invalid consumer diagnostic/);
  await assert.rejects(() => validateConsumerDiagnosticCatalog(withEntry({ code: 'coral.syntax.port.label.invalid',
    severity: 'error', phase: 'resolution', trigger: 'x', owner: 'slice-60:C3' }), read), /also cataloged/);
  await assert.rejects(() => validateConsumerDiagnosticCatalog(withEntry({ code: 'coral.symbol.local.moved',
    severity: 'error', phase: 'resolution', trigger: 'x', owner: 'packages/render/src/interpretation028.ts' }), read),
  /does not emit/);
});

test('edition 0.2.9 saved source has its own entry point and fixtures', async () => {
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  assert.doesNotThrow(() => validateEntryPoints(manifest));
  assert.ok(manifest.cases.some(({ entryPoint, edition }) => entryPoint === 'saved-source-029' && edition === '0.2.9'));
  const missing = structuredClone(manifest);
  delete missing.entryPoints['saved-source-029'];
  assert.throws(() => validateEntryPoints(missing), /saved-source-029/);
});

test('every language-emitted Slice 60 diagnostic has a conformance fixture', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  assert.doesNotThrow(() => validateSymbolDiagnosticFixtures(catalog, manifest.cases));
  const without = manifest.cases.map((fixture) => ({ ...fixture,
    expectedDiagnostics: fixture.expectedDiagnostics.filter((item) =>
      (typeof item === 'string' ? item : item.code) !== 'coral.symbol.local.anchor.invalid') }));
  assert.throws(() => validateSymbolDiagnosticFixtures(catalog, without), /coral\.symbol\.local\.anchor\.invalid/);
});

test('every user-symbol read notice has a consumer diagnostic fixture', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const manifest = await readJson('packages/language/spec/conformance/manifest.json');
  assert.doesNotThrow(() => validateConsumerDiagnosticFixtures(catalog, manifest.cases));
  const without = manifest.cases.map((fixture) => {
    const copy = { ...fixture };
    delete copy.expectedConsumerDiagnostics;
    return copy;
  });
  assert.throws(() => validateConsumerDiagnosticFixtures(catalog, without), /coral\.symbol\.local\.conformance-unsupported/);
  const unknown = manifest.cases.map((fixture) => fixture.expectedConsumerDiagnostics
    ? { ...fixture, expectedConsumerDiagnostics: [{ code: 'coral.symbol.local.nope', line: 1, column: 0 }] } : fixture);
  assert.throws(() => validateConsumerDiagnosticFixtures(catalog, unknown), /unknown consumer diagnostic/);
});

test('saved-source codes owned by the header scanner carry the header phase', async () => {
  const catalog = await readJson('packages/language/spec/diagnostics.json');
  const sources = await Promise.all(SOURCE_DIAGNOSTIC_OWNERS.map(owner => readFile(owner, 'utf8')));
  assert.doesNotThrow(() => validateSourceDiagnosticCatalog(catalog, sources));
  const drifted = structuredClone(catalog);
  drifted.sourceCodes.find(({ code }) => code === 'header.directive.late').phase = 'source';
  assert.throws(() => validateSourceDiagnosticCatalog(drifted, sources), /header.directive.late/);
});
