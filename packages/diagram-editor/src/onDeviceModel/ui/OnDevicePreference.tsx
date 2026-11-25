/**
 * The Preferences section of the on-device editing model (R-066 AC-2, AC-3,
 * AC-7, AC-8; coralsmol integration plan W-20).
 *
 * Turning it on runs the capability probe and the storage estimate, then
 * shows the enable dialog before any network request. **Download** stores
 * the choice and downloads; **Cancel** stores nothing. Turning it off offers
 * to delete the model. Wording is a proposal until the UI review.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CoralDialog } from '../../ui/CoralDialog';
import type { CapabilityResult, OnDeviceModel } from '../index';
import { loadGpuChoice, saveGpuChoice, selectedGpu, type GpuOption } from '../gpu';
import { publishedBaseUrl, type StoredModelState } from '../storage';
import LICENSE_TEXT from '../model-LICENSE.txt?raw';
import { sharedOnDeviceModel } from './sharedModel';

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export const UNAVAILABLE: Record<Exclude<CapabilityResult, { ok: true }>['reason'], string> = {
  'no-webgpu': 'Not available in this browser: it needs WebGPU.',
  'fallback-adapter': 'Not available in this browser: WebGPU offers only a software adapter here.',
  'no-opfs': 'Not available in this browser: it needs the origin private file system.',
  'no-locks': 'Not available in this browser: it needs Web Locks.',
};

export interface OnDevicePreferenceProps {
  enabled: boolean;
  onEnabledChange(enabled: boolean): void;
  themeName?: 'light' | 'dark';
  model?: OnDeviceModel;
}

/** The GPUs this browser offers the model, by name; the choice is kept for this browser on this machine. */
function GpuPicker({ gpus }: { gpus: GpuOption[] | null }) {
  const [chosen, setChosen] = useState(() => loadGpuChoice());
  const selected = gpus ? selectedGpu(gpus, chosen) : undefined;
  // The first listing keeps its default, so a later change of GPU is noticed.
  useEffect(() => { if (selected && !chosen) { saveGpuChoice(selected); setChosen(selected); } }, [selected, chosen]);
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, fontSize: 12 }}>
      <legend style={{ fontSize: 12, fontWeight: 600 }}>GPU</legend>
      {gpus === null && <p>Finding the GPUs this browser offers.</p>}
      {gpus?.length === 0 && <p>This browser offers no GPU for the model.</p>}
      {gpus?.map(gpu => (
        <label key={gpu.powerPreference} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" name="on-device-gpu" checked={gpu === selected}
            onChange={() => { saveGpuChoice(gpu); setChosen(gpu); }} />
          {gpu.name}
        </label>
      ))}
      {gpus?.length === 1 && <p style={{ margin: '2px 0 0' }}>This browser offers one GPU for the model. Browsers name GPUs only by maker and family.</p>}
    </fieldset>
  );
}

