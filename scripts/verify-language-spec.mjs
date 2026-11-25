import { createHash } from 'node:crypto';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';

const SNAPSHOT_SHA256 = '0769a26cb4afd1d85dcad7b03be2cf35559a230603f92f3182d7af454fc4ad42';
const SOURCE_REVISION = 'c23e4bfb4ff077a1fb7901106056deb39b4299c0';
const SOURCE_SCHEMA_SHA256 = '0769a26cb4afd1d85dcad7b03be2cf35559a230603f92f3182d7af454fc4ad42';
const SUCCESSOR_SCHEMA_SHA256 = '4777d0d1cb41d12bc49e468fcd6e4312d45ad7243b696dba678a46a9bfeefebc';
const SUCCESSOR_TYPES_SHA256 = '5a1e8ee1814156981ee4920aee861a105677cf67cb8b463d6afdba641becfd73';
export const SOURCE_DIAGNOSTIC_OWNERS = Object.freeze([
  'packages/language/src/parser/header028.ts',
  'packages/language/src/parser/candidate028.ts',
  'packages/language/src/parser/connector028.ts',
  'packages/language/src/parser/spatialSource028.ts',
  'packages/language/src/parser/symbolDefinitions029.ts',
]);
const SUCCESSOR_CORE_REVISION = '606309d66e34dcb2b2a414183a9e43727b56e2fa';
const SOURCE_TYPES_SHA256 = 'c7af47656ba3c6eabc78ddba23247e2cf2a1d89d90367b08d6af43b0bba0755c';
const DISPOSITIONS = new Set(['dropped', 'degraded', 'unparsed', 'unsupported', 'invalid', 'rejected',
  'unsatisfied', 'duplicate', 'required', 'quote-required', 'unterminated']);

