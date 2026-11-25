import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, globSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseDocument028 } from '../src/parser/document028.js';
import { HEADER_MANIFEST_028 } from '../src/parser/header-manifest028.js';
import { CONNECTOR_END_SPELLINGS_028 } from '../src/parser/connector028.js';

const root = resolve(import.meta.dirname, '../../..');
const cli = join(root, 'node_modules/tree-sitter-cli/cli.js');
const grammar = join(root, 'packages/language/spec/tree-sitter-028/grammar.js');
const scanner = join(root, 'packages/language/spec/tree-sitter-028/scanner.c');
const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
  (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };
let directory: string;
let library: string;

function run(args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, XDG_CACHE_HOME: join(directory, 'cache') },
  });
  if (result.error && result.status === null) throw result.error;
  return result;
}

function treeAccepts(source: string): boolean {
  const file = join(directory, 'case.coral');
  writeFileSync(file, source);
  const result = run(['parse', file, '--lib-path', library, '--lang-name', 'coral_028']);
  return result.status === 0;
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'coral-grammar-028-'));
  copyFileSync(grammar, join(directory, 'grammar.js'));
  mkdirSync(join(directory, 'src'));
  copyFileSync(scanner, join(directory, 'src', 'scanner.c'));
  const built = run(['generate', join(directory, 'grammar.js'), '-o', join(directory, 'src')]);
  expect(built.status, built.stderr).toBe(0);
  library = join(directory, process.platform === 'win32' ? 'coral_028.dll' : 'coral_028.so');
  const compiled = run(['build', directory, '--output', library]);
  expect(compiled.status, compiled.stderr).toBe(0);
}, 60_000);
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

