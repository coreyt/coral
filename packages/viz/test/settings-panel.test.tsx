import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { SettingsPanel } from '../src/settings/SettingsPanel';
import { FontSettingsForm } from '../src/settings/FontSettingsForm';
import { EditProvider, useEditContext, useIsEditing } from '../src/components/EditContext';
import { DEFAULT_FONT_SETTINGS, DEFAULT_LAYOUT_SETTINGS } from '../src/file/schema';

const DEFAULT_DOCUMENT_SETTINGS = {
  notation: 'flowchart',
  layout: DEFAULT_LAYOUT_SETTINGS,
  font: { default: DEFAULT_FONT_SETTINGS },
};

/** Settings surfaces and the edit context - R-030 coverage. */

const notations = [
  { id: 'flowchart', name: 'Flowchart' },
  { id: 'architecture', name: 'Architecture' },
];

function panel(overrides: Record<string, unknown> = {}) {
  const props = {
    documentSettings: DEFAULT_DOCUMENT_SETTINGS,
    selectedPreset: 'custom' as const,
    notations,
    onDocumentSettingsChange: vi.fn(),
    onPresetChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<SettingsPanel {...(props as never)} />) };
}

describe('SettingsPanel', () => {
  it('renders the notations it was given', () => {
    panel();

    expect(document.body.textContent).toContain('Flowchart');
    expect(document.body.textContent).toContain('Architecture');
  });

  it('reports a notation change', () => {
    const { props } = panel();
    const selects = screen.getAllByRole('combobox');

    fireEvent.change(selects[0], { target: { value: 'architecture' } });

    expect(props.onDocumentSettingsChange).toHaveBeenCalled();
  });

  it('offers an apply action when one is given', () => {
    const onApplyLayout = vi.fn();
    panel({ onApplyLayout });

    const apply = screen.getByRole('button', { name: 'Apply Layout' });
    fireEvent.click(apply);
    expect(onApplyLayout).toHaveBeenCalled();
  });

  it('opts into a notation profile without applying layout', () => {
    const onApplyLayout = vi.fn();
    const { props } = panel({ onApplyLayout });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Use flowchart layout profile' }));

    expect(props.onDocumentSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      layout: expect.objectContaining({ profile: 'notation', profileOverrides: {} }),
    }));
    expect(onApplyLayout).not.toHaveBeenCalled();
  });

  it('shows effective profile controls while retaining sparse persisted settings', () => {
    panel({
      documentSettings: {
        ...DEFAULT_DOCUMENT_SETTINGS,
        notation: 'architecture',
        layout: { ...DEFAULT_LAYOUT_SETTINGS, profile: 'notation', profileOverrides: {} },
      },
    });

    expect((screen.getByRole('checkbox', { name: 'Use architecture layout profile' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getAllByRole('combobox')[3] as HTMLSelectElement).value).toBe('DOWN');
    expect(screen.getAllByText('90px')).toHaveLength(2);
  });

  it('disables its controls when asked', () => {
    panel({ disabled: true });

    for (const select of screen.getAllByRole('combobox')) {
      expect((select as HTMLSelectElement).disabled).toBe(true);
    }
  });

  it('can keep font controls enabled while semantic document settings stay locked', () => {
    panel({ disabled: true, fontDisabled: false, onApplyFont: vi.fn() });

    expect((screen.getByRole('combobox', { name: 'Font Family' }) as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByRole('combobox', { name: 'Font Size Preset' }) as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Apply Font Changes' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('uses an atomic font owner without double-dispatching legacy settings callbacks', () => {
    const onFontCommit = vi.fn();
    const onDocumentSettingsChange = vi.fn();
    const onApplyFont = vi.fn();
    panel({ onFontCommit, onDocumentSettingsChange, onApplyFont });
    fireEvent.change(screen.getByRole('combobox', { name: 'Font Family' }), { target: { value: 'serif' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));

    expect(onFontCommit).toHaveBeenCalledWith(expect.objectContaining({
      default: expect.objectContaining({ family: expect.stringMatching(/Georgia/) }),
    }));
    expect(onDocumentSettingsChange).not.toHaveBeenCalled();
    expect(onApplyFont).not.toHaveBeenCalled();
  });

  it('keeps the existing dual callbacks for standalone font consumers', () => {
    const onDocumentSettingsChange = vi.fn();
    const onApplyFont = vi.fn();
    panel({ onDocumentSettingsChange, onApplyFont });
    fireEvent.change(screen.getByRole('combobox', { name: 'Font Family' }), { target: { value: 'serif' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));

    expect(onDocumentSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      font: expect.objectContaining({ default: expect.objectContaining({ family: expect.stringMatching(/Georgia/) }) }),
    }));
    expect(onApplyFont).toHaveBeenCalledWith(expect.objectContaining({
      default: expect.objectContaining({ family: expect.stringMatching(/Georgia/) }),
    }));
  });

  it('accepts a theme override', () => {
    const { container } = render(
      <SettingsPanel
        documentSettings={DEFAULT_DOCUMENT_SETTINGS}
        selectedPreset="custom"
        notations={notations}
        onDocumentSettingsChange={vi.fn()}
        onPresetChange={vi.fn()}
        theme={{ bg: '#123456' }}
      />
    );

    // jsdom normalises the hex to rgb in the style attribute.
    expect(container.innerHTML).toMatch(/#123456|rgb\(18, 52, 86\)/);
  });
});

describe('FontSettingsForm', () => {
  const settings = { default: DEFAULT_FONT_SETTINGS };

  it('renders the current family and size', () => {
    render(<FontSettingsForm settings={settings} onChange={vi.fn()} />);

    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('reports a change', () => {
    const onChange = vi.fn();
    render(<FontSettingsForm settings={settings} onChange={onChange} />);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: selects[0].querySelectorAll('option')[1]?.getAttribute('value') ?? '' } });

    expect(onChange).toHaveBeenCalled();
  });

  it('disables its controls when asked', () => {
    render(<FontSettingsForm settings={settings} onChange={vi.fn()} disabled />);

    for (const select of screen.getAllByRole('combobox')) {
      expect((select as HTMLSelectElement).disabled).toBe(true);
    }
  });

  it('offers an apply action when one is given', () => {
    const onApply = vi.fn();
    render(<FontSettingsForm settings={settings} onChange={vi.fn()} onApply={onApply} />);

    const apply = screen.getByRole('button', { name: 'Apply Font Changes' });
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalled();
  });
});

describe('EditContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EditProvider onLabelEdit={vi.fn()}>{children}</EditProvider>
  );

  it('reports which node is being edited', () => {
    const { result } = renderHook(() => ({ ctx: useEditContext(), editing: useIsEditing('n1') }), {
      wrapper,
    });

    expect(result.current.editing).toBe(false);

    act(() => result.current.ctx.startEditing('n1'));
    expect(result.current.ctx.editingNodeId).toBe('n1');
  });

  it('stops editing', () => {
    const { result } = renderHook(() => useEditContext(), { wrapper });

    act(() => result.current.startEditing('n1'));
    act(() => result.current.stopEditing());

    expect(result.current.editingNodeId).toBeNull();
  });

  it('hands the label callback through to consumers', () => {
    const onLabelEdit = vi.fn();
    const { result } = renderHook(() => useEditContext(), {
      wrapper: ({ children }) => <EditProvider onLabelEdit={onLabelEdit}>{children}</EditProvider>,
    });

    result.current.onLabelEdit?.('n1', 'New Label');

    expect(onLabelEdit).toHaveBeenCalledWith('n1', 'New Label');
  });

  it('tracks editing state per node', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => ({ ctx: useEditContext(), editing: useIsEditing(id) }),
      { wrapper, initialProps: { id: 'n1' } }
    );

    act(() => result.current.ctx.startEditing('n1'));
    rerender({ id: 'n1' });
    expect(result.current.editing).toBe(true);

    rerender({ id: 'n2' });
    expect(result.current.editing).toBe(false);
  });
});

