import { useEffect, useMemo, useRef, useState } from 'react';
import { documentCatalog029, type SuccessorUserSymbol029 } from '@coral-viz/render';
import { CoralDialog } from '../ui/CoralDialog';
import { SymbolEditor029 } from './SymbolEditor029';
import { importIcons029 } from '../iconImportClient029';
import { iconFromImport029, iconRecord029, readIconBundle029, writeIconBundle029, ICON_BUNDLE_BYTES_029, type MyIcon029 } from '../myIcons029';
import type { useMyIcons029 } from '../useMyIcons029';

export interface MyIcons029Props {
  open: boolean; onClose(): void; themeName: 'light' | 'dark'; library: ReturnType<typeof useMyIcons029>;
  documentDefinitions: readonly SuccessorUserSymbol029[];
  onPlace(icon: MyIcon029, update?: boolean): boolean;
}
export function MyIcons029({ open, onClose, themeName, library, documentDefinitions, onPlace }: MyIcons029Props) {
  const [pending, setPending] = useState<MyIcon029[]>([]), [selected, setSelected] = useState<MyIcon029>();
  const [query, setQuery] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false);
  const [newId, setNewId] = useState(''), [downloads, setDownloads] = useState<{ url: string; name: string }[]>([]);
  const job = useRef<AbortController | undefined>(undefined);
  useEffect(() => { if (open) void library.refresh(); else { job.current?.abort(); setBusy(false); } }, [open, library.refresh]);
  useEffect(() => () => job.current?.abort(), []);
  useEffect(() => () => downloads.forEach((item) => URL.revokeObjectURL(item.url)), [downloads]);
  const entries = useMemo(() => [...pending, ...library.icons.filter((icon) => !pending.some((item) => item.definition.id === icon.definition.id))], [pending, library.icons]);
  const visible = entries.filter((icon) => `${icon.definition.name} ${icon.definition.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const resolved = selected ? documentCatalog029('architecture', [selected.definition]).userSymbols.get(selected.definition.symbolId) : undefined;
  const documentIcon = selected && documentDefinitions.find((item) => item.id === selected.definition.id);
  const differs = documentIcon && selected && iconRecord029(documentIcon).digest !== selected.digest;
  const files = async (input: FileList | File[]) => {
    job.current?.abort(); const controller = new AbortController(); job.current = controller;
    setBusy(true); setMessage('Importing…');
    try {
      const all = Array.from(input);
      if (all.length > 256) throw new Error('Import at most 256 files at once.');
      const bundles: MyIcon029[] = [], source: { name: string; text: string }[] = [];
      let bytes = 0;
      for (const file of all) {
        if (file.size > (/\.json$/i.test(file.name) ? ICON_BUNDLE_BYTES_029 : 131072)) throw new Error(`${file.name} exceeds the input size limit.`);
        bytes += file.size; if (bytes > ICON_BUNDLE_BYTES_029) throw new Error('Import batch exceeds 5 MiB.');
        const text = await file.text();
        if (/\.json$/i.test(file.name)) bundles.push(...readIconBundle029(text)); else source.push({ name: file.name, text });
      }
      const results = await importIcons029([...source, ...bundles.map((icon) => ({ name: icon.definition.id, text: icon.definition.artwork.text }))], controller.signal);
      if (controller.signal.aborted || job.current !== controller) return;
      const accepted: MyIcon029[] = []; const notices: string[] = [];
      results.forEach((result, index) => {
        if (!result.ok) { notices.push(`${result.name}: ${result.error}`); return; }
        const original = index >= source.length ? bundles[index - source.length] : undefined;
        accepted.push(original ? iconRecord029({ ...original.definition, artwork: { format: 'svg', text: result.text } }) : iconFromImport029(result));
        notices.push(...result.notices);
      });
      // A bundle is one unit: don't partly accept a bundle with an invalid member.
      if (bundles.length && results.slice(source.length).some((result) => !result.ok)) throw new Error(notices.join('\n'));
      if (new Set(accepted.map((icon) => icon.definition.id)).size !== accepted.length) throw new Error('This batch has duplicate icon IDs. Import the files separately or rename them.');
      setPending(accepted); setSelected(accepted[0]); setEditing(false);
      setMessage(`${accepted.length} icons ready. ${notices.join(' ')}`);
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (job.current === controller) { setBusy(false); job.current = undefined; } }
  };
  const save = async (icons: MyIcon029[]) => {
    const conflicts = icons.filter((icon) => library.icons.some((old) => old.definition.id === icon.definition.id && old.digest !== icon.digest));
    if (conflicts.length && !window.confirm(`Replace these stored icons? ${conflicts.map((icon) => icon.definition.name).join(', ')}. Existing diagrams will keep their versions.`)) return;
    if (await library.save(icons)) { setPending((old) => old.filter((icon) => !icons.some((saved) => saved.definition.id === icon.definition.id))); setMessage('Saved to My Icons.'); }
  };
  const exportIcons = (icons: MyIcon029[]) => {
    const chunks: MyIcon029[][] = []; let chunk: MyIcon029[] = [], artBytes = 0, jsonBytes = 100;
    for (const icon of icons) {
      const art = new TextEncoder().encode(icon.definition.artwork.text).length, json = new TextEncoder().encode(JSON.stringify(icon)).length + 2;
      if (chunk.length && (chunk.length === 256 || artBytes + art > 4194304 || jsonBytes + json > ICON_BUNDLE_BYTES_029)) { chunks.push(chunk); chunk = []; artBytes = 0; jsonBytes = 100; }
      chunk.push(icon); artBytes += art; jsonBytes += json;
    }
    if (chunk.length) chunks.push(chunk);
    setDownloads(chunks.map((part, index) => ({ url: URL.createObjectURL(new Blob([writeIconBundle029(part)], { type: 'application/json' })), name: `coral-my-icons-${index + 1}.json` })));
  };
  const commit = (definition: SuccessorUserSymbol029) => {
    try { const next = iconRecord029(definition); setSelected(next); setPending((old) => [next, ...old.filter((item) => item.definition.id !== next.definition.id)]); return true; }
    catch (error) { setMessage(String(error)); return false; }
  };
  const place = (icon: MyIcon029, update = false) => {
    if (onPlace(icon, update)) { setMessage('Placed icon in this document.'); onClose(); }
    else setMessage('Could not place this icon. Finish the current source update or resolve the reported source/port issue, then retry.');
  };
  return <CoralDialog open={open} title="My Icons" closeLabel="Close My Icons" onClose={() => { job.current?.abort(); onClose(); }} themeName={themeName}>
    <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy) void files(event.dataTransfer.files); }}>
      <p>Import an SVG or a Coral icon bundle, or drop files here. Icons stay in this browser; export a bundle to keep a backup.</p>
      <label className="coral-field">Add SVG or icon bundle<input aria-label="Add SVG or icon bundle" type="file" multiple accept=".svg,.json,image/svg+xml,application/json" disabled={busy}
        onChange={(event) => { if (event.target.files) void files(event.target.files); event.target.value = ''; }} /></label>
      {busy && <button onClick={() => { job.current?.abort(); setMessage('Import cancelled.'); }}>Cancel import</button>}
      <p role="status" style={{ whiteSpace: 'pre-wrap' }}>{message || library.storageError}</p>
      {library.storageError && message && <p>{library.storageError}</p>}
      <label>Search icons<input aria-label="Search My Icons" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <button disabled={!pending.length || busy} onClick={() => void save(pending)}>Save imported icons</button>
      <button disabled={!library.icons.length} onClick={() => exportIcons(library.icons)}>Export library</button>
      {downloads.map((item) => <a key={item.url} href={item.url} download={item.name}>{item.name}</a>)}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(260px, 2fr)', gap: 12 }}>
        <div aria-label="My Icons list" style={{ maxHeight: 480, overflow: 'auto' }}>
          {visible.slice(0, 100).map((icon) => <button key={icon.definition.id} aria-pressed={selected?.digest === icon.digest} onClick={() => { setSelected(icon); setEditing(false); setNewId(`${icon.definition.id}_copy`); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <img alt="" width={24} height={24} src={`data:image/svg+xml,${encodeURIComponent(icon.definition.artwork.text)}`} />{icon.definition.name}</button>)}
          {visible.length > 100 && <p>Showing 100 of {visible.length}. Refine your search.</p>}
        </div>
        {selected && <section aria-label="Icon preview">
          <h2>{selected.definition.name}</h2>
          {!editing && <>
            <div style={{ maxWidth: 560, overflow: 'auto' }}>{[false, true].map((dark) => <div key={String(dark)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: dark ? '#222' : '#fff' }}>
              {[24, 48, 96, 256].map((size) => <img key={size} alt={`${selected.definition.name}, ${size} pixels, ${dark ? 'dark' : 'light'}`} width={size} height={size} src={`data:image/svg+xml,${encodeURIComponent(selected.definition.artwork.text)}`} />)}</div>)}</div>
            <button onClick={() => setEditing(true)}>Edit icon details</button>
            <button onClick={() => void save([selected])}>Save selected icon</button>
            <button onClick={() => exportIcons([selected])}>Export selected icon</button>
            <button disabled={busy || Boolean(differs)} onClick={() => place(selected)}>Place in diagram</button>
            {differs && <div role="group" aria-label="Document icon revision differs">
              <p>This document contains a different revision. Updating also changes its existing copies; connected ports are checked first.</p>
              <button onClick={() => place(iconRecord029(documentIcon!))}>Keep document version and place</button>
              <button onClick={() => place(selected, true)}>Update document and place</button>
            </div>}
            <label>New icon ID<input aria-label="New icon ID" value={newId} onChange={(event) => setNewId(event.target.value)} /></label>
            <button onClick={() => commit({ ...selected.definition, id: newId, symbolId: `local.${newId}` })}>Save as new ID</button>
            {library.icons.some((icon) => icon.definition.id === selected.definition.id) && <button onClick={() => {
              if (window.confirm('Delete this stored icon? Existing documents keep their copy.')) void library.remove(selected.definition.id).then(() => setSelected(undefined));
            }}>Delete stored icon</button>}
          </>}
          {editing && resolved && <SymbolEditor029 definition={selected.definition} symbol={resolved} onCommit={commit} onBack={() => setEditing(false)} />}
        </section>}
      </div>
    </div>
  </CoralDialog>;
}