describe('Coral 0.2.8 Tree-sitter syntax-tooling parity', () => {
  it.each(Object.entries(HEADER_MANIFEST_028['0.2.8']!).filter(([, edition]) =>
    edition.enabled !== false).map(([id]) => id))(
    'recognizes the installed %s header and plain connector', (profile) => {
      const type = profile === 'uml-sequence' ? 'participant' : 'group';
      const source = `@diagram ${profile}\na ${type}\nb ${type}\na -> b\n`;
      const document = parseDocument028(source, runtime);
      expect([...document.header.diagnostics, ...document.syntax.diagnostics], source).toEqual([]);
      expect(treeAccepts(source), source).toBe(true);
    });

  it('recognizes every approved operator ending at all six solid shaft counts', () => {
    const solid = [1, 2, 3, 4, 5, 6].flatMap((count) =>
      ['', ...CONNECTOR_END_SPELLINGS_028].map((end) => `${'-'.repeat(count)}${end}`));
    const dashed = [3, 4, 5, 6].flatMap((count) =>
      ['', ...CONNECTOR_END_SPELLINGS_028].map((end) => `-.${'-'.repeat(count - 2)}${end}`));
    const reverse = [1, 2, 3, 4, 5, 6].flatMap((count) =>
      [`<${'-'.repeat(count)}`, `<${'-'.repeat(count)}>`]);
    const operators = [...solid, ...dashed, ...reverse];
    const source = '@diagram block\na block\nb block\n' +
      operators.map((operator) => `a ${operator} b`).join('\n') + '\n';
    const document = parseDocument028(source, runtime);
    expect([...document.header.diagnostics, ...document.syntax.diagnostics], source).toEqual([]);
    expect(document.graph?.edges).toHaveLength(operators.length);
    expect(document.header.source).toBe(source);
    expect(treeAccepts(source), source).toBe(true);
  });

  it.each([
    ['header-only draft at EOF', '@diagram flowchart'],
    ['quoted Unicode with CRLF', '@diagram architecture\r\napi service as \'Café 😀\'\r\n'],
    ['ordinary ID-first source', '@diagram flowchart\nstart process as "Start"\nend process\nstart -> end\n'],
    ['assigned names and typed fields', '@diagram architecture\napi = service [symbol: "arch-service"] as \'API\'\n' +
      'db database\nreads = api -> db [type: reads, firstEnd: zeroOrOne, secondEnd: oneOrMany]\n'],
    ['node-local ports', '@diagram architecture\napi service {\n  audit port [direction: out, anchor: NE]\n}\n' +
      'db database\napi:audit -> db:in [reads]\n'],
    ['arrangement', '@diagram block\na block\nb block\nrow = arrange row: a, b\n'],
    ['typed spatial rectangles and finite options', '@diagram architecture\nlayout [algorithm: layered, direction: RIGHT, edgeRouting: ORTHOGONAL, nodeNode: 40]\na service as "A"\nb service as "B"\ne = a -> b as "E"\nconstraint caption: label node a above edge e [preferred, gap: 8]\norder = arrange row: node a, edge e, label node b [gap: 12, alignment: end, direction: reverse]\nconstraint boundary: label edge e at the left of diagram [inset: 8]\n'],
    ['route-local waypoint anchors', '@diagram architecture\na service\nb service\ne = a -> b\nroute edge e {\n first = waypoint at (100, 100)\n next = waypoint relative to waypoint first offset (20, 0)\n}\n'],
    ['named route waypoints', '@diagram architecture\na service\nb database\n' +
      'request = a -> b\nroute edge request {\n  turn = waypoint at (240, 80)\n}\n'],
    ['group-local route', '@diagram architecture\nteam group {\n  a service\n  b database\n' +
      '  request = a -> b\n  route edge request {\n    turn = waypoint at (20, 30)\n  }\n}\n'],
    ['relative written-end route', '@diagram architecture\na service\nb database\n' +
      'request = a <- b\nroute edge request {\n' +
      '  leave = waypoint relative to first offset (20, 0)\n' +
      '  arrive = waypoint relative to second offset (-20, 0)\n}\n'],
    ['group-local node route anchor', '@diagram architecture\nteam group {\n  api service\n' +
      '  db database\n  request = api -> db\n  route edge request {\n' +
      '    bend = waypoint relative to node api offset (20, 0)\n  }\n}\n'],
    ['group-local semantic port route', '@diagram architecture\nteam group {\n' +
      '  api service {\n    outbound port [direction: out, anchor: E]\n  }\n' +
      '  db database\n  request = api:outbound -> db\n  route edge request {\n' +
      '    bend = waypoint relative to port api:outbound offset (20, 0)\n  }\n}\n'],
    ['qualified group references', '@diagram architecture\nleft group {\n  item service as "Left"\n' +
      '  sink service as "Sink"\n  item -> sink\n}\nright group {\n' +
      '  item service as "Right"\n}\nleft.item -> right.item\n'],
    ['single edge style', '@diagram architecture\na service\nb service\na -> b [style: dotted]\n'],
    ['semantic end name', '@diagram architecture\na service\nb service\na -- b [secondEnd: zeroToMany]\n'],
    ['class members', '@diagram uml-class\nOrder class {\n  fields = attributes {\n' +
      '    orderId = public attribute id: String\n  }\n}\n'],
    ['class compartments named after their keyword', '@diagram uml-class\nOrder class as "Order" {\n' +
      '  attributes = attributes {\n    attribute_1 = public attribute id: String\n  }\n' +
      '  operations = operations {\n    operation_1 = public operation save(): Boolean\n  }\n}\n'],
    ['private class attribute', '@diagram uml-class\nOrder class {\n  attributes {\n' +
      '    orderId = private attribute id: UUID\n  }\n}\n'],
    ['class operations', '@diagram uml-class\nOrder class {\n  actions = operations {\n' +
      '    saveOp = public operation save(id: String): Boolean\n' +
      '    + load()\n    - reset()\n    # inspect()\n    ~ refresh()\n  }\n}\n'],
    ['interface operations', '@diagram uml-class\nRepository interface {\n  operations {\n' +
      '    saveOp = public operation save(order: Order): Void\n  }\n}\n'],
    ['nested quoted alternatives', '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "valid" {\n  a -#> b\n  retry = alt \'again\' {\n    b -.-> a\n' +
      '  } else \'stop\' {\n    a -> b\n  }\n} else "invalid" {\n  b -> a\n}\n'],
    ['guarded single-operand fragments', '@diagram uml-sequence\na participant\nb participant\n' +
      'loop "more" {\n  opt "ready" {\n    a -> b\n  }\n}\n' +
      'critical "lock" {\n  a -#> b\n}\nbail = break "cancelled" {\n  b -.-> a\n}\n'],
    ['optional loop and critical guards', '@diagram uml-sequence\na participant\nb participant\n' +
      'repeat = loop {\n  a -> b\n}\nlock = critical {\n  b -> a\n}\n'],
    ['parallel operands with optional guards', '@diagram uml-sequence\na participant\nb participant\n' +
      'both = par "fast" {\n  a -> b\n} and {\n  b -> a\n' +
      '} and "slow" {\n  a -> b\n}\n'],
  ] as const)('accepts %s in both syntax readers', (_name, source) => {
    const document = parseDocument028(source, runtime);
    expect([...document.header.diagnostics, ...document.syntax.diagnostics], source).toEqual([]);
    expect(document.graph ?? document.syntax.graph, source).toBeDefined();
    expect(treeAccepts(source), source).toBe(true);
  });

  it.each(['block', 'flowchart', 'bpmn', 'code', 'architecture', 'aiml',
    'data-engineering', 'sketch', 'uml-class', 'uml-sequence'])(
    'accepts the authored %s bundled source in both syntax readers', (name) => {
      const source = readFileSync(join(root, 'packages/diagram-editor/src/example-sources', `${name}.coral`), 'utf8');
      const document = parseDocument028(source, runtime);
      expect([...document.header.diagnostics, ...document.syntax.diagnostics], name).toEqual([]);
      expect(document.syntax.graph, name).toBeDefined();
      expect(treeAccepts(source), name).toBe(true);
    });

  it('accepts every saved repository file admitted by the installed source reader', () => {
    const paths = globSync('**/*.coral', { cwd: root,
      exclude: ['**/node_modules/**', '**/dist/**'] });
    const accepted = paths.flatMap((path) => {
      const source = readFileSync(join(root, path), 'utf8');
      const document = parseDocument028(source, runtime);
      return document.header.header && document.header.diagnostics.length === 0 &&
        document.syntax.diagnostics.length === 0 ? [{ path, source }] : [];
    });
    expect(accepted.length).toBeGreaterThan(0);
    const mismatches = accepted.filter(({ source }) => !treeAccepts(source))
      .map(({ path }) => path);
    expect(mismatches).toEqual([]);
  }, 30_000);

  it('accepts the grouped 20-node network authoring fixture in both syntax readers', () => {
    const source = readFileSync(join(root, 'e2e/fixtures/acceptance028/network-20.coral'), 'utf8');
    const document = parseDocument028(source, runtime);
    expect([...document.header.diagnostics, ...document.syntax.diagnostics], source).toEqual([]);
    expect(document.syntax.statements.filter((item) => item.kind === 'node')).toHaveLength(22);
    expect(document.syntax.statements.filter((item) => item.kind === 'edge')).toHaveLength(24);
    expect(document.header.source).toBe(source);
    expect(treeAccepts(source), source).toBe(true);
  });

  it('keeps disabled Chen source in the syntax tree without admitting a semantic document', () => {
    const source = '@diagram erd\na entity\nb relationship\na -- b\n';
    const document = parseDocument028(source, runtime);
    expect(treeAccepts(source)).toBe(true);
    expect(document.header.diagnostics.map((item) => item.code)).toContain('header.diagram.disabled');
    expect(document.header.source).toBe(source);
    expect(document.graph).toBeUndefined();
  });

  it('accepts an activation around a recursive fragment in both syntax readers', () => {
    const sources = [
      '@diagram uml-sequence\na participant\nb participant\n' +
        'work = activation a {\n  before = a -#> b\n' +
        '  choice = alt "yes" {\n    b -.-> a\n  } else "no" {\n' +
        '    a -> b\n  }\n}\n',
      '@diagram uml-sequence\na participant\nb participant\n' +
        'alt "yes" {\n  activation a {\n    a -> b\n  }\n' +
        '} else "no" {\n  b -> a\n}\n',
    ];
    for (const source of sources) {
      const document = parseDocument028(source, runtime);
      expect([...document.header.diagnostics, ...document.syntax.diagnostics], source).toEqual([]);
      expect(document.graph, source).toBeUndefined(); // GraphIR 3 cannot carry activation boundaries.
      expect(treeAccepts(source), source).toBe(true);
      expect(document.header.source).toBe(source);
    }
  });

  it('keeps region block syntax in runtime and Tree-sitter agreement', () => {
    const valid = '@diagram uml-sequence\na participant\nb participant\n' +
      'phase = region "Review" {\n  a -> b\n  region {\n    b -> a\n  }\n}\n';
    const parsed = parseDocument028(valid, runtime);
    expect([...parsed.header.diagnostics, ...parsed.syntax.diagnostics]).toEqual([]);
    expect(parsed.graph).toBeUndefined();
    expect(parsed.syntax.sequenceItems).toMatchObject([{ kind: 'region', id: { value: 'phase' } }]);
    expect(treeAccepts(valid)).toBe(true);
    for (const invalid of ['region Review {', 'region as "Review" {']) {
      const source = `@diagram uml-sequence\na participant\n${invalid}\n}\n`;
      expect(parseDocument028(source, runtime).syntax.diagnostics.map((item) => item.code))
        .toContain('coral.sequence.region.syntax');
      expect(treeAccepts(source)).toBe(false);
    }
  });

  it('recognizes root participant-group declarations with keyed labels', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'team = participants b, a [label: "Team"]';
    const parsed = parseDocument028(source, runtime);
    expect([...parsed.header.diagnostics, ...parsed.syntax.diagnostics]).toEqual([]);
    expect(parsed.graph).toBeUndefined();
    expect(parsed.syntax.statements).toContainEqual(expect.objectContaining({
      kind: 'participant-group', id: expect.objectContaining({ value: 'team' }),
    }));
    expect(treeAccepts(source)).toBe(true);
    const invalid = source.replace('[label: "Team"]', 'as "Team"');
    expect(parseDocument028(invalid, runtime).syntax.diagnostics.map((item) => item.code))
      .toContain('coral.sequence.group.label');
    expect(treeAccepts(invalid)).toBe(false);
    const nested = '@diagram uml-sequence\na participant\n' +
      'region {\n  team = participants a\n}\n';
    expect(parseDocument028(nested, runtime).syntax.diagnostics.map((item) => item.code))
      .toContain('coral.sequence.group.scope');
    expect(treeAccepts(nested)).toBe(false);
  });

  it('locates missing and trailing participant-group commas as syntax errors', () => {
    for (const [body, token] of [
      ['participants a b', 'b'],
      ['participants a,', ','],
    ]) {
      const source = `@diagram uml-sequence\na participant\nb participant\n${body}`;
      const parsed = parseDocument028(source, runtime);
      expect(parsed.header.source).toBe(source);
      expect(parsed.syntax.diagnostics).toContainEqual(expect.objectContaining({
        code: 'coral.sequence.group.syntax',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.lastIndexOf(token),
        }) }),
      }));
      expect(treeAccepts(source)).toBe(false);
    }
  });

  it('rejects named symbolic operations in both syntax readers', () => {
    const source = '@diagram uml-class\nOrder class {\n  operations {\n' +
      '    saveOp = + save()\n  }\n}\n';
    const document = parseDocument028(source, runtime);
    expect(document.syntax.diagnostics.map((finding) => finding.code))
      .toContain('coral.uml.member.named-symbolic-unsupported');
    expect(treeAccepts(source)).toBe(false);
    expect(document.header.source).toBe(source);
  });
  it('rejects an activation that tries to close across alt operands', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "yes" {\n  activation a {\n    a -> b\n' +
      '} else "no" {\n  b -> a\n}\n';
    const document = parseDocument028(source, runtime);
    expect(document.syntax.diagnostics.map((finding) => finding.code))
      .toContain('coral.sequence.activation.scope');
    expect(treeAccepts(source)).toBe(false);
    expect(document.header.source).toBe(source);
  });
  it('requires a gap after a symbolic operation visibility sign', () => {
    const source = '@diagram uml-class\nOrder class {\n  operations {\n' +
      '    +save()\n  }\n}\n';
    const document = parseDocument028(source, runtime);
    expect(document.syntax.diagnostics.map((finding) => finding.code))
      .toContain('coral.syntax.spacing.required');
    expect(treeAccepts(source)).toBe(false);
  });

  it('recognizes typed RGB syntax while withholding a color-blind display graph', () => {
    const source = '@diagram architecture\na service\nb service\na -> b [style: #FF0000]\n';
    expect(treeAccepts(source)).toBe(true);
    const document = parseDocument028(source, runtime);
    expect(document.syntax.diagnostics).toEqual([]);
    expect(document.header.source).toBe(source);
    expect(document.graph).toBeUndefined();
  });

  it('recognizes a selected multi-term style recipe without inventing a syntax fault', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'a -> b [style: "dotted, green, thick"]\n';
    expect(treeAccepts(source)).toBe(true);
    const document = parseDocument028(source, runtime);
    expect(document.syntax.diagnostics).toEqual([]);
    expect(document.header.source).toBe(source);
    expect(document.graph).toBeUndefined();
  });
  it('recognizes a typed quoted style recipe through Tree-sitter and the source parser', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'a -> b [style: "dotted, #FF0000, thick, animated:reverse"]\n';
    expect(treeAccepts(source)).toBe(true);
    const result = parseDocument028(source, runtime);
    expect(result.syntax.diagnostics).toEqual([]);
    expect(result.graph).toBeUndefined();
    expect(result.syntax.statements[2]).toMatchObject({ styleIntent: {
      lineStyle: 'dotted', strokeColor: '#FF0000', strokeWeight: 'thick',
      motion: { kind: 'animated', direction: 'second-to-first' },
    } });
  });
  it('recognizes a named timeline note with shared quoted text', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'check = note "Check\\nRecord" on worker\n';
    expect(treeAccepts(source)).toBe(true);
    const result = parseDocument028(source, runtime);
    expect(result.syntax.diagnostics).toEqual([]);
    expect(result.syntax.statements[2]).toMatchObject({ kind: 'note',
      text: { value: 'Check\nRecord' }, target: { value: 'worker' } });
  });
  it('recognizes one named-message or several participant note targets', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'call = api -> worker\nretry = note "retried" on call\n' +
      'shared = note "shared" on api, worker\n';
    expect(treeAccepts(source)).toBe(true);
    const result = parseDocument028(source, runtime);
    expect(result.syntax.diagnostics).toEqual([]);
    expect(result.syntax.sequenceItems.filter((item) => item.kind === 'note'))
      .toMatchObject([{ targets: [{ value: 'call' }] },
        { targets: [{ value: 'api' }, { value: 'worker' }] }]);
  });

  it.each([
    ['missing header separator', '@diagramflowchart\na process\n'],
    ['missing directive separator', '@diagram flowchart\n@conformanceLevelstrict\na process\n'],
    ['late directive', '@diagram flowchart\na process\n@conformanceLevel strict\n'],
    ['removed kind-first declaration', '@diagram flowchart\nservice "API" as api\n'],
    ['removed kind-first declaration without label', '@diagram flowchart\nservice as api\n'],
    ['unquoted label', '@diagram flowchart\napi service as API\n'],
    ['single-quoted style recipe', '@diagram architecture\na service\nb service\n' +
      'a -> b [style: \'dotted, green\']\n'],
    ['qualified declaration', '@diagram architecture\nteam group {\n  team.item service\n}\n'],
    ['qualified edge declaration', '@diagram architecture\na service\nb service\n' +
      'bad.link = a -> b\n'],
    ['dotted port reference', '@diagram architecture\na service\nb service\n' +
      'a:out.extra -> b\n'],
    ['missing label separator', '@diagram flowchart\napi service as"API"\n'],
    ['positional second bracket item', '@diagram flowchart\na process\nb process\na -> b [flow, "Yes"]\n'],
    ['missing connector separators', '@diagram flowchart\na process\nb process\na->b\n'],
    ['seven shaft positions', '@diagram flowchart\na process\nb process\na -.-----> b\n'],
    ['period outside second shaft position', '@diagram flowchart\na process\nb process\na --.---> b\n'],
    ['two periods in shaft', '@diagram flowchart\na process\nb process\na -.-.-> b\n'],
    ['Unicode separator outside quotes', '@diagram flowchart\napi\u00a0process\n'],
    ['tab inside quoted version', '@diagram flowchart\n@profileVersion "1.\t0.0"\na process\n'],
    ['C1 control inside quoted attribute', '@diagram flowchart [mode: "wide\u0085layout"]\na process\n'],
    ['DEL in quoted text', '@diagram flowchart\napi process as "left\u007fright"\n'],
    ['C1 control in quoted text', '@diagram flowchart\napi process as "left\u0085right"\n'],
    ['Unicode line separator in quoted text', '@diagram flowchart\napi process as "left\u2028right"\n'],
    ['Unicode paragraph separator in quoted header', '@diagram flowchart\n@profileVersion "1.\u20290.0"\napi process\n'],
    ['tab in a style recipe', '@diagram architecture\na service\nb service\n' +
      'a -> b [style: "dotted,\tred"]\n'],
    ['C1 control in a style recipe', '@diagram architecture\na service\nb service\n' +
      'a -> b [style: "dotted,\u0085red"]\n'],
    ['unquoted alternative guard', '@diagram uml-sequence\na participant\nb participant\n' +
      'alt valid {\n  a -> b\n} else "no" {\n  b -> a\n}\n'],
    ['missing alt separator', '@diagram uml-sequence\na participant\nb participant\n' +
      'alt"valid" {\n  a -> b\n} else "no" {\n  b -> a\n}\n'],
    ['invalid alternative guard escape', '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "bad\\q" {\n  a -> b\n} else "no" {\n  b -> a\n}\n'],
    ['missing else separator', '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "valid" {\n  a -> b\n}else "no" {\n  b -> a\n}\n'],
    ['Unicode between alt operands', '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "valid" {\n  a -> b\n}\u00a0else "no" {\n  b -> a\n}\n'],
    ['invalid else guard escape', '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "valid" {\n  a -> b\n} else "bad\\q" {\n  b -> a\n}\n'],
    ['missing alternative', '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "valid" {\n  a -> b\n}\n'],
    ['unguarded opt', '@diagram uml-sequence\na participant\nb participant\n' +
      'opt {\n  a -> b\n}\n'],
    ['else after opt', '@diagram uml-sequence\na participant\nb participant\n' +
      'opt "ready" {\n  a -> b\n} else "other" {\n  b -> a\n}\n'],
    ['one-operand par', '@diagram uml-sequence\na participant\nb participant\n' +
      'par {\n  a -> b\n}\n'],
    ['else after par', '@diagram uml-sequence\na participant\nb participant\n' +
      'par {\n  a -> b\n} else "other" {\n  b -> a\n}\n'],
    ['trailing edge comma', '@diagram flowchart\na process\nb process\na -> b [type: flow,]\n'],
  ] as const)('rejects %s in both syntax readers', (_name, source) => {
    const document = parseDocument028(source, runtime);
    expect(document.header.diagnostics.length > 0 || document.syntax.diagnostics
      .some((item) => item.severity === 'error'), source).toBe(true);
    expect(treeAccepts(source), source).toBe(false);
  });

  it('rejects Unicode token separators across the grammar without losing source bytes', () => {
    const cases = [
      ['header', '@diagram~flowchart\na process'],
      ['saved level', '@diagram flowchart\n@conformanceLevel~strict\na process'],
      ['node kind', '@diagram flowchart\na~process'],
      ['node label', '@diagram flowchart\na process as~"A"'],
      ['edge first', '@diagram flowchart\na process\nb process\na~-> b'],
      ['edge second', '@diagram flowchart\na process\nb process\na ->~b'],
      ['edge bracket', '@diagram flowchart\na process\nb process\na -> b~[flow]'],
      ['bracket value', '@diagram flowchart\na process\nb process\na -> b [type:~flow]'],
      ['port declaration', '@diagram architecture\na service {\n  send~port [direction: out]\n}'],
      ['port reference', '@diagram architecture\na service\nb service\na:out~-> b'],
      ['edge assignment', '@diagram flowchart\na process\nb process\nlink~= a -> b'],
      ['bracket item', '@diagram flowchart\na process\nb process\n' +
        'a -> b [type: flow,~label: "Yes"]'],
      ['node body', '@diagram architecture\na service~{\n  send port [direction: out]\n}'],
      ['arrangement', '@diagram block\na block\nb block\nrow = arrange~row: a, b'],
      ['arrangement reference', '@diagram block\na block\nb block\nrow = arrange row:~a, b'],
      ['class member', '@diagram uml-class\nA class {\n  attributes {\n    id = public~attribute code: String\n  }\n}'],
      ['class operation', '@diagram uml-class\nA class {\n  operations {\n' +
        '    save = public operation~save(): Void\n  }\n}'],
      ['sequence guard', '@diagram uml-sequence\na participant\nb participant\n' +
        'alt~"yes" {\n  a -> b\n} else "no" {\n  b -> a\n}'],
      ['sequence else', '@diagram uml-sequence\na participant\nb participant\n' +
        'alt "yes" {\n  a -> b\n}~else "no" {\n  b -> a\n}'],
      ['sequence and', '@diagram uml-sequence\na participant\nb participant\n' +
        'par {\n  a -> b\n}~and {\n  b -> a\n}'],
      ['activation', '@diagram uml-sequence\na participant\nactivation~a {\n  a -> a\n}'],
      ['region', '@diagram uml-sequence\na participant\nregion~"Review" {\n  a -> a\n}'],
      ['participant group', '@diagram uml-sequence\na participant\nb participant\n' +
        'team = participants~a, b'],
      ['note target keyword', '@diagram uml-sequence\na participant\nnote "ready"~on a'],
      ['note target', '@diagram uml-sequence\na participant\nnote "ready" on~a'],
    ] as const;
    const separators = [
      ['no-break space', '\u00a0'], ['em space', '\u2003'],
      ['word joiner', '\u2060'], ['supplementary variation selector', '\u{E0100}'],
    ] as const;
    for (const [name, template] of cases) {
      for (const [separatorName, separator] of separators) {
        const source = template.replace('~', separator);
        const document = parseDocument028(source, runtime);
        expect(document.header.source, `${name}: ${separatorName}`).toBe(source);
        expect(document.header.diagnostics.length > 0 ||
          document.syntax.diagnostics.some((item) => item.severity === 'error'),
        `${name}: ${separatorName}`).toBe(true);
        const separatorOffset = source.indexOf(separator);
        const diagnostics = [...document.header.diagnostics, ...document.syntax.diagnostics];
        expect(diagnostics.some((item) => item.range?.start.offset === separatorOffset &&
          item.range.end.offset === separatorOffset + separator.length),
        `${name}: ${separatorName}: exact UTF-16 separator range`).toBe(true);
        expect(treeAccepts(source), `${name}: ${separatorName}`).toBe(false);
      }
    }
  }, 60_000);

  it('recognizes a reserved keyed header but leaves its meaning to the runtime reader', () => {
    const source = '@diagram flowchart [mode: compact]\na process\n';
    expect(treeAccepts(source)).toBe(true);
    expect(parseDocument028(source, runtime).header.diagnostics.map((item) => item.code))
      .toContain('header.attribute.unsupported');
  });
});

