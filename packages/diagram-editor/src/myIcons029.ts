import { admitSvgArtwork029, documentSymbolDefinition029, projectInstalledSourceToSuccessor028, printUserSymbolDefinition029,
  type SuccessorUserSymbol029 } from '@coral-viz/render';
import type { IconImportResult029 } from './iconImportClient029';
export interface MyIcon029 { definition: SuccessorUserSymbol029; digest: string }
export const ICON_BUNDLE_BYTES_029 = 5_242_880;
export function iconFromImport029(item: Extract<IconImportResult029, { ok: true }>): MyIcon029 {
  const id = 'icon_' + (item.name.replace(/\.svg$/i, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 80) || 'untitled');
  const scale = 64 / Math.max(item.viewBox.width, item.viewBox.height);
  return iconRecord029({ id, symbolId: `local.${id}`, name: item.name.replace(/\.svg$/i, ''), tags: [],
    size: { width: item.viewBox.width * scale, height: item.viewBox.height * scale }, label: 'below',
    outline: 'rectangle', tint: 'none', anchors: [], ports: [], artwork: { format: 'svg', text: item.text } });
}
export function iconRecord029(definition: SuccessorUserSymbol029): MyIcon029 {
  if (!definition || typeof definition.id !== 'string' || !/^[a-zA-Z_]\w*$/.test(definition.id) || definition.symbolId !== `local.${definition.id}`)
    throw new Error('An icon needs a valid local symbol ID.');
  const admission = admitSvgArtwork029(definition.artwork.text);
  if (!admission.ok) throw new Error('Invalid SVG artwork.');
  definition = { ...definition, artwork: { format: 'svg', text: admission.artwork.canonicalText } };
  const text = '@diagram architecture\n@coralVersion "0.2.9"\n' + printUserSymbolDefinition029(definition);
  const parsed = projectInstalledSourceToSuccessor028(text);
  const normalized = parsed.graph?.userSymbols029?.[0];
  if (!normalized || parsed.diagnostics.length) throw new Error('Invalid icon definition.');
  return { definition: normalized, digest: documentSymbolDefinition029(normalized).digest };
}
export function readIconBundle029(text: string): MyIcon029[] {
  if (new TextEncoder().encode(text).length > ICON_BUNDLE_BYTES_029) throw new Error('Icon bundle exceeds 5 MiB.');
  const value = JSON.parse(text);
  if (value?.format !== 'coral.my-icons' || value.version !== 1 || !Array.isArray(value.icons) || value.icons.length > 256)
    throw new Error('Expected a Coral My Icons version 1 bundle with at most 256 entries.');
  const icons: MyIcon029[] = value.icons.map((item: MyIcon029) => {
    const validated = iconRecord029(item.definition);
    if (validated.digest !== item.digest) throw new Error('Icon bundle digest does not match its definition.');
    return validated;
  });
  if (new Set(icons.map((icon) => icon.definition.id)).size !== icons.length ||
    icons.reduce((n, icon) => n + new TextEncoder().encode(icon.definition.artwork.text).length, 0) > 4_194_304)
    throw new Error('Bundle has duplicate IDs or more than 4 MiB artwork.');
  return icons;
}
export const writeIconBundle029 = (icons: MyIcon029[]) => JSON.stringify({ format: 'coral.my-icons', version: 1, icons });
export interface MyIconStore029 { list(): Promise<MyIcon029[]>; put(icons: MyIcon029[]): Promise<void>; delete(id: string): Promise<void> }
export function createMyIconStore029(factory: IDBFactory = globalThis.indexedDB): MyIconStore029 {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    if (!factory) { reject(new Error('My Icons storage is unavailable. Use the icon in this document or export a bundle.')); return; }
    const request = factory.open('coral.my-icons.v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('icons', { keyPath: 'definition.id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('My Icons storage is blocked by another tab.'));
  });
  // Capture rejection immediately, while retaining it for every operation.
  void database.catch(() => {});
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> => {
    const db = await database;
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('icons', mode); let result: T;
      tx.oncomplete = () => resolve(result!); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('My Icons write failed.'));
      try { action(tx.objectStore('icons'), (value) => { result = value; }); } catch (error) { tx.abort(); reject(error); }
    });
  };
  return {
    list: () => run('readonly', (store, done) => { const r = store.getAll(); r.onsuccess = () => done(r.result); }),
    delete: (id) => run('readwrite', (store, done) => { store.delete(id); done(undefined); }),
    put: (icons) => run('readwrite', (store, done) => {
      const r = store.getAll(); r.onsuccess = () => {
        const merged = new Map<string, MyIcon029>(r.result.map((icon: MyIcon029) => [icon.definition.id, icon]));
        for (const icon of icons) merged.set(icon.definition.id, icon);
        if ([...merged.values()].reduce((n, icon) => n + new TextEncoder().encode(icon.definition.artwork.text).length, 0) > 16_777_216) {
          txAbort(); return;
        }
        for (const icon of icons) store.put(icon); done(undefined);
      };
      function txAbort() { store.transaction.abort(); }
    }),
  };
}
