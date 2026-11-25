import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorController } from '../src/useEditorController';

// Author decision 2026-10-30: the editor reports a document that selects a
// user symbol as not conformance-checked.

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {},
    removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""'];
/** A strict flowchart failure (one decision exit). */
const flow = (selects: boolean) => ['@diagram flowchart', '@coralVersion "0.2.9"', '@conformanceLevel strict',
  '@symbol gate {', '  name "Gate"', '  size 40 x 40', ...ARTWORK, '}',
  selects ? 'g process [symbol: "local.gate"]' : 'g process', 'd decision', 'b process', 'g -> d', 'd -> b', ''].join('\n');

describe('editor conformance check of a user-symbol document', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  async function checked(text: string) {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name: 'flow.coral', text }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(text));
    act(() => result.current.editor.onCheckConformance?.('strict'));
    return result.current.editor;
  }

  it('reports not checked rather than an empty pass', async () => {
    const editor = await checked(flow(true));
    expect(editor.conformanceReport).toBeNull();
    expect(editor.conformanceNotChecked).toBe('not checked: document uses user symbols');
  });

  it('still checks a document whose definitions are only unused', async () => {
    const editor = await checked(flow(false));
    expect(editor.conformanceNotChecked).toBeUndefined();
    expect(editor.conformanceReport?.findings.map((finding) => finding.id))
      .toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
  });
});
