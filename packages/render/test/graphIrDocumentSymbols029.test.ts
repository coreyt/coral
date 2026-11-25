import { computeDocumentSymbolDigest } from '@graph-ir/core';
import { describe, expect, it } from 'vitest';
import { documentSymbolDefinition029 } from '../src/graphIrDocumentSymbols029.js';
import type { SuccessorUserSymbol029 } from '../src/successorSourceProjection028.js';

// The document-symbol digest hashes canonical admitted artwork, never the
// authored text (design "Semantic model and resolution" item 5).

const symbol = (text: string): SuccessorUserSymbol029 => ({ id: 'shield', symbolId: 'local.shield', name: 'Shield',
  tags: ['security'], size: { width: 24, height: 28 }, label: 'below', outline: 'rectangle', tint: 'none',
  anchors: [], ports: [], artwork: { format: 'svg', text } });
const HAND = "<?xml version='1.0'?>\r\n<svg viewBox=' 0,0 24 28' width='48' xmlns='http://www.w3.org/2000/svg'>" +
  '<!-- drawn by hand --><g fill="#2F6F4F"><path style="stroke:#000;stroke-width:1.50" d="M12,0 L24,4 z"/></g></svg>';
const SAME = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">\n  <g>\n' +
  '    <path d="M 12 0 L 24 4 z" fill="#2f6f4f" stroke="#000000" stroke-width="1.5" opacity="1"/>\n  </g>\n</svg>\n';

describe('user-symbol digest over canonical artwork', () => {
  it('gives two spellings of one artwork the same definition and core digest', () => {
    const hand = documentSymbolDefinition029(symbol(HAND));
    expect(hand).toEqual(documentSymbolDefinition029(symbol(SAME)));
    expect(hand.artwork).toEqual({ mediaType: 'image/svg+xml', profile: { id: 'coral.svg-artwork', version: '1' },
      text: SAME });
    const { digest, ...input } = hand;
    expect(computeDocumentSymbolDigest(input)).toMatchObject({ ok: true, digest });
    const authored = computeDocumentSymbolDigest({ ...input, artwork: { ...input.artwork, text: HAND } });
    expect(authored.ok && authored.digest !== digest).toBe(true);
  });

  it('changes the digest when the canonical artwork changes', () => {
    expect(documentSymbolDefinition029(symbol(SAME)).digest)
      .not.toBe(documentSymbolDefinition029(symbol(SAME.replace('#2f6f4f', '#2f6f50'))).digest);
  });
});
