import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028, resolveSuccessorGraphNodes028 } from '@coral-viz/render';
import { appendSourceOwnedEdge028, appendSourceOwnedNode028, deleteSourceOwnedEdges028,
  deleteSourceOwnedLeafNode028, deleteSourceOwnedNodeWithConnections028, deleteSourceOwnedSelection028,
  editSourceOwnedEdgeLabel028, editSourceOwnedNodeLabel028, removeSourceOwnedEdgeLabel028,
  editSourceOwnedNodePositions028,
  resolveSourceOwnedEdgePorts028, sourceOwnedGraphForExport028 } from '../src/sourceOwnedEdits028';

describe('source-owned positioned keyboard movement', () => {
  it('changes only selected authored coordinate tokens and keeps group-local identity', () => {
    const source = '// keep this comment\n@diagram architecture\nteam group @ (100, 200) pinned {\n' +
      '  api service @ (10.00, 20) pinned\n  db database @ (80, 20)\n}\n';
    const moved = editSourceOwnedNodePositions028(source, ['team.api'], { x: 10, y: 0 });
    expect(moved).toBe(source.replace('api service @ (10.00, 20)', 'api service @ (20, 20)'));
    expect(projectInstalledSourceToSuccessor028(moved).graph?.nodes[0]?.children?.[0])
      .toMatchObject({ id: 'team.api', position: { x: 20, y: 20 }, pinned: true });
  });

  it('moves a selected group once when its child is also selected', () => {
    const source = '@diagram architecture\nteam group @ (100, 200) pinned {\n' +
      '  api service @ (10, 20) pinned\n}\n';
    const moved = editSourceOwnedNodePositions028(source, ['team', 'team.api'], { x: 0, y: -10 });
    expect(moved).toBe(source.replace('team group @ (100, 200)', 'team group @ (100, 190)'));
  });

  it('adds first coordinates from displayed positions while preserving authored pins and comments', () => {
    const source = '// keep exact bytes\r\n@diagram architecture\r\n' +
      'a service @ (10, 20) pinned // anchor\r\nb database as "Store" // keep\r\na -> b\r\n';
    const moved = editSourceOwnedNodePositions028(source, ['a', 'b'], { x: 10, y: -5 },
      new Map([['a', { x: 999, y: 999 }], ['b', { x: 50, y: 60 }]]));
    expect(moved).toBe(source.replace('@ (10, 20)', '@ (20, 15)')
      .replace('as "Store" // keep', 'as "Store" @ (60, 55) // keep'));
    expect(projectInstalledSourceToSuccessor028(moved).graph?.nodes).toMatchObject([
      { id: 'a', position: { x: 20, y: 15 }, pinned: true },
      { id: 'b', position: { x: 60, y: 55 } },
    ]);
  });

  it('adds a moved group position once without authoring coordinates on selected descendants', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n}\n';
    const displayed = new Map([['team', { x: 100, y: 200 }], ['team.api', { x: 10, y: 20 }]]);
    expect(editSourceOwnedNodePositions028(source, ['team', 'team.api'], { x: 5, y: -10 }, displayed))
      .toBe(source.replace('team group {', 'team group @ (105, 190) {'));
    expect(editSourceOwnedNodePositions028(source, ['team.api'], { x: 5, y: -10 }, displayed))
      .toBe(source.replace('api service', 'api service @ (15, 10)'));
    expect(editSourceOwnedNodePositions028(source, ['team.api'], { x: 0, y: 0 }, displayed))
      .toBe(source);
    expect(() => editSourceOwnedNodePositions028(source, ['team.api'], { x: 1, y: 0 },
      new Map([['team.api', { x: Infinity, y: 0 }]]))).toThrow('coral.editor.source-position.invalid');
  });

  it('refuses an unpositioned node and malformed source without a partial edit', () => {
    const source = '@diagram architecture\na service @ (10, 20) pinned\nb database\n';
    expect(() => editSourceOwnedNodePositions028(source, ['a', 'b'], { x: 10, y: 0 }))
      .toThrow('coral.editor.source-position.missing');
    expect(() => editSourceOwnedNodePositions028(source + 'a -> missing\n', ['a'], { x: 10, y: 0 }))
      .toThrow('coral.editor.source-position.invalid');
  });
});

describe('source-owned 0.2.8 node creation', () => {
  it.each([undefined, '', 'Worker'])('retains the exact optional authored label %j', (label) => {
    const source = '// keep authored bytes\n@diagram architecture\nteam group {}\n';
    const edited = appendSourceOwnedNode028(source, {
      id: 'worker', type: 'service', parentId: 'team', ...(label === undefined ? {} : { label }),
    });
    expect(edited.startsWith('// keep authored bytes\n@diagram architecture\n')).toBe(true);
    const node = projectInstalledSourceToSuccessor028(edited).graph!.nodes[0].children![0];
    expect(node.label).toBe(label);
    expect(Object.hasOwn(node, 'label')).toBe(label !== undefined);
  });

  it('appends an ID-first node with a quoted label without rewriting existing source', () => {
    const source = '// authored comment\n@diagram architecture\napi service\n';
    const edited = appendSourceOwnedNode028(source, { id: 'auditSink', type: 'service', label: 'Audit "sink"' });
    expect(edited).toBe(source + 'auditSink service as "Audit \\"sink\\""\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph?.nodes[1]).toMatchObject({
      id: 'auditSink', type: 'service', label: 'Audit "sink"',
    });
  });

  it('inserts into nested and compact groups at their exact source scope', () => {
    const source = '@diagram architecture\nengineering group {\n' +
      '  platform group {}\n  lead service\n}\n';
    const edited = appendSourceOwnedNode028(source, {
      id: 'worker', type: 'service', parentId: 'engineering.platform',
    });
    expect(edited).toBe(source.replace('platform group {}',
      'platform group {\n    worker service\n  }'));
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.nodes[0]?.children?.[0]?.children?.[0]).toMatchObject({
      id: 'engineering.platform.worker', type: 'service',
      parent: 'engineering.platform',
    });
  });

  it('targets canonical IDs when two groups use the same local child name', () => {
    const source = '@diagram architecture\nsales group {\n  api service\n}\n' +
      'ops group {\n  api service\n}\n';
    const labeled = editSourceOwnedNodeLabel028(source, 'sales.api', 'Sales API');
    expect(labeled).toContain('  api service as "Sales API"\n');
    expect(labeled).toContain('ops group {\n  api service\n}');
    const added = appendSourceOwnedNode028(labeled, {
      id: 'worker', type: 'service', parentId: 'ops',
    });
    const nodes = projectInstalledSourceToSuccessor028(added).graph!.nodes;
    expect(nodes[0]?.children?.[0]).toMatchObject({ id: 'sales.api', label: 'Sales API' });
    expect(nodes[1]?.children).toMatchObject([
      { id: 'ops.api' }, { id: 'ops.worker' },
    ]);
    expect(nodes[1]?.children?.every(node => !Object.hasOwn(node, 'label'))).toBe(true);
    expect(deleteSourceOwnedLeafNode028(added, 'ops.api')).toContain(
      'sales group {\n  api service as "Sales API"\n}',
    );
    expect(() => editSourceOwnedNodeLabel028(source, 'api', 'Ambiguous'))
      .toThrow('coral.editor.source-label.missing');
  });

  it('edits and deletes a named grouped connector by canonical ID without touching its peer', () => {
    const source = '@diagram architecture\nsales group {\n  a service\n  b service\n' +
      '  route = a -> b\n}\nops group {\n  a service\n  b service\n' +
      '  route = a -> b\n}\n';
    const labeled = editSourceOwnedEdgeLabel028(source, 'sales.route', 'Sales route');
    expect(labeled).toContain('  route = a -> b as "Sales route"\n');
    expect(labeled).toContain('ops group {\n  a service\n  b service\n  route = a -> b\n}');
    const deleted = deleteSourceOwnedEdges028(labeled, ['ops.route']);
    expect(deleted).toContain('sales group {\n  a service\n  b service\n' +
      '  route = a -> b as "Sales route"\n}');
    expect(projectInstalledSourceToSuccessor028(deleted).graph?.edges.map(({ id }) => id))
      .toEqual(['sales.route']);
  });

  it('creates a reusable group in a CRLF document and rejects duplicate IDs without a write', () => {
    const source = '@diagram architecture\r\napi service\r\n';
    const edited = appendSourceOwnedNode028(source, { id: 'team', type: 'group' });
    expect(edited).toBe(source + 'team group {}\r\n');
    expect(() => appendSourceOwnedNode028(edited, { id: 'api', type: 'service' }))
      .toThrow(/duplicate|already/i);
  });

  it('adds a flat UML sequence participant without changing existing messages', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'call = client -#> server as "load()"\n';
    const edited = appendSourceOwnedNode028(source, { id: 'worker', type: 'participant' });
    const before = projectInstalledSourceToSuccessor028(source).graph!;
    const after = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(after.interaction?.participantOrder).toEqual(['client', 'server', 'worker']);
    expect(after.interaction?.messages).toEqual(before.interaction?.messages);
    expect(after.edges).toEqual(before.edges);
  });

  it('adds a participant beside recursive alternatives without changing their order or source', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  yes = a -> b\n} else "no" {\n  no = b -> a\n}\n';
    const edited = appendSourceOwnedNode028(source, { id: 'c', type: 'participant' });
    expect(edited).toBe(source + 'c participant\n');
    const before = projectInstalledSourceToSuccessor028(source).graph!;
    const after = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(after.interaction?.participantOrder).toEqual(['a', 'b', 'c']);
    expect(after.interaction?.items).toEqual(before.interaction?.items);
    expect(after.interaction?.fragments).toEqual(before.interaction?.fragments);
    expect(after.edges).toEqual(before.edges);
  });
});

