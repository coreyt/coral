import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { editSourceOwnedNodeLabelPlacement028 } from '../src/sourceOwnedEdits028';

const source = '@diagram architecture\n// Keep bytes and quote style.\n' +
  "api = service as 'API' label below offset 12 @ (120, 80) pinned // keep\n" +
  'store database @ (500, 80) pinned\nrequest = api <- store as "Reply"\n';

describe('source-owned node label placement', () => {
  it('replaces only placement tokens and preserves all other portable meaning', () => {
    const edited = editSourceOwnedNodeLabelPlacement028(source, 'api', { side: 'right', offset: 20 });
    expect(edited).toBe(source.replace('label below offset 12', 'label right offset 20'));
    const before = projectInstalledSourceToSuccessor028(source).graph!;
    const after = projectInstalledSourceToSuccessor028(edited).graph!;
    before.nodes[0].labelPlacement = { side: 'right', offset: 20 };
    expect(after).toEqual(before);
  });

  it('inserts existing placement spelling before position and comment', () => {
    const text = source.replace(' label below offset 12', '');
    expect(editSourceOwnedNodeLabelPlacement028(text, 'api', { side: 'above', offset: 8 }))
      .toBe(text.replace("as 'API' @", "as 'API' label above offset 8 @"));
  });

  it('keeps omitted offset omitted on a no-op and preserves internal spacing', () => {
    const text = source.replace('label below offset 12', 'label   below');
    expect(editSourceOwnedNodeLabelPlacement028(text, 'api', { side: 'below', offset: 0 })).toBe(text);
  });

  it('resolves exact grouped identity and edits only the intended label', () => {
    const text = '@diagram architecture\nteam group {\n api service as "API" label below offset 12\n}\n' +
      'other group {\n api service as "Other"\n}\n';
    expect(editSourceOwnedNodeLabelPlacement028(text, 'team.api', { side: 'left', offset: 4 }))
      .toBe(text.replace('label below offset 12', 'label left offset 4'));
    expect(() => editSourceOwnedNodeLabelPlacement028(text, 'api', { side: 'left', offset: 4 })).toThrow(/missing/);
  });

  it.each([
    ['missing', source, 'absent', { side: 'right', offset: 20 }],
    ['invalid source', source + 'api -> missing\n', 'api', { side: 'right', offset: 20 }],
    ['omitted label', source.replace(" as 'API'", ''), 'api', { side: 'right', offset: 20 }],
    ['empty label', source.replace("as 'API'", 'as ""'), 'api', { side: 'right', offset: 20 }],
    ['negative offset', source, 'api', { side: 'right', offset: -1 }],
    ['nonfinite offset', source, 'api', { side: 'right', offset: Infinity }],
    ['invalid side', source, 'api', { side: 'diagonal', offset: 4 }],
    ['unrepresentable center', source, 'api', { side: 'center', offset: 4 }],
    ['classifier heading', '@diagram uml-class\napi class as "API"\n', 'api', { side: 'right', offset: 4 }],
    ['sequence participant', '@diagram uml-sequence\napi participant as "API"\n', 'api', { side: 'right', offset: 4 }],
  ] as const)('refuses %s without changing the source', (_name, text, id, placement) => {
    expect(() => editSourceOwnedNodeLabelPlacement028(text, id, placement)).toThrow();
  });
});
