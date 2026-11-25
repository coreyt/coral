import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Parser, { Query } from 'tree-sitter';
import Coral from '../bindings/node/index.js';
import { parseDocument028 } from '../../language/dist/parser/document028.js';
import { HEADER_MANIFEST_028 } from '../../language/dist/parser/header-manifest028.js';

const parser = new Parser();
parser.setLanguage(Coral);
const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8'])
  .flatMap((edition) => edition.catalogs.map((catalog) =>
    [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };

test('the documented private Tree-sitter example matches the native grammar and source reader', () => {
  const guide = readFileSync(new URL('../../../docs/embed/reference/tree-sitter.md', import.meta.url), 'utf8');
  const source = /^```coral\n([\s\S]*?)^```$/m.exec(guide)?.[1];
  assert.ok(source, 'private grammar guide must show an authored Coral source');
  const document = parseDocument028(source, runtime);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  assert.equal(document.header.source, source);
  assert.equal(parser.parse(source).rootNode.hasError, false);
});

test('packaged grammar matches the reviewed 0.2.8 tooling grammar', () => {
  const reviewed = readFileSync(new URL('../../language/spec/tree-sitter-028/grammar.js',
    import.meta.url), 'utf8');
  const packaged = readFileSync(new URL('../grammar.js', import.meta.url), 'utf8');
  assert.equal(packaged, reviewed.replace("name: 'coral_028'", "name: 'coral'"));
});

test('native grammar and installed reader agree on authored positions and pin diagnostics', () => {
  const source = '@diagram architecture\napi service @ (120, 80) pinned\n' +
    'store database @ (-24.5, 0)\n';
  const document = parseDocument028(source, runtime);
  const tree = parser.parse(source);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.deepEqual(document.graph?.nodes.map((node) => [node.position, node.pinned]), [
    [{ x: 120, y: 80 }, true], [{ x: -24.5, y: 0 }, undefined],
  ]);
  assert.equal(document.header.source, source);

  const invalid = '@diagram architecture\napi service pinned\n';
  const diagnosed = parseDocument028(invalid, runtime);
  const finding = diagnosed.syntax.diagnostics.find((item) => item.code === 'coral.node.pin.invalid');
  assert.ok(finding);
  assert.equal(invalid.slice(finding.range.start.offset, finding.range.end.offset), 'pinned');
  assert.equal(diagnosed.graph, undefined);
  assert.equal(parser.parse(invalid).rootNode.hasError, false,
    'The pin dependency is a semantic finding on otherwise valid syntax');
});

test('native grammar and installed reader agree on named route waypoints', () => {
  const source = '@diagram architecture\napi service\nstore database\n' +
    'request = api -> store\nroute edge request {\n' +
    '  turn = waypoint at (240, 80)\n}\n';
  const document = parseDocument028(source, runtime);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  assert.equal(parser.parse(source).rootNode.hasError, false);
  assert.deepEqual(document.graph?.edges[0]?.routeIntent?.waypoints, [{
    id: 'turn', placement: { kind: 'absolute', position: { x: 240, y: 80 } },
  }]);
  assert.equal(document.header.source, source);

  const reversed = '@diagram architecture\napi service\nstore database\n' +
    'request = api <- store\nroute edge request {\n' +
    '  leave = waypoint relative to first offset (20, 0)\n' +
    '  arrive = waypoint relative to second offset (-20, 0)\n}\n';
  const relative = parseDocument028(reversed, runtime);
  assert.deepEqual([...relative.header.diagnostics, ...relative.syntax.diagnostics], []);
  assert.equal(parser.parse(reversed).rootNode.hasError, false);
  assert.deepEqual(relative.graph?.edges[0]?.routeIntent?.waypoints.map((waypoint) =>
    waypoint.placement.kind === 'relative' ? waypoint.placement.anchor.kind : undefined),
  ['source', 'target']);
  assert.equal(relative.header.source, reversed);

  const grouped = '@diagram architecture\nteam group {\n  api service\n' +
    '  db database\n  request = api -> db\n  route edge request {\n' +
    '    bend = waypoint relative to node api offset (20, 0)\n  }\n}\n';
  const scoped = parseDocument028(grouped, runtime);
  assert.deepEqual([...scoped.header.diagnostics, ...scoped.syntax.diagnostics], []);
  assert.equal(parser.parse(grouped).rootNode.hasError, false);
  assert.deepEqual(scoped.graph?.edges[0]?.routeIntent?.waypoints[0]?.placement, {
    kind: 'relative', anchor: { kind: 'node', nodeId: 'team.api' },
    offset: { x: 20, y: 0 },
  });
  assert.equal(scoped.header.source, grouped);

  const portSource = '@diagram architecture\nteam group {\n  api service {\n' +
    '    outbound port [direction: out, anchor: E]\n  }\n  db database\n' +
    '  request = api:outbound -> db\n  route edge request {\n' +
    '    bend = waypoint relative to port api:outbound offset (20, 0)\n  }\n}\n';
  const portRoute = parseDocument028(portSource, runtime);
  assert.deepEqual([...portRoute.header.diagnostics, ...portRoute.syntax.diagnostics], []);
  assert.equal(parser.parse(portSource).rootNode.hasError, false);
  assert.deepEqual(portRoute.graph?.edges[0]?.routeIntent?.waypoints[0]?.placement, {
    kind: 'relative', anchor: { kind: 'port', nodeId: 'team.api', portId: 'outbound' },
    offset: { x: 20, y: 0 },
  });
  assert.equal(portRoute.header.source, portSource);
});

test('native grammar and installed reader agree on typed label placement', () => {
  const source = '@diagram architecture\napi service as "API" label below offset 12\n' +
    'store database\nrequest = api -> store as "Request" label above at 0.25 offset 8\n';
  const document = parseDocument028(source, runtime);
  const tree = parser.parse(source);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.deepEqual(document.graph?.nodes[0]?.labelPlacement, { side: 'below', offset: 12 });
  assert.deepEqual(document.graph?.edges[0]?.labelPlacement,
    { side: 'above', at: 0.25, offset: 8 });
  assert.equal(document.header.source, source);

  const invalid = source.replace('at 0.25', 'at 1.2');
  const diagnosed = parseDocument028(invalid, runtime);
  assert.ok(diagnosed.syntax.diagnostics.some((item) =>
    item.code === 'coral.label-placement.range.invalid' &&
    invalid.slice(item.range.start.offset, item.range.end.offset) === '1.2'));
  assert.equal(diagnosed.graph, undefined);
  assert.equal(parser.parse(invalid).rootNode.hasError, false,
    'A numeric range violation is semantic, not a grammar error');
});

test('the packaged 0.2.8 highlighting query compiles against its generated node types', () => {
  const query = readFileSync(new URL('../queries/highlights.scm', import.meta.url), 'utf8');
  assert.ok(new Query(Coral, query));
});

for (const [profile, edition] of Object.entries(HEADER_MANIFEST_028['0.2.8'])) {
  if (edition.enabled === false) continue;
  test(`packaged grammar recognizes the installed ${profile} source header`, () => {
    const kind = profile === 'uml-sequence' ? 'participant' : 'group';
    const source = `@diagram ${profile}\na ${kind}\nb ${kind}\na -> b\n`;
    const document = parseDocument028(source, runtime);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
    assert.equal(parser.parse(source).rootNode.hasError, false);
    assert.equal(document.header.source, source);
  });
}

for (const [name, source] of [
  ['missing saved header', 'api service\n'],
  ['retired @graph header', '@graph {"id":"old"}\napi service\n'],
  ['retired kind-first declaration', 'service "Old API" as api\n'],
]) {
  test(`packaged grammar and reader refuse ${name} without losing source`, () => {
    const document = parseDocument028(source, runtime);
    assert.equal(document.header.source, source);
    assert.ok(document.header.diagnostics.some((item) => item.code === 'header.diagram.required'));
    assert.equal(document.graph, undefined);
    assert.equal(parser.parse(source).rootNode.hasError, true);
  });
}

const authoredTypeWords = {
  architecture: ['service', 'database'], flowchart: ['process', 'terminal'],
  block: ['block', 'block'], bpmn: ['task', 'task'],
  code: ['function', 'class'], aiml: ['model', 'dataset'],
  'data-engineering': ['source', 'warehouse'], sketch: ['box', 'box'],
  'uml-class': ['class', 'interface'], 'uml-sequence': ['participant', 'participant'],
  'uml-state': ['state', 'state'],
};
assert.deepEqual(Object.keys(authoredTypeWords).sort(),
  Object.entries(HEADER_MANIFEST_028['0.2.8'])
    .filter(([, edition]) => edition.enabled !== false).map(([profile]) => profile).sort());
for (const [profile, [firstType, secondType]] of Object.entries(authoredTypeWords)) {
  test(`packaged grammar and reader accept a complete ${profile} source`, () => {
    const source = `@diagram ${profile}\nfirst ${firstType}\nsecond ${secondType}\n` +
      'link = first -> second\n';
    const document = parseDocument028(source, runtime);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
    assert.equal(parser.parse(source).rootNode.hasError, false);
    assert.deepEqual(document.syntax.statements.filter((item) => item.kind === 'node')
      .map((item) => [item.id.value, item.nodeKind.value]),
    [['first', firstType], ['second', secondType]]);
    assert.equal(document.syntax.statements.find((item) => item.kind === 'edge')?.id?.value, 'link');
    assert.equal(document.header.source, source);

    const unresolved = source.replace('first -> second', 'first -> missing');
    const invalid = parseDocument028(unresolved, runtime);
    assert.ok(invalid.syntax.diagnostics.some((finding) =>
      finding.code === 'coral.reference.target.unresolved' &&
      finding.range?.start.offset === unresolved.indexOf('missing')));
    assert.equal(parser.parse(unresolved).rootNode.hasError, false,
      'Unknown references are semantic findings, not Tree-sitter syntax errors');
    assert.equal(invalid.header.source, unresolved);
  });
}

const sharedAcceptanceFixtures = [
  ['architecture', 'architecture-ports.coral'],
  ['block', 'block-ports.coral'],
  ['flowchart', 'flowchart-draft.coral'],
  ['bpmn', 'bpmn-event.coral'],
  ['uml-sequence', 'uml-sequence-flat.coral'],
  ['uml-sequence', 'uml-sequence-groups.coral'],
  ['uml-class', 'uml-class-named.coral'],
];
for (const [profile, filename] of sharedAcceptanceFixtures) {
  test(`packaged grammar and reader accept the shared ${profile} fixture`, () => {
    const source = readFileSync(new URL(`../../browser/test/fixtures/acceptance028/${filename}`,
      import.meta.url), 'utf8');
    const document = parseDocument028(source, runtime);
    const tree = parser.parse(source);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
    assert.equal(document.header.header?.diagramType, profile);
    assert.equal(document.header.source, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    const authoredEdges = document.syntax.statements.filter((item) => item.kind === 'edge');
    const nativeEdges = tree.rootNode.descendantsOfType('edge');
    assert.equal(nativeEdges.length, authoredEdges.length);
    for (let index = 0; index < authoredEdges.length; index++) {
      const written = authoredEdges[index];
      assert.equal(nativeEdges[index].startIndex,
        (written.id ?? written.source).range.start.offset);
    }
  });
}

for (const filename of ['basic.coral', 'rich-028.coral']) {
  test(`packaged grammar and source reader accept the current editor browser fixture ${filename}`, () => {
    const source = readFileSync(new URL(`../../../e2e/fixtures/${filename}`, import.meta.url), 'utf8');
    const document = parseDocument028(source, runtime);
    const tree = parser.parse(source);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
    assert.equal(document.header.source, source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.equal(tree.rootNode.descendantsOfType('node').length, 2);
    assert.equal(tree.rootNode.descendantsOfType('edge').length, 1);
  });
}

test('packaged grammar and source reader accept the grouped 20-node network fixture', () => {
  const source = readFileSync(new URL('../../../e2e/fixtures/acceptance028/network-20.coral',
    import.meta.url), 'utf8');
  const document = parseDocument028(source, runtime);
  const tree = parser.parse(source);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.equal(document.syntax.statements.filter((item) => item.kind === 'node').length, 22);
  assert.equal(document.syntax.statements.filter((item) => item.kind === 'edge').length, 24);
  assert.equal(document.header.source, source);
});

// UML state is a supported character edition, with no visual Welcome example.
// Its native source and reference diagnostics are covered in the matrix above.
for (const profile of Object.keys(authoredTypeWords).filter((id) => id !== 'uml-state')) {
  test(`packaged grammar accepts the Coral-authored ${profile} bundled example`, () => {
    const source = readFileSync(new URL(
      `../../diagram-editor/src/example-sources/${profile}.coral`, import.meta.url), 'utf8');
    const document = parseDocument028(source, runtime);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
    assert.equal(document.header.header?.diagramType, profile);
    assert.equal(document.header.source, source);
    const tree = parser.parse(source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  });
}

for (const [name, source] of [
  ['group and semantic port', '@diagram architecture\nsales group {\n  api service {\n' +
    '    out port [direction: out, anchor: E]\n  }\n  db database\n' +
    '  api:out -> db:in\n}\nsales.api -> sales.db\n'],
  ['group-qualified named edges and arrangements', '@diagram architecture\n' +
    'sales group {\n  a service\n  b service\n  route = a -> b\n' +
    '  lane = arrange row: a, b\n}\n' +
    'ops group {\n  a service\n  b service\n  route = a -> b\n' +
    '  lane = arrange column: a, b\n}\n'],
  ['keyed ends and exact RGB', '@diagram architecture\na service\nb service\n' +
    'a -.----> b [firstEnd: one, secondEnd: zeroToMany, style: #FF0000]\n'],
  ['UML operations', '@diagram uml-class\nOrder class {\n  actions = operations {\n' +
    '    saveOp = public operation save(id: String): Boolean\n' +
    '    - reset()\n  }\n}\n'],
  ['recursive sequence', '@diagram uml-sequence\na participant\nb participant\n' +
    'work = activation a {\n  choice = alt "yes" {\n    a -#> b\n' +
    '  } else "no" {\n    note "Ready\\nNow" on b\n  }\n}\n'],
  ['nested sequence region', '@diagram uml-sequence\na participant\nb participant\n' +
    'phase = region "Review" {\n  a -> b\n  region {\n    b -> a\n  }\n}\n'],
  ['participant group', '@diagram uml-sequence\na participant\nb participant\n' +
    'team = participants b, a [label: "Team"]\n'],
  ['parallel operands', '@diagram uml-sequence\na participant\nb participant\n' +
    'both = par "fast" {\n  a -> b\n} and {\n  b -> a\n}\n'],
  ['root destruction', '@diagram uml-sequence\na participant\nb participant\n' +
    'close = a -> b [destroy]\n'],
  ['six-position dashed creation', '@diagram uml-sequence\nclient participant\n' +
    'spawn = client -.----> worker [create]\n'],
  ['actor participant', '@diagram uml-sequence\nuser actor\napi participant\n' +
    'request = user -> api\n'],
  ['guarded optional fragment and message-targeted note',
    '@diagram uml-sequence\na participant\nb participant\n' +
    'optional = opt "ready" {\n  call = a -> b\n  note "trace" on call\n}\n'],
]) {
  test(`packaged grammar and source reader accept ${name}`, () => {
    const document = parseDocument028(source, runtime);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
    const tree = parser.parse(source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.equal(document.header.source, source);
  });
}

test('packaged grammar and reader retain approved named-color source with typed RGB', () => {
  const source = '@diagram architecture\na service\nb service\n' +
    'redEdge = a -> b [style: red]\n' +
    'blueEdge = a -> b [style: "dotted, blue, thick"]\n';
  const document = parseDocument028(source, runtime);
  const tree = parser.parse(source);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.equal(document.header.source, source);
  assert.deepEqual(document.syntax.statements.filter((item) => item.kind === 'edge')
    .map((item) => item.styleIntent), [
    { strokeColor: '#FF0000' },
    { lineStyle: 'dotted', strokeColor: '#0000FF', strokeWeight: 'thick' },
  ]);
});

for (const [name, control] of [['tab', '\t'], ['C1 control', '\u0085'],
  ['Unicode line separator', '\u2028'], ['Unicode paragraph separator', '\u2029']]) {
  test(`a raw ${name} inside a style recipe is rejected without losing source`, () => {
    const source = '@diagram architecture\na service\nb service\n' +
      `a -> b [style: "dotted,${control}red"]\n`;
    const document = parseDocument028(source, runtime);
    assert.equal(parser.parse(source).rootNode.hasError, true);
    assert.ok(document.syntax.diagnostics.some((finding) =>
      finding.code === 'coral.syntax.string.control' &&
      finding.range?.start.offset === source.indexOf(control)));
    assert.equal(document.header.source, source);
  });
}

for (const [name, kind, fill] of [
  ['none', 'none', 'unspecified'], ['arrow', 'arrow', 'open'],
  ['filledArrow', 'arrow', 'filled'], ['triangle', 'triangle', 'open'],
  ['filledTriangle', 'triangle', 'filled'], ['diamond', 'diamond', 'open'],
  ['filledDiamond', 'diamond', 'filled'], ['circle', 'circle', 'open'],
  ['filledCircle', 'circle', 'filled'], ['bar', 'bar', 'unspecified'],
  ['crowFoot', 'crow-foot', 'unspecified'], ['zeroOrOne', 'zero-or-one', 'unspecified'],
  ['one', 'one', 'unspecified'], ['zeroOrMany', 'zero-or-many', 'unspecified'],
  ['oneOrMany', 'one-or-many', 'unspecified'], ['zeroToMany', 'zero-or-many', 'unspecified'],
]) {
  test(`packaged grammar and source reader retain keyed end ${name}`, () => {
    const source = '@diagram architecture\na service\nb service\n' +
      `link = a -> b [firstEnd: ${name}]\n`;
    const document = parseDocument028(source, runtime);
    const tree = parser.parse(source);
    assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.equal(document.syntax.statements.find((item) => item.kind === 'edge')?.firstEnd?.value, name);
    assert.deepEqual(document.graph?.edges[0]?.sourceEnd?.marker, { kind, fill });
    assert.equal(document.header.source, source);
  });
}

test('an unknown keyed end is rejected by the grammar and located by the source reader', () => {
  const source = '@diagram architecture\na service\nb service\n' +
    'link = a -> b [firstEnd: inventedMark]\n';
  const document = parseDocument028(source, runtime);
  assert.equal(parser.parse(source).rootNode.hasError, true,
    'The closed end-name grammar rejects unknown names while the source reader locates them');
  assert.ok(document.syntax.diagnostics.some((finding) =>
    finding.code === 'coral.syntax.connector.end-unknown' &&
    finding.range?.start.offset === source.indexOf('inventedMark')));
  assert.equal(document.header.source, source);
});

for (const [name, edge, nativeError, diagnosticCode] of [
  ['six-position solid shaft', 'a ------> b', false, undefined],
  ['six-position dashed shaft', 'a -.----> b', false, undefined],
  ['seventh shaft position', 'a -.-----> b', true, 'coral.syntax.connector.dash-count'],
  ['dot outside second position', 'a --.---> b', true, 'coral.syntax.connector.dot-position'],
  ['filled circle suffix', 'a --#o b', false, undefined],
  ['reversed filled circle suffix', 'a --o# b', false, undefined],
  ['crow-foot suffix', 'a --{ b', false, undefined],
  ['equal keyed end restatement', 'a -> b [secondEnd: arrow]', false, undefined],
  ['different same-end mark', 'a -> b [secondEnd: diamond]', false,
    'coral.syntax.connector.end-conflict'],
  ['bare relation and keyed label', 'a -> b [flow, label: "Yes"]', false, undefined],
  ['unapproved positional label', 'a -> b [flow, "Yes"]', true,
    'coral.syntax.bracket.unknown-positional'],
  ['typed style recipe', 'a -> b [style: "dotted, green, thick, animated"]',
    false, undefined],
  ['unknown style term', 'a -> b [style: mintGreen]', false,
    'coral.style.term.unknown'],
]) {
  test(`packaged connector and reader agree on ${name}`, () => {
    const source = `@diagram architecture\na service\nb service\n${edge}\n`;
    const document = parseDocument028(source, runtime);
    const tree = parser.parse(source);
    assert.equal(tree.rootNode.hasError, nativeError, tree.rootNode.toString());
    assert.equal(document.header.source, source);
    assert.equal(document.syntax.diagnostics.some((item) => item.code === diagnosticCode),
      diagnosticCode !== undefined, JSON.stringify(document.syntax.diagnostics));
    if (diagnosticCode) assert.ok(document.syntax.diagnostics.some((item) =>
      item.code === diagnosticCode && item.range?.start.offset >= source.indexOf(edge)),
    JSON.stringify(document.syntax.diagnostics));
  });
}

for (const [name, source, runtimeCode] of [
  ['obsolete kind-first node', '@diagram architecture\nservice "Old" as old\n',
    'coral.syntax.legacy-node.unsupported'],
  ['unquoted rendered label', '@diagram architecture\na service as API\n',
    'coral.syntax.label.quoted-required'],
  ['retired compact endpoint annotation',
    '@diagram architecture\na service\nb service\n' +
    'a (1 "owner" one nav) -> b (0..*)\n', 'coral.syntax.node.kind-required'],
  ['retired quoted label reference',
    '@diagram architecture\na service as "A"\nb service as "B"\n' +
    '"A" -> "B"\n', 'coral.syntax.statement.invalid'],
  ['unsupported enum literal body', '@diagram uml-class\nStatus enum {\n  READY\n}\n',
    'coral.syntax.node.body.invalid'],
  ['unsupported classifier modifier', '@diagram uml-class\nOrder class [abstract]\n',
    'coral.syntax.node.field.invalid'],
  ['named symbolic operation', '@diagram uml-class\nOrder class {\n  operations {\n' +
    '    saveOp = + save()\n  }\n}\n', 'coral.uml.member.named-symbolic-unsupported'],
  ['activation crossing alternatives', '@diagram uml-sequence\na participant\nb participant\n' +
    'alt "yes" {\n  activation a {\n    a -> b\n' +
    '} else "no" {\n  b -> a\n}\n', 'coral.sequence.activation.scope'],
  ['single parallel operand', '@diagram uml-sequence\na participant\nb participant\n' +
    'par "alone" {\n  a -> b\n}\n', 'coral.sequence.fragment.operands'],
  ['unquoted region label', '@diagram uml-sequence\na participant\n' +
    'region Review {\n  a -> a\n}\n', 'coral.sequence.region.syntax'],
  ['missing participant-group comma', '@diagram uml-sequence\na participant\nb participant\n' +
    'team = participants a b\n', 'coral.sequence.group.syntax'],
  ['trailing participant-group comma', '@diagram uml-sequence\na participant\n' +
    'team = participants a,\n', 'coral.sequence.group.syntax'],
]) {
  test(`packaged grammar and source reader reject ${name} while retaining text`, () => {
    const document = parseDocument028(source, runtime);
    assert.ok(document.syntax.diagnostics.some((finding) => finding.code === runtimeCode),
      JSON.stringify(document.syntax.diagnostics));
    assert.equal(parser.parse(source).rootNode.hasError, true);
    assert.equal(document.header.source, source);
  });
}

test('native tree spans preserve the authored operation and quoted text', () => {
  const source = '@diagram uml-class\nOrder class {\n  operations {\n' +
    '    saveOp = public operation save(id: String): Boolean\n  }\n}\n';
  const document = parseDocument028(source, runtime);
  const tree = parser.parse(source);
  const operation = tree.rootNode.descendantsOfType('operation')[0];
  const syntax = document.syntax.statements.find((item) => item.kind === 'operation');
  assert.ok(operation && syntax?.id);
  assert.equal(operation.startIndex, syntax.id.range.start.offset);
  assert.equal(operation.text, 'saveOp = public operation save(id: String): Boolean');
});

test('packaged grammar and runtime reader agree across bounded whitespace and comment mutations', () => {
  const seeds = [
    '@diagram architecture\napi service as "API"\ndb service\n' +
      'link = api -> db [type: flow, label: "read"]\n',
    '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  a -> b\n} else "no" {\n  b -> a\n}\n',
    '@diagram uml-class\nOrder class {\n  fields = attributes {\n' +
      '    id = private attribute id: String\n  }\n  operations {\n' +
      '    + save()\n  }\n}\n',
    '@diagram uml-sequence\na participant\nb participant\n' +
      'phase = region "Review" {\n  a -> b\n  region {\n    b -> a\n  }\n}\n',
    '@diagram uml-sequence\na participant\nb participant\n' +
      'team = participants b, a [label: "Team"]\na -> b\n',
  ];
  const mutations = [
    ['\n', '\r\n'], ['\n', '\n\n'], [' ', '  '], [' ', '\t'],
    [' = ', '='], [' -> ', '  ->  '], [': ', ':'], [', ', ',  '],
    [' {\n', '{\n'], ['}\n', '} // done\n'],
  ];
  let checked = 0;
  for (const [seedIndex, seed] of seeds.entries()) {
    for (const [from, to] of mutations) {
      let at = -1;
      while ((at = seed.indexOf(from, at + 1)) >= 0) {
        const source = seed.slice(0, at) + to + seed.slice(at + from.length);
        const document = parseDocument028(source, runtime);
        const runtimeAccepts = ![...document.header.diagnostics, ...document.syntax.diagnostics]
          .some((finding) => finding.severity === 'error');
        const nativeAccepts = !parser.parse(source).rootNode.hasError;
        assert.equal(nativeAccepts, runtimeAccepts,
          `seed ${seedIndex}, ${JSON.stringify(from)} → ${JSON.stringify(to)} at ${at}:\n${source}`);
        assert.equal(document.header.source, source);
        checked++;
      }
    }
  }
  assert.equal(checked, 287);
});

for (const [skill, expected] of [['coral', 4], ['coral-validate', 2]]) {
  test(`packaged grammar accepts the ${skill} skill's saved-source examples`, () => {
    const markdown = readFileSync(new URL(`../../../skills/${skill}/SKILL.md`, import.meta.url), 'utf8');
    const sources = [...markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
    assert.equal(sources.length, expected);
    for (const source of sources) {
      const document = parseDocument028(source, runtime);
      assert.deepEqual(document.header.diagnostics, []);
      assert.equal(document.header.source, source);
      const tree = parser.parse(source);
      assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    }
  });
}

for (const [skill, expected] of [['coral', 4], ['coral-dsl', 4],
  ['coral-convert', 1], ['coral-explain', 1]]) {
  test(`packaged grammar accepts the Claude ${skill} skill's saved-source examples`, () => {
    const markdown = readFileSync(new URL(`../../../.claude/skills/${skill}/SKILL.md`, import.meta.url), 'utf8');
    const sources = [...markdown.matchAll(/^```coral\n([\s\S]*?)^```$/gm)].map((match) => match[1]);
    assert.equal(sources.length, expected);
    for (const source of sources) {
      const document = parseDocument028(source, runtime);
      assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
      assert.equal(document.header.source, source);
      const tree = parser.parse(source);
      assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    }
  });
}


test('native grammar recognizes Slice 30 typed spatial source without changing semantic roles', () => {
  const source = '@diagram architecture\nlayout [algorithm: layered, direction: RIGHT, edgeRouting: ORTHOGONAL, nodeNode: 40]\na service as "A"\nb service as "B"\ne = a -> b as "E"\nconstraint caption: label node a above edge e [preferred, gap: 8]\norder = arrange row: node a, edge e, label node b [gap: 12, alignment: end, direction: reverse]\nroute edge e {\n first = waypoint at (100, 100)\n next = waypoint relative to waypoint first offset (20, 0)\n}\n';
  const document = parseDocument028(source, runtime);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  assert.equal(document.graph, undefined, 'Successor-only meaning must not masquerade as a complete GraphIR 3 graph');
  assert.equal(parser.parse(source).rootNode.hasError, false);
});

for(const body of ['constraint service','constraint = service','layout service','a service\nb service\nconstraint = a -> b','constraint service\nb service\nconstraint -> b','node service\nedge service\nlabel service\nrow = arrange row: node, edge, label'])test(`native grammar keeps legal keyword-shaped IDs: ${body}`,()=>{const source='@diagram architecture\n'+body+'\n';assert.equal(parser.parse(source).rootNode.hasError,false);});

for(const line of ['constraint c: node a above node b []','row = arrange row: a, b []','row = arrange row: a, b, [preferred]','layout [algorithm: "layered"]','layout ["direction": RIGHT]','constraint c: "node" a above node b','constraint c: node a above node b [alignment: "start"]','constraint c: node a above node b [strength: preferred]'])test(`native/runtime refuse unreviewed spatial aliases: ${line}`,()=>{const source=`@diagram architecture\na service\nb service\n${line}\n`;assert.equal(parser.parse(source).rootNode.hasError,true);assert.ok(parseDocument028(source,runtime).syntax.diagnostics.some(d=>d.severity==='error'));});

test('packaged scanner matches the reviewed 0.2.9 raw-block scanner', () => {
  const reviewed = readFileSync(new URL('../../language/spec/tree-sitter-028/scanner.c',
    import.meta.url), 'utf8');
  const packaged = readFileSync(new URL('../src/scanner.c', import.meta.url), 'utf8');
  assert.equal(packaged, reviewed.replaceAll('tree_sitter_coral_028_', 'tree_sitter_coral_'));
});

test('native grammar keeps edition 0.2.9 raw artwork as one inert raw_block', () => {
  const raw = '<svg viewBox="0 0 2 2"> <!-- // { } @symbol x { " \' -->\n' +
    '"""x\n""""\na service\n}\n</svg>\n';
  const source = '@diagram architecture\n@coralVersion "0.2.9"\n\n' +
    '@symbol shield {\n  name "Shield"\n  size 48 x 56\n  outline ellipse\n' +
    '  anchor keyhole [x: 0.5, y: 0.55, exit: S]\n' +
    '  login port [direction: in, anchor: W, label: "Sign-in", maxConnections: 1]\n' +
    '  artwork svg """\n' + raw + '"""\n}\n\n' +
    'gate service [symbol: "local.shield"]\n';
  const document = parseDocument028(source, runtime);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  const tree = parser.parse(source);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  const blocks = tree.rootNode.descendantsOfType('raw_block');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, '"""\n' + raw + '"""');
  assert.equal(tree.rootNode.descendantsOfType('symbol_definition').length, 1);
  assert.equal(tree.rootNode.descendantsOfType('node').length, 1);

  const unclosed = source.replace(raw + '"""\n', raw);
  assert.ok(parseDocument028(unclosed, runtime).header.diagnostics
    .some(({ code }) => code === 'coral.symbol.local.artwork.unclosed'));
  assert.equal(parser.parse(unclosed).rootNode.hasError, true);
});

test('native grammar accepts a final definition without a line ending, as the reader does', () => {
  const source = '@diagram architecture\n@coralVersion "0.2.9"\n@symbol dot {\n  name "Dot"\n' +
    '  size 1 x 1\n  artwork svg """\n<svg/>\n"""\n}';
  const document = parseDocument028(source, runtime);
  assert.deepEqual([...document.header.diagnostics, ...document.syntax.diagnostics], []);
  const tree = parser.parse(source);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  assert.equal(tree.rootNode.descendantsOfType('symbol_definition').length, 1);
});