export default function OnDevicePreference({ enabled, onEnabledChange, themeName, model: given }: OnDevicePreferenceProps) {
  const model = useRef(given ?? null);
  const getModel = () => (model.current ??= sharedOnDeviceModel());
  const [message, setMessage] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stored, setStored] = useState<{ state: StoredModelState; bytes: number } | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [offerDelete, setOfferDelete] = useState(false);
  const [gpus, setGpus] = useState<GpuOption[] | null>(null);
  const download = useRef<AbortController | null>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const focusCheckbox = () => queueMicrotask(() => checkboxRef.current?.focus());
  const announced = useRef(-1);
  const manifest = dialogOpen ? getModel().manifest : null;

  const refresh = useCallback(async () => {
    const current = getModel();
    setStored({ state: await current.stored(), bytes: await current.storedBytes() });
  }, []);
  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);
  useEffect(() => {
    if ((enabled || dialogOpen) && !gpus) void getModel().gpus().then(setGpus, () => setGpus([]));
  }, [enabled, dialogOpen, gpus]);
  useEffect(() => () => download.current?.abort(), []);

  const turnOn = async () => {
    // Without a published revision there is nothing to download; nothing is stored.
    if (!publishedBaseUrl(getModel().manifest)) return setMessage('The model for this Coral build is not published yet.');
    setMessage('Checking this browser.');
    const capability = await getModel().probe();
    if (!capability.ok) return setMessage(UNAVAILABLE[capability.reason]);
    const space = await getModel().estimate();
    if (!space.ok) {
      return setMessage(`Not enough storage: the model needs ${megabytes(space.neededBytes)}; about ${megabytes(space.freeBytes)} is free.`);
    }
    setMessage('');
    setDialogOpen(true);
  };

  const startDownload = async () => {
    setDialogOpen(false);
    onEnabledChange(true);
    const controller = download.current = new AbortController();
    announced.current = -1;
    setProgress({ loaded: 0, total: getModel().manifest.totalBytes });
    setMessage('Downloading the model.');
    try {
      const result = await getModel().download({ signal: controller.signal, onProgress: (loaded, total) => {
        setProgress({ loaded, total });
        // Announce at most once per tenth of the download.
        const tenth = Math.floor((loaded / total) * 10);
        if (tenth > announced.current) { announced.current = tenth; setMessage(`Downloading the model: ${tenth * 10}%.`); }
      } });
      setMessage(result === 'in-use' ? 'The model is in use in another tab.'
        : result === 'busy' ? 'The model is busy in this tab.' : 'The model is ready. Use the AI tab to ask for an edit.');
    } catch (error) {
      setMessage(controller.signal.aborted ? 'Download cancelled. Partial files were deleted.'
        : `The download failed: ${(error as Error).message}. Partial files were deleted; download again to retry.`);
    } finally {
      download.current = null;
      setProgress(null);
      await refresh();
      if (controller.signal.aborted) focusCheckbox();
    }
  };

  const remove = async () => {
    const result = await getModel().remove();
    setOfferDelete(false);
    setMessage(result === 'in-use' ? 'The model is in use in another tab.' : result === 'busy' ? 'The model is busy in this tab.' : 'The model was removed.');
    await refresh();
    focusCheckbox();
  };

  const toggle = (checked: boolean) => {
    if (checked) { void turnOn(); return; }
    download.current?.abort();
    onEnabledChange(false);
    setOfferDelete(Boolean(stored && stored.bytes > 0));
    setMessage('The on-device model is off.');
  };

  const percent = progress && progress.total ? Math.floor((progress.loaded / progress.total) * 100) : 0;
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input ref={checkboxRef} type="checkbox" checked={enabled} onChange={event => toggle(event.target.checked)} />
        <span style={{ fontSize: 13 }}>On-device editing model (experimental)</span>
      </label>
      <p role="status" aria-live="polite" style={{ fontSize: 12, minHeight: 16 }}>{message}</p>

      {progress && (
        <div>
          <progress aria-label="Model download" value={progress.loaded} max={progress.total} />
          <span style={{ fontSize: 12, marginLeft: 6 }}>{percent}%</span>
          <button type="button" className="coral-button" onClick={() => download.current?.abort()}>Cancel download</button>
        </div>
      )}

      {enabled && !progress && stored && (
        <div style={{ fontSize: 12 }}>
          {stored.state === 'ready' && <p>Downloaded and verified: {megabytes(stored.bytes)} stored in this browser.</p>}
          {stored.state === 'none' && <p>The model is not downloaded.</p>}
          {stored.state === 'other' && <p>A different model version is stored. Downloading replaces it.</p>}
          {stored.state !== 'ready' && publishedBaseUrl(getModel().manifest) && <button type="button" className="coral-button" onClick={() => void turnOn()}>Download model</button>}
          {stored.bytes > 0 && <button type="button" className="coral-button" onClick={() => void remove()}>Remove model</button>}
          <GpuPicker gpus={gpus} />
        </div>
      )}

      {offerDelete && (
        <div style={{ fontSize: 12 }}>
          <p>Delete the downloaded model too?</p>
          <button type="button" className="coral-button" onClick={() => void remove()}>Delete model</button>
          <button type="button" className="coral-button" onClick={() => { setOfferDelete(false); focusCheckbox(); }}>Keep it</button>
        </div>
      )}

      {manifest && (
        <CoralDialog open={dialogOpen} title="Turn on the on-device editing model" closeLabel="Close without downloading" themeName={themeName}
          initialFocus="first"
          onClose={() => { setDialogOpen(false); setMessage('Nothing was downloaded.'); }}>
          <div style={{ maxWidth: 460, fontSize: 13, display: 'grid', gap: 8 }}>
            {/* Focus starts on the facts, so Enter cannot start the download unread. */}
            <p tabIndex={-1} data-initial-focus>Coral downloads the model, about {megabytes(manifest.totalBytes)}, from
              {' '}{manifest.source.host}. Hugging Face and its download servers see your IP address when the files download.</p>
            <p>Requests run in this browser. Your diagram and requests are not sent anywhere.</p>
            <p>It suits short requests of one to four edits. It cannot move a node to another group, rename a source ID,
              change styles or properties, or delete a node together with its connections.</p>
            <p>Review every result before you apply it: the model can add, drop or invent edits.</p>
            <p>It uses about 1.2 GB of memory while working, measured on one workstation.</p>
            <GpuPicker gpus={gpus} />
            <p>This feature is experimental. The model is licensed under the {manifest.licence}, which does not cover
              commercial use by an organization with annual revenue of 10 million US dollars or more.</p>
            <details>
              <summary>Show the licence text</summary>
              <pre tabIndex={0} aria-label="LFM Open License v1.0 text" style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', fontSize: 11 }}>
                {LICENSE_TEXT}</pre>
            </details>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button type="button" className="coral-button coral-button--primary" onClick={() => void startDownload()}>
                Download
              </button>
              <button type="button" className="coral-button" onClick={() => { setDialogOpen(false); setMessage('Nothing was downloaded.'); }}>
                Cancel
              </button>
            </div>
          </div>
        </CoralDialog>
      )}
    </div>
  );
}
