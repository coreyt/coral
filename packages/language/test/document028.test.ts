import { describe, expect, it } from 'vitest';
import { validateIR } from '@graph-ir/core';
import { parseDocument028 } from '../src/parser/document028.js';
import { HEADER_MANIFEST_028 } from '../src/parser/header-manifest028.js';
import { prepareHeaderForSave028 } from '../src/parser/header028.js';
import { setCandidateLabel } from '../src/parser/candidate028.js';

const trustedDigests = Object.fromEntries(Object.values(HEADER_MANIFEST_028['0.2.8']!).flatMap(
  (edition) => edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));
const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests };

describe('Coral 0.2.8 source document — RED before implementation', () => {
  it('projects authored positions and a pin without changing the saved source', () => {
    const source = '// Preserve this comment.\n@diagram architecture\n' +
      'api service @ (120, 80) pinned\nstore database @ (-24.5, 0)\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.nodes).toMatchObject([
      { id: 'api', position: { x: 120, y: 80 }, pinned: true },
      { id: 'store', position: { x: -24.5, y: 0 } },
    ]);
    expect(parsed.graph?.nodes[1]).not.toHaveProperty('pinned');
  });

  it('locates a pin without coordinates and refuses semantic projection while retaining text', () => {
    const source = '@diagram architecture\napi service pinned\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    const diagnostic = parsed.syntax.diagnostics.find((item) => item.code === 'coral.node.pin.invalid');
    expect(diagnostic).toBeDefined();
    expect(source.slice(diagnostic!.range.start.offset, diagnostic!.range.end.offset)).toBe('pinned');
    expect(parsed.graph).toBeUndefined();
  });

  it('keeps a child position in its group-local GraphIR coordinate frame', () => {
    const source = '@diagram architecture\nteam group @ (100, 200) pinned {\n' +
      '  api service @ (10, 20) pinned\n}\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.nodes).toMatchObject([{
      id: 'team', position: { x: 100, y: 200 }, pinned: true,
      children: [{ id: 'team.api', parent: 'team', position: { x: 10, y: 20 }, pinned: true }],
    }]);
  });

  it('refuses a non-finite coordinate without dropping the authored text', () => {
    const source = '@diagram architecture\napi service @ (1e999, 0) pinned\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics.map((item) => item.code)).toContain('coral.node.position.invalid');
    expect(parsed.graph).toBeUndefined();
  });

  it('projects authored node and edge label placement without changing written endpoints', () => {
    const source = '@diagram architecture\n' +
      'api service as "API" label below offset 12\n' +
      'store database\n' +
      'request = api -> store as "Request" label above at 0.25 offset 8\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.nodes[0]).toMatchObject({ id: 'api', labelPlacement: { side: 'below', offset: 12 } });
    expect(parsed.graph?.edges[0]).toMatchObject({ id: 'request', source: 'api', target: 'store',
      labelPlacement: { side: 'above', at: 0.25, offset: 8 } });
  });

  it.each([
    ['edge at', 'label below at 1.2', '1.2'],
    ['node offset', 'label center offset 8', '8'],
    ['edge offset', 'label above offset -1', '-1'],
  ] as const)('locates invalid %s while retaining exact source', (_case, clause, token) => {
    const isNode = _case === 'node offset';
    const source = '@diagram architecture\napi service' + (isNode ? ` ${clause}` : '') +
      '\nstore database\n' + (isNode ? '' : `request = api -> store as "Request" ${clause}\n`);
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    const finding = parsed.syntax.diagnostics.find((item) => item.code === 'coral.label-placement.range.invalid');
    expect(finding).toBeDefined();
    expect(source.slice(finding!.range.start.offset, finding!.range.end.offset)).toBe(token);
    expect(parsed.graph).toBeUndefined();
  });

  it('projects a named edge route with ordered absolute waypoints and preserves the source', () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'request = api -> store\nroute edge request {\n' +
      '  turn = waypoint at (240, 80)\n' +
      '  finish = waypoint at (300, -20)\n}\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.edges[0]).toMatchObject({ id: 'request', source: 'api', target: 'store',
      routeIntent: { waypoints: [
        { id: 'turn', placement: { kind: 'absolute', position: { x: 240, y: 80 } } },
        { id: 'finish', placement: { kind: 'absolute', position: { x: 300, y: -20 } } },
      ] } });
    expect(validateIR(parsed.graph!).errors).toEqual([]);
  });

  it.each([
    ['unknown edge', 'route edge absent {\n  turn = waypoint at (1, 2)\n}',
      'coral.route.edge.unresolved', 'absent'],
    ['nonfinite point', 'route edge request {\n  turn = waypoint at (1e999, 2)\n}',
      'coral.route.waypoint.position.invalid', '1e999'],
    ['duplicate waypoint', 'route edge request {\n  turn = waypoint at (1, 2)\n' +
      '  turn = waypoint at (3, 4)\n}', 'coral.route.waypoint.id.duplicate', 'turn'],
  ] as const)('locates %s without rewriting the saved source', (_name, route, code, token) => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'request = api -> store\n' + route + '\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    const finding = parsed.syntax.diagnostics.find((item) => item.code === code);
    expect(finding).toBeDefined();
    expect(source.slice(finding!.range.start.offset, finding!.range.end.offset)).toBe(token);
    expect(parsed.graph).toBeUndefined();
  });

  it('resolves a group-local route to the qualified named edge', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n  db database\n' +
      '  request = api -> db\n  route edge request {\n' +
      '    turn = waypoint at (20, 30)\n  }\n}\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.edges[0]).toMatchObject({ id: 'team.request',
      routeIntent: { waypoints: [{ id: 'turn', placement: { kind: 'absolute',
        position: { x: 20, y: 30 } } }] } });
  });

  it('keeps first and second route anchors on written ends of a reverse arrow', () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'request = api <- store\nroute edge request {\n' +
      '  leave = waypoint relative to first offset (20, 0)\n' +
      '  arrive = waypoint relative to second offset (-20, 0)\n}\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.edges[0]).toMatchObject({ id: 'request', source: 'api', target: 'store',
      routeIntent: { waypoints: [
        { id: 'leave', placement: { kind: 'relative', anchor: { kind: 'source' },
          offset: { x: 20, y: 0 } } },
        { id: 'arrive', placement: { kind: 'relative', anchor: { kind: 'target' },
          offset: { x: -20, y: 0 } } },
      ] } });
    expect(validateIR(parsed.graph!).errors).toEqual([]);
  });

  it('locates an unknown relative route anchor and retains exact text', () => {
    const source = '@diagram architecture\na service\nb database\nr = a -> b\n' +
      'route edge r {\n  bend = waypoint relative to middle offset (1, 2)\n}\n';
    const parsed = parseDocument028(source, runtime);
    const finding = parsed.syntax.diagnostics.find(({ code }) => code === 'coral.route.anchor.invalid');
    expect(finding).toBeDefined();
    expect(parsed.syntax.diagnostics.map(({ code }) => code)).toEqual(['coral.route.anchor.invalid']);
    expect(source.slice(finding!.range.start.offset, finding!.range.end.offset)).toBe('middle');
    expect(parsed.graph).toBeUndefined();
    expect(parsed.header.source).toBe(source);
  });

  it('resolves a named waypoint anchor in its group to a qualified node ID', () => {
    const source = '@diagram architecture\nteam group {\n  api service\n  db database\n' +
      '  request = api -> db\n  route edge request {\n' +
      '    bend = waypoint relative to node api offset (20, 0)\n  }\n}\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.edges[0]?.routeIntent?.waypoints).toEqual([{
      id: 'bend', placement: { kind: 'relative',
        anchor: { kind: 'node', nodeId: 'team.api' }, offset: { x: 20, y: 0 } },
    }]);
    expect(validateIR(parsed.graph!).errors).toEqual([]);
    expect(parsed.header.source).toBe(source);
  });

  it('locates a missing named waypoint anchor without changing source', () => {
    const source = '@diagram architecture\na service\nb database\nr = a -> b\n' +
      'route edge r {\n  bend = waypoint relative to node absent offset (1, 2)\n}\n';
    const parsed = parseDocument028(source, runtime);
    const finding = parsed.syntax.diagnostics.find(({ code }) => code === 'coral.route.anchor.node.unresolved');
    expect(finding).toBeDefined();
    expect(parsed.syntax.diagnostics.map(({ code }) => code)).toEqual(['coral.route.anchor.node.unresolved']);
    expect(source.slice(finding!.range.start.offset, finding!.range.end.offset)).toBe('absent');
    expect(parsed.graph).toBeUndefined();
    expect(parsed.header.source).toBe(source);
  });

  it('keeps a group-local semantic port route anchor typed and source-exact', () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    outbound port [direction: out, anchor: E]\n  }\n  db database\n' +
      '  request = api:outbound -> db\n  route edge request {\n' +
      '    bend = waypoint relative to port api:outbound offset (20, 0)\n  }\n}\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.edges[0]?.routeIntent?.waypoints).toEqual([{
      id: 'bend', placement: { kind: 'relative',
        anchor: { kind: 'port', nodeId: 'team.api', portId: 'outbound' },
        offset: { x: 20, y: 0 } },
    }]);
  });

  it('locates a port waypoint whose node is unresolved without changing source', () => {
    const source = '@diagram architecture\na service\nb database\nr = a -> b\n' +
      'route edge r {\n  bend = waypoint relative to port absent:out offset (1, 2)\n}\n';
    const parsed = parseDocument028(source, runtime);
    const finding = parsed.syntax.diagnostics.find(({ code }) => code === 'coral.route.anchor.node.unresolved');
    expect(finding).toBeDefined();
    expect(source.slice(finding!.range.start.offset, finding!.range.end.offset)).toBe('absent');
    expect(parsed.graph).toBeUndefined();
    expect(parsed.header.source).toBe(source);
  });

  it('rejects a second route on the same edge and an unclosed route', () => {
    const prefix = '@diagram architecture\na service\nb database\nr = a -> b\n';
    const duplicate = parseDocument028(prefix +
      'route edge r {\n  one = waypoint at (1, 2)\n}\n' +
      'route edge r {\n  two = waypoint at (3, 4)\n}\n', runtime);
    expect(duplicate.syntax.diagnostics.map(({ code }) => code))
      .toContain('coral.route.edge.duplicate');
    expect(duplicate.graph).toBeUndefined();
    const unclosed = parseDocument028(prefix + 'route edge r {\n  one = waypoint at (1, 2)\n', runtime);
    expect(unclosed.syntax.diagnostics.map(({ code }) => code)).toContain('coral.route.unclosed');
    expect(unclosed.graph).toBeUndefined();
  });

  it.each([
    ['flowchart', 'start process', { id: 'flowchart', version: '1.0.0' }],
    ['architecture', 'api service', { id: 'architecture', version: '1.0.0' }],
    ['bpmn', 'received event', { id: 'bpmn', version: '1.0.0' }],
    ['code', 'api module', { id: 'code', version: '1.0.0' }],
    ['aiml', 'model model', { id: 'aiml', version: '1.0.0' }],
    ['data-engineering', 'pipeline process', { id: 'data-engineering', version: '1.0.0' }],
    ['sketch', 'idea cloud', { id: 'sketch', version: '1.0.0' }],
    ['uml-sequence', 'client participant', { id: 'uml', kind: 'sequence', version: '1.0.0' }],
    ['uml-class', 'Order class', { id: 'uml', kind: 'class', version: '1.0.0' }],
  ] as const)('selects the %s profile and default catalog only from source', (diagramType, body, profile) => {
    const parsed = parseDocument028(`@diagram ${diagramType}\n${body}\n`, runtime);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.header.header?.profile).toEqual(profile);
    expect(parsed.header.header?.catalog).toEqual(
      HEADER_MANIFEST_028['0.2.8']![diagramType]!.catalogs[0]);
    expect(parsed.graph?.nodes).toHaveLength(1);
  });

  it('selects UML sequence semantics solely from the required source header', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'client -#> server as "load()"\n';
    const result = parseDocument028(source, runtime);
    expect(result.header.diagnostics).toEqual([]);
    expect(result.syntax.diagnostics).toEqual([]);
    expect(result.header.header?.profile).toEqual({ id: 'uml', kind: 'sequence', version: '1.0.0' });
    expect(result.graph?.interaction?.messages[0]?.kind).toBe('synchronous');
    expect(result.graph?.metadata?.notation).toBe('uml-sequence');
  });

  it('retains an invalid sequence continuation without projecting or reassigning its messages', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "yes" {\n  first = a -> b\n}\u00a0else "no" {\n  hidden = b -> a\n}\n' +
      'after = a -> b\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics.map((item) => item.code)).toContain('coral.syntax.spacing.invalid');
    expect(parsed.graph).toBeUndefined();
    expect(parsed.syntax.sequenceItems.map((item) => item.kind)).toEqual(['fragment', 'edge']);
    expect(parsed.syntax.statements.filter((item) => item.kind === 'edge').map((item) => item.id?.value))
      .toEqual(['first', 'after']);
  });

  it('retains a rejected sequence opener without projecting its hidden messages', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "bad\\q" {\n  hidden = a -> b\n}\nafter = b -> a\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics.map((item) => item.code)).toContain('coral.syntax.string.invalid-escape');
    expect(parsed.graph).toBeUndefined();
    expect(parsed.syntax.sequenceItems.map((item) => item.kind)).toEqual(['edge']);
    expect(parsed.syntax.statements.filter((item) => item.kind === 'edge').map((item) => item.id?.value))
      .toEqual(['after']);
  });

  it.each([
    ['flowchart', 'process'], ['architecture', 'service'], ['uml-class', 'class'],
  ] as const)('does not leak the UML sequence meaning of -> into %s', (diagramType, kind) => {
    const source = `@diagram ${diagramType}\nfirst ${kind}\nsecond ${kind}\nfirst -> second\n`;
    const result = parseDocument028(source, runtime);
    expect(result.header.diagnostics).toEqual([]);
    expect(result.syntax.diagnostics).toEqual([]);
    expect(result.graph?.edges).toHaveLength(1);
    expect(result.graph?.interaction).toBeUndefined();
    expect(result.graph?.edges[0]?.type).not.toBe('async');
  });

  it('does not authorize a semantic graph when identity is invalid, but recovers body syntax', () => {
    const source = '@diagram unknown\nfirst process\nsecond process\nfirst -> second\n';
    const result = parseDocument028(source, runtime);
    expect(result.header.diagnostics.map((item) => item.code)).toContain('header.diagram.unsupported');
    const unknown = result.header.diagnostics.find((item) => item.code === 'header.diagram.unsupported')!;
    expect(source.slice(unknown.range.start.offset, unknown.range.end.offset)).toBe('unknown');
    expect(result.graph).toBeUndefined();
    expect(result.syntax.statements.map((item) => item.kind)).toEqual(['node', 'node', 'edge']);
  });

  it.each([
    ['missing header', 'api service\n', ['node']],
    ['retired header', '@graph {"id":"old"}\napi service\n', ['node']],
    ['retired declaration', 'service "Old API" as api\n', []],
  ] as const)('retains %s text without projecting retired Coral meaning', (_case, source, statementKinds) => {
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.header.diagnostics.map((item) => item.code)).toContain('header.diagram.required');
    expect(parsed.syntax.statements.map((item) => item.kind)).toEqual(statementKinds);
    if (_case === 'retired declaration') {
      expect(parsed.syntax.diagnostics.map((item) => item.code))
        .toContain('coral.syntax.legacy-node.unsupported');
    }
    expect(parsed.graph).toBeUndefined();
  });

  it('keeps Chen ERD text and body syntax but disables its 0.2.8 document type', () => {
    const source = '@diagram erd\n@coralVersion "0.2.8"\ncustomer entity\nid attribute\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.source).toBe(source);
    expect(parsed.header.header).toBeUndefined();
    expect(parsed.header.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.disabled',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('erd') }) }),
    }));
    expect(parsed.syntax.statements.map((item) => item.kind)).toEqual(['node', 'node']);
    expect(parsed.graph).toBeUndefined();
  });

  it('applies the same keyed-field spelling without treating an edge shorthand as a header parameter', () => {
    const source = '@diagram flowchart\na process\nb process\na -> b [type: flow, label: "Yes"]\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.edges[0]).toMatchObject({ type: 'flow', label: 'Yes' });

    const wrongScope = parseDocument028(source.replace('@diagram flowchart', '@diagram flowchart [flow]'), runtime);
    expect(wrongScope.header.diagnostics.map((item) => item.code))
      .toContain('header.attribute.colon-required');
    expect(wrongScope.syntax.diagnostics).toEqual([]);
    expect(wrongScope.graph).toBeUndefined();
  });

  it('stores conformance through its directive, not the reserved diagram bracket', () => {
    const approved = parseDocument028('@diagram flowchart\n@conformanceLevel strict\na process\n', runtime);
    expect(approved.header.diagnostics).toEqual([]);
    expect(approved.header.header?.conformanceLevel).toBe('strict');
    expect(approved.graph?.nodes[0]?.id).toBe('a');

    const unapproved = parseDocument028('@diagram flowchart [conformanceLevel: strict]\na process\n', runtime);
    expect(unapproved.header.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.attribute.unsupported',
    }));
    expect(unapproved.header.header).toBeUndefined();
    expect(unapproved.graph).toBeUndefined();
    expect(unapproved.syntax.statements).toMatchObject([{ kind: 'node', id: { value: 'a' } }]);
  });

  it('rejects a trailing comma at the exact token in both diagram and connector brackets', () => {
    const headerSource = '@diagram flowchart [mode: compact,]\na process\n';
    const invalidHeader = parseDocument028(headerSource, runtime);
    const headerComma = invalidHeader.header.diagnostics.find((item) => item.code === 'header.attribute.trailing-comma');
    expect(headerComma?.range.start.offset).toBe(headerSource.indexOf(',]'));
    expect(invalidHeader.graph).toBeUndefined();

    const edgeSource = '@diagram flowchart\na process\nb process\na -> b [type: flow,]\n';
    const invalidEdge = parseDocument028(edgeSource, runtime);
    const edgeComma = invalidEdge.syntax.diagnostics.find((item) => item.code === 'coral.syntax.bracket.trailing-comma');
    expect(edgeComma?.range.start.offset).toBe(edgeSource.indexOf(',]'));
    expect(invalidEdge.graph).toBeUndefined();
  });

  it('keeps body diagnostic offsets at their original source positions after header masking', () => {
    const source = '// 🪸\r\n@diagram flowchart\r\n@conformanceLevel typical\r\n' +
      'a process\r\nb process\r\na -> b [flow, "No"]\r\n';
    const parsed = parseDocument028(source, runtime);
    expect(parsed.header.diagnostics).toEqual([]);
    const error = parsed.syntax.diagnostics.find((item) => item.code === 'coral.syntax.bracket.unknown-positional');
    expect(error?.range.start.line).toBe(6);
    expect(error?.range.start.offset).toBe(source.indexOf('"No"'));
    expect(parsed.graph).toBeUndefined();
  });

  it('edits a full source document and reopens after an explicit version-pin operation', () => {
    const source = '// retained introduction\r\n@diagram architecture\r\n' +
      '@conformanceLevel typical\r\n' +
      'apiGateway = service as \'API gateway\'  // retain this comment\r\n' +
      'auditSink service\r\n' +
      'call = apiGateway -> auditSink [type: calls] as "Send"\r\n';
    const opened = parseDocument028(source, runtime);
    expect(opened.header.diagnostics).toEqual([]);
    expect(opened.syntax.diagnostics).toEqual([]);
    const node = opened.syntax.statements.find((item) => item.kind === 'node' && item.id.value === 'apiGateway');
    expect(node).toBeDefined();
    const edited = setCandidateLabel(source, node!, 'Primary API');
    expect(edited).toBe(source.replace("as 'API gateway'", "as 'Primary API'"));

    const beforeSave = parseDocument028(edited, runtime);
    const saved = prepareHeaderForSave028(edited, beforeSave.header, runtime);
    expect(saved.source).toBe(edited.replace('@diagram architecture\r\n',
      '@diagram architecture\r\n@coralVersion "0.2.8"\r\n'));
    const reopened = parseDocument028(saved.source, runtime);
    expect(reopened.header.diagnostics).toEqual([]);
    expect(reopened.syntax.diagnostics).toEqual([]);
    expect(reopened.header.header?.explicit.coralVersion).toBe(true);
    expect(reopened.graph?.nodes.find((item) => item.id === 'apiGateway')?.label).toBe('Primary API');
    expect(reopened.graph?.edges[0]).toMatchObject({ id: 'call', type: 'calls', label: 'Send' });
    expect(reopened.syntax.statements.find((item) => item.kind === 'edge' && item.id?.value === 'call'))
      .toBeDefined();
  });
});