describe('source-owned 0.2.8 GraphIR candidate export', () => {
  const source = '@diagram architecture\napi service {\n' +
    '  audit port [direction: out, anchor: auto]\n}\n' +
    'store database\nread = api:audit -> store:query [reads]\n';

  it('exports authored semantic meaning, never derived GraphIR 3 ports', () => {
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    const exported = sourceOwnedGraphForExport028(source, source, accepted);
    expect(exported).toMatchObject({ version: '4.0.0', nodes: [
      { id: 'api', semanticPorts: [{ id: 'audit', anchor: { kind: 'auto' } }] },
      { id: 'store' },
    ], edges: [{ first: { node: 'api', port: 'audit' },
      second: { node: 'store', port: 'query' } }] });
    expect(exported.nodes[0]).not.toHaveProperty('ports');
    expect(exported.nodes[0]).not.toHaveProperty('position');
  });

  it('exports port connection limits in the GraphIR form (C7)', () => {
    const limited = '@diagram architecture\n@coralVersion "0.2.9"\napi service\nstore database {\n' +
      '  ingest port [direction: in, maxConnections: 2]\n}\napi -> store:ingest\n';
    const accepted = projectInstalledSourceToSuccessor028(limited).graph!;
    expect(sourceOwnedGraphForExport028(limited, limited, accepted).nodes[1]!.semanticPorts)
      .toEqual([{ id: 'ingest', direction: 'in', maxConnections: 2 }]);
  });

  it('refuses an edition 0.2.8 export over a bundled port limit (C7)', () => {
    const over = '@diagram flowchart\na process\nb process\nd decision\na -> d:in\nb -> d:in\n';
    const accepted = projectInstalledSourceToSuccessor028(over).graph!;
    expect(() => sourceOwnedGraphForExport028(over, over, accepted))
      .toThrow('export.graphir.port-limit.exceeded: Port in on d has 2 connections');
  });

  it('refuses export when the exact successor leaves a port-role obligation', () => {
    const undirected = '@diagram architecture\napi service\nstore database\n' +
      'link = api:out -- store:query\n';
    const accepted = projectInstalledSourceToSuccessor028(undirected).graph!;
    expect(accepted.edges[0]).toMatchObject({ direction: 'none',
      first: { port: 'out' }, second: { port: 'query' } });
    expect(() => sourceOwnedGraphForExport028(undirected, undirected, accepted))
      .toThrow('coral.editor.source-export.unverified: PORT_DIRECTION_RULE_UNVERIFIED');
  });

  it('refuses stale, missing, or mutated accepted meaning', () => {
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    expect(() => sourceOwnedGraphForExport028(source + ' ', source, accepted))
      .toThrow('coral.editor.source-export.stale');
    expect(() => sourceOwnedGraphForExport028(source, source, undefined))
      .toThrow('coral.editor.source-export.stale');
    const mutated = structuredClone(accepted);
    mutated.nodes[0]!.label = 'Different';
    expect(() => sourceOwnedGraphForExport028(source, source, mutated))
      .toThrow('coral.editor.source-export.invalid');
  });

  it.each([
    ['unknown symbol', '@diagram architecture\napi service [symbol: "missing-symbol"]'],
    ['missing port', '@diagram architecture\napi service\nstore database\napi:missing -> store:query'],
    ['catalog collision', '@diagram architecture\napi service {\n  out port [direction: out]\n}'],
    ['stale exception', '@diagram flowchart\n@conformanceLevel strict\n' +
      'api process [symbol: "arch-database", conformanceException: "arch-service"]'],
  ] as const)('refuses an accepted projection with %s integrity failure', (_case, invalid) => {
    const accepted = projectInstalledSourceToSuccessor028(invalid).graph!;
    expect(accepted).toBeDefined();
    expect(() => sourceOwnedGraphForExport028(invalid, invalid, accepted))
      .toThrow('coral.editor.source-export.invalid');
  });

  it('exports valid portable sequence ports despite the separate scene limitation', () => {
    const source = '@diagram uml-sequence\nclient participant {\n' +
      '  send port [direction: out]\n}\nserver participant {\n' +
      '  receive port [direction: in]\n}\nclient:send -> server:receive';
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    expect(sourceOwnedGraphForExport028(source, source, accepted)).toEqual(accepted);
    expect(accepted.edges[0]).toMatchObject({ first: { node: 'client', port: 'send' },
      second: { node: 'server', port: 'receive' } });
  });

  it('exports recursive alt meaning despite the separate flat-scene limitation', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  client -> server\n' +
      '} else "no" {\n  retry = alt "again" {\n    server -> client\n' +
      '  } else "stop" {\n    client -> server\n  }\n}\n';
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    expect(accepted.interaction?.fragments).toHaveLength(2);
    expect(sourceOwnedGraphForExport028(source, source, accepted)).toEqual(accepted);
  });

  it('exports parallel operands and operand-local activation only for the matching source', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'parallel = par {\n  work = activation a {\n    call = a -> b\n  }\n' +
      '} and "reply" {\n  b -> a\n}\n';
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    expect(accepted.interaction?.fragments?.[0]).toMatchObject({ id: 'parallel', kind: 'par' });
    expect(accepted.interaction?.activations).toEqual([{ id: 'work', participantId: 'a' }]);
    expect(sourceOwnedGraphForExport028(source, source, accepted)).toEqual(accepted);
    expect(() => sourceOwnedGraphForExport028(source.replace('"reply"', '"later"'),
      source, accepted)).toThrow('coral.editor.source-export.stale');
    const changed = structuredClone(accepted);
    changed.interaction!.activations![0]!.participantId = 'b';
    expect(() => sourceOwnedGraphForExport028(source, source, changed))
      .toThrow('coral.editor.source-export.invalid');
  });

  it('refuses a recursive alt with a bad port even though its scene is unavailable', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  client:missing -> server\n' +
      '} else "no" {\n  server -> client\n}\n';
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    expect(accepted).toBeDefined();
    expect(() => sourceOwnedGraphForExport028(source, source, accepted))
      .toThrow('coral.editor.source-export.invalid');
  });

  it('refuses an unknown symbol inside a recursive sequence model', () => {
    const source = '@diagram uml-sequence\nclient participant [symbol: "missing-symbol"]\n' +
      'server participant\nchoice = alt "yes" {\n  client -> server\n' +
      '} else "no" {\n  server -> client\n}\n';
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    expect(accepted).toBeDefined();
    expect(() => sourceOwnedGraphForExport028(source, source, accepted))
      .toThrow('coral.editor.source-export.invalid');
  });

  it('refuses a malformed alt with no else even though the source remains saveable', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  a -> b\n}\n';
    expect(projectInstalledSourceToSuccessor028(source).graph).toBeUndefined();
    expect(() => sourceOwnedGraphForExport028(source, source, undefined))
      .toThrow('coral.editor.source-export.stale');
  });

  it('refuses an invalid sequence port even when the scene cannot produce a report', () => {
    const source = '@diagram uml-sequence\nclient participant {\n' +
      '  send port [direction: out]\n}\nserver participant {\n' +
      '  receive port [direction: in]\n}\nclient:missing -> server:receive';
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    expect(accepted).toBeDefined();
    expect(() => sourceOwnedGraphForExport028(source, source, accepted))
      .toThrow('coral.editor.source-export.invalid');
  });

  it('exports exact source meaning despite independent strict notation findings', () => {
    const draft = '@diagram flowchart\n@conformanceLevel strict\nreview decision\n' +
      'approve process\nreview -> approve [flow]\n';
    const accepted = projectInstalledSourceToSuccessor028(draft).graph!;
    expect(sourceOwnedGraphForExport028(draft, draft, accepted)).toEqual(accepted);
  });

  it('exports keyed rare ends without dropping the connector operator direction', () => {
    const draft = '@diagram architecture\na service\nz service\n' +
      'a -> z [firstEnd: zeroOrOne, secondEnd: zeroOrMany]\n';
    const accepted = projectInstalledSourceToSuccessor028(draft).graph!;
    expect(sourceOwnedGraphForExport028(draft, draft, accepted).edges[0]).toMatchObject({
      first: { node: 'a' }, second: { node: 'z' }, direction: 'first-to-second',
      firstEnd: { marker: { kind: 'zero-or-one' } },
      secondEnd: { marker: { kind: 'zero-or-many' } },
    });
  });
});

