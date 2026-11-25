import { describe, expect, it } from 'vitest';
import { checkInstalledSuccessorSourceConformance028 } from '@coral-viz/render';
import { conformanceTool, handleConformanceCheck } from '../src/tools/conformance.js';

const flowchart = JSON.stringify({
  version: '3.0.0', id: 'draft', metadata: { notation: 'flowchart' },
  nodes: [
    { id: 'entry', type: 'process' }, { id: 'choose', type: 'decision' },
    { id: 'accept', type: 'process' },
  ],
  edges: [{ id: 'enter', source: 'entry', target: 'choose' },
    { id: 'only', source: 'choose', target: 'accept' }],
});

describe('explicit Coral conformance check', () => {
  it.each([
    ['block', 'item block'], ['architecture', 'api service'], ['aiml', 'item model'],
    ['code', 'item module'], ['data-engineering', 'item process'], ['sketch', 'item cloud'],
    ['flowchart', 'item process'], ['bpmn', 'item task'], ['uml-class', 'item class'],
    ['uml-sequence', 'item participant'],
  ])('qualifies the approved %s bounded strict success and preserves source', async (profile, declaration) => {
    const source = `@diagram ${profile}\n@conformanceLevel typical\n${declaration}\n`;
    const checked = await handleConformanceCheck({ content: source, level: 'strict' });
    expect(checked.isError).toBeUndefined();
    expect(checked.structuredContent).toMatchObject({ source, conformance: {
      claimStatus: 'conformant', findings: [], unverifiedObligations: [],
      ruleset: { profileId: profile, version: '0.2.8-bounded.1', scope: 'coral-bounded-profile' },
    } });
    expect(checked.content[0]?.text)
      .toContain('Coral bounded profile; full external-standard conformance is not claimed.');
    expect(checked.structuredContent.conformance).toEqual(
      checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'strict' }).report);
  });

  it('reports message conflicts inside a flat alternative without claiming complete rules', async () => {
    const source = '@diagram uml-sequence\na participant\nb participant\n' +
      'choice = alt "yes" {\n  a -#> b [async]\n} else "no" {\n  b -> a\n}';
    const checked = await handleConformanceCheck({ content: source,
      level: 'strict', notificationLevel: 'debug' });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.conformance).toMatchObject({
      claimStatus: 'failed', findings: expect.arrayContaining([expect.objectContaining({
        id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', severity: 'error',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('async'),
        }) }),
      })]),
      unverifiedObligations: [],
      ruleset: expect.objectContaining({ scope: 'coral-bounded-profile' }),
    });
    expect(checked.structuredContent.source).toBe(source);
  });
  it('returns all source faults when a recursive fragment also has an authored participant port', async () => {
    const source = '@diagram uml-sequence\na participant {\n  out port [direction: out]\n}\n' +
      'b participant [symbol: "missing-symbol"]\n' +
      'choice = alt "yes" {\n  retry = alt "again" {\n    a:missing -> b\n' +
      '  } else "stop" {\n    b -> a\n  }\n} else "no" {\n  b -> a\n}';
    const checked = await handleConformanceCheck({ content: source, level: 'strict' });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'render.capability.sequence-semantic-port' }),
      expect.objectContaining({ code: 'coral.symbol.unknown' }),
      expect.objectContaining({ code: 'coral.port.reference.missing' }),
    ]));
  });
  it('returns a known message finding and the separate sequence-port scene limit', async () => {
    const source = '@diagram uml-sequence\na participant {\n  send port [direction: out]\n}\n' +
      'b participant\na -#> b [async]';
    const checked = await handleConformanceCheck({ content: source,
      level: 'strict', notificationLevel: 'debug' });
    expect(checked.structuredContent.conformance?.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', severity: 'error',
    }));
    expect(checked.structuredContent.conformance?.unverifiedObligations).toContainEqual(
      expect.objectContaining({ id: 'CORAL.SEQUENCE.SEMANTIC_PORT_SCENE.UNVERIFIED' }));
    expect(checked.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'render.capability.sequence-semantic-port',
    }));
    expect(checked.content[0]?.text).toContain('render.capability.sequence-semantic-port');
    expect(checked.structuredContent.source).toBe(source);
    const sceneOnly = await handleConformanceCheck({
      content: source.replace('a -#> b [async]', 'a -> b'), level: 'strict',
    });
    expect(sceneOnly.structuredContent.conformance?.claimStatus).toBe('unverified');
    expect(sceneOnly.structuredContent.conformance?.findings).toEqual([]);
    expect(sceneOnly.isError).toBe(true);
  });
  it('lets source use its saved level and safely defaults GraphIR 3 when no level is supplied', () => {
    expect(conformanceTool.inputSchema.required).toEqual(['content']);
    expect(conformanceTool.inputSchema.properties.level.enum).toEqual(['none', 'typical', 'strict']);
    return handleConformanceCheck({ content: flowchart }).then((response) => {
      expect(response.structuredContent.conformance).toMatchObject({
        evaluatedLevel: 'typical', claimStatus: 'not-claimed',
      });
    });
  });

  it('returns all findings, obligations, and a failed strict claim', async () => {
    const response = await handleConformanceCheck({ content: flowchart, level: 'strict' });
    expect(response.isError).toBe(true);
    expect(response.structuredContent.conformance).toMatchObject({
      evaluatedLevel: 'strict', claimStatus: 'failed',
      findings: [{ id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES', severity: 'error',
        evidenceScope: 'node', remediation: expect.any(String) }],
      unverifiedObligations: [],
      ruleset: expect.objectContaining({ scope: 'coral-bounded-profile' }),
    });
    expect(response.content[0].text).toContain('Conformance check: failed');
  });

  it('keeps typical low-noise and notification filtering separate from the full report', async () => {
    const typical = await handleConformanceCheck({ content: flowchart, level: 'typical' });
    expect(typical.isError).toBeUndefined();
    expect(typical.structuredContent.conformance).toMatchObject({
      evaluatedLevel: 'typical', claimStatus: 'not-claimed', findings: [], notices: [],
    });
    const strictQuiet = await handleConformanceCheck({ content: flowchart,
      level: 'strict', notificationLevel: 'warning' });
    expect(strictQuiet.structuredContent.conformance.findings).toHaveLength(1);
    expect(strictQuiet.structuredContent.conformance.notices).toHaveLength(1);
  });

  it('retains a quiet typical warning in the full report and lets the requester show it', async () => {
    const foreign = JSON.stringify({ version: '3.0.0', id: 'foreign',
      metadata: { notation: 'flowchart' },
      nodes: [{ id: 'api', type: 'process', symbol: 'arch-service' }], edges: [] });
    const quiet = await handleConformanceCheck({ content: foreign, level: 'typical' });
    expect(quiet.structuredContent.conformance).toMatchObject({
      findings: [{ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' }], notices: [],
    });
    expect(quiet.content[0].text).not.toContain('Symbol arch-service');
    const loud = await handleConformanceCheck({ content: foreign,
      level: 'typical', notificationLevel: 'warning' });
    expect(loud.structuredContent.conformance.notices).toMatchObject([
      { id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' },
    ]);
    expect(loud.content[0].text).toContain('Symbol arch-service');
  });

  it('uses saved source level and an explicit one-off override without changing authored Coral', async () => {
    const source = '@diagram flowchart\n@conformanceLevel typical\n' +
      'entry process as "Entry"\nchoose decision as "Choose"\naccept process as "Accept"\n' +
      'entry -> choose [flow]\nchoose -> accept [flow]\n';
    const ordinary = await handleConformanceCheck({ content: source });
    expect(ordinary.structuredContent.conformance).toMatchObject({
      evaluatedLevel: 'typical', claimStatus: 'not-claimed', findings: [],
    });
    const response = await handleConformanceCheck({ content: source, level: 'strict' });
    expect(response.structuredContent.conformance).toMatchObject({
      evaluatedLevel: 'strict', claimStatus: 'failed',
      findings: [{ id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES',
        range: { start: { offset: source.indexOf('decision') } } }],
    });
    expect(response.structuredContent.source).toBe(source);
  });

  it('keeps a node-local exception tied to its exact symbol across explicit source checks', async () => {
    const source = '@diagram flowchart\n@conformanceLevel strict\n' +
      'api process [symbol: "arch-service", conformanceException: "arch-service"]';
    const accepted = await handleConformanceCheck({ content: source });
    expect(accepted.structuredContent.conformance).toMatchObject({
      findings: [expect.objectContaining({ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' })],
      exceptions: [expect.objectContaining({ nodeId: 'api', symbol: 'arch-service',
        affectedRuleIds: ['CORAL.SYMBOL.OUT_OF_PROFILE'] })],
    });
    const stale = source.replace('symbol: "arch-service"', 'symbol: "arch-database"');
    const rejected = await handleConformanceCheck({ content: stale });
    expect(rejected.isError).toBe(true);
    expect(rejected.structuredContent.conformance.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'CORAL.CONFORMANCE.EXCEPTION.INVALID', severity: 'error',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: stale.lastIndexOf('"arch-service"'),
        }) }) }),
      expect.objectContaining({ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'error' }),
    ]));
    expect(rejected.structuredContent.source).toBe(stale);
  });

  it('checks a saved-header reverse sequence without treating its arrow as a parse error', async () => {
    const source = '@diagram uml-sequence\n@conformanceLevel strict\n' +
      'client participant\nserver participant\n' +
      'reply = client <- server [type: return] as "result"';
    const response = await handleConformanceCheck({ content: source });
    expect(response.structuredContent).toMatchObject({ source,
      conformance: { evaluatedLevel: 'strict', findings: [expect.objectContaining({
        id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT',
        range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('return') }) }),
      })] } });
    expect(response.structuredContent).not.toHaveProperty('diagnostics');
  });

  it('reports an authored UML inheritance arrow at strict without changing the source', async () => {
    const source = '@diagram uml-class\n@conformanceLevel strict\n' +
      'Child class\nBase class\nChild -> Base [inheritance]\n';
    const strict = await handleConformanceCheck({ content: source });
    expect(strict.isError).toBe(true);
    expect(strict.structuredContent).toMatchObject({ source, conformance: {
      evaluatedLevel: 'strict', claimStatus: 'failed',
      findings: [expect.objectContaining({
        id: 'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE',
        range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('->') }) }),
      })],
    } });
    const typical = await handleConformanceCheck({ content: source, level: 'typical' });
    expect(typical.structuredContent).toMatchObject({ source, conformance: {
      evaluatedLevel: 'typical', findings: [],
    } });
  });

  it('certifies the reviewed bounded flowchart inventory for a complete graph', async () => {
    const complete = JSON.parse(flowchart);
    complete.nodes.push({ id: 'reject', type: 'process' });
    complete.edges.push({ id: 'other', source: 'choose', target: 'reject' });
    const response = await handleConformanceCheck({ content: JSON.stringify(complete), level: 'strict' });
    expect(response.isError).toBeUndefined();
    expect(response.structuredContent.conformance).toMatchObject({
      claimStatus: 'conformant', findings: [],
      ruleset: expect.objectContaining({ scope: 'coral-bounded-profile' }),
    });
  });

  it('reports missing profile and malformed input without constructing a false claim', async () => {
    const missing = await handleConformanceCheck({ content: JSON.stringify({
      version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'process' }], edges: [],
    }), level: 'strict' });
    expect(missing.structuredContent.conformance.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.PROFILE.MISSING', category: 'capability', severity: 'error',
    }));
    const invalid = await handleConformanceCheck({ content: 'invalid source', level: 'strict' });
    expect(invalid).toMatchObject({ isError: true,
      structuredContent: { diagnostics: expect.any(Array) } });
    expect(invalid.structuredContent).not.toHaveProperty('conformance');
  });

  it('preserves exact Coral source diagnostics for editor highlighting', async () => {
    const content = '@diagram flowchart\nentry process\nentry -> missing\n';
    const response = await handleConformanceCheck({ content, level: 'strict' });
    expect(response.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.reference.target.unresolved',
      range: expect.objectContaining({
        start: expect.objectContaining({ offset: content.indexOf('missing') }),
      }),
    }));
    expect(response.structuredContent).not.toHaveProperty('conformance');
  });

  it('rejects a missing or invalid 0.2.8 source header instead of inferring profile context', async () => {
    for (const content of ['entry process\n', '@diagram uninstalled\nentry process\n']) {
      const response = await handleConformanceCheck({ content });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).not.toHaveProperty('conformance');
      expect(response.structuredContent.diagnostics.some((item) =>
        item.code === 'header.diagram.required' || item.code === 'header.diagram.unsupported')).toBe(true);
    }
  });

  it('normalizes header source locations to the same zero-based columns as body diagnostics', async () => {
    const content = '// 📌 review\r\n@diagram uninstalled\r\nentry process\r\n';
    const response = await handleConformanceCheck({ content });
    const diagnostic = response.structuredContent.diagnostics.find((item) =>
      item.code === 'header.diagram.unsupported');
    expect(diagnostic?.range).toMatchObject({
      start: { line: 2, column: 9, offset: content.indexOf('uninstalled') },
    });
    expect(response.structuredContent).not.toHaveProperty('conformance');
  });

  it('keeps portable integrity errors visible even when notation checking is none', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'broken',
      metadata: { notation: 'flowchart' },
      nodes: [{ id: 'a', type: 'process' }],
      edges: [{ id: 'dangling', source: 'a', target: 'missing' }] });
    const response = await handleConformanceCheck({ content, level: 'none' });
    expect(response.isError).toBe(true);
    expect(response.structuredContent.conformance).toMatchObject({ evaluatedLevel: 'none',
      findings: [expect.objectContaining({ category: 'integrity', severity: 'error' })] });
  });

  it('rejects an unsupported profile-only sequence message in the public conformance check', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'sequence',
      profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
      nodes: [{ id: 'client', type: 'participant' }, { id: 'server', type: 'participant' }],
      edges: [{ id: 'read', source: 'client', target: 'server', type: 'reads' }],
      interaction: { participants: [{ id: 'client', nodeId: 'client' },
        { id: 'server', nodeId: 'server' }], participantOrder: ['client', 'server'],
      messages: [{ id: 'read', edgeId: 'read', sourceParticipantId: 'client',
        targetParticipantId: 'server', kind: 'synchronous' }], messageOrder: ['read'] },
    });
    const response = await handleConformanceCheck({ content, level: 'strict' });
    expect(response.isError).toBe(true);
    expect(response.structuredContent.conformance).toMatchObject({ claimStatus: 'failed' });
    expect(response.structuredContent.conformance.findings).toContainEqual(expect.objectContaining({
      id: 'coral.sequence.message.invalid', category: 'integrity',
      subject: { kind: 'edge', id: 'read' },
    }));
    expect(response.structuredContent.conformance.findings).toContainEqual(expect.objectContaining({
      id: 'CORAL.UML.SEQUENCE.TYPE_UNRECOGNIZED', category: 'notation',
      subject: { kind: 'edge', id: 'read' },
    }));
  });
});


