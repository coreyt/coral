import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@coral-viz/language';
import { parseInstalledDocument028, printInstalledSource028 } from '../src/index.js';

const none = { marker: { kind: 'none', fill: 'unspecified' } } as const;
const arrow = { marker: { kind: 'arrow', fill: 'open' } } as const;
const canonical = (): GraphIR => ({
  version: '3.0.0', id: 'generated-graph', metadata: { notation: 'architecture' },
  nodes: [
    { id: 'api', type: 'service', label: 'API "gateway"' },
    { id: 'store', type: 'database', label: 'store' },
    { id: 'hidden', type: 'actor', label: '' },
  ],
  edges: [{ id: 'reads', source: 'api', target: 'store', type: 'data_flow',
    label: 'Read\nrecord', sourceEnd: none, targetEnd: arrow }],
});

describe('installed 0.2.8 source writer', () => {
  it('writes an explicit catalog choice in the same keyed node bracket spelling', () => {
    const source = '@diagram architecture\napi service [symbol: "arch-service", variant: "gateway"] as "API"\n';
    const graph = parseInstalledDocument028(source).graph!;
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('api service [symbol: "arch-service", variant: "gateway"] as "API"');
    expect(parseInstalledDocument028(result.text!).graph).toEqual(graph);
  });
  it.each([
    ['block', '@diagram block\nproducer block\nconsumer block\n' +
      'transfer = producer -> consumer as "Data"\n', 'transfer = producer -> consumer as "Data"'],
    ['bpmn', '@diagram bpmn\nstart startEvent\nwork task\ndone endEvent\n' +
      'start -> work\nwork -> done\n', 'start startEvent'],
  ] as const)('writes the source-first %s subset without changing its graph', (diagramType, source, expected) => {
    const graph = parseInstalledDocument028(source).graph!;
    expect(graph).toBeDefined();
    const result = printInstalledSource028(graph, diagramType);
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain(expected);
    expect(parseInstalledDocument028(result.text!).graph).toEqual(graph);
  });

  it('retains a generic BPMN event without inventing a concrete symbol', () => {
    const graph = parseInstalledDocument028('@diagram bpmn\nreceived event\n').graph!;
    const result = printInstalledSource028(graph, 'bpmn');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('received event');
    expect(parseInstalledDocument028(result.text!).graph).toEqual(graph);
  });

  it('writes the approved simple UML sequence messages with portable profile and order', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\nworker participant\n' +
      'load = client -#> server as "load()"\n' +
      'enqueue = server -> worker as "enqueue()"\n' +
      'reply = server -.-> client as "result"\n';
    const graph = parseInstalledDocument028(source).graph!;
    const imported: GraphIR = { ...graph, id: 'imported', metadata: undefined };
    const result = printInstalledSource028(imported, 'uml-sequence');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('@diagram uml-sequence\n');
    expect(result.text).toContain('load = client -#> server as "load()"');
    expect(result.text).toContain('enqueue = server -> worker as "enqueue()"');
    expect(result.text).toContain('reply = server -.-> client as "result"');
    expect(parseInstalledDocument028(result.text!).graph).toEqual({ ...graph, id: 'coral-graph' });
  });

  it('keeps unnamed connectors short and their generated IDs stable around named edges', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'client -#> server as "first"\n' +
      'reply = server -.-> client as "result"\n' +
      'client -> server as "later"\n';
    const graph = parseInstalledDocument028(source).graph!;
    expect(graph.edges.map((edge) => edge.id)).toEqual(['edge-1', 'reply', 'edge-2']);
    const result = printInstalledSource028(graph, 'uml-sequence');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('client -#> server as "first"');
    expect(result.text).toContain('reply = server -.-> client as "result"');
    expect(result.text).toContain('client -> server as "later"');
    expect(result.text).not.toContain('"edge-1"');
    expect(parseInstalledDocument028(result.text!).graph).toEqual(graph);
  });

  it('round-trips an unnamed architecture connector without inventing an authored ID', () => {
    const graph = parseInstalledDocument028('@diagram architecture\napi service\nstore database\n' +
      'api -> store [reads]\n').graph!;
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('api -> store [reads]');
    expect(result.text).not.toContain('"edge-1"');
    expect(parseInstalledDocument028(result.text!).graph).toEqual(graph);
  });

  it('does not generate a disabled Chen ERD document', () => {
    const graph = parseInstalledDocument028('@diagram flowchart\na process\n').graph!;
    const result = printInstalledSource028(graph, 'erd');
    expect(result.text).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.writer028.diagram-type.unsupported',
    }));
  });

  it('round-trips keyed and colon semantic-port references through generated source', () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'read = api:out -> store:query [reads] as "Orders"\n' +
      'check = api -> store [reads, firstPort: data, secondPort: query]\n';
    const graph = parseInstalledDocument028(source).graph!;
    expect(graph).toBeDefined();
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('read = api:out -> store:query [reads] as "Orders"');
    expect(result.text).toContain('check = api:data -> store:query [reads]');
    expect(parseInstalledDocument028(result.text!).graph).toEqual(graph);
  });

  it('keeps first/second endpoint ports fixed when printing a reverse arrow', () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'reply = api:in <- store:query [responds]\n';
    const graph = parseInstalledDocument028(source).graph!;
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('reply = api:in <- store:query [responds]');
    expect(parseInstalledDocument028(result.text!).graph).toEqual(graph);
  });

  it('refuses an unrepresentable generated edge ID instead of renumbering it', () => {
    const graph = parseInstalledDocument028('@diagram architecture\na service\nb service\na -> b\n').graph!;
    graph.edges[0]!.id = 'edge-2';
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.text).toBeUndefined();
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'coral.writer028.edge.unsupported' })]);
  });

  it('writes a profile-only UML class with named attributes and inheritance without dropping its profile', () => {
    const source = '@diagram uml-class\nOrder class {\n  fields = attributes {\n' +
      '    orderId = public attribute id: String\n  }\n}\nEntity class\n' +
      'inherits = Order --|> Entity [inheritance]\n';
    const graph = parseInstalledDocument028(source).graph!;
    const imported: GraphIR = { ...graph, id: 'imported', metadata: undefined };
    const result = printInstalledSource028(imported, 'uml-class');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('@diagram uml-class\n');
    expect(result.text).toContain('fields = attributes');
    expect(result.text).toContain('inherits = Order --|> Entity [inheritance]');
    expect(parseInstalledDocument028(result.text!).graph).toEqual({ ...graph, id: 'coral-graph' });
  });

  it('writes an approved flowchart with a named, labeled decision branch', () => {
    const graph: GraphIR = { version: '3.0.0', id: 'flow-draft',
      metadata: { notation: 'flowchart' },
      nodes: [
        { id: 'review', type: 'decision', label: 'Approved?' },
        { id: 'approve', type: 'process', label: 'Approve' },
      ],
      edges: [{ id: 'yesPath', source: 'review', target: 'approve', type: 'flow',
        label: 'Yes', sourceEnd: none, targetEnd: arrow }],
    };
    const result = printInstalledSource028(graph, 'flowchart');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('@diagram flowchart\n');
    expect(result.text).toContain('review decision as "Approved?"');
    expect(result.text).toContain('yesPath = review -> approve [flow] as "Yes"');
    expect(parseInstalledDocument028(result.text!).graph).toEqual({ ...graph, id: 'coral-graph' });
  });

  it('fails closed when graph-to-text export cannot reconstruct grouped local IDs', () => {
    const graph: GraphIR = { version: '3.0.0', id: 'group-draft',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'backend', type: 'group', label: 'Backend', children: [
        { id: 'backend.api', type: 'service', label: 'API', parent: 'backend' },
        { id: 'backend.store', type: 'database', label: 'Store', parent: 'backend' },
      ] }], edges: [],
    };
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.text).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('coral.writer028.group-source-required');
  });

  it.each([
    ['wrong parent', (node: GraphIR['nodes'][number]) => { node.children![0]!.parent = 'elsewhere'; }],
    ['foreign child kind', (node: GraphIR['nodes'][number]) => { node.children![0]!.type = 'external_api'; }],
    ['non-group children', (node: GraphIR['nodes'][number]) => { node.type = 'service'; }],
  ] as const)('refuses %s inside a group instead of losing meaning', (_name, change) => {
    const graph: GraphIR = { version: '3.0.0', id: 'draft', metadata: { notation: 'architecture' },
      nodes: [{ id: 'backend', type: 'group', label: 'Backend', children: [
        { id: 'api', type: 'service', label: 'API', parent: 'backend' },
      ] }], edges: [] };
    change(graph.nodes[0]!);
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.text).toBeUndefined();
    expect(result.diagnostics).toEqual([expect.objectContaining({ severity: 'error',
      code: expect.stringMatching(/^coral\.writer028\.node\./) })]);
  });

  it('emits only approved source and reparses equal meaning except graph ID', () => {
    const graph = canonical();
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toMatch(/^@diagram architecture\n/);
    expect(result.text).not.toContain('@graph');
    expect(result.text).toContain('api service as "API \\"gateway\\""');
    expect(result.text).toContain('store database as "store"\n');
    expect(result.text).toContain('hidden actor as ""');
    expect(result.text).toContain('reads = api -> store [data_flow] as "Read\\nrecord"');
    const parsed = parseInstalledDocument028(result.text!);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph).toEqual({ ...graph, id: 'coral-graph' });
  });

  it('prints a valid empty draft header', () => {
    const graph: GraphIR = { version: '3.0.0', id: 'draft',
      metadata: { notation: 'architecture' }, nodes: [], edges: [] };
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.text).toBe('@diagram architecture\n');
    expect(parseInstalledDocument028(result.text!).graph).toEqual({ ...graph, id: 'coral-graph' });
  });

  it.each([
    ['missing label', (graph: GraphIR) => { delete graph.nodes[0]!.label; }],
    ['explicit solid style', (graph: GraphIR) => { graph.edges[0]!.style = { lineStyle: 'solid' }; }],
    ['unknown kind', (graph: GraphIR) => { graph.nodes[0]!.type = 'external_api'; }],
    ['wrong notation', (graph: GraphIR) => { graph.metadata!.notation = 'flowchart'; }],
    ['missing marker', (graph: GraphIR) => { delete graph.edges[0]!.targetEnd; }],
    ['graph name', (graph: GraphIR) => { graph.name = 'Secret'; }],
    ['extra metadata', (graph: GraphIR) => { graph.metadata = { ...graph.metadata, title: 'Secret' }; }],
    ['bad ID', (graph: GraphIR) => { graph.nodes[0]!.id = 'not-bare!'; }],
    ['missing ID', (graph: GraphIR) => { delete (graph.nodes[0] as Partial<typeof graph.nodes[number]>).id; }],
  ] as const)('fails closed for %s', (_name, change) => {
    const graph = canonical();
    change(graph);
    const result = printInstalledSource028(graph, 'architecture');
    expect(result.text).toBeUndefined();
    expect(result.diagnostics).toEqual([expect.objectContaining({ severity: 'error',
      code: expect.stringMatching(/^coral\.writer028\./) })]);
  });
});
