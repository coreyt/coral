import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutNodes } from '../src/hooks/diagramUtils';
import { parseCoralDSL } from '../src/parsers';
import { useEditorController } from '../src/useEditorController';

if (!window.matchMedia) window.matchMedia = ((query: string) => ({
  matches: false, media: query, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
})) as typeof window.matchMedia;

// A renderable diagram must stay renderable when a label is edited: the
// canvas routes each edit against the resized nodes, ELK lays out connectors
// into groups, and a group's header holds its title at the frame's width.
const smoke = (ship: string) => '@diagram flowchart\nstart terminal as "Begin Quillon"\n' +
  'a group as "Team Alder" {\n  r process as "Review Zephyr"\n}\nb group as "Team Birch" {\n  r process as "Review Zephyr"\n}\n' +
  `ledger database as "Ledger Okapi"\nship process as "${ship}"\nstart -> a.r\na.r -> ship\n`;
const variants: Record<string, (label: string) => string> = {
  'a child label': (label) => '@diagram flowchart\nstart terminal as "Begin Quillon"\n' +
    `a group as "Team Alder" {\n  r process as "${label}"\n}\nship process as "Ship Marmot"\nstart -> a.r\na.r -> ship\n`,
  'a group caption': (label) => '@diagram flowchart\nstart terminal as "Begin Quillon"\n' +
    `a group as "${label}" {\n  r process as "Review Zephyr"\n}\nship process as "Ship Marmot"\nstart -> a.r\na.r -> ship\n`,
  'a nested group\'s neighbour': (label) => '@diagram flowchart\nstart terminal as "Begin"\n' +
    `o group as "Outer" {\n  i group as "Inner" {\n    r process as "Review"\n  }\n}\nship process as "${label}"\n` +
    'start -> o.i.r\no.i.r -> ship\n',
  'a node beside a sibling': (label) => '@diagram flowchart\nsrc process as "Source"\n' +
    `x process as "${label}"\ny process as "Other"\ng group as "Group G" {\n  z process as "Inner"\n}\n` +
    'src -> x\nsrc -> y\nsrc -> g.z\n',
};
const labels = ['X', 'Deliver Marmot', 'Deliver Marmot and Dispatch',
  'Deliver Marmot and Dispatch to the far warehouse', 'A much longer label that keeps on going and going and on'];

// Each edit lays out and routes; allow for a loaded test host.
const SETTLE = { timeout: 15_000 };

async function typeEdits(initial: string, edits: string[]) {
  const hook = renderHook(() => useEditorController());
  const failures: string[] = [];
  try {
    act(() => hook.result.current.header.onOpenFile({ name: 'edit.coral', text: initial }));
    await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false), SETTLE);
    expect(hook.result.current.canvas.sceneError028).toBeUndefined();
    for (const text of edits) {
      act(() => hook.result.current.editor.onDslChange(text));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull(), SETTLE);
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false), SETTLE);
      const { canvas, editor } = hook.result.current;
      const problems = [canvas.sceneError028, ...editor.parseErrors.filter((issue) => issue.severity === 'error')
        .map((issue) => issue.message)].filter(Boolean);
      if (problems.length) failures.push(`${JSON.stringify(text.match(/as "[^"]*"/g))}: ${problems.join('; ')}`);
      else expect(canvas.scene028).toBeDefined();
      // A resized node never stays overlapping a neighbour it grew into.
      const scene = canvas.scene028?.nodes ?? [];
      const inside = (id: string, ancestor: string): boolean => id.startsWith(`${ancestor}.`);
      for (const a of scene) for (const b of scene) {
        if (a === b || inside(a.node.id, b.node.id) || inside(b.node.id, a.node.id)) continue;
        const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
        if (overlap) failures.push(`${a.node.id} overlaps ${b.node.id}`);
      }
    }
    return { failures, hook };
  } catch (error) { hook.unmount(); throw error; }
}