const SYMBOL_HEAD = '@diagram architecture\n@coralVersion "0.2.9"\n\n';
const RAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">\n' +
  '  <!-- // { } @symbol x { "\'\\\\ -->\n"""x\n""""\n }\na service\n  <path d="M0 0"/>\n</svg>\n';
const SHIELD = '@symbol shield {\n  name "Shield"\n  description "Security boundary"\n' +
  '  tags "security" "auth"\n  size 48 x 56\n  label below\n  outline rounded\n  tint stroke\n' +
  '  source "Drawn in-house"\n  license "CC0-1.0"\n  // comment\n\n' +
  '  anchor crest [side: N, at: 0.5]\n  anchor keyhole [x: 0.5, y: 0.55, exit: S]\n' +
  '  login port [direction: in, anchor: W, label: "Sign-in", maxConnections: 1]\n' +
  '  name_port port [direction: out, anchor: keyhole]\n' +
  '  artwork svg """\n' + RAW + '"""\n}\n';

describe('Coral 0.2.9 Tree-sitter syntax-tooling parity', () => {
  it.each([
    ['the approved definition example', SYMBOL_HEAD + SHIELD + '\n' +
      'gate service [symbol: "local.shield"] as "Auth gateway"\nvault database as "Secrets" {\n' +
      '  ingest port [direction: in, anchor: W, label: "Writes"]\n}\n' +
      'gate:login -> vault:ingest [type: writes, secondEnd: arrow]\n'],
    ['several definitions, trivia and an empty artwork block', SYMBOL_HEAD + SHIELD + '// between\n\n' +
      '@symbol dot { // trailing\n  name "Dot"\n  size 1 x 2.5e1\n  artwork svg """  \n"""\n}\na service\n'],
    ['CRLF definitions', (SYMBOL_HEAD + SHIELD + 'a service\n').replaceAll('\n', '\r\n')],
    ['node-local port label and limit', SYMBOL_HEAD + 'a service {\n' +
      '  p port [maxConnections: 2, label: \'P\', direction: inout]\n}\n'],
    ['definitions without a body', SYMBOL_HEAD + SHIELD],
    ['a final closing brace without a line ending', SYMBOL_HEAD + SHIELD.slice(0, -1)],
    ['a final closing brace and comment without a line ending', SYMBOL_HEAD + SHIELD.slice(0, -1) + ' // end'],
  ] as const)('accepts %s in both syntax readers', (_name, source) => {
    const document = parseDocument028(source, runtime);
    expect([...document.header.diagnostics, ...document.syntax.diagnostics], source).toEqual([]);
    expect(treeAccepts(source), source).toBe(true);
  });

  it.each([
    ['an unclosed raw block', SYMBOL_HEAD + '@symbol s {\n  name "S"\n  size 1 x 1\n  artwork svg """\n<svg/>\n}\na service\n'],
    ['a closing quote line with trailing text', SYMBOL_HEAD + '@symbol s {\n  name "S"\n  size 1 x 1\n' +
      '  artwork svg """\n<svg/>\n""" \n}\na service\n'],
    ['a malformed size', SYMBOL_HEAD + '@symbol s {\n  name "S"\n  size 48\n  artwork svg """\n"""\n}\n'],
    ['an unknown definition line', SYMBOL_HEAD + '@symbol s {\n  name "S"\n  size 1 x 1\n  shape box\n' +
      '  artwork svg """\n"""\n}\n'],
    ['a definition after the body', SYMBOL_HEAD + 'a service\n' + SHIELD],
    ['a final definition after the body', SYMBOL_HEAD + 'a service\n' + SHIELD.slice(0, -1)],
    ['an unquoted port label', SYMBOL_HEAD + 'a service {\n  p port [direction: in, label: P]\n}\n'],
    ['a zero port limit', SYMBOL_HEAD + 'a service {\n  p port [direction: in, maxConnections: 0]\n}\n'],
  ] as const)('rejects %s in both syntax readers', (_name, source) => {
    const document = parseDocument028(source, runtime);
    expect([...document.header.diagnostics, ...document.syntax.diagnostics].length, source).toBeGreaterThan(0);
    expect(treeAccepts(source), source).toBe(false);
  });
});
