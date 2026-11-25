import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { SymbolNode } from '../src/components/SymbolNode';
import { EditProvider } from '../src/components/EditContext';
import { CORAL_NODE_VIEW_METADATA } from '../src/types';
import { checkGraphConformance028, glyphRegistry, notationRegistry, renderSvg, resolveFont,
  shapeRegistry, symbolRegistry, visualContour028, type GraphNode } from '@coral-viz/render';

/** SymbolNode's rendering branches - R-030 coverage. */

function renderNode(data: Record<string, unknown>, selected = false, onLabelEdit = vi.fn()) {
  return render(
    <ReactFlowProvider>
      <EditProvider onLabelEdit={onLabelEdit}>
        <SymbolNode id="n1" data={data as any} selected={selected} />
      </EditProvider>
    </ReactFlowProvider>
  );
}

const svgOutline = (svg: string): string | null | undefined => new DOMParser()
  .parseFromString(svg, 'image/svg+xml')
  .querySelector('[data-coral-part-id="n1:outline"]')?.getAttribute('d');

describe('SymbolNode variants', () => {
  it('renders a known symbol', () => {
    const { container } = renderNode({ label: 'Process', symbolId: 'flowchart-process' });
    expect(container.textContent).toContain('Process');
  });

  it('falls back when the symbol is unknown', () => {
    const { container } = renderNode({ label: 'Mystery', symbolId: 'no-such-symbol' });
    expect(container.textContent).toContain('Mystery');
  });

  it('shows an unresolved authored symbol without substituting a profiled rectangle or ports', () => {
    const { container } = renderNode({ label: 'Mystery', nodeType: 'service',
      notationId: 'architecture', canonical: { symbol: 'no-such-symbol' } });
    expect(container.querySelector('[data-coral-unresolved-symbol]')?.textContent)
      .toContain('no-such-symbol');
    expect(container.querySelector('[data-coral-unresolved-symbol]')?.textContent)
      .toContain('Mystery');
    expect(container.querySelector('path')).toBeNull();
    expect(container.querySelectorAll('[data-handleid]')).toHaveLength(0);
  });

  it('shows an unresolved variant rather than drawing the base symbol', () => {
    const { container } = renderNode({ label: 'API', nodeType: 'service',
      notationId: 'architecture', canonical: { symbol: 'arch-service' },
      variant: 'missing-variant' });
    expect(container.querySelector('[data-coral-unresolved-symbol]')?.textContent)
      .toContain('missing-variant');
    expect(container.querySelector('path')).toBeNull();
  });

  it('keeps a known explicit foreign-profile symbol visible for conformance review', () => {
    const { container } = renderNode({ label: 'Process', nodeType: 'service',
      notationId: 'architecture', canonical: { symbol: 'flowchart-process' } });
    expect(container.querySelector('[data-coral-unresolved-symbol]')).toBeNull();
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('renders with no symbol at all', () => {
    const { container } = renderNode({ label: 'Bare' });
    expect(container.textContent).toContain('Bare');
  });

  it('does not invent semantic in/out handles for an unmapped profiled node', () => {
    const { container } = renderNode({ label: 'Service', nodeType: 'service',
      notationId: 'flowchart', canonical: {} });
    expect(container.querySelectorAll('.react-flow__handle[data-handleid]:not(.coral-edge-anchor)'))
      .toHaveLength(0);
    expect(container.querySelectorAll('.coral-portless-handle')).toHaveLength(2);
  });

  it('honours explicit dimensions', () => {
    const { container } = renderNode({ label: 'Sized', symbolId: 'flowchart-process', width: 300, height: 150 });
    expect(container.innerHTML).toMatch(/300|150/);
  });

  it('honours style overrides', () => {
    const { container } = renderNode({
      label: 'Styled',
      symbolId: 'flowchart-process',
      fill: '#ff0000',
      stroke: '#00ff00',
      strokeWidth: 4,
    });
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill')).toBe('#ff0000');
    expect(path?.getAttribute('stroke')).toBe('#00ff00');
  });

  it('preserves a zero authored stroke width', () => {
    const { container } = renderNode({
      label: 'No outline', symbolId: 'flowchart-process', strokeWidth: 0,
    });
    expect(container.querySelector('path')?.getAttribute('stroke-width')).toBe('0');
  });

  it('renders sketch mode', () => {
    const { container } = renderNode({ label: 'Sketchy', symbolId: 'flowchart-process', sketch: true });
    expect(container.textContent).toContain('Sketchy');
  });

  it('shows a selected outline', () => {
    const { container } = renderNode({ label: 'Picked', symbolId: 'flowchart-process' }, true);
    expect(container.innerHTML).toMatch(/0066ff|rgb\(0, 102, 255\)/);
  });

  it('renders a symbol variant', () => {
    const { container } = renderNode({
      label: 'Start',
      symbolId: 'flowchart-terminator',
      variant: 'start',
    });
    expect(container.textContent).toContain('Start');
  });

  it('renders a catalog glyph with an accessible meaning', () => {
    const { container } = renderNode({
      label: 'Web', nodeType: 'service', symbolId: 'arch-service', variant: 'web',
    });
    const glyph = container.querySelector('svg[role="img"]');
    expect(glyph?.getAttribute('aria-label')).toBe('Web globe');
    expect(glyph?.querySelector('path')).not.toBeNull();
  });

  it('renders a canonical variant when the flattened canvas variant is absent', () => {
    const { container } = renderNode({ label: 'Web', nodeType: 'service',
      symbolId: 'arch-service', notationId: 'architecture',
      canonical: { symbol: 'arch-service', variant: 'web' } });
    expect(container.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe('Web globe');
    expect(container.querySelector('[data-coral-unresolved-symbol]')).toBeNull();
  });

  it('keeps inherited and staged authored semantic ports as distinct canvas handles', () => {
    const { container } = renderNode({ label: 'API', nodeType: 'service',
      notationId: 'architecture', canonical: { symbol: 'arch-service' },
      authoredSemanticPorts: [{ id: 'audit', label: 'Audit events', direction: 'out', anchor: 'side' }] });
    expect(container.querySelector('[data-handleid="out"]')).not.toBeNull();
    expect(container.querySelector('[data-handleid="audit"]')?.getAttribute('aria-label'))
      .toContain('Audit events');
  });

  it('keeps inherited handles when the staged authored semantic list is empty', () => {
    const { container } = renderNode({ label: 'API', nodeType: 'service',
      notationId: 'architecture', canonical: { symbol: 'arch-service' },
      authoredSemanticPorts: [] });
    expect(container.querySelector('[data-handleid="out"]')).not.toBeNull();
    expect(container.querySelector('[data-handleid="in"]')).not.toBeNull();
  });

  it('places an unpinned authored output according to the view layout direction', () => {
    const authoredSemanticPorts = [{ id: 'audit', direction: 'out', anchor: 'auto' }];
    const right = renderNode({ label: 'API', nodeType: 'service', notationId: 'architecture',
      canonical: { symbol: 'arch-service' }, authoredSemanticPorts, layoutDirection: 'RIGHT' });
    const down = renderNode({ label: 'API', nodeType: 'service', notationId: 'architecture',
      canonical: { symbol: 'arch-service' }, authoredSemanticPorts, layoutDirection: 'DOWN' });
    expect(right.container.querySelector('[data-handleid="audit"]')?.className).toContain('react-flow__handle-right');
    expect(down.container.querySelector('[data-handleid="audit"]')?.className).toContain('react-flow__handle-bottom');
  });

  it('shows an exact authored diamond pin on the contour, matching layout and SVG geometry', () => {
    const { container } = renderNode({ label: 'Decision', nodeType: 'decision', notationId: 'flowchart',
      canonical: { symbol: 'flowchart-decision' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'NE' }] });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(handle?.style.left).toBe('75%');
    expect(handle?.style.top).toBe('25%');
  });

  it('shows a catalog-named pin on the diamond contour without a bounding-box handle', () => {
    const installed = symbolRegistry.get('flowchart-decision')!;
    const withAnchor = { ...installed,
      namedAnchors: [{ id: 'reviewRim', side: 'EAST' as const, position: 0.25 }],
      variants: { ...installed.variants, noAnchors: { name: 'No anchors', namedAnchors: [] } } };
    const originalNotationGet = notationRegistry.get.bind(notationRegistry);
    const originalSymbolGet = symbolRegistry.get.bind(symbolRegistry);
    const originalSymbols = symbolRegistry.getAll.bind(symbolRegistry);
    vi.spyOn(notationRegistry, 'get').mockImplementation((id) => id === 'named-anchor-fixture'
      ? { id, name: 'Named anchor fixture', version: '1', symbols: [withAnchor.id],
        defaultEdgeStyle: 'flow', connectionRules: [] } : originalNotationGet(id));
    vi.spyOn(symbolRegistry, 'get').mockImplementation((id) => id === withAnchor.id
      ? withAnchor : originalSymbolGet(id));
    vi.spyOn(symbolRegistry, 'getAll').mockImplementation(() => originalSymbols().map((candidate) =>
      candidate.id === withAnchor.id ? withAnchor : candidate));
    try {
      const { container } = renderNode({ label: 'Decision', nodeType: 'decision',
        notationId: 'named-anchor-fixture', canonical: { symbol: withAnchor.id },
        authoredSemanticPorts: [{ id: 'audit', direction: 'out',
          anchor: { kind: 'symbol', id: 'reviewRim' } }] });
      const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
      expect(handle).not.toBeNull();
      expect(parseFloat(handle!.style.left)).toBeCloseTo(100 * 5 / 6);
      expect(parseFloat(handle!.style.top)).toBeCloseTo(100 / 3);
      expect(container.querySelector('[data-coral-port-conflict]')).toBeNull();
      const removed = renderNode({ label: 'Decision', nodeType: 'decision',
        notationId: 'named-anchor-fixture', canonical: { symbol: withAnchor.id }, variant: 'noAnchors',
        authoredSemanticPorts: [{ id: 'audit', direction: 'out',
          anchor: { kind: 'symbol', id: 'reviewRim' } }] });
      expect(removed.container.querySelector('[data-handleid="audit"]')).toBeNull();
      expect(removed.container.querySelector('[data-coral-port-attachment-unavailable]')?.getAttribute('title'))
        .toContain('Exact stencil anchor geometry is unavailable');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('keeps an exact pin on the visible contour when the canvas fits a stencil into a wide node', () => {
    const { container } = renderNode({ label: 'Decision', nodeType: 'decision', notationId: 'flowchart',
      canonical: { symbol: 'flowchart-decision' }, width: 200, height: 100,
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'NE' }] });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(handle?.style.left).toBe('62.5%');
    expect(handle?.style.top).toBe('25%');
  });

  it('places an exact authored pin on a curved document outline', () => {
    const { container } = renderNode({ label: 'Document', nodeType: 'document', notationId: 'flowchart',
      canonical: { symbol: 'flowchart-document' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'SE' }] });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(parseFloat(handle!.style.left)).toBeLessThan(100);
    expect(parseFloat(handle!.style.top)).toBeGreaterThan(50);
  });

  it('places an exact authored actor side pin at the visible arm rather than its torso', () => {
    const { container } = renderNode({ label: 'User', nodeType: 'actor', notationId: 'architecture',
      canonical: { symbol: 'arch-actor' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'E' }] });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(parseFloat(handle!.style.left)).toBeGreaterThan(70);
    expect(parseFloat(handle!.style.left)).toBeLessThan(90);
    const drawing = container.querySelector('svg')!;
    const [vx, vy, vw, vh] = drawing.getAttribute('viewBox')!.split(' ').map(Number);
    const width = Number(drawing.getAttribute('width'));
    const height = Number(drawing.getAttribute('height'));
    const groupTransform = drawing.querySelector('g[transform]')?.getAttribute('transform');
    const transformMatch = groupTransform?.match(/translate\(([-0-9.]+)\s+([-0-9.]+)\)\s+scale\(([-0-9.]+)\)/);
    // The actor's visible right arm ends at (50, 35) in its authored path.
    // Read the drawing frame independently of the port geometry implementation.
    const visibleArm = transformMatch
      ? {
        x: Number(transformMatch[1]) + 50 * Number(transformMatch[3]),
        y: Number(transformMatch[2]) + 35 * Number(transformMatch[3]),
      }
      : (() => {
        const scale = Math.min(width / vw!, height / vh!);
        return {
          x: (50 - vx!) * scale + (width - vw! * scale) / 2,
          y: (35 - vy!) * scale + (height - vh! * scale) / 2,
        };
      })();
    expect(parseFloat(handle!.style.left) * width / 100).toBeCloseTo(visibleArm.x);
    expect(parseFloat(handle!.style.top) * height / 100).toBeCloseTo(visibleArm.y);
  });

  it('places a diagonal pin on a rounded rectangle curve rather than its absent sharp corner', () => {
    const { container } = renderNode({ label: 'API', nodeType: 'service', notationId: 'architecture',
      canonical: { symbol: 'arch-service' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'NE' }] });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(handle).not.toBeNull();
    expect(parseFloat(handle!.style.left)).toBeLessThan(100);
    expect(parseFloat(handle!.style.top)).toBeGreaterThan(0);
  });

  it('does not publish handles for a duplicate or legacy-overriding semantic port', () => {
    for (const data of [
      { authoredSemanticPorts: [{ id: 'out', direction: 'in' }] },
      { authoredSemanticPorts: [{ id: 'audit', direction: 'out' }],
        canonical: { symbol: 'arch-service', ports: [{ id: 'legacy', side: 'EAST' }] } },
    ]) {
      const { container, unmount } = renderNode({ label: 'API', nodeType: 'service',
        notationId: 'architecture', canonical: { symbol: 'arch-service' }, ...data });
      expect(container.querySelector('[data-coral-port-conflict]')).not.toBeNull();
      expect(container.querySelector('path')).not.toBeNull();
      expect(container.querySelectorAll('[data-handleid]')).toHaveLength(0);
      unmount();
    }
  });

  it('does not guess staged semantic handles when the canvas lacks a profile', () => {
    const { container } = renderNode({ label: 'API', nodeType: 'service', symbolId: 'arch-service',
      authoredSemanticPorts: [{ id: 'audit', direction: 'out' }] });
    expect(container.querySelector('path')).not.toBeNull();
    expect(container.querySelector('[data-coral-port-conflict]')?.getAttribute('title'))
      .toContain('Profile required');
    expect(container.querySelectorAll('[data-handleid]')).toHaveLength(0);
  });

  it('requires derived corner geometry rather than drawing a corner hint at side center', () => {
    const base = { label: 'API', nodeType: 'service', notationId: 'architecture',
      canonical: { symbol: 'arch-service' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'corner' }] };
    const pending = renderNode(base);
    expect(pending.container.querySelector('path')).not.toBeNull();
    expect(pending.container.querySelector('[data-coral-port-attachment-unavailable]')?.getAttribute('title'))
      .toContain('corner');
    expect(pending.container.querySelectorAll('[data-handleid]')).toHaveLength(0);
    pending.unmount();
    const derived = renderNode({ ...base, resolvedPortAttachments: { audit: 'EAST' },
      resolvedPortPositions: { audit: 0 } });
    expect(derived.container.querySelector('[data-handleid="audit"]')?.className)
      .toContain('react-flow__handle-right');
  });

  it('puts a resolved free diamond corner hint on the diamond outline', () => {
    const { container } = renderNode({ label: 'Decision', nodeType: 'decision', notationId: 'flowchart',
      canonical: { symbol: 'flowchart-decision' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'corner' }],
      resolvedPortAttachments: { audit: 'EAST' }, resolvedPortPositions: { audit: 0 } });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(handle?.style.left).toBe('75%');
    expect(handle?.style.top).toBe('25%');
  });

  it('places a connected port handle at its scene route contact', () => {
    const { container } = renderNode({ label: 'Decision', nodeType: 'decision', notationId: 'flowchart',
      canonical: { symbol: 'flowchart-decision' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'side' }],
      resolvedPortAttachments: { audit: 'EAST' }, resolvedPortPositions: { audit: 0.25 },
      sceneOrigin028: { x: 100, y: 80, width: 150, height: 100 },
      scenePortContacts028: { audit: { x: 230, y: 115 } } });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(handle?.style.left).toBe('130px');
    expect(handle?.style.top).toBe('35px');
  });

  it('puts a resolved free side hint on a diamond contour away from its bounding edge', () => {
    const { container } = renderNode({ label: 'Decision', nodeType: 'decision', notationId: 'flowchart',
      canonical: { symbol: 'flowchart-decision' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'side' }],
      resolvedPortAttachments: { audit: 'EAST' }, resolvedPortPositions: { audit: 0.25 } });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(parseFloat(handle!.style.left)).toBeCloseTo(100 * 5 / 6);
    expect(parseFloat(handle!.style.top)).toBeCloseTo(100 / 3);
  });

  it('places a resolved free corner hint on a curved document contour', () => {
    const { container } = renderNode({ label: 'Document', nodeType: 'document', notationId: 'flowchart',
      canonical: { symbol: 'flowchart-document' },
      authoredSemanticPorts: [{ id: 'audit', direction: 'out', anchor: 'corner' }],
      resolvedPortAttachments: { audit: 'EAST' }, resolvedPortPositions: { audit: 1 } });
    const handle = container.querySelector<HTMLElement>('[data-handleid="audit"]');
    expect(parseFloat(handle!.style.left)).toBeLessThan(100);
    expect(parseFloat(handle!.style.top)).toBeGreaterThan(50);
  });

  it('does not render a base glyph for an unknown canonical variant', () => {
    const { container } = renderNode({ label: 'Web', nodeType: 'service',
      symbolId: 'arch-service', notationId: 'architecture',
      canonical: { symbol: 'arch-service', variant: 'not-a-variant' } });
    expect(container.querySelector('[data-coral-unresolved-symbol]')?.textContent)
      .toContain('not-a-variant');
    expect(container.querySelector('svg[role="img"]')).toBeNull();
  });

  it.each(glyphRegistry.getAll().map((glyph) => [glyph.id, glyph.name]))(
    'renders the %s glyph as an accessible image named %s', (token, name) => {
      const [symbolId, variant] = symbolRegistry.getAll().flatMap((symbol) =>
        Object.entries(symbol.variants ?? {}).flatMap(([id, value]) =>
          value.icon === token ? [[symbol.id, id]] : []))[0]!;
      const { container } = renderNode({ label: 'N', symbolId, variant });
      const glyphs = container.querySelectorAll('svg[role="img"]');
      expect(glyphs).toHaveLength(1);
      expect(glyphs[0]?.getAttribute('aria-label')).toBe(name);
    });

  it('renders the BPMN event marker as pentagon geometry, not text', () => {
    const { container } = renderNode({
      label: 'Event gateway', nodeType: 'gateway', symbolId: 'bpmn-gateway-event',
    });
    const marker = container.querySelector('[data-coral-symbol-marker="pentagon"]');
    expect(marker?.querySelector('path')?.getAttribute('d')).toContain('L14 6.5');
    expect(marker?.textContent).not.toContain('pentagon');
  });

  it.each([
    ['bpmn-gateway-exclusive', 'X', 'Exclusive gateway marker'],
    ['bpmn-gateway-parallel', '+', 'Parallel gateway marker'],
    ['bpmn-gateway-inclusive', 'O', 'Inclusive gateway marker'],
    ['bpmn-gateway-event', 'pentagon', 'Event-based gateway marker'],
  ])('renders the %s marker %s as an accessible image named %s', (symbolId, marker, name) => {
    const { container } = renderNode({ label: 'Gateway', nodeType: 'gateway', symbolId });
    const image = container.querySelector(`[data-coral-symbol-marker="${marker}"]`);
    expect(image?.getAttribute('role')).toBe('img');
    expect(image?.getAttribute('aria-label')).toBe(name);
    expect(image?.querySelector('title')?.textContent).toBe(name);
  });

  it.each([
    ['code-class', 'abstract', 'fontStyle', 'italic'],
    ['code-variable', 'static', 'textDecoration', 'underline'],
  ] as const)('styles the displayed %s/%s label with %s %s', (symbolId, variant, property, value) => {
    const { container } = renderNode({ label: 'Styled', symbolId, variant });
    const label = container.querySelector('[data-coral-node-label]') as HTMLElement;
    expect(label.style[property]).toBe(value);
  });

  describe('catalog double outline', () => {
    afterEach(() => { vi.restoreAllMocks(); });
    it('draws the inset second outline', () => {
      const original = symbolRegistry.get;
      vi.spyOn(symbolRegistry, 'get').mockImplementation((id) => id === 'synthetic-double'
        ? { id, name: 'Double', shape: 'rectangle', tags: [], defaults: { doubleOutline: true } } : original(id));
      const { container } = renderNode({ label: 'Double', symbolId: 'synthetic-double' });
      const outlines = container.querySelector('svg')!.querySelectorAll(
        '[data-coral-part-id="n1:outline"], [data-coral-part-id="n1:inner-outline"]');
      expect(outlines).toHaveLength(2);
      expect(outlines[1]?.getAttribute('fill')).toBe('none');
      expect(outlines[1]?.getAttribute('transform')).toBe('translate(2 2) scale(0.96 0.9333)');
    });
  });

  it('enters inline edit on double click and commits on Enter', () => {
    const onLabelEdit = vi.fn();
    const { container } = renderNode({ label: 'Editable', symbolId: 'flowchart-process' }, false, onLabelEdit);

    fireEvent.doubleClick(container.querySelector('[role="group"]')!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onLabelEdit).toHaveBeenCalledWith('n1', 'Renamed');
  });

  it('abandons an inline edit on Escape', () => {
    const onLabelEdit = vi.fn();
    const { container } = renderNode({ label: 'Editable', symbolId: 'flowchart-process' }, false, onLabelEdit);

    fireEvent.doubleClick(container.querySelector('[role="group"]')!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onLabelEdit).not.toHaveBeenCalled();
  });

  it('renders deterministic font lines and applies the same font to inline editing', () => {
    const font = resolveFont({
      family: 'serif', size: 18, weight: 'bold', lineHeight: 1.5,
    });
    const data = {
      label: 'Alpha Beta',
      symbolId: 'flowchart-process',
      width: 180,
      height: 90,
      [CORAL_NODE_VIEW_METADATA]: {
        dimensionSource: 'editor-font',
        font,
        lines: ['Alpha', 'Beta'],
        lineHeightPx: 27,
      },
    };
    const { container } = renderNode(data);
    const lines = container.querySelectorAll('[data-coral-label-line]');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe('Alpha Beta');
    const label = container.querySelector('[data-coral-node-label]') as HTMLElement;
    expect(label.style.fontFamily).toBe('"Coral Source Serif 4"');
    expect(label.style.fontSize).toBe('18px');
    expect(label.style.fontWeight).toBe('700');
    expect(label.style.whiteSpace).toBe('nowrap');
    expect(label.style.width).toBe('100%');
    expect(lines[0]?.getAttribute('data-coral-part-id')).toBe('n1:label:1');

    fireEvent.doubleClick(container.querySelector('[role="group"]')!);
    const input = screen.getByRole('textbox');
    expect(input.style.fontFamily).toBe('"Coral Source Serif 4"');
    expect(input.style.fontSize).toBe('18px');
    expect(input.style.fontWeight).toBe('700');
    expect(input.style.lineHeight).toBe('1.5');
    expect(input.classList).toContain('coral-font-text');
  });

  it('does not interpret colliding legacy string metadata', () => {
    const { container } = renderNode({
      label: 'Legacy',
      symbolId: 'flowchart-process',
      font: resolveFont({ family: 'serif', size: 24, weight: 'bold', lineHeight: 2 }),
      lines: ['Wrong', 'Lines'],
      lineHeightPx: 48,
    });
    expect(container.querySelectorAll('[data-coral-label-line]')).toHaveLength(1);
    expect(container.querySelector('[data-coral-label-line]')?.textContent).toBe('Legacy');
    expect(container.textContent).toContain('Legacy');
  });

  it('renders a long label without failing', () => {
    const fullLabel = 'A very long label that will certainly need wrapping across lines';
    const { container } = renderNode({
      label: fullLabel,
      symbolId: 'flowchart-process',
    });
    const label = container.querySelector('[data-coral-node-label]') as HTMLElement;
    expect(label.title).toBe(fullLabel);
    expect(label.style.maxHeight).toBe('100%');
    expect(label.style.overflow).toBe('visible');
    expect(container.querySelector('svg')?.getAttribute('width')).not.toBe('120');
  });

  it.each([['idle'], ['compatible'], ['incompatible']])('renders the %s drag state', (dragState) => {
    const { container } = renderNode({ label: 'Drag', symbolId: 'flowchart-process', dragState });
    expect(container.querySelectorAll('.react-flow__handle').length).toBeGreaterThan(0);
  });
});