describe('source-owned 0.2.8 canvas label edits', () => {
  it('changes only the chosen node label while retaining exact symbol, exception, ports, and comments', () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\n' +
      'api process [symbol: "arch-service", conformanceException: "arch-service"] {\n' +
      '  audit port [direction: out, anchor: auto]\n}\n' +
      'store database  // keep\napi:audit -> store [flow]';
    const edited = editSourceOwnedNodeLabel028(source, 'api', 'API gateway');
    expect(edited).toBe(source.replace(
      'api process [symbol: "arch-service", conformanceException: "arch-service"] {',
      'api process [symbol: "arch-service", conformanceException: "arch-service"] as "API gateway" {',
    ));
    expect(projectInstalledSourceToSuccessor028(edited).graph?.nodes[0]).toMatchObject({
      id: 'api', label: 'API gateway', symbol: 'arch-service', semanticPorts: [
        { id: 'audit', anchor: { kind: 'auto' } },
      ],
    });
    expect(projectInstalledSourceToSuccessor028(edited).graph?.conformanceExceptions)
      .toEqual([{ kind: 'explicit-symbol', nodeId: 'api', symbol: 'arch-service' }]);
  });

  it('retains an existing single-quote choice and leaves an unchanged label alone', () => {
    const source = "@diagram architecture\napi service as 'Old'\nstore database";
    expect(editSourceOwnedNodeLabel028(source, 'api', 'Old')).toBe(source);
    expect(editSourceOwnedNodeLabel028(source, 'api', "New's"))
      .toBe("@diagram architecture\napi service as 'New\\'s'\nstore database");
  });

  it('keeps an intentionally empty rendered label explicit', () => {
    const edited = editSourceOwnedNodeLabel028('@diagram architecture\napi service', 'api', '');
    expect(edited).toBe('@diagram architecture\napi service as ""');
    expect(projectInstalledSourceToSuccessor028(edited).graph?.nodes[0]?.label).toBe('');
  });

  it('refuses a label with a literal line separator before publishing an edit', () => {
    const source = '@diagram architecture\napi service as "Old"\nstore database\n' +
      'call = api -> store as "Reads"';
    expect(() => editSourceOwnedNodeLabel028(source, 'api', 'A\u2028B'))
      .toThrow('Unsupported control character in label');
    expect(() => editSourceOwnedEdgeLabel028(source, 'call', 'A\u2029B'))
      .toThrow('Unsupported control character in label');
    expect(projectInstalledSourceToSuccessor028(source).graph?.edges[0]?.label).toBe('Reads');
  });

  it('refuses missing nodes and invalid source without returning partial text', () => {
    const valid = '@diagram architecture\napi service';
    expect(() => editSourceOwnedNodeLabel028(valid, 'other', 'Other'))
      .toThrow('coral.editor.source-label.missing');
    expect(() => editSourceOwnedNodeLabel028(valid + '\napi -> missing', 'api', 'API'))
      .toThrow('coral.editor.source-label.invalid');
    expect(() => editSourceOwnedNodeLabel028(valid + '\nstore database\napi:missing -> store:query',
      'api', 'API')).toThrow('coral.editor.source-label.invalid');
  });
});

