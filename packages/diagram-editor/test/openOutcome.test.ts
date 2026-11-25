import { describe, expect, it } from 'vitest';
import { createBlankDocument } from '../src/blankDocument';
import { planFileOpen } from '../src/useEditorController';

// S93-WI-04 / R-064 AC-3: raw Mermaid non-sequence import names GraphIR
// interchange; verified sequence conversion names Coral. DOT/PlantUML retain
// exact source, and saved foreign drafts report restoration without conversion.
function notices(plan: ReturnType<typeof planFileOpen>) {
  if (plan.kind !== 'open') throw new Error(`blocked: ${JSON.stringify(plan.reasons)}`);
  // Text opens publish textOpen.diagnostics; document/import opens publish sourceDiagnostics.
  const all = plan.textOpen ? plan.textOpen.diagnostics : plan.prepared.sourceDiagnostics;
  return all.filter((item) => item.code === 'coral.open.converted' || item.code === 'coral.open.restored-source');
}

function draft(dslType: 'mermaid' | 'dot' | 'plantuml', text: string) {
  const doc = createBlankDocument();
  return JSON.stringify({ ...doc, metadata: { ...doc.metadata, name: 'Draft' }, content: { format: 'dsl', dslType, text } });
}

describe('file-open outcome notices', () => {
  it('reopens a cleared Coral draft with its exact empty source', () => {
    const doc = createBlankDocument();
    doc.content = { format: 'dsl', dslType: 'coral', text: '' };
    const plan = planFileOpen({ name: 'cleared.coral.json', text: JSON.stringify(doc) });
    expect(plan).toMatchObject({ kind: 'open', textOpen: { format: 'coral', text: '' } });
  });

  it.each([
    ['flow.mmd', 'flowchart LR\n  a --> b', 'a'],
    ['class.mmd', 'classDiagram\nclass Order {\n  +UUID id\n  +save(): Void\n}', 'Order'],
  ])('opens raw %s as exact Mermaid source with full imported meaning', (name, value, nodeId) => {
    const plan = planFileOpen({ name, text: value });
    expect(plan).toMatchObject({ kind: 'open', textOpen: { format: 'mermaid', text: value } });
    if (plan.kind !== 'open') return;
    expect(plan.textOpen?.canonicalInput.nodes.map((node) => node.id)).toContain(nodeId);
    if (nodeId === 'Order') {
      expect(plan.textOpen?.canonicalInput.nodes[0]?.classifier?.compartments)
        .toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'attributes' })]));
    }
    expect(notices(plan)).toEqual([]);
  });

  it('identifies a saved Mermaid draft as restored source, not conversion', () => {
    const plan = planFileOpen({ name: 'draft.coral.json', text: draft('mermaid', 'flowchart LR\n  a --> b') });
    expect(plan).toMatchObject({ kind: 'open', outcome: { kind: 'restored-source', formatLabel: 'Mermaid' } });
    expect(notices(plan)).toEqual([expect.objectContaining({
      severity: 'info',
      code: 'coral.open.restored-source',
      message: 'Restored the saved Mermaid source from draft.coral.json. It was not converted.',
    })]);
  });

  it.each([
    ['dot', 'DOT', 'digraph G { a -> b }'],
    ['plantuml', 'PlantUML', '@startuml\nA -> B : hi\n@enduml'],
  ] as const)('restores a saved %s draft as exact source', (format, label, value) => {
    const plan = planFileOpen({ name: 'draft.coral.json', text: draft(format, value) });
    expect(plan).toMatchObject({ kind: 'open', textOpen: { format, text: value },
      outcome: { kind: 'restored-source', formatLabel: label } });
    expect(notices(plan)).toEqual([expect.objectContaining({
      code: 'coral.open.restored-source',
      message: `Restored the saved ${label} source from draft.coral.json. It was not converted.`,
    })]);
  });

  it.each([
    ['plain.coral', 'service "A" as a\nservice "B" as b\na -> b'],
    ['graph.json', JSON.stringify({ version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'service' }], edges: [] })],
  ])('does not describe %s as a conversion', (name, text) => {
    const plan = planFileOpen({ name, text });
    expect(plan.kind).toBe('open');
    expect((plan as { outcome?: unknown }).outcome).toBeUndefined();
    expect(notices(plan)).toEqual([]);
  });

  it('opens malformed DOT as an exact blocked-semantic source draft', () => {
    const plan = planFileOpen({ name: 'broken.dot', text: 'digraph G { a -> }' });
    expect(plan).toMatchObject({ kind: 'open', textOpen: { format: 'dot',
      text: 'digraph G { a -> }', blockWith: expect.stringContaining('Recovered graph:') } });
    expect((plan as { outcome?: unknown }).outcome).toBeUndefined();
  });

  it('opens malformed raw Mermaid as exact source with semantic projection blocked', () => {
    const text = 'gantt\n  title Project';
    const plan = planFileOpen({ name: 'unfinished.mmd', text });
    expect(plan).toMatchObject({ kind: 'open', textOpen: {
      format: 'mermaid', text, blockWith: expect.stringContaining('Recovered graph:'),
    } });
    if (plan.kind === 'open') expect(plan.outcome?.kind).not.toBe('converted');
  });

  it.each([
    ['dot', 'connections.dot', 'digraph G { a -> b }'],
    ['plantuml', 'messages.puml', '@startuml\nA -> B : hi\n@enduml'],
  ] as const)('keeps raw %s text as the opened source', (format, name, value) => {
    const plan = planFileOpen({ name, text: value });
    expect(plan).toMatchObject({ kind: 'open', textOpen: { format, text: value } });
  });

  it('retains unparsed PlantUML text while refusing incomplete meaning', () => {
    const text = '@startuml\nA -> B : hi\nmystery this\n@enduml';
    const plan = planFileOpen({ name: 'unknown.puml', text });
    expect(plan).toMatchObject({ kind: 'open', textOpen: {
      format: 'plantuml', text, blockWith: expect.stringContaining('unverified'),
    } });
  });
});
