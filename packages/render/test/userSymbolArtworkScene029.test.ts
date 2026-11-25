import { describe, expect, it } from 'vitest';
import { documentCatalog029 } from '../src/documentCatalog029.js';
import { RenderCapabilityError } from '../src/scene.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028, renderSvg } from '../src/svg/serialize.js';
import { stableSvgId } from '../src/scene.js';

// C4 scene artwork part and SVG serializer output (c4-design.md "Scene
// artwork part", "SVG serializer", "Themes and tint", "Performance").

type Kind = 'rectangle' | 'rounded' | 'ellipse' | 'diamond';
const definition = (id: string, kind: Kind, extra: string[] = [], fill = '#2f6f4f') => [`@symbol ${id} {`,
  `  name "${id}"`, '  size 60 x 40', '  label center', `  outline ${kind}`, ...extra, '  artwork svg """',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="${fill}" stroke="#123456"/></svg>`,
  '"""', '}'];
const source = (definitions: string[], body: string[]) =>
  ['@diagram architecture', '@coralVersion "0.2.9"', '', ...definitions, '', ...body, ''].join('\n');

async function prepare(text: string, options: { theme?: 'light' | 'dark'; style?: 'lowfi' | 'hifi' } = {}) {
  const graph = projectInstalledSourceToSuccessor028(text).graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
  const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
  const svgOptions = { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT' as const,
    semanticGraph: display, successorSource: graph, ...options };
  return { graph, laidOut, svgOptions, prepared: prepareSpatialScene028(laidOut, svgOptions),
    svg: renderSvg(laidOut, svgOptions) };
}

describe.each(['rectangle', 'rounded', 'ellipse', 'diamond'] as const)('the artwork part of a %s user symbol', (kind) => {
  it('replaces the outline part with one artwork part at the frame', async () => {
    const { prepared } = await prepare(source(definition('probe', kind), ['a service [symbol: "local.probe"]', 'b service', 'a -> b']));
    const node = prepared.resolved.nodes.find((item) => item.id === 'a')!;
    const owned = prepared.parts.filter((part) => part.owner.kind === 'node' && part.owner.id === 'a');
    expect(owned.some((part) => part.role === 'outline' || part.geometry.kind === 'stencil-path')).toBe(false);
    const artwork = owned.filter((part) => part.role === 'artwork');
    expect(artwork).toHaveLength(1);
    const frame = { x: node.x + prepared.viewport.shiftX, y: node.y + prepared.viewport.shiftY, width: 60, height: 40 };
    expect(artwork[0]).toMatchObject({ id: 'a:artwork', bounds: frame, presentationOnly: false,
      geometry: { kind: 'artwork', symbolId: 'local.probe', localId: 'probe', frame } });
    expect(artwork[0]!.geometry).not.toHaveProperty('tint');
    expect(owned[0]!.role).toBe('artwork');
    expect(prepared.artwork029?.map((entry) => [entry.localId, entry.tint, entry.outline.outline]))
      .toEqual([['probe', 'none', kind]]);
  });
});

describe('SVG output of user-symbol artwork', () => {
  const twoInstances = source([...definition('probe', 'ellipse'), ...definition('unused', 'rectangle')],
    ['a service [symbol: "local.probe"]', 'c service [symbol: "local.probe"]', 'b service', 'a -> b', 'c -> b']);

  it('writes one symbol per used definition and one use per instance', async () => {
    const { svg, prepared } = await prepare(twoInstances);
    const scope = stableSvgId('coral-instance', 'standalone');
    expect(svg.match(/<symbol /g)).toHaveLength(1);
    expect(svg).toContain(`<symbol id="${scope}-coral-sym-probe"`);
    expect(svg).not.toContain('coral-sym-unused');
    expect(svg.match(new RegExp(`<use href="#${scope}-coral-sym-probe"`, 'g'))).toHaveLength(2);
    expect(svg).toContain(`<clipPath id="${scope}-coral-sym-probe-outline"`);
    expect(svg).toMatch(new RegExp(`<g data-coral-part-id="a:artwork" data-coral-artwork="local.probe"><use href="#${scope}-coral-sym-probe" [^>]*aria-hidden="true"/></g>`));
    expect(prepared.artwork029?.map((entry) => entry.localId)).toEqual(['probe']);
    // The symbol definition sits in <defs>, after the markers.
    const defs = svg.slice(svg.indexOf('<defs>'), svg.indexOf('</defs>'));
    expect(defs).toContain('<symbol ');
    // No interim outline: the outline is never painted.
    expect(svg).not.toMatch(/data-coral-part-id="a:outline/);
  });

  it('lists used definitions sorted by local ID', async () => {
    const { prepared } = await prepare(source([...definition('zeta', 'diamond'), ...definition('alpha', 'rounded')],
      ['z service [symbol: "local.zeta"]', 'y service [symbol: "local.alpha"]', 'z -> y']));
    expect(prepared.artwork029?.map((entry) => entry.localId)).toEqual(['alpha', 'zeta']);
  });

  it('leaves documents without user symbols free of artwork output', async () => {
    const { svg, prepared } = await prepare(['@diagram architecture', 'a service', 'b service', 'a -> b', ''].join('\n'));
    expect(prepared).not.toHaveProperty('artwork029');
    expect(svg).not.toContain('coral-sym');
    expect(svg).not.toContain('data-coral-artwork');
  });

  it('changes the scene revision when only the artwork changes', async () => {
    const body = ['a service [symbol: "local.probe"]'];
    const first = await prepare(source(definition('probe', 'ellipse'), body));
    const second = await prepare(source(definition('probe', 'ellipse', [], '#7a2f4f'), body));
    // Same graph and catalog geometry without the successor: only artwork differs.
    const strip = (value: Awaited<ReturnType<typeof prepare>>) => prepareSpatialScene028(value.laidOut,
      { edgeRoutes: value.laidOut.edgeRoutes, layoutDirection: 'RIGHT',
        documentCatalog029: documentCatalog029('architecture', value.graph.userSymbols029!) });
    expect(strip(first).revision).not.toBe(strip(second).revision);
  });

  it('refuses to draw a user symbol whose catalog carries no artwork', async () => {
    const { laidOut, graph } = await prepare(source(definition('probe', 'ellipse'), ['a service [symbol: "local.probe"]']));
    const bare = graph.userSymbols029!.map(({ artwork: _artwork, ...rest }) => rest);
    const catalog = documentCatalog029('architecture', bare);
    let error: unknown;
    try { renderSvg(laidOut, { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT', documentCatalog029: catalog }); }
    catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(RenderCapabilityError);
    expect((error as RenderCapabilityError).diagnostics[0]).toMatchObject({ code: 'render.capability.stencil',
      subject: { kind: 'node', id: 'a' } });
  });

  it('keeps 200 instances to one definition, growing no faster than bundled nodes', async () => {
    const nodes = (count: number, symbol: string) => Array.from({ length: count }, (_, index) => `n${index} service${symbol}`);
    const growth = async (symbol: string) => {
      const ten = await prepare(source(definition('probe', 'ellipse'), nodes(10, symbol)));
      const many = await prepare(source(definition('probe', 'ellipse'), nodes(200, symbol)));
      return { many, perInstance: (many.svg.length - ten.svg.length) / 190 };
    };
    const user = await growth(' [symbol: "local.probe"]');
    const bundled = await growth('');
    expect(user.many.svg.match(/<symbol /g)).toHaveLength(1);
    expect(user.many.svg.match(/<use /g)).toHaveLength(200);
    // The artwork primitive is written once, not per instance.
    expect(user.many.svg.match(/<path d="M 0 0 L 24 0 L 24 16 Z"/g)).toHaveLength(1);
    expect(user.perInstance).toBeLessThanOrEqual(bundled.perInstance + 150);
  }, 60_000);
});

describe('themes and tint', () => {
  const tinted = source(definition('probe', 'ellipse', ['  tint stroke']), ['a service [symbol: "local.probe"]']);

  it('keeps explicit artwork colours in a dark theme', async () => {
    const { svg } = await prepare(source(definition('probe', 'ellipse'), ['a service [symbol: "local.probe"]']), { theme: 'dark' });
    expect(svg).toContain('fill="#2f6f4f"');
    expect(svg).toContain('stroke="#123456"');
  });

  it('tints strokes with the theme ink in both themes and never tints fills', async () => {
    for (const [theme, ink] of [['light', '#363430'], ['dark', '#f1f5f9']] as const) {
      const { svg, prepared } = await prepare(tinted, { theme });
      const part = prepared.parts.find((item) => item.role === 'artwork')!;
      expect(part.geometry).toMatchObject({ kind: 'artwork', tint: ink });
      expect(svg).toMatch(new RegExp(`<use [^>]*color="${ink}"/>`));
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).not.toContain('stroke="#123456"');
      expect(svg).toContain('fill="#2f6f4f"');
    }
  });

});
