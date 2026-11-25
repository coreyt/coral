/** Slice 60 C5 inspector: Symbol summary, Ports and the symbol editor view
 * (c5-design.md "Inspector", "Symbol editor", "Accessibility and keyboard"). */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { documentCatalog029, projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { InspectorPane, type InspectorPaneProps } from '../../src/components/InspectorPane';

const ARTWORK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>';
const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  description "Reads values"', '  tags "sensor" "iot"', '  size 60 x 40', '  outline ellipse',
  '  source "Drawn for tests"', '  license "CC0-1.0"', '  anchor core [x: 0.5, y: 0.5, exit: E]',
  '  login port [direction: in, maxConnections: 2]', '  deep port [direction: out, anchor: core]',
  '  artwork svg """', ARTWORK, '"""', '}', 'g service [symbol: "local.probe"]', ''].join('\n');

const definition = projectInstalledSourceToSuccessor028(SOURCE).graph!.userSymbols029![0]!;
const symbol = documentCatalog029('architecture', [definition]).userSymbols.get('local.probe')!;
const node = { id: 'g', type: 'symbol', position: { x: 0, y: 0 }, data: { label: 'Gate', canonical: {} } } as any;

function props(overrides: Partial<InspectorPaneProps> = {}): InspectorPaneProps {
  return {
    selectedNode: node, activeTab: 'selection', onTabChange: vi.fn(), onDeselectNode: vi.fn(),
    documentSettings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'DOWN' } },
    selectedPreset: 'custom', fontDraft: { default: { family: 'system-ui', size: 14, weight: 'normal', lineHeight: 1.3 } },
    onFontDraftChange: vi.fn(), documentKey: 1, availableNotations: [{ id: 'architecture', name: 'Architecture' }],
    onDocumentSettingsChange: vi.fn(), onPresetChange: vi.fn(), onApplyLayout: vi.fn(), onPropertyChange: vi.fn(),
    onAddProperty: vi.fn(), onRemoveProperty: vi.fn(), theme: {},
    userSymbol029: { definition, symbol, digest: 'sha256:abc123' },
    ports029: [
      { id: 'login', direction: 'in', maxConnections: 2, owner: 'symbol', ownerName: 'Probe' },
      { id: 'ingest', direction: 'in', label: 'Writes', owner: 'node' },
      { id: 'yes', direction: 'out', label: 'Yes', owner: 'catalog', ownerName: 'Decision' },
    ],
    onPortFieldsEdit029: vi.fn(() => true), onSymbolDefinitionEdit029: vi.fn(() => true),
    ...overrides,
  };
}

describe('inspector Symbol summary (R-065 AC-2)', () => {
  it('shows name, description, tags, provenance, license and digest', () => {
    render(<InspectorPane {...props()} />);
    const summary = screen.getByRole('group', { name: 'Symbol' });
    for (const text of ['Probe', 'local.probe', 'Reads values', 'sensor, iot', 'Drawn for tests', 'CC0-1.0',
      'sha256:abc123']) expect(within(summary).getByText(text)).toBeTruthy();
    expect(within(summary).getByRole('button', { name: 'Edit symbol' })).toBeTruthy();
  });

  it('is absent for a node without a user symbol', () => {
    render(<InspectorPane {...props({ userSymbol029: undefined })} />);
    expect(screen.queryByRole('group', { name: 'Symbol' })).toBeNull();
  });
});

