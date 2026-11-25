import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthoringDialog, type AuthoringDialogTheme } from '../src/AuthoringDialog';

const theme: AuthoringDialogTheme = {
  overlayBg: 'rgba(0,0,0,.4)',
  bg: '#fff',
  border: '#ccc',
  text: '#111',
  mutedText: '#555',
  inputBg: '#fff',
  inputText: '#111',
  buttonBg: '#06c',
  buttonText: '#fff',
};

const nodeOptions = [
  { id: 'flowchart-process', label: 'Process' },
  { id: 'flowchart-decision', label: 'Decision' },
];
const endpoints = [
  {
    id: 'alpha', label: 'Alpha',
    sourcePorts: [{ id: 'out', label: 'out', direction: 'out' as const }],
    targetPorts: [{ id: 'in', label: 'in', direction: 'in' as const }],
  },
  {
    id: 'beta', label: 'Beta',
    sourcePorts: [{ id: 'yes', label: 'Yes', direction: 'out' as const }],
    targetPorts: [{ id: 'in', label: 'in', direction: 'in' as const }],
  },
];

describe('AuthoringDialog', () => {
  it('focuses and traps native controls, then Escape returns to the invoker', async () => {
    const invoker = document.createElement('button');
    document.body.append(invoker);
    invoker.focus();
    const onCancel = vi.fn();
    const { unmount } = render(
      <AuthoringDialog
        kind="node"
        invoker={invoker}
        nodeOptions={nodeOptions}
        parentOptions={[]}
        endpoints={endpoints}
        onSubmitNode={() => ({ ok: true })}
        onSubmitEdge={() => ({ ok: true })}
        onCancel={onCancel}
        theme={theme}
      />,
    );

    const symbol = screen.getByLabelText('Node type or symbol');
    await waitFor(() => expect(document.activeElement).toBe(symbol));
    const submit = screen.getByRole('button', { name: 'Create node' });
    const close = screen.getByRole('button', { name: 'Close Create node' });
    submit.focus();
    fireEvent.keyDown(submit, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(submit);

    fireEvent.keyDown(submit, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();
    await waitFor(() => expect(document.activeElement).toBe(invoker));
    invoker.remove();
  });

  it('submits a trimmed node draft through native controls', async () => {
    const onSubmitNode = vi.fn(() => ({ ok: true as const }));
    render(
      <AuthoringDialog
        kind="node"
        invoker={null}
        nodeOptions={nodeOptions}
        parentOptions={[{ id: 'group', label: 'Group' }]}
        endpoints={endpoints}
        onSubmitNode={onSubmitNode}
        onSubmitEdge={() => ({ ok: true })}
        onCancel={() => {}}
        theme={theme}
      />,
    );

    fireEvent.change(screen.getByLabelText('Node type or symbol'), { target: { value: 'flowchart-decision' } });
    fireEvent.change(screen.getByLabelText('Node label'), { target: { value: '  Review  ' } });
    fireEvent.change(screen.getByLabelText('Parent container'), { target: { value: 'group' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create node form' }));

    expect(onSubmitNode).toHaveBeenCalledWith({
      symbolId: 'flowchart-decision', label: 'Review', parentId: 'group',
    });
  });

  it('submits an ID-first saved-header node and preserves an explicit hidden label', () => {
    const onSubmitNode = vi.fn(() => ({ ok: true as const }));
    render(
      <AuthoringDialog kind="node" sourceOwnedNode028 invoker={null}
        nodeOptions={[{ id: 'service', label: 'service' }, { id: 'group', label: 'group' }]}
        parentOptions={[{ id: 'team', label: 'Team' }]} endpoints={[]}
        onSubmitNode={onSubmitNode} onSubmitEdge={() => ({ ok: true })}
        onCancel={() => {}} theme={theme} />,
    );
    fireEvent.change(screen.getByLabelText('Node ID'), { target: { value: '  auditSink  ' } });
    fireEvent.change(screen.getByLabelText('Node type'), { target: { value: 'service' } });
    fireEvent.change(screen.getByLabelText('Node label'), { target: { value: 'Audit sink' } });
    fireEvent.change(screen.getByLabelText('Parent container'), { target: { value: 'team' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create node form' }));
    expect(onSubmitNode).toHaveBeenLastCalledWith({ id: 'auditSink', type: 'service',
      label: 'Audit sink', parentId: 'team' });
    fireEvent.click(screen.getByLabelText('Hide node label'));
    fireEvent.submit(screen.getByRole('form', { name: 'Create node form' }));
    expect(onSubmitNode).toHaveBeenLastCalledWith({ id: 'auditSink', type: 'service',
      label: '', parentId: 'team' });
  });

  it('keeps a failed draft open and focuses its assertive error', async () => {
    const onSubmitNode = vi.fn(() => ({ ok: false as const, error: 'The parent was removed.' }));
    render(
      <AuthoringDialog
        kind="node"
        invoker={null}
        nodeOptions={nodeOptions}
        parentOptions={[]}
        endpoints={endpoints}
        onSubmitNode={onSubmitNode}
        onSubmitEdge={() => ({ ok: true })}
        onCancel={() => {}}
        theme={theme}
      />,
    );
    fireEvent.change(screen.getByLabelText('Node label'), { target: { value: 'Node' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create node form' }));

    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('The parent was removed.');
    expect(error.getAttribute('aria-live')).toBe('assertive');
    expect(document.activeElement).toBe(error);
    expect(screen.getByRole('dialog', { name: 'Create node' })).toBeDefined();
  });

  it('updates directional ports with endpoints and submits the edge draft', () => {
    const onSubmitEdge = vi.fn(() => ({ ok: true as const }));
    render(
      <AuthoringDialog
        kind="edge"
        invoker={null}
        nodeOptions={nodeOptions}
        parentOptions={[]}
        endpoints={endpoints}
        onSubmitNode={() => ({ ok: true })}
        onSubmitEdge={onSubmitEdge}
        onCancel={() => {}}
        theme={theme}
      />,
    );

    fireEvent.change(screen.getByLabelText('Source node'), { target: { value: 'beta' } });
    expect((screen.getByLabelText('Source port') as HTMLSelectElement).value).toBe('yes');
    fireEvent.change(screen.getByLabelText('Target node'), { target: { value: 'alpha' } });
    fireEvent.change(screen.getByLabelText('Edge label'), { target: { value: 'Yes' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create edge form' }));

    expect(onSubmitEdge).toHaveBeenCalledWith({
      sourceId: 'beta', sourcePortId: 'yes', targetId: 'alpha', targetPortId: 'in', label: 'Yes',
    });
  });

  it('offers optional named and typed connectors only for saved-header Coral', () => {
    const onSubmitEdge = vi.fn(() => ({ ok: true as const }));
    const { rerender } = render(<AuthoringDialog kind="edge" sourceOwnedEdge028 invoker={null}
      nodeOptions={nodeOptions} parentOptions={[]} endpoints={endpoints}
      onSubmitNode={() => ({ ok: true })} onSubmitEdge={onSubmitEdge}
      onCancel={() => {}} theme={theme} />);
    fireEvent.change(screen.getByLabelText('Edge ID'), { target: { value: ' readOrders ' } });
    fireEvent.change(screen.getByLabelText('Connector type'), { target: { value: ' reads ' } });
    fireEvent.change(screen.getByLabelText('Edge label'), { target: { value: 'Order IDs' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create edge form' }));
    expect(onSubmitEdge).toHaveBeenCalledWith({
      id: 'readOrders', type: 'reads', sourceId: 'alpha', sourcePortId: 'out',
      targetId: 'beta', targetPortId: 'in', label: 'Order IDs',
    });
    rerender(<AuthoringDialog kind="edge" invoker={null} nodeOptions={nodeOptions}
      parentOptions={[]} endpoints={endpoints} onSubmitNode={() => ({ ok: true })}
      onSubmitEdge={onSubmitEdge} onCancel={() => {}} theme={theme} />);
    expect(screen.queryByLabelText('Edge ID')).toBeNull();
    expect(screen.queryByLabelText('Connector type')).toBeNull();
  });

  it('requires an ID when inserting after an existing sequence message', () => {
    const onSubmitEdge = vi.fn(() => ({ ok: true as const }));
    render(<AuthoringDialog kind="edge" sourceOwnedEdge028 positionedSequenceEdge028 invoker={null}
      nodeOptions={nodeOptions} parentOptions={[]} endpoints={endpoints}
      onSubmitNode={() => ({ ok: true })} onSubmitEdge={onSubmitEdge}
      onCancel={() => {}} theme={theme} />);
    expect(screen.getByText('Edge ID (required for insertion)')).toBeTruthy();
    fireEvent.submit(screen.getByRole('form', { name: 'Create edge form' }));
    expect(screen.getByRole('alert').textContent).toContain('existing message identities');
    expect(onSubmitEdge).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Edge ID'), { target: { value: 'follow' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create edge form' }));
    expect(onSubmitEdge).toHaveBeenCalledWith(expect.objectContaining({ id: 'follow' }));
  });

  it('defaults to automatic attachment when semantic ports are optional', () => {
    const onSubmitEdge = vi.fn(() => ({ ok: true as const }));
    render(<AuthoringDialog kind="edge" invoker={null} nodeOptions={nodeOptions}
      parentOptions={[]} endpoints={endpoints.map((endpoint) => ({
        ...endpoint, allowAutomaticAttachment: true,
      }))} onSubmitNode={() => ({ ok: true })} onSubmitEdge={onSubmitEdge}
      onCancel={() => {}} theme={theme} />);
    expect((screen.getByLabelText('Source port') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Target port') as HTMLSelectElement).value).toBe('');
    fireEvent.submit(screen.getByRole('form', { name: 'Create edge form' }));
    expect(onSubmitEdge).toHaveBeenCalledWith({
      sourceId: 'alpha', sourcePortId: '', targetId: 'beta', targetPortId: '',
    });
    fireEvent.change(screen.getByLabelText('Source port'), { target: { value: 'out' } });
    fireEvent.change(screen.getByLabelText('Target port'), { target: { value: 'in' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create edge form' }));
    expect(onSubmitEdge).toHaveBeenLastCalledWith({
      sourceId: 'alpha', sourcePortId: 'out', targetId: 'beta', targetPortId: 'in',
    });
  });

  it('disables edge submission and explains when no distinct capable pair exists', () => {
    render(
      <AuthoringDialog
        kind="edge"
        invoker={null}
        nodeOptions={nodeOptions}
        parentOptions={[]}
        endpoints={[
          { id: 'source-only', label: 'Source only', sourcePorts: endpoints[0].sourcePorts, targetPorts: [] },
          { id: 'inert', label: 'Inert', sourcePorts: [], targetPorts: [] },
        ]}
        onSubmitNode={() => ({ ok: true })}
        onSubmitEdge={() => ({ ok: true })}
        onCancel={() => {}}
        theme={theme}
      />,
    );

    expect((screen.getByRole('button', { name: 'Create edge' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/source.*target|distinct/i);
    expect(screen.getAllByRole('option', { name: 'Source only' })).toHaveLength(1);
    expect(screen.queryByRole('option', { name: 'Inert' })).toBeNull();
  });
});

describe('AuthoringDialog Symbol list (Slice 60 C5)', () => {
  const ARTWORK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
  const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol shield {', '  name "Shield"',
    '  tags "security" "auth"', '  size 24 x 24', '  artwork svg """', ARTWORK, '"""', '}',
    'g service [symbol: "local.shield"]', ''].join('\n');

  async function entries(withLibrary = false) {
    const { projectInstalledSourceToSuccessor028, documentCatalog029 } = await import('@coral-viz/render');
    const { getSourceSymbolPaletteEntries029, userSymbolPaletteEntry029 } = await import('../src/authoringModel');
    const definitions = projectInstalledSourceToSuccessor028(SOURCE).graph!.userSymbols029!;
    const library = { ...userSymbolPaletteEntry029(documentCatalog029('architecture', definitions)
      .userSymbols.get('local.shield')!, 'library', definitions[0]), name: 'Library shield' };
    return getSourceSymbolPaletteEntries029('architecture', ['service', 'database', 'group'], definitions,
      withLibrary ? [library] : []);
  }
  const renderDialog = (symbolEntries029: Awaited<ReturnType<typeof entries>> | undefined,
    onSubmitNode = vi.fn((_input: unknown) => ({ ok: true as const }))) => {
    render(<AuthoringDialog kind="node" sourceOwnedNode028 invoker={null}
      nodeOptions={[{ id: 'service', label: 'service' }, { id: 'database', label: 'database' }]}
      parentOptions={[]} endpoints={[]} symbolEntries029={symbolEntries029}
      onSubmitNode={onSubmitNode} onSubmitEdge={() => ({ ok: true })} onCancel={() => {}} theme={theme} />);
    return onSubmitNode;
  };

  it('lists document and bundled symbols as named radios with decorative thumbnails', async () => {
    renderDialog(await entries());
    const shield = screen.getByRole('radio', { name: 'Shield' });
    expect(shield.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(shield.getAttribute('aria-describedby')!)!.textContent)
      .toBe('document symbol local.shield');
    expect(screen.getByRole('radio', { name: 'Database' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'group' })).toBeTruthy();
    const thumbnails = [...document.querySelectorAll('[data-coral-symbol-thumbnail]')];
    expect(thumbnails).toHaveLength(4);
    for (const thumbnail of thumbnails) expect(thumbnail.getAttribute('aria-hidden')).toBe('true');
    expect(thumbnails[0]!.querySelector('use')).not.toBeNull();
    expect(thumbnails[3]!.querySelector('svg')).not.toBeNull();
    // Node type "service" checks its bundled entry.
    expect((screen.getByRole('radio', { name: 'Service' }) as HTMLInputElement).checked).toBe(true);
  });

  it('filters by whole name and tag, with a status count', async () => {
    renderDialog(await entries());
    fireEvent.change(screen.getByLabelText('Search symbols'), { target: { value: 'auth' } });
    expect(screen.getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value))
      .toEqual(['document:local.shield']);
    expect(screen.getByText('1 of 4 symbols')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search symbols'), { target: { value: 'nothing' } });
    expect(screen.getByText('No symbols match')).toBeTruthy();
  });

  it('a bundled choice sets the type; a user choice submits its symbol and keeps the type', async () => {
    const onSubmitNode = renderDialog(await entries());
    fireEvent.change(screen.getByLabelText('Node ID'), { target: { value: 'store' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Database' }));
    expect((screen.getByLabelText('Node type') as HTMLInputElement).value).toBe('database');
    fireEvent.click(screen.getByRole('radio', { name: 'Shield' }));
    expect(screen.getByText('Symbol: Shield')).toBeTruthy();
    fireEvent.submit(screen.getByRole('form', { name: 'Create node form' }));
    expect(onSubmitNode).toHaveBeenLastCalledWith({ id: 'store', type: 'database', symbol: 'local.shield' });
    fireEvent.click(screen.getByRole('radio', { name: 'Service' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Create node form' }));
    expect(onSubmitNode).toHaveBeenLastCalledWith({ id: 'store', type: 'service' });
  });

  it('keeps a chosen user symbol when Node type is edited afterwards', async () => {
    const onSubmitNode = renderDialog(await entries());
    fireEvent.change(screen.getByLabelText('Node ID'), { target: { value: 'store' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Shield' }));
    fireEvent.change(screen.getByLabelText('Node type'), { target: { value: 'database' } });
    expect((screen.getByRole('radio', { name: 'Shield' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.submit(screen.getByRole('form', { name: 'Create node form' }));
    expect(onSubmitNode).toHaveBeenLastCalledWith({ id: 'store', type: 'database', symbol: 'local.shield' });
  });

  it('a library choice submits its definition; Enter in search does not submit', async () => {
    const onSubmitNode = renderDialog(await entries(true));
    fireEvent.change(screen.getByLabelText('Node ID'), { target: { value: 'gate' } });
    fireEvent.keyDown(screen.getByLabelText('Search symbols'), { key: 'Enter' });
    expect(onSubmitNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Library shield' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Create node form' }));
    expect(onSubmitNode).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'gate', symbol: 'local.shield',
      definition: expect.objectContaining({ symbolId: 'local.shield' }) }));
  });

  it('shows no Symbol list without entries', () => {
    renderDialog(undefined);
    expect(screen.queryByLabelText('Search symbols')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});
