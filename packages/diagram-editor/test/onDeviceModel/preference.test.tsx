import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomPanel, type BottomPanelTheme } from '../../src/BottomPanel';
import { ON_DEVICE_PREFERENCE_KEY, readOnDevicePreference } from '../../src/onDevicePreference';
import { MODEL_MANIFEST } from '../../src/onDeviceModel/storage';
import OnDevicePreference, { UNAVAILABLE } from '../../src/onDeviceModel/ui/OnDevicePreference';
import { fakeModel } from './fakeModel';

function setup(initial: Parameters<typeof fakeModel>[0] = 'none', enabled = false) {
  const fake = fakeModel(initial);
  const onEnabledChange = vi.fn();
  const view = render(<OnDevicePreference enabled={enabled} onEnabledChange={onEnabledChange} model={fake.model} />);
  return { fake, onEnabledChange, view };
}
const checkbox = () => screen.getByRole('checkbox', { name: 'On-device editing model (experimental)' });
const status = () => screen.getAllByRole('status')[0].textContent;

describe('on-device model preference and enable dialog', () => {
  beforeEach(() => window.localStorage.clear());

  it('names the GPU the model will run on before the download, and keeps the choice', async () => {
    const two = [{ powerPreference: 'high-performance' as const, vendor: 'nvidia', architecture: 'ampere', description: '', name: 'NVIDIA · Ampere' },
      { powerPreference: 'low-power' as const, vendor: 'intel', architecture: 'xe', description: '', name: 'Intel · Xe' }];
    const { fake } = setup();
    fake.model.gpus.mockResolvedValue(two);
    fireEvent.click(checkbox());
    const dialog = await screen.findByRole('dialog', { name: 'Turn on the on-device editing model' });
    const first = await within(dialog).findByRole('radio', { name: 'NVIDIA · Ampere' });
    expect((first as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Intel · Xe' }));
    expect(JSON.parse(window.localStorage.getItem('coral.onDeviceModel.gpu')!)).toEqual({ powerPreference: 'low-power', vendor: 'intel', architecture: 'xe' });
  });

  it('states size, host, privacy, limits, memory and licence before any download', async () => {
    const { fake, onEnabledChange } = setup();
    fireEvent.click(checkbox());
    const dialog = await screen.findByRole('dialog', { name: 'Turn on the on-device editing model' });
    const text = dialog.textContent!;
    expect(text).toContain(`about ${Math.round(MODEL_MANIFEST.totalBytes / 1e6)} MB, from huggingface.co`);
    expect(text).toContain('Hugging Face and its download servers see your IP address');
    expect(text).toContain('Your diagram and requests are not sent anywhere');
    expect(text).toContain('one to four edits');
    expect(text).toContain('can add, drop or invent edits');
    expect(text).toContain('about 1.2 GB of memory while working, measured on one workstation');
    expect(text).toContain('LFM Open License v1.0');
    expect(text).toContain('10 million US dollars');
    expect(dialog.querySelector('pre')!.textContent).toMatch(/^LFM Open License v1\.0/);
    expect(fake.model.download).not.toHaveBeenCalled();
    expect(onEnabledChange).not.toHaveBeenCalled();
  });

  it('bundles the exact licence file the manifest names', () => {
    const bundled = readFileSync(join(import.meta.dirname, '../../src/onDeviceModel/model-LICENSE.txt'));
    expect(createHash('sha256').update(bundled).digest('hex')).toBe(MODEL_MANIFEST.files.find(file => file.path === 'LICENSE')!.sha256);
  });

  it('Cancel stores nothing and downloads nothing', async () => {
    const { fake, onEnabledChange } = setup();
    fireEvent.click(checkbox());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(status()).toBe('Nothing was downloaded.');
    expect(onEnabledChange).not.toHaveBeenCalled();
    expect(fake.model.download).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ON_DEVICE_PREFERENCE_KEY)).toBeNull();
  });

  it('offers no download when the probe or the storage estimate fails', async () => {
    const { fake } = setup();
    fake.model.probe.mockResolvedValueOnce({ ok: false, reason: 'no-webgpu' } as never);
    fireEvent.click(checkbox());
    await waitFor(() => expect(status()).toBe(UNAVAILABLE['no-webgpu']));
    fake.model.estimate.mockResolvedValueOnce({ ok: false, freeBytes: 50e6, neededBytes: MODEL_MANIFEST.totalBytes });
    fireEvent.click(checkbox());
    await waitFor(() => expect(status()).toMatch(/^Not enough storage: the model needs \d+ MB; about 50 MB is free\.$/));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.model.download).not.toHaveBeenCalled();
  });

  it('downloads with announced progress, then shows the stored size and Remove model', async () => {
    const { fake, onEnabledChange, view } = setup();
    fireEvent.click(checkbox());
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    expect(onEnabledChange).toHaveBeenCalledWith(true);
    await waitFor(() => expect(status()).toBe('The model is ready. Use the AI tab to ask for an edit.'));
    view.rerender(<OnDevicePreference enabled onEnabledChange={onEnabledChange} model={fake.model} />);
    await screen.findByText(/Downloaded and verified: \d+ MB stored in this browser\./);
    fireEvent.click(screen.getByRole('button', { name: 'Remove model' }));
    await waitFor(() => expect(status()).toBe('The model was removed.'));
    await screen.findByRole('button', { name: 'Download model' });
  });

  it('reports a second tab, and offers to delete the model when turned off', async () => {
    const { fake, onEnabledChange } = setup('ready', true);
    fake.model.remove.mockResolvedValueOnce('in-use' as never);
    await screen.findByText(/Downloaded and verified/);
    fireEvent.click(checkbox());
    expect(onEnabledChange).toHaveBeenCalledWith(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete model' }));
    await waitFor(() => expect(status()).toBe('The model is in use in another tab.'));
    await waitFor(() => expect(document.activeElement).toBe(checkbox()));
  });
});

