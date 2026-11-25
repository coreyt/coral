import { documentSymbolDefinition029 } from '@coral-viz/render';
import { describe, expect, it, vi } from 'vitest';
import { iconRecord029, readIconBundle029, writeIconBundle029, iconFromImport029 } from '../src/myIcons029';
import { importIcons029 } from '../src/iconImportClient029';
const icon = () => iconFromImport029({ ok: true, name: 'Wide.svg', text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><path d="M2 2h20v8H2z"/></svg>',
  viewBox: { minX: 0, minY: 0, width: 24, height: 12 }, measures: { inputBytes: 100, canonicalBytes: 100, operations: 4, shapes: 1, depth: 0, references: 0 },
  bounds: { overhang: 0, allowance: .24 }, notices: [], elapsedMs: 1 });
describe('My Icons portability and worker lifetime', () => {
  it('derives aspect-preserving 64-unit size and checks bundle digests', () => {
    const value = icon(); expect(value.definition.size).toEqual({ width: 64, height: 32 });
    expect(readIconBundle029(writeIconBundle029([value]))).toEqual([value]);
    expect(() => readIconBundle029(writeIconBundle029([{ ...value, digest: 'tampered' }]))).toThrow(/digest/);
    expect(() => readIconBundle029(writeIconBundle029([value, value]))).toThrow(/duplicate/);
  });
  it('refuses invalid symbol identity', () => expect(() => iconRecord029({ ...icon().definition, id: '../wrong' })).toThrow());
  it('terminates on cancellation and ignores a late result', async () => {
    const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;
    const controller = new AbortController();
    const promise = importIcons029([{ name: 'a.svg', text: '<svg/>' }], controller.signal, () => worker);
    controller.abort(); await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    worker.onmessage?.({ data: { results: [] } } as MessageEvent);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('does not fall back to unbounded main-thread import when a worker is unavailable', async () => {
    await expect(importIcons029([], new AbortController().signal, () => { throw new Error('unavailable'); })).rejects.toThrow(/browser worker/);
  });
});

it('does not retain untyped bundle metadata after validating its printed source', () => {
  const value = icon();
  (value.definition.size as unknown as { width: string }).width = '64';
  value.digest = documentSymbolDefinition029(value.definition).digest;
  expect(() => readIconBundle029(writeIconBundle029([value]))).toThrow(/digest|invalid/i);
});
