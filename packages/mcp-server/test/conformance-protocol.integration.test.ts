import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCoralMcpServer } from '../src/server.js';

describe('Coral conformance over MCP', () => {
  it('advertises and executes the explicit check with its full structured report', async () => {
    const server = createCoralMcpServer();
    const client = new Client({ name: 'coral-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      const tool = listed.tools.find((item) => item.name === 'coral_check_conformance');
      expect(tool?.inputSchema.required).toEqual(['content']);
      const graph = JSON.stringify({ version: '3.0.0', id: 'g',
        metadata: { notation: 'flowchart' },
        nodes: [{ id: 'entry', type: 'process' }, { id: 'choose', type: 'decision' },
          { id: 'accept', type: 'process' }],
        edges: [{ id: 'enter', source: 'entry', target: 'choose' },
          { id: 'only', source: 'choose', target: 'accept' }] });
      const response = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: graph, level: 'strict' } });
      expect(response).toMatchObject({ isError: true,
        structuredContent: { conformance: { evaluatedLevel: 'strict', claimStatus: 'failed',
          findings: [{ id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES' }] } } });
      const source = '@diagram flowchart\n@conformanceLevel typical\n' +
        'entry process\nchoose decision\naccept process\n' +
        'entry -> choose [flow]\nchoose -> accept [flow]\n';
      const saved = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: source } });
      expect(saved).toMatchObject({ structuredContent: { source,
        conformance: { evaluatedLevel: 'typical', claimStatus: 'not-claimed', findings: [] } } });
      const override = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: source, level: 'strict' } });
      expect(override).toMatchObject({ isError: true, structuredContent: { source,
        conformance: { evaluatedLevel: 'strict', claimStatus: 'failed',
          findings: [{ id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES',
            range: expect.objectContaining({
              start: expect.objectContaining({ offset: source.indexOf('decision') }),
          }) }] } } });

      const reverseSequence = '@diagram uml-sequence\n@conformanceLevel strict\n' +
        'client participant\nserver participant\n' +
        'reply = client <- server [type: return] as "result"';
      const reverseCheck = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: reverseSequence } });
      expect(reverseCheck).toMatchObject({ isError: true, structuredContent: {
        source: reverseSequence,
        conformance: { evaluatedLevel: 'strict', findings: [expect.objectContaining({
          id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT',
        })] },
      } });

      const savedNone = source.replace('@conformanceLevel typical', '@conformanceLevel none');
      const none = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: savedNone } });
      expect(none).toMatchObject({ structuredContent: { source: savedNone,
        conformance: { evaluatedLevel: 'none', claimStatus: 'not-claimed', findings: [] } } });
      const savedStrict = source.replace('@conformanceLevel typical', '@conformanceLevel strict');
      const strict = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: savedStrict } });
      expect(strict).toMatchObject({ isError: true, structuredContent: { source: savedStrict,
        conformance: { evaluatedLevel: 'strict', claimStatus: 'failed',
          findings: [{ id: 'CORAL.FLOWCHART.DECISION.ALTERNATIVES' }] } } });

      const foreign = JSON.stringify({ version: '3.0.0', id: 'foreign',
        metadata: { notation: 'flowchart' },
        nodes: [{ id: 'api', type: 'process', symbol: 'arch-service' }], edges: [] });
      const quiet = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: foreign } });
      const loud = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: foreign, notificationLevel: 'warning' } });
      const quietReport = quiet.structuredContent?.conformance;
      const loudReport = loud.structuredContent?.conformance;
      expect(quietReport).toMatchObject({ claimStatus: 'not-claimed',
        findings: [{ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' }], notices: [],
        unverifiedObligations: expect.any(Array),
        ruleset: { id: 'coral-flowchart', profileId: 'flowchart', version: expect.any(String) },
        catalog: { id: expect.any(String), version: expect.any(String), digest: expect.any(String) } });
      expect(loudReport).toMatchObject({ claimStatus: 'not-claimed',
        findings: [{ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' }],
        notices: [{ id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning' }] });
      expect(loudReport?.findings).toEqual(quietReport?.findings);
      expect(loudReport?.unverifiedObligations).toEqual(quietReport?.unverifiedObligations);
      expect(loudReport?.ruleset).toEqual(quietReport?.ruleset);
      expect(loudReport?.catalog).toEqual(quietReport?.catalog);

      const complete = JSON.stringify({ version: '3.0.0', id: 'partial',
        metadata: { notation: 'flowchart' },
        nodes: [{ id: 'entry', type: 'process' }], edges: [] });
      const unverified = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: complete, level: 'strict' } });
      expect(unverified).toMatchObject({ structuredContent: { conformance: {
        evaluatedLevel: 'strict', claimStatus: 'conformant', findings: [],
        unverifiedObligations: [],
        ruleset: expect.objectContaining({ scope: 'coral-bounded-profile' }),
      } } });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    ['flowchart', '@diagram flowchart\n@conformanceLevel typical\n' +
      'entry process\nchoice process [symbol: "flowchart-decision"]\ndone terminal\n' +
      'entry -> choice\nchoice -> done\n', 'CORAL.FLOWCHART.DECISION.ALTERNATIVES',
      '"flowchart-decision"'],
    ['uml-class', '@diagram uml-class\n@conformanceLevel typical\n' +
      'Child class\nBase class\ngeneralizes = Child -> Base [inheritance, secondEnd: zeroOrOne]\n',
      'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE', 'zeroOrOne'],
  ])('preserves CR-102 %s evidence through MCP serialization', async (_profile, source, rule, token) => {
    const server = createCoralMcpServer();
    const client = new Client({ name: 'cr102-evidence', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const response = await client.callTool({ name: 'coral_check_conformance',
        arguments: { content: source, level: 'strict', notificationLevel: 'debug' } });
      expect(response).toMatchObject({ isError: true, structuredContent: { source,
        conformance: { evaluatedLevel: 'strict', claimStatus: 'failed',
          findings: expect.arrayContaining([expect.objectContaining({ id: rule,
            severity: 'error', range: {
              start: expect.objectContaining({ offset: source.indexOf(token) }),
              end: expect.objectContaining({ offset: source.indexOf(token)+token.length }),
            } })]),
          unverifiedObligations: expect.any(Array),
        } } });
      const saved = await client.callTool({ name: 'coral_check_conformance', arguments: { content: source } });
      expect(saved).toMatchObject({ structuredContent: { source,
        conformance: { evaluatedLevel: 'typical', claimStatus: 'not-claimed', findings: [] } } });
    } finally {
      await client.close();
      await server.close();
    }
  });

});