describe('inspector Ports (R-065 AC-5)', () => {
  it('edits the label and limit of a port authored on the node, committing on Enter and blur', () => {
    const onPortFieldsEdit029 = vi.fn(() => true);
    render(<InspectorPane {...props({ onPortFieldsEdit029 })} />);
    const label = screen.getByLabelText('Label for port ingest');
    fireEvent.change(label, { target: { value: 'Stores' } });
    fireEvent.keyDown(label, { key: 'Enter' });
    expect(onPortFieldsEdit029).toHaveBeenLastCalledWith('g', 'ingest', { label: 'Stores' });
    const limit = screen.getByLabelText('Limit for port ingest');
    fireEvent.change(limit, { target: { value: '3' } });
    fireEvent.blur(limit);
    expect(onPortFieldsEdit029).toHaveBeenLastCalledWith('g', 'ingest', { label: 'Writes', maxConnections: 3 });
  });

  it('reverts on Escape without closing the panel, and shows other ports read-only', () => {
    const onClose = vi.fn();
    const onPortFieldsEdit029 = vi.fn(() => true);
    render(<InspectorPane {...props({ onClose, onPortFieldsEdit029 })} />);
    const label = screen.getByLabelText('Label for port ingest') as HTMLInputElement;
    fireEvent.change(label, { target: { value: 'Draft' } });
    fireEvent.keyDown(label, { key: 'Escape' });
    expect(label.value).toBe('Writes');
    expect(onClose).not.toHaveBeenCalled();
    expect(onPortFieldsEdit029).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Label for port login')).toBeNull();
    expect(screen.getByText('Defined by Probe')).toBeTruthy();
    expect(screen.getByText('Defined by Decision')).toBeTruthy();
  });

  it('reverts a refused commit', () => {
    render(<InspectorPane {...props({ onPortFieldsEdit029: vi.fn(() => false) })} />);
    const limit = screen.getByLabelText('Limit for port ingest') as HTMLInputElement;
    fireEvent.change(limit, { target: { value: '0' } });
    fireEvent.keyDown(limit, { key: 'Enter' });
    expect(limit.value).toBe('');
  });
});

