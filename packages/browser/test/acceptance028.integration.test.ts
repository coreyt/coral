import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { render } from '../src/render.js';
import { CoralRenderError } from '../src/errors.js';
import { checkInstalledDocumentConformance028, parseInstalledDocument028,
  checkInstalledSuccessorSourceConformance028,
  getAvailableNotations028, projectInstalledSourceToSuccessor028,
  resolveSuccessorGraphNodes028, semanticLayoutPorts028, symbolRegistry } from '@coral-viz/render';

const fixture = (name: string): string => readFileSync(
  resolve(import.meta.dirname, 'fixtures', 'acceptance028', name), 'utf8');

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
    await expect(render(source)).rejects.toMatchObject({ diagnostics: [expect.objectContaining(expected)] });
  });

});

describe('bounded BPMN semantic capabilities', () => {
  it.each([
    ['BPMN pool scope', '@diagram bpmn\narea group [symbol: "bpmn-pool"] {\n' +
      '  work task\n}\n', 'render.capability.bpmn-scope', 'node', 'area'],
  ])('reports unverified %s without changing source meaning', async (
    _name, source, code, kind, id,
  ) => {
    const before = projectInstalledSourceToSuccessor028(source);
    expect(before.diagnostics).toEqual([]);
    for (const style of ['lowfi', 'hifi'] as const) {
      const result = await render(source, { style });
      expect(result.sourceGraph).toEqual(before.graph);
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        severity: 'warning', code, subject: { kind, id },
        range: expect.objectContaining({ start: expect.objectContaining({ offset: expect.any(Number) }) }),
      }));
      expect(result.svg).toContain('<svg');
    }
  });
});

describe('disabled Chen ERD document type', () => {
  it.each(['erd-relationship.coral', 'erd-relationship-node.coral', 'erd-hub.coral'])(
    '%s retains source but cannot publish a 0.2.8 graph or scene', async (filename) => {
      const source = fixture(filename);
      const parsed = parseInstalledDocument028(source);
      expect(parsed.header.source).toBe(source);
      expect(parsed.header.diagnostics.map((item) => item.code)).toContain('header.diagram.disabled');
      expect(parsed.graph).toBeUndefined();
      await expect(render(source)).rejects.toMatchObject({
        diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'header.diagram.disabled' })]),
      });
    });
});

const cases = [
  ['architecture', 'architecture-ports.coral'],
  ['block', 'block-ports.coral'],
  ['flowchart', 'flowchart-draft.coral'],
  ['bpmn', 'bpmn-event.coral'],
  ['uml-sequence', 'uml-sequence-flat.coral'],
  ['uml-class', 'uml-class-named.coral'],
] as const;

