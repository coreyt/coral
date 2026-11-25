/**
 * Tests for diagram-editor parsers
 */

import { describe, it, expect } from 'vitest';
import { parseCoralDSL, parseMermaidDSL, KNOWN_NODE_TYPES } from '../src/parsers';
import { repairKnownNodeTypeTypos } from '../src/parsers';
import { resolveNotationNode028 } from '@coral-viz/render';

describe('CR-100 actual sequence capability attribution', () => {
  for (const note of [false, true]) it.each([
    ['#FF0000', 'edge-rgb'], ['thick', 'edge-stroke-weight'],
    ['animated:reverse', 'edge-motion'],
  ])('attributes grouped sequence %s failure to its edge (note='+note+')', async (style, capability) => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'team = participants a, b [label: "Operations"]\n' +
      (note ? 'memo = note "Review" on b\n' : '') +
      'okay = a -> b\ncall = b -> a [style: "'+style+'"]\n';
    const expected = { code: 'render.capability.'+capability,
      subject: { kind: 'edge', id: 'call' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"'+style+'"'),
      }) }) };
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toContainEqual(expect.objectContaining(expected));
    expect(parsed.sourceGraph?.interaction?.groups?.[0]?.id).toBe('team');
    expect(parsed.nodes).toEqual([]);
  });

});

