import { describe, expect, it } from 'vitest';
import { validateAiFormat } from '../../src/llm/aiFormatPolicy';

describe('Slice 47 AI format boundary', () => {
  it('retains every parser diagnostic alongside the short failure summary', () => {
    const result = validateAiFormat('@diagram architecture\napi service\ninvalid first!\ninvalid second!', 'coral');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.syntax.token.invalid', line: 3 }),
      expect.objectContaining({ code: 'coral.syntax.token.invalid', line: 4 }),
    ]));
  });
  it.each(['TD', 'TB', 'BT', 'LR', 'RL'])('accepts the closed Mermaid flowchart subset (%s)', (direction) => {
    expect(validateAiFormat([
      `flowchart ${direction}`,
      '%% comment',
      'api[API] -->|writes| db[(Database)] -.-> decision{Ready?}',
    ].join('\n'), 'mermaid')).toEqual({ ok: true });
  });

  it.each([
    'graph TD\nA[A] --> B[B]',
    'flowchart TD\nsubgraph x\nA[A]\nend',
    'flowchart TD\n%%{init: {}}%%\nA[A]',
    'flowchart TD\nA[<b>A</b>]',
    'flowchart TD\nclick A "https://example.com"',
    'flowchart TD\nclassDef danger fill:red',
    'flowchart TD\nA((Advanced)) --> B[B]',
    'flowchart TD\nA ==> B',
    'sequenceDiagram\nA->>B: hi',
    'flowchart TD\nα[alpha]',
  ])('rejects unsupported Mermaid AI syntax without conversion: %s', (source) => {
    expect(validateAiFormat(source, 'mermaid')).toMatchObject({ ok: false });
  });

  it('accepts valid Coral and rejects partial Coral publication', () => {
    expect(validateAiFormat('@diagram architecture\na service as "A"', 'coral')).toEqual({ ok: true });
    expect(validateAiFormat('@diagram architecture\na service\nnot valid yet', 'coral')).toMatchObject({ ok: false });
  });
});
