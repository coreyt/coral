/**
 * InspectorPane Tests
 *
 * Behavioral tests for the flattened InspectorPane component.
 * Auto-switches between document settings and node properties based on selection.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InspectorPane, type InspectorPaneProps } from '../../src/components/InspectorPane';

const settingsPanelProps = vi.hoisted(() => vi.fn());
const nodePropertiesPanelProps = vi.hoisted(() => vi.fn());

vi.mock('@coral-viz/viz', () => ({
  SettingsPanel: (props: unknown) => {
    settingsPanelProps(props);
    return <div data-testid="settings-panel" />;
  },
  NodePropertiesPanel: (props: unknown) => {
    nodePropertiesPanelProps(props);
    return <div data-testid="properties-panel" />;
  },
}));

const defaultTheme: Record<string, string> = {
  inspectorBg: '#252526',
  inspectorBorder: '#333333',
  inspectorHeaderBg: '#1e1e1e',
  inspectorText: '#cccccc',
  tabActiveBg: '#2d2d2d',
  tabActiveText: '#ffffff',
  tabActiveIndicator: '#007acc',
  tabInactiveText: '#888888',
  lineNumbersText: '#555555',
};

function defaultProps(overrides: Partial<InspectorPaneProps> = {}): InspectorPaneProps {
  return {
    selectedNode: null,
    activeTab: 'selection',
    onTabChange: vi.fn(),
    onDeselectNode: vi.fn(),
    documentSettings: {
      notation: 'flowchart',
      layout: { algorithm: 'layered', direction: 'DOWN' },
    },
    selectedPreset: 'custom',
    fontDraft: {
      default: { family: 'system-ui', size: 14, weight: 'normal', lineHeight: 1.3 },
    },
    onFontDraftChange: vi.fn(),
    documentKey: 7,
    availableNotations: [{ id: 'flowchart', name: 'Flowchart' }],
    onDocumentSettingsChange: vi.fn(),
    onPresetChange: vi.fn(),
    onApplyLayout: vi.fn(),
    onApplyFont: vi.fn(),
    onPropertyChange: vi.fn(),
    onAddProperty: vi.fn(),
    onRemoveProperty: vi.fn(),
    theme: defaultTheme,
    ...overrides,
  };
}

const mockNode = {
  id: 'n1',
  type: 'symbol',
  position: { x: 0, y: 0 },
  data: { label: 'Test Node' },
} as any;

describe('InspectorPane', () => {
  it('discloses Exact geometry and keeps pin independent from release', () => {
    const onToggleNodePin = vi.fn();
    const onReleaseNodePosition = vi.fn();
    const exactNode = {
      ...mockNode,
      position: { x: 12, y: 34 },
      data: { ...mockNode.data, authoredPosition: { x: 12, y: 34 }, pinned: true, canonical: {} },
    };
    render(<InspectorPane {...defaultProps({
      selectedNode: exactNode,
      onToggleNodePin,
      onReleaseNodePosition,
    })} />);

    expect(screen.getByText('Exact position @ 12, 34')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Unpin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release position' }));
    expect(onToggleNodePin).toHaveBeenCalledWith('n1');
    expect(onReleaseNodePosition).toHaveBeenCalledWith('n1');
  });

  // S93-WI-03: geometry comes from the authored view data, never from the
  // geometry-free canonical projection or the resolved display coordinate.
  it.each([
    ['layout-managed', {}, 'Position is layout-managed', 'Pin', false],
    ['exact unpinned', { authoredPosition: { x: 5, y: 6 } }, 'Exact position @ 5, 6', 'Pin', true],
    ['exact pinned', { authoredPosition: { x: 5, y: 6 }, pinned: true }, 'Exact position @ 5, 6', 'Unpin', true],
  ] as const)('shows %s geometry and matching actions', (_name, data, text, pinLabel, release) => {
    render(<InspectorPane {...defaultProps({
      selectedNode: { ...mockNode, position: { x: 105, y: 206 }, parentId: 'group',
        data: { ...mockNode.data, ...data, canonical: {} } },
    })} />);
    expect(screen.getByText(text)).toBeDefined();
    expect(screen.getByRole('button', { name: pinLabel })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Release position' }) !== null).toBe(release);
  });

  it('requires explicit Coral conversion before Exact editing', () => {
    const onConvertToCoral = vi.fn();
    render(<InspectorPane {...defaultProps({
      selectedNode: mockNode,
      sourceFormat: 'mermaid',
      onConvertToCoral,
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Coral to edit Exact position' }));
    expect(onConvertToCoral).toHaveBeenCalledOnce();
  });

  it('exposes controlled Selection and Diagram tabs', () => {
    render(<InspectorPane {...defaultProps()} />);
    expect(screen.getByRole('tab', { name: 'Selection' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Diagram' })).toBeDefined();
    expect(screen.getByRole('separator', { name: 'Resize Properties' })).toBeDefined();
  });

  it('shows "Properties" header when no node selected', () => {
    render(<InspectorPane {...defaultProps()} />);
    expect(screen.getByText('Properties')).toBeDefined();
  });

  it('shows a useful empty selection without switching to Diagram', () => {
    render(<InspectorPane {...defaultProps()} />);
    expect(screen.getByText('No selection')).toBeDefined();
    expect(screen.queryByTestId('properties-panel')).toBeNull();
  });

  it('forwards typed document and font state to SettingsPanel exactly', () => {
    const props = defaultProps({ activeTab: 'diagram' });
    render(<InspectorPane {...props} />);

    expect(settingsPanelProps).toHaveBeenLastCalledWith(expect.objectContaining({
      documentSettings: props.documentSettings,
      selectedPreset: props.selectedPreset,
      notations: props.availableNotations,
      onDocumentSettingsChange: props.onDocumentSettingsChange,
      onPresetChange: props.onPresetChange,
      onApplyLayout: props.onApplyLayout,
      onFontCommit: props.onApplyFont,
      fontDraft: props.fontDraft,
      onFontDraftChange: props.onFontDraftChange,
      documentKey: props.documentKey,
    }));
  });

  it('keeps only source-owned font settings enabled when mutations are otherwise locked', () => {
    const props = defaultProps({ activeTab: 'diagram', mutationsDisabled: true,
      fontSettingsDisabled: false });
    render(<InspectorPane {...props} />);

    expect(settingsPanelProps).toHaveBeenLastCalledWith(expect.objectContaining({
      disabled: true,
      fontDisabled: false,
      onFontCommit: props.onApplyFont,
    }));
  });

  it('shows "Node: {label}" header when node selected', () => {
    render(<InspectorPane {...defaultProps({ selectedNode: mockNode, activeTab: 'selection' })} />);
    expect(screen.getByText('Node: Test Node')).toBeDefined();
  });

  it('renders NodePropertiesPanel when node selected', () => {
    render(<InspectorPane {...defaultProps({ selectedNode: mockNode })} />);
    expect(screen.getByTestId('properties-panel')).toBeDefined();
    expect(screen.getByTestId('settings-panel').closest('[data-state]')?.getAttribute('data-state')).toBe('inactive');
  });

  it('shows back button when node selected', () => {
    render(<InspectorPane {...defaultProps({ selectedNode: mockNode })} />);
    expect(screen.getByLabelText('Back to properties')).toBeDefined();
  });

  it('does not show back button when no node selected', () => {
    render(<InspectorPane {...defaultProps({ activeTab: 'diagram' })} />);
    expect(screen.queryByLabelText('Back to properties')).toBeNull();
  });

  it('calls onDeselectNode when back button clicked', () => {
    const onDeselectNode = vi.fn();
    render(<InspectorPane {...defaultProps({ selectedNode: mockNode, onDeselectNode })} />);
    fireEvent.click(screen.getByLabelText('Back to properties'));
    expect(onDeselectNode).toHaveBeenCalled();
  });

  it('truncates long node labels', () => {
    const longNode = {
      ...mockNode,
      data: { label: 'A Very Long Node Label That Exceeds Twenty Characters' },
    };
    render(<InspectorPane {...defaultProps({ selectedNode: longNode })} />);
    expect(screen.getByText('Node: A Very Long Node Lab...')).toBeDefined();
  });

  it('reports an edge selection without offering unsupported editing', () => {
    render(<InspectorPane {...defaultProps({
      selectionSummary: { kind: 'edge', count: 1, label: 'Payment flow' },
      selectedEdge: { id: 'legacy', source: 'a', target: 'z', label: 'Payment flow' },
      onEdgeLabelEdit: vi.fn(() => false),
    })} />);
    expect(screen.getByText('Edge: Payment flow')).toBeDefined();
    expect(screen.getByText('Edge properties are read-only in this release.')).toBeDefined();
    expect(screen.queryByTestId('properties-panel')).toBeNull();
  });

  it('edits a selected source-owned connector label once on Enter', () => {
    const onEdgeLabelEdit = vi.fn(() => true);
    render(<InspectorPane {...defaultProps({
      selectionSummary: { kind: 'edge', count: 1, label: 'Old' },
      selectedEdge: { id: 'call', source: 'a', target: 'z', label: 'Old' },
      sourceOwnedEdgeLabels: true,
      edgeLabelEditable: true,
      onEdgeLabelEdit,
      mutationsDisabled: true,
    })} />);
    const input = screen.getByRole('textbox', { name: 'Connector label' });
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onEdgeLabelEdit).toHaveBeenCalledTimes(1);
    expect(onEdgeLabelEdit).toHaveBeenCalledWith('call', 'New');
  });

  it('offers removal for an explicitly empty source-owned connector label', () => {
    const onEdgeLabelEdit = vi.fn(() => true);
    const onEdgeLabelRemove = vi.fn(() => true);
    render(<InspectorPane {...defaultProps({
      selectionSummary: { kind: 'edge', count: 1, label: '' },
      selectedEdge: { id: 'call', source: 'a', target: 'z', label: '' },
      sourceOwnedEdgeLabels: true,
      edgeLabelEditable: true,
      onEdgeLabelEdit,
      onEdgeLabelRemove,
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove connector label' }));
    expect(onEdgeLabelRemove).toHaveBeenCalledExactlyOnceWith('call');
    expect(onEdgeLabelEdit).not.toHaveBeenCalled();
  });

  // Slice 94 (design §5.4, §8.3): the lock reason is displayed, not announced.
  // Refusals announce once through the shell guidance region; a live region
  // here would announce the source-pending copy while the user types.
  it('shows the mutation lock reason without making it a live region (TR94-F7)', () => {
    const reason = 'Updating source. Canvas editing is temporarily unavailable.';
    render(<InspectorPane {...defaultProps({
      selectedNode: { ...mockNode, data: { ...mockNode.data, authoredPosition: { x: 1, y: 2 }, canonical: {} } },
      mutationsDisabled: true,
      mutationDisabledReason: reason,
      mutationDisabledLabel: 'Updating source',
    })} />);
    const shown = screen.getByText(reason);
    expect(shown.getAttribute('role')).toBeNull();
    expect(shown.getAttribute('aria-live')).toBeNull();
    expect(shown.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    for (const name of ['Pin', 'Release position']) {
      const control = screen.getByRole('button', { name });
      expect(control.getAttribute('aria-describedby')).toBe(shown.id);
    }
  });

  // CR94-C2-F1: the lock is a compact chip in the existing header row, so the
  // stable panel gains no row and a lock that toggles while the user types
  // shifts nothing. The full reason stays the controls' description.
  it('shows the lock as a header chip that adds no row and is not live', () => {
    const reason = 'Updating source. Canvas editing is temporarily unavailable.';
    const label = 'Updating source';
    const props = (locked: boolean) => defaultProps({
      selectedNode: { ...mockNode, data: { ...mockNode.data, canonical: {} } },
      mutationsDisabled: locked,
      mutationDisabledReason: locked ? reason : undefined,
      mutationDisabledLabel: locked ? label : undefined,
      onClose: vi.fn(),
    });
    const { rerender } = render(<InspectorPane {...props(false)} />);
    const tabs = screen.getByRole('tablist', { name: 'Properties views' });
    const back = screen.getByLabelText('Back to properties');
    const header = back.parentElement!;
    const pin = () => screen.getByRole('button', { name: 'Pin' });
    // The title takes the free space, so the chip and Close stay anchored at
    // the right edge and Close never moves as the lock toggles (CR94-C3-F1).
    const title = back.nextElementSibling as HTMLElement;
    const close = screen.getByRole('button', { name: 'Close panel' });
    expect(title.style.flexGrow).toBe('1');
    expect(title.style.minWidth).toBe('0px');
    expect(header.lastElementChild).toBe(close);
    // Nothing in the stable state sits between the header and the tabs.
    expect(tabs.previousElementSibling).toBeNull();
    expect(screen.queryByText(label)).toBeNull();

    rerender(<InspectorPane {...props(true)} />);
    expect(tabs.previousElementSibling).toBeNull();
    const chip = screen.getByText(label);
    expect(chip.parentElement).toBe(header);
    expect(chip.title).toBe(reason);
    expect(chip.previousElementSibling).toBe(title);
    expect(header.lastElementChild).toBe(close);
    const description = document.getElementById(pin().getAttribute('aria-describedby')!)!;
    expect(description.textContent).toBe(reason);
    expect(header.contains(description)).toBe(true);
    for (const element of [chip, description]) {
      expect(element.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    }

    rerender(<InspectorPane {...props(false)} />);
    expect(tabs.previousElementSibling).toBeNull();
    expect(screen.queryByText(label)).toBeNull();
    expect(pin().getAttribute('aria-describedby')).toBeNull();
  });

  it('shows no chip without an owner label, but keeps the lock description (CR94-C3-F4)', () => {
    const reason = 'Updating source. Canvas editing is temporarily unavailable.';
    render(<InspectorPane {...defaultProps({
      selectedNode: { ...mockNode, data: { ...mockNode.data, canonical: {} } },
      mutationsDisabled: true,
      mutationDisabledReason: reason,
    })} />);
    const header = screen.getByLabelText('Back to properties').parentElement!;
    expect(header.querySelector('[aria-hidden="true"]')).toBeNull();
    const description = document.getElementById(screen.getByRole('button', { name: 'Pin' }).getAttribute('aria-describedby')!)!;
    expect(description.textContent).toBe(reason);
    expect(screen.getAllByText(reason)).toHaveLength(1);
  });

  it('disables every authored control while mutations are locked and keeps view controls live', () => {
    const onToggleNodePin = vi.fn();
    const onTabChange = vi.fn();
    render(<InspectorPane {...defaultProps({
      selectedNode: { ...mockNode, data: { ...mockNode.data, authoredPosition: { x: 1, y: 2 }, canonical: {} } },
      mutationsDisabled: true,
      mutationDisabledReason: 'Updating diagram. Editing is temporarily unavailable.',
      onToggleNodePin,
      onTabChange,
    })} />);
    const pin = screen.getByRole('button', { name: 'Pin' }) as HTMLButtonElement;
    expect(pin.disabled).toBe(true);
    fireEvent.click(pin);
    expect(onToggleNodePin).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Release position' }) as HTMLButtonElement).disabled).toBe(true);
    expect(nodePropertiesPanelProps).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }));
    expect(screen.getByTestId('properties-panel').closest('[aria-disabled]')?.getAttribute('aria-disabled')).toBe('true');
    expect(settingsPanelProps).toHaveBeenLastCalledWith(expect.objectContaining({
      disabled: true,
      fontDisabled: true,
    }));
    // Navigation is view-only and stays available.
    const diagramTab = screen.getByRole('tab', { name: 'Diagram' }) as HTMLButtonElement;
    expect(diagramTab.disabled).toBe(false);
    expect((screen.getByLabelText('Back to properties') as HTMLButtonElement).disabled).toBe(false);
  });

  it('enables authored controls and shows no lock reason when mutations are allowed', () => {
    render(<InspectorPane {...defaultProps({
      selectedNode: { ...mockNode, data: { ...mockNode.data, canonical: {} } },
      mutationsDisabled: false,
      mutationDisabledReason: 'Updating diagram. Editing is temporarily unavailable.',
    })} />);
    expect(screen.queryByText('Updating diagram. Editing is temporarily unavailable.')).toBeNull();
    expect((screen.getByRole('button', { name: 'Pin' }) as HTMLButtonElement).disabled).toBe(false);
    expect(nodePropertiesPanelProps).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: false }));
  });

  it('reports mixed multi-selection instead of retaining the last node', () => {
    render(<InspectorPane {...defaultProps({
      selectionSummary: { kind: 'mixed', count: 3 },
    })} />);
    expect(screen.getAllByText('3 objects selected').length).toBeGreaterThan(0);
    expect(screen.getByText('Select one object to inspect its properties.')).toBeDefined();
  });
});