describe('parseCoralDSL', () => {
  it.each([
    ['@diagram bpmn\narea group [symbol: "bpmn-pool"] {\n  work task\n}\n',
      ['area', 'area.work'], 'render.capability.bpmn-scope'],
  ] as const)('retains the source and scene when %s has a semantic warning', (source, ids, code) => {
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toEqual([]);
    expect(parsed.nodes.map(({ id }) => id)).toEqual(ids);
    expect(parsed.sourceGraph?.version).toBe('4.0.0');
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({ severity: 'warning', code }));
  });

  it('withholds disabled Chen ERD meaning while retaining the authored source', () => {
    const source = '@diagram erd\ncustomer entity\nid attribute\n' +
      'customer -- id [type: attribute]\n';
    const parsed = parseCoralDSL(source);
    expect(parsed.sourceGraph).toBeUndefined();
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
    expect(parsed.errors).toContainEqual(expect.objectContaining({
      code: 'header.diagram.disabled', range: expect.objectContaining({
        start: expect.objectContaining({ offset: source.indexOf('erd') }),
      }),
    }));
  });

  it('keeps a portable RGB edge while withholding the color-blind editor scene', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: #FF0000]';
    const result = parseCoralDSL(source);
    expect(result.sourceGraph?.edges[0]).toMatchObject({ id: 'paint',
      style: { strokeColor: '#FF0000' } });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'render.capability.edge-rgb',
      message: expect.stringContaining('stroke color'),
    }));
  });
  it('keeps an approved named color as exact portable RGB', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: green]';
    const result = parseCoralDSL(source);
    expect(result.sourceGraph?.edges[0]).toMatchObject({ id: 'paint',
      style: { strokeColor: '#008000' } });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'render.capability.edge-rgb',
    }));
  });
  it('keeps a typed style recipe while withholding an unsupported editor scene', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'paint = a -> b [style: "dotted, thick, animated:reverse"]';
    const result = parseCoralDSL(source);
    expect(result.sourceGraph?.edges[0]).toMatchObject({ id: 'paint',
      style: { lineStyle: 'dotted', strokeWeight: 'thick',
        motion: { kind: 'animated', direction: 'second-to-first' } } });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'render.capability.edge-stroke-weight',
    }));
  });
  it('displays a sequence note while retaining its ordered source meaning', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'check = note "Review" on worker';
    const result = parseCoralDSL(source);
    expect(result.sourceGraph?.interaction).toMatchObject({
      notes: [{ id: 'check', text: 'Review', participantIds: ['worker'] }],
      items: [{ kind: 'note', id: 'check' }],
    });
    expect(result.nodes.map(({ id }) => id)).toEqual(['api', 'worker']);
    expect(result.errors).toEqual([]);
  });
  it('withholds a cross-operand message note at its authored target', () => {
    const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
      'choice = alt "yes" {\n  call = api -> worker\n' +
      '} else "no" {\n  note "Review" on call\n}';
    const result = parseCoralDSL(source);
    expect(result.sourceGraph).toBeUndefined();
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.note.message-scope',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('call'),
      }) }),
    }));
  });
  it('withholds a Unicode-rejected sequence continuation and its hidden body', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "yes" {\n  first = a -> b\n}\u00a0else "no" {\n  hidden = b -> a\n}\n' +
      'after = a -> b\n';
    const result = parseCoralDSL(source);
    const spacing = result.errors.find((item) => item.code === 'coral.syntax.spacing.invalid');
    expect(source.slice(spacing!.range!.start.offset, spacing!.range!.end.offset)).toBe('\u00a0');
    expect(result.sourceGraph).toBeUndefined();
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
  it('opens a Block source document with the supported block node type', () => {
    expect(KNOWN_NODE_TYPES.has('block')).toBe(true);
    const result = parseCoralDSL('@diagram block\nproducer block\nconsumer block\n' +
      'transfer = producer -> consumer as "Data"\n');
    expect(result.errors).toEqual([]);
    expect(result.envelope?.metadata?.notation).toBe('block');
    expect(result.nodes.map((node) => node.id)).toEqual(['producer', 'consumer']);
    expect(result.edges[0]).toMatchObject({ id: 'transfer', label: 'Data' });
  });

  it('projects a source-selected 0.2.8 diagram through the editor parser', () => {
    const source = '@diagram architecture\napiGateway service as "API gateway"\n' +
      'auditSink service\ncall = apiGateway -> auditSink [type: calls] as "Send"\n';
    const result = parseCoralDSL(source);

    expect(result.errors).toEqual([]);
    expect(result.envelope?.metadata?.notation).toBe('architecture');
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'apiGateway', type: 'service', label: 'API gateway' }),
      expect.objectContaining({ id: 'auditSink', type: 'service', label: 'auditSink' }),
    ]));
    expect(result.edges[0]).toMatchObject({ id: 'call', source: 'apiGateway',
      target: 'auditSink', type: 'calls', label: 'Send' });
    expect(result.sourceGraph).toMatchObject({ version: '4.0.0',
      profile: { id: 'architecture' }, edges: [{ id: 'call',
        first: { node: 'apiGateway' }, second: { node: 'auditSink' } }] });
    expect(result.semanticInterpretations?.get('apiGateway')?.semanticPorts.map((port) => port.id))
      .toContain('out');
    expect(result.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('keeps node-local authored ports in source meaning and out of geometric display nodes', () => {
    const source = '@diagram architecture\napi service {\n  audit port [direction: out, anchor: auto]\n}\nstore database {\n  receive port [direction: in]\n}\napi:audit -> store:receive [reads]';
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([]);
    expect(result.sourceGraph?.nodes).toMatchObject([
      { id: 'api', semanticPorts: [{ id: 'audit', direction: 'out', anchor: { kind: 'auto' } }] },
      { id: 'store', semanticPorts: [{ id: 'receive', direction: 'in' }] },
    ]);
    expect(result.semanticInterpretations?.get('api')?.semanticPorts).toContainEqual(expect.objectContaining({
      id: 'audit', origin: 'authored', anchor: 'auto', anchorWasExplicit: true,
    }));
    expect(result.nodes.every((node) => node.ports === undefined)).toBe(true);
  });

  it('locates a catalog-port collision at the authored port declaration', () => {
    const source = '@diagram architecture\napi service {\n  out port [direction: out]\n}';
    const result = parseCoralDSL(source);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'coral.port.duplicate',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('out port') }) }),
      subject: { kind: 'node', id: 'api' },
    }));
  });

  it('locates an unknown explicit catalog symbol at its keyed source value', () => {
    const source = '@diagram architecture\napi service [symbol: "missing-symbol"]';
    const result = parseCoralDSL(source);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'coral.symbol.unknown', subject: { kind: 'node', id: 'api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"missing-symbol"'),
      }) }),
    }));
    expect(result.sourceGraph?.nodes[0]).toMatchObject({ symbol: 'missing-symbol' });
  });

  it('locates a grouped child anchor without losing its canonical owner', () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    audit port [direction: out, anchor: missingRim]\n  }\n}';
    const result = parseCoralDSL(source);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'coral.port.anchor.symbol-unknown',
      subject: { kind: 'node', id: 'team.api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('missingRim'),
      }) }),
    }));
    expect(result.sourceGraph?.nodes[0]?.children?.[0]?.id).toBe('team.api');
  });

  it('reports an unsupported sequence port at the authored declaration without drawing a false scene', () => {
    const source = '@diagram uml-sequence\nclient participant {\n  send port [direction: out]\n}\nserver participant\nclient -> server';
    const result = parseCoralDSL(source);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'render.capability.sequence-semantic-port',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('send port') }) }),
    }));
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('retains accepted recursive sequence meaning with a read-only display', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  retry = alt "again" {\n    client -> server\n' +
      '  } else "stop" {\n    server -> client\n  }\n' +
      '} else "no" {\n  server -> client\n}';
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([]);
    expect(result.sourceGraph?.interaction?.fragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'choice', kind: 'alt' }),
      expect.objectContaining({ id: 'retry', kind: 'alt' }),
    ]));
    expect(result.semanticInterpretations?.get('client')?.effectiveSymbolId).toBe('uml-participant');
    expect(result.semanticInterpretations?.get('server')?.effectiveSymbolId).toBe('uml-participant');
    expect(result.nodes.map((node) => node.id)).toEqual(['client', 'server']);
    expect(result.edges).toHaveLength(3);
  });

  it.each([
    ['parallel operands', 'path = par {\n  client -> server\n' +
      '} and "reply" {\n  server -> client\n}', 'par'],
    ['activation', 'work = activation client {\n  client -> server\n}', 'activation-start'],
    ['region', 'phase = region "Review" {\n  client -> server\n}', 'region'],
  ] as const)('displays %s and retains its source meaning', (_name, body, expected) => {
    const source = `@diagram uml-sequence\nclient participant\nserver participant\n${body}`;
    const result = parseCoralDSL(source);
    if (expected === 'par') expect(result.sourceGraph?.interaction?.fragments?.[0]?.kind).toBe('par');
    else expect(result.sourceGraph?.interaction?.items[0]).toEqual({
      kind: expected, id: expected === 'region' ? 'phase' : 'work',
    });
    expect(result.nodes.map(({ id }) => id)).toEqual(['client', 'server']);
    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });

  it('displays an activation with executable participant proximity', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'work = activation client {\n  call = client --#> server\n}';
    const result = parseCoralDSL(source);
    expect(result.sourceGraph?.interaction?.activations)
      .toEqual([{ id: 'work', participantId: 'client' }]);
    expect(result.errors).toEqual([]);
    expect(result.diagnostics.some((item) => item.code === 'coral.layout.proximity.unapplied')).toBe(false);
    expect(result.nodes).toHaveLength(2);
  });

  it('displays an operand-local activation with exact source meaning', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  work = activation client {\n    client -> server\n  }\n' +
      '} else "no" {\n  server -> client\n}';
    const result = parseCoralDSL(source);
    expect(result.sourceGraph?.interaction?.activations)
      .toEqual([{ id: 'work', participantId: 'client' }]);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(2);
    expect(result.errors).toEqual([]);
  });

  it('reports a bad authored sequence symbol before publishing a recursive scene', () => {
    const source = '@diagram uml-sequence\nclient participant [symbol: "missing-symbol"]\n' +
      'server participant\nchoice = alt "yes" {\n  retry = alt "again" {\n    client -> server\n' +
      '  } else "stop" {\n    server -> client\n  }\n' +
      '} else "no" {\n  server -> client\n}\n';
    const result = parseCoralDSL(source);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'coral.symbol.unknown', subject: { kind: 'node', id: 'client' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"missing-symbol"'),
      }) }),
    }));
    expect(result.errors.map((item) => item.code)).not.toContain('render.capability.sequence-fragment');
  });

  it('reports an invalid sequence port reference in a recursive scene', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'choice = alt "yes" {\n  retry = alt "again" {\n    client:missing -> server\n' +
      '  } else "stop" {\n    server -> client\n  }\n' +
      '} else "no" {\n  server -> client\n}\n';
    const result = parseCoralDSL(source);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'coral.port.reference.missing',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('missing'),
      }) }),
    }));
    expect(result.errors.map((item) => item.code)).not.toContain('render.capability.sequence-fragment');
  });

  it('publishes one catalog interpretation map for a flat saved-header sequence', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver actor\n' +
      'call = client -#> server as "load()"\n';
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([]);
    expect(result.sourceGraph?.interaction?.items).toEqual([{ kind: 'message', id: 'call' }]);
    expect(result.semanticInterpretations?.get('client')?.effectiveSymbolId).toBe('uml-participant');
    expect(result.semanticInterpretations?.get('server')?.effectiveSymbolId).toBe('uml-actor');
  });

  it('keeps portable destruction with a dedicated display message', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'client -> server [destroy] as "stop"';
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([]);
    expect(result.sourceGraph?.interaction?.participants).toContainEqual({
      id: 'server', nodeId: 'server', destroyedByMessageId: 'edge-1',
    });
    expect(result.sourceGraph?.interaction?.messages).toContainEqual(expect.objectContaining({
      id: 'edge-1', kind: 'destroy', receiverParticipantId: 'server',
    }));
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it('locates a saved-source port error from written successor endpoints', () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'read = api:missing -> store:query [reads]\n';
    const result = parseCoralDSL(source);
    const issue = result.errors.find((item) => item.code === 'coral.port.reference.missing');
    expect(issue?.range?.start.offset).toBe(source.indexOf('missing'));
    expect(issue?.subject).toEqual({ kind: 'edge', id: 'read' });
    expect(result.errors.some((item) => item.code === 'coral.editor.port-reference.invalid')).toBe(false);
  });

  it('admits an installed flowchart kind without relying on the legacy node list', () => {
    expect(KNOWN_NODE_TYPES.has('io')).toBe(false);
    const source = '@diagram flowchart\ninput io as "Input"\nwork process\ninput -> work [flow]\n';
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([]);
    expect(result.nodes.map((node) => node.id)).toEqual(['input', 'work']);
    expect(result.nodes[0]).toMatchObject({ id: 'input', type: 'io', label: 'Input' });
    expect(resolveNotationNode028(result.nodes[0]!, 'flowchart').status).toBe('resolved');
  });

  it('does not offer a semantic graph to the editor when the 0.2.8 header is invalid', () => {
    const source = '@diagram unknown\napiGateway service\n';
    const result = parseCoralDSL(source);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.errors.map((item) => item.code)).toContain('header.diagram.unsupported');
    expect(result.sourceGraph).toBeUndefined();
    expect(result.semanticInterpretations).toBeUndefined();
    const unknown = result.errors.find((item) => item.code === 'header.diagram.unsupported');
    expect(source.slice(unknown?.range?.start.offset, unknown?.range?.end.offset)).toBe('unknown');
    expect(unknown?.range?.start.offset).toBe(source.indexOf('unknown'));
    expect(unknown?.range?.start.column).toBe(9);
  });

  it('keeps the first authored location on a duplicate header directive', () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\n@conformanceLevel typical\n';
    const result = parseCoralDSL(source);
    const duplicate = result.errors.find((item) => item.code === 'header.directive.duplicate');
    expect(duplicate?.range?.start).toEqual({ line: 3, column: 0,
      offset: source.lastIndexOf('@conformanceLevel') });
    expect(duplicate?.related?.[0]?.position).toEqual({ line: 2, column: 0,
      offset: source.indexOf('@conformanceLevel') });
  });

  it('keeps 0.2.8 body diagnostics at authored offsets and withholds a partial graph', () => {
    const source = '// introductory note\n@diagram flowchart\nstart process\n' +
      'done process\nstart -> done [flow, "Yes"]\n';
    const result = parseCoralDSL(source);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    const error = result.errors.find((item) => item.code === 'coral.syntax.bracket.unknown-positional');
    expect(error?.range?.start.offset).toBe(source.indexOf('"Yes"'));
  });

  it('keeps explicit IDs stable when the rendered label changes', () => {
    const source = '@diagram architecture\napi service as "API?"\nstore database as "Store!"';
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([]);
    expect(result.nodes.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'api', label: 'API?' }, { id: 'store', label: 'Store!' },
    ]);
    expect(result.envelope?.metadata?.notation).toBe('architecture');
  });

  it('flattens grouped IDs without changing their source identity', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n}\nstore database\n' +
      'link = team.api -> store [type: reads] as "Query"';
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'team', label: 'team' }),
      expect.objectContaining({ id: 'team.api', parent: 'team' }),
      expect.objectContaining({ id: 'store', label: 'store' }),
    ]));
    expect(result.edges[0]).toMatchObject({
      id: 'link', source: 'team.api', target: 'store', type: 'reads', label: 'Query',
    });
  });

  it('keeps a connector label separate from a written semantic port', () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'link = api:out -.-> store:query as "No"';
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([]);
    expect(result.edges[0]).toMatchObject({
      id: 'link', label: 'No', sourcePort: 'out', targetPort: 'query',
      lineStyle: 'dashed',
    });
  });

  it('accepts comments and blank lines around ID-first declarations', () => {
    const result = parseCoralDSL('// lead\n@diagram flowchart\n\nstep process // body\n');
    expect(result.errors).toEqual([]);
    expect(result.nodes.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 'step', type: 'process' },
    ]);
  });

  it.each([
    ['aiml', 'classifier model'],
    ['data-engineering', 'warehouse warehouse'],
    ['uml-class', 'Order class'],
    ['sketch', 'idea step'],
  ] as const)('accepts an ID-first %s declaration', (profile, declaration) => {
    const result = parseCoralDSL(`@diagram ${profile}\n${declaration}\n`);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe(declaration.split(' ')[0]);
  });

  it('diagnoses a retired kind-first declaration without projecting it', () => {
    const source = '@diagram flowchart\nprocess "Old step" as oldStep\nnewStep process';
    const result = parseCoralDSL(source);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.legacy-node.unsupported',
    }));
    expect(result.sourceGraph).toBeUndefined();
    expect(result.nodes).toEqual([]);
  });
});

