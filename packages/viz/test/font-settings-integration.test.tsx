import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FONT_SETTINGS,
  DEFAULT_LAYOUT_SETTINGS,
  type DiagramFontSettings,
  type DocumentSettings,
} from '../src/file/schema.js';
import { FontSettingsForm } from '../src/settings/FontSettingsForm.js';
import { SettingsPanel } from '../src/settings/SettingsPanel.js';
import { useSettings } from '../src/settings/useSettings.js';

const notations = [
  { id: 'flowchart', name: 'Flowchart' },
  { id: 'erd', name: 'Entity relationship' },
];

function documentSettings(font?: DiagramFontSettings): DocumentSettings {
  return {
    notation: 'flowchart',
    layout: DEFAULT_LAYOUT_SETTINGS,
    ...(font === undefined ? {} : { font }),
  };
}

describe('useSettings font draft ownership', () => {
  it('defaults only genuinely new hook state and keeps supplied old settings absent', () => {
    const fresh = renderHook(() => useSettings());
    const oldSettings = documentSettings();
    const loaded = renderHook(() => useSettings({ initialDocumentSettings: oldSettings }));

    expect(fresh.result.current.documentSettings.font).toEqual({
      default: DEFAULT_FONT_SETTINGS,
    });
    expect(fresh.result.current.documentSettings.font?.default).not.toBe(DEFAULT_FONT_SETTINGS);
    expect(Object.hasOwn(loaded.result.current.documentSettings, 'font')).toBe(false);
    expect(loaded.result.current.fontDraft).toEqual({ default: DEFAULT_FONT_SETTINGS });
  });

  it('retains a draft across unrelated updates and resets for external font changes', () => {
    const originalFont = { default: { ...DEFAULT_FONT_SETTINGS } };
    const { result } = renderHook(() => useSettings({
      initialDocumentSettings: documentSettings(originalFont),
    }));

    act(() => result.current.updateFontDraft({
      ...result.current.fontDraft,
      default: { ...result.current.fontDraft.default, size: 22 },
    }));
    act(() => result.current.updateDocumentSettings({
      ...result.current.documentSettings,
      notation: 'erd',
    }));
    expect(result.current.fontDraft.default.size).toBe(22);

    act(() => result.current.updateDocumentSettings({
      ...result.current.documentSettings,
      font: { default: { ...DEFAULT_FONT_SETTINGS, family: 'monospace', size: 16 } },
    }));
    expect(result.current.fontDraft.default).toMatchObject({ family: 'monospace', size: 16 });
  });

  it('resets two absent-font documents using documentKey', () => {
    const { result, rerender } = renderHook(
      ({ documentKey }) => useSettings({
        initialDocumentSettings: documentSettings(),
        documentKey,
      }),
      { initialProps: { documentKey: 1 } },
    );

    act(() => result.current.updateFontDraft({
      ...result.current.fontDraft,
      default: { ...result.current.fontDraft.default, size: 23 },
    }));
    expect(result.current.fontDraft.default.size).toBe(23);

    act(() => result.current.updateDocumentSettings(documentSettings()));
    rerender({ documentKey: 2 });
    expect(result.current.fontDraft.default.size).toBe(14);
  });
});

describe('FontSettingsForm requested and effective views', () => {
  it('shows an honest Custom state, exact requested family, and portable preview', () => {
    const requested = '  Papyrus, fantasy  ';
    const { container } = render(
      <FontSettingsForm
        settings={{
          default: { family: requested, size: 19, weight: 575, lineHeight: 1.7 },
        }}
        onChange={vi.fn()}
      />,
    );

    const family = screen.getByLabelText('Font Family') as HTMLSelectElement;
    const preview = screen.getByLabelText('Font Preview') as HTMLDivElement;
    expect(family.value).toBe('custom');
    expect(family.selectedOptions[0].textContent).toMatch(/Custom/);
    expect(screen.getByLabelText('Requested Font Family').textContent).toBe(requested);
    expect(preview.style.fontFamily).toBe('"Coral Inter"');
    expect(preview.style.fontSize).toBe('19px');
    expect(preview.style.fontWeight).toBe('400');
    expect(preview.style.lineHeight).toBe('1.7');
    expect(preview.classList.contains('coral-font-text')).toBe(true);
    expect(container.querySelector('style[data-coral-font-preview]')?.textContent)
      .toContain("@font-face{font-family:'Coral Inter'");
  });

  it('preserves arbitrary family, numeric weight, and overrides when editing size', () => {
    const onChange = vi.fn();
    const settings = {
      default: {
        family: '"Private Face", serif',
        size: 13,
        weight: 575,
        lineHeight: 1.6,
      },
      symbolOverrides: { service: { size: 20 } },
    } satisfies DiagramFontSettings;
    render(<FontSettingsForm settings={settings} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Custom Font Size'), {
      target: { value: '18' },
    });

    expect(onChange).toHaveBeenCalledWith({
      default: { ...settings.default, size: 18 },
      symbolOverrides: settings.symbolOverrides,
    });
  });

  it('offers the documented 2.5 line-height maximum', () => {
    render(
      <FontSettingsForm
        settings={{ default: { ...DEFAULT_FONT_SETTINGS } }}
        onChange={vi.fn()}
      />,
    );

    expect((screen.getByLabelText('Line Height') as HTMLInputElement).max).toBe('2.5');
  });
});

