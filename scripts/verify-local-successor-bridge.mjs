/** Check the installed public Core or an explicit local candidate; never publishes. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readRegistryCoreIdentity } from './graphir-candidate-identity.mjs';

function distFiles(root, prefix = '') {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? distFiles(path.join(root, entry.name), relative) : [relative];
  }).sort();
}

function requireInstalledCoreDist(candidateEntry) {
  const installed = fileURLToPath(new URL('../node_modules/@graph-ir/core/dist/', import.meta.url));
  const candidate = path.dirname(candidateEntry);
  const actual = distFiles(candidate);
  const expected = distFiles(installed);
  if (expected.length !== actual.length || expected.some((name, index) =>
    name !== actual[index] || !readFileSync(path.join(installed, name)).equals(
      readFileSync(path.join(candidate, name))))) {
    throw new Error('installed Core dist mismatch: candidate differs from the locked public installation');
  }
}

const candidateRoot = process.argv[2] ?? fileURLToPath(new URL(
  '../node_modules/@graph-ir/core/dist/index.js', import.meta.url));
const candidateEntry = candidateRoot.endsWith('.js') ? path.resolve(candidateRoot)
  : path.resolve(candidateRoot, 'packages/core/dist/index.js');
const packageFile = candidateRoot.endsWith('.js')
  ? path.join(path.dirname(path.dirname(candidateEntry)), 'package.json')
  : path.resolve(candidateRoot, 'packages/core/package.json');
const expectedVersion = (await readRegistryCoreIdentity()).version;
const candidatePackage = JSON.parse(readFileSync(packageFile, 'utf8'));
if (!expectedVersion || candidatePackage.name !== '@graph-ir/core' ||
    candidatePackage.version !== expectedVersion) {
  throw new Error(`Coral 0.2.8 local bridge requires @graph-ir/core@${expectedVersion}; ` +
    `found ${candidatePackage.name}@${candidatePackage.version}`);
}
requireInstalledCoreDist(candidateEntry);
const candidate = await import(pathToFileURL(candidateEntry).href);
const coral = await import(process.argv[3]
  ? pathToFileURL(path.resolve(process.argv[3])).href : '../packages/render/dist/index.js');
assert.equal(candidate.validateGraphIRSuccessor({}).valid, false,
  'An empty object must not impersonate the pinned successor contract');

const recordedSourceContracts = JSON.parse(readFileSync(new URL(
  '../packages/render/test/fixtures/catalog-source-contracts028.json', import.meta.url), 'utf8')).cases;
const sourceContracts = recordedSourceContracts.filter(({ notation }) => notation !== 'erd');
const disabledChenContracts = recordedSourceContracts.filter(({ notation }) => notation === 'erd');
assert.ok(disabledChenContracts.length > 0, 'Chen research contracts must remain recorded');
for (const row of disabledChenContracts) {
  const document = coral.parseInstalledDocument028(row.source);
  assert.equal(document.header.source, row.source, `${row.id}: exact disabled source`);
  assert.ok(document.header.diagnostics.some(({ code }) => code === 'header.diagram.disabled'), row.id);
  assert.equal(coral.projectInstalledSourceToSuccessor028(row.source).graph, undefined,
    `${row.id}: disabled source must not project`);
}
for (const row of sourceContracts) {
  const projected = coral.projectInstalledSourceToSuccessor028(row.source);
  assert.deepEqual(projected.diagnostics, [], row.id);
  assert.equal(projected.graph.nodes[0].type, row.sourceType, row.id);
  const checked = candidate.validateGraphIRSuccessorWithCatalog(projected.graph,
    coral.successorCatalogSnapshot028(projected.graph));
  assert.equal(checked.valid, true, `${row.id}: ${JSON.stringify(checked.errors)}`);
  assert.equal(checked.verification.complete, true,
    `${row.id}: ${JSON.stringify(checked.verification.obligations)}`);
  const selected = coral.resolveSuccessorGraphNodes028(projected.graph).get('probe');
  assert.equal(selected.effectiveSymbolId, row.symbol, row.id);
  assert.equal(selected.effectiveVariantId, row.variant, row.id);
  const document = coral.parseInstalledDocument028(row.source);
  const notices = coral.sourceSemanticCapabilityNotices028(projected.graph,
    document.syntax.statements.filter((item) => item.kind === 'node'),
    document.syntax.statements.filter((item) => item.kind === 'edge'));
  assert.deepEqual(notices.map(({ code, subject }) => ({ code, subject })),
    row.expectedCapabilityNotice ? [{ code: row.expectedCapabilityNotice,
      subject: { kind: 'node', id: 'probe' } }] : [], row.id);
  if (row.expectedCapabilityNotice) {
    const token = row.explicitSymbol ? JSON.stringify(row.symbol) : row.sourceType;
    assert.equal(row.source.slice(notices[0].range.start.offset, notices[0].range.end.offset), token, row.id);
    assert.equal(notices[0].range.start.offset, row.source.indexOf(token), row.id);
  }
}
console.log(`${sourceContracts.length} active source contracts pass successor schema, identity and catalog validation; ${disabledChenContracts.length} Chen research sources fail closed. Canonical profile rules remain separate.`);

const profileCases = [
  { id: 'architecture', first: 'service', second: 'database' },
  { id: 'flowchart', first: 'process', second: 'terminal' },
  { id: 'block', first: 'block', second: 'block' },
  { id: 'bpmn', first: 'bpmn-task', second: 'bpmn-event' },
  { id: 'code', first: 'code-function', second: 'code-class' },
  { id: 'aiml', first: 'aiml-model', second: 'aiml-dataset' },
  { id: 'data-engineering', first: 'data-source', second: 'data-warehouse' },
  { id: 'sketch', first: 'sketch-box', second: 'sketch-box' },
  { id: 'uml-class', first: 'class', second: 'interface', kind: 'class' },
  { id: 'uml-sequence', first: 'participant', second: 'participant', kind: 'sequence' },
];
assert.deepEqual(profileCases.map(({ id }) => id).sort(),
  coral.getAvailableNotations028().map(({ id }) => id).sort(),
  'Every enabled Coral profile must have a local successor bridge fixture');

for (const { id: profileId, first: firstType, second: secondType, kind } of profileCases) {
  const catalog = coral.notationCatalogIdentity028(profileId);
  assert.ok(catalog, `Installed Coral catalog missing: ${profileId}`);
  const graph = {
    version: '4.0.0', id: `local-${profileId}`,
    profile: kind ? { id: 'uml', kind, version: '1.0.0' }
      : { id: candidate.nonUmlProfileId(profileId), version: '1.0.0' },
    catalog, conformanceLevel: 'typical',
    nodes: [
      { id: 'first', type: firstType,
        semanticPorts: [{ id: 'audit', direction: 'out', anchor: { kind: 'side' } },
          { id: 'chosenAuto', direction: 'out', anchor: { kind: 'auto' } },
          { id: 'fixedEast', direction: 'out', anchor: { kind: 'exact', position: 'E' } }] },
      { id: 'second', type: secondType,
        semanticPorts: [{ id: 'receive', direction: 'in' }] },
    ],
    edges: [{ id: 'link', first: { node: 'first', port: 'audit' },
      second: { node: 'second', port: 'receive' }, direction: 'first-to-second' }],
  };
  const portable = candidate.validateGraphIRSuccessor(graph);
  assert.equal(portable.valid, true, JSON.stringify(portable.errors));
  const snapshot = coral.successorCatalogSnapshot028(graph);
  const checked = candidate.validateGraphIRSuccessorWithCatalog(graph, snapshot);
  assert.equal(checked.valid, true, JSON.stringify(checked.errors));
  assert.equal(checked.verification.complete, true, JSON.stringify(checked.verification.obligations));
  if (profileId === 'architecture') {
    const rgb = structuredClone(graph);
    rgb.edges[0].style = { lineStyle: 'dotted', strokeColor: '#FF0000' };
    assert.equal(candidate.validateGraphIRSuccessorWithCatalog(rgb, snapshot).valid, true);
    rgb.edges[0].style.strokeColor = 'mintGreen';
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(rgb, snapshot).errors
      .some((finding) => finding.path === '/edges/0/style/strokeColor'));
    const unknownAnchor = structuredClone(graph);
    unknownAnchor.nodes[0].semanticPorts[0].anchor = { kind: 'symbol', id: 'missingRim' };
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(unknownAnchor, snapshot).errors
      .some((finding) => finding.code === 'UNKNOWN_SYMBOL_ANCHOR' &&
        finding.path === '/nodes/0/semanticPorts/0/anchor/id'));
  }
  const wrongPort = structuredClone(graph);
  wrongPort.edges[0].first.port = 'missing';
  assert.ok(candidate.validateGraphIRSuccessorWithCatalog(wrongPort, snapshot).errors
    .some((error) => error.code === 'UNKNOWN_SEMANTIC_PORT'));
  const wrongDirection = structuredClone(graph);
  wrongDirection.nodes[0].semanticPorts[0].direction = 'in';
  assert.ok(candidate.validateGraphIRSuccessorWithCatalog(wrongDirection, snapshot).errors
    .some((error) => error.code === 'PORT_DIRECTION_MISMATCH'));
  const interpreted = coral.resolveSuccessorGraphNodes028(graph);
  assert.equal(interpreted.get('first')?.semanticPorts.find((port) => port.id === 'audit')?.anchor, 'side');
  assert.equal(interpreted.get('first')?.semanticPorts.find((port) => port.id === 'chosenAuto')?.anchorWasExplicit, true);
  assert.equal(interpreted.get('second')?.semanticPorts.find((port) => port.id === 'receive')?.origin, 'authored');
  assert.deepEqual(interpreted.get('first')?.portCollisions, []);
  const first = interpreted.get('first');
  assert.ok(first);
  const symbol = first.effectiveSymbolId ? coral.symbolRegistry.get(first.effectiveSymbolId) : undefined;
  const inheritedPortId = first.effectiveSymbolId && snapshot.symbols[first.effectiveSymbolId]?.ports?.[0]?.id;
  if (inheritedPortId) {
    const collision = structuredClone(graph);
    collision.nodes[0].semanticPorts[0].id = inheritedPortId;
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(collision, snapshot).errors
      .some((error) => error.code === 'INHERITED_PORT_COLLISION'));
    assert.ok(coral.resolveSuccessorGraphNodes028(collision).get('first')?.portCollisions.includes(inheritedPortId));
  }
  const horizontal = coral.semanticLayoutPorts028(first, symbol, first.effectiveVariantId, 'RIGHT');
  const vertical = coral.semanticLayoutPorts028(first, symbol, first.effectiveVariantId, 'DOWN');
  assert.equal(horizontal.ports.find((port) => port.id === 'audit')?.side, 'EAST');
  assert.equal(vertical.ports.find((port) => port.id === 'audit')?.side, 'SOUTH');
  assert.equal(horizontal.ports.find((port) => port.id === 'fixedEast')?.side, 'EAST');
  assert.equal(vertical.ports.find((port) => port.id === 'fixedEast')?.side, 'EAST');
  const foreignSymbol = profileId === 'architecture' ? 'flowchart-decision' : 'arch-service';
  const scoped = { ...graph, conformanceLevel: 'strict',
    conformanceExceptions: [{ kind: 'explicit-symbol', nodeId: 'foreign', symbol: foreignSymbol }],
    nodes: [...graph.nodes, { id: 'foreign', type: 'foreign', symbol: foreignSymbol }] };
  const scopedValidation = candidate.validateGraphIRSuccessorWithCatalog(scoped, snapshot);
  assert.equal(scopedValidation.valid, true, JSON.stringify(scopedValidation.errors));
  const scopedReport = coral.evaluateSuccessorConformanceInputs028(scoped, [{
    id: 'CORAL.SYMBOL.OUT_OF_PROFILE', category: 'notation', minimumLevel: 'strict',
    severity: 'error', message: 'Foreign symbol',
    causes: [{ kind: 'explicit-symbol', nodeId: 'foreign', symbol: foreignSymbol }],
  }], { operation: 'check' });
  assert.equal(scopedReport.findings[0]?.severity, 'warning');
  assert.equal(scopedReport.evaluatedLevel, 'strict');
  assert.throws(() => coral.resolveSuccessorGraphNodes028({ ...graph,
    catalog: { ...catalog, digest: 'stale' } }), /catalog pin mismatch/);

  const sourceWords = {
    bpmn: ['task', 'task'], code: ['function', 'class'],
    aiml: ['model', 'dataset'], 'data-engineering': ['source', 'warehouse'],
    sketch: ['box', 'box'],
  }[profileId] ?? [firstType, secondType];
  const source = [`@diagram ${profileId}`, `first ${sourceWords[0]}`,
    `second ${sourceWords[1]}`,
    'link = first -> second'].join('\n');
  const opened = coral.parseInstalledDocument028(source);
  assert.equal(opened.header.source, source, `${profileId}: exact opened source`);
  const saved = coral.prepareInstalledDocumentForSave028(source, opened);
  assert.equal(saved.source.replace('@coralVersion "0.2.8"\n', ''), source,
    `${profileId}: exact saved source`);
  const authored = coral.projectInstalledSourceToSuccessor028(source);
  assert.deepEqual(authored.diagnostics, [], `${profileId}: source diagnostics`);
  assert.ok(authored.graph, `${profileId}: source projection`);
  assert.equal(authored.graph.profile.id, graph.profile.id, `${profileId}: profile identity`);
  assert.deepEqual(authored.graph.edges[0]?.first, { node: 'first' });
  assert.deepEqual(authored.graph.edges[0]?.second, { node: 'second' });
  assert.equal(authored.graph.edges[0]?.direction, 'first-to-second');
  const authoredChecked = candidate.validateGraphIRSuccessorWithCatalog(authored.graph,
    coral.successorCatalogSnapshot028(authored.graph));
  assert.equal(authoredChecked.valid, true,
    `${profileId}: ${JSON.stringify(authoredChecked.errors)}`);
  assert.equal(authoredChecked.verification.complete, true,
    `${profileId}: ${JSON.stringify(authoredChecked.verification.obligations)}`);
}
console.log(`All ${profileCases.length} enabled profiles passed authored-source open/save/projection and exact catalog validation.`);

const authoredSources = [
  { name: 'six-position connector and dashed period tier', source: [
    '@diagram architecture', 'a service', 'b service',
    'a -.----> b',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'exact ID case and quoted Unicode labels', source: [
    '@diagram architecture', 'Api service as "Café 🌊"',
    "api service as 'café'", 'upper = Api -> api',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'dotted edge style', source: [
    '@diagram architecture', 'a service', 'b service',
    'a -> b [style: dotted]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'authored RGB edge style', source: [
    '@diagram architecture', 'a service', 'b service',
    'paint = a -> b [style: #FF0000]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'typed edge style recipe', source: [
    '@diagram architecture', 'a service', 'b service',
    'paint = a -> b [style: "dotted, #FF0000, thick, animated:reverse"]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'semantic cardinality end name', source: [
    '@diagram architecture', 'a service', 'b service',
    'a -- b [secondEnd: zeroToMany]',
  ].join('\n'), expectedDirection: 'none' },
  { name: 'qualified group identities', source: [
    '@diagram architecture',
    'left group {', '  item service as "Left" {',
    '    scopedSend port [direction: out]', '  }', '  sink service as "Sink"',
    '  item:scopedSend -> sink', '}',
    'right group {', '  item service as "Right"', '}',
    'left.item -> right.item',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'group-qualified named edges and arrangements', source: [
    '@diagram architecture',
    'sales group {', '  a service', '  b service',
    '  route = a -> b', '  lane = arrange row: a, b', '}',
    'ops group {', '  a service', '  b service',
    '  route = a -> b', '  lane = arrange column: a, b', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'grouped UML member identity', source: [
    '@diagram uml-class',
    'left group {', '  Order class {', '    fields = attributes {',
    '      orderId = public attribute id: String', '    }', '  }', '}',
    'right group {', '  Order class {', '    fields = attributes {',
    '      orderId = public attribute id: String', '    }', '  }', '}',
    'left.Order -- right.Order',
  ].join('\n'), expectedDirection: 'none' },
  { name: 'approved UML operations', source: [
    '@diagram uml-class', 'Order class {', '  actions = operations {',
    '    saveOp = public operation save(id: String): Boolean',
    '    + load()', '    - reset()', '    # inspect()', '    ~ refresh()',
    '  }', '}', 'Receipt class', 'Order -- Receipt',
  ].join('\n'), expectedDirection: 'none' },
  { name: 'nearest enclosing group lookup', source: [
    '@diagram architecture', 'lead service', 'team group {',
    '  lead database', '  squad group {', '    worker service',
    '    worker -> lead', '  }', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'catalog-port source export', source: [
    '@diagram architecture', 'api service', 'store database',
    'read = api:out -> store:query [reads]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'keyed rare end catalog ports', source: [
    '@diagram architecture', 'a service', 'b service',
    'link = a:out -> b:in [secondEnd: zeroOrOne]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'symbol-bound source exception', source: [
    '@diagram flowchart', '@conformanceLevel strict',
    'api process [symbol: "arch-service", conformanceException: "arch-service"]',
    'done terminal', 'api -> done [flow]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'node-local authored ports', source: [
    '@diagram architecture',
    'api service {',
    '  audit port [direction: out, anchor: side]',
    '  chosenAuto port [direction: out, anchor: auto]',
    '}',
    'store database {',
    '  receive port [direction: in]',
    '}',
    'read = api:audit -> store:receive [reads]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'grouped semantic-port route anchor', source: [
    '@diagram architecture', 'team group {', '  api service {',
    '    outbound port [direction: out, anchor: E]', '  }',
    '  db database', '  request = api:outbound -> db',
    '  route edge request {',
    '    bend = waypoint relative to port api:outbound offset (20, 0)',
    '  }', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'reverse architecture ports', source: [
    '@diagram architecture', '@conformanceLevel strict',
    'client service', 'server service',
    'reply = client:in <--- server:out [calls] as "Reply"',
  ].join('\n'), expectedDirection: 'second-to-first' },
  { name: 'flat UML sequence order', source: [
    '@diagram uml-sequence', 'client participant', 'server participant',
    'call = client -#> server as "load()"',
    'reply = server -.-> client as "done"',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'reverse UML sequence role', source: [
    '@diagram uml-sequence', 'client participant', 'server participant',
    'client <- server as "reverse message"',
  ].join('\n'), expectedDirection: 'second-to-first' },
  { name: 'authored UML sequence ports', source: [
    '@diagram uml-sequence', 'client participant {',
    '  send port [direction: out]', '}', 'server participant {',
    '  receive port [direction: in]', '}',
    'client:send -> server:receive as "request"',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'recursive UML sequence order', source: [
    '@diagram uml-sequence', 'client participant', 'server participant',
    'before = client -> server',
    'choice = alt "valid" {',
    '  inside = server -> client',
    '  retry = alt "again" {',
    '    nested = client -#> server',
    '    follow = server -> client',
    '  } else "stop" {',
    '    stopped = server -.-> client',
    '  }',
    '} else "invalid" {',
    '  rejected = client -> server',
    '}',
    'after = server -> client',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'source-owned sequence region', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'before = api -> worker', 'phase = region "Review" {',
    '  inside = worker -> api', '  note "Check" on api', '}',
    'after = api -> worker',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'source-owned participant group', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'team = participants worker, api [label: "Operations"]',
    'api -> worker',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'guarded single-operand fragments', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'retry = loop "more" {', '  ready = opt "available" {',
    '    call = api -> worker', '  }', '}',
    'lock = critical "locked" {', '  api -#> worker', '}',
    'stop = break "cancelled" {', '  worker -.-> api', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'unguarded loop and parallel operands', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'retry = loop {', '  api -> worker', '}',
    'parallel = par {', '  call = api -> worker',
    '} and "reply" {', '  worker -> api', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'activation around a message', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'work = activation api {', '  call = api -> worker', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'nested activation on one participant', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'outer = activation api {', '  inner = activation api {',
    '    call = api -> worker', '  }', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'operand-local activation', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'choice = alt "yes" {', '  work = activation api {',
    '    call = api -> worker', '  }', '} else "no" {',
    '  api -> worker', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'authored sequence note', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'call = api -> worker',
    'check = note "Check\\nRecord" on worker',
    'reply = worker -> api',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'alt operand participant note', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'choice = alt "accepted" {', '  note "Review" on worker',
    '} else "rejected" {', '  api -> worker', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'creation then participant note', source: [
    '@diagram uml-sequence', 'client participant',
    'spawn = client -.-> worker [create]', 'note "Warm cache" on worker',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'root participant destruction', source: [
    '@diagram uml-sequence', 'client participant', 'server participant',
    'call = client -> server', 'close = client -> server [destroy]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'creation and destruction lifetime', source: [
    '@diagram uml-sequence', 'client participant',
    'spawn = client -.-> worker [create]',
    'note "Ready" on worker', 'close = client -> worker [destroy]',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'reverse participant destruction', source: [
    '@diagram uml-sequence', 'client participant', 'server participant',
    'close = client <- server [destroy]',
  ].join('\n'), expectedDirection: 'second-to-first' },
  { name: 'message and shared participant notes', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'call = api -> worker', 'retry = note "retried" on call',
    'shared = note "shared" on api, worker',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'alt scoped named-message note', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'choice = alt "accepted" {', '  call = api -> worker',
    '  note "Review call" on call', '} else "rejected" {',
    '  api -> worker', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'alt scoped shared participant note', source: [
    '@diagram uml-sequence', 'api participant', 'worker participant',
    'choice = alt "yes" {', '  note "Review" on api, worker',
    '} else "no" {', '  api -> worker', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
  { name: 'recursive participant cascade result', source: [
    '@diagram uml-sequence', 'a participant', 'c participant',
    'choice = alt "yes" {', '  keepYes = a -> c',
    '} else "no" {', '  keepNo = c -> a', '}',
  ].join('\n'), expectedDirection: 'first-to-second' },
];
for (const { name, source, expectedDirection } of authoredSources) {
  const opened = coral.parseInstalledDocument028(source);
  const saved = coral.prepareInstalledDocumentForSave028(source, opened);
  assert.equal(saved.source.replace('@coralVersion "0.2.8"\n', ''), source,
    `${name}: exact saved source`);
  assert.equal(coral.parseInstalledDocument028(saved.source).header.source, saved.source,
    `${name}: exact reopened source`);
  const projected = coral.projectInstalledSourceToSuccessor028(source);
  assert.deepEqual(projected.diagnostics, [], `${name}: source diagnostics`);
  assert.ok(projected.graph, `${name}: projected graph`);
  assert.equal(projected.graph.edges[0]?.direction, expectedDirection);
  const snapshot = coral.successorCatalogSnapshot028(projected.graph);
  const checked = candidate.validateGraphIRSuccessorWithCatalog(projected.graph, snapshot);
  assert.equal(checked.valid, true, `${name}: ${JSON.stringify(checked.errors)}`);
  assert.equal(checked.verification.complete, true,
    `${name}: ${JSON.stringify(checked.verification.obligations)}`);
  if (name === 'exact ID case and quoted Unicode labels') {
    assert.deepEqual(projected.graph.nodes.map(({ id, label }) => [id, label]),
      [['Api', 'Café 🌊'], ['api', 'café']]);
    assert.deepEqual(projected.graph.edges[0]?.first, { node: 'Api' });
    assert.deepEqual(projected.graph.edges[0]?.second, { node: 'api' });
  } else if (name === 'dotted edge style') {
    assert.deepEqual(projected.graph.edges[0]?.style, { lineStyle: 'dotted' });
  } else if (name === 'authored RGB edge style') {
    assert.deepEqual(projected.graph.edges[0]?.style, { strokeColor: '#FF0000' });
  } else if (name === 'typed edge style recipe') {
    assert.deepEqual(projected.graph.edges[0]?.style, {
      lineStyle: 'dotted', strokeColor: '#FF0000', strokeWeight: 'thick',
      motion: { kind: 'animated', direction: 'second-to-first' },
    });
  } else if (name === 'semantic cardinality end name') {
    assert.deepEqual(projected.graph.edges[0]?.secondEnd?.marker,
      { kind: 'zero-or-many', fill: 'unspecified' });
  } else if (name === 'qualified group identities') {
    assert.deepEqual(projected.graph.nodes.map(({ id }) => id), ['left', 'right']);
    assert.deepEqual(projected.graph.nodes[0]?.children?.map(({ id }) => id),
      ['left.item', 'left.sink']);
    assert.deepEqual(projected.graph.nodes[1]?.children?.map(({ id }) => id), ['right.item']);
    assert.deepEqual(projected.graph.edges.map(({ first, second }) => [first.node, second.node]),
      [['left.item', 'left.sink'], ['left.item', 'right.item']]);
    assert.equal(projected.graph.nodes[0]?.children?.[0]?.semanticPorts?.[0]?.id, 'scopedSend');
  } else if (name === 'group-qualified named edges and arrangements') {
    assert.deepEqual(projected.graph.edges.map(({ id, first, second }) => [id, first.node, second.node]), [
      ['sales.route', 'sales.a', 'sales.b'], ['ops.route', 'ops.a', 'ops.b'],
    ]);
    assert.deepEqual(projected.graph.constraints, [
      { id: 'sales.lane', kind: 'arrangement', axis: 'row', subjects: [
        { kind: 'node', nodeId: 'sales.a' }, { kind: 'node', nodeId: 'sales.b' },
      ] },
      { id: 'ops.lane', kind: 'arrangement', axis: 'column', subjects: [
        { kind: 'node', nodeId: 'ops.a' }, { kind: 'node', nodeId: 'ops.b' },
      ] },
    ]);
    const danglingArrangement = structuredClone(projected.graph);
    danglingArrangement.constraints[1].subjects[0].nodeId = 'missing';
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(danglingArrangement, snapshot).errors
      .some((finding) => finding.code === 'INVALID_CONSTRAINT_REFERENCE' &&
        finding.path === '/constraints/1/subjects/0/nodeId'));
  } else if (name === 'grouped UML member identity') {
    assert.deepEqual(projected.graph.nodes.map(({ children }) => children?.[0]?.id),
      ['left.Order', 'right.Order']);
    for (const group of projected.graph.nodes) {
      assert.deepEqual(group.children?.[0]?.classifier?.compartments?.[1]?.items?.map(({ id }) => id),
        ['orderId']);
    }
    assert.deepEqual(projected.graph.edges[0]?.first, { node: 'left.Order' });
    assert.deepEqual(projected.graph.edges[0]?.second, { node: 'right.Order' });
  } else if (name === 'approved UML operations') {
    assert.deepEqual(projected.graph.nodes[0]?.classifier?.compartments?.[1], {
      id: 'actions', kind: 'operations', items: [
        { id: 'saveOp', kind: 'operation', visibility: 'public', name: 'save',
          parameters: [{ name: 'id', type: 'String' }], returnType: 'Boolean' },
        { id: 'operation_1', kind: 'operation', visibility: 'public', name: 'load', parameters: [] },
        { id: 'operation_2', kind: 'operation', visibility: 'private', name: 'reset', parameters: [] },
        { id: 'operation_3', kind: 'operation', visibility: 'protected', name: 'inspect', parameters: [] },
        { id: 'operation_4', kind: 'operation', visibility: 'package', name: 'refresh', parameters: [] },
      ],
    });
  } else if (name === 'nearest enclosing group lookup') {
    assert.deepEqual(projected.graph.edges[0]?.first, { node: 'team.squad.worker' });
    assert.deepEqual(projected.graph.edges[0]?.second, { node: 'team.lead' });
  } else if (name === 'authored sequence note') {
    assert.deepEqual(projected.graph.interaction?.notes, [{ id: 'check',
      text: 'Check\nRecord', participantIds: ['worker'] }]);
    assert.deepEqual(projected.graph.interaction?.items,
      [{ kind: 'message', id: 'call' }, { kind: 'note', id: 'check' },
        { kind: 'message', id: 'reply' }]);
  } else if (name === 'alt operand participant note') {
    assert.deepEqual(projected.graph.interaction?.notes,
      [{ id: 'note-1', text: 'Review', participantIds: ['worker'] }]);
    assert.deepEqual(projected.graph.interaction?.fragments?.[0]?.operands.map(({ items }) => items),
      [[{ kind: 'note', id: 'note-1' }], [{ kind: 'message', id: 'edge-1' }]]);
  } else if (name === 'source-owned sequence region') {
    assert.deepEqual(projected.graph.interaction?.items, [
      { kind: 'message', id: 'before' }, { kind: 'region', id: 'phase' },
      { kind: 'message', id: 'after' },
    ]);
    assert.deepEqual(projected.graph.interaction?.regions, [{
      id: 'phase', label: 'Review', items: [
        { kind: 'message', id: 'inside' }, { kind: 'note', id: 'note-1' },
      ],
    }]);
  } else if (name === 'source-owned participant group') {
    assert.deepEqual(projected.graph.interaction?.participantOrder, ['api', 'worker']);
    assert.deepEqual(projected.graph.interaction?.groups, [{
      id: 'team', label: 'Operations', participantIds: ['worker', 'api'],
    }]);
  } else if (name === 'creation then participant note') {
    assert.deepEqual(projected.graph.interaction?.participants,
      [{ id: 'client', nodeId: 'client' },
        { id: 'worker', nodeId: 'worker', createdByMessageId: 'spawn' }]);
    assert.deepEqual(projected.graph.interaction?.items,
      [{ kind: 'message', id: 'spawn' }, { kind: 'note', id: 'note-1' }]);
    assert.deepEqual(checked.verification.obligations, []);
  } else if (name === 'message and shared participant notes') {
    assert.deepEqual(projected.graph.interaction?.notes,
      [{ id: 'retry', text: 'retried', messageIds: ['call'] },
        { id: 'shared', text: 'shared', participantIds: ['api', 'worker'] }]);
    assert.deepEqual(checked.verification.obligations, []);
  } else if (name === 'alt scoped named-message note') {
    assert.deepEqual(projected.graph.interaction?.notes,
      [{ id: 'note-1', text: 'Review call', messageIds: ['call'] }]);
    assert.deepEqual(projected.graph.interaction?.fragments?.[0]?.operands[0]?.items,
      [{ kind: 'message', id: 'call' }, { kind: 'note', id: 'note-1' }]);
    assert.deepEqual(checked.verification.obligations, []);
  } else if (name === 'alt scoped shared participant note') {
    assert.deepEqual(projected.graph.interaction?.notes,
      [{ id: 'note-1', text: 'Review', participantIds: ['api', 'worker'] }]);
    assert.deepEqual(projected.graph.interaction?.fragments?.[0]?.operands.map(({ items }) => items),
      [[{ kind: 'note', id: 'note-1' }], [{ kind: 'message', id: 'edge-1' }]]);
    assert.deepEqual(checked.verification.obligations, []);
  } else if (name === 'guarded single-operand fragments') {
    assert.deepEqual(projected.graph.interaction?.items,
      [{ kind: 'fragment', id: 'retry' }, { kind: 'fragment', id: 'lock' },
        { kind: 'fragment', id: 'stop' }]);
    assert.deepEqual(projected.graph.interaction?.fragments?.map(({ id, kind }) => [id, kind]),
      [['retry', 'loop'], ['ready', 'opt'], ['lock', 'critical'], ['stop', 'break']]);
    assert.deepEqual(checked.verification.obligations, []);
  } else if (name === 'unguarded loop and parallel operands') {
    assert.deepEqual(projected.graph.interaction?.fragments?.map(({ id, kind }) => [id, kind]),
      [['retry', 'loop'], ['parallel', 'par']]);
    assert.equal(projected.graph.interaction?.fragments?.[0]?.operands[0]?.guard, undefined);
    assert.equal(projected.graph.interaction?.fragments?.[1]?.operands[0]?.guard, undefined);
    assert.deepEqual(projected.graph.interaction?.fragments?.[1]?.operands[1]?.guard,
      { id: 'parallel-guard-2', text: 'reply' });
  } else if (name === 'activation around a message') {
    assert.deepEqual(projected.graph.interaction?.activations,
      [{ id: 'work', participantId: 'api' }]);
    assert.deepEqual(projected.graph.interaction?.items,
      [{ kind: 'activation-start', id: 'work' }, { kind: 'message', id: 'call' },
        { kind: 'activation-end', id: 'work' }]);
    const diesInsideActivation = structuredClone(projected.graph);
    diesInsideActivation.interaction.activations[0].participantId = 'worker';
    diesInsideActivation.interaction.messages[0].kind = 'destroy';
    diesInsideActivation.interaction.participants.find((item) => item.id === 'worker')
      .destroyedByMessageId = 'call';
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(diesInsideActivation, snapshot).errors
      .some((issue) => issue.code === 'ACTIVATION_OUTSIDE_PARTICIPANT_LIFETIME'));
  } else if (name === 'nested activation on one participant') {
    assert.deepEqual(projected.graph.interaction?.activations,
      [{ id: 'outer', participantId: 'api' }, { id: 'inner', participantId: 'api' }]);
    assert.deepEqual(projected.graph.interaction?.items,
      [{ kind: 'activation-start', id: 'outer' },
        { kind: 'activation-start', id: 'inner' },
        { kind: 'message', id: 'call' },
        { kind: 'activation-end', id: 'inner' },
        { kind: 'activation-end', id: 'outer' }]);
  } else if (name === 'operand-local activation') {
    assert.deepEqual(projected.graph.interaction?.activations,
      [{ id: 'work', participantId: 'api' }]);
    assert.deepEqual(projected.graph.interaction?.fragments?.[0]?.operands[0]?.items,
      [{ kind: 'activation-start', id: 'work' }, { kind: 'message', id: 'call' },
        { kind: 'activation-end', id: 'work' }]);
  } else if (name === 'root participant destruction') {
    assert.deepEqual(projected.graph.interaction?.participants, [
      { id: 'client', nodeId: 'client' },
      { id: 'server', nodeId: 'server', destroyedByMessageId: 'close' },
    ]);
    assert.deepEqual(projected.graph.interaction?.messages[1], {
      id: 'close', edgeId: 'close', kind: 'destroy',
      senderParticipantId: 'client', receiverParticipantId: 'server',
    });
  } else if (name === 'reverse participant destruction') {
    assert.deepEqual(projected.graph.edges[0].first, { node: 'client' });
    assert.deepEqual(projected.graph.edges[0].second, { node: 'server' });
    assert.deepEqual(projected.graph.interaction?.participants[0], {
      id: 'client', nodeId: 'client', destroyedByMessageId: 'close',
    });
    assert.deepEqual(projected.graph.interaction?.messages[0], {
      id: 'close', edgeId: 'close', kind: 'destroy',
      senderParticipantId: 'server', receiverParticipantId: 'client',
    });
  } else if (name === 'creation and destruction lifetime') {
    assert.deepEqual(projected.graph.interaction?.participants[1], {
      id: 'worker', nodeId: 'worker', createdByMessageId: 'spawn',
      destroyedByMessageId: 'close',
    });
  } else if (name === 'catalog-port source export') {
    assert.deepEqual(projected.graph.edges[0]?.first, { node: 'api', port: 'out' });
    assert.deepEqual(projected.graph.edges[0]?.second, { node: 'store', port: 'query' });
    assert.equal(projected.graph.interaction, undefined);
  } else if (name === 'keyed rare end catalog ports') {
    assert.equal(projected.graph.edges[0]?.secondEnd?.marker?.kind, 'zero-or-one');
    const invalid = structuredClone(projected.graph);
    invalid.edges[0].first.port = 'in';
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(invalid, snapshot).errors
      .some((error) => error.code === 'PORT_DIRECTION_MISMATCH' &&
        error.path === '/edges/0/first/port'));
    const invalidSource = source.replace('a:out', 'a:in');
    assert.ok(coral.checkInstalledSuccessorSourceConformance028(invalidSource,
      { requestedLevel: 'none' }).report?.findings.some((finding) =>
      finding.id === 'coral.port.reference.direction' &&
        finding.range?.start.offset === invalidSource.indexOf('a:in') + 2));
  } else if (name === 'node-local authored ports') {
    assert.deepEqual(projected.graph.nodes[0]?.semanticPorts, [
      { id: 'audit', direction: 'out', anchor: { kind: 'side' } },
      { id: 'chosenAuto', direction: 'out', anchor: { kind: 'auto' } },
    ]);
    assert.deepEqual(projected.graph.nodes[1]?.semanticPorts, [{ id: 'receive', direction: 'in' }]);
    assert.equal(coral.resolveSuccessorGraphNodes028(projected.graph)
      .get('api')?.semanticPorts.find((port) => port.id === 'chosenAuto')?.anchorWasExplicit, true);
  } else if (name === 'grouped semantic-port route anchor') {
    assert.deepEqual(projected.graph.edges[0]?.routeIntent?.waypoints, [{ id: 'bend',
      placement: { kind: 'relative', anchor: { kind: 'port', nodeId: 'team.api',
        portId: 'outbound' }, offset: { x: 20, y: 0 } } }]);
    const missingPort = structuredClone(projected.graph);
    missingPort.edges[0].routeIntent.waypoints[0].placement.anchor.portId = 'absent';
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(missingPort, snapshot).errors
      .some((error) => error.code === 'UNKNOWN_ROUTE_SEMANTIC_PORT' &&
        error.path === '/edges/0/routeIntent/waypoints/0/placement/anchor/portId'));
  } else if (name === 'symbol-bound source exception') {
    assert.deepEqual(projected.graph.conformanceExceptions, [
      { kind: 'explicit-symbol', nodeId: 'api', symbol: 'arch-service' },
    ]);
    assert.equal(projected.graph.nodes[0]?.symbol, 'arch-service');
    const stale = structuredClone(projected.graph);
    stale.nodes[0].symbol = 'arch-database';
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(stale, snapshot).errors
      .some((error) => error.code === 'STALE_CONFORMANCE_EXCEPTION'));
  } else if (name === 'reverse architecture ports') {
    assert.deepEqual(projected.graph.edges[0]?.first, { node: 'client', port: 'in' });
    assert.deepEqual(projected.graph.edges[0]?.second, { node: 'server', port: 'out' });
    assert.equal(projected.graph.edges[0]?.proximityHint, 3);
  } else if (name === 'six-position connector and dashed period tier') {
    assert.equal(projected.graph.edges[0]?.proximityHint, 6);
    assert.equal(projected.graph.edges[0]?.style?.lineStyle, 'dashed');
  } else if (name === 'reverse UML sequence role') {
    assert.deepEqual(projected.graph.edges[0]?.first, { node: 'client' });
    assert.deepEqual(projected.graph.edges[0]?.second, { node: 'server' });
    assert.deepEqual(projected.graph.interaction?.messages[0], {
      id: 'edge-1', edgeId: 'edge-1', kind: 'asynchronous',
      senderParticipantId: 'server', receiverParticipantId: 'client',
    });
  } else if (name === 'authored UML sequence ports') {
    assert.deepEqual(projected.graph.nodes[0]?.semanticPorts,
      [{ id: 'send', direction: 'out' }]);
    assert.deepEqual(projected.graph.edges[0]?.first,
      { node: 'client', port: 'send' });
    assert.deepEqual(projected.graph.edges[0]?.second,
      { node: 'server', port: 'receive' });
  } else if (name === 'recursive UML sequence order') {
    assert.deepEqual(projected.graph.interaction?.items,
      [{ kind: 'message', id: 'before' }, { kind: 'fragment', id: 'choice' },
        { kind: 'message', id: 'after' }]);
    assert.deepEqual(projected.graph.interaction?.fragments?.map(({ id }) => id),
      ['choice', 'retry']);
    assert.deepEqual(projected.graph.interaction?.fragments?.[1]?.operands[0]?.items,
      [{ kind: 'message', id: 'nested' }, { kind: 'message', id: 'follow' }]);
    const missingNestedMessage = structuredClone(projected.graph);
    missingNestedMessage.interaction.fragments[0].operands[0].items[0].id = 'absent';
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(missingNestedMessage, snapshot).errors
      .some((error) => error.code === 'UNKNOWN_INTERACTION_ITEM' &&
        error.path === '/interaction/fragments/0/operands/0/items/0/id'));
    const reversedRole = structuredClone(projected.graph);
    reversedRole.interaction.messages.find((message) => message.id === 'inside').senderParticipantId = 'client';
    assert.ok(candidate.validateGraphIRSuccessorWithCatalog(reversedRole, snapshot).errors
      .some((error) => error.code === 'MESSAGE_EDGE_ROLE_MISMATCH'));
  } else if (name === 'recursive participant cascade result') {
    assert.deepEqual(projected.graph.interaction?.participantOrder, ['a', 'c']);
    assert.deepEqual(projected.graph.interaction?.fragments?.[0]?.operands.map(({ items }) => items),
      [[{ kind: 'message', id: 'keepYes' }], [{ kind: 'message', id: 'keepNo' }]]);
  } else {
    assert.deepEqual(projected.graph.interaction?.items,
      [{ kind: 'message', id: 'call' }, { kind: 'message', id: 'reply' }]);
  }
}
const earlyNoteSource = [
  '@diagram uml-sequence', 'client participant', 'note "Ready" on worker',
  'spawn = client -.-> worker [create]',
].join('\n');
const earlyNote = coral.projectInstalledSourceToSuccessor028(earlyNoteSource);
assert.equal(earlyNote.graph, undefined);
assert.ok(earlyNote.diagnostics.some(({ code, range }) =>
  code === 'coral.sequence.note.outside-participant-lifetime' &&
  range?.start.offset === earlyNoteSource.indexOf('worker', earlyNoteSource.indexOf('note'))));

const escapedNoteSource = [
  '@diagram uml-sequence', 'api participant', 'worker participant',
  'choice = alt "yes" {', '  call = api -> worker',
  '} else "no" {', '  note "Review" on call', '}',
].join('\n');
const escapedNote = coral.projectInstalledSourceToSuccessor028(escapedNoteSource);
assert.equal(escapedNote.graph, undefined);
assert.ok(escapedNote.diagnostics.some(({ code, range }) =>
  code === 'coral.sequence.note.message-scope' &&
  range?.start.offset === escapedNoteSource.lastIndexOf('call')));

const branchCreationSource = [
  '@diagram uml-sequence', 'client participant',
  'choice = alt "yes" {', '  spawn = client -.-> worker [create]',
  '} else "no" {', '  client -> client', '}',
].join('\n');
const branchCreation = coral.projectInstalledSourceToSuccessor028(branchCreationSource);
assert.equal(branchCreation.graph, undefined);
assert.ok(branchCreation.diagnostics.some(({ code, range }) =>
  code === 'coral.sequence.create.root-only' &&
  range?.start.offset === branchCreationSource.indexOf('create')));

const activationDeathSource = [
  '@diagram uml-sequence', 'client participant', 'server participant',
  'work = activation server {', '  close = client -> server [destroy]', '}',
].join('\n');
const activationDeath = coral.projectInstalledSourceToSuccessor028(activationDeathSource);
assert.equal(activationDeath.graph, undefined);
assert.ok(activationDeath.diagnostics.some(({ code, range }) =>
  code === 'coral.sequence.activation.outside-participant-lifetime' &&
  range?.start.offset === activationDeathSource.indexOf('server',
    activationDeathSource.indexOf('activation'))));

for (const [name, rgb] of [
  ['black', '#000000'], ['gray', '#808080'], ['red', '#FF0000'],
  ['orange', '#FFA500'], ['yellow', '#FFFF00'], ['green', '#008000'],
  ['blue', '#0000FF'], ['purple', '#800080'],
]) {
  const source = `@diagram architecture\na service\nb service\npaint = a -> b [style: ${name}]`;
  const projected = coral.projectInstalledSourceToSuccessor028(source);
  assert.deepEqual(projected.diagnostics, [], `${name}: source diagnostics`);
  assert.equal(projected.graph?.edges[0]?.style?.strokeColor, rgb);
  const snapshot = coral.successorCatalogSnapshot028(projected.graph);
  const checked = candidate.validateGraphIRSuccessorWithCatalog(projected.graph, snapshot);
  assert.equal(checked.valid, true, `${name}: ${JSON.stringify(checked.errors)}`);
  assert.equal(checked.verification.complete, true,
    `${name}: ${JSON.stringify(checked.verification.obligations)}`);
}
const unknownColor = coral.projectInstalledSourceToSuccessor028(
  '@diagram architecture\na service\nb service\na -> b [style: mintGreen]');
assert.equal(unknownColor.graph, undefined);
assert.ok(unknownColor.diagnostics.some(({ code }) => code === 'coral.style.term.unknown'));

const keyedEndCases = [
  ['none', 'none', 'unspecified'], ['arrow', 'arrow', 'open'],
  ['filledArrow', 'arrow', 'filled'], ['triangle', 'triangle', 'open'],
  ['filledTriangle', 'triangle', 'filled'], ['diamond', 'diamond', 'open'],
  ['filledDiamond', 'diamond', 'filled'], ['circle', 'circle', 'open'],
  ['filledCircle', 'circle', 'filled'], ['bar', 'bar', 'unspecified'],
  ['crowFoot', 'crow-foot', 'unspecified'],
  ['zeroOrOne', 'zero-or-one', 'unspecified'], ['one', 'one', 'unspecified'],
  ['zeroOrMany', 'zero-or-many', 'unspecified'],
  ['oneOrMany', 'one-or-many', 'unspecified'],
  ['zeroToMany', 'zero-or-many', 'unspecified'],
];
for (const [name, kind, fill] of keyedEndCases) {
  const source = ['@diagram architecture', 'a service', 'b service',
    `a -> b [firstEnd: ${name}]`, `a <- b [secondEnd: ${name}]`].join('\n');
  const projected = coral.projectInstalledSourceToSuccessor028(source);
  assert.deepEqual(projected.diagnostics, [], `${name}: source diagnostics`);
  assert.equal(projected.graph?.edges[0]?.firstEnd?.marker.kind, kind);
  assert.equal(projected.graph?.edges[0]?.firstEnd?.marker.fill, fill);
  assert.equal(projected.graph?.edges[1]?.secondEnd?.marker.kind, kind);
  assert.equal(projected.graph?.edges[1]?.secondEnd?.marker.fill, fill);
  const snapshot = coral.successorCatalogSnapshot028(projected.graph);
  const checked = candidate.validateGraphIRSuccessorWithCatalog(projected.graph, snapshot);
  assert.equal(checked.valid, true, `${name}: ${JSON.stringify(checked.errors)}`);
}
const endPresence = coral.projectInstalledSourceToSuccessor028([
  '@diagram architecture', 'a service', 'b service',
  'a -> b', 'a -> b [firstEnd: none]', 'a -- b',
].join('\n'));
assert.deepEqual(endPresence.diagnostics, []);
assert.equal(endPresence.graph?.edges[0]?.firstEnd, undefined);
assert.equal(endPresence.graph?.edges[1]?.firstEnd?.marker.kind, 'none');
assert.equal(endPresence.graph?.edges[2]?.firstEnd?.marker.kind, 'none');
const endPresenceSnapshot = coral.successorCatalogSnapshot028(endPresence.graph);
const endPresenceCheck = candidate.validateGraphIRSuccessorWithCatalog(
  endPresence.graph, endPresenceSnapshot);
assert.equal(endPresenceCheck.valid, true, JSON.stringify(endPresenceCheck.errors));

const acceptanceFixtures = [
  'architecture-ports.coral', 'block-ports.coral', 'flowchart-draft.coral',
  'bpmn-event.coral', 'uml-sequence-flat.coral',
  'uml-class-named.coral',
];
for (const filename of acceptanceFixtures) {
  const source = readFileSync(new URL(`../packages/browser/test/fixtures/acceptance028/${filename}`,
    import.meta.url), 'utf8');
  const projected = coral.projectInstalledSourceToSuccessor028(source);
  assert.deepEqual(projected.diagnostics, [], `${filename}: source diagnostics`);
  assert.ok(projected.graph, `${filename}: projected graph`);
  const snapshot = coral.successorCatalogSnapshot028(projected.graph);
  const checked = candidate.validateGraphIRSuccessorWithCatalog(projected.graph, snapshot);
  assert.equal(checked.valid, true, `${filename}: ${JSON.stringify(checked.errors)}`);
  assert.equal(checked.verification.complete, true,
    `${filename}: ${JSON.stringify(checked.verification.obligations)}`);
}

const disabledChenFixture = readFileSync(new URL(
  '../packages/browser/test/fixtures/acceptance028/erd-relationship.coral', import.meta.url), 'utf8');
assert.equal(coral.parseInstalledDocument028(disabledChenFixture).header.source, disabledChenFixture);
assert.ok(coral.projectInstalledSourceToSuccessor028(disabledChenFixture).diagnostics
  .some(({ code }) => code === 'header.diagram.disabled'));
assert.equal(coral.projectInstalledSourceToSuccessor028(disabledChenFixture).graph, undefined);

const bundledSourceExamples = [
  'block', 'flowchart', 'bpmn', 'code', 'architecture', 'aiml',
  'data-engineering', 'sketch', 'uml-class', 'uml-sequence',
];
assert.deepEqual(bundledSourceExamples.slice().sort(), profileCases.map(({ id }) => id).sort());
for (const name of bundledSourceExamples) {
  const source = readFileSync(new URL(`../packages/diagram-editor/src/example-sources/${name}.coral`,
    import.meta.url), 'utf8');
  const opened = coral.parseInstalledDocument028(source);
  assert.equal(opened.header.source, source, `${name}: exact example source`);
  const projected = coral.projectInstalledSourceToSuccessor028(opened);
  assert.deepEqual(projected.diagnostics, [], `${name}: example diagnostics`);
  assert.ok(projected.graph, `${name}: example graph`);
  const checked = candidate.validateGraphIRSuccessorWithCatalog(projected.graph,
    coral.successorCatalogSnapshot028(projected.graph));
  assert.equal(checked.valid, true, `${name}: ${JSON.stringify(checked.errors)}`);
  assert.equal(checked.verification.complete, true,
    `${name}: ${JSON.stringify(checked.verification.obligations)}`);
}

// Lost/found is reserved portable meaning, not Coral source or display support.
// Verify one known endpoint, explicit missing-end identity, timeline order,
// serialization, and the exact capability obligation against the frozen package.
const reservedSource = [
  '@diagram uml-sequence', 'client participant', 'server participant',
  'request = client -> server',
].join('\n');
const reservedProjection = coral.projectInstalledSourceToSuccessor028(reservedSource);
assert.deepEqual(reservedProjection.diagnostics, []);
assert.ok(reservedProjection.graph?.interaction);
const missingEnd = structuredClone(reservedProjection.graph);
missingEnd.edges = [];
missingEnd.interaction.messages = [
  { id: 'lost', kind: 'lost', senderParticipantId: 'client', missingReceiver: true },
  { id: 'found', kind: 'found', missingSender: true, receiverParticipantId: 'server' },
];
missingEnd.interaction.items = [
  { kind: 'message', id: 'lost' }, { kind: 'message', id: 'found' },
];
const missingEndSnapshot = coral.successorCatalogSnapshot028(missingEnd);
const missingEndCheck = candidate.validateGraphIRSuccessorWithCatalog(
  missingEnd, missingEndSnapshot);
assert.equal(missingEndCheck.valid, true, JSON.stringify(missingEndCheck.errors));
assert.deepEqual(missingEndCheck.errors, []);
assert.equal(missingEndCheck.verification.complete, false);
assert.deepEqual(missingEndCheck.verification.obligations.map(({ code, path }) =>
  [code, path]), [
  ['INTERACTION_MISSING_END_CAPABILITY_UNVERIFIED', '/interaction/messages/0'],
  ['INTERACTION_MISSING_END_CAPABILITY_UNVERIFIED', '/interaction/messages/1'],
]);
const missingEndRoundTrip = JSON.parse(JSON.stringify(missingEnd));
assert.deepEqual(missingEndRoundTrip, missingEnd);
assert.deepEqual(candidate.diffGraphIRSuccessor(missingEnd, missingEndRoundTrip).changes, []);
const permutedMissingEnd = structuredClone(missingEndRoundTrip);
permutedMissingEnd.interaction.messages.reverse();
assert.deepEqual(candidate.diffGraphIRSuccessor(missingEnd, permutedMissingEnd).changes, [],
  'message storage order must not replace authored timeline order');
const reorderedMissingEnd = structuredClone(missingEndRoundTrip);
reorderedMissingEnd.interaction.items.reverse();
assert.notDeepEqual(candidate.diffGraphIRSuccessor(missingEnd, reorderedMissingEnd).changes, []);
const inventedEndpoint = structuredClone(missingEndRoundTrip);
inventedEndpoint.interaction.messages[0].receiverParticipantId = 'server';
assert.equal(candidate.validateGraphIRSuccessorWithCatalog(
  inventedEndpoint, missingEndSnapshot).valid, false,
  'a reserved lost message must not invent a receiver');
const implicitMissingEnd = structuredClone(missingEndRoundTrip);
delete implicitMissingEnd.interaction.messages[1].missingSender;
assert.equal(candidate.validateGraphIRSuccessorWithCatalog(
  implicitMissingEnd, missingEndSnapshot).valid, false,
  'a reserved found message must explicitly name its missing sender');
const unknownKnownEndpoint = structuredClone(missingEndRoundTrip);
unknownKnownEndpoint.interaction.messages[1].receiverParticipantId = 'absent';
assert.ok(candidate.validateGraphIRSuccessorWithCatalog(
  unknownKnownEndpoint, missingEndSnapshot).errors.some(({ code, path }) =>
  code === 'UNKNOWN_MESSAGE_PARTICIPANT' &&
    path === '/interaction/messages/1/receiverParticipantId'));

console.log(`Local GraphIR successor ↔ Coral U1/U2 bridge passed for all ${profileCases.length} enabled profiles, ${authoredSources.length} directed-role projections, ${keyedEndCases.length} keyed end names on both written ends, explicit-none presence, ${acceptanceFixtures.length} active authored acceptance files, and ${bundledSourceExamples.length} Coral-authored example sources; Chen source remains saveable but disabled; lost/found reservation remains explicitly unverified for display.`);