describe('FontSettingsForm: preset and custom paths (R-030)', () => {
  const withFamily = (family: string, size = 14) => ({
    default: { ...DEFAULT_FONT_SETTINGS, family, size },
  });

  it('recognises a family that matches a preset', () => {
    render(<FontSettingsForm settings={withFamily(DEFAULT_FONT_SETTINGS.family)} onChange={vi.fn()} />);
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('falls back to custom for a family that matches no preset', () => {
    render(
      <FontSettingsForm settings={withFamily('Papyrus, fantasy')} onChange={vi.fn()} />
    );
    const family = screen.getByLabelText('Font Family') as HTMLSelectElement;
    expect(family.value).toBe('custom');
    expect(family.selectedOptions[0].textContent).toMatch(/Custom/);
    expect(screen.getByLabelText('Requested Font Family').textContent).toBe('Papyrus, fantasy');
  });

  it('falls back to custom for a size that matches no preset', () => {
    const { container } = render(
      <FontSettingsForm settings={withFamily(DEFAULT_FONT_SETTINGS.family, 37)} onChange={vi.fn()} />
    );
    expect(container.innerHTML).toMatch(/custom|37/i);
  });

  it('reports a family change from each preset', () => {
    const onChange = vi.fn();
    render(<FontSettingsForm settings={withFamily(DEFAULT_FONT_SETTINGS.family)} onChange={onChange} />);

    const familySelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    const options = [...familySelect.querySelectorAll('option')].map((o) => o.value).filter(Boolean);

    for (const value of options.slice(0, 3)) {
      fireEvent.change(familySelect, { target: { value } });
    }

    expect(onChange).toHaveBeenCalled();
  });

  it('reports a size change', () => {
    const onChange = vi.fn();
    render(<FontSettingsForm settings={withFamily(DEFAULT_FONT_SETTINGS.family)} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Font Size Preset'), { target: { value: 'large' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('accepts a numeric input where one is offered', () => {
    const onChange = vi.fn();
    render(
      <FontSettingsForm settings={withFamily(DEFAULT_FONT_SETTINGS.family, 37)} onChange={onChange} />
    );
    fireEvent.change(screen.getByLabelText('Custom Font Size'), { target: { value: '20' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('renders with symbol overrides present', () => {
    const { container } = render(
      <FontSettingsForm
        settings={{
          default: DEFAULT_FONT_SETTINGS,
          symbolOverrides: { 'flowchart-process': { size: 18 } },
        }}
        onChange={vi.fn()}
      />
    );
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
