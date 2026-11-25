import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { prepareSequenceScene028, projectInstalledSourceToSuccessor028, renderSvg,
  successorSequenceDisplay028 } from '@coral-viz/render';
import type { GraphIR } from '@graph-ir/core';
import { SequenceDiagram } from '../src/index.js';

const graph: GraphIR = {
  version: '3.0.0', id: 'seq', name: 'Login',
  metadata: { notation: 'uml-sequence' }, profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
  nodes: [{ id: 'A', type: 'actor', label: 'Alice' }, { id: 'B', type: 'participant', label: 'Bob' }],
  edges: [
    { id: 'm1', source: 'A', target: 'B', type: 'sync', label: 'hello <b>' },
    { id: 'm2', source: 'B', target: 'A', type: 'return', label: 'hi' },
  ],
  interaction: {
    participants: [{ id: 'A', nodeId: 'A' }, { id: 'B', nodeId: 'B' }], participantOrder: ['A', 'B'],
    messages: [
      { id: 'm1', edgeId: 'm1', sourceParticipantId: 'A', targetParticipantId: 'B', kind: 'synchronous' },
      { id: 'm2', edgeId: 'm2', sourceParticipantId: 'B', targetParticipantId: 'A', kind: 'return' },
    ],
    messageOrder: ['m1', 'm2'],
    activations: [{ id: 'activation-1', participantId: 'B', startMessageId: 'm1', endMessageId: 'm2' }],
    fragments: [{ id: 'fragment-1', kind: 'opt', operands: [{ id: 'fragment-1-operand-1', messageIds: ['m2'] }] }],
    notes: [{ id: 'note-1', text: 'greeting', messageIds: ['m1'] }],
  },
};

function shape(root: Element): string[] {
  return [...root.querySelectorAll('[data-coral-sequence-participant],[data-coral-sequence-message],[data-coral-sequence-activation],[data-coral-sequence-note],[data-coral-sequence-fragment]')]
    .map((element) => {
      const painted = element.cloneNode(true) as Element;
      for (const group of painted.querySelectorAll('g')) {
        for (const name of ['role', 'tabindex', 'style', 'aria-current']) group.removeAttribute(name);
      }
      painted.querySelectorAll('[data-coral-interaction-hit]').forEach((hit) => hit.remove());
      return `${[...element.attributes].find((attribute) => attribute.name.startsWith('data-coral-sequence-'))!.name}=${element.getAttribute('aria-label')}|${painted.innerHTML.replace(/ xmlns="[^"]*"/g, '').replace(/<(\w+)([^<>]*?)\/>/g, '<$1$2></$1>')}`;
    });
}

