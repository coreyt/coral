import { describe, expect, it } from 'vitest';
import { checkInstalledDocumentConformance028, parseInstalledDocument028 } from '../src/installedDocument028.js';
import { resolveNotationNode028 } from '../src/notations/index.js';
import { renderSvg } from '../src/svg/serialize.js';

describe('0.2.8 scoped BPMN and ERD words', () => {
  it('resolves concrete BPMN kinds from short camelCase source without aliasing generic event', () => {
    const source = '@diagram bpmn\nstart startEvent\nwork task\nchoice exclusiveGateway\n' +
      'done endEvent\nstart -> work [sequence]\nwork -> choice [sequence]\n' +
      'choice -> done [sequence]\n';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.nodes.map((node) => node.type)).toEqual([
      'startEvent', 'task', 'exclusiveGateway', 'endEvent',
    ]);
    expect(resolveNotationNode028({ id: 'start', type: 'startEvent' }, 'bpmn'))
      .toMatchObject({ status: 'resolved', effectiveSymbolId: 'bpmn-start-event' });
    expect(resolveNotationNode028({ id: 'parallel', type: 'parallelGateway' }, 'bpmn'))
      .toMatchObject({ status: 'resolved', effectiveSymbolId: 'bpmn-gateway-parallel' });
    expect(resolveNotationNode028({ id: 'generic', type: 'event' }, 'bpmn').status).toBe('generic');
    expect(resolveNotationNode028({ id: 'generic', type: 'event' }, 'bpmn').effectiveSymbolId).toBeUndefined();
    expect(resolveNotationNode028({ id: 'work', type: 'task' }, 'erd').status).toBe('generic');
    expect(resolveNotationNode028({ id: 'work', type: 'task' }, 'erd').effectiveSymbolId).toBeUndefined();
    expect(renderSvg(parsed.graph!)).toContain('start');
    const strict = checkInstalledDocumentConformance028(source, { requestedLevel: 'strict' });
    expect(strict.report?.findings.map((finding) => finding.id))
      .not.toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
    expect(strict.report?.findings.filter((finding) =>
      finding.id === 'BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED')).toEqual([]);
    expect(strict.report?.claimStatus).toBe('conformant');
    expect(strict.report?.ruleset).toMatchObject({ scope: 'coral-bounded-profile' });
  });

  it('withholds Chen ERD source meaning in the 0.2.8 release', () => {
    const source = '@diagram erd\nCustomer entity\nname attribute\nowns relationship\n' +
      'Customer -> owns\nowns -> name\n';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.source).toBe(source);
    expect(parsed.header.diagnostics.map((item) => item.code)).toContain('header.diagram.disabled');
    expect(parsed.graph).toBeUndefined();
  });
});
