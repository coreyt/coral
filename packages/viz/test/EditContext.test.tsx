import { memo } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditProvider, useEditContext } from '../src/components/EditContext.js';

describe('label edit subscriptions', () => {
  it('leaves memoized nodes idle on parent motion while publishing edit state and new callbacks', () => {
    let renders = 0;
    let context: ReturnType<typeof useEditContext>;
    const Node = memo(function Node() {
      renders++;
      context = useEditContext();
      return <span>{context.editingNodeId ?? 'idle'}</span>;
    });
    const original = vi.fn();
    const { rerender } = render(<EditProvider onLabelEdit={original}><Node /></EditProvider>);
    expect(renders).toBe(1);
    rerender(<EditProvider onLabelEdit={original}><Node /></EditProvider>);
    expect(renders).toBe(1);
    act(() => context.startEditing('customer'));
    expect(screen.getByText('customer')).toBeDefined();
    expect(renders).toBe(2);
    const replacement = vi.fn();
    rerender(<EditProvider onLabelEdit={replacement}><Node /></EditProvider>);
    act(() => context.onLabelEdit?.('customer', 'Updated'));
    expect(replacement).toHaveBeenCalledWith('customer', 'Updated');
    expect(original).not.toHaveBeenCalled();
    expect(renders).toBe(3);
    act(() => context.stopEditing());
    expect(screen.getByText('idle')).toBeDefined();
    expect(renders).toBe(4);
  });
});
