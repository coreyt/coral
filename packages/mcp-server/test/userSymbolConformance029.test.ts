import { describe, expect, it } from 'vitest';
import { handleConformanceCheck } from '../src/tools/conformance.js';

// Author decision 2026-10-30: a 0.2.9 document in which a node selects a
// `local.` symbol is not conformance-checked, and MCP says so explicitly.

const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""'];
/** A strict flowchart failure: the decision has one exit. */
const flowchart = (selects: boolean) => ['@diagram flowchart', '@coralVersion "0.2.9"', '@conformanceLevel strict',
  '@symbol gate {', '  name "Gate"', '  size 40 x 40', ...ARTWORK, '}',
  selects ? 'g process [symbol: "local.gate"]' : 'g process', 'd decision', 'b process', 'g -> d', 'd -> b', ''].join('\n');

describe('coral_check_conformance for user-symbol documents', () => {
  it.each([undefined, 'strict', 'typical'] as const)('reports not checked at requested level %s', async (level) => {
    const checked = await handleConformanceCheck({ content: flowchart(true), ...(level ? { level } : {}) });
    expect(checked.isError).toBeUndefined();
    expect(checked.content[0]!.text.split('\n')[0]).toBe('Conformance check: not checked: document uses user symbols');
    expect(checked.structuredContent).toMatchObject({ notChecked: { reason: 'user-symbols',
      message: 'not checked: document uses user symbols' } });
    expect(checked.structuredContent).not.toHaveProperty('conformance');
  });

  it('still checks a document whose definitions are only unused', async () => {
    const checked = await handleConformanceCheck({ content: flowchart(false) });
    expect(checked.isError).toBe(true);
    expect(checked.structuredContent).not.toHaveProperty('notChecked');
    expect(checked.content[0]!.text).toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
  });
});
