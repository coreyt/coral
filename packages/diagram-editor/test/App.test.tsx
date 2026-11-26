/**
 * App characterization tests - R-012.
 *
 * These pin the composition root's observable behaviour before the panes and
 * hooks are wired in, so the decomposition can be shown not to change it.
 * They deliberately assert what a user can see and do, not internals.
 */

import { EXPECTED_RELEASE_VERSION } from '../src/guidanceContent';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// These characterization journeys use an explicit historical Mermaid fixture.
// The production 0.2.8 startup is exercised by its own browser acceptance.
vi.mock('../src/startupSource', async () => ({
  startupSource: (await import('./fixtures/legacyStartupSource')).legacyStartupSource,
}));

const appElkLayout = vi.hoisted(() => vi.fn());
let capturedWaypointGesture: any = null;
let removedTestEdge: any = null;

function successfulElkLayout(graph: any) {
  const children = graph.children ?? [];
  // Leave room for the deliberately large fonts used by these UI fixtures.
  const strideX = Math.max(1000, ...children.map((node: any) => (Number(node.width) || 0) + 80));
  const strideY = Math.max(1000, ...children.map((node: any) => (Number(node.height) || 0) + 80));
  return Promise.resolve({
    children: (graph.children ?? []).map((child: any, index: number) => ({
      ...child,
      x: index * strideX,
      y: index * strideY,
    })),
    edges: [],
  });
}

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    layout(graph: unknown) {
      return appElkLayout(graph);
    }
  },
}));

// jsdom has no matchMedia; the theme hook asks for the colour scheme.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ children, nodes = [], edges = [], onSelectionChange, onNodesChange, onEdgesChange, onNodeDragStart, onConnect, onReconnect }: any) => {
      const nodeMetadata = Symbol.for('@coral-viz/viz/node-view-metadata');
      const edgeMetadata = Symbol.for('@coral-viz/viz/edge-view-metadata');
      const nodeSummary = nodes.map((node: any) => ({
        id: node.id,
        position: node.position,
        width: node.width,
        height: node.height,
        selected: node.selected,
        draggable: node.draggable,
        font: node.data?.[nodeMetadata]?.font,
        dimensionSource: node.data?.[nodeMetadata]?.dimensionSource,
        lines: node.data?.[nodeMetadata]?.lines,
        symbolId: node.data?.symbolId,
        description: node.data?.description,
        properties: node.data?.properties,
        parentId: node.parentId,
      }));
      const edgeSummary = edges.map((edge: any) => ({
        id: edge.id,
        font: edge.data?.[edgeMetadata]?.font,
        labelStyle: edge.labelStyle,
        waypoints: edge.data?.waypoints,
        routingPoints: edge.data?.routingPoints,
        routeIntent: edge.data?.canonical?.routeIntent,
        routedPath: edge.data?.routedPath,
      }));
      return (
      <div
        data-testid="react-flow"
        data-nodes={JSON.stringify(nodeSummary)}
        data-edges={JSON.stringify(edgeSummary)}
      >
        <button
          type="button"
          aria-label="Select first diagram node"
          disabled={nodes.length === 0}
          onClick={() => {
            if (nodes[0]) onNodesChange?.([{ id: nodes[0].id, type: 'select', selected: true }]);
            onSelectionChange?.({ nodes: nodes.slice(0, 1) });
          }}
        >
          Select first node
        </button>
        <div className="react-flow__node" tabIndex={0} data-testid="keyboard-node" onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.stopPropagation(); return; }
          if (['ArrowRight', 'ArrowDown'].includes(event.key) && nodes[0]) onNodesChange?.([{
            id: nodes[0].id, type: 'position', position: { x: nodes[0].position.x + 5, y: nodes[0].position.y }, dragging: true,
          }]);
        }}>Keyboard node</div>
        <button aria-label="Start test node drag" onClick={() => onNodeDragStart?.({}, nodes[0], [nodes[0]])}>Start drag</button>
        <button aria-label="Continue test node drag" onClick={() => onNodesChange?.([{
          id: nodes[0].id, type: 'position', position: { x: 301, y: 302 }, dragging: true,
        }])}>Continue drag</button>
        <button aria-label="Stop unchanged test node drag" onClick={() => onNodesChange?.([{
          id: nodes[0].id, type: 'position', position: nodes[0].position, dragging: false,
        }])}>Stop unchanged</button>
        <button aria-label="Finish test node drag" onClick={() => onNodesChange?.([{
          id: nodes[0].id, type: 'position', position: { x: 401, y: 402 }, dragging: false,
        }])}>Finish drag</button>
        <button
          type="button"
          aria-label="Move first diagram node"
          disabled={nodes.length === 0}
          onClick={() => {
            if (!nodes[0]) return;
            onNodeDragStart?.({}, nodes[0], [nodes[0]]);
            onNodesChange?.([{ id: nodes[0].id, type: 'position', position: { x: 901, y: 902 }, dragging: true }]);
            onNodesChange?.([{ id: nodes[0].id, type: 'position', position: { x: 901, y: 902 }, dragging: false }]);
          }}
        >
          Move first node
        </button>
        <button
          type="button"
          aria-label="Report passive node dimensions"
          disabled={nodes.length === 0}
          onClick={() => nodes[0] && onNodesChange?.([{
            id: nodes[0].id,
            type: 'dimensions',
            dimensions: { width: nodes[0].width, height: nodes[0].height },
            resizing: false,
          }])}
        >
          Report passive dimensions
        </button>
        <button
          type="button"
          aria-label="Perturb export-only view"
          disabled={nodes.length < 2}
          onClick={() => onNodesChange?.([
            { id: nodes[nodes.length - 1].id, type: 'remove' },
            {
              type: 'add',
              item: {
                id: 'view-only', type: 'symbol', position: { x: 999, y: 999 },
                data: { label: 'View-only sentinel', nodeType: 'service', symbolId: 'arch-service' },
              },
            },
          ])}
        >
          Perturb export-only view
        </button>
        <button
          type="button"
          aria-label="Add test waypoint"
          disabled={!edges[0]?.data?.onWaypointAdd}
          onClick={() => edges[0]?.data?.onWaypointAdd?.(edges[0].id, { x: 500, y: 500 })}
        >
          Add waypoint
        </button>
        <button aria-label="Remove first test edge" onClick={() => { removedTestEdge = edges[0]; onEdgesChange?.([{ type: 'remove', id: edges[0].id }]); }}>Remove edge</button>
        <button aria-label="Readd removed test edge" onClick={() => onEdgesChange?.([{ type: 'add', item: removedTestEdge }])}>Readd edge</button>
        <button aria-label="Replace first test edge" onClick={() => onEdgesChange?.([{ type: 'replace', id: edges[0].id, item: { ...edges[0], target: edges[0].source } }])}>Replace edge</button>
        <button aria-label="Reconnect first test edge" onClick={() => onReconnect?.(edges[0], { source: edges[0].source, target: edges[0].source, sourceHandle: null, targetHandle: null })}>Reconnect edge</button>
        <button aria-label="Reconnect unchanged test edge" onClick={() => onReconnect?.(edges[0], { source: edges[0].source, target: edges[0].target, sourceHandle: edges[0].sourceHandle ?? null, targetHandle: edges[0].targetHandle ?? null })}>Reconnect unchanged</button>
        <button aria-label="Select first test edge" onClick={() => onEdgesChange?.([{ type: 'select', id: edges[0].id, selected: true }])}>Select edge</button>
        <button aria-label="Add unrelated test edge" onClick={() => onEdgesChange?.([{ type: 'add', item: { id: 'unrelated', source: edges[0].source, target: edges[0].target } }])}>Add unrelated</button>
        <button aria-label="Add other test waypoint" onClick={() => edges[1]?.data?.onWaypointAdd?.(edges[1].id, { x: 600, y: 550 })}>Add other waypoint</button>
        <button aria-label="Add fractional test waypoint" onClick={() => edges[0]?.data?.onWaypointAdd?.(edges[0].id, { x: 345.68679245283016, y: 238.45849056603774 })}>Add fractional waypoint</button>
        <button aria-label="Start test waypoint drag" onClick={() => {
          const edge = edges.find((candidate: any) => candidate.data?.waypoints?.length);
          if (!edge) return;
          const waypoint = edge.data.waypoints[0];
          capturedWaypointGesture = { edgeId: edge.id, waypointId: waypoint.id, data: edge.data, start: { x: waypoint.x, y: waypoint.y },
            token: edge.data.onWaypointDragStart?.(edge.id, waypoint.id, waypoint) };
        }}>Start waypoint drag</button>
        <button aria-label="Move test waypoint drag" onClick={() => {
          const g = capturedWaypointGesture;
          g?.data.onWaypointDrag?.(g.edgeId, g.waypointId, { x: 145, y: 167 }, g.token);
        }}>Move waypoint</button>
        <button aria-label="End test waypoint drag" onClick={() => {
          const g = capturedWaypointGesture;
          g?.data.onWaypointDragEnd?.(g.edgeId, g.waypointId, { x: 245, y: 267 }, g.token);
        }}>End waypoint</button>
        <button aria-label="End unchanged test waypoint drag" onClick={() => {
          const g = capturedWaypointGesture;
          g?.data.onWaypointDragEnd?.(g.edgeId, g.waypointId, g.start, g.token);
        }}>End unchanged waypoint</button>
        <button aria-label="Cancel test waypoint drag" onClick={() => {
          const g = capturedWaypointGesture;
          g?.data.onWaypointDragCancel?.(g.edgeId, g.waypointId, g.token);
        }}>Cancel waypoint</button>
        <button aria-label="Remove test waypoint" onClick={() => {
          const edge = edges.find((candidate: any) => candidate.data?.waypoints?.length);
          if (edge) edge.data.onWaypointRemove?.(edge.id, edge.data.waypoints[0].id);
        }}>Remove waypoint</button>
        <button
          type="button"
          aria-label="Connect first and last nodes"
          disabled={nodes.length < 2}
          onClick={() => onConnect?.({
            source: nodes[3]?.id ?? nodes[0].id,
            sourceHandle: nodes[3]?.data?.symbolId ? 'out' : null,
            target: nodes[0].id,
            targetHandle: nodes[0]?.data?.symbolId ? 'in' : null,
          })}
        >
          Connect nodes
        </button>
        {children}
      </div>
      );
    },
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    Background: () => null,
    MiniMap: () => null,
    Controls: () => null,
    useReactFlow: () => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn() }),
    useViewport: () => ({ zoom: 1 }),
  };
});

// ELK is async and irrelevant to composition; keep positions deterministic.
vi.mock('@coral-viz/viz', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@coral-viz/viz');
  return {
    ...actual,
    layoutFlowNodesWithEdges: vi.fn(async (nodes: unknown[], edges: unknown[]) => ({
      nodes: (nodes as Array<Record<string, unknown>>).map((n, i) => ({
        ...n,
        position: { x: i * 100, y: i * 80 },
      })),
      edges,
    })),
  };
});

import App, { composeRenderGraph, edgeForCompatibility, projectCanonicalGraph } from '../src/App';
import { projectInstalledSourceToSuccessor028 } from '@coral-viz/render';

function renderApp() {
  if (!window.localStorage.getItem('coral-diagram-recovery')) {
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
  }
  const view = render(<App />);
  // These historical Properties-control tests explicitly open their subject.
  const toggle = view.container.querySelector('button[aria-label="Show inspector"]');
  if (toggle) fireEvent.click(toggle);
  return view;
}

function loadEditableCoralSource(container: HTMLElement, text: string, name = 'editable.coral.json') {
  const document = {
    schemaVersion: '1.0.0',
    metadata: { name: 'Editable Coral', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
    content: { format: 'dsl', dslType: 'coral', text },
    settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'DOWN' } },
  };
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File([JSON.stringify(document)], name)] },
  });
}

afterEach(() => window.localStorage.clear());

/** The DSL textarea, which is the app's primary text surface. */
function dslEditor(): HTMLTextAreaElement {
  return screen.getByLabelText('DSL editor') as HTMLTextAreaElement;
}

function visibleNodes(): Array<Record<string, any>> {
  return JSON.parse(screen.getByTestId('react-flow').getAttribute('data-nodes') ?? '[]');
}

function visibleEdges(): Array<Record<string, any>> {
  return JSON.parse(screen.getByTestId('react-flow').getAttribute('data-edges') ?? '[]');
}

/** The shell guidance live region, which announces each refusal once (Slice 94 §12). */
function guidanceRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[role="status"][aria-live="polite"]:not([data-testid])');
  if (!region) throw new Error('No shell guidance live region is mounted');
  return region;
}

