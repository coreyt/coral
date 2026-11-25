import { describe, expect, it } from 'vitest';
import { portAttachmentPolicy028 } from '../src/portAttachment028.js';
import type { ResolvedSemanticPort } from '../src/semanticPorts028.js';

const port = (anchor: ResolvedSemanticPort['anchor'], anchorWasExplicit = false): ResolvedSemanticPort => ({
  id: 'out', direction: 'out', anchor, anchorWasExplicit, origin: 'authored',
});

describe('0.2.8 semantic port attachment policy', () => {
  it('prefers a right-side output in left-to-right and bottom output in top-down layout', () => {
    expect(portAttachmentPolicy028(port('auto'), 'RIGHT', 'source')).toMatchObject({
      preferred: 'E', fixed: false,
    });
    expect(portAttachmentPolicy028(port('auto'), 'DOWN', 'source')).toMatchObject({
      preferred: 'S', fixed: false,
    });
    expect(portAttachmentPolicy028(port('auto'), 'RIGHT', 'target')).toMatchObject({
      preferred: 'W', fixed: false,
    });
  });

  it('keeps an exact authored anchor fixed across direction changes', () => {
    const pinned = port('N', true);
    expect(portAttachmentPolicy028(pinned, 'RIGHT', 'source')).toEqual({
      eligible: ['N'], preferred: 'N', fixed: true,
    });
    expect(portAttachmentPolicy028(pinned, 'DOWN', 'source').preferred).toBe('N');
  });

  it('constrains side and corner hints without turning them into hard pins', () => {
    const side = portAttachmentPolicy028(port('side', true), 'RIGHT', 'source');
    const corner = portAttachmentPolicy028(port('corner', true), 'RIGHT', 'source');
    expect(side).toEqual({ eligible: ['N', 'S', 'E', 'W'], preferred: 'E', fixed: false });
    expect(corner).toEqual({ eligible: ['NE', 'NW', 'SE', 'SW'], preferred: undefined, fixed: false });
    expect(portAttachmentPolicy028(port('auto', true), 'RIGHT', 'source').fixed).toBe(false);
  });

  it('rejects a named stencil anchor until its catalog geometry can be resolved', () => {
    const named = port({ kind: 'symbol', id: 'tip' } as unknown as ResolvedSemanticPort['anchor'], true);
    expect(() => portAttachmentPolicy028(named, 'RIGHT', 'source'))
      .toThrow(/coral\.port\.anchor\.unsupported/);
  });
});