describe('SequenceDiagram canvas', () => {
  it.each([1, .6])('matches SVG label bounds, rows and accessible names at line-height %s', (lineHeight) => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\ncall = a -> b as "gyp\\ngyp"').graph!;
    source.edges[0].labelPlacement = { side: 'above', at: .5 };
    const graph = successorSequenceDisplay028(source);
    const fontSettings = { default: { family: 'Coral Inter', size: 18, lineHeight } };
    const onSelect = vi.fn();
    const { container } = render(<SequenceDiagram graph={graph} fontSettings={fontSettings} onSelect={onSelect} />);
    const exported = new DOMParser().parseFromString(renderSvg(graph, { fontSettings }), 'image/svg+xml');
    const selector = '[data-coral-sequence-message="call"]';
    const live = container.querySelector(selector)!;
    const saved = exported.querySelector(selector)!;
    expect(live.getAttribute('aria-label')).toBe(saved.getAttribute('aria-label'));
    const attributes = (element: Element) => [...element.attributes].filter((a) => a.name !== 'xmlns')
      .map((a) => [a.name, a.value]).sort(([a], [b]) => a.localeCompare(b));
    for (const query of ['[data-coral-message-label-background]', 'text', 'tspan']) {
      expect([...live.querySelectorAll(query)].map(attributes)).toEqual([...saved.querySelectorAll(query)].map(attributes));
    }
    fireEvent.click(live.querySelector('[data-coral-message-label-background]')!);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'message', id: 'call' });
  });

  it.each(['lowfi', 'hifi'] as const)('selects typed regions with matching SVG geometry in %s', (style) => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\ncall = a -> b').graph!;
    source.interaction!.regions = [{ id: 'review', label: 'Review request',
      items: [{ kind: 'message', id: 'call' }] }];
    source.interaction!.items = [{ kind: 'region', id: 'review' }];
    const graph = successorSequenceDisplay028(source);
    const onSelect = vi.fn();
    const { container, rerender } = render(<SequenceDiagram graph={graph} renderStyle028={style} onSelect={onSelect} />);
    const region = container.querySelector('[data-coral-sequence-region="review"]')!;
    expect(region.getAttribute('aria-label')).toBe('Region review: Review request');
    const svg = new DOMParser().parseFromString(renderSvg(graph, { style }), 'image/svg+xml');
    const attrs = (element: Element | null) => Object.fromEntries([...(element?.attributes ?? [])]
      .filter((attribute) => attribute.name !== 'xmlns').map((attribute) => [attribute.name, attribute.value]));
    expect(attrs(region.querySelector('rect:not([data-coral-interaction-hit])')))
      .toEqual(attrs(svg.querySelector('[data-coral-sequence-region="review"] rect')));
    fireEvent.click(region.querySelector('[data-coral-interaction-hit]')!);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'region', id: 'review' });
    fireEvent.keyDown(region, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'region', id: 'review' });
    rerender(<SequenceDiagram graph={graph} renderStyle028={style} onSelect={onSelect} selected={{ kind: 'region', id: 'review' }} />);
    expect(container.querySelector('[data-coral-sequence-region="review"]')?.getAttribute('aria-current')).toBe('true');
  });

  it.each(['lowfi', 'hifi'] as const)('selects participant groups separately from equal participant IDs in %s', (style) => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\nc participant\ncall = a -> b').graph!;
    source.interaction!.groups = [{ id: 'a', label: 'Exact team', participantIds: ['c', 'a'] }];
    const graph = successorSequenceDisplay028(source);
    const onSelect = vi.fn();
    const { container, rerender } = render(<SequenceDiagram graph={graph} renderStyle028={style} onSelect={onSelect} />);
    const group = container.querySelector('[data-coral-sequence-group="a"]')!;
    expect(group.getAttribute('aria-label')).toContain('members: c, a');
    const svg = new DOMParser().parseFromString(renderSvg(graph, { style }), 'image/svg+xml');
    expect([...group.querySelectorAll('path, line')].map((element) => element.outerHTML))
      .toEqual([...svg.querySelectorAll('[data-coral-sequence-group="a"] path, [data-coral-sequence-group="a"] line')]
        .map((element) => element.outerHTML.replace(/ xmlns="[^"]*"/g, '').replace(/<(\w+)([^<>]*?)\/>/g, '<$1$2></$1>')));
    const hit = group.querySelector('[data-coral-interaction-hit]')!;
    expect(Number(hit.getAttribute('y')) + Number(hit.getAttribute('height')))
      .toBeLessThan(Number(container.querySelector('[data-coral-sequence-participant="a"] rect:not([data-coral-interaction-hit])')!.getAttribute('y')));
    fireEvent.click(hit);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'group', id: 'a' });
    fireEvent.keyDown(group, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'group', id: 'a' });
    fireEvent.click(container.querySelector('[data-coral-sequence-participant="a"] [data-coral-interaction-hit]')!);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'participant', id: 'a' });
    rerender(<SequenceDiagram graph={graph} renderStyle028={style} onSelect={onSelect} selected={{ kind: 'group', id: 'a' }} />);
    expect(container.querySelector('[data-coral-sequence-group="a"]')?.getAttribute('aria-current')).toBe('true');
    expect(container.querySelector('[data-coral-sequence-participant="a"]')?.getAttribute('aria-current')).toBeNull();
  });

  it('publishes shared font classes without React property warnings', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { container } = render(<SequenceDiagram graph={graph} />);
      const texts = [...container.querySelectorAll('text')];
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.every((text) => text.classList.contains('coral-font-text'))).toBe(true);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it.each(['lowfi', 'hifi'] as const)('uses the same complete %s theme paint as SVG export', (style) => {
    for (const theme of ['light', 'dark'] as const) {
      const { container, unmount } = render(<SequenceDiagram graph={graph} renderStyle028={style} themeMode={theme} />);
      const exported = new DOMParser().parseFromString(renderSvg(graph, { style, theme }), 'image/svg+xml');
      const paint = (root: ParentNode) => [...root.querySelectorAll('[data-coral-part-id]')]
        .map((element) => ({ id: element.getAttribute('data-coral-part-id'),
          fill: element.getAttribute('fill'), stroke: element.getAttribute('stroke') }));
      expect(paint(container)).toEqual(paint(exported));
      unmount();
    }
  });

  it('draws exactly the SVG export elements and geometry from the shared scene', () => {
    const { container } = render(<SequenceDiagram graph={graph} />);
    const exported = new DOMParser().parseFromString(renderSvg(graph), 'image/svg+xml').documentElement;
    expect(shape(container)).toEqual(shape(exported));
    expect(shape(container)).toHaveLength(7);
    // Selectable descendants must stay exposed, so the interactive root is a group (CR70-6).
    expect(screen.getByRole('group', { name: 'Login' })).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBe(8);
    expect(container.textContent).toContain('hello <b>');
  });

  it('draws the same elements as SVG export under document font settings', () => {
    const fontSettings = { default: { family: 'Serif', size: 26, weight: 'bold' as const, lineHeight: 1.5 } };
    const { container } = render(<SequenceDiagram graph={graph} fontSettings={fontSettings} />);
    const exported = new DOMParser().parseFromString(renderSvg(graph, { fontSettings }), 'image/svg+xml').documentElement;
    expect(shape(container)).toEqual(shape(exported));
    expect(container.querySelector('svg')?.getAttribute('width')).toBe(exported.getAttribute('width'));
    expect(container.innerHTML).toContain('font-size="26"');
  });

  it('reports selection by kind and id and marks the selected element', () => {
    const onSelect = vi.fn();
    const { container, rerender } = render(<SequenceDiagram graph={graph} onSelect={onSelect} />);
    const hit = container.querySelector('[data-coral-interaction-hit="m2"]');
    expect(hit?.getAttribute('pointer-events')).toBe('all');
    expect(Number(hit?.getAttribute('width'))).toBeGreaterThan(0);
    fireEvent.click(hit!);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'message', id: 'm2' });
    const participantHit = container.querySelector('[data-coral-interaction-hit="A"]');
    expect(Number(participantHit?.getAttribute('height'))).toBeGreaterThan(0);
    fireEvent.click(participantHit!);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'participant', id: 'A' });
    fireEvent.click(container.querySelector('[data-coral-sequence-message="m2"]')!);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'message', id: 'm2' });
    rerender(<SequenceDiagram graph={graph} onSelect={onSelect} selected={{ kind: 'message', id: 'm2' }} />);
    expect(container.querySelector('[data-coral-sequence-message="m2"]')?.getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(container.querySelector('[data-coral-sequence-participant="A"]')!, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'participant', id: 'A' });
  });

  it('selects each fragment operand from its distinct measured scene band', () => {
    const alt = structuredClone(graph);
    alt.interaction!.fragments = [{ id: 'fragment-1', kind: 'alt', operands: [
      { id: 'branch-a', guard: { id: 'guard-a', text: 'yes' }, messageIds: ['m1'] },
      { id: 'branch-b', guard: { id: 'guard-b', text: 'no' }, messageIds: ['m2'] },
    ] }];
    const scene = prepareSequenceScene028(alt);
    const onSelect = vi.fn();
    const { container } = render(<SequenceDiagram graph={alt} onSelect={onSelect} />);
    const fragment = container.querySelector('[data-coral-sequence-fragment="fragment-1"]')!;
    expect(fragment.getAttribute('role')).toBe('group');
    expect(fragment.getAttribute('tabindex')).toBeNull();
    const frame = fragment.querySelector('[data-coral-fragment-frame="fragment-1"]')!;
    expect(frame.getAttribute('role')).toBe('button');
    expect(frame.querySelector('[role="button"]')).toBeNull();
    fireEvent.keyDown(frame, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'fragment', id: 'fragment-1' });
    for (const id of ['branch-a', 'branch-b']) {
      const group = container.querySelector(`[data-coral-sequence-operand="${id}"]`);
      expect(group?.tagName).toBe('g');
      const hit = group?.querySelector(`[data-coral-interaction-hit="${id}"]`);
      const bounds = scene.ownerLookup.hitBounds[`operand:${id}`]!;
      expect(hit?.getAttribute('y')).toBe(String(bounds.y));
      expect(hit?.getAttribute('height')).toBe(String(bounds.height));
      fireEvent.click(hit!);
      expect(onSelect).toHaveBeenLastCalledWith({ kind: 'operand', id });
      expect(group?.closest('[role="button"]')).toBe(group);
    }
  });

  it('uses measured scene hit regions for other selectable sequence children', () => {
    const scene = prepareSequenceScene028(graph);
    const onSelect = vi.fn();
    const { container } = render(<SequenceDiagram graph={graph} onSelect={onSelect} />);
    for (const [kind, id] of [
      ['fragment', 'fragment-1'], ['activation', 'activation-1'], ['note', 'note-1'],
    ] as const) {
      const group = container.querySelector(`[data-coral-sequence-${kind}="${id}"]`);
      const hit = group?.querySelector(`[data-coral-interaction-hit="${id}"]`);
      const bounds = scene.ownerLookup.hitBounds[`${kind}:${id}`]!;
      expect(hit?.getAttribute('x')).toBe(String(bounds.x));
      expect(hit?.getAttribute('width')).toBe(String(bounds.width));
      fireEvent.click(hit!);
      expect(onSelect).toHaveBeenLastCalledWith({ kind, id });
    }
  });

  it('selects nested source-owned alternative frames and operands without nested buttons', () => {
    const source = [
      '@diagram uml-sequence', 'client participant', 'server participant',
      'choice = alt "valid" {', '  call = client -> server',
      '  retry = alt "again" {', '    nested = server -> client',
      '  } else "stop" {', '    stopped = client -> server', '  }',
      '} else "invalid" {', '  rejected = server -> client', '}',
    ].join('\n');
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    const display = successorSequenceDisplay028(projected.graph!);
    const scene = prepareSequenceScene028(display);
    const onSelect = vi.fn();
    const { container } = render(<SequenceDiagram graph={display} onSelect={onSelect} />);
    for (const fragment of scene.scene.fragments) {
      const root = container.querySelector(`[data-coral-sequence-fragment="${fragment.id}"]`)!;
      expect(root.getAttribute('role')).toBe('group');
      const frame = root.querySelector(`[data-coral-fragment-frame="${fragment.id}"]`)!;
      fireEvent.click(frame.querySelector('[data-coral-interaction-hit]')!);
      expect(onSelect).toHaveBeenLastCalledWith({ kind: 'fragment', id: fragment.id });
      for (const operand of fragment.operands) {
        const control = root.querySelector(`[data-coral-sequence-operand="${operand.id}"]`)!;
        expect(control.getAttribute('role')).toBe('button');
        expect(control.parentElement).toBe(root);
        fireEvent.click(control.querySelector('[data-coral-interaction-hit]')!);
        expect(onSelect).toHaveBeenLastCalledWith({ kind: 'operand', id: operand.id });
      }
    }
    expect(container.querySelector('[role="button"] [role="button"]')).toBeNull();
  });

  it('shows an accessible error instead of guessing for an unusable interaction', () => {
    const broken = structuredClone(graph);
    broken.interaction!.messageOrder.pop();
    render(<SequenceDiagram graph={broken} />);
    expect(screen.getByRole('alert').textContent).toContain('coral.sequence.layout.invalid');
  });
});