describe('source-owned 0.2.8 connector label edits', () => {
  it.each([
    ['as', 'read = a -> z [flow] as "Yes"  // keep', 'read = a -> z [flow]  // keep'],
    ['last keyed', 'read = a -> z [flow, label: "Yes"]  // keep',
      'read = a -> z [flow]  // keep'],
    ['first keyed', 'read = a -> z [label: "Yes", type: flow]  // keep',
      'read = a -> z [type: flow]  // keep'],
    ['middle keyed', 'read = a -> z [type: flow, label: "Yes", style: dotted]  // keep',
      'read = a -> z [type: flow, style: dotted]  // keep'],
    ['only keyed', 'read = a -> z [label: "Yes"]  // keep',
      'read = a -> z  // keep'],
    ['explicit empty', 'read = a -> z as ""  // keep',
      'read = a -> z  // keep'],
  ])('removes the %s label without changing adjacent authored text', (_name, statement, expected) => {
    const header = '@diagram flowchart\na process\nz process\n';
    const edited = removeSourceOwnedEdgeLabel028(header + statement, 'read');
    expect(edited).toBe(header + expected);
    const graph = projectInstalledSourceToSuccessor028(edited).graph;
    expect(graph?.edges[0]).not.toHaveProperty('label');
  });

  it('leaves an already unlabeled connector unchanged and refuses an unknown one', () => {
    const source = '@diagram flowchart\na process\nz process\nread = a -> z [flow]';
    expect(removeSourceOwnedEdgeLabel028(source, 'read')).toBe(source);
    expect(() => removeSourceOwnedEdgeLabel028(source, 'missing'))
      .toThrow('coral.editor.source-edge-label.missing');
  });

  it('removes only a qualified grouped label while retaining CRLF and the sibling', () => {
    const source = '@diagram architecture\r\nsales group {\r\n' +
      '  a service\r\n  b service\r\n  route = a -> b [flow, label: \'Sales\']  // keep\r\n}\r\n' +
      'ops group {\r\n  a service\r\n  b service\r\n' +
      '  route = a -> b [flow, label: "Ops"]\r\n}\r\n';
    const edited = removeSourceOwnedEdgeLabel028(source, 'sales.route');
    expect(edited).toBe(source.replace(', label: \'Sales\'', ''));
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges).toMatchObject([
      { id: 'sales.route' }, { id: 'ops.route', label: 'Ops' },
    ]);
  });

  it('removes a sequence message label without changing its direction or kind', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'reply = client <- server [return] as "Old"  // keep';
    const before = projectInstalledSourceToSuccessor028(source).graph;
    const edited = removeSourceOwnedEdgeLabel028(source, 'reply');
    expect(edited).toBe(source.replace(' as "Old"', ''));
    const graph = projectInstalledSourceToSuccessor028(edited).graph;
    expect(graph?.edges[0]).toMatchObject({ id: 'reply', direction: 'second-to-first' });
    expect(graph?.edges[0]).not.toHaveProperty('label');
    expect(graph?.interaction?.messages[0]).toEqual(before?.interaction?.messages[0]);
  });

  it('edits only the chosen named connector, preserving quote choice and neighboring source', () => {
    const source = "@diagram architecture\na service\nz service\n" +
      "call = a -> z [calls] as 'Old'  // keep\na -> z [reads]";
    const edited = editSourceOwnedEdgeLabel028(source, 'call', "It's new");
    expect(edited).toBe(source.replace("as 'Old'", "as 'It\\'s new'"));
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges).toMatchObject([
      { id: 'call', label: "It's new", type: 'calls' },
      { id: 'edge-1', type: 'reads' },
    ]);
  });

  it('adds an explicit quoted label to an unnamed connector without changing its identity', () => {
    const source = '@diagram flowchart\na process\nz process\na -> z [flow]  // keep';
    const edited = editSourceOwnedEdgeLabel028(source, 'edge-1', 'Yes');
    expect(edited).toBe(source.replace('[flow]', '[flow] as "Yes"'));
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges[0]).toMatchObject({
      id: 'edge-1', type: 'flow', label: 'Yes',
    });
    expect(editSourceOwnedEdgeLabel028(source, 'edge-1', '')).toBe(source);
  });

  it('keeps a keyed label keyed and accepts an explicit empty label', () => {
    const source = '@diagram flowchart\na process\nz process\na -> z [flow, label: "Yes"]';
    const edited = editSourceOwnedEdgeLabel028(source, 'edge-1', '');
    expect(edited).toBe(source.replace('label: "Yes"', 'label: ""'));
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges[0]?.label).toBe('');
  });

  it('refuses unknown connectors and invalid existing meaning without a partial edit', () => {
    const source = '@diagram architecture\na service\nz service\na -> z';
    expect(() => editSourceOwnedEdgeLabel028(source, 'missing', 'x'))
      .toThrow('coral.editor.source-edge-label.missing');
    expect(() => editSourceOwnedEdgeLabel028(source + '\na -> missing', 'edge-1', 'x'))
      .toThrow('coral.editor.source-edge-label.invalid');
  });

  it('edits a reverse sequence message label without changing sender, receiver, or kind', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'reply = client <- server [return] as "Old"  // keep';
    const edited = editSourceOwnedEdgeLabel028(source, 'reply', 'New');
    expect(edited).toBe(source.replace('as "Old"', 'as "New"'));
    const graph = projectInstalledSourceToSuccessor028(edited).graph;
    expect(graph?.edges[0]).toMatchObject({ id: 'reply', first: { node: 'client' },
      second: { node: 'server' }, direction: 'second-to-first', label: 'New' });
    expect(graph?.interaction?.messages[0]).toMatchObject({ id: 'reply', kind: 'asynchronous',
      senderParticipantId: 'server', receiverParticipantId: 'client' });
  });
});