describe('CR-102 source conformance evidence parity', () => {
  const cases = [
    ['flowchart', '@diagram flowchart\n@conformanceLevel typical\n' +
      'entry process\nchoice process [symbol: "flowchart-decision"]\nyes terminal\n' +
      'earlier = entry -> yes\nenter = entry -> choice\nonly = choice -> yes\n',
      'CORAL.FLOWCHART.DECISION.ALTERNATIVES', '"flowchart-decision"'],
    ['uml-class', '@diagram uml-class\n@conformanceLevel typical\n' +
      'Child class\nBase class\nOther class\nearlier = Other -> Base\n' +
      'generalizes = Child -> Base [inheritance, secondEnd: zeroOrOne]\n',
      'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE', 'zeroOrOne'],
  ].flatMap(([profile, source, rule, token]) =>
    (['none', 'typical', 'strict'] as const).flatMap(level =>
      (['error', 'warning', 'info', 'debug'] as const).map(notificationLevel =>
        ({ profile, source, rule, token, level, notificationLevel }))));
  it.each(cases)(
    'returns exact $profile source-token evidence at $level / $notificationLevel',
    async ({ source, rule, token, level, notificationLevel }) => {
      const shared = checkInstalledSuccessorSourceConformance028(source,
        { requestedLevel: level, notificationLevel });
      const response = await handleConformanceCheck({ content: source, level, notificationLevel });
      const report = response.structuredContent.conformance;
      expect(report).toEqual(shared.report);
      expect(response.structuredContent.source).toBe(source);
      expect(shared.document.header.header?.conformanceLevel).toBe('typical');
      if (level === 'strict') {
        expect(response.isError).toBe(true);
        expect(report?.claimStatus).toBe('failed');
        expect(report?.findings).toContainEqual(expect.objectContaining({ id: rule,
          severity: 'error', range: {
            start: expect.objectContaining({ offset: source.indexOf(token) }),
            end: expect.objectContaining({ offset: source.indexOf(token)+token.length }),
          } }));
        expect(report?.notices).toEqual(report?.findings);
      } else {
        expect(report?.findings).toEqual([]);
        expect(report?.claimStatus).toBe('not-claimed');
        expect(response.isError).toBeUndefined();
      }
      expect(report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
      expect(report?.unverifiedObligations.map(({ id }) => id))
        .toEqual(source.includes('secondEnd: zeroOrOne') ? ['CORAL.DIRECTION.DISPLAY_UNVERIFIED'] : []);
    });
});