function fail(message) {
  throw new Error(`language spec: ${message}`);
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function validateDiagnosticCatalog(catalog) {
  if (catalog.catalogVersion !== '1.0.0' || !Array.isArray(catalog.codes) ||
      !Array.isArray(catalog.precedence) || catalog.precedence.length === 0) {
    fail('diagnostic catalog has the wrong shape/version');
  }
  unique(catalog.codes.map(({ code }) => code), 'diagnostic code');
  for (const entry of catalog.codes) {
    if (!/^coral\.[a-z0-9.-]+$/.test(entry.code)) fail(`invalid diagnostic code: ${entry.code}`);
    if (!DISPOSITIONS.has(entry.code.split('.').at(-1))) fail(`unknown diagnostic disposition: ${entry.code}`);
    if (!['error', 'warning', 'info'].includes(entry.severity)) fail(`invalid severity for ${entry.code}`);
    if (!['parse', 'semantic', 'capability', 'layout', 'print', 'compatibility'].includes(entry.phase)) {
      fail(`invalid phase for ${entry.code}`);
    }
    if (typeof entry.trigger !== 'string' || entry.trigger.trim() === '') fail(`missing trigger for ${entry.code}`);
  }
}

/** Saved-source diagnostics use header and source namespaces independently of graph interchange. */
export function validateSourceDiagnosticCatalog(catalog, sources) {
  if (!Array.isArray(catalog.sourceCodes) || !catalog.sourceCodes.length) fail('saved-source diagnostic catalog is empty');
  unique(catalog.sourceCodes.map(({ code }) => code), 'saved-source diagnostic code');
  const declared = new Set(catalog.sourceCodes.map(({ code }) => code));
  for (const item of catalog.sourceCodes) {
    if (!/^(?:header|coral)\.[a-z0-9.-]+$/.test(item.code) || !['header', 'source'].includes(item.phase) ||
      !item.trigger?.trim() || !SOURCE_DIAGNOSTIC_OWNERS.includes(item.owner)) fail(`invalid saved-source diagnostic ${item.code}`);
    if ((item.owner === 'packages/language/src/parser/header028.ts') !== (item.phase === 'header'))
      fail(`saved-source diagnostic ${item.code} phase does not match its owner`);
  }
  for (const source of sources) {
    for (const match of source.matchAll(/`((?:header|coral)\.[^`]*\$\{[^`]+)`/g)) {
      if (match[1] !== 'coral.reference.${role}.unresolved') fail(`undeclared saved-source diagnostic family ${match[1]}`);
      for (const role of ['source', 'target']) if (!declared.has(`coral.reference.${role}.unresolved`)) fail(`saved-source diagnostic coral.reference.${role}.unresolved is not cataloged`);
    }
    for (const match of source.matchAll(/['"]((?:header|coral)\.[a-z0-9.-]+)['"]/g)) {
      if (!declared.has(match[1])) fail(`saved-source diagnostic ${match[1]} is not cataloged`);
    }
  }
}

/** Diagnostics emitted after the saved-source readers (resolution, artwork
 * admission, rendering, GraphIR interchange). An implemented code names the
 * file that emits it; a planned code names its Slice delivery step. */
export async function validateConsumerDiagnosticCatalog(catalog, read) {
  if (!Array.isArray(catalog.consumerCodes) || !catalog.consumerCodes.length) fail('consumer diagnostic catalog is empty');
  unique(catalog.consumerCodes.map(({ code }) => code), 'consumer diagnostic code');
  const elsewhere = new Set([...catalog.codes, ...catalog.sourceCodes].map(({ code }) => code));
  for (const item of catalog.consumerCodes) {
    if (!/^(?:coral|character|export|import)\.[a-z0-9.-]+$/.test(item.code) ||
      !['error', 'warning', 'info'].includes(item.severity) ||
      !['catalog', 'resolution', 'admission', 'render', 'interchange'].includes(item.phase) ||
      !item.trigger?.trim() || typeof item.owner !== 'string' ||
      !/^(?:packages\/[a-z-]+\/src\/[A-Za-z0-9/._-]+\.ts|slice-[0-9]+:[A-Z][0-9a-z]+)$/.test(item.owner))
      fail(`invalid consumer diagnostic ${item.code}`);
    if (elsewhere.has(item.code)) fail(`consumer diagnostic ${item.code} is also cataloged as a graph or source code`);
    if (item.owner.startsWith('packages/') && !(await read(item.owner)).includes(item.code))
      fail(`consumer diagnostic owner ${item.owner} does not emit ${item.code}`);
  }
}

/** Every Slice 60 code that the language readers emit has a saved-source fixture. */
export function validateSymbolDiagnosticFixtures(catalog, cases) {
  const codes = catalog.sourceCodes.filter(({ code, owner }) =>
    owner === 'packages/language/src/parser/symbolDefinitions029.ts' || code.startsWith('coral.symbol.local.') ||
    /^coral\.syntax\.port\.(?:label|max-connections)\.(?:invalid|duplicate)$/.test(code))
    .map(({ code }) => code);
  const cited = new Set(cases.flatMap((fixture) => [...fixture.expectedDiagnostics, ...fixture.expectedHeaderDiagnostics ?? []]
    .map((item) => typeof item === 'string' ? item : item.code)));
  const missing = codes.filter((code) => !cited.has(code));
  if (missing.length) fail(`Slice 60 diagnostics without a conformance fixture: ${missing.join(', ')}`);
}

/** Every read-time notice that `userSymbolNotices029` emits has a corpus fixture,
 * and a fixture cites only cataloged consumer codes. */
export function validateConsumerDiagnosticFixtures(catalog, cases) {
  const consumer = new Set(catalog.consumerCodes.map(({ code }) => code));
  const cited = new Set();
  for (const fixture of cases) for (const item of fixture.expectedConsumerDiagnostics ?? []) {
    if (!consumer.has(item.code)) fail(`fixture ${fixture.id} cites unknown consumer diagnostic ${item.code}`);
    if (!Number.isInteger(item.line) || !Number.isInteger(item.column))
      fail(`fixture ${fixture.id} consumer diagnostic ${item.code} has no position`);
    cited.add(item.code);
  }
  const missing = catalog.consumerCodes.filter(({ owner }) => owner === 'packages/render/src/userSymbolNotices029.ts')
    .map(({ code }) => code).filter((code) => !cited.has(code));
  if (missing.length) fail(`read-time notices without a conformance fixture: ${missing.join(', ')}`);
}

export function validateEntryPoints(manifest) {
  const required = {
    'saved-source': ['0.2.8', 'source-document', 'grammar-028.ebnf'],
    'saved-source-029': ['0.2.9', 'source-document', 'grammar-028.ebnf'],
    'source-format': ['0.2.8', 'source-document', 'grammar-028.ebnf'],
    'graph-interchange': ['graph-interchange-v1', 'graphir-3', 'grammar.ebnf'],
    'graph-print': ['graph-interchange-v1', 'graphir-3', 'grammar.ebnf'],
  };
  for (const [id, [edition, representation, grammar]] of Object.entries(required)) {
    const entry = manifest.entryPoints?.[id];
    if (!entry || entry.edition !== edition || entry.representation !== representation || entry.grammar !== grammar ||
      !entry.exports?.length || !entry.guarantee) fail(`entry point ${id} has an incomplete edition/representation contract`);
  }
  for (const id of ['saved-source', 'saved-source-029'])
    if (!manifest.entryPoints[id].runtime?.includes('HeaderRuntime028')) fail(`${id} runtime contract is missing`);
  for (const [id, api] of [['saved-source', '@coral-viz/language#parse'], ['saved-source-029', '@coral-viz/language#parse'],
    ['source-format', '@coral-viz/language#formatDocument028'],
    ['graph-interchange', '@coral-viz/language/parser#parse'], ['graph-print', '@coral-viz/language#printWithDiagnostics']]) {
    if (!manifest.entryPoints[id].exports.includes(api)) fail(`entry point ${id} does not identify its public export`);
  }
  for (const fixture of manifest.cases) {
    const entry = manifest.entryPoints[fixture.entryPoint];
    if (!entry || fixture.edition !== entry.edition || fixture.representation !== entry.representation) {
      fail(`fixture ${fixture.id} does not match its entry point edition/representation`);
    }
    if (fixture.entryPoint !== 'graph-interchange' && (!fixture.exactSource ||
      !Array.isArray(fixture.expectedHeaderDiagnostics) || !['available', 'withheld'].includes(fixture.staging))) {
      fail(`saved-source fixture ${fixture.id} has no exact-source/staging contract`);
    }
  }
}

export function validateCurrentSupport(manifest, behavior, deltas) {
  for (const fixture of manifest.cases) {
    if (fixture.typescript !== 'supported' || fixture.treeSitter !== 'not-asserted' || !fixture.evidence) {
      fail(`fixture ${fixture.id} has stale or untested current support`);
    }
  }
  for (const item of behavior.behaviors) {
    if (!['supported', 'limited', 'unsupported'].includes(item.currentStatus) ||
      !manifest.entryPoints[item.entryPoint] || item.edition !== manifest.entryPoints[item.entryPoint].edition) {
      fail(`behavior ${item.id} has stale current support or edition`);
    }
  }
  const fixtureIds = new Set(manifest.cases.map(({ id }) => id));
  for (const item of behavior.behaviors) for (const id of item.fixtures ?? []) {
    if (!fixtureIds.has(id)) fail(`behavior ${item.id} cites unknown fixture ${id}`);
  }
  if (deltas.languageVersion !== manifest.languageVersion) fail('implementation deltas languageVersion drift');
  for (const delta of deltas.deltas) {
    if (!['supported', 'limited', 'unsupported', 'policy'].includes(delta.status) || !delta.evidence ||
      !manifest.entryPoints[delta.entryPoint]) fail(`delta ${delta.id} has stale current support`);
  }
}

export function validateSourceLineEndings(source, fixture, label = fixture.id) {
  if (fixture.lineEndings === undefined) return;
  if (fixture.lineEndings !== 'crlf' || !source.includes('\r\n') || /(?<!\r)\n/.test(source) || /\r(?!\n)/.test(source)) {
    fail(`${label} must retain CRLF bytes without bare LF or CR`);
  }
}

export function validateSourceGrammar(grammar, entry) {
  for (const production of ['document', 'diagram_line', 'directive_line', 'node', 'edge', 'port', 'node_reference',
    'route_block', 'sequence_fragment', 'sequence_note', 'sequence_activation', 'sequence_region',
    'sequence_group_line', 'spatial_constraint', 'layout']) {
    if (!new RegExp(`^${production}\\s*=`, 'm').test(grammar)) fail(`saved-source grammar is missing production: ${production}`);
  }
  if (!grammar.includes('"@diagram"') || !grammar.includes('"@coralVersion"')) fail('saved-source grammar lost its header contract');
  if (sha256(grammar) !== entry.grammarSha256) fail('saved-source grammar digest drift');
}

/** Every nested schema property, including each union branch, has its own disposition. */
export function successorSchemaFields(schema, path = '#', fields = new Set()) {
  if (!schema || typeof schema !== 'object') return fields;
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties') for (const field of Object.keys(value)) fields.add(`${path}/properties/${field}`);
    if (key === 'properties') {
      for (const [field, child] of Object.entries(value)) successorSchemaFields(child, `${path}/properties/${field}`, fields);
    } else successorSchemaFields(value, `${path}/${key}`, fields);
  }
  return fields;
}

export function validateSuccessorProvenance(successor, schemaText, core, typesText) {
  if (successor.schemaVersion !== '4.0.0' || successor.status !== 'reviewed-candidate' || successor.coreVersion !== '0.2.4' ||
      successor.coreRevision !== SUCCESSOR_CORE_REVISION || successor.schema !== 'upstream/graph-ir-4.0.candidate.schema.json' || successor.schemaSha256 !== SUCCESSOR_SCHEMA_SHA256 ||
      successor.typesSha256 !== SUCCESSOR_TYPES_SHA256 || sha256(schemaText) !== SUCCESSOR_SCHEMA_SHA256 ||
      core.version !== successor.coreVersion || core.gitHead !== successor.coreRevision || sha256(typesText) !== SUCCESSOR_TYPES_SHA256) {
    fail('successor candidate provenance drift');
  }
  const expected = successorSchemaFields(JSON.parse(schemaText));
  const actual = new Set(successor.dispositions.map(({ pointer }) => pointer));
  unique(successor.dispositions.map(({ pointer }) => pointer), 'successor field disposition');
  for (const pointer of expected) if (!actual.has(pointer)) fail(`successor field matrix is missing: ${pointer}`);
  for (const item of successor.dispositions) {
    if (/(?:InteractionMessageSuccessor\/oneOf\/[12]\/|ClassifierCompartment\/oneOf\/3\/|Classifier\/allOf\/2\/)/.test(item.pointer) && item.text !== 'unsupported') fail(`reserved successor branch has an authored claim: ${item.pointer}`);
    const record = item.pointer.match(/^#\/\$defs\/([^/]+)/)?.[1] ?? 'GraphIR';
    if (item.record !== record || item.field !== item.pointer.split('/').at(-1)) fail(`successor field identity drift: ${item.pointer}`);
    if (!expected.has(item.pointer) || !['authored', 'derived', 'non-semantic', 'unsupported'].includes(item.text) ||
      !item.syntax || !item.operation || !item.record || !item.field) fail(`invalid successor field disposition: ${item.pointer}`);
  }
}

function schemaFieldKeys(schema) {
  const keys = new Set(Object.keys(schema.properties ?? {}).map((field) => `GraphIR.${field}`));
  for (const [record, definition] of Object.entries(schema.$defs ?? {})) {
    for (const field of Object.keys(definition.properties ?? {})) keys.add(`${record}.${field}`);
    for (const branch of definition.oneOf ?? []) {
      for (const field of Object.keys(branch.properties ?? {})) keys.add(`${record}.${field}`);
    }
  }
  return keys;
}

function dispositionCoverage(dispositions) {
  const keys = new Set(dispositions.map(({ record, field }) => `${record}.${field}`));
  for (const field of ['id', 'strength', 'sourceInfo']) {
    if (!keys.has(`ConstraintBase.${field}`)) continue;
    keys.add(`ConstraintBaseProperties.${field}`);
    for (const record of ['RelativeConstraint', 'BoundaryConstraint', 'ArrangementConstraint']) {
      keys.add(`${record}.${field}`);
    }
  }
  for (const suffix of ['absolute', 'relative']) {
    for (const field of ['kind', 'position', 'anchor', 'offset']) {
      if (keys.has(`WaypointPlacement.${suffix}.${field}`)) keys.add(`WaypointPlacement.${field}`);
    }
  }
  for (const suffix of ['node', 'port']) {
    for (const field of ['kind', 'nodeId', 'portId']) {
      if (keys.has(`RouteAnchor.${suffix}.${field}`)) keys.add(`RouteAnchor.${field}`);
    }
  }
  for (const field of ['kind', 'nodeId']) {
    if (keys.has(`BoundaryScope.node.${field}`)) keys.add(`BoundaryScope.${field}`);
  }
  return keys;
}

export function validateFieldCoverage(schema, dispositions) {
  const expected = schemaFieldKeys(schema);
  const covered = dispositionCoverage(dispositions);
  const missing = [...expected].filter((key) => !covered.has(key)).sort();
  if (missing.length > 0) fail(`GraphIR field matrix is missing: ${missing.join(', ')}`);
}

export function validateRequiredCoverage(requiredCoverage, cases) {
  if (!Array.isArray(requiredCoverage) || requiredCoverage.length === 0) fail('required corpus coverage is empty');
  unique(requiredCoverage, 'required corpus coverage');
  const covered = new Set(cases.flatMap(({ coverage = [] }) => coverage));
  const missing = requiredCoverage.filter((item) => !covered.has(item));
  if (missing.length > 0) fail(`conformance coverage is missing: ${missing.join(', ')}`);
}

export function validateProvenance(fields) {
  if (fields.schemaVersion !== '3.0.0' || fields.sourceRevision !== SOURCE_REVISION ||
      fields.schemaSha256 !== SOURCE_SCHEMA_SHA256 || fields.typesSha256 !== SOURCE_TYPES_SHA256) {
    fail('GraphIR field matrix provenance is incomplete');
  }
}

// Slice 53 spelling guard (R-063 AC-5, design section 9).

const SPELLING_FORMS = new Set(['header', 'clause', 'token', 'attribute', 'body', 'prefix', 'parameter', 'data', 'compact']);
const CONSTRAINT_RECORDS = ['RelativeConstraint', 'BoundaryConstraint', 'ArrangementConstraint'];
const CONSTRAINT_FIELDS = new Set(['strength', 'gap', 'inset', 'alignment', 'direction']);
/** Removed spellings (L1-L4); no matrix entry may name one. */
const REMOVED_PAIRS = new Set([
  'GraphEdge.sourceEnd data:style.sourceArrow',
  'GraphEdge.targetEnd data:style.targetArrow',
  'GraphIR.layoutOptions header:layoutOptions.algorithmOptions',
  'GraphEdge.description data:description',
]);

/** Load the accepted-spelling source, which Node runs directly as erasable TypeScript. */
export async function loadSpellings(root = process.cwd()) {
  return import(pathToFileURL(join(root, 'packages/language/src/spellings.ts')).href);
}

/** Whether a field-matrix row is in the spelling scope: concrete authored GraphIR records only. */
export function inSpellingScope({ record, field, text }) {
  if (record === 'GraphIR') return ['id', 'name', 'metadata', 'layoutOptions'].includes(field);
  if (record === 'GraphNode' || record === 'GraphEdge') {
    return !['derived', 'projection-only', 'implicit'].includes(text) && !(record === 'GraphEdge' && field === 'style');
  }
  if (record === 'EdgeStyle') return field === 'lineStyle' || field === 'routing';
  return CONSTRAINT_RECORDS.includes(record) && CONSTRAINT_FIELDS.has(field);
}

/** Checks 1, 2, and 4: scope, both-direction pair equality, and no removed spelling. */
export function validateSpellings(matrix, spellings) {
  const declared = new Set();
  for (const row of matrix.dispositions) {
    const key = `${row.record}.${row.field}`;
    if (!inSpellingScope(row)) {
      if (row.spellings !== undefined) fail(`${key} is out of the spelling scope and must not declare spellings`);
      continue;
    }
    if (!Array.isArray(row.spellings) || row.spellings.length === 0) fail(`${key} declares no spellings`);
    unique(row.spellings, `${key} spelling`);
    for (const spelling of row.spellings) {
      const form = spelling.slice(0, spelling.indexOf(':'));
      if (!SPELLING_FORMS.has(form) || spelling.indexOf(':') < 1) fail(`${key} spelling ${spelling} has an unknown form`);
      if (REMOVED_PAIRS.has(`${key} ${spelling}`) || spelling.includes('=')) fail(`${key} names the removed spelling ${key} ${spelling}`);
      declared.add(`${key} ${spelling}`);
    }
  }
  const source = new Set(spellings.map(([row, spelling]) => `${row} ${spelling}`));
  for (const pair of source) {
    if (REMOVED_PAIRS.has(pair)) fail(`SPELLINGS names the removed spelling ${pair}`);
    if (!declared.has(pair)) fail(`${pair} is in SPELLINGS but not the field matrix`);
  }
  for (const pair of declared) if (!source.has(pair)) fail(`${pair} is in the field matrix but not SPELLINGS`);
}

/** Check 5: every row with two spellings is named by a both-given invalid fixture that expects a duplicate. */
export function validateSpellingCollisionFixtures(matrix, cases) {
  const rows = new Set(matrix.dispositions.filter((row) => (row.spellings?.length ?? 0) > 1)
    .map(({ record, field }) => `${record}.${field}`));
  const named = new Set(cases.filter((fixture) => fixture.category === 'invalid' &&
    expectedCodes(fixture).some((code) => code.endsWith('.field.duplicate')))
    .flatMap(({ collides = [] }) => collides));
  for (const fixture of cases) {
    for (const row of fixture.collides ?? []) if (!rows.has(row)) fail(`fixture ${fixture.id} collides names ${row}, which has one spelling`);
  }
  for (const row of rows) if (!named.has(row)) fail(`${row} has two spellings and no both-given invalid fixture`);
}

/**
 * Parser code templates and the values their variable ranges over. A new
 * template must be declared here, so its expansions are checked too.
 */
const DYNAMIC_PARSER_CODES = new Map([
  ['coral.${kind}.data-field.unsupported', ['graph', 'node', 'edge']],
  ['coral.${kind}.data-field.invalid', ['graph', 'node', 'edge']],
  ['coral.${kind}.field.duplicate', ['node', 'edge', 'constraint']],
  ['coral.${kind}.reserved-key.invalid', ['node', 'edge']],
  ['coral.${kind}.id.invalid', ['node', 'edge']],
  ['coral.attribute.${attr.key}.invalid', ['label', 'description']],
]);

/** Check 6: every parser code is cataloged, and every parse- or semantic-phase code is an error. */
export function validateParserCodes(parserSource, catalog) {
  const cataloged = new Map(catalog.codes.map((entry) => [entry.code, entry]));
  const codes = new Set([...parserSource.matchAll(/['"`](coral\.[a-z0-9.-]+[a-z0-9])['"`]/g)].map((match) => match[1]));
  // A template is a diagnostic code when it ends in a disposition; derived ids such
  // as `coral.constraint.${kind}.${ordinal}` are not codes.
  const disposition = [...DISPOSITIONS].join('|');
  for (const match of parserSource.matchAll(new RegExp(`\`(coral\\.[^\`]*\\$\\{[^\`]*\\.(?:${disposition}))\``, 'g'))) {
    const values = DYNAMIC_PARSER_CODES.get(match[1]);
    if (!values) fail(`undeclared dynamic parser code family ${match[1]}`);
    for (const value of values) codes.add(match[1].replace(/\$\{[^}]+\}/, value));
  }
  for (const code of codes) if (!cataloged.has(code)) fail(`parser code ${code} is not cataloged`);
  for (const entry of catalog.codes) {
    if (['parse', 'semantic'].includes(entry.phase) && entry.severity !== 'error') {
      fail(`${entry.code} is a parser-phase code without error severity`);
    }
  }
}

/** Check 7: the SPEC title and both JSON languageVersion fields equal CORAL_LANGUAGE_VERSION. */
export function validateLanguageVersion(version, spec, manifest, behavior) {
  const title = spec.split('\n').find((line) => line.startsWith('# ')) ?? '';
  if (!title.includes(version)) fail(`SPEC.md title does not name Coral Language ${version}`);
  if (manifest.languageVersion !== version) fail(`conformance manifest languageVersion is not ${version}`);
  if (behavior.languageVersion !== version) fail(`behavior matrix languageVersion is not ${version}`);
}

const diagnosticEvidence = new Map([
  ['coral.attribute.empty.unparsed', /\[\s*\]/],
  ['coral.attribute.equals.unsupported', /\[[^\]\n]*\b[A-Za-z_]\w*\s*=/],
  ['coral.attribute.value.unparsed', /\[[^\]\n]*\b\w+\s*:\s*(?!true\b|false\b|null\b)[A-Za-z_]/],
  ['coral.attribute.label.invalid', /\blabel\s*:\s*(?:-?\d|true\b|false\b|null\b)/],
  ['coral.constraint.distance.invalid', /\b(?:gap|inset)\s*:\s*-/],
  ['coral.constraint.dynamic-membership.unsupported', /\bchildren\s+of\b/],
  ['coral.constraint.id.invalid', /\bconstraint\s+([A-Za-z_]\w*)[\s\S]*\bconstraint\s+\1\b/],
  ['coral.constraint.field.duplicate', /\brequire\b[^\n]*\[[^\]\n]*\b(?:required|preferred)\b|\[[^\]\n]*\b(gap|inset|alignment|direction)\s*:[^\]\n]*\b\1\s*:|\[[^\]\n]*\b(?:required|preferred)\b[^\]\n]*\b(?:required|preferred)\b/],
  ['coral.constraint.parameter.invalid', /\bat\s+the\s+\w+\s*\[[^\]]*\balignment\s*:|^arrange\b[^\n]*\[[^\]\n]*\b(?:required|preferred)\b|\b(?:alignment|direction)\s*:\s*"/m],
  ['coral.constraint.reference.unresolved.invalid', /\b(?:above|below|of)\s+missing\b/],
  ['coral.constraint.scope.invalid', /\brequire\s+outside\s+at\s+the\s+\w+\s+of\s+backend\b/],
  ['coral.edge.field.duplicate', /(?:\([^\n]*\)[^\n]*->|->[^\n]*\(|->[^\n]*(?:\b(?:solid|dashed|dotted)\s*,\s*(?:solid|dashed|dotted)\b|\[[^\]\n]*\b([A-Za-z_]\w*)\s*:[^\]\n]*\b\1\s*:|\[[^\]\n]*\S[^\n]*\bdata\s*\{"properties"|"(?:source|target)Arrow"))/],
  ['coral.edge.legacy-arrow.unsupported', /"(?:source|target)Arrow"\s*:/],
  ['coral.edge.reserved-key.invalid', /\[[^\]]*\b_[A-Za-z0-9_]+\s*:|"properties"\s*:\s*\{[^\n]*"_[A-Za-z0-9_]+"\s*:/],
  ['coral.edge.id.invalid', /->[^\n]*\bas\s+(?:""|([A-Za-z_]\w*)\b[\s\S]*->[^\n]*\bas\s+\1\b)/],
  ['coral.edge.data-field.invalid', /->[^\n]*\bdata\s*\{/],
  ['coral.edge.data-field.unsupported', /->[^\n]*\bdata\s*\{/],
  ['coral.graph.data-field.invalid', /^@graph\s*\{/m],
  ['coral.graph.data-field.unsupported', /^@graph\s*\{/m],
  ['coral.json.key.duplicate', /("(?:[^"\\]|\\.)*")\s*:[^\n]*\1\s*:/],
  ['coral.label-placement.range.invalid', /\blabel\s+center\s+offset\s+(?!0(?:\D|$))|\blabel\s+\w+\s+at\s+(?:1(?:\.\d*[1-9])|[2-9])\b/],
  ['coral.node.field.duplicate', /^\s*("?)([A-Za-z_]\w*)\1\s*:[^\n]*\n\s*"?\2"?\s*:/m],
  ['coral.node.id.invalid', /^[^\n>]*\bas\s+(?:""|([A-Za-z_]\w*)\b[\s\S]*^[^\n>]*\bas\s+\1\b)/m],
  ['coral.node.data-field.invalid', /^[^\n>]*\bdata\s*\{/m],
  ['coral.node.data-field.unsupported', /^[^\n>]*\bdata\s*\{/m],
  ['coral.node.pin.invalid', /^(?![^\n]*@\s*\()[^\n]*\bpinned\b/m],
  ['coral.node.reserved-key.invalid', /^\s*_[A-Za-z0-9_]+\s*:/m],
]);

/** Exact primary positions and optional complete related-location expectations. */
export function validateExpectedPositions(fixture) {
  const position = (value) => value && Number.isInteger(value.line) && value.line >= 1 &&
    Number.isInteger(value.column) && value.column >= 0 && Number.isInteger(value.offset) && value.offset >= 0;
  const range = (value) => value && position(value.start) && position(value.end) &&
    value.end.offset >= value.start.offset && (value.end.line > value.start.line ||
      (value.end.line === value.start.line && value.end.column >= value.start.column));
  for (const entry of fixture.expectedDiagnostics) {
    if (typeof entry !== 'object' || entry === null || typeof entry.code !== 'string') {
      fail(`invalid fixture ${fixture.id} must list { code, line } expectations`);
    }
    const keys = Object.keys(entry);
    if (keys.some((key) => !['code', 'line', 'endLine', 'column', 'range', 'related'].includes(key))) fail(`invalid fixture ${fixture.id} expectation has an unknown key`);
    if (!Number.isInteger(entry.line) || entry.line < 1) {
      fail(`invalid fixture ${fixture.id} gives ${entry.code} no line`);
    }
    if (entry.column !== undefined && (!Number.isInteger(entry.column) || entry.column < 0)) fail(`invalid fixture ${fixture.id} has invalid column`);
    if (entry.range !== undefined && (!range(entry.range) || entry.range.start.line !== entry.line ||
      (entry.column !== undefined && entry.range.start.column !== entry.column))) fail(`invalid fixture ${fixture.id} has invalid range`);
    if (entry.related !== undefined && (!entry.range || !Array.isArray(entry.related) || entry.related.some(item =>
      !item || typeof item.message !== 'string' || !position(item.position) || !range(item.range) ||
      !isDeepStrictEqual(item.position, item.range.start)))) fail(`invalid fixture ${fixture.id} has invalid related locations`);
    if (entry.endLine !== undefined && (!Number.isInteger(entry.endLine) || entry.endLine < entry.line)) {
      fail(`invalid fixture ${fixture.id} gives ${entry.code} an invalid endLine`);
    }
  }
}

/** Compare optional detailed expectations without weakening exact code/line counts. */
export function diagnosticExpectationMismatches(expected, actual) {
  const remaining = [...actual];
  const mismatches = [];
  for (const entry of expected) {
    const index = remaining.findIndex(item => item.code === entry.code && item.line === entry.line &&
      (entry.column === undefined || item.column === entry.column));
    const item = remaining.splice(index < 0 ? remaining.length : index, 1)[0];
    if (!item) { mismatches.push(`missing ${entry.code}@${entry.line}`); continue; }
    for (const field of ['column', 'range', 'related']) {
      if (entry[field] !== undefined && !isDeepStrictEqual(entry[field], item[field])) mismatches.push(`${entry.code}@${entry.line} ${field} differs`);
    }
  }
  for (const item of remaining) mismatches.push(`unexpected ${item.code}@${item.line}`);
  return mismatches;
}

/** Expected diagnostic codes, whether listed as codes or as `{ code, line }` entries. */
export function expectedCodes(fixture) {
  return fixture.expectedDiagnostics.map((entry) => (typeof entry === 'string' ? entry : entry.code));
}

export function validateDiagnosticEvidence(fixture, source) {
  for (const code of expectedCodes(fixture)) {
    const evidence = diagnosticEvidence.get(code);
    if (evidence && !evidence.test(source)) fail(`fixture ${fixture.id} has no source evidence for ${code}`);
  }
}

export function deriveCorpusCoverage(records) {
  const source = records.map(({ source }) => source).join('\n');
  const canonicals = records.map(({ canonical = '' }) => canonical).join('\n');
  const graphs = records.map(({ graph }) => graph).filter(Boolean);
  const constraints = graphs.flatMap(({ constraints = [] }) => constraints);
  const edges = graphs.flatMap(({ edges = [] }) => edges);
  const covered = new Set();
  const add = (name, condition) => { if (condition) covered.add(name); };
  add('ordinary-graph', graphs.some((graph) => graph.nodes?.length && graph.edges?.length) && /@graph\s+\{/.test(source));
  add('preferred-relative-all-directions', ['above', 'below', 'left', 'right'].every((word) => new RegExp(`\\b${word}\\b`).test(source)) &&
    constraints.some(({ kind, strength }) => kind === 'relative' && strength === 'preferred'));
  add('preferred-boundary-graph-and-scope', /\bat\s+the\s+\w+(?:\s|$)/.test(source) && /\bat\s+the\s+\w+\s+of\s+/.test(source) &&
    constraints.some(({ kind, scope }) => kind === 'boundary' && scope?.kind === 'graph') &&
    constraints.some(({ kind, scope }) => kind === 'boundary' && scope?.kind === 'node'));
  add('preferred-arrangement-row-and-column', /\bas\s+row\b/.test(source) && /\bas\s+column\b/.test(source) &&
    ['row', 'column'].every((axis) => constraints.some(({ kind, axis: value }) => kind === 'arrangement' && value === axis)));
  add('required-relative-boundary-arrangement', ['relative', 'boundary', 'arrangement'].every((kind) =>
    constraints.some((constraint) => constraint.kind === kind && constraint.strength === 'required')));
  add('identified-constraint-parameters', /\bconstraint\s+\S+\s*:/.test(source) && /\b(?:gap|inset|alignment|direction)\s*:/.test(source));
  add('route-absolute-derived-and-identified', /\bvia\s+\(/.test(source) && /\bvia\s+waypoint\s+\S+\s+at\s+\(/.test(source) &&
    edges.some(({ routeIntent }) => routeIntent?.waypoints?.some(({ placement }) => placement.kind === 'absolute')));
  add('route-relative-source-target-node-port', ['source', 'target'].every((anchor) => new RegExp(`relative to ${anchor}\\b`).test(source)) &&
    /relative to (?!source\b|target\b|port\b)[A-Za-z_]/.test(source) && /relative to port\s+/.test(source) &&
    ['source', 'target', 'node', 'port'].every((kind) => edges.some(({ routeIntent }) =>
      routeIntent?.waypoints?.some(({ placement }) => placement.anchor?.kind === kind))));
  add('label-placement-node-and-edge', /\bas\s+\w+\s+label\s+/.test(source) && /->[^\n]*\blabel\s+(?:above|below|left|right|center)\b/.test(source));
  add('dynamic-membership-rejection-and-fixed-membership-edit', /\bchildren\s+of\b/.test(source) &&
    records.some(({ fixture, source: text, graph }) => fixture.id === 'roundtrip-fixed-membership-edit' &&
      /\bas\s+queue\b/.test(text) && graph?.constraints?.some(({ subjects = [] }) =>
        subjects.map(({ nodeId }) => nodeId).join(',') === 'api,worker')));
  add('invalid-reference-scope-identity', /\bmissing\b/.test(source) && /\brequire\s+outside\b/.test(source) &&
    /\bconstraint\s+(\w+)[\s\S]*\bconstraint\s+\1\b/.test(source));
  add('invalid-range-and-parameter-applicability', /\blabel\s+center\s+offset\s+[1-9]/.test(source) && /\bgap\s*:\s*-/.test(source) &&
    /\bat\s+the\s+\w+\s*\[[^\]]*alignment\s*:/.test(source));
  add('invalid-attribute-and-reserved-key', /^\s*_[A-Za-z0-9_]+\s*:/m.test(source) &&
    /\[[^\]]*\b_[A-Za-z0-9_]+\s*:/.test(source) && /\[\s*\]/.test(source) && /\blabel\s*:\s*\d/.test(source));
  add('canonical-defaults', /\bgap\s*:\s*0\b/.test(source) && !/\bgap\s*:\s*0\b/.test(canonicals));
  add('graphir-mapping-goldens', graphs.length >= 1 && graphs.every(({ version }) => version === '3.0.0'));
  add('uml-class-structured', records.some(({ fixture, graph }) => fixture.id === 'uml-class-structured' &&
    graph?.profile?.id === 'uml' && graph.profile.kind === 'class' &&
    graph.nodes?.some(({ classifier }) => classifier?.kind === 'class' && classifier.compartments?.some(({ kind }) => kind === 'attributes')) &&
    graph.nodes?.some(({ classifier }) => classifier?.kind === 'interface' && classifier.compartments?.some(({ kind }) => kind === 'operations')) &&
    graph.nodes?.some(({ classifier }) => classifier?.kind === 'enum' && classifier.compartments?.some(({ kind }) => kind === 'literals'))));
  add('uml-sequence-core', records.some(({ fixture, graph }) => fixture.id === 'uml-sequence-core' &&
    graph.profile?.kind === 'sequence' && graph.interaction?.participantOrder?.length > 0 &&
    graph.interaction?.activations?.length > 0 && graph.interaction?.notes?.length > 0 &&
    ['loop', 'alt', 'opt'].every((kind) => graph.interaction?.fragments?.some((fragment) => fragment.kind === kind))));
  add('valid-relationship-ends', edges.some(({ sourceEnd, targetEnd }) =>
    sourceEnd?.role && sourceEnd?.multiplicity && sourceEnd?.navigability && sourceEnd?.marker && targetEnd?.marker));
  add('invalid-relationship-ends', records.some(({ fixture }) => fixture.id === 'invalid-relationship-ends'));
  add('spelling-collisions', records.some(({ fixture, source: text }) => fixture.category === 'invalid' &&
    ['coral.edge.field.duplicate', 'coral.node.field.duplicate', 'coral.constraint.field.duplicate']
      .every((code) => expectedCodes(fixture).includes(code)) &&
    /->[^\n]*\[[^\]\n]*\b(\w+)\s*:[^\]\n]*\][^\n]*\bdata\s*\{[^\n]*"properties"\s*:\s*\{[^\n]*"\1"\s*:/.test(text) &&
    /\[(?:[^\]\n]*,\s*)?(?:solid|dashed|dotted)\s*,\s*(?:solid|dashed|dotted)\b/.test(text) &&
    /->[^\n]*\[[^\]\n]*\b([A-Za-z_]\w*)\s*:[^\]\n]*\b\1\s*:/.test(text) &&
    /^\s*("?)([A-Za-z_]\w*)\1\s*:[^\n]*\n\s*"?\2"?\s*:/m.test(text) &&
    /\[[^\]\n]*\b(gap|inset|alignment|direction)\s*:[^\]\n]*\b\1\s*:/.test(text) &&
    /\[[^\]\n]*\b(?:required|preferred)\b[^\]\n]*\b(?:required|preferred)\b/.test(text) &&
    /\brequire\b[^\n]*\[[^\]\n]*\b(?:required|preferred)\b/.test(text)));
  add('noncanonical-spellings-rejected', records.some(({ fixture, source: text }) => fixture.category === 'invalid' &&
    ['coral.node.id.invalid', 'coral.edge.id.invalid', 'coral.graph.data-field.unsupported', 'coral.graph.data-field.invalid',
      'coral.node.data-field.unsupported', 'coral.node.data-field.invalid', 'coral.edge.data-field.unsupported',
      'coral.edge.data-field.invalid', 'coral.attribute.value.unparsed', 'coral.constraint.parameter.invalid']
      .every((code) => expectedCodes(fixture).includes(code)) &&
    /^arrange\b[^\n]*\[[^\]\n]*\b(?:required|preferred)\b/m.test(text) &&
    /"properties"\s*:\s*\{[^\n]*"\w+"\s*:\s*(?:-?\d|"|true\b|false\b|null\b)/.test(text) &&
    /\b(?:alignment|direction)\s*:\s*"/.test(text) &&
    /\bas\s+""/.test(text)));
  add('legacy-spellings-removed',
    records.some(({ fixture, source: text }) => fixture.category === 'invalid' &&
      expectedCodes(fixture).includes('coral.edge.legacy-arrow.unsupported') &&
      /"sourceArrow"\s*:/.test(text) && /"targetArrow"\s*:/.test(text)) &&
    records.some(({ fixture, source: text }) => fixture.category === 'invalid' &&
      expectedCodes(fixture).includes('coral.attribute.equals.unsupported') &&
      /->[^\n]*\[[^\]\n]*\b[A-Za-z_]\w*\s*=/.test(text) &&
      /\b(?:require|constraint|arrange)\b[^\n]*\[[^\]\n]*\b(?:gap|inset|alignment|direction)\s*=/.test(text)));
  add('canonical-relationship-end-normalization',
    records.some(({ fixture, source: input, canonical }) => fixture.category === 'canonical' &&
      /\([^\n]*diamond[^\n]*\)\s*->/.test(input) && /\(1 "owner" diamond\)\s*->/.test(canonical ?? '')));
  return covered;
}

function validateCoralStructure(source, label) {
  let depth = 0;
  let sawDeclaration = false;
  let sawHeader = false;
  for (const [index, raw] of source.replaceAll('\r\n', '\n').split('\n').entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('//')) continue;
    if (line.startsWith('@graph')) {
      if (sawHeader || sawDeclaration || depth !== 0) fail(`${label}:${index + 1} has misplaced @graph`);
      sawHeader = true;
      continue;
    }
    if (line === '}') {
      depth--;
      if (depth < 0) fail(`${label}:${index + 1} has unmatched closing brace`);
      continue;
    }
    // A sequence `} else … {` operand closes one block and opens the next.
    if (/^\}\s*else\b.*\{$/.test(line)) {
      if (depth < 1) fail(`${label}:${index + 1} has unmatched closing brace`);
      continue;
    }
    sawDeclaration = true;
    if (line.endsWith('{') && !line.endsWith('{ }')) depth++;
  }
  if (depth !== 0) fail(`${label} has unclosed node body`);
}

function splitAttributes(text) {
  const values = [];
  let quoted = false;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (escaped) escaped = false;
    else if (character === '\\' && quoted) escaped = true;
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(text.slice(start).trim());
  return values;
}

function validateGrammarForms(source, fixture) {
  for (const line of source.split(/\r?\n/)) {
    if (!line.includes('->')) continue;
    const match = line.match(/\[([^\]]*)\]/);
    if (!match) continue;
    const tokens = splitAttributes(match[1]);
    if (tokens.length === 1 && tokens[0] === '') {
      if (!expectedCodes(fixture).includes('coral.attribute.empty.unparsed')) {
        fail(`fixture ${fixture.id} has an unclaimed empty attribute list`);
      }
      continue;
    }
    if (tokens.some((token) => token === '')) fail(`fixture ${fixture.id} has an unclaimed empty attribute entry`);
    let index = 0;
    // `=` is the removed Language 0.2 spelling; only a fixture that expects its error may use it.
    const separator = expectedCodes(fixture).includes('coral.attribute.equals.unsupported') ? '(?::|=)' : ':';
    const named = (token) => new RegExp(`^(?:[A-Za-z_]\\w*|"(?:[^"\\\\]|\\\\.)*")\\s*${separator}`).test(token);
    const style = (token) => /^(?:solid|dashed|dotted)$/.test(token);
    if (!named(tokens[index]) && !style(tokens[index])) index++; // relation type
    if (style(tokens[index])) index++;
    // A repeated line style is claimed only by a fixture that expects the collision.
    if (expectedCodes(fixture).includes('coral.edge.field.duplicate')) while (style(tokens[index])) index++;
    for (; index < tokens.length; index++) {
      if (!named(tokens[index])) fail(`fixture ${fixture.id} edge attributes disagree with grammar: ${tokens[index]}`);
    }
  }
}

function unquote(value) {
  return value?.startsWith('"') ? JSON.parse(value) : value;
}

/** Parentheses inside quoted roles do not terminate endpoint annotations. */
function edgeDeclarationMatch(line) {
  const reference = '("(?:[^"\\\\]|\\\\.)*"|[A-Za-z_]\\w*)';
  const end = '(?:\\s*\\((?:[^"()]|"(?:[^"\\\\]|\\\\.)*")*\\))?';
  return line.match(new RegExp(`^${reference}${end}\\s*->\\s*${reference}${end}(?:\\s+as\\s+${reference})?`));
}

function validateSourceGoldenCorrespondence(source, graph, label) {
  const nodeIds = new Set();
  const edgeIds = new Set();
  const constraintIds = new Set();
  const expectedEdgeIds = [];
  const allocatedEdgeIds = new Set();
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (/^(?:attributes|operations|literals)(?:\s+as\s+(?:"(?:[^"\\]|\\.)*"|[A-Za-z_]\w*))?\s*\{$/.test(line) ||
        /^(?:[+\-#~]\s+|attribute\s+|operation\s+|literal\s+)/.test(line)) continue;
    // UML sequence statements carry interaction identities, not node or edge ids.
    if (/^(?:loop|alt|opt)(?:\s+"(?:[^"\\]|\\.)*")?(?:\s+as\s+\S+)?\s*\{$/.test(line) || /^\}\s*else\b/.test(line) ||
        /^activation\s+\S+\s+from\s/.test(line) || /^note\s+"(?:[^"\\]|\\.)*"\s+on\s/.test(line)) continue;
    const edge = edgeDeclarationMatch(line);
    if (edge) {
      const base = `${labelToId(unquote(edge[1])) || 'node'}_to_${labelToId(unquote(edge[2])) || 'node'}`;
      const speculative = allocate(base, allocatedEdgeIds);
      const explicit = unquote(edge[3]);
      if (explicit) {
        edgeIds.add(explicit);
        allocatedEdgeIds.delete(speculative);
        allocatedEdgeIds.add(explicit);
        expectedEdgeIds.push(explicit);
      } else {
        expectedEdgeIds.push(speculative);
      }
      continue;
    }
    const constraint = line.match(/^constraint\s+("(?:[^"\\]|\\.)*"|[A-Za-z_]\w*)\s*:/);
    if (constraint) {
      constraintIds.add(unquote(constraint[1]));
      continue;
    }
    if (/^(?:arrange|require|@graph|})\b/.test(line)) continue;
    const node = line.match(/^(?:"(?:[^"\\]|\\.)*"|[A-Za-z_]\w*(?:-\w+)*)\s+(?:"(?:[^"\\]|\\.)*"\s+)?as\s+("(?:[^"\\]|\\.)*"|[A-Za-z_]\w*)/);
    if (node) nodeIds.add(unquote(node[1]));
  }
  const goldenNodes = collectNodes(graph.nodes, undefined);
  const goldenEdges = new Set(graph.edges.map(({ id }) => id));
  const goldenConstraints = new Set((graph.constraints ?? []).map(({ id }) => id));
  for (const id of nodeIds) if (!goldenNodes.has(id)) fail(`${label} source node ${id} is absent from its GraphIR golden`);
  for (const id of edgeIds) if (!goldenEdges.has(id)) fail(`${label} source edge ${id} is absent from its GraphIR golden`);
  for (const id of constraintIds) if (!goldenConstraints.has(id)) fail(`${label} source constraint ${id} is absent from its GraphIR golden`);
  if (expectedEdgeIds.length !== graph.edges.length || expectedEdgeIds.some((id, index) => graph.edges[index].id !== id)) {
    fail(`${label} source and GraphIR golden disagree about derived edge identity`);
  }
  const sourceHasRoute = /->[^\n]*\bvia\b/.test(source);
  const graphHasRoute = graph.edges.some(({ routeIntent }) => routeIntent?.waypoints?.length);
  if (sourceHasRoute !== graphHasRoute) fail(`${label} source and GraphIR golden disagree about route intent`);
}

function validateCanonicalPair(source, canonical, label) {
  const quotedLabels = (text) => [...text.matchAll(/^(?:[A-Za-z_]\w*(?:-\w+)*|"[^"]+")\s+"((?:[^"\\]|\\.)*)"/gm)]
    .map((match) => match[1]).sort();
  const endpoints = (text) => [...text.matchAll(/^(\S+)\s*->\s*(\S+)/gm)]
    .map((match) => `${match[1]}->${match[2]}`).sort();
  if (JSON.stringify(quotedLabels(source)) !== JSON.stringify(quotedLabels(canonical)) ||
      JSON.stringify(endpoints(source)) !== JSON.stringify(endpoints(canonical))) {
    fail(`${label} canonical source and golden disagree on declarations`);
  }
}

function labelToId(label) {
  return label.toLowerCase()
    .replace(/[.\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function allocate(base, taken) {
  const root = base === '' ? 'node' : base;
  if (!taken.has(root)) {
    taken.add(root);
    return root;
  }
  for (let number = 2; ; number++) {
    const candidate = `${root}_${number}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

export function validateCanonicalText(source, label) {
  validateCoralStructure(source, label);
  const significant = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('//'));
  if (!significant[0]?.startsWith('@graph ')) fail(`${label} canonical output must start with @graph`);
  if (/\b[A-Za-z_][A-Za-z0-9_]*\s*=/.test(source)) fail(`${label} canonical output uses compatibility equals`);
  if (/"(?:source|target)Arrow"/.test(source)) fail(`${label} canonical output uses a removed legacy arrow`);
  const nodeIds = new Set();
  const edgeIds = new Set();
  for (const line of significant) {
    const node = line.match(/^(?:"(?:[^"\\]|\\.)*"|[A-Za-z_][\w-]*)\s+"((?:[^"\\]|\\.)*)"(?:\s+as\s+("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*))?/);
    if (node) {
      const labelText = JSON.parse(`"${node[1]}"`);
      const allocated = allocate(labelToId(labelText), nodeIds);
      if (node[2]) {
        const explicit = node[2].startsWith('"') ? JSON.parse(node[2]) : node[2];
        if (allocated === explicit) fail(`${label} contains redundant node id ${explicit}`);
        nodeIds.delete(allocated);
        nodeIds.add(explicit);
      }
      continue;
    }
    const edge = edgeDeclarationMatch(line);
    if (!edge) continue;
    const endpoint = (value) => value.startsWith('"') ? JSON.parse(value) : value;
    const allocated = allocate(`${labelToId(endpoint(edge[1]))}_to_${labelToId(endpoint(edge[2]))}`, edgeIds);
    if (edge[3]) {
      const explicit = endpoint(edge[3]);
      if (explicit === allocated) fail(`${label} contains redundant edge id ${allocated}`);
      edgeIds.delete(allocated);
      edgeIds.add(explicit);
    }
  }
}

function collectNodes(nodes, parent, result = new Map()) {
  for (const node of nodes) {
    if (result.has(node.id)) fail(`GraphIR golden duplicates node id ${node.id}`);
    if (parent === undefined && node.parent !== undefined) fail(`top-level node ${node.id} has parent`);
    if (parent !== undefined && node.parent !== parent) fail(`child ${node.id} does not name parent ${parent}`);
    result.set(node.id, node);
    collectNodes(node.children ?? [], node.id, result);
  }
  return result;
}

function validateGraphSemantics(graph, label) {
  const nodes = collectNodes(graph.nodes, undefined);
  const edgeIds = new Set();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) fail(`${label} duplicates edge id ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) fail(`${label} has unresolved edge ${edge.id}`);
    const waypointIds = new Set();
    for (const waypoint of edge.routeIntent?.waypoints ?? []) {
      if (waypointIds.has(waypoint.id)) fail(`${label} duplicates waypoint id ${waypoint.id}`);
      waypointIds.add(waypoint.id);
      const anchor = waypoint.placement.anchor;
      if (anchor?.nodeId && !nodes.has(anchor.nodeId)) fail(`${label} has unresolved waypoint node ${anchor.nodeId}`);
      if (anchor?.kind === 'port' && !nodes.get(anchor.nodeId)?.ports?.some(({ id }) => id === anchor.portId)) {
        fail(`${label} has unresolved waypoint port ${anchor.nodeId}.${anchor.portId}`);
      }
    }
  }
  const constraintIds = new Set();
  for (const constraint of graph.constraints ?? []) {
    if (constraintIds.has(constraint.id)) fail(`${label} duplicates constraint id ${constraint.id}`);
    constraintIds.add(constraint.id);
    const references = [constraint.subject, constraint.target, ...(constraint.subjects ?? [])].filter(Boolean);
    for (const reference of references) {
      if (!nodes.has(reference.nodeId)) fail(`${label} has unresolved constraint node ${reference.nodeId}`);
    }
    if (constraint.scope?.kind === 'node' && !nodes.has(constraint.scope.nodeId)) {
      fail(`${label} has unresolved boundary scope ${constraint.scope.nodeId}`);
    }
    if (constraint.strength === undefined) fail(`${label} must materialize constraint strength in mapping goldens`);
  }
}

export async function verifyLanguageSpec(root = process.cwd()) {
  const language = join(root, 'packages/language');
  const spec = join(language, 'spec');
  const corpus = join(spec, 'conformance');
  const required = [
    'packages/language/SPEC.md',
    'packages/language/spec/grammar.ebnf',
    'packages/language/spec/grammar-028.ebnf',
    'packages/language/spec/upstream/graph-ir-4.0.candidate.schema.json',
    'packages/language/spec/diagnostics.json',
    'packages/language/spec/behavior-matrix.json',
    'packages/language/spec/graphir-field-matrix.json',
    'packages/language/spec/implementation-deltas.json',
    'packages/language/spec/upstream/graph-ir.schema.json',
    'packages/language/spec/conformance/manifest.json',
  ];
  const parseJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
  const corpusReal = await realpath(corpus);
  const corpusPath = async (candidate) => {
    if (isAbsolute(candidate)) fail(`corpus path is absolute: ${candidate}`);
    const resolved = resolve(corpus, candidate);
    const lexical = relative(corpus, resolved);
    if (lexical === '..' || lexical.startsWith(`..${sep}`) || isAbsolute(lexical)) {
      fail(`corpus path escapes root: ${candidate}`);
    }
    if ((await lstat(resolved)).isSymbolicLink()) fail(`corpus path is a symlink: ${candidate}`);
    const actual = await realpath(resolved);
    const physical = relative(corpusReal, actual);
    if (physical === '..' || physical.startsWith(`..${sep}`) || isAbsolute(physical)) {
      fail(`corpus path resolves outside root: ${candidate}`);
    }
    return resolved;
  };

  for (const path of required) await access(join(root, path));
  const prose = await readFile(join(language, 'SPEC.md'), 'utf8');
  for (const heading of [
    'Authority and scope',
    'Characters, whitespace, comments, and tokens',
    'Spatial language tiers',
    'References and semantic validation',
    'Canonical printing',
    'Round-trip and compatibility guarantees',
    'GraphIR disposition',
  ]) {
    if (!prose.includes(heading)) fail(`SPEC.md is missing section: ${heading}`);
  }
  for (const [index, block] of [...prose.matchAll(/```coral\n([\s\S]*?)```/g)].entries()) {
    validateCoralStructure(block[1], `SPEC.md coral example ${index + 1}`);
  }
  for (const match of prose.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (!target.startsWith('#') && !/^[a-z]+:/i.test(target)) await access(resolve(language, target));
  }

  const grammar = await readFile(join(spec, 'grammar.ebnf'), 'utf8');
  for (const production of ['blank_line', 'graph_header', 'node_label_placement', 'edge_label_placement', 'required_constraint', 'identified_constraint', 'waypoint']) {
    if (!new RegExp(`^${production}\\s*=`, 'm').test(grammar)) fail(`grammar is missing production: ${production}`);
  }

  const catalog = await parseJson(join(spec, 'diagnostics.json'));
  validateDiagnosticCatalog(catalog);
  validateSourceDiagnosticCatalog(catalog, await Promise.all(SOURCE_DIAGNOSTIC_OWNERS.map((owner) => readFile(join(root, owner), 'utf8'))));
  await validateConsumerDiagnosticCatalog(catalog, (owner) => readFile(join(root, owner), 'utf8'));
  const diagnosticCodes = new Set([...catalog.codes, ...catalog.sourceCodes, ...catalog.consumerCodes].map(({ code }) => code));

  const manifest = await parseJson(join(corpus, 'manifest.json'));
  if (!Array.isArray(manifest.cases)) fail('conformance manifest has the wrong shape');
  unique(manifest.cases.map(({ id }) => id), 'conformance case id');
  validateEntryPoints(manifest);
  validateSourceGrammar(await readFile(join(spec, 'grammar-028.ebnf'), 'utf8'), manifest.entryPoints['saved-source']);
  validateRequiredCoverage(manifest.requiredCoverage, manifest.cases);
  validateSymbolDiagnosticFixtures(catalog, manifest.cases);
  validateConsumerDiagnosticFixtures(catalog, manifest.cases);
  const fixtureIds = new Set(manifest.cases.map(({ id }) => id));
  const categories = new Set(manifest.cases.map(({ category }) => category));
  for (const expected of ['valid', 'invalid', 'canonical', 'roundtrip']) {
    if (!categories.has(expected)) fail(`conformance corpus has no ${expected} case`);
  }

  const schemaText = await readFile(join(spec, 'upstream/graph-ir.schema.json'), 'utf8');
  if (sha256(schemaText) !== SNAPSHOT_SHA256) fail('pinned GraphIR schema snapshot digest changed');
  const schema = JSON.parse(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validateGraph = ajv.compile(schema);

  const fields = await parseJson(join(spec, 'graphir-field-matrix.json'));
  validateProvenance(fields);
  unique(fields.dispositions.map(({ record, field }) => `${record}.${field}`), 'GraphIR field disposition');
  for (const item of fields.dispositions) {
    if (!item.text || !item.syntax || !item.operation) fail(`field disposition is incomplete: ${item.record}.${item.field}`);
  }
  validateFieldCoverage(schema, fields.dispositions);
  const successorSchemaText = await readFile(join(spec, 'upstream/graph-ir-4.0.candidate.schema.json'), 'utf8');
  const installedSuccessor = await readFile(join(root, 'node_modules/@graph-ir/core/dist/schemas/graph-ir-4.0.candidate.schema.json'), 'utf8');
  if (successorSchemaText !== installedSuccessor) fail('installed and packaged successor schemas differ');
  validateSuccessorProvenance(fields.successor, successorSchemaText,
    await parseJson(join(root, 'node_modules/@graph-ir/core/package.json')),
    await readFile(join(root, 'node_modules/@graph-ir/core/dist/graph-ir-4.candidate.d.ts'), 'utf8'));

  const deltas = await parseJson(join(spec, 'implementation-deltas.json'));
  unique(deltas.deltas.map(({ id }) => id), 'implementation delta');

  const corpusRecords = [];
  for (const fixture of manifest.cases) {
    if (!Array.isArray(fixture.requirements) || !Array.isArray(fixture.graphir) ||
        !Array.isArray(fixture.expectedDiagnostics) || !Array.isArray(fixture.coverage)) {
      fail(`fixture metadata is incomplete: ${fixture.id}`);
    }
    const sourcePath = await corpusPath(fixture.source);
    const source = await readFile(sourcePath, 'utf8');
    if (fixture.entryPoint !== 'graph-interchange') {
      validateSourceLineEndings(source, fixture);
      const headerExpectations = fixture.expectedHeaderDiagnostics;
      for (const code of [...expectedCodes(fixture), ...headerExpectations.map(({ code }) => code)]) {
        if (!diagnosticCodes.has(code)) fail(`fixture ${fixture.id} cites unknown saved-source diagnostic ${code}`);
      }
      if (fixture.category === 'invalid' && !fixture.expectedDiagnostics.length && !headerExpectations.length) fail(`invalid saved-source fixture ${fixture.id} has no findings`);
      validateExpectedPositions(fixture);
      validateExpectedPositions({ id: fixture.id, expectedDiagnostics: headerExpectations });
      if (fixture.successorCanonical) {
        const printed = await readFile(await corpusPath(fixture.successorCanonical), 'utf8');
        if (!printed.endsWith('\n') || /\r/.test(printed)) fail(`${fixture.successorCanonical} must be LF writer output`);
      }
      if (fixture.canonical) {
        const canonical = await readFile(await corpusPath(fixture.canonical), 'utf8');
        validateSourceLineEndings(canonical, fixture, fixture.canonical);
        const expected = source.replace(/(^|\n)([ \t]+)/g, (_match, newline, indent) => newline + indent.replace(/\t/g, '  '));
        if (canonical !== expected) fail(`saved-source canonical drift: ${fixture.id}`);
      }
      let graph;
      if (fixture.expectedGraphIR) {
        graph = await parseJson(await corpusPath(fixture.expectedGraphIR));
        if (!validateGraph(graph)) fail(`${fixture.id} staging GraphIR fails pinned schema`);
      }
      if ((fixture.staging === 'available') !== Boolean(graph)) fail(`saved-source fixture ${fixture.id} staging golden mismatch`);
      corpusRecords.push({ fixture, source, graph });
      continue;
    }
    validateCoralStructure(source, fixture.id);
    validateGrammarForms(source, fixture);
    validateDiagnosticEvidence(fixture, source);
    for (const code of expectedCodes(fixture)) {
      if (!diagnosticCodes.has(code)) fail(`fixture ${fixture.id} cites unknown diagnostic ${code}`);
    }
    if (fixture.category === 'invalid' && fixture.expectedDiagnostics.length === 0) fail(`invalid fixture ${fixture.id} has no expected diagnostic`);
    if (fixture.category === 'invalid') validateExpectedPositions(fixture);
    else if (fixture.expectedDiagnostics.length > 0) fail(`${fixture.category} fixture ${fixture.id} expects diagnostics`);
    let canonical;
    if (fixture.category === 'canonical') {
      if (!fixture.canonical) fail(`canonical fixture ${fixture.id} has no golden output`);
      canonical = await readFile(await corpusPath(fixture.canonical), 'utf8');
      validateCanonicalText(canonical, fixture.id);
      validateCanonicalPair(source, canonical, fixture.id);
    }
    if (['valid', 'roundtrip'].includes(fixture.category) && !fixture.expectedGraphIR) {
      fail(`${fixture.category} fixture ${fixture.id} has no GraphIR mapping golden`);
    }
    let graph;
    if (fixture.expectedGraphIR) {
      const graphPath = await corpusPath(fixture.expectedGraphIR);
      graph = await parseJson(graphPath);
      if (!validateGraph(graph)) fail(`${fixture.id} GraphIR fails pinned schema: ${ajv.errorsText(validateGraph.errors)}`);
      validateGraphSemantics(graph, fixture.id);
      validateSourceGoldenCorrespondence(source, graph, fixture.id);
    }
    corpusRecords.push({ fixture, source, canonical, graph });
  }
  const derivedCoverage = deriveCorpusCoverage(corpusRecords.filter(({ fixture }) => fixture.entryPoint === 'graph-interchange'));
  for (const { fixture, source, graph } of corpusRecords.filter(({ fixture }) => fixture.entryPoint !== 'graph-interchange')) {
    for (const coverage of fixture.coverage) {
      const demonstrated = coverage === 'saved-source-crlf' ? fixture.lineEndings === 'crlf' && /\r\n/.test(source) && !/(?<!\r)\n/.test(source) :
        coverage === 'saved-source-exact-bytes' ? fixture.exactSource && /\r\n|'|style:|note /.test(source) :
        coverage === 'saved-source-staging' ? Boolean(graph) :
        coverage === 'saved-source-header-refusal' ? fixture.expectedHeaderDiagnostics.length > 0 :
        coverage === 'saved-source-semantic-refusal' ? expectedCodes(fixture).some(code => code.startsWith('coral.reference.')) :
        coverage === 'saved-source-formatting' ? Boolean(fixture.canonical) && /\t/.test(source) :
        coverage === 'saved-source-successor-only' ? fixture.staging === 'withheld' && fixture.category !== 'invalid' :
        coverage === 'saved-source-ports-containment' ? /port \[direction:/.test(source) && /group \{/.test(source) :
        coverage === 'saved-source-classes' ? /@diagram uml-class/.test(source) && /operations \{/.test(source) :
        coverage === 'saved-source-sequences' ? /@diagram uml-sequence/.test(source) && /note /.test(source) :
        coverage === 'saved-source-spatial' ? /constraint order: node/.test(source) :
        coverage === 'saved-source-invalid-spacing' ? expectedCodes(fixture).includes('coral.syntax.spacing.invalid') :
        coverage === 'saved-source-symbol-definitions' ? fixture.edition === '0.2.9' && /^@symbol [A-Za-z_]/m.test(source) &&
          fixture.category !== 'invalid' && fixture.staging === 'withheld' :
        coverage === 'saved-source-symbol-raw-block' ? fixture.exactSource && [...source.matchAll(/artwork svg """\r?\n([\s\S]*?)^"""\r?$/gm)]
          .some(([, raw]) => ['//', '{', '}', '@', '<', '"'].every((text) => raw.includes(text))) :
        coverage === 'saved-source-symbol-diagnostics' ? fixture.category === 'invalid' &&
          [...expectedCodes(fixture), ...fixture.expectedHeaderDiagnostics.map(({ code }) => code)]
            .some((code) => code.startsWith('coral.symbol.local.')) :
        coverage === 'saved-source-symbol-canonical' ? Boolean(fixture.successorCanonical) && /^@symbol /m.test(source) :
        coverage === 'saved-source-port-fields' ? fixture.edition === '0.2.9' && fixture.category !== 'invalid' &&
          /port \[[^\]]*label: "/.test(source) && /port \[[^\]]*maxConnections: [1-9]/.test(source) : false;
      if (demonstrated) derivedCoverage.add(coverage);
    }
  }
  const missingDerived = manifest.requiredCoverage.filter((item) => !derivedCoverage.has(item));
  if (missingDerived.length > 0) fail(`fixture content does not prove coverage: ${missingDerived.join(', ')}`);
  const validSources = await Promise.all(manifest.cases.filter(({ category }) => category === 'valid').map(async ({ source }) => readFile(await corpusPath(source), 'utf8')));
  if (validSources.some((source) => /arrange\s+children\s+of/.test(source))) fail('dynamic membership appears in a valid fixture');
  const membership = manifest.cases.find(({ id }) => id === 'roundtrip-fixed-membership-edit');
  const membershipGraph = await parseJson(await corpusPath(membership.expectedGraphIR));
  const subjects = membershipGraph.constraints[0].subjects.map(({ nodeId }) => nodeId);
  if (subjects.includes('queue') || subjects.join(',') !== 'api,worker') fail('membership-edit fixture does not prove fixed arrangement subjects');

  const behavior = await parseJson(join(spec, 'behavior-matrix.json'));
  if (!Array.isArray(behavior.behaviors)) fail('behavior matrix has the wrong shape');
  validateCurrentSupport(manifest, behavior, deltas);
  for (const item of [...manifest.cases, ...deltas.deltas]) await access(join(root, item.evidence));

  const spellingModule = await loadSpellings(root);
  validateSpellings(fields, spellingModule.SPELLINGS);
  validateSpellingCollisionFixtures(fields, manifest.cases);
  validateParserCodes(await readFile(join(language, 'src/parser/index.ts'), 'utf8'), catalog);
  validateLanguageVersion(spellingModule.CORAL_LANGUAGE_VERSION, prose, manifest, behavior);
  unique(behavior.behaviors.map(({ id }) => id), 'behavior id');
  for (const item of behavior.behaviors) {
    if (!item.syntax || !item.parser || !item.printer || !Array.isArray(item.graphir) ||
        !Array.isArray(item.consumers) || !Array.isArray(item.fixtures) || !Array.isArray(item.diagnosticCodes)) {
      fail(`behavior ${item.id} is incomplete`);
    }
    for (const id of item.fixtures) if (!fixtureIds.has(id)) fail(`behavior ${item.id} cites unknown fixture ${id}`);
    for (const code of item.diagnosticCodes) if (!diagnosticCodes.has(code)) fail(`behavior ${item.id} cites unknown diagnostic ${code}`);
    if (item.llmSubset !== null && !behavior.llmSafeSubsets?.[item.llmSubset]) fail(`behavior ${item.id} cites unknown LLM subset`);
  }

  const packageManifest = await parseJson(join(language, 'package.json'));
  for (const entry of ['SPEC.md', 'spec/grammar.ebnf', 'spec/grammar-028.ebnf', 'spec/upstream/graph-ir-4.0.candidate.schema.json', 'spec/diagnostics.json', 'spec/behavior-matrix.json', 'spec/graphir-field-matrix.json', 'spec/implementation-deltas.json', 'spec/upstream/graph-ir.schema.json', 'spec/conformance']) {
    if (!packageManifest.files.includes(entry)) fail(`package manifest omits ${entry}`);
  }

  return `language specification verified: ${manifest.cases.length} fixtures, ${fields.dispositions.length} GraphIR 3 and ${fields.successor.dispositions.length} candidate field dispositions, ${deltas.deltas.length} implementation deltas`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) console.log(await verifyLanguageSpec());