describe('source-owned 0.2.8 connector deletion', () => {
  it('deletes a named flat sequence message without changing later order or direction', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'request = client -#> server as "load()"\n// keep\n' +
      'reply = client <- server [return] as "result"\n';
    const edited = deleteSourceOwnedEdges028(source, ['request']);
    expect(edited).toBe(source.replace('request = client -#> server as "load()"\n', ''));
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.edges).toMatchObject([{ id: 'reply', first: { node: 'client' },
      second: { node: 'server' }, direction: 'second-to-first' }]);
    expect(graph.interaction?.items).toEqual([{ kind: 'message', id: 'reply' }]);
    expect(graph.interaction?.messages).toMatchObject([{ id: 'reply',
      senderParticipantId: 'server', receiverParticipantId: 'client' }]);
  });

  it('refuses a sequence deletion that renumbers a surviving unnamed message', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\na -> b\nb -> a\n';
    expect(() => deleteSourceOwnedEdges028(source, ['edge-1']))
      .toThrow('coral.editor.source-delete.loss');
    expect(deleteSourceOwnedEdges028(source, ['edge-2']))
      .toBe('@diagram uml-sequence\na participant\nb participant\na -> b\n');
    const recursive = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  a -> b\n} else "no" {\n  b -> a\n}\n';
    expect(() => deleteSourceOwnedEdges028(recursive, ['edge-1']))
      .toThrow('coral.editor.source-delete.loss');
  });

  it('deletes one named nested message without changing recursive siblings or source trivia', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'before = client -> server\nchoice = alt "yes" {\n' +
      '  keep = client -#> server\n  remove = server -> client\n' +
      '  nested = alt "retry" {\n    retry = client -> server\n' +
      '  } else "stop" {\n    stop = server -> client\n  }\n' +
      '} else "no" {\n  no = server -.-> client\n}\n' +
      '// unchanged\nafter = server -> client\n';
    const edited = deleteSourceOwnedEdges028(source, ['remove']);
    expect(edited).toBe(source.replace('  remove = server -> client\n', ''));
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.edges.map((edge) => edge.id))
      .toEqual(['before', 'keep', 'retry', 'stop', 'no', 'after']);
    expect(graph.interaction?.fragments?.find((fragment) => fragment.id === 'choice')
      ?.operands[0].items).toEqual([
        { kind: 'message', id: 'keep' }, { kind: 'fragment', id: 'nested' },
      ]);
  });

  it('keeps an emptied alternative as authored source and portable meaning', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  only = a -> b\n' +
      '} else "no" {\n  other = b -> a\n}\n';
    const edited = deleteSourceOwnedEdges028(source, ['only']);
    expect(edited).toBe(source.replace('  only = a -> b\n', ''));
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.interaction?.fragments?.[0]?.operands[0].items).toEqual([]);
    expect(graph.interaction?.fragments?.[0]?.operands[1].items)
      .toEqual([{ kind: 'message', id: 'other' }]);
    expect(sourceOwnedGraphForExport028(edited, edited, graph)).toEqual(graph);
  });

  it('removes only a named connector line and preserves neighbors byte for byte', () => {
    const source = '// diagram note\r\n@diagram architecture\r\na service\r\nb service\r\n' +
      '  first = a -> b [calls]\r\n// keep this comment\r\n  second = b -> a as "Back"\r\n';
    const edited = deleteSourceOwnedEdges028(source, ['first']);
    expect(edited).toBe(source.replace('  first = a -> b [calls]\r\n', ''));
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges).toMatchObject([
      { id: 'second', first: { node: 'b' }, second: { node: 'a' }, label: 'Back' },
    ]);
  });

  it('refuses a deletion that would renumber a surviving unnamed connector', () => {
    const source = '@diagram architecture\na service\nb service\na -> b\nb -> a\n';
    expect(() => deleteSourceOwnedEdges028(source, ['edge-1']))
      .toThrow('coral.editor.source-delete.loss');
    expect(deleteSourceOwnedEdges028(source, ['edge-2']))
      .toBe('@diagram architecture\na service\nb service\na -> b\n');
  });

  it('refuses a line with attached source commentary or unknown identity', () => {
    const source = '@diagram architecture\na service\nb service\nlink = a -> b // keep\n';
    expect(() => deleteSourceOwnedEdges028(source, ['link']))
      .toThrow('coral.editor.source-delete.comment');
    expect(() => deleteSourceOwnedEdges028(source, ['missing']))
      .toThrow('coral.editor.source-delete.missing');
  });
});

describe('source-owned 0.2.8 leaf node deletion', () => {
  it('deletes an isolated flat sequence participant without changing message order', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'request = a -#> b\n';
    const edited = deleteSourceOwnedLeafNode028(source, 'c');
    expect(edited).toBe(source.replace('c participant\n', ''));
    const interaction = projectInstalledSourceToSuccessor028(edited).graph?.interaction;
    expect(interaction?.participantOrder).toEqual(['a', 'b']);
    expect(interaction?.items).toEqual([{ kind: 'message', id: 'request' }]);
  });

  it('deletes an isolated participant beside recursive alternatives without changing them', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\nunused participant\n' +
      'choice = alt "yes" {\n  yes = a -> b\n' +
      '} else "no" {\n  no = b -> a\n}\n';
    const edited = deleteSourceOwnedLeafNode028(source, 'unused');
    expect(edited).toBe(source.replace('unused participant\n', ''));
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.interaction?.participantOrder).toEqual(['a', 'b']);
    expect(graph.interaction?.fragments?.[0]?.operands.map((operand) => operand.items))
      .toEqual([[{ kind: 'message', id: 'yes' }], [{ kind: 'message', id: 'no' }]]);
  });

  it('removes only an isolated flat node and keeps neighboring source exact', () => {
    const source = '@diagram architecture\r\napi service\r\n// keep\r\nstore database\r\n';
    const edited = deleteSourceOwnedLeafNode028(source, 'api');
    expect(edited).toBe('@diagram architecture\r\n// keep\r\nstore database\r\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph?.nodes).toMatchObject([
      { id: 'store', type: 'database' },
    ]);
  });

  it('refuses connected, child-bearing, and comment-attached nodes', () => {
    expect(() => deleteSourceOwnedLeafNode028('@diagram architecture\na service\nb service\na -> b\n', 'a'))
      .toThrow('coral.editor.source-node-delete.connected');
    expect(() => deleteSourceOwnedLeafNode028('@diagram architecture\na group {\n  child service\n}\n', 'a'))
      .toThrow('coral.editor.source-node-delete.nested');
    expect(() => deleteSourceOwnedLeafNode028('@diagram architecture\na service // keep\n', 'a'))
      .toThrow('coral.editor.source-node-delete.comment');
  });
});

