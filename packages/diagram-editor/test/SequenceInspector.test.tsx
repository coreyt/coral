import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { parse } from '@coral-viz/language/parser';
import { projectInstalledSourceToSuccessor028, successorSequenceDisplay028 } from '@coral-viz/render';
import { SequenceInspector } from '../src/components/SequenceInspector';
import { SequencePane } from '../src/components/SequencePane';

const graph = parse(`@graph {"id":"s","metadata":{"notation":"uml-sequence"}}
actor "User" as user
participant "App" as app
user -> app as m1 [sync, label: "hi"]
opt "later" {
  app -> user as m2 [return]
}
activation app from m1 to m2
note "n" on m1`).graph!;

function setup(selected: Parameters<typeof SequenceInspector>[0]['selected'], error: string | null = null) {
  const onOperation = vi.fn(() => ({ ok: true as const, graph }));
  const onSelect = vi.fn();
  render(<SequenceInspector graph={graph} selected={selected} error={error} onSelect={onSelect} onOperation={onOperation} />);
  return { onOperation, onSelect };
}

describe('SequenceInspector', () => {
  it('shows exact group membership as read-only independently of an equal participant ID', () => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\ncall = a -> b').graph!;
    source.interaction!.groups = [{ id: 'a', label: 'Operations', participantIds: ['b', 'a'] }];
    const graph = successorSequenceDisplay028(source);
    const before = JSON.stringify(source);
    const onOperation = vi.fn(() => ({ ok: true as const, graph }));
    render(<SequenceInspector graph={graph} selected={{ kind: 'group', id: 'a' }} error={null}
      onSelect={vi.fn()} onOperation={onOperation} />);
    const region = screen.getByRole('region', { name: 'Participant group' });
    expect(region.textContent).toContain('Members: b, a');
    const input = screen.getByLabelText('Label') as HTMLInputElement;
    expect(input.value).toBe('Operations');
    expect(input.disabled).toBe(true);
    expect(onOperation).not.toHaveBeenCalled();
    expect(JSON.stringify(source)).toBe(before);
  });

  it('shows typed region details as read-only', () => {
    const source = projectInstalledSourceToSuccessor028('@diagram uml-sequence\na participant\nb participant\ncall = a -> b').graph!;
    source.interaction!.regions = [{ id: 'review', label: 'Review request', items: [{ kind: 'message', id: 'call' }] }];
    source.interaction!.items = [{ kind: 'region', id: 'review' }];
    const graph = successorSequenceDisplay028(source);
    const onOperation = vi.fn(() => ({ ok: true as const, graph }));
    render(<SequenceInspector graph={graph} selected={{ kind: 'region', id: 'review' }} error={null}
      onSelect={vi.fn()} onOperation={onOperation} />);
    expect(screen.getByRole('region', { name: 'Region' }).textContent).toContain('1 timeline items');
    const input = screen.getByLabelText('Label') as HTMLInputElement;
    expect(input.value).toBe('Review request');
    expect(input.disabled).toBe(true);
    expect(onOperation).not.toHaveBeenCalled();
  });

  it.each(['activation', 'note', 'fragment', 'operand'] as const)(
    'shows source timeline %s details without enabling structural editing', (kind) => {
      const source = '@diagram uml-sequence\napi participant\nworker participant\n' +
        'work = activation api {\n choice = alt "yes" {\n call = api -> worker\n' +
        ' check = note "Review" on call\n } else "no" {\n worker -> api\n }\n}';
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const display = successorSequenceDisplay028(projected.graph!);
      const fragment = projected.graph!.interaction!.fragments![0];
      const id = { activation: 'work', note: 'check', fragment: 'choice', operand: fragment.operands[0].id }[kind];
      const before = JSON.stringify(projected.graph);
      const onOperation = vi.fn(() => ({ ok: true as const, graph: display }));
      render(<SequenceInspector graph={display} selected={{ kind, id }} error={null}
        onSelect={vi.fn()} onOperation={onOperation} />);
      const region = screen.getByRole('region', { name: kind[0].toUpperCase() + kind.slice(1) });
      expect(region.textContent).toContain({ activation: 'api', note: 'call', fragment: 'alt', operand: 'choice' }[kind]);
      const inputs = region.querySelectorAll('input, select, button');
      for (const input of inputs) expect((input as HTMLInputElement).disabled).toBe(true);
      expect(onOperation).not.toHaveBeenCalled();
      expect(JSON.stringify(projected.graph)).toBe(before);
    });

  it('edits a participant through single operations', () => {
    const { onOperation } = setup({ kind: 'participant', id: 'app' });
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Server' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'updateParticipant', id: 'app', label: 'Server' });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'actor' } });
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'updateParticipant', id: 'app', kind: 'actor' });
    fireEvent.click(screen.getByText('Move left'));
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'moveParticipant', id: 'app', direction: -1 });
    fireEvent.click(screen.getByText('Delete participant'));
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'deleteParticipant', id: 'app' });
  });

  it('edits a message, wraps it in a fragment, and adds an activation', () => {
    const { onOperation } = setup({ kind: 'message', id: 'm1' });
    fireEvent.change(screen.getAllByLabelText('Kind')[0], { target: { value: 'async' } });
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'updateMessage', id: 'm1', kind: 'async' });
    fireEvent.click(screen.getByText('Move later'));
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'moveMessage', id: 'm1', direction: 1 });
    fireEvent.click(screen.getByText('Add fragment'));
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'addFragment', kind: 'opt', firstMessageId: 'm1', lastMessageId: 'm1' });
    fireEvent.change(screen.getByLabelText('Until message'), { target: { value: 'm2' } });
    fireEvent.click(screen.getByText('Add activation'));
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'addActivation', participantId: 'app', startMessageId: 'm1', endMessageId: 'm2' });
  });

  it('edits activations, notes, and fragment guards', () => {
    const first = setup({ kind: 'activation', id: 'activation-1' });
    fireEvent.change(screen.getByLabelText('Ends at'), { target: { value: 'm1' } });
    expect(first.onOperation).toHaveBeenLastCalledWith({ type: 'updateActivation', id: 'activation-1', endMessageId: 'm1' });
    document.body.innerHTML = '';
    const second = setup({ kind: 'note', id: 'note-1' });
    fireEvent.click(screen.getByLabelText('User'));
    expect(second.onOperation).toHaveBeenLastCalledWith({ type: 'updateNote', id: 'note-1', targets: ['m1', 'user'] });
    document.body.innerHTML = '';
    const third = setup({ kind: 'fragment', id: 'fragment-1' });
    const guard = screen.getByLabelText('Guard 1');
    fireEvent.change(guard, { target: { value: '' } });
    fireEvent.blur(guard);
    expect(third.onOperation).toHaveBeenLastCalledWith({ type: 'updateGuard', fragmentId: 'fragment-1', operandIndex: 0, guard: undefined });
  });

  it('edits the guard of a selected operand by its authored ID', () => {
    const operand = graph.interaction!.fragments![0]!.operands[0]!;
    const { onOperation } = setup({ kind: 'operand', id: operand.id });
    const guard = screen.getByLabelText('Guard');
    fireEvent.change(guard, { target: { value: 'ready' } });
    fireEvent.blur(guard);
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'updateGuard',
      fragmentId: 'fragment-1', operandIndex: 0, guard: 'ready' });
  });

  it('shows nested source-owned operand details without enabling an unsupported guard edit', () => {
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
    expect(display.interaction?.fragments).toBeUndefined();
    const nestedOperand = (display as typeof display & { recursiveFragments028: {
      fragments: { id: string; operands: { id: string; guard: string }[] }[] } }).recursiveFragments028
      .fragments.find((fragment) => fragment.id === 'retry')!.operands[1]!;
    const onOperation = vi.fn(() => ({ ok: true as const, graph: display }));
    render(<SequenceInspector graph={display} selected={{ kind: 'operand', id: nestedOperand.id }}
      error={null} mutationsDisabled onSelect={vi.fn()} onOperation={onOperation} />);
    expect(screen.getByRole('region', { name: 'Operand' }).textContent).toContain('retry');
    expect((screen.getByLabelText('Guard') as HTMLInputElement).value).toBe('stop');
    expect((screen.getByLabelText('Guard') as HTMLInputElement).disabled).toBe(true);
    expect(onOperation).not.toHaveBeenCalled();
  });

  it('disables every sequence edit while mutations are locked (TR94-F6)', () => {
    const onOperation = vi.fn(() => ({ ok: true as const, graph }));
    const { rerender } = render(<SequenceInspector graph={graph} selected={{ kind: 'participant', id: 'app' }} error={null}
      mutationsDisabled onSelect={vi.fn()} onOperation={onOperation} />);
    for (const name of ['Move left', 'Move right', 'Add message from here', 'Delete participant']) {
      const control = screen.getByText(name) as HTMLButtonElement;
      expect({ name, disabled: control.disabled }).toEqual({ name, disabled: true });
      fireEvent.click(control);
    }
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Kind') as HTMLSelectElement).disabled).toBe(true);
    rerender(<SequenceInspector graph={graph} selected={null} error={null}
      mutationsDisabled onSelect={vi.fn()} onOperation={onOperation} />);
    for (const name of ['Add participant', 'Add actor', 'Add message', 'Add note']) {
      expect({ name, disabled: (screen.getByText(name) as HTMLButtonElement).disabled }).toEqual({ name, disabled: true });
    }
    expect(onOperation).not.toHaveBeenCalled();
  });

  it('allows only a source-owned message label edit while sequence mutations remain locked', () => {
    const onOperation = vi.fn(() => ({ ok: true as const, graph }));
    const onSourceMessageLabelEdit = vi.fn(() => true);
    render(<SequenceInspector graph={graph} selected={{ kind: 'message', id: 'm1' }} error={null}
      mutationsDisabled sourceMessageLabelEditable onSourceMessageLabelEdit={onSourceMessageLabelEdit}
      onSelect={vi.fn()} onOperation={onOperation} />);
    const label = screen.getByLabelText('Label') as HTMLInputElement;
    expect(label.disabled).toBe(false);
    fireEvent.change(label, { target: { value: 'Changed' } });
    fireEvent.keyDown(label, { key: 'Enter' });
    fireEvent.blur(label);
    expect(onSourceMessageLabelEdit).toHaveBeenCalledTimes(1);
    expect(onSourceMessageLabelEdit).toHaveBeenCalledWith('m1', 'Changed');
    expect((screen.getAllByLabelText('Kind')[0] as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByText('Move later') as HTMLButtonElement).disabled).toBe(true);
    expect(onOperation).not.toHaveBeenCalled();
  });

  it('opens a positioned source-owned message dialog from a selected message', () => {
    const onOperation = vi.fn(() => ({ ok: true as const, graph }));
    const onSourceAddMessageAfter = vi.fn();
    render(<SequenceInspector graph={graph} selected={{ kind: 'message', id: 'm1' }} error={null}
      mutationsDisabled sourceMessageInsertEditable onSourceAddMessageAfter={onSourceAddMessageAfter}
      onSelect={vi.fn()} onOperation={onOperation} />);
    const add = screen.getByText('Add message after') as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(onSourceAddMessageAfter).toHaveBeenCalledWith('m1');
    expect(onOperation).not.toHaveBeenCalled();
  });

  it('offers source-owned message deletion while other sequence mutations remain locked', () => {
    const onOperation = vi.fn(() => ({ ok: true as const, graph }));
    const onSourceMessageDelete = vi.fn(() => true);
    render(<SequenceInspector graph={graph} selected={{ kind: 'message', id: 'm1' }} error={null}
      mutationsDisabled sourceMessageDeleteEditable onSourceMessageDelete={onSourceMessageDelete}
      onSelect={vi.fn()} onOperation={onOperation} />);
    const remove = screen.getByText('Delete message') as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    expect(onSourceMessageDelete).toHaveBeenCalledWith('m1');
    expect((screen.getByText('Move later') as HTMLButtonElement).disabled).toBe(true);
    expect(onOperation).not.toHaveBeenCalled();
  });

  it('offers source-owned participant deletion while other participant mutations remain locked', () => {
    const onOperation = vi.fn(() => ({ ok: true as const, graph }));
    const onSourceParticipantDelete = vi.fn(() => true);
    render(<SequenceInspector graph={graph} selected={{ kind: 'participant', id: 'app' }} error={null}
      mutationsDisabled sourceParticipantDeleteEditable onSourceParticipantDelete={onSourceParticipantDelete}
      onSelect={vi.fn()} onOperation={onOperation} />);
    const remove = screen.getByText('Delete participant') as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    expect(onSourceParticipantDelete).toHaveBeenCalledWith('app');
    expect((screen.getByText('Move left') as HTMLButtonElement).disabled).toBe(true);
    expect(onOperation).not.toHaveBeenCalled();
  });

  it('commits a source-owned participant name while structural controls stay locked', () => {
    const onOperation = vi.fn(() => ({ ok: true as const, graph }));
    const onSourceParticipantLabelEdit = vi.fn(() => true);
    render(<SequenceInspector graph={graph} selected={{ kind: 'participant', id: 'app' }} error={null}
      mutationsDisabled sourceParticipantLabelEditable onSourceParticipantLabelEdit={onSourceParticipantLabelEdit}
      onSelect={vi.fn()} onOperation={onOperation} />);
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.disabled).toBe(false);
    fireEvent.change(name, { target: { value: 'Server' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onSourceParticipantLabelEdit).toHaveBeenCalledWith('app', 'Server');
    expect((screen.getByText('Move left') as HTMLButtonElement).disabled).toBe(true);
    expect(onOperation).not.toHaveBeenCalled();
  });

  it('shows a refused edit as an alert and offers diagram-level additions', () => {
    const { onOperation } = setup(null, 'Participant App is still referenced');
    expect(screen.getByRole('alert').textContent).toContain('still referenced');
    fireEvent.click(screen.getByText('Add actor'));
    expect(onOperation).toHaveBeenLastCalledWith({ type: 'addParticipant', kind: 'actor' });
  });
});