describe('App (characterization)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    appElkLayout.mockReset();
    appElkLayout.mockImplementation(successfulElkLayout);
  });

  describe('shell layout', () => {
    it('renders the three panes and the document name', () => {
      renderApp();

      expect(screen.getByLabelText('Document name')).toBeDefined();
      expect(dslEditor()).toBeDefined();
      expect(screen.getByLabelText('Diagram editor')).toBeDefined();
      expect(screen.getByLabelText('Properties panel')).toBeDefined();
    });

    it('keeps every Slice 60 documented region name mounted', async () => {
      renderApp();
      expect(screen.getByLabelText('Diagram editor')).toBeDefined();
      expect(screen.getByLabelText('DSL editor region')).toBeDefined();
      expect(screen.getByLabelText('Properties panel')).toBeDefined();
      expect(screen.getByLabelText('Bottom panel tabs')).toBeDefined();
      expect(screen.getByLabelText('Canvas controls')).toBeDefined();
      expect(screen.getByLabelText('Resize source')).toBeDefined();
      expect(screen.getByLabelText('Resize Properties')).toBeDefined();
      expect(screen.getByLabelText('Resize bottom panel')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Load' })).toBeDefined();
      expect(screen.queryByRole('tab', { name: 'AI Conversation' })).toBeNull();
      const formats = screen.getByRole('radiogroup');
      expect(within(formats).getByRole('radio', { name: 'Coral' })).toBeDefined();
      expect(within(formats).getByRole('radio', { name: /Mermaid/i })).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
      expect(await screen.findByRole('menuitem', { name: 'Export SVG' })).toBeDefined();
      fireEvent.keyDown(document, { key: 'Escape' });

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click(screen.getByRole('option', { name: /Create Node/ }));
      fireEvent.change(await screen.findByLabelText('Node label'), {
        target: { value: 'Docs source' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create node' }));

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click(screen.getByRole('option', { name: /Create Node/ }));
      fireEvent.change(await screen.findByLabelText('Node label'), {
        target: { value: 'Docs target' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create node' }));

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      expect(screen.getByRole('option', { name: /Create Edge/ })).toBeDefined();
      expect(screen.getByRole('option', { name: /Reflow Layout/ })).toBeDefined();
    });

    it('offers the DSL formats as a radio group', () => {
      renderApp();

      const group = screen.getByRole('radiogroup');
      const options = within(group).getAllByRole('radio');

      expect(options.length).toBeGreaterThanOrEqual(2);
      expect(options.some((o) => /coral/i.test(o.textContent ?? ''))).toBe(true);
      expect(options.some((o) => /mermaid/i.test(o.textContent ?? ''))).toBe(true);
    });

    it('collapses and restores the inspector', () => {
      renderApp();

      const toggle = screen.getByRole('button', { name: /propert|inspector/i });
      const before = toggle.getAttribute('aria-pressed');
      fireEvent.click(toggle);

      expect(toggle.getAttribute('aria-pressed')).not.toBe(before);
    });

    it('does not project the graph over partial text when highlighting preference changes', async () => {
      const { container } = renderApp();
      const partial = '@diagram architecture\nkept service as "Kept"\nnot valid yet';
      loadEditableCoralSource(container, '@diagram architecture\nkept service as "Kept"');
      await waitFor(() => expect(dslEditor().value).toContain('@diagram architecture'));
      fireEvent.change(dslEditor(), { target: { value: partial } });
      await waitFor(() => expect(dslEditor().value).toBe(partial));

      fireEvent.click(screen.getByRole('button', { name: 'Preferences' }));
      fireEvent.click(await screen.findByLabelText('Entity highlighting'));
      fireEvent.click(screen.getByLabelText('Close preferences'));

      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(dslEditor().value).toBe(partial);
    });
  });

  describe('font settings composition', () => {
    it('mounts one font registry and applies font geometry without moving nodes', async () => {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      expect(document.querySelectorAll('style[data-coral-diagram-font-faces]')).toHaveLength(1);

      const before = visibleNodes();
      fireEvent.click(screen.getByRole('button', { name: 'Add test waypoint' }));
      await waitFor(() => expect(visibleEdges()[0].waypoints).toHaveLength(1));
      fireEvent.click(screen.getByRole('button', { name: 'Select first diagram node' }));
      fireEvent.click(await screen.findByRole('tab', { name: 'Diagram' }));
      const undoLabelBefore = screen.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label');
      fireEvent.change(await screen.findByLabelText('Custom Font Size'), {
        target: { value: '24' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));

      await waitFor(() => expect(visibleNodes()[0].font?.size).toBe(24));
      await waitFor(() => expect((screen.getByRole('button', { name: 'Reflow layout' }) as HTMLButtonElement).disabled).toBe(false));
      await waitFor(() => expect(document.querySelector('[data-coral-scene-error]')).toBeNull(), { timeout: 3000 });
      expect(screen.queryByText(/Automatic layout failed/)).toBeNull();
      const after = visibleNodes();
      expect(after.map((node) => node.position)).toEqual(before.map((node) => node.position));
      expect(after[0].selected).toBe(true);
      expect(after.some((node, index) => node.width !== before[index].width
        || node.height !== before[index].height)).toBe(true);
      expect(after.every((node) => node.dimensionSource === 'editor-font')).toBe(true);
      expect(after.every((node) => node.lines.length > 0)).toBe(true);
      expect(visibleEdges().every((edge) => edge.font?.size === 24)).toBe(true);
      expect(visibleEdges()[0].waypoints).toHaveLength(1);
      expect(screen.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label'))
        .not.toBe(undoLabelBefore);

      fireEvent.click(screen.getByRole('button', { name: 'Reflow layout' }));
      await waitFor(() => expect((screen.getByRole('button', { name: 'Reflow layout' }) as HTMLButtonElement).disabled).toBe(false));
      expect(visibleNodes().every((node) => node.font?.size === 24)).toBe(true);
      expect(visibleEdges().every((edge) => edge.font?.size === 24)).toBe(true);
    });

    it('reprojects a label edit immediately without moving the node', async () => {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      const before = visibleNodes()[0];
      fireEvent.click(screen.getByRole('button', { name: 'Select first diagram node' }));
      const input = await screen.findByDisplayValue('Loading URL failed') as HTMLInputElement;
      fireEvent.change(input, {
        target: { value: 'A substantially longer edited node label that must wrap' },
      });
      fireEvent.blur(input);

      await waitFor(() => expect(visibleNodes()[0].lines.join(' ')).toContain('substantially'));
      const after = visibleNodes()[0];
      expect(after.position).toEqual(before.position);
      expect(after.width !== before.width || after.height !== before.height).toBe(true);
    });

    it('preserves newer description edits through label and font reprojection', async () => {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole('button', { name: 'Select first diagram node' }));

      const description = await screen.findByPlaceholderText('Optional description...');
      fireEvent.change(description, {
        target: { value: 'Current unsynchronized description' },
      });
      fireEvent.blur(description);
      const label = screen.getByDisplayValue('Loading URL failed');
      fireEvent.change(label, {
        target: { value: 'Current edited label' },
      });
      fireEvent.blur(label);
      await waitFor(() => {
        expect(visibleNodes()[0]).toMatchObject({
          description: 'Current unsynchronized description',
        });
      });

      fireEvent.click(screen.getByLabelText('Back to properties'));
      fireEvent.change(await screen.findByLabelText('Custom Font Size'), {
        target: { value: '19' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));

      await waitFor(() => expect(visibleNodes()[0].font?.size).toBe(19));
      expect(visibleNodes()[0]).toMatchObject({
        description: 'Current unsynchronized description',
      });
    });

    it('updates every derived peer when a label changes the uniform maximum', async () => {
      const loaded = {
        schemaVersion: '1.0.0',
        metadata: {
          name: 'Uniform labels', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
        },
        content: {
          format: 'graph-ir',
          graphIR: {
            version: '3.0.0', id: 'uniform-labels',
            nodes: [
              { id: 'first', type: 'service', label: 'First', position: { x: 1, y: 2 } },
              { id: 'second', type: 'service', label: 'Second', position: { x: 3, y: 4 } },
            ],
            edges: [],
          },
        },
        settings: {
          notation: 'flowchart',
          layout: { algorithm: 'layered', direction: 'DOWN', sizingMode: 'uniform' },
        },
      };
      const { container } = renderApp();
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File([JSON.stringify(loaded)], 'uniform.coral.json')] },
      });
      await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['first', 'second']));
      const beforeWidth = visibleNodes()[1].width;
      expect(visibleNodes()[0].width).toBe(beforeWidth);

      fireEvent.click(screen.getByRole('button', { name: 'Select first diagram node' }));
      const uniformLabel = await screen.findByDisplayValue('First');
      fireEvent.change(uniformLabel, {
        target: { value: 'A dramatically wider uniform peer label that must resize its sibling' },
      });
      fireEvent.blur(uniformLabel);

      await waitFor(() => expect(visibleNodes()[0].width).toBeGreaterThan(beforeWidth));
      expect(visibleNodes()[1].width).toBe(visibleNodes()[0].width);
    });

    it('keeps a staged draft through selection and inspector collapse, then saves the commit', async () => {
      let captured: Blob | null = null;
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = ((blob: Blob) => {
        captured = blob;
        return 'blob:font-settings';
      }) as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = (() => {}) as unknown as typeof URL.revokeObjectURL;

      try {
        renderApp();
        const size = await screen.findByLabelText('Custom Font Size') as HTMLInputElement;
        fireEvent.change(size, { target: { value: '18' } });

        const selectFirst = screen.getByRole('button', { name: 'Select first diagram node' }) as HTMLButtonElement;
        await waitFor(() => expect(selectFirst.disabled).toBe(false));
        fireEvent.click(selectFirst);
        await screen.findByLabelText('Back to properties');
        fireEvent.click(screen.getByLabelText('Back to properties'));
        expect((await screen.findByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('18');

        fireEvent.click(screen.getByRole('button', { name: 'Hide inspector' }));
        expect(screen.queryByLabelText('Custom Font Size')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Show inspector' }));
        expect((await screen.findByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('18');

        fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(captured).not.toBeNull());
        const saved = JSON.parse(await captured!.text());
        expect(saved.settings.font.default.size).toBe(18);
      } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      }
    });

    it('resets a draft across consecutive directly loaded documents that both omit font', async () => {
      const { container } = renderApp();
      fireEvent.change(await screen.findByLabelText('Custom Font Size'), {
        target: { value: '20' },
      });

      const oldDocument = {
        schemaVersion: '1.0.0',
        metadata: {
          name: 'Loaded old document',
          created: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
        },
        content: {
          format: 'graph-ir',
          graphIR: { version: '3.0.0', id: 'loaded', nodes: [], edges: [] },
        },
        settings: {
          notation: 'flowchart',
          layout: { algorithm: 'layered', direction: 'DOWN' },
        },
      };
      const file = new File([JSON.stringify(oldDocument)], 'old.coral.json', {
        type: 'application/json',
      });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect((screen.getByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('14');
      });
      expect((screen.getByLabelText('Document name') as HTMLInputElement).value)
        .toBe('Loaded old document');

      fireEvent.change(screen.getByLabelText('Custom Font Size'), {
        target: { value: '22' },
      });
      const nextDocument = {
        ...oldDocument,
        metadata: { ...oldDocument.metadata, name: 'Second old document' },
        content: {
          ...oldDocument.content,
          graphIR: { ...oldDocument.content.graphIR, id: 'loaded-again' },
        },
      };
      const nextFile = new File([JSON.stringify(nextDocument)], 'old-again.coral.json', {
        type: 'application/json',
      });
      fireEvent.change(input, { target: { files: [nextFile] } });

      await waitFor(() => {
        expect((screen.getByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('14');
      });
      expect((screen.getByLabelText('Document name') as HTMLInputElement).value)
        .toBe('Second old document');
    });

    it('directly loads font-aware geometry without moving saved positions or persisting derived bounds', async () => {
      let captured: Blob | null = null;
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = ((blob: Blob) => {
        captured = blob;
        return 'blob:loaded-font-geometry';
      }) as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = (() => {}) as unknown as typeof URL.revokeObjectURL;
      const loaded = {
        schemaVersion: '1.0.0',
        metadata: {
          name: 'Loaded geometry', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
        },
        content: {
          format: 'graph-ir',
          graphIR: {
            version: '3.0.0', id: 'loaded-geometry',
            nodes: [
              { id: 'fixed', type: 'service', label: 'Fixed', position: { x: 11, y: 22 }, dimensions: { width: 91, height: 47 }, properties: { customNodeExtension: { retained: true } } },
              { id: 'derived', type: 'service', label: 'A long derived label', position: { x: 33, y: 44 } },
            ],
            edges: [{ id: 'edge', source: 'fixed', target: 'derived', label: 'Loaded edge', properties: { customEdgeExtension: { retained: true } } }],
          },
        },
        settings: {
          notation: 'flowchart',
          layout: { algorithm: 'layered', direction: 'DOWN', sizingMode: 'adaptive' },
          font: { default: { family: 'monospace', size: 20, weight: 'bold', lineHeight: 1.5 } },
        },
      };

      try {
        const { container } = renderApp();
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File([JSON.stringify(loaded)], 'loaded.coral.json')] } });

        await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['fixed', 'derived']));
        const shown = visibleNodes();
        expect(shown[0]).toMatchObject({ position: { x: 11, y: 22 }, width: 91, height: 47, dimensionSource: 'graph' });
        expect(shown[1]).toMatchObject({ position: { x: 33, y: 44 }, dimensionSource: 'editor-font', font: { id: 'mono', size: 20 } });
        expect(visibleEdges()[0].font).toMatchObject({ id: 'mono', size: 20 });

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(captured).not.toBeNull());
        const saved = JSON.parse(await captured!.text());
        expect(saved.content.graphIR.nodes[0].dimensions).toEqual({ width: 91, height: 47 });
        expect(saved.content.graphIR.nodes[0].properties.customNodeExtension).toEqual({ retained: true });
        expect(saved.content.graphIR.nodes[1]).not.toHaveProperty('dimensions');
        expect(saved.content.graphIR.edges[0].properties.customEdgeExtension).toEqual({ retained: true });
      } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      }
    });

    it('preserves authored bounds, hierarchy, pinning, and current edits on Apply Font', async () => {
      const loaded = {
        schemaVersion: '1.0.0',
        metadata: {
          name: 'Preservation matrix', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
        },
        content: {
          format: 'graph-ir',
          graphIR: {
            version: '3.0.0', id: 'preservation-matrix',
            nodes: [{
              id: 'parent', type: 'group', label: 'Parent', position: { x: 10, y: 20 }, dimensions: { width: 260, height: 180 },
              children: [{ id: 'child', type: 'service', label: 'Child', parent: 'parent', pinned: true, position: { x: 30, y: 40 } }],
            }],
            edges: [],
          },
        },
        settings: {
          notation: 'flowchart',
          layout: { algorithm: 'layered', direction: 'DOWN', sizingMode: 'adaptive' },
        },
      };
      const { container } = renderApp();
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [new File([JSON.stringify(loaded)], 'preservation.coral.json')] },
      });
      await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['parent', 'child']));

      fireEvent.click(screen.getByRole('button', { name: 'Select first diagram node' }));
      const parentDescription = await screen.findByPlaceholderText('Optional description...');
      fireEvent.change(parentDescription, {
        target: { value: 'Current parent description' },
      });
      fireEvent.blur(parentDescription);
      fireEvent.click(screen.getByLabelText('Back to properties'));
      fireEvent.change(await screen.findByLabelText('Custom Font Size'), { target: { value: '20' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));

      await waitFor(() => expect(visibleNodes()[0].font?.size).toBe(20));
      expect(visibleNodes()[0]).toMatchObject({
        id: 'parent', width: 260, height: 180, dimensionSource: 'graph',
        position: { x: 10, y: 20 }, description: 'Current parent description',
      });
      await waitFor(() => expect((screen.getByRole('button', { name: 'Reflow layout' }) as HTMLButtonElement).disabled).toBe(false));
      await waitFor(() => expect(document.querySelector('[data-coral-scene-error]')).toBeNull());
      const child = visibleNodes()[1];
      expect(child).toMatchObject({ id: 'child', parentId: 'parent', draggable: false });
      // The title band is derived display padding; authored coordinates stay
      // relative to the container content even when its font changes.
      expect(child.position.x).toBeGreaterThanOrEqual(30);
      expect(child.position.y).toBeGreaterThanOrEqual(40);
      const blobs: Blob[] = [];
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:font-preservation'; }) as typeof URL.createObjectURL;
      URL.revokeObjectURL = vi.fn();
      const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(blobs).toHaveLength(1));
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[0]!);
        });
        const canonical = JSON.parse(text).content.graphIR.nodes[0];
        expect(canonical).toMatchObject({ position: { x: 10, y: 20 }, dimensions: { width: 260, height: 180 } });
        expect(canonical.children[0]).toMatchObject({ position: { x: 30, y: 40 }, pinned: true });
      } finally {
        URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; anchorClick.mockRestore();
      }
    });

    it('resets the draft for full-document recovery', async () => {
      const recoveredDocument = {
        schemaVersion: '1.0.0',
        metadata: {
          name: 'Recovered full document',
          created: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
        },
        content: {
          format: 'graph-ir',
          graphIR: {
            version: '3.0.0', id: 'recovered',
            nodes: [{ id: 'recovered-node', type: 'service', label: 'Recovered', position: { x: 17, y: 19 } }],
            edges: [],
          },
        },
        settings: {
          notation: 'flowchart',
          layout: { algorithm: 'layered', direction: 'DOWN' },
          font: {
            default: { family: 'monospace', size: 16, weight: 'bold', lineHeight: 1.5 },
          },
        },
      };
      window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
        timestamp: Date.now(),
        documentName: 'Recovered',
        dslType: 'coral',
        dsl: '@diagram architecture\nrecovered service as "Recovered"',
        notation: 'flowchart',
        nodePositions: {},
        document: recoveredDocument,
      }));
      renderApp();
      fireEvent.click(await screen.findByRole('button', { name: 'Close welcome' }));
      fireEvent.change(await screen.findByLabelText('Custom Font Size'), {
        target: { value: '21' },
      });

      fireEvent.click(await screen.findByLabelText('Restore recovered diagram'));

      await waitFor(() => {
        expect((screen.getByLabelText('Custom Font Size') as HTMLInputElement).value)
          .toBe('16');
      });
      expect(visibleNodes()[0]).toMatchObject({
        id: 'recovered-node', position: { x: 17, y: 19 }, font: { id: 'mono', size: 16 },
      });
    });

    it('does not leak a previously committed font into legacy recovery or its next save', async () => {
      let captured: Blob | null = null;
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = ((blob: Blob) => {
        captured = blob;
        return 'blob:legacy-recovery';
      }) as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = (() => {}) as unknown as typeof URL.revokeObjectURL;
      window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
        timestamp: Date.now(),
        documentName: 'Recovered legacy',
        dslType: 'coral',
        dsl: '@diagram architecture\nrecovered service as "Recovered"',
        notation: 'flowchart',
        nodePositions: {},
      }));

      try {
        renderApp();
        fireEvent.click(await screen.findByRole('button', { name: 'Close welcome' }));
        fireEvent.change(await screen.findByLabelText('Custom Font Size'), {
          target: { value: '18' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));
        expect((screen.getByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('18');

        fireEvent.change(screen.getByLabelText('Custom Font Size'), {
          target: { value: '21' },
        });
        fireEvent.click(await screen.findByLabelText('Restore recovered diagram'));
        await waitFor(() => {
          expect((screen.getByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('14');
        });
        await waitFor(() => expect(visibleNodes()[0]?.font?.size).toBe(26));

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(captured).not.toBeNull());
        const saved = JSON.parse(await captured!.text());
        expect(Object.prototype.hasOwnProperty.call(saved.settings, 'font')).toBe(false);
      } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      }
    });
  });

  describe('text to diagram', () => {
    // A pending text layout is source-owned under Slice 94, so Font Apply is
    // refused rather than rebasing it. The rebase invariant these tests once
    // held is kept for the layouts no source owner holds: explicit Reflow
    // (below) and a passive resolution (useEditorController TR94-F9).
    it('refuses a font mutation while source ownership is pending', async () => {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      const callsBefore = appElkLayout.mock.calls.length;
      let resolveOld!: (value: unknown) => void;
      const oldLayout = new Promise((resolve) => { resolveOld = resolve; });
      appElkLayout.mockImplementationOnce(() => oldLayout);

      fireEvent.change(dslEditor(), {
        target: { value: 'flowchart LR\n    newest[A newest pending label]' },
      });
      await waitFor(() => expect(appElkLayout.mock.calls.length).toBeGreaterThan(callsBefore));
      fireEvent.change(screen.getByLabelText('Custom Font Size'), { target: { value: '22' } });
      // Pending source has no safe font transaction. The supported control
      // exposes that guard directly instead of accepting a no-op click.
      expect((screen.getByRole('button', { name: 'Apply Font Changes' }) as HTMLButtonElement).disabled).toBe(true);

      const pendingGraph = appElkLayout.mock.calls.at(-1)?.[0];
      resolveOld(await successfulElkLayout(pendingGraph));
      await waitFor(() => {
        expect(visibleNodes().map((node) => node.id)).toEqual(['newest']);
        expect(visibleNodes()[0].font?.size).toBe(26);
      });
      expect(appElkLayout.mock.calls.length).toBe(callsBefore + 1);
    });

    it('keeps passive dimensions view-only while source ownership refuses a font mutation', async () => {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      const callsBefore = appElkLayout.mock.calls.length;
      let resolveOld!: (value: unknown) => void;
      const oldLayout = new Promise((resolve) => { resolveOld = resolve; });
      appElkLayout.mockImplementationOnce(() => oldLayout);

      fireEvent.change(dslEditor(), {
        target: { value: 'flowchart LR\n    newest[Pending passive dimensions]' },
      });
      await waitFor(() => expect(appElkLayout.mock.calls.length).toBeGreaterThan(callsBefore));
      fireEvent.change(screen.getByLabelText('Custom Font Size'), { target: { value: '22' } });
      expect((screen.getByRole('button', { name: 'Apply Font Changes' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Report passive node dimensions' }));

      const pendingGraph = appElkLayout.mock.calls.at(-1)?.[0];
      resolveOld(await successfulElkLayout(pendingGraph));
      await waitFor(() => {
        expect(visibleNodes().map((node) => node.id)).toEqual(['newest']);
        expect(visibleNodes()[0].font?.size).toBe(26);
      });
      expect(appElkLayout.mock.calls.length).toBe(callsBefore + 1);
    });

    it('rebases a pending explicit reflow onto the newest applied font', async () => {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      const callsBefore = appElkLayout.mock.calls.length;
      let resolveOld!: (value: unknown) => void;
      const oldLayout = new Promise((resolve) => { resolveOld = resolve; });
      appElkLayout.mockImplementationOnce(() => oldLayout);
      fireEvent.click(screen.getByRole('button', { name: 'Reflow layout' }));
      await waitFor(() => expect(appElkLayout.mock.calls.length).toBeGreaterThan(callsBefore));
      fireEvent.change(screen.getByLabelText('Custom Font Size'), { target: { value: '23' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));

      const pendingGraph = appElkLayout.mock.calls.at(-1)?.[0];
      resolveOld(await successfulElkLayout(pendingGraph));
      await waitFor(() => {
        expect(appElkLayout.mock.calls.length).toBeGreaterThan(callsBefore + 1);
        expect(visibleNodes().every((node) => node.font?.size === 23)).toBe(true);
      });
    });

    it('refuses a later document load while source ownership is pending', async () => {
      const { container } = renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      const callsBefore = appElkLayout.mock.calls.length;
      let resolveOld!: (value: unknown) => void;
      const oldLayout = new Promise((resolve) => { resolveOld = resolve; });
      appElkLayout.mockImplementationOnce(() => oldLayout);
      fireEvent.change(dslEditor(), {
        target: { value: 'flowchart LR\n    stale[Stale pending diagram]' },
      });
      await waitFor(() => expect(appElkLayout.mock.calls.length).toBeGreaterThan(callsBefore));

      const loadedDocument = {
        schemaVersion: '1.0.0',
        metadata: { name: 'Newest load', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
        content: { format: 'graph-ir', graphIR: {
          version: '3.0.0', id: 'newest-load',
          nodes: [{ id: 'loaded', type: 'service', label: 'Loaded wins', position: { x: 7, y: 9 } }],
          edges: [],
        } },
        settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
      };
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File([JSON.stringify(loadedDocument)], 'newest.coral.json')] } });
      await waitFor(() => expect(document.body.textContent).toContain(
        'Finish the current diagram update before opening another document.',
      ));

      const pendingGraph = appElkLayout.mock.calls.at(-1)?.[0];
      resolveOld(await successfulElkLayout(pendingGraph));
      await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['stale']));
    });

    it('lets a later direct load suppress an older pending explicit reflow', async () => {
      const { container } = renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      const callsBefore = appElkLayout.mock.calls.length;
      let resolveOld!: (value: unknown) => void;
      const oldLayout = new Promise((resolve) => { resolveOld = resolve; });
      appElkLayout.mockImplementationOnce(() => oldLayout);
      fireEvent.click(screen.getByRole('button', { name: 'Reflow layout' }));
      await waitFor(() => expect(appElkLayout.mock.calls.length).toBeGreaterThan(callsBefore));

      const document = {
        schemaVersion: '1.0.0',
        metadata: { name: 'Load over reflow', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
        content: { format: 'graph-ir', graphIR: {
          version: '3.0.0', id: 'load-over-reflow',
          nodes: [{ id: 'load-wins', type: 'service', label: 'Load wins', position: { x: 71, y: 91 } }],
          edges: [],
        } },
        settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
      };
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File([JSON.stringify(document)], 'wins.coral.json')] } });
      await waitFor(() => expect(visibleNodes()[0]?.id).toBe('load-wins'));

      const pendingGraph = appElkLayout.mock.calls.at(-1)?.[0];
      resolveOld(await successfulElkLayout(pendingGraph));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(visibleNodes()[0]).toMatchObject({ id: 'load-wins', position: { x: 71, y: 91 } });
    });

    it.each(['label', 'position', 'waypoint', 'connection'] as const)(
      'refuses a later %s edit while source ownership is pending',
      async (kind) => {
        renderApp();
        await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(1));
        const originalIds = visibleNodes().map((node) => node.id);
        const callsBefore = appElkLayout.mock.calls.length;
        let resolveOld!: (value: unknown) => void;
        const oldLayout = new Promise((resolve) => { resolveOld = resolve; });
        appElkLayout.mockImplementationOnce(() => oldLayout);
        fireEvent.change(dslEditor(), {
          target: { value: 'flowchart LR\n    stale[Stale pending diagram]' },
        });
        await waitFor(() => expect(appElkLayout.mock.calls.length).toBeGreaterThan(callsBefore));

        if (kind === 'label') {
          fireEvent.click(screen.getByRole('button', { name: 'Select first diagram node' }));
          const label = await screen.findByDisplayValue('Loading URL failed');
          fireEvent.change(label, {
            target: { value: 'Newer direct label edit' },
          });
          fireEvent.blur(label);
        } else if (kind === 'position') {
          fireEvent.click(screen.getByRole('button', { name: 'Move first diagram node' }));
        } else if (kind === 'waypoint') {
          fireEvent.click(screen.getByRole('button', { name: 'Add test waypoint' }));
        } else {
          fireEvent.click(screen.getByRole('button', { name: 'Connect first and last nodes' }));
        }

        // The refused gesture is announced once, not silently dropped, and the
        // retained display does not show it.
        expect(guidanceRegion().textContent).toBe('Updating source. Canvas editing is temporarily unavailable.');
        expect(visibleNodes().map((node) => node.id)).toEqual(originalIds);
        if (kind === 'position') expect(visibleNodes()[0].position).not.toEqual({ x: 901, y: 902 });

        const pendingGraph = appElkLayout.mock.calls.at(-1)?.[0];
        resolveOld(await successfulElkLayout(pendingGraph));
        await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['stale']));
        expect(visibleEdges()).toHaveLength(0);
      },
    );

    // The original suppression invariant, restored for a pending layout that
    // no source owner holds: a later authored edit stales an in-flight Reflow.
    it.each(['label', 'position', 'waypoint', 'connection'] as const)(
      'suppresses a pending Reflow after a later %s edit',
      async (kind) => {
        renderApp();
        await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(1));
        const originalIds = visibleNodes().map((node) => node.id);
        const originalEdgeCount = visibleEdges().length;
        const callsBefore = appElkLayout.mock.calls.length;
        let resolveOld!: (value: unknown) => void;
        const oldLayout = new Promise((resolve) => { resolveOld = resolve; });
        appElkLayout.mockImplementationOnce(() => oldLayout);
        fireEvent.click(screen.getByRole('button', { name: 'Reflow layout' }));
        await waitFor(() => expect(appElkLayout.mock.calls.length).toBeGreaterThan(callsBefore));

        if (kind === 'label') {
          fireEvent.click(screen.getByRole('button', { name: 'Select first diagram node' }));
          const label = await screen.findByDisplayValue('Loading URL failed');
          fireEvent.change(label, {
            target: { value: 'Newer direct label edit' },
          });
          fireEvent.blur(label);
        } else if (kind === 'position') {
          fireEvent.click(screen.getByRole('button', { name: 'Move first diagram node' }));
        } else if (kind === 'waypoint') {
          fireEvent.click(screen.getByRole('button', { name: 'Add test waypoint' }));
        } else {
          fireEvent.click(screen.getByRole('button', { name: 'Connect first and last nodes' }));
        }
        expect(guidanceRegion().textContent ?? '').not.toMatch(/^(Updating|Finish the current)/);

        const pendingGraph = appElkLayout.mock.calls.at(-1)?.[0];
        resolveOld(await successfulElkLayout(pendingGraph));
        // Let the stale Reflow continuation run; no debounce length is assumed.
        await act(async () => {
          await oldLayout;
          for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(visibleNodes().map((node) => node.id)).toEqual(originalIds);
        if (kind === 'label') expect(visibleNodes()[0].lines.join(' ')).toContain('direct label');
        if (kind === 'position') expect(visibleNodes()[0].position).toEqual({ x: 901, y: 902 });
        if (kind === 'waypoint') expect(visibleEdges()[0].waypoints).toHaveLength(1);
        if (kind === 'connection') expect(visibleEdges().length).toBe(originalEdgeCount + 1);
      },
    );

    it('parses typed Coral DSL into nodes', async () => {
      renderApp();
      const editor = dslEditor();

      fireEvent.change(editor, {
        target: { value: '@diagram architecture\nalpha service as "Alpha"\nbeta database as "Beta"\n\nalpha -> beta' },
      });

      await waitFor(() => {
        expect(editor.value).toContain('Alpha');
      });
    });

    it('reports a syntax error without discarding the rest of the document', async () => {
      renderApp();

      fireEvent.change(dslEditor(), {
        target: { value: '@diagram architecture\nalpha service as "Alpha"\n!!!not coral!!!\ngamma service as "Gamma"' },
      });

      // The bad line is surfaced somewhere in the diagnostics surface.
      await waitFor(
        () => {
          expect(document.body.textContent).toMatch(/unexpected syntax|not coral/i);
        },
        { timeout: 3000 }
      );
    });

    it('surfaces an exact Unicode-spacing error while the author edits Coral source', async () => {
      const { container } = renderApp();
      loadEditableCoralSource(container, '@diagram architecture\nalpha service as "Alpha"');
      await waitFor(() => expect(dslEditor().value).toContain('@diagram architecture'));

      fireEvent.change(dslEditor(), {
        target: { value: '@diagram architecture\nalpha service as "Alpha"\nbeta\u00a0service as "Beta"\ngamma service as "Gamma"' },
      });

      await waitFor(() => {
        expect(document.body.textContent).toContain('Only ASCII spaces or tabs may separate Coral syntax');
      });
    });

    it('preserves the last good canvas when an invalid source parses no nodes', async () => {
      const { container } = renderApp();
      loadEditableCoralSource(container, '@diagram architecture\nalpha service as "Alpha"');
      await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['alpha']));
      const before = visibleNodes();

      fireEvent.change(dslEditor(), { target: { value: '!!!not coral!!!' } });

      await waitFor(() => {
        expect(document.body.textContent).toMatch(/unexpected syntax|not coral/i);
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(dslEditor().value).toBe('!!!not coral!!!');
      expect(visibleNodes()).toEqual(before);
    });
  });

  describe('format switching', () => {
    it('preserves historical Mermaid source and waypoints when conversion is unverified', async () => {
      renderApp();
      await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole('button', { name: 'Add fractional test waypoint' }));
      expect(visibleEdges()[0].waypoints).toHaveLength(1);

      const before = dslEditor().value;
      const group = screen.getByRole('radiogroup');
      const coral = within(group).getAllByRole('radio')
        .find((option) => /coral/i.test(option.textContent ?? ''))!;
      fireEvent.click(coral);
      await waitFor(() => expect(guidanceRegion().textContent).toMatch(/cannot be converted to 0\.2\.8 Coral/i));
      expect(dslEditor().value).toBe(before);
      await waitFor(() => expect(visibleEdges()[0].waypoints?.[0]).toMatchObject({
        x: 345.68679245283016,
        y: 238.45849056603774,
      }));
    });

    it('reprojects the diagram when the settings notation changes', async () => {
      const { container } = renderApp();
      loadEditableCoralSource(container, '@diagram flowchart\nfirst process\n');
      await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['first']));
      // The authored process is flowchart-specific. It must not silently
      // become an architecture service on a profile switch.
      expect(visibleNodes()[0]?.symbolId).toBe('flowchart-process');
      const notationSelect = screen.getAllByRole('combobox')
        .find((element) => (element as HTMLSelectElement).value === 'flowchart')!;
      fireEvent.change(notationSelect, { target: { value: 'architecture' } });
      await waitFor(() => expect(visibleNodes()[0]?.symbolId).toBeUndefined());
      expect(guidanceRegion().textContent).toMatch(/changed the Coral diagram type to architecture/i);
      expect(visibleNodes()[0].font?.size).toBe(26);
    });

    it('preserves positioned current Coral source when a visual edit syncs back to text', async () => {
      const { container } = renderApp();
      const source = '@diagram architecture\nalpha service as "Alpha" @ (100, 200)';
      loadEditableCoralSource(container, source);
      await waitFor(() => expect(visibleNodes()).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 150));
      fireEvent.click(screen.getByRole('button', { name: 'Move first diagram node' }));

      await waitFor(() => {
        expect(dslEditor().value).toContain('@diagram architecture');
        expect(dslEditor().value).toContain('alpha service as "Alpha"');
        expect(dslEditor().value).toContain('@ (901, 902)');
      });
    });

    it('refuses source-owned Coral conversion through Mermaid and preserves its source', async () => {
      const { container } = renderApp();
      const group = screen.getByRole('radiogroup');
      const radios = within(group).getAllByRole('radio');
      const mermaid = radios.find((option) => /mermaid/i.test(option.textContent ?? ''))!;
      const coral = radios.find((option) => /coral/i.test(option.textContent ?? ''))!;
      const source = '@diagram architecture\nalpha service as "Alpha"';
      loadEditableCoralSource(container, source);
      await waitFor(() => expect(visibleNodes()).toHaveLength(1));
      expect(coral.getAttribute('aria-checked')).toBe('true');
      fireEvent.click(mermaid);
      await waitFor(() => expect(guidanceRegion().textContent).toMatch(/Edit this 0\.2\.8 diagram in Coral source/i));
      expect(dslEditor().value).toBe(source);
      expect(coral.getAttribute('aria-checked')).toBe('true');
      expect(mermaid.getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('command palette', () => {
    it('opens on Ctrl+K and closes on Escape', async () => {
      renderApp();

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeDefined();

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    });

    it('lists save and export commands', async () => {
      renderApp();

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      await screen.findByRole('dialog');

      const options = screen.getAllByRole('option');
      const labels = options.map((o) => (o.textContent ?? '').toLowerCase()).join(' ');
      expect(labels).toContain('save');
      expect(labels).toContain('export');
    });
  });

  describe('document name', () => {
    it('accepts a new name', () => {
      renderApp();
      const name = screen.getByLabelText('Document name') as HTMLInputElement;

      fireEvent.change(name, { target: { value: 'Payments Architecture' } });

      expect(name.value).toBe('Payments Architecture');
    });
  });
});

describe('connection compatibility projection', () => {
  it('keeps concrete port occupancy for capacity validation', () => {
    expect(edgeForCompatibility({
      id: 'e', source: 'a', target: 'b', sourceHandle: 'access-out', targetHandle: 'in',
    })).toEqual({
      id: 'e', source: 'a', target: 'b', sourcePort: 'access', targetPort: 'in',
    });
  });
});

describe('App keyboard shortcuts (R-013)', () => {
  it('mounts the reflow, undo and redo shortcuts the palette advertises', async () => {
    renderApp();

    fireEvent.change(dslEditor(), { target: { value: '@diagram architecture\nalpha service as "Alpha"\nbeta database as "Beta"' } });
    await waitFor(() => expect(dslEditor().value).toContain('Alpha'));

    // None of these threw or were swallowed; before R-013 no listener existed.
    fireEvent.keyDown(document, { key: 'L', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true });

    expect(screen.getByLabelText('Diagram editor')).toBeDefined();
  });

  it('leaves text undo to the browser while typing in the editor', () => {
    renderApp();
    const editor = dslEditor();

    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    editor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('App graphic export (R-023, R-024, R-028)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    appElkLayout.mockReset();
    appElkLayout.mockImplementation(successfulElkLayout);
  });

  it('projects generated canonical nesting, positions, and routes into editor input', () => {
    const result = projectCanonicalGraph({
      version: '3.0.0', id: 'generated',
      nodes: [{
        id: 'group', type: 'group', position: { x: 10, y: 20 },
        children: [{ id: 'child', type: 'service', position: { x: 5, y: 6 } }],
      }],
      edges: [{
        id: 'route', source: 'group', target: 'child',
        routeIntent: { waypoints: [
          { id: 'w1', placement: { kind: 'absolute', position: { x: 11, y: 22 } } },
          { id: 'w2', placement: { kind: 'absolute', position: { x: 33, y: 44 } } },
        ] },
      }],
    });

    expect(result.nodes).toEqual([
      expect.objectContaining({ id: 'group', position: { x: 10, y: 20 } }),
      expect.objectContaining({ id: 'child', parent: 'group', position: { x: 5, y: 6 } }),
    ]);
    expect(result.edges[0].routingPoints).toEqual([{ x: 11, y: 22 }, { x: 33, y: 44 }]);
    expect(result.waypoints.get('route')).toEqual([
      { id: 'w1', x: 11, y: 22, type: 'corner' },
      { id: 'w2', x: 33, y: 44, type: 'corner' },
    ]);
  });

  it('composes reordered current content and bounds without changing canonical structure', () => {
    const canonical = {
      nodes: [{
        id: 'parent', type: 'group', position: { x: 1, y: 2 }, dimensions: { width: 100, height: 80 },
        children: [{ id: 'child', type: 'service', position: { x: 3, y: 4 } }],
      }, {
        id: 'canonical-only', type: 'service', position: { x: 5, y: 6 },
      }],
      edges: [],
    } as any;
    const snapshot = structuredClone(canonical);
    const serializedCurrent = {
      nodes: [
        { id: 'child', type: 'service', label: 'Updated child' },
        { id: 'parent', type: 'group', label: 'Updated parent' },
        { id: 'view-only', type: 'service', label: 'View only' },
      ],
      edges: [],
    } as any;
    const metadata = Symbol.for('@coral-viz/viz/node-view-metadata');
    const current = [{
      id: 'child', position: { x: 30, y: 40 }, width: 210, height: 90,
      measured: { width: 205, height: 85 },
      data: {
        label: 'Child', nodeType: 'service', symbolId: 'flowchart-terminal', width: 211, height: 91,
        [metadata]: { dimensionSource: 'editor-font' },
      },
    }, {
      id: 'parent', position: { x: 10, y: 20 }, width: 260, height: 180,
      data: { label: 'Parent', nodeType: 'group', symbolId: 'arch-container', [metadata]: { dimensionSource: 'graph' } },
    }, {
      id: 'view-only', position: { x: 99, y: 99 }, width: 10, height: 10,
      data: { label: 'View only', nodeType: 'service' },
    }] as any;

    const result = composeRenderGraph(canonical, serializedCurrent, current);

    expect(result.nodes.map((node: any) => node.id)).toEqual(['parent', 'canonical-only']);
    expect(result.nodes[0]).toMatchObject({
      label: 'Updated parent', position: { x: 10, y: 20 }, dimensions: { width: 260, height: 180 }, symbol: 'arch-container',
      children: [{
        id: 'child', label: 'Updated child', position: { x: 30, y: 40 }, dimensions: { width: 211, height: 91 }, symbol: 'flowchart-terminal',
      }],
    });
    expect(result.nodes[1]).toEqual(canonical.nodes[1]);
    expect(canonical).toEqual(snapshot);
  });

  it('exports canonical-only nodes and ignores view-only nodes in the composed App path', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let exported: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      if (blob.type === 'image/svg+xml') exported = blob;
      return 'blob:canonical-composition';
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    const loaded = {
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Canonical export', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: {
        format: 'graph-ir',
        graphIR: {
          version: '3.0.0', id: 'canonical-export',
          nodes: [
            { id: 'kept', type: 'service', label: 'Kept canonical', position: { x: 10, y: 20 } },
            { id: 'canonical-only', type: 'database', label: 'Canonical-only sentinel', position: { x: 30, y: 40 } },
          ],
          edges: [],
        },
      },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    };

    try {
      const { container } = renderApp();
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File([JSON.stringify(loaded)], 'canonical.coral.json')] },
      });
      await waitFor(() => expect(visibleNodes().map((node) => node.id))
        .toEqual(['kept', 'canonical-only']));
      fireEvent.click(screen.getByRole('button', { name: 'Perturb export-only view' }));
      await waitFor(() => expect(visibleNodes().map((node) => node.id))
        .toEqual(['kept', 'view-only']));

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click((await screen.findAllByRole('option'))
        .find((item) => /export svg/i.test(item.textContent ?? ''))!);
      await waitFor(() => expect(exported).not.toBeNull());
      const svg = await exported!.text();
      expect(svg).toContain('>Canonical-only</text>');
      expect(svg).not.toContain('View-only sentinel');
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('preloads exactly the faces a sequence SVG embeds before raster export (Slice 70)', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const blobs: Blob[] = [];
    const loadedWeights: string[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:sequence-${blobs.length}`;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn() } });
    vi.stubGlobal('FontFace', class MockFontFace {
      status = 'loaded';
      constructor(public family: string, _source: string, descriptors?: FontFaceDescriptors) {
        loadedWeights.push(String(descriptors?.weight ?? 'normal'));
      }
      async load() { return this; }
    });
    vi.stubGlobal('Image', class MockImage {
      src = '';
      async decode() {}
    });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({
        fillStyle: '', fillRect: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, mimeType) => callback(new Blob(['pixels'], { type: mimeType })));
    const message = (id: string, source: string, target: string, kind: string) => ({
      id, edgeId: id, sourceParticipantId: source, targetParticipantId: target, kind,
    });
    const loaded = {
      schemaVersion: '1.0.0',
      metadata: { name: 'Sequence export', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
      content: {
        format: 'graph-ir',
        graphIR: {
          version: '3.0.0', id: 'sequence-export',
          metadata: { notation: 'uml-sequence' }, profile: { id: 'uml', kind: 'sequence', version: '1.0.0' },
          nodes: [{ id: 'a', type: 'participant', label: 'A' }, { id: 'b', type: 'participant', label: 'B' }],
          edges: [
            { id: 'm1', source: 'a', target: 'b', type: 'sync' },
            { id: 'm2', source: 'b', target: 'a', type: 'return' },
          ],
          interaction: {
            participants: [{ id: 'a', nodeId: 'a' }, { id: 'b', nodeId: 'b' }], participantOrder: ['a', 'b'],
            messages: [message('m1', 'a', 'b', 'synchronous'), message('m2', 'b', 'a', 'return')],
            messageOrder: ['m1', 'm2'],
            fragments: [{ id: 'fragment-1', kind: 'alt', operands: [
              { id: 'fragment-1-operand-1', messageIds: ['m1'] }, { id: 'fragment-1-operand-2', messageIds: ['m2'] },
            ] }],
          },
        },
      },
      settings: {
        notation: 'uml-sequence', layout: { algorithm: 'layered', direction: 'DOWN' },
        font: { default: { family: 'Inter', size: 12, weight: 'normal' } },
      },
    };
    const chooseExport = async (pattern: RegExp) => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click((await screen.findAllByRole('option'))
        .find((item) => pattern.test(item.textContent ?? ''))!);
    };

    try {
      const { container } = renderApp();
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File([JSON.stringify(loaded)], 'sequence.coral.json')] },
      });
      await waitFor(() => expect(container.querySelector('[data-coral-sequence-fragment="fragment-1"]')).not.toBeNull());
      await chooseExport(/export svg/i);
      await waitFor(() => expect(blobs.some((blob) => blob.type === 'image/svg+xml')).toBe(true));
      await chooseExport(/export png/i);
      await waitFor(() => expect(blobs.some((blob) => blob.type === 'image/png')).toBe(true));
      const svg = await blobs.find((blob) => blob.type === 'image/svg+xml')!.text();
      const embedded = [...svg.matchAll(/font-weight:\s*(\d+)/g)].map((match) => match[1]).sort();
      expect(embedded).toEqual(['400', '700']);
      expect([...loadedWeights].sort()).toEqual(embedded);
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });

  it('uses the effective portable default for legacy SVG, HTML, and raster exports', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const blobs: Blob[] = [];
    const loadedFamilies: Array<{ family: string; weight: string }> = [];
    let urlSequence = 0;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return `blob:legacy-${++urlSequence}`;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn() } });
    vi.stubGlobal('FontFace', class MockFontFace {
      status = 'loaded';
      constructor(public family: string, _source: string, descriptors?: FontFaceDescriptors) {
        loadedFamilies.push({ family, weight: descriptors?.weight ?? 'normal' });
      }
      async load() { return this; }
    });
    vi.stubGlobal('Image', class MockImage {
      src = '';
      async decode() {}
    });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({
        fillStyle: '', fillRect: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, mimeType) => callback(new Blob(['pixels'], { type: mimeType })));
    const loaded = {
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Legacy export', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: {
        format: 'graph-ir',
        graphIR: {
          version: '3.0.0', id: 'legacy-export',
          nodes: [{ id: 'legacy', type: 'service', label: 'Legacy', position: { x: 10, y: 20 } }],
          edges: [],
        },
      },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    };
    const chooseExport = async (pattern: RegExp) => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click((await screen.findAllByRole('option'))
        .find((item) => pattern.test(item.textContent ?? ''))!);
    };

    try {
      const { container } = renderApp();
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File([JSON.stringify(loaded)], 'legacy.coral.json')] },
      });
      await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['legacy']));

      await chooseExport(/export svg/i);
      await waitFor(() => expect(blobs.some((blob) => blob.type === 'image/svg+xml')).toBe(true));
      await chooseExport(/export html/i);
      await waitFor(() => expect(blobs.some((blob) => blob.type === 'text/html')).toBe(true));
      await chooseExport(/export png/i);
      await waitFor(() => expect(blobs.some((blob) => blob.type === 'image/png')).toBe(true));

      const svgTexts = await Promise.all(blobs
        .filter((blob) => blob.type === 'image/svg+xml')
        .map((blob) => blob.text()));
      const html = await blobs.find((blob) => blob.type === 'text/html')!.text();
      expect(svgTexts.every((svg) => svg.includes('font-size="26"'))).toBe(true);
      expect(svgTexts.every((svg) => svg.includes('line-height="1.4"'))).toBe(true);
      expect(html).toContain('font-size="26"');
      expect(html).toContain('line-height="1.4"');
      expect(loadedFamilies).toEqual([{ family: 'Coral Lowfi Caveat', weight: '500' }]);
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });

  it('offers SVG, HTML, PNG and JPEG in the command palette', async () => {
    renderApp();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await screen.findByRole('dialog');

    const labels = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(labels.some((l) => /export svg/i.test(l))).toBe(true);
    expect(labels.some((l) => /export html/i.test(l))).toBe(true);
    expect(labels.some((l) => /export png/i.test(l))).toBe(true);
    expect(labels.some((l) => /export jpe?g/i.test(l))).toBe(true);
  });

  it('downloads an SVG of the current diagram', async () => {
    const created: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let captured: Blob | null = null;
    URL.createObjectURL = ((blob: Blob) => {
      captured = blob;
      created.push('url');
      return 'blob:mock';
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as unknown as typeof URL.revokeObjectURL;

    try {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      fireEvent.change(dslEditor(), { target: { value: 'flowchart TD\n Alpha[Alpha]\n Beta[(Beta)]' } });
      await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['Alpha', 'Beta']));

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      await screen.findByRole('dialog');
      const svgOption = screen.getAllByRole('option').find((o) => /export svg/i.test(o.textContent ?? ''))!;
      fireEvent.click(svgOption);

      await waitFor(() => expect(captured).not.toBeNull());
      expect(captured!.type).toBe('image/svg+xml');
      // This test covers the wiring: the command reaches the serializer and a
      // downloadable SVG blob comes back. The document's contents are asserted
      // against the serializer directly in @coral-viz/render's own tests.
      const text = await captured!.text();
      expect(text).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(text.trimEnd().endsWith('</svg>')).toBe(true);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('reports raster decode failures, suppresses download, and revokes the SVG URL', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:raster') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: vi.fn() },
    });
    vi.stubGlobal('FontFace', class MockFontFace {
      status = 'unloaded';
      async load() {
        this.status = 'loaded';
        return this;
      }
    });
    vi.stubGlobal('Image', class MockImage {
      src = '';
      decode = vi.fn().mockRejectedValue(new Error('decode failed'));
    });

    try {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      fireEvent.change(dslEditor(), { target: { value: 'flowchart TD\n Raster[Raster]' } });
      await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['Raster']));
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      const option = (await screen.findAllByRole('option'))
        .find((item) => /export png/i.test(item.textContent ?? ''))!;
      fireEvent.click(option);

      await waitFor(() => expect(screen.getAllByRole('alert').some((alert) =>
        /raster export.*decode failed/i.test(alert.textContent ?? ''))).toBe(true));
      expect(anchorClick).not.toHaveBeenCalled();
      expect(revoke).toHaveBeenCalledWith('blob:raster');
    } finally {
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });

  it('loads the exact faces before decode and downloads only after non-null canvas encoding', async () => {
    const events: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      events.push('download');
    });
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn((blob: Blob) => blob.type === 'image/svg+xml'
      ? 'blob:raster-svg'
      : 'blob:raster-download') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: vi.fn(() => events.push('font-add')) },
    });
    vi.stubGlobal('FontFace', class MockFontFace {
      status = 'unloaded';
      async load() {
        events.push('font-load');
        this.status = 'loaded';
        return this;
      }
    });
    vi.stubGlobal('Image', class MockImage {
      src = '';
      async decode() {
        events.push('decode');
      }
    });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({
        fillStyle: '',
        fillRect: vi.fn(),
        setTransform: vi.fn(),
        drawImage: vi.fn(() => events.push('draw')),
      }) as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, mimeType) => {
        events.push('encode');
        callback(new Blob(['pixels'], { type: mimeType }));
      });

    try {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      const option = (await screen.findAllByRole('option'))
        .find((item) => /export png/i.test(item.textContent ?? ''))!;
      fireEvent.click(option);

      await waitFor(() => expect(events).toContain('download'));
      expect(events.indexOf('font-load')).toBeLessThan(events.indexOf('font-add'));
      expect(events.indexOf('font-add')).toBeLessThan(events.indexOf('decode'));
      expect(events.indexOf('decode')).toBeLessThan(events.indexOf('draw'));
      expect(events.indexOf('draw')).toBeLessThan(events.indexOf('encode'));
      expect(events.indexOf('encode')).toBeLessThan(events.indexOf('download'));
      expect(revoke).toHaveBeenCalledWith('blob:raster-svg');
      expect(revoke).toHaveBeenCalledWith('blob:raster-download');
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });

  it('treats a null canvas blob as a visible failure with no download', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:null-encoding') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: vi.fn() },
    });
    vi.stubGlobal('FontFace', class MockFontFace {
      status = 'loaded';
      async load() { return this; }
    });
    vi.stubGlobal('Image', class MockImage {
      src = '';
      async decode() {}
    });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({
        fillStyle: '', fillRect: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(null));

    try {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      const option = (await screen.findAllByRole('option'))
        .find((item) => /export png/i.test(item.textContent ?? ''))!;
      fireEvent.click(option);

      await waitFor(() => expect(screen.getAllByRole('alert').some((alert) =>
        /raster export.*returned no image/i.test(alert.textContent ?? ''))).toBe(true));
      expect(anchorClick).not.toHaveBeenCalled();
      expect(revoke).toHaveBeenCalledWith('blob:null-encoding');
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['font rejection', /font load rejected/i],
    ['font status', /did not finish loading/i],
    ['null context', /canvas drawing is unavailable/i],
  ] as const)('reports %s without downloading and balances created URLs', async (stage, message) => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const create = vi.fn(() => 'blob:stage-failure');
    const revoke = vi.fn();
    URL.createObjectURL = create as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn() } });
    vi.stubGlobal('FontFace', class MockFontFace {
      status = stage === 'font status' ? 'error' : 'loaded';
      async load() {
        if (stage === 'font rejection') throw new Error('font load rejected');
        return this;
      }
    });
    vi.stubGlobal('Image', class MockImage {
      src = '';
      async decode() {}
    });
    const context = {
      fillStyle: '', fillRect: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => stage === 'null context' ? null : context);

    try {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click((await screen.findAllByRole('option'))
        .find((item) => /export png/i.test(item.textContent ?? ''))!);

      await waitFor(() => expect(screen.getAllByRole('alert').some((alert) =>
        message.test(alert.textContent ?? ''))).toBe(true));
      expect(anchorClick).not.toHaveBeenCalled();
      expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
    } finally {
      getContext.mockRestore();
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });

  it('lets only the latest overlapping raster attempt download', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let urlSequence = 0;
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => `blob:attempt-${++urlSequence}`) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: vi.fn() },
    });
    vi.stubGlobal('FontFace', class MockFontFace {
      status = 'loaded';
      async load() { return this; }
    });
    let imageNumber = 0;
    let releaseFirstDecode!: () => void;
    vi.stubGlobal('Image', class MockImage {
      src = '';
      readonly number = imageNumber++;
      decode() {
        return this.number === 0
          ? new Promise<void>((resolve) => { releaseFirstDecode = resolve; })
          : Promise.resolve();
      }
    });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({
        fillStyle: '', fillRect: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, mimeType) => callback(new Blob(['pixels'], { type: mimeType })));

    try {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click((await screen.findAllByRole('option'))
        .find((item) => /export png/i.test(item.textContent ?? ''))!);
      await waitFor(() => expect(imageNumber).toBe(1));

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click((await screen.findAllByRole('option'))
        .find((item) => /export jpe?g/i.test(item.textContent ?? ''))!);
      await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));

      releaseFirstDecode();
      await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:attempt-1'));
      expect(anchorClick).toHaveBeenCalledTimes(1);
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });

  it('does not add a superseded face after its load resolves', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const create = vi.fn(() => 'blob:face-attempt');
    URL.createObjectURL = create as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const addFace = vi.fn();
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: addFace } });
    let faceNumber = 0;
    let releaseFirstFace!: () => void;
    vi.stubGlobal('FontFace', class MockFontFace {
      status = 'loaded';
      readonly number = faceNumber++;
      async load() {
        if (this.number === 0) {
          await new Promise<void>((resolve) => { releaseFirstFace = resolve; });
        }
        return this;
      }
    });
    vi.stubGlobal('Image', class MockImage {
      src = '';
      async decode() {}
    });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({
        fillStyle: '', fillRect: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, mimeType) => callback(new Blob(['pixels'], { type: mimeType })));

    try {
      renderApp();
      await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click((await screen.findAllByRole('option'))
        .find((item) => /export png/i.test(item.textContent ?? ''))!);
      await waitFor(() => expect(faceNumber).toBe(1));

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      fireEvent.click((await screen.findAllByRole('option'))
        .find((item) => /export jpe?g/i.test(item.textContent ?? ''))!);
      await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
      expect(addFace).toHaveBeenCalledTimes(1);

      releaseFirstFace();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(create).toHaveBeenCalledTimes(2);
      expect(addFace).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      vi.unstubAllGlobals();
    }
  });
});

describe('App accessibility (R-014)', () => {
  it('closes the command palette on Escape from anywhere, not only its input', async () => {
    renderApp();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await screen.findByRole('dialog');

    fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('returns focus to where it was when the palette closes', async () => {
    renderApp();
    const editor = dslEditor();
    editor.focus();
    expect(document.activeElement).toBe(editor);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('returns focus to the palette invoker after opening non-modal Properties', async () => {
    renderApp();
    fireEvent.click(screen.getByLabelText('Close panel'));
    const editor = dslEditor();
    editor.focus();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    fireEvent.change(await screen.findByLabelText('Search commands'), {
      target: { value: 'Show Inspector' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Show Inspector/i }));

    await waitFor(() => expect(screen.getByLabelText('Properties panel')).toBeDefined());
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('restores the outer invoker after a palette-to-Preferences handoff', async () => {
    renderApp();
    const editor = dslEditor();
    editor.focus();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    fireEvent.change(await screen.findByLabelText('Search commands'), {
      target: { value: 'Preferences' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Preferences/i }));
    await screen.findByRole('dialog', { name: 'Preferences' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('announces layout and parse outcomes in a live region', async () => {
    renderApp();

    const live = screen.getByTestId('canvas-status');
    expect(live.getAttribute('aria-live')).toBe('polite');

    fireEvent.change(dslEditor(), { target: { value: '@diagram architecture\nalpha service as "Alpha"' } });
    await waitFor(() => expect(live!.textContent ?? '').toMatch(/parsed|laying out/i), {
      timeout: 3000,
    });
  });
});


describe('App precision node transactions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
    appElkLayout.mockReset();
    appElkLayout.mockImplementation(successfulElkLayout);
  });
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

  it('commits several node moves as one exact undo/redo transaction', async () => {
    renderApp();
    await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
    const before = visibleNodes().map((node) => node.position);
    click('Start test node drag');
    click('Continue test node drag');
    click('Continue test node drag');
    click('Finish test node drag');
    expect(visibleNodes()[0].position).toEqual({ x: 401, y: 402 });
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(visibleNodes().map((node) => node.position)).toEqual(before);
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Redo/ }));
    expect(visibleNodes()[0].position).toEqual({ x: 401, y: 402 });
  });

  it('rolls back blur, rejects late movement and accepts a fresh gesture', async () => {
    renderApp();
    await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
    const before = visibleNodes()[0].position;
    click('Start test node drag');
    click('Continue test node drag');
    fireEvent(window, new Event('blur'));
    expect(visibleNodes()[0].position).toEqual(before);
    click('Continue test node drag');
    click('Finish test node drag');
    expect(visibleNodes()[0].position).toEqual(before);
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(true);
    click('Start test node drag');
    click('Continue test node drag');
    click('Finish test node drag');
    expect(visibleNodes()[0].position).toEqual({ x: 401, y: 402 });
  });

  it('cancels a drag before reflow and rejects its late stop', async () => {
    renderApp();
    await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
    const before = visibleNodes()[0].position;
    click('Start test node drag');
    click('Continue test node drag');
    fireEvent.click(screen.getByRole('button', { name: /Reflow layout/i }));
    await waitFor(() => expect(visibleNodes()[0].position).toEqual(before));
    click('Finish test node drag');
    expect(visibleNodes()[0].position).toEqual(before);
  });
});


describe('App precision interruption isolation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
    appElkLayout.mockReset();
    appElkLayout.mockImplementation(successfulElkLayout);
  });
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

  it('keeps redo after a no-op drag and clears it after a changed drag', async () => {
    renderApp();
    await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
    click('Start test node drag');
    click('Finish test node drag');
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    click('Start test node drag');
    click('Stop unchanged test node drag');
    expect((screen.getByRole('button', { name: /^Redo/ }) as HTMLButtonElement).disabled).toBe(false);
    click('Start test node drag');
    click('Continue test node drag');
    click('Stop unchanged test node drag');
    expect((screen.getByRole('button', { name: /^Redo/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label')).toBe('Undo (1 available)');
  });

  it('rejects a late old-document stop when replacement reuses the node ID', async () => {
    renderApp();
    await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
    const id = visibleNodes()[0].id;
    click('Start test node drag');
    click('Continue test node drag');
    fireEvent.change(dslEditor(), { target: { value: `flowchart TD\n ${id}[Replacement]` } });
    await waitFor(() => expect(visibleNodes()).toHaveLength(1));
    expect(visibleNodes()[0].id).toBe(id);
    const replacementPosition = visibleNodes()[0].position;
    click('Finish test node drag');
    expect(visibleNodes()[0].position).toEqual(replacementPosition);
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(false);
    click('Start test node drag');
    click('Finish test node drag');
    expect(visibleNodes()[0].position).toEqual({ x: 401, y: 402 });
  });
});


it('keeps real node keyboard position changes after completed and cancelled pointer gestures', async () => {
  window.localStorage.clear();
  appElkLayout.mockReset();
  appElkLayout.mockImplementation(successfulElkLayout);
  renderApp();
  await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('button', { name: 'Start test node drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'Finish test node drag' }));
  fireEvent.keyDown(screen.getByTestId('keyboard-node'), { key: 'ArrowRight' });
  expect(visibleNodes()[0].position).toEqual({ x: 406, y: 402 });
  fireEvent.click(screen.getByRole('button', { name: 'Start test node drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue test node drag' }));
  fireEvent(window, new Event('blur'));
  fireEvent.keyDown(screen.getByTestId('keyboard-node'), { key: 'ArrowRight' });
  expect(visibleNodes()[0].position).toEqual({ x: 411, y: 402 });
});


it('rebases arrow input on rollback geometry while a pointer is still down', async () => {
  window.localStorage.clear();
  appElkLayout.mockReset();
  appElkLayout.mockImplementation(successfulElkLayout);
  renderApp();
  await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
  const before = visibleNodes()[0].position;
  fireEvent.click(screen.getByRole('button', { name: 'Start test node drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue test node drag' }));
  fireEvent.keyDown(screen.getByTestId('keyboard-node'), { key: 'ArrowRight' });
  expect(visibleNodes()[0].position).toEqual({ x: before.x + 5, y: before.y });
  await Promise.resolve();
  fireEvent.click(screen.getByRole('button', { name: 'Finish test node drag' }));
  expect(visibleNodes()[0].position).toEqual({ x: before.x + 5, y: before.y });
  fireEvent.keyDown(screen.getByTestId('keyboard-node'), { key: 'ArrowRight', shiftKey: true });
  expect(visibleNodes()[0].position).toEqual({ x: before.x + 25, y: before.y });
  fireEvent.keyDown(screen.getByTestId('keyboard-node'), { key: 'ArrowDown', shiftKey: true });
  expect(visibleNodes()[0].position).toEqual({ x: before.x + 25, y: before.y + 20 });
});


it('does not let a stopped keyboard bubble authorize a later pointer event', async () => {
  window.localStorage.clear();
  appElkLayout.mockReset();
  appElkLayout.mockImplementation(successfulElkLayout);
  renderApp();
  await waitFor(() => expect(visibleNodes().length).toBeGreaterThan(0));
  const before = visibleNodes()[0].position;
  fireEvent.click(screen.getByRole('button', { name: 'Start test node drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue test node drag' }));
  fireEvent.keyDown(screen.getByTestId('keyboard-node'), { key: 'ArrowLeft' });
  fireEvent.click(screen.getByRole('button', { name: 'Finish test node drag' }));
  expect(visibleNodes()[0].position).toEqual(before);
});


describe('App waypoint gesture transactions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
    appElkLayout.mockReset();
    appElkLayout.mockImplementation(successfulElkLayout);
    capturedWaypointGesture = null;
  });
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  const points = () => visibleEdges().flatMap((edge) => edge.waypoints ?? []);
  const undo = () => fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
  const redo = () => fireEvent.click(screen.getByRole('button', { name: /^Redo/ }));

  it('gives add, multi-move and remove one exact undo/redo step each', async () => {
    renderApp();
    await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(0));
    click('Add test waypoint');
    const added = points();
    expect(added).toHaveLength(1);
    undo();
    expect(points()).toEqual([]);
    redo();
    expect(points()).toEqual(added);
    click('Start test waypoint drag');
    click('Move test waypoint drag');
    click('Move test waypoint drag');
    click('End test waypoint drag');
    const moved = points();
    expect(moved[0]).toMatchObject({ id: added[0].id, x: 245, y: 267 });
    expect(screen.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label')).toBe('Undo (2 available)');
    undo();
    expect(points()).toEqual(added);
    redo();
    expect(points()).toEqual(moved);
    click('Remove test waypoint');
    expect(points()).toEqual([]);
    undo();
    expect(points()).toEqual(moved);
    redo();
    expect(points()).toEqual([]);
  }, 15_000);

  it('rolls back cancel and ignores stale callbacks after undo restores the same waypoint ID', async () => {
    renderApp();
    await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(0));
    click('Add test waypoint');
    const added = points();
    click('Start test waypoint drag');
    click('Move test waypoint drag');
    click('Cancel test waypoint drag');
    expect(points()).toEqual(added);
    click('End test waypoint drag');
    expect(points()).toEqual(added);
    click('Start test waypoint drag');
    click('Move test waypoint drag');
    undo();
    expect(points()).toEqual([]);
    redo();
    expect(points()).toEqual(added);
    click('Move test waypoint drag');
    click('End test waypoint drag');
    click('Cancel test waypoint drag');
    expect(points()).toEqual(added);
  }, 15_000);
});


describe('App waypoint interruption and no-op boundaries', () => {
  beforeEach(() => {
    window.localStorage.clear(); appElkLayout.mockReset(); appElkLayout.mockImplementation(successfulElkLayout);
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
  });
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  const points = () => visibleEdges().flatMap((edge) => edge.waypoints ?? []);

  it('rolls back before reflow snapshots and restores exact anchors on undo', async () => {
    renderApp();
    await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(0));
    click('Add test waypoint');
    const added = points();
    click('Start test waypoint drag');
    click('Move test waypoint drag');
    fireEvent.click(screen.getByRole('button', { name: /Reflow layout/i }));
    await waitFor(() => expect(points()).toEqual([]));
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(points()).toEqual(added);
    click('End test waypoint drag');
    click('Cancel test waypoint drag');
    expect(points()).toEqual(added);
    fireEvent.click(screen.getByRole('button', { name: /^Redo/ }));
    expect(points()).toEqual([]);
  });

  it('preserves redo for a no-op gesture and clears it for a changed operation', async () => {
    renderApp();
    await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(0));
    click('Add test waypoint');
    click('Start test waypoint drag');
    click('End test waypoint drag');
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    click('Start test waypoint drag');
    click('End unchanged test waypoint drag');
    expect((screen.getByRole('button', { name: /^Redo/ }) as HTMLButtonElement).disabled).toBe(false);
    click('Add test waypoint');
    expect((screen.getByRole('button', { name: /^Redo/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('rolls back waypoint preview on window blur without new history', async () => {
    renderApp();
    await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(0));
    click('Add test waypoint');
    const added = points();
    const count = screen.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label');
    click('Start test waypoint drag');
    click('Move test waypoint drag');
    fireEvent(window, new Event('blur'));
    expect(points()).toEqual(added);
    click('End test waypoint drag');
    expect(points()).toEqual(added);
    expect(screen.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label')).toBe(count);
  });
});


it('keeps route source precision through the opened current-source pipeline', async () => {
  window.localStorage.clear();
  appElkLayout.mockReset();
  appElkLayout.mockImplementation(successfulElkLayout);
  const exact = { x: 345.68679245283016, y: 238.45849056603774 };
  const source = '@diagram architecture\nalpha service as "Alpha"\nbeta database as "Beta"\ne = alpha -> beta\nroute edge e {\n precise = waypoint at (345.68679245283016, 238.45849056603774)\n}';
  const changed = '@diagram architecture\nalpha service as "Alpha"\nbeta database as "Beta"\ne = alpha -> beta\nroute edge e {\n precise = waypoint at (77.125, 88.375)\n}';
  const routePoint = (text: string) => {
    const graph = projectInstalledSourceToSuccessor028(text).graph;
    expect(graph?.edges).toHaveLength(1);
    const point = graph?.edges[0]?.routeIntent?.waypoints[0];
    expect(point?.placement.kind).toBe('absolute');
    return point!.placement.position!;
  };
  const blobs: Blob[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:source-route-save'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const { container } = renderApp();
  try {
    loadEditableCoralSource(container, source);
    await waitFor(() => expect(visibleEdges()).toHaveLength(1));
    expect(dslEditor().value).toBe(source);
    expect(routePoint(dslEditor().value)).toEqual(exact);
    // The canvas receives the same authored anchor, rather than a rounded
    // route generated from the source projection.
    expect(visibleEdges()[0].routingPoints).toEqual([exact]);
    expect(visibleEdges()[0].routeIntent?.waypoints?.[0]?.placement).toEqual({ kind: 'absolute', position: exact });

    fireEvent.change(dslEditor(), { target: { value: changed } });
    await waitFor(() => {
      expect(dslEditor().value).toBe(changed);
      expect(routePoint(dslEditor().value)).toEqual({ x: 77.125, y: 88.375 });
      expect(visibleEdges()[0].routingPoints).toEqual([{ x: 77.125, y: 88.375 }]);
      expect(visibleEdges()[0].routeIntent?.waypoints?.[0]?.placement)
        .toEqual({ kind: 'absolute', position: { x: 77.125, y: 88.375 } });
    });
    // Recovery and explicit save retain the source document verbatim; neither
    // is permitted to substitute a generated GraphIR/rounded route preview.
    await waitFor(() => {
      const recovered = JSON.parse(window.localStorage.getItem('coral-diagram-recovery')!);
      expect(recovered.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: changed });
    }, { timeout: 4000 });
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => expect(blobs).toHaveLength(1));
    const savedText = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blobs[0]!);
    });
    expect(JSON.parse(savedText).content).toEqual({ format: 'dsl', dslType: 'coral', text: changed });

    // A native same-text reentry must not reroute the accepted source or
    // reduce its fractional coordinates.
    const editor = dslEditor();
    editor.value = 'pending native replacement';
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, source);
    fireEvent.input(editor);
    await waitFor(() => {
      expect(dslEditor().value).toBe(source);
      expect(routePoint(dslEditor().value)).toEqual(exact);
      expect(visibleEdges()[0].routingPoints).toEqual([exact]);
      expect(visibleEdges()[0].routeIntent?.waypoints?.[0]?.placement).toEqual({ kind: 'absolute', position: exact });
    });
    fireEvent.change(dslEditor(), { target: { value: source } });
    await waitFor(() => {
      expect(dslEditor().value).toBe(source);
      expect(routePoint(dslEditor().value)).toEqual(exact);
      expect(visibleEdges()[0].routingPoints).toEqual([exact]);
    });
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    anchorClick.mockRestore();
  }
}, 10000);


it('keeps loaded editable graphs and exact anchors during notation projection and saves cleared maps', async () => {
  window.localStorage.clear(); appElkLayout.mockReset(); appElkLayout.mockImplementation(successfulElkLayout);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const exact = { x: 345.68679245283016, y: 238.45849056603774 };
  const loaded = {
    schemaVersion: '1.0.0',
    metadata: { name: 'Precise loaded graph', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
    content: { format: 'graph-ir', graphIR: { version: '3.0.0', id: 'precise-load',
      nodes: [{ id: 'alpha', type: 'service', label: 'Alpha', position: { x: 100, y: 200 } },
        { id: 'beta', type: 'database', label: 'Beta', position: { x: 500, y: 400 } }],
      edges: [{ id: 'alpha-beta', source: 'alpha', target: 'beta', routeIntent: { waypoints: [{ id: 'exact', placement: { kind: 'absolute', position: exact } }] } }],
    } }, settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
  };
  const { container } = renderApp();
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([JSON.stringify(loaded)], 'precise.coral.json')] } });
  await waitFor(() => expect(visibleEdges()).toHaveLength(1));
  await waitFor(() => expect(dslEditor().value).toContain('@graph {"id":"precise-load"}'));
  expect(visibleEdges()[0].waypoints).toEqual([expect.objectContaining(exact)]);
  const point = visibleEdges()[0].waypoints[0];
  expect(point).toMatchObject(exact);
  const symbol = visibleNodes()[0].symbolId;
  const notationSelect = screen.getAllByRole('combobox').find((element) => (element as HTMLSelectElement).value === 'flowchart');
  expect(notationSelect).toBeDefined();
  fireEvent.change(notationSelect!, { target: { value: 'architecture' } });
  await waitFor(() => expect(document.querySelector('[data-coral-scene-error]')).toBeNull(), { timeout: 3000 });
  await waitFor(() => expect(visibleNodes()[0].symbolId).not.toBe(symbol));
  expect(visibleNodes().map((node) => node.id)).toEqual(['alpha', 'beta']);
  expect(visibleEdges()[0].waypoints).toEqual([point]);

  const blobs: Blob[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:precision-save'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const savePoints = async () => {
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => expect(blobs.length).toBeGreaterThan(0));
    const blob = blobs.pop()!;
    const text = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    return (JSON.parse(text).content.graphIR.edges[0].routeIntent?.waypoints ?? [])
      .flatMap((waypoint: { placement: { kind: string; position?: typeof exact } }) =>
        waypoint.placement.kind === 'absolute' ? [waypoint.placement.position] : []);
  };
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Remove test waypoint' }));
    expect(await savePoints()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(await savePoints()).toEqual([exact]);
    fireEvent.click(screen.getByRole('button', { name: 'Reflow layout' }));
    await waitFor(() => expect(visibleEdges()[0].waypoints).toEqual([expect.objectContaining(exact)]));
    expect(await savePoints()).toEqual([exact]);
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(await savePoints()).toEqual([exact]);
    fireEvent.click(screen.getByRole('button', { name: /^Redo/ }));
    expect(await savePoints()).toEqual([exact]);
    // An explicit empty routing record wins over stale canonical points.
    const cleared = { ...loaded, edgeRouting: { 'alpha-beta': { isPinned: true, bendPoints: [], waypoints: [] } } };
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([JSON.stringify(cleared)], 'cleared.coral.json')] } });
    await waitFor(() => expect(visibleEdges()[0].waypoints).toEqual([]));
    expect(await savePoints()).toEqual([]);
    const computed = { ...loaded, edgeRouting: { 'alpha-beta': { isPinned: false, bendPoints: [{ x: 1, y: 2 }] } } };
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([JSON.stringify(computed)], 'computed.coral.json')] } });
    await waitFor(() => expect(visibleEdges()[0].waypoints).toEqual([expect.objectContaining(exact)]));
    expect(await savePoints()).toEqual([exact]);
    // A current source document, unlike GraphIR interchange preview, is the editable route.
    loadEditableCoralSource(container, '@diagram architecture\nreplacement service as "User replacement"', 'replacement.coral.json');
    await waitFor(() => expect(visibleNodes().map((node) => node.id)).toEqual(['replacement']));
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; anchorClick.mockRestore(); }
});

it('keeps modern recovered fractional anchors through a fresh font projection and recovery write', async () => {
  window.localStorage.clear(); appElkLayout.mockReset(); appElkLayout.mockImplementation(successfulElkLayout);
  const exact = { x: 345.68679245283016, y: 238.45849056603774 };
  const document = {
    schemaVersion: '1.0.0', metadata: { name: 'Recovered precision', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
    content: { format: 'graph-ir', graphIR: { version: '3.0.0', id: 'recovered-precision',
      nodes: [{ id: 'alpha', type: 'service', label: 'Alpha', position: { x: 100, y: 200 } }, { id: 'beta', type: 'database', label: 'Beta', position: { x: 500, y: 400 } }],
      edges: [{ id: 'alpha-beta', source: 'alpha', target: 'beta', routeIntent: { waypoints: [{ id: 'exact', placement: { kind: 'absolute', position: exact } }] } }],
    } }, settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
  };
  window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
    timestamp: Date.now(), documentName: 'Recovered precision', dslType: 'coral', notation: 'flowchart',
    dsl: '@diagram architecture\nalpha service as "Alpha"\nbeta database as "Beta"\nalpha -> beta via (345.69, 238.46)',
    nodePositions: { alpha: { x: 100, y: 200 }, beta: { x: 500, y: 400 } }, document,
  }));
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: /Restore recovered diagram/i }));
  await waitFor(() => expect(visibleEdges()).toHaveLength(1));
  expect(visibleEdges()[0].waypoints).toEqual([expect.objectContaining(exact)]);
  const point = visibleEdges()[0].waypoints[0];
  expect(point).toMatchObject(exact);
  fireEvent.change(screen.getByLabelText('Custom Font Size'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));
  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem('coral-diagram-recovery')!);
    expect(saved.document.settings.font.default.size).toBe(20);
    expect(saved.document.content.graphIR.edges[0].routeIntent.waypoints[0].placement.position).toEqual(exact);
  }, { timeout: 4000 });
  expect(visibleEdges()[0].waypoints).toEqual([point]);
}, 10000);

it('preserves opaque saved waypoint type metadata through load, save, undo and redo', async () => {
  window.localStorage.clear(); appElkLayout.mockReset(); appElkLayout.mockImplementation(successfulElkLayout);
  const point = { id: 'opaque-point', x: 150.125, y: 210.375, type: 'curve' };
  const loaded = {
    schemaVersion: '1.0.0', metadata: { name: 'Opaque waypoint', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
    content: { format: 'graph-ir', graphIR: { version: '3.0.0', id: 'opaque-waypoint',
      nodes: [{ id: 'alpha', type: 'service', label: 'Alpha' }, { id: 'beta', type: 'database', label: 'Beta' }],
      edges: [{ id: 'alpha-beta', source: 'alpha', target: 'beta' }],
    } }, settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    edgeRouting: { 'alpha-beta': { isPinned: true, bendPoints: [], waypoints: [point] } },
  };
  const { container } = renderApp();
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([JSON.stringify(loaded)], 'opaque.coral.json')] } });
  await waitFor(() => expect(dslEditor().value).toContain('@graph {"id":"opaque-waypoint"}'));
  expect(visibleEdges()[0].waypoints).toEqual([point]);
  const blobs: Blob[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:opaque-save'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const savedPoints = async () => {
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => expect(blobs.length).toBeGreaterThan(0));
    const blob = blobs.pop()!;
    const text = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    return JSON.parse(text).edgeRouting?.['alpha-beta']?.waypoints ?? [];
  };
  try {
    expect(await savedPoints()).toEqual([point]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove test waypoint' }));
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(visibleEdges()[0].waypoints).toEqual([point]);
    expect(await savedPoints()).toEqual([point]);
    fireEvent.click(screen.getByRole('button', { name: /^Redo/ }));
    expect(visibleEdges()[0].waypoints).toBeUndefined();
    expect(await savedPoints()).toEqual([]);
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; anchorClick.mockRestore(); }
});

it('clears waypoint state when genuine text replaces the graph with an empty document', async () => {
  window.localStorage.clear(); appElkLayout.mockReset(); appElkLayout.mockImplementation(successfulElkLayout);
  renderApp();
  await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(0));
  const originalText = dslEditor().value;
  const originalEdgeId = visibleEdges()[0].id;
  fireEvent.click(screen.getByRole('button', { name: 'Add fractional test waypoint' }));
  expect(visibleEdges().flatMap((edge) => edge.waypoints ?? [])).toHaveLength(1);
  fireEvent.change(dslEditor(), { target: { value: '' } });
  await waitFor(() => expect(visibleNodes()).toEqual([]));
  await waitFor(() => {
    const raw = window.localStorage.getItem('coral-diagram-recovery');
    expect(raw).not.toBeNull();
    const recovery = JSON.parse(raw!);
    expect(recovery.dsl).toBe('');
    expect(recovery.document.content).toEqual({ format: 'dsl', dslType: 'mermaid', text: '' });
    expect(recovery.document.edgeRouting).toBeUndefined();
  }, { timeout: 3000 });
  const blobs: Blob[] = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:empty-save'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => expect(blobs).toHaveLength(1));
    const text = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[0]); });
    expect(JSON.parse(text).edgeRouting).toBeUndefined();
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; anchorClick.mockRestore(); }
  fireEvent.change(dslEditor(), { target: { value: originalText } });
  await waitFor(() => expect(visibleEdges().some((edge) => edge.id === originalEdgeId)).toBe(true));
  expect(visibleEdges().flatMap((edge) => edge.waypoints ?? [])).toEqual([]);
}, 10000);


// The pre-0.2.8 mutable Mermaid startup had no source-faithful edge removal.
// Current source-owned edge deletion is covered by the 0.2.8 controller and
// browser journeys; this characterization is retained only as historical code.
it.skip('historical Mermaid canvas edge removal and recovery', async () => {
  window.localStorage.clear(); appElkLayout.mockReset(); appElkLayout.mockImplementation(successfulElkLayout);
  renderApp();
  await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(1));
  fireEvent.click(screen.getByRole('button', { name: 'Add test waypoint' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add other test waypoint' }));
  const removedId = visibleEdges()[0].id;
  const keptId = visibleEdges()[1].id;
  const keptPoints = visibleEdges()[1].waypoints;
  fireEvent.click(screen.getByRole('button', { name: 'Start test waypoint drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move test waypoint drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove first test edge' }));
  expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => {
    const raw = window.localStorage.getItem('coral-diagram-recovery');
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw!).document;
    expect(saved.content.graphIR.edges.some((edge: any) => edge.id === removedId)).toBe(false);
    expect(saved.edgeRouting[removedId]).toBeUndefined();
    expect(saved.edgeRouting[keptId].waypoints).toEqual(keptPoints);
  }, { timeout: 3000 });
  let downloaded: Blob | undefined;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn((blob: Blob) => { downloaded = blob; return 'blob:edge-removal-save'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    expect(downloaded).toBeDefined();
    const text = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(downloaded!); });
    const saved = JSON.parse(text);
    expect(saved.edgeRouting[removedId]).toBeUndefined();
    expect(saved.edgeRouting[keptId].waypoints).toEqual(keptPoints);
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; anchorClick.mockRestore(); }
  fireEvent.click(screen.getByRole('button', { name: 'Readd removed test edge' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move test waypoint drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'End test waypoint drag' }));
  expect(visibleEdges().find((edge) => edge.id === removedId)?.waypoints).toBeUndefined();
  expect(visibleEdges().find((edge) => edge.id === keptId)?.waypoints).toEqual(keptPoints);
}, 10000);


it.each(['Replace first test edge', 'Reconnect first test edge'])('invalidates obsolete waypoint history on %s while preserving other anchors', async (action) => {
  window.localStorage.clear(); appElkLayout.mockReset(); appElkLayout.mockImplementation(successfulElkLayout);
  renderApp();
  await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(1));
  fireEvent.click(screen.getByRole('button', { name: 'Add test waypoint' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add other test waypoint' }));
  const kept = visibleEdges()[1];
  fireEvent.click(screen.getByRole('button', { name: 'Start test waypoint drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move test waypoint drag' }));
  fireEvent.click(screen.getByRole('button', { name: action }));
  expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled)
    .toBe(action.startsWith('Replace'));
  expect(visibleEdges().filter((edge) => edge.id !== kept.id).flatMap((edge) => edge.waypoints ?? [])).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Move test waypoint drag' }));
  fireEvent.click(screen.getByRole('button', { name: 'End test waypoint drag' }));
  expect(visibleEdges().filter((edge) => edge.id !== kept.id).flatMap((edge) => edge.waypoints ?? [])).toEqual([]);
  expect(visibleEdges().find((edge) => edge.id === kept.id)?.waypoints).toEqual(kept.waypoints);
});

it('preserves waypoint history for unchanged reconnection, selection, and unrelated edge addition', async () => {
  window.localStorage.clear(); appElkLayout.mockReset(); appElkLayout.mockImplementation(successfulElkLayout);
  renderApp();
  await waitFor(() => expect(visibleEdges().length).toBeGreaterThan(1));
  fireEvent.click(screen.getByRole('button', { name: 'Add test waypoint' }));
  const original = visibleEdges()[0];
  const undoLabel = screen.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label');
  for (const action of ['Reconnect unchanged test edge', 'Select first test edge', 'Add unrelated test edge']) {
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(screen.getByRole('button', { name: /^Undo/ }).getAttribute('aria-label')).toBe(undoLabel);
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(visibleEdges().find((edge) => edge.id === original.id)?.waypoints).toEqual(original.waypoints);
  }
  fireEvent.click(screen.getByRole('button', { name: /^Undo/ }));
  expect(visibleEdges().find((edge) => edge.id === original.id)?.waypoints).toBeUndefined();
});

describe('App offline delivery retirement (R-056)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('unregisters only the same-origin /coral/ worker and deletes only coral-shell caches on mount', async () => {
    const origin = window.location.origin;
    const coral = { scope: `${origin}/coral/`, unregister: vi.fn(async () => true) };
    const peer = { scope: `${origin}/peer/`, unregister: vi.fn(async () => true) };
    const register = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn(async () => [coral, peer]), register },
    });
    const deleteCache = vi.fn(async () => true);
    vi.stubGlobal('caches', {
      keys: vi.fn(async () => ['coral-shell-0.2.5', 'peer-cache', 'coral-shell-0.2.4', 'coral-other']),
      delete: deleteCache,
    });
    renderApp();
    await waitFor(() => expect(coral.unregister).toHaveBeenCalledOnce());
    await waitFor(() => expect(deleteCache).toHaveBeenCalledTimes(2));
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual(['coral-shell-0.2.5', 'coral-shell-0.2.4']);
    expect(peer.unregister).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
