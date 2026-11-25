/**
 * NodePropertiesPanel Component Tests
 *
 * Tests for the node properties panel component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  NodePropertiesPanel,
  type PropertyChange,
} from '../src/properties/NodePropertiesPanel.js';
import type { CoralNode } from '../src/types.js';

// ============================================================================
// Test Data
// ============================================================================

function createTestNode(overrides: Partial<CoralNode> = {}): CoralNode {
  return {
    id: 'test-node-1',
    type: 'coralSymbol',
    position: { x: 100, y: 100 },
    data: {
      label: 'Test Node',
      nodeType: 'service',
      description: 'A test service node',
      properties: {
        port: 8080,
        enabled: true,
        hostname: 'localhost',
      },
    },
    ...overrides,
  };
}

// ============================================================================
// Empty State Tests
// ============================================================================

describe('NodePropertiesPanel - Empty State', () => {
  it('should show empty state message when no node selected', () => {
    render(<NodePropertiesPanel selectedNode={null} onPropertyChange={vi.fn()} />);

    expect(screen.getByText('No node selected')).toBeTruthy();
  });

  it('should not render form fields when no node selected', () => {
    render(<NodePropertiesPanel selectedNode={null} onPropertyChange={vi.fn()} />);

    expect(screen.queryByLabelText('Label')).toBeNull();
  });
});

// ============================================================================
// Node Info Display Tests
// ============================================================================

describe('NodePropertiesPanel - Node Info', () => {
  it('should display node ID', () => {
    const node = createTestNode({ id: 'my-unique-id' });
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    expect(screen.getByText('my-unique-id')).toBeTruthy();
  });

  it('should display node type', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    expect(screen.getByText('service')).toBeTruthy();
  });

  it('should hide node ID when showNodeId is false', () => {
    const node = createTestNode({ id: 'hidden-id' });
    render(
      <NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} showNodeId={false} />
    );

    expect(screen.queryByText('hidden-id')).toBeNull();
  });

  it('should hide node type when showNodeType is false', () => {
    const node = createTestNode();
    node.data.nodeType = 'hidden-type';
    render(
      <NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} showNodeType={false} />
    );

    expect(screen.queryByText('hidden-type')).toBeNull();
  });
});

// ============================================================================
// Basic Properties Tests
// ============================================================================

describe('NodePropertiesPanel - Basic Properties', () => {
  it('should display label input with current value', () => {
    const node = createTestNode();
    node.data.label = 'My Service';
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    const labelInput = screen.getByDisplayValue('My Service');
    expect(labelInput).toBeTruthy();
  });

  it('should display description textarea', () => {
    const node = createTestNode();
    node.data.description = 'Service description';
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    const descInput = screen.getByDisplayValue('Service description');
    expect(descInput).toBeTruthy();
  });

  it('should handle empty description', () => {
    const node = createTestNode();
    node.data.description = undefined;
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    // Should render empty textarea without error
    const descTextarea = screen.getByPlaceholderText('Optional description...');
    expect((descTextarea as HTMLTextAreaElement).value).toBe('');
  });
});

// ============================================================================
// Property Change Callbacks
// ============================================================================

describe('NodePropertiesPanel - Property Changes', () => {
  let onPropertyChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onPropertyChange = vi.fn();
  });

  it('edits classifier modifiers and members as structured values', () => {
    const node = createTestNode();
    node.data.nodeType = 'class';
    node.data.canonical = {
      symbol: 'uml-class',
      classifier: {
        kind: 'class', name: 'Order', compartments: [
          { id: 'name', kind: 'name' },
          { id: 'attributes', kind: 'attributes', items: [
            { id: 'attribute-1', kind: 'attribute', name: 'id', type: 'UUID' },
          ] },
        ],
      },
    };
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);

    fireEvent.click(screen.getByLabelText('Classifier abstract'));
    expect(onPropertyChange).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: node.id, field: 'classifier',
      newValue: expect.objectContaining({ modifiers: ['abstract'] }),
    }));

    onPropertyChange.mockClear();
    const member = screen.getByLabelText('attributes 1 member');
    fireEvent.change(member, { target: { value: '+ orderId: UUID {readonly}' } });
    fireEvent.blur(member);
    expect(onPropertyChange).toHaveBeenCalledWith(expect.objectContaining({
      field: 'classifier',
      newValue: expect.objectContaining({
        compartments: expect.arrayContaining([
          expect.objectContaining({ items: [expect.objectContaining({
            name: 'orderId', visibility: 'public', type: 'UUID', modifiers: ['readonly'],
          })] }),
        ]),
      }),
    }));
    expect((screen.getByRole('option', { name: 'enum' }) as HTMLOptionElement).disabled).toBe(true);
  });

  it('keeps invalid UML member drafts local and permits enum operations', () => {
    const node = createTestNode();
    node.data.nodeType = 'enum';
    node.data.canonical = {
      symbol: 'uml-enum',
      classifier: {
        kind: 'enum', name: 'State', compartments: [
          { id: 'name', kind: 'name' },
          { id: 'literals', kind: 'literals', items: [{ id: 'literal-1', kind: 'literal', name: 'OPEN' }] },
        ],
      },
    };
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);
    const member = screen.getByLabelText('literals 1 member');
    fireEvent.change(member, { target: { value: 'not a literal' } });
    fireEvent.blur(member);
    expect(screen.getByRole('alert').textContent).toContain('Literal must use');
    expect(onPropertyChange).not.toHaveBeenCalled();
    fireEvent.change(member, { target: { value: 'literal BAD = "\\q"' } });
    expect(() => fireEvent.blur(member)).not.toThrow();
    expect(screen.getByRole('alert').textContent).toContain('valid JSON string escapes');
    expect(onPropertyChange).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Add operation' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('Classifier abstract') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Classifier static') as HTMLInputElement).disabled).toBe(true);
  });

  it('allocates a free member identity and keeps an empty classifier label local', () => {
    const node = createTestNode();
    node.data.nodeType = 'class';
    node.data.label = 'Order';
    node.data.canonical = {
      symbol: 'uml-class',
      classifier: {
        kind: 'class', name: 'Order', compartments: [
          { id: 'name', kind: 'name' },
          { id: 'attributes', kind: 'attributes', items: [
            { id: 'attribute-2', kind: 'attribute', name: 'second' },
          ] },
        ],
      },
    };
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add attribute' }));
    expect(onPropertyChange).toHaveBeenLastCalledWith(expect.objectContaining({
      newValue: expect.objectContaining({
        compartments: expect.arrayContaining([expect.objectContaining({
          items: [expect.objectContaining({ id: 'attribute-2' }), expect.objectContaining({ id: 'attribute-1' })],
        })]),
      }),
    }));
    onPropertyChange.mockClear();
    const label = screen.getByLabelText('Node label');
    fireEvent.change(label, { target: { value: '' } });
    fireEvent.blur(label);
    expect(screen.getByRole('alert').textContent).toContain('must not be empty');
    expect(onPropertyChange).not.toHaveBeenCalled();
  });

  it('should call onPropertyChange when label changes', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);

    const labelInput = screen.getByDisplayValue('Test Node');
    fireEvent.change(labelInput, { target: { value: 'New Label' } });
    fireEvent.blur(labelInput);

    expect(onPropertyChange).toHaveBeenCalledWith({
      nodeId: 'test-node-1',
      field: 'label',
      oldValue: 'Test Node',
      newValue: 'New Label',
    });
  });

  it('should call onPropertyChange when description changes', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);

    const descInput = screen.getByDisplayValue('A test service node');
    fireEvent.change(descInput, { target: { value: 'Updated description' } });
    fireEvent.blur(descInput);

    expect(onPropertyChange).toHaveBeenCalledWith({
      nodeId: 'test-node-1',
      field: 'description',
      oldValue: 'A test service node',
      newValue: 'Updated description',
    });
  });

  it('should call onPropertyChange when custom property changes', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);

    // Find the hostname input
    const hostnameInput = screen.getByDisplayValue('localhost');
    fireEvent.change(hostnameInput, { target: { value: 'example.com' } });
    fireEvent.blur(hostnameInput);

    expect(onPropertyChange).toHaveBeenCalledWith({
      nodeId: 'test-node-1',
      field: 'property',
      propertyKey: 'hostname',
      oldValue: 'localhost',
      newValue: 'example.com',
    });
  });

  it('commits one field draft on blur and cancels Escape without mutation', () => {
    const node = createTestNode();
    const start = vi.fn(); const end = vi.fn(); const cancel = vi.fn();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange}
      onEditSessionStart={start} onEditSessionEnd={end} onEditSessionCancel={cancel} />);
    const label = screen.getByDisplayValue('Test Node');
    fireEvent.focus(label);
    fireEvent.change(label, { target: { value: 'N' } });
    fireEvent.change(label, { target: { value: 'New Label' } });
    expect(onPropertyChange).not.toHaveBeenCalled();
    fireEvent.blur(label);
    expect(onPropertyChange).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('label');
    expect(end).toHaveBeenCalledWith('label');

    onPropertyChange.mockClear();
    fireEvent.focus(label);
    fireEvent.change(label, { target: { value: 'Discard me' } });
    fireEvent.keyDown(label, { key: 'Escape' });
    expect(cancel).toHaveBeenCalledWith('label');
    expect(onPropertyChange).not.toHaveBeenCalled();
  });

  it('commits a custom property exactly once when Enter also causes blur', () => {
    render(<NodePropertiesPanel selectedNode={createTestNode()} onPropertyChange={onPropertyChange} />);
    const hostname = screen.getByDisplayValue('localhost');
    fireEvent.change(hostname, { target: { value: 'example.test' } });
    fireEvent.keyDown(hostname, { key: 'Enter' });
    expect(onPropertyChange).toHaveBeenCalledTimes(1);
    expect(onPropertyChange).toHaveBeenCalledWith(expect.objectContaining({
      propertyKey: 'hostname', newValue: 'example.test',
    }));
  });
});

// ============================================================================
// Custom Properties Display
// ============================================================================

describe('NodePropertiesPanel - Custom Properties', () => {
  it('should display string properties as text inputs', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    const hostnameInput = screen.getByDisplayValue('localhost') as HTMLInputElement;
    expect(hostnameInput.getAttribute('type')).toBe('text');
  });

  it('should display number properties as number inputs', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    const portInput = screen.getByDisplayValue('8080') as HTMLInputElement;
    expect(portInput.getAttribute('type')).toBe('number');
  });

  it('should display boolean properties as checkboxes', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    // Find checkbox for 'enabled' property
    const enabledCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(enabledCheckbox.checked).toBe(true);
  });

  it('should show "No custom properties" when properties is empty', () => {
    const node = createTestNode();
    node.data.properties = {};
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    expect(screen.getByText('No custom properties')).toBeTruthy();
  });

  it('should show "No custom properties" when properties is undefined', () => {
    const node = createTestNode();
    node.data.properties = undefined;
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    expect(screen.getByText('No custom properties')).toBeTruthy();
  });

  it('should display non-editable properties (arrays) as read-only', () => {
    const node = createTestNode();
    node.data.properties = { tags: ['web', 'api'] };
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    // Should show [...] for array type
    expect(screen.getByText('[...]')).toBeTruthy();
  });

  it('should display non-editable properties (objects) as read-only', () => {
    const node = createTestNode();
    node.data.properties = { config: { nested: true } };
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    // Should show {...} for object type
    expect(screen.getByText('{...}')).toBeTruthy();
  });
});

// ============================================================================
// Add/Remove Property Tests
// ============================================================================

describe('NodePropertiesPanel - Add Property', () => {
  it('should not show add property form when onAddProperty is not provided', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    expect(screen.queryByText('+ Add Property')).toBeNull();
  });

  it('should show add property form when onAddProperty is provided', () => {
    const node = createTestNode();
    render(
      <NodePropertiesPanel
        selectedNode={node}
        onPropertyChange={vi.fn()}
        onAddProperty={vi.fn()}
      />
    );

    expect(screen.getByText('+ Add Property')).toBeTruthy();
  });

  it('should call onAddProperty when adding a string property', () => {
    const onAddProperty = vi.fn();
    const node = createTestNode();
    render(
      <NodePropertiesPanel
        selectedNode={node}
        onPropertyChange={vi.fn()}
        onAddProperty={onAddProperty}
      />
    );

    // Fill in property name
    const nameInput = screen.getByPlaceholderText('Property name');
    fireEvent.change(nameInput, { target: { value: 'newProp' } });

    // Fill in value
    const valueInput = screen.getByPlaceholderText('Value');
    fireEvent.change(valueInput, { target: { value: 'newValue' } });

    // Click add button
    fireEvent.click(screen.getByText('+ Add Property'));

    expect(onAddProperty).toHaveBeenCalledWith('test-node-1', 'newProp', 'newValue');
  });

  it('should disable add button when property name is empty', () => {
    const node = createTestNode();
    render(
      <NodePropertiesPanel
        selectedNode={node}
        onPropertyChange={vi.fn()}
        onAddProperty={vi.fn()}
      />
    );

    const addButton = screen.getByText('+ Add Property') as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
  });
});

describe('NodePropertiesPanel - Remove Property', () => {
  it('should not show remove buttons when onRemoveProperty is not provided', () => {
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={vi.fn()} />);

    // Remove buttons should not exist
    expect(screen.queryByTitle('Remove property')).toBeNull();
  });

  it('should show remove buttons when onRemoveProperty is provided', () => {
    const node = createTestNode();
    render(
      <NodePropertiesPanel
        selectedNode={node}
        onPropertyChange={vi.fn()}
        onRemoveProperty={vi.fn()}
      />
    );

    // Should have remove buttons for each property
    const removeButtons = screen.getAllByTitle('Remove property');
    expect(removeButtons.length).toBeGreaterThan(0);
  });

  it('should call onRemoveProperty when clicking remove button', () => {
    const onRemoveProperty = vi.fn();
    const node = createTestNode();
    node.data.properties = { toRemove: 'value' };
    render(
      <NodePropertiesPanel
        selectedNode={node}
        onPropertyChange={vi.fn()}
        onRemoveProperty={onRemoveProperty}
      />
    );

    const removeButton = screen.getByTitle('Remove property');
    fireEvent.click(removeButton);

    expect(onRemoveProperty).toHaveBeenCalledWith('test-node-1', 'toRemove');
  });
});

// ============================================================================
// Disabled State Tests
// ============================================================================

describe('NodePropertiesPanel - Disabled State', () => {
  it('should disable all inputs when disabled is true', () => {
    const node = createTestNode();
    render(
      <NodePropertiesPanel
        selectedNode={node}
        onPropertyChange={vi.fn()}
        onAddProperty={vi.fn()}
        disabled={true}
      />
    );

    // Label input should be disabled
    const labelInput = screen.getByDisplayValue('Test Node') as HTMLInputElement;
    expect(labelInput.disabled).toBe(true);

    // Description should be disabled
    const descInput = screen.getByPlaceholderText('Optional description...') as HTMLTextAreaElement;
    expect(descInput.disabled).toBe(true);

    // Checkbox should be disabled
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  it('should not call callbacks when disabled', () => {
    const onPropertyChange = vi.fn();
    const node = createTestNode();
    render(
      <NodePropertiesPanel
        selectedNode={node}
        onPropertyChange={onPropertyChange}
        disabled={true}
      />
    );

    const labelInput = screen.getByDisplayValue('Test Node');
    fireEvent.change(labelInput, { target: { value: 'New Value' } });

    expect(onPropertyChange).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Number Property Handling
// ============================================================================

describe('NodePropertiesPanel - Number Properties', () => {
  it('should parse number input correctly', () => {
    const onPropertyChange = vi.fn();
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);

    const portInput = screen.getByDisplayValue('8080');
    fireEvent.change(portInput, { target: { value: '9000' } });
    fireEvent.blur(portInput);

    expect(onPropertyChange).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyKey: 'port',
        newValue: 9000, // Should be number, not string
      })
    );
  });

  it('should handle invalid number input', () => {
    const onPropertyChange = vi.fn();
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);

    const portInput = screen.getByDisplayValue('8080');
    fireEvent.change(portInput, { target: { value: 'not-a-number' } });
    fireEvent.blur(portInput);

    expect(onPropertyChange).not.toHaveBeenCalled();
    expect((portInput as HTMLInputElement).value).toBe('8080');
  });
});

// ============================================================================
// Boolean Property Handling
// ============================================================================

describe('NodePropertiesPanel - Boolean Properties', () => {
  it('should toggle boolean property on checkbox click', () => {
    const onPropertyChange = vi.fn();
    const node = createTestNode();
    render(<NodePropertiesPanel selectedNode={node} onPropertyChange={onPropertyChange} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onPropertyChange).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyKey: 'enabled',
        oldValue: true,
        newValue: false,
      })
    );
  });
});
