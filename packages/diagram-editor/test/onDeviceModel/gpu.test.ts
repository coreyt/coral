import { describe, expect, it, vi } from 'vitest';
import { gpuName, listGpus, loadGpuChoice, saveGpuChoice, selectedGpu } from '../../src/onDeviceModel/gpu';

const adapter = (vendor: string, architecture: string, extra: Partial<GPUAdapterInfo> = {}) =>
  ({ info: { vendor, architecture, description: '', isFallbackAdapter: false, ...extra } }) as unknown as GPUAdapter;

describe('on-device model GPU choice', () => {
  it('names a GPU by maker and family, adding a description when the browser gives one', () => {
    expect(gpuName({ vendor: 'nvidia', architecture: 'ampere', description: '' })).toBe('NVIDIA · Ampere');
    expect(gpuName({ vendor: 'intel', architecture: 'xe', description: 'Iris Xe' })).toBe('Intel · Xe (Iris Xe)');
    expect(gpuName({ vendor: '', architecture: '' })).toBe('Unknown GPU');
  });

  it('lists each adapter the browser offers once, skipping software adapters', async () => {
    const offers = { 'high-performance': adapter('nvidia', 'ampere'), 'low-power': adapter('intel', 'xe') };
    const gpu = { requestAdapter: vi.fn(async ({ powerPreference }: GPURequestAdapterOptions) => offers[powerPreference!]) } as unknown as GPU;
    expect((await listGpus(gpu)).map(o => [o.powerPreference, o.name])).toEqual([['high-performance', 'NVIDIA · Ampere'], ['low-power', 'Intel · Xe']]);
    const same = { requestAdapter: async () => adapter('nvidia', 'ampere') } as unknown as GPU;
    expect(await listGpus(same)).toHaveLength(1);
    const software = { requestAdapter: async () => adapter('google', 'swiftshader', { isFallbackAdapter: true }) } as unknown as GPU;
    expect(await listGpus(software)).toEqual([]);
    expect(await listGpus(undefined)).toEqual([]);
  });

  it('keeps the choice in this browser and selects it while it is still offered', () => {
    const storage = new Map<string, string>();
    const local = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } as unknown as Storage;
    expect(loadGpuChoice(local)).toBeNull();
    const options = [{ powerPreference: 'high-performance' as const, vendor: 'nvidia', architecture: 'ampere', description: '', name: 'NVIDIA · Ampere' },
      { powerPreference: 'low-power' as const, vendor: 'intel', architecture: 'xe', description: '', name: 'Intel · Xe' }];
    saveGpuChoice(options[1], local);
    expect(loadGpuChoice(local)).toEqual({ powerPreference: 'low-power', vendor: 'intel', architecture: 'xe' });
    expect(selectedGpu(options, loadGpuChoice(local))).toBe(options[1]);
    expect(selectedGpu(options.slice(0, 1), loadGpuChoice(local))).toBe(options[0]);
    storage.set('coral.onDeviceModel.gpu', '{not json');
    expect(loadGpuChoice(local)).toBeNull();
  });
});