describe('SettingsPanel font staging and Apply', () => {
  it('renders the Font section and required controls unconditionally', () => {
    render(
      <SettingsPanel
        documentSettings={documentSettings()}
        selectedPreset="custom"
        notations={notations}
        onDocumentSettingsChange={vi.fn()}
        onPresetChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Font Settings')).toBeTruthy();
    expect(screen.getByLabelText('Font Family')).toBeTruthy();
    expect(screen.getByLabelText('Font Size Preset')).toBeTruthy();
    expect(screen.getByLabelText('Custom Font Size')).toBeTruthy();
    expect(screen.getByLabelText('Font Weight')).toBeTruthy();
    expect(screen.getByLabelText('Line Height')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply Font Changes' })).toBeTruthy();
  });

  it('stages without committing, then raw-merges once with callback identity', () => {
    const raw = {
      default: {
        ...DEFAULT_FONT_SETTINGS,
        vendorDefault: 'keep',
      },
      symbolOverrides: {
        service: { size: 20, vendorOverride: true },
        malformed: null,
      },
      vendorTopLevel: { keep: true },
    };
    const onDocumentSettingsChange = vi.fn();
    const onApplyFont = vi.fn();
    const onApplyLayout = vi.fn();
    render(
      <SettingsPanel
        documentSettings={documentSettings(raw as unknown as DiagramFontSettings)}
        selectedPreset="custom"
        notations={notations}
        onDocumentSettingsChange={onDocumentSettingsChange}
        onPresetChange={vi.fn()}
        onApplyLayout={onApplyLayout}
        onApplyFont={onApplyFont}
      />,
    );

    fireEvent.change(screen.getByLabelText('Custom Font Size'), {
      target: { value: '18' },
    });
    expect(onDocumentSettingsChange).not.toHaveBeenCalled();
    expect(onApplyFont).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Font Changes' }));

    expect(onDocumentSettingsChange).toHaveBeenCalledTimes(1);
    expect(onApplyFont).toHaveBeenCalledTimes(1);
    expect(onApplyLayout).not.toHaveBeenCalled();
    const nextSettings = onDocumentSettingsChange.mock.calls[0][0] as DocumentSettings;
    const applied = onApplyFont.mock.calls[0][0];
    expect(nextSettings.font).toBe(applied);
    expect(applied).toEqual({
      default: {
        ...DEFAULT_FONT_SETTINGS,
        size: 18,
        vendorDefault: 'keep',
      },
      symbolOverrides: raw.symbolOverrides,
      vendorTopLevel: { keep: true },
    });
  });

  it('retains an uncontrolled draft for unrelated changes but resets by document key', () => {
    const font = { default: { ...DEFAULT_FONT_SETTINGS } };
    const baseProps = {
      selectedPreset: 'custom' as const,
      notations,
      onDocumentSettingsChange: vi.fn(),
      onPresetChange: vi.fn(),
    };
    const view = render(
      <SettingsPanel
        {...baseProps}
        documentKey={1}
        documentSettings={documentSettings(font)}
      />,
    );

    fireEvent.change(screen.getByLabelText('Custom Font Size'), {
      target: { value: '18' },
    });
    expect((screen.getByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('18');

    view.rerender(
      <SettingsPanel
        {...baseProps}
        documentKey={1}
        documentSettings={{ ...documentSettings(font), notation: 'erd' }}
      />,
    );
    expect((screen.getByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('18');

    view.rerender(
      <SettingsPanel
        {...baseProps}
        documentKey={2}
        documentSettings={documentSettings()}
      />,
    );
    expect((screen.getByLabelText('Custom Font Size') as HTMLInputElement).value).toBe('14');
  });

  it('disables every font control and Apply action with the panel', () => {
    render(
      <SettingsPanel
        documentSettings={documentSettings()}
        selectedPreset="custom"
        notations={notations}
        onDocumentSettingsChange={vi.fn()}
        onPresetChange={vi.fn()}
        disabled
      />,
    );

    for (const name of [
      'Font Family',
      'Font Size Preset',
      'Custom Font Size',
      'Font Weight',
      'Line Height',
    ]) {
      expect((screen.getByLabelText(name) as HTMLInputElement).disabled).toBe(true);
    }
    expect((screen.getByRole('button', { name: 'Apply Font Changes' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});
