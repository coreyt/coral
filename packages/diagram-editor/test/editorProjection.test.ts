import { describe, expect, it } from 'vitest';
import { canonicalPortId, requireSourcePortRoutes028 } from '../src/editorProjection';

describe('0.2.8 source-port export routes', () => {
  it('normalizes directional view handles to the authored semantic port ID', () => {
    expect(canonicalPortId('shared-out')).toBe('shared');
    expect(canonicalPortId('shared-in')).toBe('shared');
    expect(canonicalPortId('query')).toBe('query');
  });
  const firstPort = { edges: [{ id: 'read', first: { node: 'api', port: 'out' },
    second: { node: 'store' }, direction: 'first-to-second' as const }] };
  const secondPort = { edges: [{ id: 'read', first: { node: 'api' },
    second: { node: 'store', port: 'query' }, direction: 'first-to-second' as const }] };

  it.each([firstPort, secondPort])('refuses to export a referenced port without a verified route', (source) => {
    expect(() => requireSourcePortRoutes028(source, new Map())).toThrow(
      'render.capability.semantic-port-route: edge read has no verified export route',
    );
    expect(() => requireSourcePortRoutes028(source, new Map([['read',
      { sourceId: 'api', targetId: 'store', sourcePortId: 'out', targetPortId: 'query' }]])))
      .not.toThrow();
  });

  it('refuses a route borrowed from a different endpoint pair under the same edge ID', () => {
    expect(() => requireSourcePortRoutes028(firstPort, new Map([['read',
      { sourceId: 'api', targetId: 'other' }]]))).toThrow(
      'render.capability.semantic-port-route-identity: edge read route endpoints do not match Coral source',
    );
  });

  it('refuses a route for the same nodes but a different or missing authored port', () => {
    expect(() => requireSourcePortRoutes028(firstPort, new Map([['read',
      { sourceId: 'api', targetId: 'store', sourcePortId: 'other' }]]))).toThrow(
      'render.capability.semantic-port-route-identity: edge read route ports do not match Coral source',
    );
    expect(() => requireSourcePortRoutes028(secondPort, new Map([['read',
      { sourceId: 'api', targetId: 'store' }]]))).toThrow(
      'render.capability.semantic-port-route-identity: edge read route ports do not match Coral source',
    );
  });

  it('does not require a route for a connector without an authored port reference', () => {
    expect(() => requireSourcePortRoutes028({ edges: [{ id: 'read', first: { node: 'api' },
      second: { node: 'store' }, direction: 'first-to-second' }] }, new Map())).not.toThrow();
  });
});