describe('on-device model download interruptions', () => {
  beforeEach(() => window.localStorage.clear());
  const start = async (fake: ReturnType<typeof fakeModel>) => {
    fake.holdDownloads();
    fireEvent.click(checkbox());
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));
    await screen.findByRole('progressbar', { name: 'Model download' });
    expect(status()).toBe('Downloading the model: 50%.');
  };

  it('cancels a download and returns focus to the checkbox', async () => {
    const { fake } = setup();
    await start(fake);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel download' }));
    await waitFor(() => expect(status()).toBe('Download cancelled. Partial files were deleted.'));
    await waitFor(() => expect(document.activeElement).toBe(checkbox()));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('reports a failed download', async () => {
    const { fake } = setup();
    await start(fake);
    await act(async () => fake.failDownload('the network went away'));
    await waitFor(() => expect(status()).toBe('The download failed: the network went away. Partial files were deleted; download again to retry.'));
  });

  it('turning the feature off mid-download stops it', async () => {
    const { fake, onEnabledChange, view } = setup();
    await start(fake);
    view.rerender(<OnDevicePreference enabled onEnabledChange={onEnabledChange} model={fake.model} />);
    fireEvent.click(checkbox());
    expect(onEnabledChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
  });

  it('returns focus to the checkbox after Remove model and Keep it', async () => {
    const { onEnabledChange } = setup('ready', true);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove model' }));
    await waitFor(() => expect(document.activeElement).toBe(checkbox()));
    expect(onEnabledChange).not.toHaveBeenCalled();
  });

  it('offers no download while the manifest names no published revision', async () => {
    const { fake } = setup();
    fake.model.manifest = { ...fake.model.manifest, source: { ...fake.model.manifest.source, revision: null } };
    fireEvent.click(checkbox());
    await waitFor(() => expect(status()).toBe('The model for this Coral build is not published yet.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.model.probe).not.toHaveBeenCalled();
  });
});

describe('the feature stays off until the user opts in', () => {
  it('reads the opt-in from storage in this build, and as off when nothing is stored', () => {
    window.localStorage.removeItem(ON_DEVICE_PREFERENCE_KEY);
    expect(readOnDevicePreference()).toBe(false);
    window.localStorage.setItem(ON_DEVICE_PREFERENCE_KEY, 'on');
    expect(readOnDevicePreference()).toBe(true);
    window.localStorage.removeItem(ON_DEVICE_PREFERENCE_KEY);
  });

  it('shows the AI tab only for the on-device panel, without provider chat or voice', () => {
    const theme = new Proxy({}, { get: () => '#000' }) as BottomPanelTheme;
    const props = { activeTab: 'ai' as const, onTabChange: () => {}, collapsed: false, onToggleCollapsed: () => {},
      diagnosticEntries: [], onDiagnosticHover: () => {}, onAskAboutDiagnostic: () => {}, chatEntries: [],
      isGenerating: false, hasApiKey: false, onSubmit: () => true, theme };
    const { rerender } = render(<BottomPanel {...props} />);
    expect(screen.queryByRole('tab', { name: 'AI' })).toBeNull();
    act(() => rerender(<BottomPanel {...props} onDevicePanel={<p>On-device panel</p>} />));
    expect(screen.getByRole('tab', { name: 'AI' })).toBeTruthy();
    expect(screen.getByText('On-device panel')).toBeTruthy();
    expect(screen.queryByRole('log', { name: 'Chat log' })).toBeNull();
    expect(screen.queryByRole('button', { name: /microphone|voice/i })).toBeNull();
  });
});
