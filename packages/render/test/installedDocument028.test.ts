import { describe, expect, it } from 'vitest';
import {
  checkInstalledDocumentConformance028, parseInstalledDocument028,
  prepareInstalledDocumentForSave028, installedWrittenPortReferenceRanges028,
} from '../src/index.js';
import { getAvailableNotations028, notationCatalogIdentity028, notationRegistry } from '../src/notations/index.js';

describe('staged installed 0.2.8 source reader', () => {
  it('saves unknown and not-yet-portable styles as exact text while withholding semantic output', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'a -> b [style: mintGreen] // keep this\n';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.style.term.unknown', severity: 'warning' }),
      expect.objectContaining({ code: 'coral.style.capability.unavailable', severity: 'error' }),
    ]));
    expect(parsed.graph).toBeUndefined();
    const saved = prepareInstalledDocumentForSave028(source, parsed);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    expect(parseInstalledDocument028(saved.source).header.source).toBe(saved.source);
  });
  it('keeps authored grouped references on save and reopen while retaining qualified meaning', () => {
    const source = '@diagram architecture\nleft group {\n  item service as "Left"\n' +
      '  sink service as "Sink"\n  item -> sink\n}\n' +
      'right group {\n  item service as "Right"\n}\nleft.item -> right.item\n';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.source).toBe(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    const saved = prepareInstalledDocumentForSave028(source, parsed);
    expect(saved.source.replace('@coralVersion "0.2.8"\n', '')).toBe(source);
    const reopened = parseInstalledDocument028(saved.source);
    expect(reopened.syntax.diagnostics).toEqual([]);
    expect(reopened.graph?.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['left.item', 'left.sink'], ['left.item', 'right.item'],
    ]);
  });
  it.each(getAvailableNotations028().map((notation) => notation.id))(
    'resolves %s from source against the installed catalog without caller-supplied defaults', (diagramType) => {
      const body = diagramType === 'uml-sequence' ? 'example participant' : 'example group';
      const source = `@diagram ${diagramType}\n${body}\n`;
      const parsed = parseInstalledDocument028(source);
      expect(parsed.header.diagnostics).toEqual([]);
      expect(parsed.syntax.diagnostics).toEqual([]);
      expect(parsed.header.header).toMatchObject({ diagramType,
        effectiveCoralVersion: '0.2.8', conformanceLevel: 'typical',
        catalog: notationCatalogIdentity028(diagramType),
        explicit: { coralVersion: false, profileVersion: false,
          catalogVersion: false, conformanceLevel: false },
      });
      expect(parsed.graph?.metadata?.notation).toBe(diagramType);
      const saved = prepareInstalledDocumentForSave028(source, parsed);
      expect(saved.source).toBe(`@diagram ${diagramType}\n@coralVersion "0.2.8"\n${body}\n`);
      expect(parseInstalledDocument028(saved.source).header.header?.catalog)
        .toEqual(notationCatalogIdentity028(diagramType));
    });

  it('does not infer a diagram type or accept an unavailable one', () => {
    for (const source of ['example group\n', '@diagram not-installed\nexample group\n']) {
      const parsed = parseInstalledDocument028(source);
      expect(parsed.header.diagnostics.length).toBeGreaterThan(0);
      expect(parsed.graph).toBeUndefined();
      expect(() => prepareInstalledDocumentForSave028(source, parsed)).toThrow();
    }
  });

  it('does not compile disabled Chen ERD source while retaining authored text', () => {
    const source = '@diagram erd\ncustomer entity\nid attribute\n';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.source).toBe(source);
    expect(parsed.header.diagnostics.map((item) => item.code)).toContain('header.diagram.disabled');
    expect(parsed.syntax.statements.map((item) => item.kind)).toEqual(['node', 'node']);
    expect(parsed.graph).toBeUndefined();
    expect(getAvailableNotations028().map((item) => item.id)).not.toContain('erd');
    expect(notationRegistry.get('erd')).toBeDefined(); // historical/research catalog remains installed
  });

  it('preserves malformed edge source and carries full duplicate spans through the installed reader', () => {
    const source = '@diagram architecture\nA service\nB service\n' +
      'A -> B [label: "🌊"] as "No"\n';
    const parsed = parseInstalledDocument028(source);
    const duplicate = parsed.syntax.diagnostics.find((item) => item.code === 'coral.syntax.label.duplicate');
    expect(parsed.header.source).toBe(source);
    expect(parsed.graph).toBeUndefined();
    expect(duplicate).toMatchObject({ message: 'Duplicate edge label', severity: 'error' });
    expect(duplicate?.range).toMatchObject({
      start: { offset: source.indexOf('as "No"') },
      end: { offset: source.indexOf('as "No"') + 'as "No"'.length },
    });
    expect(duplicate?.related?.[0]).toMatchObject({ message: 'First assignment',
      range: {
        start: { offset: source.indexOf('label: "🌊"') },
        end: { offset: source.indexOf('label: "🌊"') + 'label: "🌊"'.length },
      },
    });
  });

  it.each([
    ['@diagram flowchart [flow]\na process\n', 'header.attribute.colon-required'],
    ['@diagram flowchart [mode: compact]\na process\n', 'header.attribute.unsupported'],
  ] as const)('reserves header brackets for keyed fields in %s', (source, code) => {
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.diagnostics.map((item) => item.code)).toContain(code);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph).toBeUndefined();
  });

  it('checks the saved level from source and applies a one-off level without changing source', () => {
    const source = '@diagram bpmn\n@conformanceLevel typical\nreceived event\n';
    const ordinary = checkInstalledDocumentConformance028(source);
    expect(ordinary.document.header.diagnostics).toEqual([]);
    expect(ordinary.report).toMatchObject({ evaluatedLevel: 'typical', findings: [],
      claimStatus: 'not-claimed' });
    const oneOff = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(oneOff.report?.findings.map((item) => item.id))
      .toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
    expect(oneOff.report).toMatchObject({ evaluatedLevel: 'strict', claimStatus: 'failed' });
    expect(oneOff.document.header.source).toBe(source);
    expect(oneOff.document.header.header?.conformanceLevel).toBe('typical');

    const strictSource = source.replace('typical', 'strict');
    expect(checkInstalledDocumentConformance028(strictSource).report?.findings.map((item) => item.id))
      .toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
  });

  it('locates a strict node-rule finding at the authored kind token', () => {
    const source = '// 🪸\r\n@diagram bpmn\r\n@conformanceLevel strict\r\nreceived event\r\n';
    const checked = checkInstalledDocumentConformance028(source);
    const finding = checked.report?.findings.find((item) => item.id === 'BPMN.EVENT.CONCRETE_KIND_REQUIRED');
    expect(finding?.range).toEqual({
      start: { line: 4, column: 9, offset: source.indexOf('event') },
      end: { line: 4, column: 14, offset: source.indexOf('event') + 'event'.length },
    });
    expect(checked.report?.notices.find((item) => item.id === finding?.id)).toBe(finding);
    expect(checked.document.header.source).toBe(source);
  });

  it('locates explicit symbol and variant findings at their own authored values', () => {
    const foreign = '@diagram flowchart\n@conformanceLevel strict\napi process [symbol: "arch-service"]';
    const foreignCheck = checkInstalledDocumentConformance028(foreign);
    expect(foreignCheck.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: foreign.indexOf('"arch-service"'),
      }) }),
    }));
    const unknown = '@diagram architecture\napi service [symbol: "missing-symbol", variant: "missing-variant"]';
    const unknownCheck = checkInstalledDocumentConformance028(unknown);
    expect(unknownCheck.report?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'coral.symbol.unknown',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: unknown.indexOf('"missing-symbol"'),
        }) }) }),
      expect.objectContaining({ id: 'coral.variant.unknown',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: unknown.indexOf('"missing-variant"'),
        }) }) }),
    ]));
    expect(unknownCheck.document.graph?.nodes[0]).toMatchObject({
      symbol: 'missing-symbol', variant: 'missing-variant',
    });
  });

  it('locates a named-edge type conflict while notice filtering leaves the full finding intact', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'load = client -#> server [type: async] as "load()"\n';
    const ordinary = checkInstalledDocumentConformance028(source);
    const finding = ordinary.report?.findings.find((item) =>
      item.id === 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
    expect(finding).toMatchObject({ severity: 'warning', subject: { kind: 'edge', id: 'load' },
      range: { start: { offset: source.indexOf('async') },
        end: { offset: source.indexOf('async') + 'async'.length } } });
    expect(ordinary.report?.notices).toEqual([]);
    const strict = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(strict.report?.notices[0]).toBe(strict.report?.findings[0]);
    expect(strict.report?.findings[0]?.range).toEqual(finding?.range);
  });

  it('locates an unrecognized explicit sequence type without blocking ordinary drafting', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'read = client -> server [type: reads] as "fetch()"\n';
    const ordinary = checkInstalledDocumentConformance028(source);
    expect(ordinary.document.syntax.diagnostics).toEqual([]);
    expect(ordinary.document.graph?.edges[0]).toMatchObject({ type: 'reads', label: 'fetch()' });
    const finding = ordinary.report?.findings.find((item) =>
      item.id === 'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED');
    expect(finding).toMatchObject({ severity: 'error', subject: { kind: 'edge', id: 'read' },
      range: { start: { offset: source.indexOf('reads') },
        end: { offset: source.indexOf('reads') + 'reads'.length } } });
    expect(ordinary.report?.notices).toContain(finding);
    expect(checkInstalledDocumentConformance028(source, { requestedLevel: 'none' }).report?.findings)
      .not.toContainEqual(expect.objectContaining({ id: 'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED' }));
    expect(prepareInstalledDocumentForSave028(source, ordinary.document).source)
      .toContain('[type: reads]');
  });

  it('locates source-authored shorthand and keyed port failures at their own value tokens', () => {
    const source = '@diagram architecture\napi service\ndb database\n' +
      'read = api:in -> db:missing [reads]\n' +
      'next = api -> db [reads, firstPort: out, secondPort: absent]\n';
    const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(checked.document.syntax.diagnostics).toEqual([]);
    expect(checked.report?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'coral.port.reference.direction',
        path: '/edges/0/sourcePort', range: expect.objectContaining({
          start: expect.objectContaining({ offset: source.indexOf('api:in') + 4 }),
        }) }),
      expect.objectContaining({ id: 'coral.port.reference.missing',
        path: '/edges/0/targetPort', range: expect.objectContaining({
          start: expect.objectContaining({ offset: source.indexOf('db:missing') + 3 }),
        }) }),
      expect.objectContaining({ id: 'coral.port.reference.missing',
        path: '/edges/1/targetPort', range: expect.objectContaining({
          start: expect.objectContaining({ offset: source.indexOf('secondPort: absent') + 'secondPort: '.length }),
        }) }),
    ]));
  });

  it('checks reverse sequence ports against the written endpoint tokens', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'reply = client:reply <- server:send as "done"\n';
    const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(checked.document.syntax.diagnostics).toEqual([]);
    expect(checked.document.graph?.edges[0]).toMatchObject({
      source: 'server', sourcePort: 'send', target: 'client', targetPort: 'reply',
    });
    expect(installedWrittenPortReferenceRanges028(checked.document).get('reply')).toMatchObject({
      firstPort: { start: { offset: source.indexOf('client:reply') + 7 } },
      secondPort: { start: { offset: source.indexOf('server:send') + 7 } },
    });
    expect(checked.report?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'coral.port.reference.missing', path: '/edges/0/sourcePort',
        range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('server:send') + 7 }) }) }),
      expect.objectContaining({ id: 'coral.port.reference.missing', path: '/edges/0/targetPort',
        range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('client:reply') + 7 }) }) }),
    ]));
  });

  it('locates a strict flowchart decision-rule finding without rewriting its source', () => {
    const source = '@diagram flowchart\nstart process\nreview decision\ndone process\n' +
      'start -> review [flow]\nreview -> done [flow]\n';
    const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    const finding = checked.report?.findings.find((item) => item.id === 'CORAL.FLOWCHART.DECISION.ALTERNATIVES');
    expect(finding?.range).toMatchObject({ start: { offset: source.indexOf('decision') },
      end: { offset: source.indexOf('decision') + 'decision'.length } });
    expect(checked.document.header.source).toBe(source);
  });

  it('locates a top-level BPMN event flow violation at the authored kind token', () => {
    const source = '@diagram bpmn\nbegin startEvent\nwork task\ndone endEvent\n' +
      'work -> begin [sequence]\ndone -> work [sequence]\n';
    const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    const start = checked.report?.findings.find((item) =>
      item.id === 'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE');
    const end = checked.report?.findings.find((item) =>
      item.id === 'BPMN.EVENT.TOP_LEVEL.END_OUTGOING_SEQUENCE');
    expect(start?.range).toMatchObject({ start: { offset: source.indexOf('startEvent') },
      end: { offset: source.indexOf('startEvent') + 'startEvent'.length } });
    expect(end?.range).toMatchObject({ start: { offset: source.indexOf('endEvent') },
      end: { offset: source.indexOf('endEvent') + 'endEvent'.length } });
    expect(checked.document.header.source).toBe(source);
  });

  it('keeps an inferred BPMN Sequence Flow in source while strict requires an explicit relation', () => {
    const source = '@diagram bpmn\nbegin startEvent\nwork task\ndone endEvent\n' +
      'begin -> work\nwork -> done\n';
    const ordinary = checkInstalledDocumentConformance028(source);
    expect(ordinary.document.graph?.edges.map((edge) => edge.type)).toEqual([undefined, undefined]);
    expect(ordinary.report?.findings.filter((finding) =>
      finding.id === 'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED')).toEqual([]);
    const strict = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    const missing = strict.report?.findings.filter((finding) =>
      finding.id === 'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED');
    expect(missing).toHaveLength(2);
    expect(missing?.[0]).toMatchObject({ severity: 'error', subject: { kind: 'edge', id: 'edge-1' },
      remediation: expect.stringContaining('[sequence]'),
      range: { start: { offset: source.indexOf('->') } } });
    expect(strict.document.header.source).toBe(source);
    const explicitSource = source.replace('begin -> work', 'begin -> work [sequence]')
      .replace('work -> done', 'work -> done [sequence]');
    const explicit = checkInstalledDocumentConformance028(explicitSource, { requestedLevel: 'strict' });
    expect(explicit.report?.findings.filter((finding) =>
      finding.id === 'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED')).toEqual([]);
  });

  it('locates an explicit BPMN Sequence Flow with an invalid endpoint at its relation token', () => {
    const source = '@diagram bpmn\nbegin startEvent\ndata bpmnDataObject\n' +
      'begin -> data [sequence]\n';
    const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    const invalid = checked.report?.findings.find((finding) =>
      finding.id === 'BPMN.SEQUENCE.FLOW_OBJECT_ENDPOINTS');
    expect(invalid).toMatchObject({ severity: 'error', subject: { kind: 'edge', id: 'edge-1' },
      range: { start: { offset: source.indexOf('sequence') } } });
    expect(checked.document.header.source).toBe(source);
    expect(checked.document.graph?.edges[0]?.type).toBe('sequence');
  });

  it('keeps an unfamiliar BPMN relation draftable but rejects its profile word in strict', () => {
    const source = '@diagram bpmn\nbegin startEvent\nwork task\n' +
      'begin -> work [reads]\n';
    for (const requestedLevel of ['none', 'typical'] as const) {
      const checked = checkInstalledDocumentConformance028(source, { requestedLevel });
      expect(checked.document.graph?.edges[0]?.type).toBe('reads');
      expect(checked.report?.findings.map((finding) => finding.id))
        .not.toContain('BPMN.CONNECTOR.RELATION_UNREGISTERED');
      expect(checked.document.header.source).toBe(source);
    }
    const strict = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(strict.report?.findings).toContainEqual(expect.objectContaining({
      id: 'BPMN.CONNECTOR.RELATION_UNREGISTERED', severity: 'error',
      subject: { kind: 'edge', id: 'edge-1' },
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('reads') }) }),
    }));
    expect(strict.document.header.source).toBe(source);
  });

  it('locates missing top-level BPMN event flows without adding connectors to source', () => {
    const source = '@diagram bpmn\nbegin startEvent\ndone endEvent\n';
    const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    for (const [id, word] of [
      ['BPMN.EVENT.TOP_LEVEL.START_OUTGOING_SEQUENCE_REQUIRED', 'startEvent'],
      ['BPMN.EVENT.TOP_LEVEL.END_INCOMING_SEQUENCE_REQUIRED', 'endEvent'],
    ] as const) {
      expect(checked.report?.findings.find((finding) => finding.id === id)?.range?.start.offset)
        .toBe(source.indexOf(word));
    }
    expect(checked.document.header.source).toBe(source);
  });

  it('maps an unnamed later sequence edge to its own explicit type token', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'client -> server as "enqueue()"\nserver -#> client [async] as "reply()"\n';
    const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    const finding = checked.report?.findings.find((item) =>
      item.id === 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
    expect(finding?.subject).toEqual({ kind: 'edge', id: 'edge-2' });
    expect(finding?.range?.start.offset).toBe(source.indexOf('[async]') + 1);
  });

  it('does not issue a conformance report from an invalid header or body', () => {
    for (const source of ['received event\n',
      '@diagram bpmn [event]\nreceived event\n',
      '@diagram bpmn\nreceived event\nreceived -> missing\n']) {
      const checked = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
      expect(checked.report).toBeUndefined();
      expect(checked.document.header.diagnostics.length + checked.document.syntax.diagnostics.length)
        .toBeGreaterThan(0);
    }
  });
});
