import { describe, expect, it } from 'vitest';
import { parseCoralDSL } from '../src/parsers';
import { planFileOpen } from '../src/useEditorController';

describe('0.2.8 editor semantic port admission', () => {
  it('accepts catalog ports on a written connector', () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'read = api:out -> store:query as "Read"';
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sourceGraph?.edges[0]).toMatchObject({
      id: 'read', first: { node: 'api', port: 'out' },
      second: { node: 'store', port: 'query' },
    });
    expect(parsed.edges[0]).toMatchObject({
      id: 'read', sourcePort: 'out', targetPort: 'query', label: 'Read',
    });
  });

  it('locates a missing port at the authored token and keeps the draft open', () => {
    const source = '@diagram architecture\napi service\nstore database\n' +
      'read = api:missing -> store:query';
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toContainEqual(expect.objectContaining({
      code: 'coral.port.reference.missing',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('missing'),
      }) }),
    }));
    const plan = planFileOpen({ name: 'draft.coral', text: source });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.prepared.source).toBe(source);
    expect(plan.textOpen?.blockWith).toBeDefined();
  });

  it('locates a direction-invalid port on the written end', () => {
    const source = '@diagram architecture\nstore database\napi service\n' +
      'read = store:query -> api:in';
    const parsed = parseCoralDSL(source);
    const issue = parsed.errors.find((item) => item.code === 'coral.port.reference.direction');
    expect(issue?.range?.start.offset).toBe(source.indexOf('query'));
    expect(issue?.subject).toEqual({ kind: 'edge', id: 'read' });
  });

  it('adds a node-local port without replacing catalog ports', () => {
    const source = '@diagram architecture\napi service {\n' +
      '  audit port [direction: out]\n}\nstore database\n' +
      'api:audit -> store:query\napi:out -> store:query';
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toEqual([]);
    const ports = parsed.semanticInterpretations?.get('api')?.semanticPorts.map(({ id }) => id);
    expect(ports).toContain('audit');
    expect(ports).toContain('out');
  });

  it('keeps an outcome label separate from semantic port references', () => {
    const source = '@diagram flowchart\nchoice decision\nnext process\n' +
      'choice -> next as "No"';
    const parsed = parseCoralDSL(source);
    expect(parsed.errors).toEqual([]);
    expect(parsed.edges[0]).toMatchObject({ label: 'No' });
    expect(parsed.edges[0]?.sourcePort).toBeUndefined();
    expect(parsed.edges[0]?.targetPort).toBeUndefined();
  });
});
