import { describe, expect, it } from 'vitest';
import { validateIR, type GraphIR } from '@graph-ir/core';
import { parseCandidate028, setCandidateLabel } from '../../language/src/parser/candidate028.js';
import { parseDocument028, HEADER_MANIFEST_028, prepareHeaderForSave028 } from '@coral-viz/language';
import { parse as parseCoral } from '../../language/src/parser/index.js';
import { print as printCoral } from '../../language/src/printer/index.js';
import { validateSequenceInteraction } from '../../language/src/sequence.js';
import { checkGraphConformance028, layoutSequence, markerId, parseInstalledDocument028,
  prepareInstalledDocumentForSave028, renderSvg, resolveNodeInterpretation028,
  resolveRenderScene, semanticLayoutPorts028, shapeRegistry, stencilFitPoint028, symbolRegistry,
  visualStyle028,
  type CatalogSnapshot028 } from '../../render/src/index.js';
import { notationCatalogIdentity028 } from '../../render/src/notations/index.js';
import { layoutGraphForSvg } from '../../render/src/svg/layout.js';

describe('0.2.8 source to shared sequence scene', () => {
  it.each([
    ['flowchart', 'start process'],
    ['architecture', 'api service'],
    ['bpmn', 'received event'],
    ['code', 'api module'],
    ['aiml', 'model model'],
    ['data-engineering', 'pipeline process'],
    ['sketch', 'idea cloud'],
    ['uml-sequence', 'client participant'],
    ['uml-class', 'Order class'],
  ] as const)('carries source-selected %s identity into rendering and rule evaluation',
    (diagramType, body) => {
      const catalog = notationCatalogIdentity028(diagramType)!;
      const source = `@diagram ${diagramType}\n${body}\n`;
      const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
        trustedDigests: { [`${catalog.id}@${catalog.version}`]: catalog.digest } };
      const parsed = parseDocument028(source, runtime);
      expect(parsed.header.diagnostics).toEqual([]);
      expect(parsed.syntax.diagnostics).toEqual([]);
      expect(parsed.graph?.metadata?.notation).toBe(diagramType);
      expect(validateIR(parsed.graph!).errors).toEqual([]);
      expect(resolveRenderScene(parsed.graph!).nodes).toHaveLength(1);
      const report = checkGraphConformance028(parsed.graph!, {
        savedLevel: parsed.header.header!.conformanceLevel, operation: 'check',
      });
      expect(report.evaluatedLevel).toBe('typical');
      expect(report.catalog).toEqual(catalog);
      expect(report.claimStatus).toBe('not-claimed');
    });

  it('retains disabled Chen source syntax without projecting a 0.2.8 document', () => {
    const source = '@diagram erd\ncustomer entity\n';
    const catalog = notationCatalogIdentity028('erd')!;
    const parsed = parseDocument028(source, {
      manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
      trustedDigests: { [`${catalog.id}@${catalog.version}`]: catalog.digest },
    });
    expect(parsed.header.diagnostics.map((item) => item.code)).toContain('header.diagram.disabled');
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.syntax.statements).toHaveLength(1);
    expect(parsed.graph).toBeUndefined();
    expect(source).toBe('@diagram erd\ncustomer entity\n');
  });

  it('renders a source-selected diagram with safely defaulted header fields, then reopens its visible pin', async () => {
    const source = '@diagram architecture\nwebClient actor as "Web client"\n' +
      'apiGateway service as "API gateway"\nwebClient -> apiGateway [type: calls, label: "HTTPS"]\n';
    const catalog = notationCatalogIdentity028('architecture')!;
    const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
      trustedDigests: { [`${catalog.id}@${catalog.version}`]: catalog.digest } };
    const first = parseDocument028(source, runtime);
    expect(first.header.diagnostics).toEqual([]);
    expect(first.syntax.diagnostics).toEqual([]);
    expect(first.header.header).toMatchObject({ diagramType: 'architecture',
      conformanceLevel: 'typical', explicit: { coralVersion: false,
        profileVersion: false, catalogVersion: false, conformanceLevel: false } });
    expect(first.graph?.edges[0]).toMatchObject({ type: 'calls', label: 'HTTPS' });
    expect(validateIR(first.graph!).errors).toEqual([]);
    const laidOut = await layoutGraphForSvg(first.graph!);
    const svg = renderSvg(laidOut, { edgeRoutes: laidOut.edgeRoutes });
    expect(svg).toContain('Web client');
    expect(svg).toContain('HTTPS');

    const saved = prepareHeaderForSave028(source, first.header, runtime);
    expect(saved.source).toContain('@diagram architecture\n@coralVersion "0.2.8"\n');
    const reopened = parseDocument028(saved.source,
      { ...runtime, currentVersion: '0.2.9' });
    expect(reopened.header.diagnostics).toEqual([]);
    expect(reopened.syntax.diagnostics).toEqual([]);
    expect(reopened.header.header?.profile).toEqual(first.header.header?.profile);
    expect(reopened.header.header?.catalog).toEqual(first.header.header?.catalog);
    expect(reopened.graph?.edges[0]).toMatchObject({ type: 'calls', label: 'HTTPS' });
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
  });

  it('keeps a malformed source header out of the semantic/render path while retaining body recovery', () => {
    const catalog = notationCatalogIdentity028('architecture')!;
    const parsed = parseDocument028('@diagram architecture [calls]\n' +
      'webClient actor\napiGateway service\nwebClient -> apiGateway [calls]\n',
    { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
      trustedDigests: { [`${catalog.id}@${catalog.version}`]: catalog.digest } });
    expect(parsed.header.diagnostics.map((item) => item.code))
      .toContain('header.attribute.colon-required');
    expect(parsed.graph).toBeUndefined();
    expect(parsed.syntax.statements.map((item) => item.kind)).toEqual(['node', 'node', 'edge']);
  });

  it('rejects an invisible header separator without discarding independently valid body syntax', () => {
    const catalog = notationCatalogIdentity028('architecture')!;
    const separator = '\u{E0001}';
    const source = `@diagram architecture [mode:${separator}compact]\napi service\n`;
    const parsed = parseDocument028(source, {
      manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
      trustedDigests: { [`${catalog.id}@${catalog.version}`]: catalog.digest },
    });
    const spacing = parsed.header.diagnostics.find((item) => item.code === 'header.spacing.invalid');
    expect(spacing).toBeDefined();
    expect(source.slice(spacing!.range.start.offset, spacing!.range.end.offset)).toBe(separator);
    expect(parsed.syntax.statements.map((item) => item.kind)).toEqual(['node']);
    expect(parsed.graph).toBeUndefined();
  });

  it('uses source-saved conformance for a BPMN check without changing that source for one-off strict review', () => {
    const catalog = notationCatalogIdentity028('bpmn')!;
    const runtime = { manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8',
      trustedDigests: { [`${catalog.id}@${catalog.version}`]: catalog.digest } };
    for (const level of ['none', 'typical', 'strict'] as const) {
      const source = `@diagram bpmn\n@conformanceLevel ${level}\nreceived event\n`;
      const parsed = parseDocument028(source, runtime);
      expect(parsed.header.diagnostics).toEqual([]);
      expect(parsed.syntax.diagnostics).toEqual([]);
      const report = checkGraphConformance028(parsed.graph!, {
        savedLevel: parsed.header.header!.conformanceLevel, operation: 'check', notificationLevel: 'debug',
      });
      expect(report.findings.some((item) => item.id === 'BPMN.EVENT.CONCRETE_KIND_REQUIRED'))
        .toBe(level === 'strict');
      const oneOff = checkGraphConformance028(parsed.graph!, {
        savedLevel: parsed.header.header!.conformanceLevel, requestedLevel: 'strict',
        operation: 'check', notificationLevel: 'debug',
      });
      expect(oneOff.findings.map((item) => item.id)).toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
      expect(parsed.header.source).toBe(source);
      expect(parsed.header.header?.conformanceLevel).toBe(level);
    }
  });

  it('keeps a common architecture group distinct from the specialized container symbol', async () => {
    const source = '@diagram architecture\n' +
      'engineering group as "Engineering" {\n  api service\n}';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    const scene = resolveRenderScene(parsed.graph!);
    expect(scene.nodes.find((node) => node.id === 'engineering')?.symbolId).toBeUndefined();
    expect(scene.nodes.find((node) => node.id === 'engineering.api')?.symbolId).toBe('arch-service');
    const laid = await layoutGraphForSvg(parsed.graph!);
    expect(renderSvg(laid, { edgeRoutes: laid.edgeRoutes })).toContain('Engineering');
  });

  it('reports an invisible supplementary separator at its exact public-preview source span', () => {
    const separator = '\u{E0001}';
    const source = '@graph {"id":"spacing","metadata":{"notation":"architecture"}}\n' +
      `first service as "First${separator}label"\nsecond${separator}service\nthird service`;
    const parsed = parseCoral(source, { edition: '0.2.8-preview' });
    const spacing = parsed.diagnostics.filter((item) => item.code === 'coral.syntax.spacing.invalid');
    expect(spacing).toHaveLength(1);
    expect(source.slice(spacing[0]!.range!.start.offset, spacing[0]!.range!.end.offset)).toBe(separator);
    expect(parsed.graph?.nodes.map((node) => node.id)).toEqual(['first', 'third']);
    expect(parsed.graph?.nodes[0]?.label).toBe(`First${separator}label`);
  });

  it('renders a public-preview first-end arrow without exchanging its endpoints', () => {
    const source = '@graph {"id":"reverse","metadata":{"notation":"flowchart"}}\n' +
      'a process\nz process\nback = a <- z';
    const parsed = parseCoral(source, { edition: '0.2.8-preview' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(parsed.graph?.edges[0]).toMatchObject({ id: 'back', source: 'a', target: 'z' });
    const scene = resolveRenderScene(parsed.graph!);
    expect(scene.edges[0]?.source.marker?.kind).toBe('arrow');
    expect(scene.edges[0]?.target.marker?.kind).toBe('none');
    expect(renderSvg(parsed.graph!)).toContain('marker-start="url(');
  });

  it('does not misrepresent a reverse UML sequence message as a forward sender', () => {
    const source = '@graph {"id":"reverse-sequence","metadata":{"notation":"uml-sequence"}}\n' +
      'client participant\nserver participant\nclient <- server [return] as "result"';
    const parsed = parseCoral(source, { edition: '0.2.8-preview' });
    expect(parsed.success).toBe(false);
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code))
      .toContain('coral.sequence.message.operator.invalid');
    expect(parsed.graph?.edges ?? []).toEqual([]);
    expect(parsed.graph?.interaction?.messages ?? []).toEqual([]);
  });

  it('renders public-preview neutral connectors without catalog-default arrowheads', () => {
    const source = '@graph {"id":"neutral","metadata":{"notation":"architecture"}}\n' +
      'a service\nz service\nsolid = a -- z\ndashed = a -.- z';
    const parsed = parseCoral(source, { edition: '0.2.8-preview' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    const scene = resolveRenderScene(parsed.graph!);
    expect(scene.edges.map((edge) => [edge.source.marker?.kind, edge.target.marker?.kind]))
      .toEqual([['none', 'none'], ['none', 'none']]);
    const svg = renderSvg(parsed.graph!);
    expect(svg).not.toContain('marker-start="url(');
    expect(svg).not.toContain('marker-end="url(');
  });

  it.each([
    ['--#>', 'arrow', 'filled'],
    ['--|>', 'triangle', 'open'],
    ['--<>', 'diamond', 'open'],
    ['--o', 'circle', 'open'],
    ['--|', 'bar', 'unspecified'],
  ] as const)('carries %s marker meaning through candidate source, scene, and SVG',
    (operator, kind, fill) => {
      const parsed = parseCandidate028(`api service\ndb database\napi ${operator} db`,
        { profile: 'architecture' });
      expect(parsed.diagnostics).toEqual([]);
      expect(validateIR(parsed.graph).errors).toEqual([]);
      const edge = resolveRenderScene(parsed.graph).edges[0]!;
      expect(edge.target.marker).toMatchObject({ kind, fill });
      const svg = renderSvg(parsed.graph);
      expect(svg).toContain('marker-end="url(');
      const ink = visualStyle028('lowfi').ink;
      const id = markerId(edge.target.marker!, ink);
      const marker = svg.match(new RegExp(`<marker id="coral-instance-[^"]+-${id}"[^>]*>(.*?)</marker>`))?.[1];
      expect(marker, operator).toBeDefined();
      expect(marker, operator).toContain(`fill="${fill === 'filled' ? ink : 'none'}"`);
      expect(marker, operator).toContain(`stroke="${ink}"`);
    });

  it('keeps a neutral decision branch visible but direction-unverified in strict checking', () => {
    const source = '@graph {"id":"neutral-decision","metadata":{"notation":"flowchart"}}\n' +
      'entry process\nreview decision\napprove process\nreject process\n' +
      'entry -> review\nreview -> approve\nreview -- reject [flow]';
    const parsed = parseCoral(source, { edition: '0.2.8-preview' });
    expect(parsed.diagnostics).toEqual([]);
    const scene = resolveRenderScene(parsed.graph!);
    expect(scene.edges[2]?.source.marker?.kind).toBe('none');
    expect(scene.edges[2]?.target.marker?.kind).toBe('none');
    const report = checkGraphConformance028(parsed.graph!, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings.map((finding) => finding.id)).not.toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
    expect(report.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'FLOWCHART.DECISION.NEUTRAL_FLOW.UNVERIFIED',
    }));
    expect(report.claimStatus).toBe('unverified');
  });

  it('renders valid neighbors without projecting a syntax-invalid connector', () => {
    const source = 'a process\nz process\nbad = a -> z [flow, "No"]\ngood = a -> z [flow] as "Yes"';
    const parsed = parseCandidate028(source, { profile: 'flowchart' });
    expect(parsed.diagnostics.map((item) => item.code)).toContain('coral.syntax.bracket.unknown-positional');
    expect(parsed.graph.edges.map((edge) => edge.id)).toEqual(['good']);
    const scene = resolveRenderScene(parsed.graph);
    expect(scene.edges.map((edge) => edge.id)).toEqual(['good']);
    const svg = renderSvg(parsed.graph);
    expect(svg).toContain('Yes');
    expect(svg).not.toContain('data-coral-edge="bad"');
  });

  it('carries the approved UML class member syntax through the portable model and renderer', () => {
    const source = 'Order class as "Order" {\n  fields = attributes {\n    orderId = public attribute id: String\n  }\n}';
    const parsed = parseCandidate028(source, { profile: 'uml-class' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(parsed.graph.nodes[0]?.classifier?.compartments[1]).toMatchObject({ id: 'fields',
      kind: 'attributes', items: [{ id: 'orderId', name: 'id', type: 'String' }] });
    expect(resolveRenderScene(parsed.graph).nodes[0]?.id).toBe('Order');
    const svg = renderSvg(parsed.graph);
    expect(svg).toContain('Order');
    expect(svg).toContain('id');
    expect(svg).toContain('String');
  });

  it('carries named arrange-row intent from source through GraphIR and layout', async () => {
    const source = 'orders database\napi service\nworker service\nserviceRow = arrange row: api, worker, orders';
    const parsed = parseCandidate028(source, { profile: 'architecture' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(parsed.graph.constraints?.[0]).toMatchObject({ id: 'serviceRow', axis: 'row' });
    const laid = await layoutGraphForSvg(parsed.graph);
    const arranged = ['api', 'worker', 'orders'].map((id) => laid.nodes.find((node) => node.id === id)!);
    expect(arranged.every((node) => node.position && node.dimensions)).toBe(true);
    expect(arranged[0].position!.x).toBeLessThan(arranged[1].position!.x);
    expect(arranged[1].position!.x).toBeLessThan(arranged[2].position!.x);
    const centers = arranged.map((node) => node.position!.y + node.dimensions!.height / 2);
    expect(centers[0]).toBeCloseTo(centers[1]);
    expect(centers[1]).toBeCloseTo(centers[2]);
  });

  it('keeps untouched source bytes while a new label reaches the rendered scene', () => {
    const source = 'apiGateway service  // authored comment\nordersDatabase database\nread = apiGateway -> ordersDatabase [reads]';
    const before = parseCandidate028(source, { profile: 'architecture' });
    expect(before.diagnostics).toEqual([]);
    const edited = setCandidateLabel(source, before.statements[2]!, 'Order IDs');
    expect(edited).toBe('apiGateway service  // authored comment\nordersDatabase database\nread = apiGateway -> ordersDatabase [reads] as "Order IDs"');
    const after = parseCandidate028(edited, { profile: 'architecture' });
    expect(after.diagnostics).toEqual([]);
    expect(after.graph.edges[0]).toMatchObject({ id: 'read', type: 'reads', label: 'Order IDs' });
    expect(renderSvg(after.graph)).toContain('Order IDs');
  });

  it('renders a labeled edge after a full-header source edit and save/reopen', () => {
    const source = '@diagram architecture\napiGateway service as \'API gateway\' // retained\n' +
      'ordersDatabase database\nread = apiGateway -> ordersDatabase [reads]\n';
    const opened = parseInstalledDocument028(source);
    expect(opened.header.diagnostics).toEqual([]);
    expect(opened.syntax.diagnostics).toEqual([]);
    const edge = opened.syntax.statements.find((item) => item.kind === 'edge' && item.id?.value === 'read');
    expect(edge).toBeDefined();
    const edited = setCandidateLabel(source, edge!, 'Order IDs');
    const parsedEdit = parseInstalledDocument028(edited);
    const saved = prepareInstalledDocumentForSave028(edited, parsedEdit).source;
    expect(saved).toContain("apiGateway service as 'API gateway' // retained");
    expect(saved).toContain('read = apiGateway -> ordersDatabase [reads] as "Order IDs"');
    const reopened = parseInstalledDocument028(saved);
    expect(reopened.header.diagnostics).toEqual([]);
    expect(reopened.syntax.diagnostics).toEqual([]);
    expect(reopened.graph?.edges[0]).toMatchObject({ id: 'read', type: 'reads', label: 'Order IDs' });
    expect(renderSvg(reopened.graph!)).toContain('Order IDs');
  });

  it.each([{ width: 120, height: 120 }, { width: 240, height: 80 }, { width: 80, height: 240 }])(
    'carries a catalog-named hard pin through layout, shared scene, and browser SVG at $width × $height',
    async (dimensions) => {
    const base = symbolRegistry.get('flowchart-decision')!;
    const symbol = { ...base, namedAnchors: [{ id: 'reviewRim', side: 'EAST' as const, position: 0.25 }] };
    const catalog: CatalogSnapshot028 = { identity: { id: 'fixture', version: '1', digest: 'fixture' },
      profileId: 'fixture', symbols: new Map([[symbol.id, symbol]]),
      allowedSymbolIds: new Set([symbol.id]), typeSymbols: new Map([['decision', symbol.id]]) };
    const interpreted = resolveNodeInterpretation028({ id: 'a', type: 'decision',
      authoredPorts: [{ id: 'review', direction: 'out', anchor: { kind: 'symbol', id: 'reviewRim' } }] }, catalog);
    const ports = semanticLayoutPorts028(interpreted, symbol, undefined, 'RIGHT').ports;
    const graph: GraphIR = { version: '3.0.0', id: 'named-anchor-svg',
      metadata: { notation: 'flowchart' }, nodes: [
        { id: 'a', type: 'decision', symbol: symbol.id, ports,
          dimensions, position: { x: 50, y: 50 }, pinned: true },
        { id: 'b', type: 'process', dimensions: { width: 100, height: 60 },
          position: { x: 350, y: 50 }, pinned: true },
      ], edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'review', label: 'Review' }] };
    const laidOut = await layoutGraphForSvg(graph);
    const a = laidOut.nodes.find((node) => node.id === 'a')!;
    const route = laidOut.edgeRoutes.get('e')![0]!;
    const fitted = stencilFitPoint028(shapeRegistry.get('diamond')!, { x: 5 / 6, y: 1 / 3 },
      dimensions.width, dimensions.height);
    expect(route.startPoint.x).toBeCloseTo(a.position!.x + dimensions.width * fitted.x);
    expect(route.startPoint.y).toBeCloseTo(a.position!.y + dimensions.height * fitted.y);
    const scene = resolveRenderScene(laidOut, { edgeRoutes: laidOut.edgeRoutes });
    expect(scene.edges[0]?.points[0]).toEqual(route.startPoint);
    const svg = renderSvg(laidOut, { edgeRoutes: laidOut.edgeRoutes });
    expect(svg).toContain('data-coral-edge="e"');
    expect(svg).toContain('>Review</text>');
    expect(interpreted.semanticPorts.find((port) => port.id === 'review')?.anchor)
      .toEqual({ kind: 'symbol', id: 'reviewRim' });
  });

  it('keeps a draft BPMN event while an explicit strict check reports its missing kind', () => {
    const source = 'received event';
    const parsed = parseCandidate028(source, { profile: 'bpmn' });
    expect(parsed.diagnostics).toEqual([]);
    const graph = parsed.graph;
    expect(checkGraphConformance028(graph, { savedLevel: 'typical' }).findings).toEqual([]);
    const strict = checkGraphConformance028(graph,
      { savedLevel: 'typical', requestedLevel: 'strict', operation: 'check' });
    expect(strict.findings).toMatchObject([{ id: 'BPMN.EVENT.CONCRETE_KIND_REQUIRED',
      subject: { kind: 'node', id: 'received' } }]);
    expect(strict.claimStatus).toBe('failed');
    expect(graph.nodes[0]?.type).toBe('event');
    expect(source).toBe('received event');
  });

  it('uses one profile-scoped meaning from candidate source through scene and SVG', () => {
    const parsed = parseCandidate028('apiGateway service as "API gateway"\nordersDatabase database as "Orders DB"\nread = apiGateway -> ordersDatabase [reads] as "Order IDs"', { profile: 'architecture' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    const graph = parsed.graph;
    const scene = resolveRenderScene(graph);
    expect(scene.nodes.map((node) => node.symbolId)).toEqual(['arch-service', 'arch-database']);
    expect(scene.edges[0]?.label).toBe('Order IDs');
    const svg = renderSvg(graph);
    expect(svg).toContain('API gateway');
    expect(svg).toContain('Orders DB');
    expect(svg).toContain('Order IDs');
  });

  it('does not restore an ID label when the author explicitly writes as ""', () => {
    const parsed = parseCandidate028('auditSink service as ""', { profile: 'architecture' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.nodes[0]?.label).toBe('');
    expect(resolveRenderScene(parsed.graph).nodes[0]?.label).toBe('');
    const svg = renderSvg(parsed.graph);
    expect(svg).not.toContain('>auditSink</text>');
  });

  it('renders a selected dotted line style while keeping the authored source', () => {
    const source = '@diagram architecture\na service\nb service\na -> b [style: dotted]';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.header.source).toBe(source);
    expect(parsed.graph?.edges[0]?.style).toEqual({ lineStyle: 'dotted' });
    expect(renderSvg(parsed.graph!)).toContain('stroke-dasharray=');
  });

  it('keeps recursive group membership through candidate source, GraphIR, layout, scene, and SVG', async () => {
    const source = [
      'engineering group as "Engineering" {',
      '  delivery group as "Delivery" {',
      '    lead service as "Lead"',
      '    developer service as "Developer"',
      '  }',
      '}',
      'engineering.delivery.developer -> engineering.delivery.lead [calls]',
    ].join('\n');
    const parsed = parseCandidate028(source, { profile: 'architecture' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(parsed.graph.nodes[0]?.children?.[0]?.children?.map((node) => node.id))
      .toEqual(['engineering.delivery.lead', 'engineering.delivery.developer']);
    const laidOut = await layoutGraphForSvg(parsed.graph);
    const scene = resolveRenderScene(laidOut);
    expect(scene.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'engineering', 'engineering.delivery', 'engineering.delivery.lead',
      'engineering.delivery.developer',
    ]));
    const svg = renderSvg(laidOut, { edgeRoutes: laidOut.edgeRoutes });
    for (const label of ['Engineering', 'Delivery', 'Lead', 'Developer']) expect(svg).toContain(label);
  });

  it('keeps four flowchart branch labels separate from semantic port references', () => {
    const source = [
      'entry process', 'choose decision', 'alpha process', 'beta process',
      'gamma process', 'delta process', 'entry -> choose',
      'choose -> alpha as "First"', 'choose -> beta as "Second"',
      'choose -> gamma as "Third"', 'choose -> delta as "Fourth"',
    ].join('\n');
    const parsed = parseCandidate028(source, { profile: 'flowchart' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(parsed.graph.edges.filter((edge) => edge.source === 'choose')).toHaveLength(4);
    expect(parsed.graph.edges.every((edge) => edge.sourcePort === undefined && edge.targetPort === undefined))
      .toBe(true);
    expect(checkGraphConformance028(parsed.graph,
      { requestedLevel: 'strict', operation: 'check' }).findings).toEqual([]);
    const scene = resolveRenderScene(parsed.graph);
    expect(scene.edges.filter((edge) => edge.sourceId === 'choose')).toHaveLength(4);
    const svg = renderSvg(parsed.graph);
    for (const label of ['First', 'Second', 'Third', 'Fourth']) expect(svg).toContain(label);
  });

  it('uses reverse-arrow direction for strict flowchart decision counts without rewriting endpoint order', () => {
    const source = [
      'entry process', 'review decision', 'approve process', 'reject process',
      'review <- entry', 'approve <- review', 'reject <- review',
    ].join('\n');
    const parsed = parseCandidate028(source, { profile: 'flowchart' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(parsed.graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['review', 'entry'], ['approve', 'review'], ['reject', 'review'],
    ]);
    expect(checkGraphConformance028(parsed.graph,
      { requestedLevel: 'strict', operation: 'check' }).findings).toEqual([]);
    expect(renderSvg(parsed.graph)).toContain('marker-start="url(');
  });

  it('renders a two-ended flow but does not pretend its decision direction is verified', () => {
    const source = [
      'entry process', 'review decision', 'approve process', 'other process',
      'entry -> review', 'review -> approve', 'other <-> review',
    ].join('\n');
    const parsed = parseCandidate028(source, { profile: 'flowchart' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    const report = checkGraphConformance028(parsed.graph,
      { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings).toEqual([]);
    expect(report.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'FLOWCHART.DECISION.TWO_ENDED_FLOW.UNVERIFIED',
    }));
    expect(renderSvg(parsed.graph)).toContain('marker-start="url(');
  });

  it('keeps creation meaning from text through model, layout, and SVG', () => {
    const source = 'client participant\nclient -.-> worker [create] as "spawn()"';
    const parsed = parseCandidate028(source, { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(validateSequenceInteraction(parsed.graph)).toEqual([]);
    expect(parsed.graph.nodes.find((node) => node.id === 'worker')).toMatchObject({
      type: 'participant', label: 'worker',
    });
    const scene = layoutSequence(parsed.graph);
    expect(scene.messages[0]).toMatchObject({ kind: 'create', dashed: true, head: 'open' });
    expect(scene.participants[1].header.y).toBeGreaterThan(scene.participants[0].header.y);
    expect(scene.messages[0].points[1].x).toBe(scene.participants[1].header.x);
    const svg = renderSvg(parsed.graph);
    expect(svg).toContain('data-coral-sequence-message="edge-1"');
    expect(svg).toContain('spawn()');
  });

  it('preserves a contradictory sequence annotation and reports it only during strict profile checking', () => {
    const parsed = parseCandidate028('client participant\nserver participant\nclient -#> server [async] as "load()"',
      { profile: 'uml-sequence' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph.edges[0]).toMatchObject({ type: 'async', label: 'load()' });
    expect(parsed.graph.interaction?.messages[0]?.kind).toBe('synchronous');
    const typical = checkGraphConformance028(parsed.graph, { savedLevel: 'typical' });
    expect(typical.findings).toMatchObject([{ id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT',
      severity: 'warning' }]);
    expect(typical.notices).toEqual([]);
    expect(checkGraphConformance028(parsed.graph,
      { requestedLevel: 'strict', operation: 'check' }).findings).toMatchObject([{
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', subject: { kind: 'edge', id: 'edge-1' },
    }]);
    expect(renderSvg(parsed.graph)).toContain('load()');
  });

  it('uses U2 rather than parser integrity for the same public-preview conflict', () => {
    const source = '@graph {"id":"conflict","metadata":{"notation":"uml-sequence"}}\n' +
      'client participant\nserver participant\nload = client -#> server [async] as "load()"\n' +
      'reply = server -.-> client [sync] as "result"';
    const parsed = parseCoral(source, { edition: '0.2.8-preview' });
    expect(parsed.diagnostics).toEqual([]);
    const report = checkGraphConformance028(parsed.graph!, { requestedLevel: 'strict', operation: 'check' });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', severity: 'error',
      subject: { kind: 'edge', id: 'load' },
    }));
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', severity: 'error',
      subject: { kind: 'edge', id: 'reply' },
    }));
    expect(renderSvg(parsed.graph!)).toContain('data-coral-sequence-message="load"');
  });

  it('renders the selected triangle shorthand and normalizes fill positions', () => {
    const source = 'a process\nb process\na --|> b';
    const parsed = parseCandidate028(source, { profile: 'flowchart' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(resolveRenderScene(parsed.graph).edges[0]?.target.marker).toEqual({ kind: 'triangle', fill: 'open' });
    expect(renderSvg(parsed.graph)).toContain('marker-end="url(');
    for (const operator of ['--#|>', '--|#>', '--|>#']) {
      const filled = parseCandidate028(source.replace('--|>', operator), { profile: 'flowchart' });
      expect(filled.diagnostics, operator).toEqual([]);
      expect(resolveRenderScene(filled.graph).edges[0]?.target.marker).toEqual({ kind: 'triangle', fill: 'filled' });
    }
  });

  it('carries approved diamond and circle fill spellings through preview source, scene, and SVG', () => {
    const operators = [
      ['--<>', 'diamond', 'open'], ['--#<>', 'diamond', 'filled'],
      ['--<#>', 'diamond', 'filled'], ['--<>#', 'diamond', 'filled'],
      ['--o', 'circle', 'open'], ['--#o', 'circle', 'filled'],
      ['--o#', 'circle', 'filled'],
    ] as const;
    for (const [operator, kind, fill] of operators) {
      const source = '@graph {"id":"decorated","metadata":{"notation":"flowchart"}}\n' +
        `a process\nb process\na ${operator} b`;
      const parsed = parseCoral(source, { edition: '0.2.8-preview' });
      expect(parsed.diagnostics, operator).toEqual([]);
      expect(validateIR(parsed.graph).errors, operator).toEqual([]);
      expect(resolveRenderScene(parsed.graph!).edges[0]?.target.marker, operator)
        .toEqual({ kind, fill });
      expect(renderSvg(parsed.graph!), operator).toContain('marker-end="url(');
      const printed = printCoral(parsed.graph!, { edition: '0.2.8-preview' });
      const reopened = parseCoral(printed, { edition: '0.2.8-preview' });
      expect(reopened.diagnostics, operator).toEqual([]);
      expect(resolveRenderScene(reopened.graph!).edges[0]?.target.marker, operator)
        .toEqual({ kind, fill });
    }
  });

  it('round-trips a crow-foot shorthand from Coral source through scene and SVG', () => {
    const source = '@graph {"id":"cardinality","metadata":{"notation":"erd"}}\n' +
      'customer entity\norder entity\ncustomer --{ order';
    const parsed = parseCoral(source, { edition: '0.2.8-preview' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph?.edges[0]?.targetEnd?.marker)
      .toEqual({ kind: 'crow-foot', fill: 'unspecified' });
    expect(resolveRenderScene(parsed.graph!).edges[0]?.target.marker?.kind).toBe('crow-foot');
    expect(renderSvg(parsed.graph!)).toContain('marker-end="url(');
    const printed = printCoral(parsed.graph!, { edition: '0.2.8-preview' });
    expect(printed).toContain('customer --{ order');
    const reopened = parseCoral(printed, { edition: '0.2.8-preview' });
    expect(reopened.diagnostics).toEqual([]);
    expect(reopened.graph?.edges[0]?.targetEnd?.marker?.kind).toBe('crow-foot');
  });

  it('keeps sequence message kind independent of a solid connector proximity hint', () => {
    const source = '@graph {"id":"messages","metadata":{"notation":"uml-sequence"}}\n' +
      'client participant\nserver participant\ncall = client --#> server as "load()"\n' +
      'send = client ---> server as "enqueue()"';
    const parsed = parseCoral(source, { edition: '0.2.8-preview' });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.graph?.interaction?.messages.map((message) => message.kind))
      .toEqual(['synchronous', 'asynchronous']);
    expect(parsed.graph?.edges.map((edge) => edge.targetEnd?.marker))
      .toEqual([{ kind: 'triangle', fill: 'filled' }, { kind: 'arrow', fill: 'open' }]);
    expect(renderSvg(parsed.graph!)).toContain('data-coral-sequence-message="call"');
    const invalid = parseCoral(source.replace('--#>', '--|>'), { edition: '0.2.8-preview' });
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.code))
      .toContain('coral.sequence.message.operator.invalid');
  });

  it('keeps staged and public-preview connector meaning in parity', () => {
    const operators = ['-', '->', '<-', '<->', '-.-', '-.->', '--|', '--|>', '--#|>', '--|#>', '--|>#',
      '--<>', '--#<>', '--<#>', '--<>#', '--o', '--#o', '--o#', '---->'];
    for (const operator of operators) {
      const body = `a service\nb service\na ${operator} b`;
      const staged = parseCandidate028(body, { profile: 'architecture' });
      const publicPreview = parseCoral('@graph {"id":"parity","metadata":{"notation":"architecture"}}\n' + body,
        { edition: '0.2.8-preview' });
      expect(staged.diagnostics, operator).toEqual([]);
      expect(publicPreview.diagnostics, operator).toEqual([]);
      expect(publicPreview.graph?.edges[0], operator).toMatchObject({
        source: staged.graph.edges[0]?.source,
        target: staged.graph.edges[0]?.target,
        sourceEnd: staged.graph.edges[0]?.sourceEnd,
        targetEnd: staged.graph.edges[0]?.targetEnd,
        ...(staged.graph.edges[0]?.style ? { style: staged.graph.edges[0].style } : {}),
      });
    }
  });

  it('preserves textual endpoint order while rendering first-end and two-ended arrows', () => {
    const parsed = parseCandidate028('a process\nz process\na <- z\na <-> z', { profile: 'flowchart' });
    expect(parsed.diagnostics).toEqual([]);
    expect(validateIR(parsed.graph).errors).toEqual([]);
    expect(parsed.graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['a', 'z'], ['a', 'z'],
    ]);
    const scene = resolveRenderScene(parsed.graph);
    expect(scene.edges.map((edge) => [edge.source.marker?.kind, edge.target.marker?.kind])).toEqual([
      ['arrow', 'none'], ['arrow', 'arrow'],
    ]);
    const svg = renderSvg(parsed.graph);
    expect(svg).toContain('marker-start="url(');
    expect(svg).toContain('marker-end="url(');
  });
});