describe('parseMermaidDSL', () => {
  describe('flowchart declaration', () => {
    it('should skip flowchart TD declaration', () => {
      const result = parseMermaidDSL('flowchart TD');
      expect(result.nodes).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip graph LR declaration', () => {
      const result = parseMermaidDSL('graph LR');
      expect(result.nodes).toHaveLength(0);
    });
  });

  describe('node parsing', () => {
    it('should parse nodes from edges', () => {
      const result = parseMermaidDSL('A --> B');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe('A');
      expect(result.nodes[1].id).toBe('B');
    });

    it('should parse nodes with rectangle labels', () => {
      const result = parseMermaidDSL('A[My Label] --> B[Other Label]');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].label).toBe('My Label');
      expect(result.nodes[1].label).toBe('Other Label');
      expect(result.nodes.map((node) => node.type)).toEqual(['process', 'process']);
      expect(resolveNotationNode028(result.nodes[0], 'flowchart').effectiveSymbolId).toBe('flowchart-process');
    });

    it('should parse nodes with diamond labels (decision)', () => {
      const result = parseMermaidDSL('A{Is Valid?} --> B');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].label).toBe('Is Valid?');
      expect(result.nodes[0].type).toBe('decision');
      expect(resolveNotationNode028(result.nodes[0], 'flowchart').effectiveSymbolId).toBe('flowchart-decision');
    });

    it('retains a later explicit diamond declaration after a bare reference', () => {
      const result = parseMermaidDSL('flowchart TD\nA --> B\nB{Ready?} --> C');
      expect(result.nodes.find((node) => node.id === 'B')).toMatchObject({
        type: 'decision', label: 'Ready?',
      });
      expect(resolveNotationNode028(result.nodes.find((node) => node.id === 'B')!, 'flowchart').effectiveSymbolId)
        .toBe('flowchart-decision');
    });

    it('should parse nodes with rounded labels', () => {
      const result = parseMermaidDSL('A(Start) --> B(End)');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].label).toBe('Start');
    });

    it('should not duplicate nodes', () => {
      const result = parseMermaidDSL(`
A --> B
B --> C
A --> C
`);
      expect(result.nodes).toHaveLength(3);
    });
  });

  describe('edge parsing', () => {
    it('should parse simple edges', () => {
      const result = parseMermaidDSL('A --> B');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toMatchObject({
        source: 'A',
        target: 'B',
      });
    });

    it('should parse edges with labels', () => {
      const result = parseMermaidDSL('A -->|Yes| B');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].label).toBe('Yes');
    });

    it('should parse multiple edge types', () => {
      const dsl = `
A --> B
C --- D
`;
      const result = parseMermaidDSL(dsl);
      expect(result.edges).toHaveLength(2);
    });

    it('should extract dashed edge type from -.-> syntax', () => {
      const result = parseMermaidDSL('A -.-> B');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].lineStyle).toBe('dashed');
    });

    it('should not set lineStyle for solid --> edges', () => {
      const result = parseMermaidDSL('A --> B');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].lineStyle).toBeUndefined();
    });

    it('should not set lineStyle for --- edges', () => {
      const result = parseMermaidDSL('A --- B');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].lineStyle).toBeUndefined();
    });

    it('should preserve dashed style with labels', () => {
      const result = parseMermaidDSL('A -.->|Yes| B');
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].lineStyle).toBe('dashed');
      expect(result.edges[0].label).toBe('Yes');
    });
  });

  describe('comments', () => {
    it('should skip Mermaid comments', () => {
      const result = parseMermaidDSL(`
%% This is a comment
A --> B
`);
      expect(result.nodes).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('complete diagrams', () => {
    it('should parse a complete flowchart', () => {
      const dsl = `
flowchart TD
    A[Start] --> B{Is Valid?}
    B -->|Yes| C[Process]
    B -->|No| D[Error]
    C --> E[End]
    D --> E
`;
      const result = parseMermaidDSL(dsl);
      expect(result.nodes).toHaveLength(5);
      expect(result.edges).toHaveLength(5);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle indentation', () => {
      const dsl = `
flowchart TD
    A --> B
        B --> C
`;
      const result = parseMermaidDSL(dsl);
      expect(result.edges).toHaveLength(2);
    });
  });

  describe('decision labels remain separate from semantic ports', () => {
    it('does not infer a port reference from a Mermaid branch label', () => {
      const result = parseMermaidDSL('flowchart TD\nD{Choose} -->|Yes| A[Approve]');
      expect(result.errors).toEqual([]);
      expect(result.edges[0]).toMatchObject({ label: 'Yes' });
      expect(result.edges[0].sourcePort).toBeUndefined();
      expect(result.edges[0].targetPort).toBeUndefined();
    });
    it('keeps a Yes label without making a port reference', () => {
      const result = parseMermaidDSL(`
flowchart TD
    A[Start] --> B{Is Valid?}
    B -->|Yes| C[Process]
`);
      const yesEdge = result.edges.find(e => e.label === 'Yes');
      expect(yesEdge).toBeDefined();
      expect(yesEdge!.sourcePort).toBeUndefined();
    });

    it('keeps a No label without making a port reference', () => {
      const result = parseMermaidDSL(`
flowchart TD
    B{Check} -->|No| D[Error]
`);
      const noEdge = result.edges.find(e => e.label === 'No');
      expect(noEdge).toBeDefined();
      expect(noEdge!.sourcePort).toBeUndefined();
    });

    it('preserves label casing without changing port meaning', () => {
      const result = parseMermaidDSL(`
flowchart TD
    B{Check} -->|yes| C[OK]
    B -->|NO| D[Fail]
`);
      expect(result.edges.find(e => e.label === 'yes')!.sourcePort).toBeUndefined();
      expect(result.edges.find(e => e.label === 'NO')!.sourcePort).toBeUndefined();
    });

    it('does not collapse another outcome into an alt port', () => {
      const result = parseMermaidDSL(`
flowchart TD
    B{Check} -->|Maybe| C[Retry]
`);
      const edge = result.edges.find(e => e.label === 'Maybe');
      expect(edge!.sourcePort).toBeUndefined();
    });

    it('should not set sourcePort for non-diamond source nodes', () => {
      const result = parseMermaidDSL(`
flowchart TD
    A[Start] -->|Yes| B[End]
`);
      const edge = result.edges.find(e => e.label === 'Yes');
      expect(edge!.sourcePort).toBeUndefined();
    });

    it('does not invent a target port for a labeled decision edge', () => {
      const result = parseMermaidDSL(`
flowchart TD
    B{Check} -->|Yes| C[Process]
`);
      const edge = result.edges.find(e => e.label === 'Yes');
      expect(edge!.targetPort).toBeUndefined();
    });

    it('should not set targetPort for diamond-to-diamond edges', () => {
      const result = parseMermaidDSL(`
flowchart TD
    A{First} -->|Yes| B{Second}
`);
      const edge = result.edges.find(e => e.label === 'Yes');
      expect(edge!.sourcePort).toBeUndefined();
      expect(edge!.targetPort).toBeUndefined();
    });

    it('should handle the complete decision flowchart correctly', () => {
      const result = parseMermaidDSL(`
flowchart TD
    A[Start] --> B{Is Valid?}
    B -->|Yes| C[Process]
    B -->|No| D[Error]
    C --> E[End]
    D --> E
`);
      const yesEdge = result.edges.find(e => e.label === 'Yes');
      const noEdge = result.edges.find(e => e.label === 'No');
      const startEdge = result.edges.find(e => e.source === 'A');

      expect(yesEdge!.sourcePort).toBeUndefined();
      expect(noEdge!.sourcePort).toBeUndefined();
      expect(startEdge!.sourcePort).toBeUndefined();
    });

    it('does not reinterpret y/n/true/false label text as ports', () => {
      const result = parseMermaidDSL(`
flowchart TD
    A{Q1} -->|y| B[B]
    C{Q2} -->|n| D[D]
    E{Q3} -->|true| F[F]
    G{Q4} -->|false| H[H]
`);
      expect(result.edges.map((edge) => edge.label)).toEqual(['y', 'n', 'true', 'false']);
      expect(result.edges.every((edge) => edge.sourcePort === undefined)).toBe(true);
    });

    it('should not set sourcePort for diamond edges without labels', () => {
      const result = parseMermaidDSL(`
flowchart TD
    A{Check} --> B[Next]
`);
      const edge = result.edges[0];
      expect(edge.sourcePort).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should return empty results for empty input', () => {
      const result = parseMermaidDSL('');
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('reports an unrecognized line instead of silently dropping source', () => {
      const result = parseMermaidDSL('flowchart LR\nA[Alpha] --> B[Beta]\nnot mermaid');

      expect(result.nodes).toHaveLength(2);
      expect(result.errors).toEqual([{ line: 3, message: 'Unrecognized Mermaid line: not mermaid' }]);
    });

    it.each([
      'subgraph Group',
      'end',
      'style A fill:#fff',
      'classDef important fill:#fff',
      'class A important',
    ])('blocks unsupported source instead of silently dropping %j', (line) => {
      const result = parseMermaidDSL(`flowchart LR\nA[Alpha] --> B[Beta]\n${line}`);

      expect(result.errors).toEqual([{ line: 3, message: `Unsupported Mermaid syntax: ${line}` }]);
    });
  });
});

describe('Coral connector labels and port references', () => {
  it('keeps flowchart and BPMN outcome labels without inventing ports', () => {
    const flowchart = parseCoralDSL('@diagram flowchart\ncheck decision\nok process\ncheck -> ok as "Yes"');
    const bpmn = parseCoralDSL('@diagram bpmn\ngateway exclusiveGateway\nwork task\ngateway -> work as "No"');
    for (const result of [flowchart, bpmn]) {
      expect(result.errors).toEqual([]);
      expect(result.edges[0].sourcePort).toBeUndefined();
      expect(result.edges[0].targetPort).toBeUndefined();
    }
  });

  it('retains a port reference when the author writes it explicitly', () => {
    const result = parseCoralDSL('@diagram architecture\napi service\nstore database\n' +
      'api:out -> store:query as "Yes"');
    expect(result.errors).toEqual([]);
    expect(result.edges[0]).toMatchObject({ label: 'Yes', sourcePort: 'out', targetPort: 'query' });
  });
});

describe('repairKnownNodeTypeTypos', () => {
  it('corrects a misspelled keyword within edit distance to the closest known type', () => {
    const result = repairKnownNodeTypeTypos('servics "API"');
    expect(result.fixed).toBe('service "API"');
    expect(result.appliedFixes).toHaveLength(1);
    expect(result.appliedFixes[0]).toEqual({
      originalType: 'servics',
      correctedType: 'service',
      nodeLabel: 'API',
      location: { line: 1 },
    });
    expect(result.unresolved).toHaveLength(0);
  });

  it('corrects a case-only mutation of a known type', () => {
    const result = repairKnownNodeTypeTypos('Service "API"');
    expect(result.fixed).toBe('service "API"');
    expect(result.appliedFixes).toHaveLength(1);
    expect(result.appliedFixes[0]).toEqual({
      originalType: 'Service',
      correctedType: 'service',
      nodeLabel: 'API',
      location: { line: 1 },
    });
    expect(result.unresolved).toHaveLength(0);
  });

  it('leaves a genuinely unrecognizable type unresolved and unchanged', () => {
    const result = repairKnownNodeTypeTypos('whatchamacallit "API"');
    expect(result.fixed).toBe('whatchamacallit "API"');
    expect(result.appliedFixes).toHaveLength(0);
    expect(result.unresolved).toEqual(['API']);
  });

  it('leaves lines whose type is already known untouched', () => {
    const dsl = 'service "API"\ndatabase "Store"';
    const result = repairKnownNodeTypeTypos(dsl);
    expect(result.fixed).toBe(dsl);
    expect(result.appliedFixes).toHaveLength(0);
    expect(result.unresolved).toHaveLength(0);
  });

  it('fixes multiple defects across lines and reports 1-based line numbers', () => {
    const dsl = 'servics "API"\ndatabas "Store"\napi -> store';
    const result = repairKnownNodeTypeTypos(dsl);
    expect(result.fixed).toBe('service "API"\ndatabase "Store"\napi -> store');
    expect(result.appliedFixes).toHaveLength(2);
    expect(result.appliedFixes[0].location).toEqual({ line: 1 });
    expect(result.appliedFixes[1].location).toEqual({ line: 2 });
    expect(result.unresolved).toHaveLength(0);
  });

  it('preserves trailing content, such as an opening brace, after the corrected type', () => {
    const result = repairKnownNodeTypeTypos('servics "API" {\n  port: 8080\n}');
    expect(result.fixed).toBe('service "API" {\n  port: 8080\n}');
    expect(result.appliedFixes).toHaveLength(1);
  });

  // Regression test for a bug independent code review found by direct
  // execution: the original absolute-only edit-distance-2 threshold treated
  // 'api' and 'gpu' (distance 2, unrelated words) as a confident correction,
  // silently rewriting a plausible short type name into an unrelated known
  // type. The fix scales the threshold to the declared type's own length.
  it('does not correct a short type name to an unrelated known type at the same absolute distance', () => {
    const result = repairKnownNodeTypeTypos('api "External API"');
    expect(result.fixed).toBe('api "External API"');
    expect(result.appliedFixes).toHaveLength(0);
    expect(result.unresolved).toEqual(['External API']);
  });

  it('declines a correction when two known types are equally close (ambiguous)', () => {
    // 'modul' is genuinely distance 1 from both 'module' and 'model' — a
    // realistic typo that could plausibly mean either. Guessing either one
    // would be a confident-looking but unjustified correction.
    const result = repairKnownNodeTypeTypos('modul "Auth"');
    expect(result.fixed).toBe('modul "Auth"');
    expect(result.appliedFixes).toHaveLength(0);
    expect(result.unresolved).toEqual(['Auth']);
  });
});
