import { describe, expect, it } from 'vitest';
import { parseCoralDSL } from '../src/parsers.js';
import { planFileOpen } from '../src/useEditorController.js';
import { checkInstalledSuccessorSourceConformance028, parseInstalledDocument028,
  prepareInstalledDocumentForSave028, verifyPortableSuccessorSource028 } from '@coral-viz/render';

describe('Slice 35 state source editor boundary', () => {
  it('keeps state source editable with a located visual refusal and no canvas projection', () => {
    const source = '// source remains authoritative\r\n@diagram uml-state\r\n@coralVersion "0.2.8"\r\nstart initial\r\nIdle state\r\nfinish final\r\na = start -> Idle\r\nb = Idle -> finish\r\n';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.diagnostics).toEqual([]);
    const result = parseCoralDSL(source);
    expect(result.errors).toEqual([expect.objectContaining({
      code: 'render.capability.character-only-edition', severity: 'error',
      line: 2, column: 9,
      range: parsed.header.diagramTypeRange,
    })]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.envelope).toBeUndefined();
    expect(result.sourceGraph?.profile.id).toBe('uml-state');
    expect(result.semanticInterpretations?.size).toBe(3);
    expect(prepareInstalledDocumentForSave028(source, parsed).source).toBe(source);
    const opened = planFileOpen({ name: 'state.coral', text: source });
    expect(opened).toMatchObject({ kind: 'open', prepared: { source },
      textOpen: { text: source, canonicalInput: { nodes: [], edges: [] },
        blockWith: expect.stringContaining('UML state') } });
    expect(parseCoralDSL(source)).toEqual(result);
    expect(verifyPortableSuccessorSource028(source).diagnostics).toEqual([]);
    expect(checkInstalledSuccessorSourceConformance028(source).diagnostics).toEqual([]);
  });
});