describe('label edits keep a diagram renderable', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders the P5 smoke diagram after "Ship Marmot" is renamed, keeping the other nodes in place', async () => {
    const { failures, hook } = await typeEdits(smoke('Ship Marmot'), []);
    try {
      const before = new Map(hook.result.current.canvas.nodes.map((node) => [node.id, node.position]));
      act(() => hook.result.current.editor.onDslChange(smoke('Deliver Marmot and Dispatch')));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull(), SETTLE);
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false), SETTLE);
      expect(failures).toEqual([]);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      // Every connector is routed for the edit: a bent route has no slanted
      // leg (a single clear segment may be a direct shortcut).
      for (const edge of hook.result.current.canvas.scene028!.resolved.edges) {
        expect(edge.points.length, edge.id).toBeGreaterThanOrEqual(2);
        for (let i = 1; edge.points.length > 2 && i < edge.points.length; i++) {
          const [a, b] = [edge.points[i - 1]!, edge.points[i]!];
          expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6, `${edge.id} leg ${i} is orthogonal`).toBe(true);
        }
      }
      for (const node of hook.result.current.canvas.nodes) expect(node.position, node.id).toEqual(before.get(node.id));
    } finally { hook.unmount(); }
  }, 60_000);

  it('renders every swept length of the renamed label', async () => {
    const { failures, hook } = await typeEdits(smoke('Ship Marmot'), labels.map(smoke));
    hook.unmount();
    expect(failures).toEqual([]);
  }, 120_000);

  it.each(Object.keys(variants))('keeps every node in place when %s gets shorter', async (name) => {
    const make = variants[name]!;
    const { failures, hook } = await typeEdits(make('Ship Marmot'), []);
    try {
      const before = new Map(hook.result.current.canvas.nodes.map((node) => [node.id, node.position]));
      act(() => hook.result.current.editor.onDslChange(make('X')));
      await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull(), SETTLE);
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false), SETTLE);
      expect(failures).toEqual([]);
      expect(hook.result.current.canvas.sceneError028).toBeUndefined();
      for (const node of hook.result.current.canvas.nodes) expect(node.position, node.id).toEqual(before.get(node.id));
    } finally { hook.unmount(); }
  }, 60_000);

  it.each(Object.keys(variants))('renders every swept length of %s', async (name) => {
    const make = variants[name]!;
    const { failures, hook } = await typeEdits(make('Ship Marmot'), labels.map(make));
    hook.unmount();
    expect(failures).toEqual([]);
  }, 120_000);
});

describe('the canvas layout of connectors into groups', () => {
  const lay = async (source: string) => {
    const parsed = parseCoralDSL(source);
    return layoutNodes(parsed.nodes, parsed.edges, 'flowchart', undefined, true, undefined, undefined, [],
      'incremental', parsed.semanticInterpretations, parsed.envelope as never, 'lowfi');
  };

  it('ranks a connector out of a group: Ship lies below Review, and ELK routes both connectors', async () => {
    const laid = await lay(smoke('Ship Marmot'));
    const byId = new Map(laid.nodes.map((node) => [node.id, node]));
    const group = byId.get('a')!, ship = byId.get('ship')!, start = byId.get('start')!;
    expect(start.position.y + start.height!).toBeLessThan(group.position.y);
    expect(ship.position.y).toBeGreaterThan(group.position.y + group.height!);
    expect([...laid.edgeRouting.keys()].sort()).toEqual(['edge-1', 'edge-2']);
    const out = laid.edgeRouting.get('edge-2')!;
    expect(out.endPoint.y).toBeGreaterThan(out.startPoint.y);
  });

  it('lays out the smoke diagram with Ledger hand-placed anywhere on a grid', async () => {
    const failures: string[] = [];
    for (const label of ['Ship Marmot', 'Deliver Marmot and Dispatch']) {
      for (let x = 0; x <= 700; x += 100) for (let y = 0; y <= 700; y += 100) {
        const source = smoke(label).replace('ledger database as "Ledger Okapi"', `ledger database as "Ledger Okapi" @ (${x}, ${y})`);
        await lay(source).catch((error: Error) => failures.push(`${label} @ (${x}, ${y}): ${error.message}`));
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