describe('SequencePane', () => {
  it('draws the sequence scene and reports selection', () => {
    const onSelect = vi.fn();
    const { container } = render(<SequencePane graph={graph} selected={null} error={null} onSelect={onSelect}
      fontSettings={{ default: { family: 'Serif', size: 22 } }} />);
    expect(container.innerHTML).toContain('font-size="22"');
    fireEvent.click(container.querySelector('[data-coral-sequence-note="note-1"]')!);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'note', id: 'note-1' });
    expect(screen.getByLabelText('Sequence diagram canvas')).toBeTruthy();
  });

  it('displays a live update owner as the generic canvas does', () => {
    const { rerender } = render(<SequencePane graph={graph} selected={null} error={null} onSelect={vi.fn()}
      updateStatus={{ kind: 'source-pending', message: 'Updating source. Canvas editing is temporarily unavailable.' }} />);
    const overlay = screen.getByTestId('visible-update-status');
    expect(overlay.getAttribute('data-update-kind')).toBe('source-pending');
    expect(overlay.textContent).toBe('Updating source. Canvas editing is temporarily unavailable.');
    rerender(<SequencePane graph={graph} selected={null} error={null} onSelect={vi.fn()} updateStatus={null} />);
    expect(screen.queryByTestId('visible-update-status')).toBeNull();
  });
});