describe('symbol editor view (design item 3)', () => {
  function open(overrides: Partial<InspectorPaneProps> = {}) {
    const onSymbolDefinitionEdit029 = overrides.onSymbolDefinitionEdit029 ?? vi.fn(() => true);
    render(<InspectorPane {...props({ ...overrides, onSymbolDefinitionEdit029 })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit symbol' }));
    return onSymbolDefinitionEdit029;
  }

  it('opens on the Name field and returns focus to Edit symbol', () => {
    open();
    expect(screen.getByRole('heading', { name: 'Symbol: Probe' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to node' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit symbol' }));
  });

  it('commits each field as the next definition', () => {
    const commit = open();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Sensor' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition, name: 'Sensor' });
    fireEvent.change(screen.getByLabelText('Outline'), { target: { value: 'diamond' } });
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition, outline: 'diamond' });
    const tags = screen.getByLabelText('Tags');
    fireEvent.change(tags, { target: { value: 'a, b , ,c' } });
    fireEvent.blur(tags);
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition, tags: ['a', 'b', 'c'] });
    const width = screen.getByLabelText('Width');
    fireEvent.change(width, { target: { value: '72' } });
    fireEvent.keyDown(width, { key: 'Enter' });
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition, size: { width: 72, height: 40 } });
    const description = screen.getByLabelText('Description');
    fireEvent.change(description, { target: { value: '' } });
    fireEvent.blur(description);
    const { description: _description, ...withoutDescription } = definition;
    expect(commit).toHaveBeenLastCalledWith('local.probe', withoutDescription);
  });

  it('edits anchors with numeric fields and shows the interior exit ray in a display-only preview', () => {
    const commit = open();
    expect(screen.getByRole('img', { name: 'Preview of Probe: 1 anchor, 2 ports' })).toBeTruthy();
    expect(document.querySelectorAll('[data-coral-exit-ray]')).toHaveLength(1);
    const x = screen.getByLabelText('X for anchor core');
    fireEvent.change(x, { target: { value: '0.25' } });
    fireEvent.keyDown(x, { key: 'Enter' });
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition,
      anchors: [{ kind: 'interior', id: 'core', x: 0.25, y: 0.5, exit: 'E' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Add boundary anchor' }));
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition,
      anchors: [...definition.anchors, { kind: 'boundary', id: 'anchor1', side: 'N', at: 0.5 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove anchor core' }));
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition, anchors: [] });
  });

  it('edits ports: direction, anchor, label, limit, add and remove', () => {
    const commit = open();
    fireEvent.change(screen.getByLabelText('Anchor for port login'), { target: { value: 'W' } });
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition,
      ports: [{ ...definition.ports[0]!, anchor: 'W' }, definition.ports[1]!] });
    const limit = screen.getByLabelText('Limit for port login');
    fireEvent.change(limit, { target: { value: '' } });
    fireEvent.blur(limit);
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition,
      ports: [{ id: 'login', direction: 'in' }, definition.ports[1]!] });
    fireEvent.change(screen.getByLabelText('New port ID'), { target: { value: 'aux' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add port' }));
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition,
      ports: [...definition.ports, { id: 'aux', direction: 'inout' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove port deep' }));
    expect(commit).toHaveBeenLastCalledWith('local.probe', { ...definition, ports: [definition.ports[0]!] });
  });

  it('reverts a refused field and rejects a non-number without committing', () => {
    const commit = open({ onSymbolDefinitionEdit029: vi.fn(() => false) });
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Sensor' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(name.value).toBe('Probe');
    const at = screen.getByLabelText('Height') as HTMLInputElement;
    fireEvent.change(at, { target: { value: 'abc' } });
    fireEvent.keyDown(at, { key: 'Enter' });
    expect(at.value).toBe('40');
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

describe('inspector source editability (Slice 60 C5)', () => {
  it('enables the new controls under the GraphIR property lock and disables them when the source is not editable', () => {
    const { unmount } = render(<InspectorPane {...props({ mutationsDisabled: true })} />);
    expect((screen.getByLabelText('Label for port ingest') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Edit symbol' }) as HTMLButtonElement).disabled).toBe(false);
    unmount();
    render(<InspectorPane {...props({ sourceEditable029: false })} />);
    expect((screen.getByLabelText('Label for port ingest') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Edit symbol' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('revision-bound field requests', () => {
  it.each(['Escape', 'replacement', 'unmount'] as const)('cancels a deferred commit on %s', async cause => {
    const { Field029 } = await import('../../src/components/SymbolEditor029');
    const commit = vi.fn(() => true);
    const view = render(<Field029 label="Pending field" value="old" onCommit={commit}
      commitState={{ revision: 1, pending: true }} />);
    const input = screen.getByLabelText('Pending field') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'draft' } });
    fireEvent.blur(input);
    expect(input.value).toBe('draft');
    expect(commit).not.toHaveBeenCalled();
    if (cause === 'unmount') view.unmount();
    else {
      if (cause === 'Escape') fireEvent.keyDown(input, { key: 'Escape' });
      view.rerender(<Field029 label="Pending field" value="old" onCommit={commit}
        commitState={{ revision: cause === 'replacement' ? 2 : 1, pending: false }} />);
      expect(input.value).toBe('old');
    }
    expect(commit).not.toHaveBeenCalled();
  });
});

it('cancels an earlier deferred field edit when the author returns to its committed value', async () => {
  const { Field029 } = await import('../../src/components/SymbolEditor029');
  const commit = vi.fn(() => true);
  const state = { revision: 1, pending: true };
  const view = render(<Field029 label="Reverted field" value="old" onCommit={commit} commitState={state} />);
  const input = screen.getByLabelText('Reverted field');
  fireEvent.change(input, { target: { value: 'draft' } });
  fireEvent.blur(input);
  fireEvent.change(input, { target: { value: 'old' } });
  fireEvent.blur(input);
  view.rerender(<Field029 label="Reverted field" value="old" onCommit={commit}
    commitState={{ ...state, pending: false }} />);
  expect(commit).not.toHaveBeenCalled();
});

it('does not carry a pending port label to another node with the same port ID', () => {
  const commit = vi.fn(() => true);
  const initial = props({ onPortFieldsEdit029: commit, sourceCommitState029: { revision: 1, pending: true } });
  const view = render(<InspectorPane {...initial} />);
  const label = screen.getByLabelText('Label for port ingest');
  fireEvent.change(label, { target: { value: 'Old node draft' } });
  fireEvent.blur(label);
  const replacement = { ...initial, selectedNode: { ...node, id: 'other' } };
  view.rerender(<InspectorPane {...replacement} />);
  view.rerender(<InspectorPane {...replacement} sourceCommitState029={{ revision: 1, pending: false }} />);
  expect(commit).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Label for port ingest') as HTMLInputElement).value).toBe('Writes');
});

it('cancels a pending definition field when selection changes as the parse settles', () => {
  const commit = vi.fn(() => true);
  const initial = props({ onSymbolDefinitionEdit029: commit,
    sourceCommitState029: { revision: 1, pending: true } });
  const view = render(<InspectorPane {...initial} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit symbol' }));
  const name = screen.getByLabelText('Name');
  fireEvent.change(name, { target: { value: 'Cancelled owner draft' } });
  fireEvent.blur(name);
  view.rerender(<InspectorPane {...initial} selectedNode={{ ...node, id: 'other' }}
    sourceCommitState029={{ revision: 1, pending: false }} />);
  expect(commit).not.toHaveBeenCalled();
});
