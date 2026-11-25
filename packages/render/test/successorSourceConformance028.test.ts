import { describe, expect, it } from 'vitest';
import { checkInstalledSuccessorSourceConformance028 } from '../src/successorSourceConformance028.js';
import { verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';

describe('saved-header successor source conformance', () => {
  it('withholds a conformance claim when an RGB edge has no verified scene', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'a -> b [style: "#FF0000"]';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict' });
    expect(checked.document.header.source).toBe(source);
    expect(checked.report).toBeUndefined();
    expect(checked.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.edge-rgb',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"#FF0000"'),
      }) }),
    }));
  });
  it('withholds a scene claim for portable weight and motion intent', () => {
    const source = '@diagram architecture\na service\nb service\n' +
      'a -> b [style: "dotted, thick, animated:auto"]';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict' });
    expect(checked.report).toBeUndefined();
    expect(checked.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'render.capability.edge-stroke-weight', 'render.capability.edge-motion',
    ]));
    expect(verifyPortableSuccessorSource028(source)).toMatchObject({
      graph: { edges: [{ style: { lineStyle: 'dotted', strokeWeight: 'thick',
        motion: { kind: 'animated', direction: 'auto' } } }] }, diagnostics: [],
    });
  });
  it('reports a remaining style gap without rejecting a supported sequence note', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'a -> b [style: thick]\nnote "Check" on b';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict' });
    expect(checked.report).toBeUndefined();
    expect(checked.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      'render.capability.edge-stroke-weight',
    ]));
    expect(checked.diagnostics.some((item) => item.code === 'render.capability.sequence-note')).toBe(false);
  });
  it('checks an operand-local activation with a verified source scene', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  work = activation a {\n    a -> b\n  }\n' +
      '} else "no" {\n  b -> a\n}';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict' });
    expect(checked.document.header.source).toBe(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report).toBeDefined();
    expect(verifyPortableSuccessorSource028(source).graph?.interaction?.activations)
      .toEqual([{ id: 'work', participantId: 'a' }]);
  });
  it('checks grouped sequence source without dropping a strict operator conflict', () => {
    const source = '@diagram uml-sequence\n@conformanceLevel strict\n' +
      'client participant\nserver participant\n' +
      'team = participants server, client [label: "Operations"]\n' +
      'call = client -#> server [async]';
    const checked = checkInstalledSuccessorSourceConformance028(source);
    expect(checked.document.header.source).toBe(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.evaluatedLevel).toBe('strict');
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('async'),
      }) }),
    }));
    expect(checked.report?.claimStatus).not.toBe('conformant');
    expect(verifyPortableSuccessorSource028(source).graph?.interaction?.groups).toEqual([
      { id: 'team', label: 'Operations', participantIds: ['server', 'client'] },
    ]);
  });
  it('keeps malformed group membership saveable without a conformance report', () => {
    const source = '@diagram uml-sequence\nclient participant\n' +
      'team = participants client, missing';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict' });
    expect(checked.document.header.source).toBe(source);
    expect(checked.report).toBeUndefined();
    expect(checked.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.group.participant-unresolved',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('missing'),
      }) }),
    }));
  });
  it.each(['typical', 'strict'] as const)('checks portable destruction at %s without an obsolete scene refusal', (level) => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy]';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: level });
    expect(checked.document.header.source).toBe(source);
    expect(checked.report).toBeDefined();
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.claimStatus).not.toBe('conformant');
    expect(checked.report?.findings.some((item) => item.id === 'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED')).toBe(false);
    expect(verifyPortableSuccessorSource028(source).graph?.interaction?.participants)
      .toContainEqual({ id: 'server', nodeId: 'server', destroyedByMessageId: 'close' });
  });
  it('checks known flat-alt message rules while withholding complete sequence conformance', () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  a -#> b [async]\n} else "no" {\n  b -> a\n}';
    const strict = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict', notificationLevel: 'debug' });
    expect(strict.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('async'),
      }) }),
    }));
    expect(strict.report?.claimStatus).not.toBe('conformant');
    expect(strict.report?.unverifiedObligations).toEqual([]);
    expect(strict.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
    expect(strict.diagnostics).toEqual([]);
    const typical = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'typical', notificationLevel: 'debug' });
    expect(typical.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', severity: 'warning',
    }));
    expect(typical.document.header.source).toBe(source);
    expect(verifyPortableSuccessorSource028(source)).toMatchObject({
      graph: { interaction: { fragments: [expect.objectContaining({ id: 'choice' })] } },
      diagnostics: [],
    });
  });
  it.each([
    ['guarded loop', 'retry = loop "more" {\n  a -> b\n}'],
    ['empty alternative', 'choice = alt "yes" {\n} else "no" {\n  a -> b\n}'],
    ['nested empty operand', 'outer = alt "yes" {\n  inner = alt "again" {\n' +
      '  } else "stop" {\n    a -> b\n  }\n' +
      '} else "no" {\n  b -> a\n}'],
  ])('checks %s without an obsolete fragment capability refusal', (_name, body) => {
    const source = `@diagram uml-sequence\na participant\nb participant\n${body}`;
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict', notificationLevel: 'debug' });
    expect(checked.document.header.source).toBe(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report).toBeDefined();
    expect(checked.report?.unverifiedObligations.some((item) =>
      item.id === 'CORAL.SEQUENCE.FRAGMENT_SCENE.UNVERIFIED')).toBe(false);
    expect(checked.report?.claimStatus).toBe('conformant');
    expect(checked.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
    expect(verifyPortableSuccessorSource028(source).graph?.interaction?.fragments?.length)
      .toBeGreaterThan(0);
  });
  it('does not hide participant-port and catalog faults in a renderable recursive scene', () => {
    const source = '@diagram uml-sequence\n' +
      'a participant {\n  out port [direction: out]\n}\n' +
      'b participant [symbol: "missing-symbol"]\nchoice = alt "yes" {\n' +
      '  retry = alt "again" {\n    a:missing -> b\n  } else "stop" {\n    b -> a\n  }\n' +
      '} else "no" {\n  b -> a\n}';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict', notificationLevel: 'debug' });
    expect(checked.report).toBeUndefined();
    expect(checked.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'render.capability.sequence-semantic-port',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('out port'),
        }) }) }),
      expect.objectContaining({ code: 'coral.symbol.unknown',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('"missing-symbol"'),
        }) }) }),
      expect.objectContaining({ code: 'coral.port.reference.missing',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('a:missing') + 2,
        }) }) }),
    ]));
    expect(checked.diagnostics.map((item) => item.code))
      .not.toContain('render.capability.sequence-fragment');
    expect(checked.document.header.source).toBe(source);
  });
  it('downgrades only the exact foreign-symbol finding for a node-local exception', () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\n' +
      'api process [symbol: "arch-service", conformanceException: "arch-service"]';
    const checked = checkInstalledSuccessorSourceConformance028(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning',
    }));
    expect(checked.report?.exceptions).toContainEqual(expect.objectContaining({
      nodeId: 'api', symbol: 'arch-service',
      affectedRuleIds: ['CORAL.SYMBOL.OUT_OF_PROFILE'],
    }));
    expect(checked.report?.claimStatus).toBe('conformant-with-exceptions');
    expect(checked.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
    expect(checked.document.header.source).toBe(source);
  });

  it('leaves an independent strict flowchart rule at error beside the symbol exception', () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\n' +
      'api process [symbol: "arch-service", conformanceException: "arch-service"]\n' +
      'review decision\nreview -> api [flow]';
    const checked = checkInstalledSuccessorSourceConformance028(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' }),
      expect.objectContaining({ id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES', severity: 'error' }),
    ]));
    expect(checked.report?.claimStatus).toBe('failed');
  });

  it('rejects a stale node-local exception without forgiving the new symbol', () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\n' +
      'api process [symbol: "arch-database", conformanceException: "arch-service"]';
    const checked = checkInstalledSuccessorSourceConformance028(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'CORAL.CONFORMANCE.EXCEPTION.INVALID', severity: 'error',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.lastIndexOf('"arch-service"'),
        }) }) }),
      expect.objectContaining({ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'error' }),
    ]));
  });

  it('flags a node-local exception without an explicit symbol as independent integrity', () => {
    const source = '@diagram flowchart\n@conformanceLevel none\n' +
      'api process [conformanceException: "arch-service"]';
    const checked = checkInstalledSuccessorSourceConformance028(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.CONFORMANCE.EXCEPTION.INVALID', category: 'integrity', severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('"arch-service"'),
      }) }),
    }));
  });
  it('checks authored source ports against the semantic union rather than GraphIR 3 geometric ports', () => {
    const source = '@diagram architecture\napi service {\n  send port [direction: out, anchor: auto]\n}\ndb database {\n  receive port [direction: in]\n}\napi:send -> db:receive [reads]';
    const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'strict' });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings.some((finding) => finding.id === 'coral.port.reference.missing')).toBe(false);
    expect(checked.report?.findings.some((finding) => finding.id === 'GRAPHIR.INVALID_PORT_REFERENCE')).toBe(false);
  });

  it.each(['secondEnd: zeroOrOne', 'firstEnd: arrow'])(
    'checks catalog port roles from the written arrow with %s', (end) => {
      const invalid = '@diagram architecture\na service\nb service\n' +
        `link = a:in -> b:out [${end}]`;
      const checked = checkInstalledSuccessorSourceConformance028(invalid,
        { requestedLevel: 'none', notificationLevel: 'debug' });
      expect(checked.document.header.source).toBe(invalid);
      expect(checked.diagnostics).toEqual([]);
      expect(checked.report?.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'coral.port.reference.direction', severity: 'error',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: invalid.indexOf('a:in') + 2,
          }) }) }),
        expect.objectContaining({ id: 'coral.port.reference.direction', severity: 'error',
          range: expect.objectContaining({ start: expect.objectContaining({
            offset: invalid.indexOf('b:out') + 2,
          }) }) }),
      ]));
      expect(checked.report?.unverifiedObligations).toContainEqual(expect.objectContaining({
        id: 'CORAL.DIRECTION.DISPLAY_UNVERIFIED',
      }));
      expect(checked.report?.unverifiedObligations.map((item) => item.id))
        .not.toContain('CORAL.PORT.REFERENCE.UNVERIFIED');
      const valid = '@diagram architecture\na service\nb service\n' +
        `link = a:out -> b:in [${end}]`;
      const accepted = checkInstalledSuccessorSourceConformance028(valid,
        { requestedLevel: 'none' });
      expect(accepted.report?.findings.map((finding) => finding.id))
        .not.toContain('coral.port.reference.direction');
    });

  it('reports a catalog-port collision from an authored source declaration', () => {
    const source = '@diagram architecture\napi service {\n  out port [direction: out]\n}';
    const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'strict' });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'coral.port.duplicate', category: 'integrity', severity: 'error',
      subject: { kind: 'node', id: 'api' },
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('out port') }) }),
    }));
  });

  it('reports an unavailable named symbol anchor as an integrity error', () => {
    const source = '@diagram architecture\napi service {\n  audit port [direction: out, anchor: nonexistentRim]\n}';
    const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'none' });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'coral.port.anchor.symbol-unknown', category: 'integrity', severity: 'error',
      subject: { kind: 'node', id: 'api' },
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('nonexistentRim') }) }),
    }));
  });

  it('locates a grouped child port failure under its canonical node identity', () => {
    const source = '@diagram architecture\nteam group {\n  api service {\n' +
      '    audit port [direction: out, anchor: missingRim]\n  }\n}';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'none' });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'coral.port.anchor.symbol-unknown', category: 'integrity', severity: 'error',
      subject: { kind: 'node', id: 'team.api' },
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('missingRim'),
      }) }),
    }));
    expect(checked.document.header.source).toBe(source);
  });
  it.each([
    ['block', 'item block'], ['flowchart', 'step process'],
    ['architecture', 'api service'], ['bpmn', 'work task'],
    ['code', 'module module'],
    ['aiml', 'model model'], ['data-engineering', 'pipeline process'],
    ['sketch', 'idea cloud'], ['uml-class', 'Order class'],
    ['uml-sequence', 'client participant'],
  ] as const)('claims only the approved bounded inventory for valid %s source',
    (diagramType, declaration) => {
      const source = `@diagram ${diagramType}\n${declaration}\n`;
      const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'strict' });
      expect(checked.diagnostics).toEqual([]);
      expect(checked.report?.ruleset?.profileId).toBe(diagramType);
      expect(checked.report?.unverifiedObligations).toEqual([]);
      expect(checked.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
      expect(checked.report?.claimStatus).toBe('conformant');
    });

  it('checks a leftward sequence at the saved level without rewriting source', () => {
    const source = '@diagram uml-sequence\n@conformanceLevel strict\n' +
      'client participant\nserver participant\n' +
      'reply = client <- server [type: return] as "result"';
    const checked = checkInstalledSuccessorSourceConformance028(source);
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.evaluatedLevel).toBe('strict');
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT',
      range: { start: { line: 5, column: source.split('\n')[4]!.indexOf('return'),
        offset: source.indexOf('return') },
        end: { line: 5, column: source.split('\n')[4]!.indexOf('return') + 6,
          offset: source.indexOf('return') + 6 } },
    }));
    expect(checked.document.header.source).toBe(source);
    const oneOff = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'none' });
    expect(oneOff.report?.evaluatedLevel).toBe('none');
    expect(oneOff.document.header.header?.conformanceLevel).toBe('strict');
  });

  it('uses the written reverse operator when a rare end replaces its arrowhead', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'client <- server [return, firstEnd: zeroOrOne] as "result"';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict' });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.DIRECTION.DISPLAY_UNVERIFIED',
    }));
    expect(checked.report?.claimStatus).not.toBe('conformant');
  });

  it('keeps an unknown type visible at its token on a reverse-directed sequence message', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'reply = client <- server [type: reads] as "result"';
    const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'typical' });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED', severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('reads') }) }),
    }));
    expect(checked.document.header.source).toBe(source);
  });

  it('locates a reverse sequence port failure at the written endpoint token', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'client:missing <- server:unknown';
    const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'strict' });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'coral.port.reference.missing',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('client:missing') + 7,
        }) }) }),
      expect.objectContaining({ id: 'coral.port.reference.missing',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('server:unknown') + 7,
        }) }) }),
    ]));
    expect(checked.report?.findings.some((finding) =>
      finding.id === 'coral.sequence.field.unsupported')).toBe(false);
  });

  it('withholds a conformance report when a reverse sequence endpoint is unresolved', () => {
    const source = '@diagram uml-sequence\nclient participant\nclient <- absent';
    const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'strict' });
    expect(checked.report).toBeUndefined();
    expect(checked.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.reference.target.unresolved',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('absent') }) }),
    }));
  });

  it('checks known sequence rules while naming a participant-port scene limitation', () => {
    const source = '@diagram uml-sequence\nclient participant {\n  send port [direction: out]\n}\n' +
      'server participant\nclient -#> server [async]';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict', notificationLevel: 'debug' });
    expect(checked.report?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', severity: 'error',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('async'),
      }) }),
    }));
    expect(checked.report?.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.SEQUENCE.SEMANTIC_PORT_SCENE.UNVERIFIED',
    }));
    expect(checked.report?.claimStatus).not.toBe('conformant');
    expect(checked.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.sequence-semantic-port',
      range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('send port') }) }),
    }));
    expect(checked.document.header.source).toBe(source);
  });

  it('checks saved sequence port references from the successor semantic union', () => {
    const source = '@diagram uml-sequence\nclient participant {\n  send port [direction: out]\n}\n' +
      'server participant {\n  receive port [direction: in]\n}\n' +
      'client:send -> server:receive';
    const checked = checkInstalledSuccessorSourceConformance028(source,
      { requestedLevel: 'strict', notificationLevel: 'debug' });
    expect(checked.report?.findings.filter((finding) => finding.category === 'integrity')).toEqual([]);
    expect(checked.report?.unverifiedObligations).toContainEqual(expect.objectContaining({
      id: 'CORAL.SEQUENCE.SEMANTIC_PORT_SCENE.UNVERIFIED',
    }));
    expect(checked.diagnostics.filter((item) => item.code === 'render.capability.sequence-semantic-port'))
      .toHaveLength(2);
    expect(verifyPortableSuccessorSource028(source)).toMatchObject({
      graph: { edges: [{ id: 'edge-1' }] }, diagnostics: [],
    });
  });
});