describe('SymbolNode and SVG profile-scoped symbol parity', () => {
  it('keeps the character-only state profile outside SVG rendering', () => {
    expect(notationRegistry.get('uml-state')).toBeDefined();
    expect(() => renderSvg({ nodes: [{ id: 'idle', type: 'state', label: 'Idle',
      position: { x: 0, y: 0 } }], edges: [], metadata: { notation: 'uml-state' } }))
      .toThrow(/character-only-edition/);
  });
  it('draws the same explicit symbol shape across every installed profile', () => {
    for (const notation of notationRegistry.getAll().filter(({ id }) => id !== 'uml-state')) {
      const symbol = notation.symbols[0]!;
      const rendered = renderNode({ label: 'N', nodeType: 'unmapped', notationId: notation.id,
        canonical: { symbol } });
      const canvasPath = rendered.container.querySelector('path')?.getAttribute('d');
      expect(canvasPath, notation.id).toBeTruthy();
      expect(rendered.container.querySelector('[data-coral-unresolved-symbol]'), notation.id).toBeNull();
      const svg = renderSvg({ nodes: [{ id: 'n1', type: 'unmapped', label: 'N', symbol,
        position: { x: 0, y: 0 } }], edges: [], metadata: { notation: notation.id } });
      expect(svgOutline(svg), notation.id).toBe(canvasPath);
      rendered.unmount();
    }
  });

  it('keeps a foreign explicit symbol visible while strict U2 reports it in every profile', () => {
    for (const notation of notationRegistry.getAll().filter(({ id }) => id !== 'uml-state')) {
      const symbol = notation.id === 'architecture' ? 'flowchart-process' : 'arch-service';
      const graph = { version: '3.0.0' as const, id: `foreign-${notation.id}`,
        nodes: [{ id: 'n1', type: 'unmapped', label: 'N', symbol,
          position: { x: 0, y: 0 } }], edges: [], metadata: { notation: notation.id } };
      const rendered = renderNode({ label: 'N', nodeType: 'unmapped', notationId: notation.id,
        canonical: { symbol } });
      const canvasPath = rendered.container.querySelector('path')?.getAttribute('d');
      expect(canvasPath, notation.id).toBeTruthy();
      expect(rendered.container.querySelector('[data-coral-unresolved-symbol]'), notation.id).toBeNull();
      expect(svgOutline(renderSvg(graph)), notation.id).toBe(canvasPath);
      expect(checkGraphConformance028(graph, { requestedLevel: 'strict', operation: 'check' }).findings,
        notation.id).toContainEqual(expect.objectContaining({
        id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'error',
        subject: { kind: 'node', id: 'n1' },
      }));
      rendered.unmount();
    }
  });

  it('never borrows a base glyph or ports for an unknown variant across profiles', () => {
    for (const notation of notationRegistry.getAll().filter(({ id }) => id !== 'uml-state')) {
      const symbol = notation.symbols[0]!;
      const graph = { version: '3.0.0' as const, id: `unknown-variant-${notation.id}`,
        nodes: [{ id: 'n1', type: 'unmapped', label: 'N', symbol,
          variant: 'not-a-variant', position: { x: 0, y: 0 } }], edges: [],
        metadata: { notation: notation.id } };
      const rendered = renderNode({ label: 'N', nodeType: 'unmapped', notationId: notation.id,
        canonical: { symbol }, variant: 'not-a-variant' });
      expect(rendered.container.querySelector('[data-coral-unresolved-symbol]')?.textContent,
        notation.id).toContain('not-a-variant');
      expect(rendered.container.querySelector('path'), notation.id).toBeNull();
      expect(rendered.container.querySelectorAll('[data-handleid]'), notation.id).toHaveLength(0);
      expect(() => renderSvg(graph), notation.id).toThrow(/unknown-variant/);
      expect(checkGraphConformance028(graph, { savedLevel: 'none' }).findings,
        notation.id).toContainEqual(expect.objectContaining({
        id: 'coral.variant.unknown', category: 'capability', severity: 'error',
      }));
      rendered.unmount();
    }
  });

  it('keeps an explicit blank symbol generic instead of borrowing process appearance', () => {
    const rendered = renderNode({
      label: 'N', nodeType: 'process', canonical: { symbol: '' },
    });
    const canvasPath = rendered.container.querySelector('path');
    const canvas = canvasPath?.getAttribute('d');
    const svg = renderSvg({
      nodes: [{ id: 'n1', type: 'process', label: 'N', symbol: '', position: { x: 0, y: 0 } }],
      edges: [],
    });
    expect(canvas).toBe(visualContour028('rectangle', 'lowfi'));
    expect(svgOutline(svg)).toBe(canvas);
    expect(canvasPath?.getAttribute('fill')).toBe('#ffffff');
    expect(canvasPath?.getAttribute('stroke')).toBe('#363430');
  });

  it.each(['io', 'document'] as const)('draws the SVG shape for flowchart type %s', (type) => {
    const canvas = renderNode({ label: 'N', nodeType: type, notationId: 'flowchart' }).container.querySelector('path')?.getAttribute('d');
    const svg = renderSvg({ nodes: [{ id: 'n1', type, label: 'N', position: { x: 0, y: 0 } }] as GraphNode[],
      edges: [], metadata: { notation: 'flowchart' } });
    expect(canvas).toBeTruthy();
    expect(svgOutline(svg)).toBe(canvas);
    expect(canvas).not.toBe(shapeRegistry.get('rectangle')!.path);
  });

  it.each(['io', 'document', 'unmapped'] as const)('keeps unprofiled type %s generic', (type) => {
    const canvas = renderNode({ label: 'N', nodeType: type }).container.querySelector('path')?.getAttribute('d');
    const svg = renderSvg({ nodes: [{ id: 'n1', type, label: 'N', position: { x: 0, y: 0 } }], edges: [] });
    expect(canvas).toBe(visualContour028('rectangle', 'lowfi'));
    expect(svgOutline(svg)).toBe(canvas);
  });
});