describe('source-owned 0.2.8 connected node deletion', () => {
  it('deletes a mixed selection atomically and keeps every surviving authored byte', () => {
    const source = '@diagram architecture\na service\nb service\nc service\nd service\n' +
      'ab = a -> b\n// keep this comment\nbc = b -> c\ncd = c -> d\n';
    const edited = deleteSourceOwnedSelection028(source, ['b'], ['cd']);
    expect(edited).toBe('@diagram architecture\na service\nc service\nd service\n' +
      '// keep this comment\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph).toMatchObject({
      nodes: [{ id: 'a' }, { id: 'c' }, { id: 'd' }], edges: [],
    });
  });

  it('refuses a mixed deletion that would renumber a surviving unnamed connector', () => {
    const source = '@diagram architecture\na service\nb service\nc service\nd service\n' +
      'a -> b\nc -> d\n';
    expect(() => deleteSourceOwnedSelection028(source, ['b'], []))
      .toThrow('coral.editor.source-delete.loss');
    expect(source).toContain('c -> d');
  });

  it('deletes selected participants and nested messages while retaining fragment order', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'choice = alt "yes" {\n  remove = a -> b\n  keep = a -> c\n' +
      '} else "no" {\n  alsoRemove = c -> a\n}\n';
    const edited = deleteSourceOwnedSelection028(source, ['b'], ['alsoRemove']);
    expect(edited).toBe(source.replace('b participant\n', '')
      .replace('  remove = a -> b\n', '')
      .replace('  alsoRemove = c -> a\n', ''));
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.interaction?.participantOrder).toEqual(['a', 'c']);
    expect(graph.interaction?.fragments?.[0]?.operands.map((operand) => operand.items))
      .toEqual([[{ kind: 'message', id: 'keep' }], []]);
  });

  it('deletes several selected leaf nodes with one shared incident connector', () => {
    const source = '@diagram architecture\na service\nb service\nc service\n' +
      'shared = a -> b\nsurvivor = c -> c\n';
    expect(deleteSourceOwnedSelection028(source, ['a', 'b'], []))
      .toBe('@diagram architecture\nc service\nsurvivor = c -> c\n');
  });

  it('deletes a top-level group subtree and its external connectors as exact source', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n  db database\n}\n' +
      'outside service\nlookup = outside -> team.api\n// keep outside\n' +
      'survivor = outside -> outside\n';
    const edited = deleteSourceOwnedSelection028(source, ['team'], []);
    expect(edited).toBe('@diagram architecture\noutside service\n// keep outside\n' +
      'survivor = outside -> outside\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph).toMatchObject({
      nodes: [{ id: 'outside' }], edges: [{ id: 'survivor' }],
    });
  });

  it('treats a selected group and its selected child as one subtree', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n}\noutside service\n';
    expect(deleteSourceOwnedSelection028(source, ['team', 'team.api'], []))
      .toBe('@diagram architecture\noutside service\n');
  });

  it('removes nested group ports and their incident references without changing a survivor', () => {
    const source = '@diagram architecture\nteam group {\n  platform group {\n' +
      '    api service {\n      audit port [direction: out]\n    }\n  }\n}\n' +
      'store database\nread = team.platform.api:audit -> store:query [reads]\n';
    expect(deleteSourceOwnedSelection028(source, ['team'], []))
      .toBe('@diagram architecture\nstore database\n');
  });

  it('refuses a group closing-line comment and leaves the source available as text', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n} // keep\n';
    expect(() => deleteSourceOwnedSelection028(source, ['team'], []))
      .toThrow('coral.editor.source-node-delete.comment');
    expect(source).toContain('} // keep');
  });

  it('refuses to erase a connector inside a group when both endpoints survive', () => {
    const source = '@diagram architecture\noutside service\nother service\n' +
      'team group {\n  api service\n  stay = outside -> other\n}\n';
    expect(() => deleteSourceOwnedSelection028(source, ['team'], []))
      .toThrow('coral.editor.source-node-delete.loss');
  });

  it('deletes one nested leaf and its named incident edge without changing its group', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n  peer service\n}\n' +
      'store database\nread = team.api -> store\n// retain\nkeep = team.peer -> store\n';
    const edited = deleteSourceOwnedSelection028(source, ['team.api'], []);
    expect(edited).toBe('@diagram architecture\nteam group {\n  peer service\n}\n' +
      'store database\n// retain\nkeep = team.peer -> store\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph).toMatchObject({
      nodes: [{ id: 'team', children: [{ id: 'team.peer' }] }, { id: 'store' }],
      edges: [{ id: 'keep' }],
    });
  });

  it('leaves an empty group intact after deleting its only nested leaf', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n}\n';
    const edited = deleteSourceOwnedSelection028(source, ['team.api'], []);
    expect(edited).toBe('@diagram architecture\nteam group {\n}\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph?.nodes)
      .toMatchObject([{ id: 'team' }]);
    expect(projectInstalledSourceToSuccessor028(edited).graph?.nodes[0]?.children).toBeUndefined();
  });

  it('refuses nested leaf deletion when a surviving unnamed edge would change identity', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n  peer service\n}\n' +
      'store database\nteam.api -> store\nteam.peer -> store\n';
    expect(() => deleteSourceOwnedSelection028(source, ['team.api'], []))
      .toThrow('coral.editor.source-delete.loss');
  });

  it('deletes a nested port-bearing node and its named connector as one source edit', () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    send port [direction: out, anchor: side]\n  }\n  peer service\n}\n' +
      'store database\nread = team.api:send -> store:query\n// retain\nkeep = team.peer -> store\n';
    const edited = deleteSourceOwnedSelection028(source, ['team.api'], []);
    expect(edited).toBe('@diagram architecture\nteam group {\n  peer service\n}\n' +
      'store database\n// retain\nkeep = team.peer -> store\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph).toMatchObject({
      nodes: [{ id: 'team', children: [{ id: 'team.peer' }] }, { id: 'store' }],
      edges: [{ id: 'keep' }],
    });
  });

  it('deletes a nested group and its descendants while preserving its parent and sibling', () => {
    const source = '@diagram architecture\nouter group {\n  inner group {\n' +
      '    api service {\n      send port [direction: out]\n    }\n  }\n' +
      '  peer service\n}\nstore database\nread = outer.inner.api:send -> store:query\n' +
      '// retain\nkeep = outer.peer -> store\n';
    const edited = deleteSourceOwnedSelection028(source, ['outer.inner'], []);
    expect(edited).toBe('@diagram architecture\nouter group {\n  peer service\n}\n' +
      'store database\n// retain\nkeep = outer.peer -> store\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph).toMatchObject({
      nodes: [{ id: 'outer', children: [{ id: 'outer.peer' }] }, { id: 'store' }],
      edges: [{ id: 'keep' }],
    });
  });

  it('keeps an empty parent after deleting its only nested group', () => {
    const source = '@diagram architecture\nouter group {\n  inner group {}\n}\n';
    const edited = deleteSourceOwnedSelection028(source, ['outer.inner'], []);
    expect(edited).toBe('@diagram architecture\nouter group {\n}\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph?.nodes[0]?.children).toBeUndefined();
  });

  it('refuses nested-group deletion with an attached header, body, or closing comment', () => {
    for (const source of [
      '@diagram architecture\nouter group {\n  inner group { // retain\n    api service\n  }\n}\n',
      '@diagram architecture\nouter group {\n  inner group {\n    // retain\n    api service\n  }\n}\n',
      '@diagram architecture\nouter group {\n  inner group {\n    api service // retain\n  }\n}\n',
      '@diagram architecture\nouter group {\n  inner group {\n    api service\n  } // retain\n}\n',
    ]) expect(() => deleteSourceOwnedSelection028(source, ['outer.inner'], []))
      .toThrow('coral.editor.source-node-delete.comment');
  });

  it('does not mistake a quoted URL label for group commentary', () => {
    const source = '@diagram architecture\nouter group {\n  inner group {\n' +
      '    api service as "https://example.test/api"\n  }\n}\n';
    expect(deleteSourceOwnedSelection028(source, ['outer.inner'], []))
      .toBe('@diagram architecture\nouter group {\n}\n');
  });

  it('refuses port-bearing node deletion when its body has attached commentary', () => {
    for (const source of [
      '@diagram architecture\napi service { // retain\n  send port [direction: out]\n}\n',
      '@diagram architecture\napi service {\n  // retain\n  send port [direction: out]\n}\n',
      '@diagram architecture\napi service {\n  send port [direction: out]\n} // retain\n',
    ]) expect(() => deleteSourceOwnedSelection028(source, ['api'], []))
      .toThrow('coral.editor.source-node-delete.comment');
  });

  it('refuses a port-bearing deletion that would renumber a surviving unnamed connector', () => {
    const source = '@diagram architecture\napi service {\n  send port [direction: out]\n}\n' +
      'peer service\nstore database\napi:send -> store:query\npeer -> store\n';
    expect(() => deleteSourceOwnedSelection028(source, ['api'], []))
      .toThrow('coral.editor.source-delete.loss');
  });

  it('deletes a flat sequence participant with its named messages as one edit', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'request = a -#> b\n// keep\nreply = b -.-> a\nother = a -> c\n';
    const edited = deleteSourceOwnedNodeWithConnections028(source, 'b');
    expect(edited).toBe('@diagram uml-sequence\na participant\nc participant\n' +
      '// keep\nother = a -> c\n');
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.interaction?.participantOrder).toEqual(['a', 'c']);
    expect(graph.interaction?.items).toEqual([{ kind: 'message', id: 'other' }]);
    expect(graph.interaction?.messages).toMatchObject([{ id: 'other',
      senderParticipantId: 'a', receiverParticipantId: 'c' }]);
  });

  it('deletes a participant and named nested messages as one recursive source edit', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'choice = alt "yes" {\n  removeYes = a -> b\n  keepYes = a -> c\n' +
      '} else "no" {\n  removeNo = b -> a\n  keepNo = c -> a\n}\n';
    const edited = deleteSourceOwnedNodeWithConnections028(source, 'b');
    expect(edited).toBe(source.replace('b participant\n', '')
      .replace('  removeYes = a -> b\n', '')
      .replace('  removeNo = b -> a\n', ''));
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'c']);
    expect(graph.edges.map((edge) => edge.id)).toEqual(['keepYes', 'keepNo']);
    expect(graph.interaction?.fragments?.[0]?.operands.map((operand) => operand.items))
      .toEqual([[{ kind: 'message', id: 'keepYes' }], [{ kind: 'message', id: 'keepNo' }]]);
  });

  it('keeps emptied operands portable when participant deletion removes their messages', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  yes = a -> b\n' +
      '} else "no" {\n  no = b -> a\n}\n';
    const edited = deleteSourceOwnedNodeWithConnections028(source, 'b');
    expect(edited).toBe('@diagram uml-sequence\na participant\n' +
      'choice = alt "yes" {\n} else "no" {\n}\n');
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.interaction?.fragments?.[0]?.operands.map((operand) => operand.items))
      .toEqual([[], []]);
    expect(sourceOwnedGraphForExport028(edited, edited, graph)).toEqual(graph);
  });

  it('refuses sequence participant deletion when surviving identities would change', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'a -> b\na -> c\n';
    expect(() => deleteSourceOwnedNodeWithConnections028(source, 'b'))
      .toThrow('coral.editor.source-delete.loss');
    const recursive = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'choice = alt "yes" {\n  a -> b\n} else "no" {\n  b -> a\n}\n';
    expect(deleteSourceOwnedNodeWithConnections028(recursive, 'c'))
      .toBe(recursive.replace('c participant\n', ''));
    const renumbered = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
      'choice = alt "yes" {\n  a -> b\n  a -> c\n' +
      '} else "no" {\n  c -> a\n}\n';
    expect(() => deleteSourceOwnedNodeWithConnections028(renumbered, 'b'))
      .toThrow('coral.editor.source-delete.loss');
  });

  it('removes a flat node and its named incident connectors as one source edit', () => {
    const source = '@diagram architecture\na service\nb service\nc service\n' +
      'inbound = a -> b\n// keep\noutbound = b -> c\nother = c -> a\n';
    const edited = deleteSourceOwnedNodeWithConnections028(source, 'b');
    expect(edited).toBe('@diagram architecture\na service\nc service\n// keep\nother = c -> a\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph).toMatchObject({
      nodes: [{ id: 'a' }, { id: 'c' }], edges: [{ id: 'other' }],
    });
  });

  it('refuses when removal would renumber a surviving unnamed connector', () => {
    const source = '@diagram architecture\na service\nb service\nc service\na -> b\na -> c\n';
    expect(() => deleteSourceOwnedNodeWithConnections028(source, 'b'))
      .toThrow('coral.editor.source-delete.loss');
  });
});