describe('0.2.8 authored-source cross-profile acceptance', () => {
  it.each([
    ['block', 'item block'], ['architecture', 'api service'], ['aiml', 'item model'],
    ['code', 'item module'], ['data-engineering', 'item process'], ['sketch', 'item cloud'],
    ['flowchart', 'item process'], ['bpmn', 'item task'], ['uml-class', 'item class'],
    ['uml-sequence', 'item participant'],
  ])('renders %s while a separate explicit check names only bounded conformance', async (profile, declaration) => {
    const source = `@diagram ${profile}\n${declaration}\n`;
    const before = projectInstalledSourceToSuccessor028(source);
    const browser = await render(source);
    expect(browser.sourceGraph).toEqual(before.graph);
    const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'strict' });
    expect(checked.report).toMatchObject({ claimStatus: 'conformant', unverifiedObligations: [],
      ruleset: { profileId: profile, scope: 'coral-bounded-profile' } });
    expect(checked.document.header.source).toBe(source);
  });

  it.each(getAvailableNotations028().map((item) => item.id))(
    '%s preserves a relation-omitted connector and reports its approved bounded checks',
    async (profile) => {
      const type = profile === 'uml-sequence' ? 'participant' : 'group';
      const source = `@diagram ${profile}\nprobe ${type}\npeer ${type}\nlink = probe -> peer\n`;
      const parsed = parseInstalledDocument028(source);
      expect(parsed.header.diagnostics).toEqual([]);
      expect(parsed.syntax.diagnostics).toEqual([]);
      const successor = projectInstalledSourceToSuccessor028(source);
      expect(successor.diagnostics).toEqual([]);
      expect(successor.graph?.profile).toEqual(parsed.header.header?.profile);
      expect(successor.graph?.edges).toMatchObject([{ id: 'link',
        first: { node: 'probe' }, second: { node: 'peer' }, direction: 'first-to-second' }]);
      const interpreted = resolveSuccessorGraphNodes028(successor.graph!);
      expect(interpreted.get('probe')?.status).toBe(profile === 'uml-sequence' ? 'resolved' : 'generic');
      expect(interpreted.get('probe')?.diagnostics).toEqual([]);
      expect(interpreted.get('peer')?.diagnostics).toEqual([]);
      const checked = checkInstalledSuccessorSourceConformance028(source,
        { requestedLevel: 'strict', notificationLevel: 'debug' });
      expect(checked.diagnostics).toEqual([]);
      expect(checked.report?.findings.filter((finding) => finding.category !== 'notation')).toEqual([]);
      expect(checked.report?.ruleset?.profileId).toBe(profile);
      expect(checked.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
      expect(checked.report?.claimStatus).toBe(profile === 'bpmn' ? 'failed' : 'conformant');
      const browser = await render(source);
      expect(browser.svg).toContain('<svg');
      expect(browser.sourceGraph).toEqual(successor.graph);
    },
  );

  it.each(cases)('%s keeps one meaning through parse and browser render',
    async (profile, filename) => {
      const source = fixture(filename);
      const parsed = parseInstalledDocument028(source);
      expect(parsed.header.header?.diagramType).toBe(profile);
      expect(parsed.header.diagnostics).toEqual([]);
      expect(parsed.syntax.diagnostics).toEqual([]);
      const successor = projectInstalledSourceToSuccessor028(source);
      expect(successor.diagnostics).toEqual([]);
      expect(successor.graph?.profile).toEqual(parsed.header.header?.profile);
      const browser = await render(source);
      expect(browser.sourceGraph).toEqual(successor.graph);
      expect(browser.svg).toContain('<svg');
    });

  it.each([
    ['flowchart-branch.coral', 5, 5, ['check', 'accept'], ['check', 'reject']],
    ['flowchart-cycle.coral', 4, 4, ['work', 'choice'], ['choice', 'work']],
  ] as const)('%s retains its distinct source topology in browser render',
    async (filename, nodes, edges, firstPair, secondPair) => {
      const source = fixture(filename);
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const browser = await render(source);
      expect(browser.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      expect(browser.sourceGraph).toEqual(projected.graph);
      expect(browser.sourceGraph?.nodes).toHaveLength(nodes);
      expect(browser.sourceGraph?.edges).toHaveLength(edges);
      const pairs = browser.sourceGraph!.edges.map((edge) => [edge.first.node, edge.second.node]);
      expect(pairs).toContainEqual([...firstPair]);
      expect(pairs).toContainEqual([...secondPair]);
      expect(browser.sourceGraph!.edges.every((edge) => edge.direction === 'first-to-second')).toBe(true);
      expect(browser.svg).toContain('data-coral-part-id=');
    });

  it.each([
    ['block-branch.coral', 3, 2, ['hub', 'leftUnit', 'left', 'receive'],
      ['hub', 'rightUnit', 'right', 'receive']],
    ['block-cycle.coral', 3, 3, ['producer', 'processor', 'send', 'receive'],
      ['sink', 'producer', 'send', 'receive']],
  ] as const)('%s retains authored port identities and topology in browser render',
    async (filename, nodes, edges, first, second) => {
      const source = fixture(filename);
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const browser = await render(source);
      expect(browser.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      expect(browser.sourceGraph).toEqual(projected.graph);
      expect(browser.sourceGraph?.nodes).toHaveLength(nodes);
      expect(browser.sourceGraph?.edges).toHaveLength(edges);
      const links = browser.sourceGraph!.edges.map((edge) => [edge.first.node,
        edge.second.node, edge.first.port, edge.second.port]);
      expect(links).toContainEqual([...first]);
      expect(links).toContainEqual([...second]);
      expect(browser.sourceGraph!.edges.every((edge) => edge.direction === 'first-to-second'))
        .toBe(true);
      expect(browser.svg).toContain('data-coral-part-id=');
    });

  it.each(['lowfi', 'hifi'] as const)(
    'keeps the %s block branch label clear of the source outline', async (style) => {
      const svg = (await render(fixture('block-branch.coral'), { style })).svg;
      const document = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
      const label = document.querySelector('[data-coral-part-id="edge-1:label"]')!;
      const outline = document.querySelector('[data-coral-part-id="hub:outline"]')!;
      const transform = outline.parentElement!.getAttribute('transform')!;
      const match = /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/.exec(transform)!;
      const source = { left: Number(match[1]), top: Number(match[2]),
        right: Number(match[1]) + 100 * Number(match[3]),
        bottom: Number(match[2]) + 60 * Number(match[3]) };
      const x = Number(label.getAttribute('x'));
      const y = Number(label.getAttribute('y'));
      const size = Number(label.getAttribute('font-size'));
      const width = label.textContent!.length * size * 0.55;
      const horizontalOverlap = x + width / 2 > source.left && x - width / 2 < source.right;
      expect(!horizontalOverlap || y + 3 <= source.top || y - size >= source.bottom + 3)
        .toBe(true);
    });

  it.each([
    ['uml-class-chain.coral', 3, 2, ['Leaf', 'Middle'], ['Middle', 'Root']],
    ['uml-class-fork.coral', 4, 3, ['Order', 'Document'], ['Invoice', 'Document']],
  ] as const)('%s retains inheritance ends and source topology',
    async (filename, nodes, edges, first, second) => {
      const source = fixture(filename);
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const browser = await render(source);
      expect(browser.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      expect(browser.sourceGraph).toEqual(projected.graph);
      expect(browser.sourceGraph?.nodes).toHaveLength(nodes);
      expect(browser.sourceGraph?.edges).toHaveLength(edges);
      const pairs = browser.sourceGraph!.edges.map((edge) => [edge.first.node, edge.second.node]);
      expect(pairs).toContainEqual([...first]);
      expect(pairs).toContainEqual([...second]);
      expect(browser.sourceGraph!.edges.every((edge) => edge.type === 'inheritance' &&
        edge.secondEnd?.marker?.kind === 'triangle' && edge.secondEnd.marker.fill === 'open'))
        .toBe(true);
      for (const edge of browser.sourceGraph!.edges)
        expect(browser.svg).toContain(`data-coral-part-id="${edge.id}:target-marker"`);
    });

  it('keeps the affected classifier in an open-triangle capacity refusal', async () => {
    const source = fixture('uml-class-crowded.coral');
    await expect(render(source)).rejects.toMatchObject({
      code: 'coral.browser.render.failed',
      diagnostics: [expect.objectContaining({
        code: 'layout.capability.unsupported',
        subject: { kind: 'node', id: 'Document' },
      })],
    });
  });

  it('keeps cycle labels clear of the rendered connector shafts', async () => {
    const svg = (await render(fixture('flowchart-cycle.coral'), { style: 'hifi' })).svg;
    const document = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
    const segments = [...document.querySelectorAll('[data-coral-part-id$=":shaft"]')]
      .flatMap((shaft) => {
        const points = [...(shaft.getAttribute('d') ?? '').matchAll(
          /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,
        )].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
        return points.slice(1).map((point, index) => [points[index]!, point] as const);
      });
    for (const id of ['edge-3:label', 'edge-4:label']) {
      const label = document.querySelector(`[data-coral-part-id="${id}"]`)!;
      const x = Number(label.getAttribute('x'));
      const y = Number(label.getAttribute('y'));
      const size = Number(label.getAttribute('font-size'));
      const width = label.textContent!.length * size * 0.55;
      const bounds = { left: x - width / 2, right: x + width / 2,
        top: y - size, bottom: y };
      const crosses = segments.some(([start, end]) => Array.from({ length: 101 }, (_, index) => {
        const t = index / 100;
        return { x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t };
      }).some((point) => point.x > bounds.left && point.x < bounds.right &&
        point.y > bounds.top && point.y < bounds.bottom));
      expect(crosses, id).toBe(false);
    }
  });

  it('keeps nested alternative order and authored operand IDs through browser render', async () => {
    const source = fixture('uml-sequence-nested.coral');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const browser = await render(source);
    expect(browser.sourceGraph).toEqual(projected.graph);
    expect(browser.sourceGraph?.interaction?.items).toEqual([
      { kind: 'message', id: 'before' }, { kind: 'fragment', id: 'choice' },
      { kind: 'message', id: 'after' },
    ]);
    expect(browser.sourceGraph?.interaction?.fragments?.map((fragment) => [
      fragment.id, fragment.operands.map((operand) => operand.id),
    ])).toEqual([
      ['choice', ['choice-operand-1', 'choice-operand-2']],
      ['retry', ['retry-operand-1', 'retry-operand-2']],
    ]);
    for (const id of ['choice', 'retry']) {
      expect(browser.svg).toContain(`data-coral-sequence-fragment="${id}"`);
      for (const index of [1, 2]) {
        expect(browser.svg).toContain(`data-coral-sequence-operand="${id}-operand-${index}"`);
      }
    }
  });

  it('keeps a three-participant self-message and reply order through browser render', async () => {
    const source = fixture('uml-sequence-loop.coral');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const browser = await render(source);
    expect(browser.sourceGraph).toEqual(projected.graph);
    expect(browser.sourceGraph?.interaction?.participants?.map((item) => item.id))
      .toEqual(['client', 'server', 'cache']);
    expect(browser.sourceGraph?.interaction?.items).toEqual([
      'request', 'retry', 'lookup', 'hit', 'reply',
    ].map((id) => ({ kind: 'message', id })));
    expect(browser.sourceGraph?.interaction?.messages?.find((item) => item.id === 'retry'))
      .toMatchObject({ senderParticipantId: 'server', receiverParticipantId: 'server' });
    expect(browser.sourceGraph?.interaction?.messages?.find((item) => item.id === 'reply'))
      .toMatchObject({ senderParticipantId: 'server', receiverParticipantId: 'client', kind: 'return' });
    expect(browser.svg).toContain('data-coral-sequence-message="retry"');
    expect(browser.svg).toContain('server to server');
  });

  it.each([
    { fixtureName: 'bpmn-branch.coral',
      nodes: ['received', 'check', 'approved', 'fulfill', 'revise', 'completed'],
      types: ['startEvent', 'task', 'exclusiveGateway', 'task', 'task', 'endEvent'],
      ends: [['received', 'check'], ['check', 'approved'],
        ['approved', 'fulfill'], ['approved', 'revise'], ['fulfill', 'completed']] },
    { fixtureName: 'bpmn-loop.coral',
      nodes: ['received', 'check', 'approved', 'revise', 'completed'],
      types: ['startEvent', 'task', 'exclusiveGateway', 'task', 'endEvent'],
      ends: [['received', 'check'], ['check', 'approved'],
        ['approved', 'revise'], ['revise', 'check'], ['approved', 'completed']] },
  ])('keeps authored BPMN event, task, gateway and flow topology for $fixtureName',
    async ({ fixtureName, nodes, types, ends }) => {
      const source = fixture(fixtureName);
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const browser = await render(source);
      expect(browser.sourceGraph).toEqual(projected.graph);
      expect(browser.sourceGraph?.nodes.map((node) => node.id)).toEqual(nodes);
      expect(browser.sourceGraph?.nodes.map((node) => node.type)).toEqual(types);
      expect(browser.sourceGraph?.edges.map((edge) =>
        [edge.first.node, edge.second.node])).toEqual(ends);
      expect(browser.sourceGraph?.edges.every((edge) =>
        edge.direction === 'first-to-second')).toBe(true);
      for (const id of nodes) expect(browser.svg).toContain(`data-coral-node="${id}"`);
    });

  it.each(cases)('%s keeps full findings separate from notice filtering at all three levels',
    (_profile, filename) => {
      const source = fixture(filename);
      const reports = (['none', 'typical', 'strict'] as const).map((requestedLevel) => {
        const quiet = checkInstalledSuccessorSourceConformance028(source,
          { requestedLevel, notificationLevel: 'error' });
        const full = checkInstalledSuccessorSourceConformance028(source,
          { requestedLevel, notificationLevel: 'debug' });
        expect(quiet.diagnostics).toEqual([]);
        expect(full.diagnostics).toEqual([]);
        expect(quiet.report?.evaluatedLevel).toBe(requestedLevel);
        expect(quiet.report?.findings).toEqual(full.report?.findings);
        expect(quiet.report?.notices).toEqual(quiet.report?.findings.filter(
          (finding) => finding.severity === 'error'));
        expect(full.report?.notices).toEqual(full.report?.findings);
        return full.report!;
      });
      expect(reports[0].findings.every((finding) => finding.category !== 'notation')).toBe(true);
      const strictNotation = new Set(reports[2].findings.filter((finding) =>
        finding.category === 'notation').map((finding) => finding.id));
      expect(reports[1].findings.filter((finding) => finding.category === 'notation')
        .every((finding) => strictNotation.has(finding.id))).toBe(true);
      expect(parseInstalledDocument028(source).header.header?.conformanceLevel).toBe('typical');
    });

  it.each([['architecture-ports.coral', 'api', 'audit'],
    ['block-ports.coral', 'producer', 'telemetry']] as const)(
    '%s rebinds an authored side port across RIGHT and DOWN without changing source',
    (filename, nodeId, portId) => {
      const source = fixture(filename);
      const graph = projectInstalledSourceToSuccessor028(source).graph!;
      const node = resolveSuccessorGraphNodes028(graph).get(nodeId)!;
      const symbol = symbolRegistry.get(node.effectiveSymbolId!)!;
      const right = semanticLayoutPorts028(node, symbol, node.effectiveVariantId, 'RIGHT');
      const down = semanticLayoutPorts028(node, symbol, node.effectiveVariantId, 'DOWN');
      expect(right.ports.find((port) => port.id === portId)?.side).toBe('EAST');
      expect(down.ports.find((port) => port.id === portId)?.side).toBe('SOUTH');
      expect(projectInstalledSourceToSuccessor028(source).graph).toEqual(graph);
    });

  it.each([
    ['flowchart', 'process', 'process', 'in', 'flow'],
    ['bpmn', 'task', 'task', 'in', 'sequenceFlow'],
    ['uml-class', 'class', 'class', 'north', 'association'],
  ] as const)('%s keeps authored and inherited semantic ports in one source-owned meaning',
    async (profile, firstType, secondType, inheritedPort, relation) => {
      const source = `@diagram ${profile}\nfirst ${firstType} {\n` +
        '  audit port [direction: out, anchor: side]\n}\n' +
        `second ${secondType}\nlink = first:audit -> second:${inheritedPort} [${relation}]\n`;
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const graph = projected.graph!;
      expect(graph.nodes[0]?.semanticPorts).toEqual([{
        id: 'audit', direction: 'out', anchor: { kind: 'side' },
      }]);
      expect(graph.edges[0]).toMatchObject({
        first: { node: 'first', port: 'audit' },
        second: { node: 'second', port: inheritedPort },
      });
      const interpreted = resolveSuccessorGraphNodes028(graph);
      expect(interpreted.get('first')?.semanticPorts).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'audit', origin: 'authored', direction: 'out' }),
      ]));
      expect(interpreted.get('second')?.semanticPorts).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: inheritedPort, origin: 'catalog' }),
      ]));
      const first = interpreted.get('first')!;
      const firstSymbol = symbolRegistry.get(first.effectiveSymbolId!)!;
      expect(semanticLayoutPorts028(first, firstSymbol, first.effectiveVariantId, 'RIGHT')
        .ports.find((port) => port.id === 'audit')?.side).toBe('EAST');
      expect(semanticLayoutPorts028(first, firstSymbol, first.effectiveVariantId, 'DOWN')
        .ports.find((port) => port.id === 'audit')?.side).toBe('SOUTH');
      const browser = await render(source);
      expect(browser.sourceGraph).toEqual(graph);
      expect(browser.graph.edges[0]).toMatchObject({
        source: 'first', sourcePort: 'audit', target: 'second', targetPort: inheritedPort,
      });
      expect(browser.graph.nodes.every((node) => node.ports === undefined)).toBe(true);
      expect(browser.svg).toContain('<svg');
      expect(checkInstalledSuccessorSourceConformance028(source,
        { requestedLevel: 'strict', notificationLevel: 'debug' }).report?.findings
        .map((finding) => finding.id)).not.toContain('coral.port.reference.missing');
    });

  it.each([
    ['flowchart', 'process', 'in'],
    ['bpmn', 'task', 'in'],
    ['uml-class', 'class', 'north'],
  ] as const)('%s rejects an authored port that collides with its installed symbol',
    async (profile, type, inheritedPort) => {
      const source = `@diagram ${profile}\nfirst ${type} {\n` +
        `  ${inheritedPort} port [direction: out]\n}\n`;
      const graph = projectInstalledSourceToSuccessor028(source).graph!;
      expect(graph.nodes[0]?.semanticPorts?.[0]?.id).toBe(inheritedPort);
      const interpretation = resolveSuccessorGraphNodes028(graph).get('first')!;
      expect(interpretation.portCollisions).toContain(inheritedPort);
      expect(interpretation.semanticPorts.find((port) => port.id === inheritedPort))
        .toMatchObject({ origin: 'catalog' });
      await expect(render(source)).rejects.toMatchObject({
        diagnostics: expect.arrayContaining([expect.objectContaining({
          code: 'coral.port.duplicate',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: source.indexOf(`${inheritedPort} port`),
          }) }),
        })]),
      });
    });

  it('keeps flowchart and BPMN drafting renderable while strict reports profile findings', async () => {
    const flowchart = fixture('flowchart-draft.coral');
    const bpmn = '@diagram bpmn\nreceived event\nwork task\nreceived -> work\n';
    expect((await render(flowchart)).svg).toContain('<svg');
    expect((await render(bpmn)).svg).toContain('<svg');
    const flowStrict = checkInstalledDocumentConformance028(flowchart,
      { requestedLevel: 'strict', notificationLevel: 'debug' }).report!;
    const bpmnStrict = checkInstalledDocumentConformance028(bpmn,
      { requestedLevel: 'strict', notificationLevel: 'debug' }).report!;
    expect(flowStrict.findings.map((finding) => finding.id))
      .toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
    expect(bpmnStrict.findings.map((finding) => finding.id))
      .toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
    expect(flowchart).not.toContain('@conformanceLevel strict');
    expect(bpmn).not.toContain('@conformanceLevel strict');
  });

  it('renders an unfamiliar BPMN relation as a draft without silently claiming Sequence Flow', async () => {
    const source = '@diagram bpmn\nbegin startEvent\nwork task\n' +
      'begin -> work [reads]\n';
    const browser = await render(source);
    expect(browser.svg).toContain('<svg');
    expect(browser.sourceGraph?.edges[0]?.type).toBe('reads');
    const typical = checkInstalledDocumentConformance028(source).report!;
    expect(typical.findings.map((finding) => finding.id))
      .not.toContain('BPMN.CONNECTOR.RELATION_UNREGISTERED');
    const strict = checkInstalledDocumentConformance028(source,
      { requestedLevel: 'strict' }).report!;
    expect(strict.findings.map((finding) => finding.id))
      .toContain('BPMN.CONNECTOR.RELATION_UNREGISTERED');
  });

  it('separates saved conformance level, explicit check level, and notice filtering', () => {
    const source = '@diagram flowchart\n@conformanceLevel typical\n' +
      'api process [symbol: "arch-service"]\n';
    const none = checkInstalledDocumentConformance028(source,
      { requestedLevel: 'none', notificationLevel: 'debug' }).report!;
    const typical = checkInstalledDocumentConformance028(source).report!;
    const strict = checkInstalledDocumentConformance028(source,
      { requestedLevel: 'strict' }).report!;
    expect(none.findings.some((finding) => finding.id === 'CORAL.SYMBOL.OUT_OF_PROFILE')).toBe(false);
    expect(typical.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning',
    }));
    expect(typical.notices.some((finding) => finding.id === 'CORAL.SYMBOL.OUT_OF_PROFILE')).toBe(false);
    expect(strict.notices).toContainEqual(expect.objectContaining({
      id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'error',
    }));
    expect(parseInstalledDocument028(source).header.header?.conformanceLevel).toBe('typical');
  });

  it('retains uncommon connector and named UML meaning as typed fields', () => {
    const architecture = projectInstalledSourceToSuccessor028('@diagram architecture\n' +
      'customer service\norder service\norders = customer -- order ' +
      '[type: relationship, firstEnd: one, secondEnd: zeroOrMany]\n').graph!;
    expect(architecture.edges[0]).toMatchObject({ id: 'orders', type: 'relationship',
      direction: 'none', firstEnd: { marker: { kind: 'one' } },
      secondEnd: { marker: { kind: 'zero-or-many' } } });
    const sequence = projectInstalledSourceToSuccessor028(fixture('uml-sequence-flat.coral')).graph!;
    expect(sequence.interaction?.items).toEqual([
      { kind: 'message', id: 'call' }, { kind: 'message', id: 'reply' },
    ]);
    expect(sequence.interaction?.messages.map((message) => message.kind))
      .toEqual(['synchronous', 'return']);
    const classifier = projectInstalledSourceToSuccessor028(fixture('uml-class-named.coral')).graph!;
    expect(classifier.nodes[0]?.classifier?.compartments[1]?.id).toBe('fields');
    expect(classifier.edges[0]).toMatchObject({ id: 'inheritance', type: 'inheritance',
      first: { node: 'Order' }, second: { node: 'Base' },
      direction: 'none', secondEnd: { marker: { kind: 'triangle', fill: 'open' } } });
    expect(checkInstalledSuccessorSourceConformance028(fixture('uml-class-named.coral'),
      { requestedLevel: 'strict' }).report?.findings.map((finding) => finding.id))
      .not.toContain('CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE');
  });

  it('renders an added keyed first-end mark without replacing the shortform arrow', async () => {
    const source = '@diagram architecture\na service\nz service\n' +
      'a -> z [firstEnd: diamond]\n';
    const browser = await render(source);
    expect(browser.svg).toContain('<svg');
    expect(browser.sourceGraph?.edges[0]).toMatchObject({
      direction: 'first-to-second',
      firstEnd: { marker: { kind: 'diamond', fill: 'open' } },
      secondEnd: { marker: { kind: 'arrow', fill: 'open' } },
    });
    const conflicting = source.replace('firstEnd', 'secondEnd');
    await expect(render(conflicting)).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'coral.syntax.connector.end-conflict',
      })]),
    });
  });

  it('renders registered rare end marks while retaining the authored A-to-Z direction', async () => {
    const source = '@diagram architecture\na service\nz service\n' +
      'a -> z [firstEnd: zeroOrOne, secondEnd: zeroOrMany]\n';
    const browser = await render(source);
    expect(browser.svg).toContain('<svg');
    expect(browser.sourceGraph?.edges[0]).toMatchObject({
      first: { node: 'a' }, second: { node: 'z' }, direction: 'first-to-second',
      firstEnd: { marker: { kind: 'zero-or-one' } },
      secondEnd: { marker: { kind: 'zero-or-many' } },
    });
    expect(checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' })
      .report?.unverifiedObligations).toContainEqual(expect.objectContaining({
        id: 'CORAL.DIRECTION.DISPLAY_UNVERIFIED',
      }));
  });

  it('renders a rare keyed end on -- without inventing a semantic direction', async () => {
    const source = '@diagram architecture\na service\nz service\n' +
      'a -- z [secondEnd: zeroOrOne]\n';
    const browser = await render(source);
    expect(browser.svg).toContain('<svg');
    expect(browser.sourceGraph?.edges[0]).toMatchObject({
      first: { node: 'a' }, second: { node: 'z' }, direction: 'none',
      firstEnd: { marker: { kind: 'none' } },
      secondEnd: { marker: { kind: 'zero-or-one' } },
    });
  });

  it('keeps operator direction when a keyed arrow adds a visible first-end arrow', async () => {
    const source = '@diagram architecture\na service\nz service\n' +
      'a -> z [firstEnd: arrow]\n';
    const browser = await render(source);
    expect(browser.svg).toContain('<svg');
    expect(browser.sourceGraph?.edges[0]).toMatchObject({
      first: { node: 'a' }, second: { node: 'z' }, direction: 'first-to-second',
      firstEnd: { marker: { kind: 'arrow' } },
      secondEnd: { marker: { kind: 'arrow' } },
    });
    expect(checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' })
      .report?.unverifiedObligations).toContainEqual(expect.objectContaining({
        id: 'CORAL.DIRECTION.DISPLAY_UNVERIFIED',
      }));
  });

  it('does not replace an authored UML inheritance arrow with the profile triangle', async () => {
    const source = '@diagram uml-class\nChild class\nBase class\n' +
      'Child -> Base [inheritance]\n';
    const browser = await render(source);
    expect(browser.svg).toContain('<svg');
    expect(browser.graph.edges[0]?.targetEnd?.marker).toEqual({ kind: 'arrow', fill: 'open' });
    expect(browser.sourceGraph?.edges[0]?.secondEnd?.marker).toEqual({ kind: 'arrow', fill: 'open' });
    expect(checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' })
      .report?.findings.map((finding) => finding.id))
      .toContain('CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE');
  });

  it.each([
    ['unknown reference', (source: string) => source.replace('api:audit', 'api:missing'),
      'coral.port.reference.missing', 'missing'],
    ['catalog collision', (source: string) => source.replace('audit port', 'out port'),
      'coral.port.duplicate', 'out port'],
  ] as const)('locates %s before publishing a diagram', async (_case, change, code, token) => {
    const source = change(fixture('architecture-ports.coral'));
    try {
      await render(source);
      throw new Error('Invalid authored port unexpectedly rendered');
    } catch (error) {
      expect(error).toBeInstanceOf(CoralRenderError);
      if (!(error instanceof CoralRenderError)) return;
      expect(error.diagnostics).toContainEqual(expect.objectContaining({
        code,
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf(token),
        }) }),
      }));
    }
  });

  it('keeps a stale exception visible without retargeting an authored symbol', async () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\n' +
      'api process [symbol: "arch-database", conformanceException: "arch-service"]\n';
    const checked = checkInstalledDocumentConformance028(source);
    expect(checked.report?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'CORAL.CONFORMANCE.EXCEPTION.INVALID', severity: 'error',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.lastIndexOf('"arch-service"'),
        }) }) }),
      expect.objectContaining({ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'error' }),
    ]));
    expect((await render(source)).sourceGraph?.nodes[0]?.symbol).toBe('arch-database');
  });

  it('reports source integrity before publishing a recursive sequence scene', async () => {
    const source = '@diagram uml-sequence\nclient participant [symbol: "missing-symbol"]\n' +
      'server participant\nchoice = alt "yes" {\n  retry = alt "again" {\n' +
      '    client -> server:missing\n  } else "stop" {\n    server -> client\n  }\n' +
      '} else "no" {\n  server -> client\n}\n';
    await expect(render(source)).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'coral.symbol.unknown',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: source.indexOf('"missing-symbol"'),
          }) }) }),
        expect.objectContaining({ code: 'coral.port.reference.missing',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: source.indexOf('server:missing') + 'server:'.length,
          }) }) }),
      ]),
    });
  });

  it('reports independent symbol and port faults before publishing a flat alternative', async () => {
    const source = '@diagram uml-sequence\nclient participant [symbol: "missing-symbol"]\n' +
      'server participant\nchoice = alt "yes" {\n  client -> server:missing\n' +
      '} else "no" {\n  server -> client\n}\n';
    await expect(render(source)).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'coral.symbol.unknown',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: source.indexOf('"missing-symbol"'),
          }) }) }),
        expect.objectContaining({ code: 'coral.port.reference.missing',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: source.indexOf('server:missing') + 'server:'.length,
          }) }) }),
      ]),
    });
  });

  it('reports an unsupported sequence participant port at its authored declaration', async () => {
    const source = fixture('uml-sequence-flat.coral').replace('client participant',
      'client participant {\n  send port [direction: out]\n}');
    try {
      await render(source);
      throw new Error('Unsupported sequence port unexpectedly rendered');
    } catch (error) {
      expect(error).toBeInstanceOf(CoralRenderError);
      if (!(error instanceof CoralRenderError)) return;
      expect(error.diagnostics).toContainEqual(expect.objectContaining({
        code: 'render.capability.sequence-semantic-port',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('send port'),
        }) }),
      }));
    }
  });

  it('renders accepted destruction with a receiver end-of-life marker', async () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'client -> server [destroy] as "stop"';
    const result = await render(source);
    expect(result.svg.includes('data-coral-destruction="server"')).toBe(true);
    expect(result.svg.includes('destruction')).toBe(true);
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.sourceGraph?.interaction?.participants).toContainEqual({
      id: 'server', nodeId: 'server', destroyedByMessageId: 'edge-1',
    });
  });
});