describe('source-owned 0.2.8 canvas connections', () => {
  it('appends a flat sequence message after existing authored items without changing them', () => {
    const source = '// Keep the source.\n@diagram uml-sequence\nclient participant\nserver participant\n' +
      'request = client -#> server as "load()"\n';
    const edited = appendSourceOwnedEdge028(source, {
      id: 'reply', sourceId: 'server', targetId: 'client', label: 'result',
    });
    expect(edited).toBe(source + 'reply = server -> client as "result"\n');
    const graph = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(graph.interaction?.items).toEqual([
      { kind: 'message', id: 'request' }, { kind: 'message', id: 'reply' },
    ]);
    expect(graph.interaction?.messages[1]).toMatchObject({
      id: 'reply', kind: 'asynchronous', senderParticipantId: 'server', receiverParticipantId: 'client',
    });
    expect(graph.edges[1]).toMatchObject({ id: 'reply', first: { node: 'server' },
      second: { node: 'client' }, direction: 'first-to-second', label: 'result' });
    expect(resolveSourceOwnedEdgePorts028(graph, resolveSuccessorGraphNodes028(graph),
      { sourceId: 'server', targetId: 'client' })).toEqual({});
  });

  it('uses the approved sequence operator for an explicitly chosen message kind', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n';
    const sync = appendSourceOwnedEdge028(source, {
      id: 'request', type: 'sync', sourceId: 'a', targetId: 'b',
    });
    expect(sync).toBe(source + 'request = a -#> b [sync]\n');
    const returned = appendSourceOwnedEdge028(sync, {
      id: 'reply', type: 'return', sourceId: 'b', targetId: 'a',
    });
    expect(returned).toBe(sync + 'reply = b -.-> a [return]\n');
    expect(projectInstalledSourceToSuccessor028(returned).graph?.interaction?.messages)
      .toMatchObject([{ kind: 'synchronous' }, { kind: 'return' }]);
    expect(() => appendSourceOwnedEdge028(source, {
      type: 'destroy', sourceId: 'a', targetId: 'b',
    })).toThrow('coral.editor.source-edge.invalid');
  });

  it('appends a top-level named message after a recursive fragment without changing it', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  yes = a -> b\n} else "no" {\n  no = b -> a\n}\n';
    const before = projectInstalledSourceToSuccessor028(source).graph!;
    const edited = appendSourceOwnedEdge028(source, {
      id: 'after', type: 'sync', sourceId: 'a', targetId: 'b', label: 'Done',
    });
    expect(edited).toBe(source + 'after = a -#> b [sync] as "Done"\n');
    const after = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(after.interaction?.items).toEqual([
      { kind: 'fragment', id: 'choice' }, { kind: 'message', id: 'after' },
    ]);
    expect(after.interaction?.fragments).toEqual(before.interaction?.fragments);
    expect(after.interaction?.messages.slice(0, -1)).toEqual(before.interaction?.messages);
    expect(after.edges.slice(0, -1)).toEqual(before.edges);
  });

  it('appends after nested alternatives while retaining every authored nested identity', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'outer = alt "yes" {\n  inner = alt "again" {\n    retry = a -> b\n' +
      '  } else "stop" {\n    stop = b -> a\n  }\n' +
      '} else "no" {\n  reject = b -> a\n}\n';
    const edited = appendSourceOwnedEdge028(source, { id: 'after', sourceId: 'a', targetId: 'b' });
    expect(edited).toBe(source + 'after = a -> b\n');
    const before = projectInstalledSourceToSuccessor028(source).graph!;
    const after = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(after.interaction?.fragments).toEqual(before.interaction?.fragments);
    expect(after.interaction?.items).toEqual([
      { kind: 'fragment', id: 'outer' }, { kind: 'message', id: 'after' },
    ]);
  });

  it('inserts a named message after a nested operand message without changing other source', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'outer = alt "yes" {\n  inner = alt "again" {\n    nested = a -> b  // keep\n' +
      '    unchanged = b -> a\n  } else "stop" {\n    stop = b -> a\n  }\n' +
      '} else "no" {\n  rejected = b -> a\n}\n';
    const edited = appendSourceOwnedEdge028(source, { afterMessageId: 'nested', id: 'follow',
      type: 'sync', sourceId: 'b', targetId: 'a', label: 'Retry' });
    expect(edited).toBe(source.replace('    nested = a -> b  // keep\n',
      '    nested = a -> b  // keep\n    follow = b -#> a [sync] as "Retry"\n'));
    const before = projectInstalledSourceToSuccessor028(source).graph!;
    const after = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(after.interaction?.items).toEqual(before.interaction?.items);
    expect(after.interaction?.fragments?.[1]?.operands[0]?.items).toEqual([
      { kind: 'message', id: 'nested' }, { kind: 'message', id: 'follow' },
      { kind: 'message', id: 'unchanged' },
    ]);
    expect(after.edges.filter((edge) => edge.id !== 'follow')).toEqual(before.edges);
  });

  it('requires a stable ID for positioned insertion and preserves unnamed survivor IDs', () => {
    const source = '@diagram uml-sequence\r\na participant\r\nb participant\r\n' +
      'choice = alt "yes" {\r\n  a -> b\r\n  b -> a\r\n' +
      '} else "no" {\r\n  a -> b\r\n}\r\n';
    expect(() => appendSourceOwnedEdge028(source, { afterMessageId: 'edge-1',
      sourceId: 'b', targetId: 'a' })).toThrow('coral.editor.source-edge.id-required');
    const edited = appendSourceOwnedEdge028(source, { afterMessageId: 'edge-1',
      id: 'named', sourceId: 'b', targetId: 'a' });
    expect(edited).toContain('  a -> b\r\n  named = b -> a\r\n  b -> a\r\n');
    const before = projectInstalledSourceToSuccessor028(source).graph!;
    const after = projectInstalledSourceToSuccessor028(edited).graph!;
    expect(after.edges.filter((edge) => edge.id !== 'named')).toEqual(before.edges);
    expect(after.interaction?.messages.filter((message) => message.id !== 'named'))
      .toEqual(before.interaction?.messages);
  });

  it('authors a named, typed connector without rewriting existing declarations', () => {
    const source = '// Keep this source.\n@diagram architecture\napi service\nstore database\n';
    const edited = appendSourceOwnedEdge028(source, {
      id: 'readOrders', type: 'reads', sourceId: 'api', targetId: 'store', label: 'Order IDs',
    });
    expect(edited).toBe(source + 'readOrders = api -> store [reads] as "Order IDs"\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges).toMatchObject([
      { id: 'readOrders', type: 'reads', label: 'Order IDs',
        first: { node: 'api' }, second: { node: 'store' } },
    ]);
    expect(() => appendSourceOwnedEdge028(source, {
      id: 'api', type: 'reads', sourceId: 'api', targetId: 'store',
    })).toThrow(/duplicate|already exists/i);
  });
  const source = '@diagram architecture\napi service {\n' +
    '  audit port [direction: out, anchor: auto]\n}\n' +
    'store database {\n  receive port [direction: in, anchor: side]\n}\n';

  it('appends a semantic-port connection without rewriting its declarations', () => {
    const edited = appendSourceOwnedEdge028(source, {
      sourceId: 'api', targetId: 'store', sourceHandle: 'audit', targetHandle: 'receive',
    });
    expect(edited).toBe(source + 'api:audit -> store:receive\n');
    const graph = projectInstalledSourceToSuccessor028(edited).graph;
    expect(graph?.edges).toMatchObject([{ first: { node: 'api', port: 'audit' },
      second: { node: 'store', port: 'receive' }, direction: 'first-to-second' }]);
    expect(graph?.nodes[0]?.semanticPorts).toMatchObject([
      { id: 'audit', anchor: { kind: 'auto' } },
    ]);
  });

  it('keeps a plain connector port-unspecified even when both nodes have semantic ports', () => {
    const edited = appendSourceOwnedEdge028(source, { sourceId: 'api', targetId: 'store' });
    expect(edited).toBe(source + 'api -> store\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges[0]).toMatchObject({
      first: { node: 'api' }, second: { node: 'store' },
    });
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges[0]?.first.port).toBeUndefined();
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges[0]?.second.port).toBeUndefined();
  });

  it('authors a quoted connector label in the same source-preserving append', () => {
    const edited = appendSourceOwnedEdge028(source, {
      sourceId: 'api', targetId: 'store', sourceHandle: 'audit', targetHandle: 'receive',
      label: 'Reads "orders"',
    });
    expect(edited).toBe(source + 'api:audit -> store:receive as "Reads \\"orders\\""\n');
    expect(projectInstalledSourceToSuccessor028(edited).graph?.edges[0]?.label).toBe('Reads "orders"');
  });

  it('normalizes only a verified inout canvas handle suffix and preserves CRLF', () => {
    const crlf = '@diagram architecture\r\napi service {\r\n' +
      '  shared port [direction: inout]\r\n}\r\nstore database\r\n';
    const edited = appendSourceOwnedEdge028(crlf, {
      sourceId: 'api', targetId: 'store', sourceHandle: 'shared-out', targetHandle: 'query',
    });
    expect(edited).toBe(crlf + 'api:shared -> store:query\r\n');
  });

  it('refuses missing or direction-incompatible semantic ports', () => {
    expect(() => appendSourceOwnedEdge028(source, {
      sourceId: 'api', targetId: 'store', sourceHandle: 'missing', targetHandle: 'receive',
    })).toThrow('coral.editor.source-edge.port');
    expect(() => appendSourceOwnedEdge028(source, {
      sourceId: 'api', targetId: 'store', sourceHandle: 'in', targetHandle: 'receive',
    })).toThrow('coral.editor.source-edge.port');
    expect(() => appendSourceOwnedEdge028(source, {
      sourceId: 'api', targetId: 'store', sourceHandle: 'audit', targetHandle: 'query-out',
    })).toThrow('coral.editor.source-edge.port');
  });

  it('does not extend source that already has a bad semantic-port reference', () => {
    const invalid = source + 'api:missing -> store:receive\n';
    expect(() => appendSourceOwnedEdge028(invalid, {
      sourceId: 'api', targetId: 'store', sourceHandle: 'audit', targetHandle: 'receive',
    })).toThrow('coral.editor.source-edge.invalid');
  });
});

describe('GraphIR 4 export with frozen user symbols', () => {
  it('exports the accepted definition and its portable artwork profile', () => {
    const source = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol gate {', '  name "Gate"',
      '  size 40 x 40', '  artwork svg """',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
      '"""', '}', 'g service [symbol: "local.gate"]', ''].join('\n');
    const accepted = projectInstalledSourceToSuccessor028(source).graph!;
    const exported = sourceOwnedGraphForExport028(source, source, accepted);
    expect(exported.documentCatalog).toEqual([expect.objectContaining({ id: 'local.gate',
      artwork: expect.objectContaining({ profile: { id: 'coral.svg-artwork', version: '1' } }),
      digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })]);
    expect(exported.nodes[0]).toMatchObject({ id: 'g', symbol: 'local.gate' });
  });
});
