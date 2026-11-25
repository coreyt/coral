/**
 * The GPU the on-device model runs on (R-066). A page cannot list a
 * machine's GPUs: WebGPU offers at most one adapter for each power
 * preference and names it only by vendor and architecture (the description
 * is usually withheld). Those adapters, without duplicates, are the choices.
 * The choice is kept in this browser on this machine.
 */
export interface GpuOption {
  powerPreference: GPUPowerPreference;
  vendor: string;
  architecture: string;
  description: string;
  /** For people, e.g. "NVIDIA · Ampere". */
  name: string;
}
export type GpuChoice = Pick<GpuOption, 'powerPreference' | 'vendor' | 'architecture'>;

const VENDORS: Record<string, string> = {
  nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel', apple: 'Apple', qualcomm: 'Qualcomm', arm: 'Arm', microsoft: 'Microsoft',
};

export function gpuName(info: { vendor: string; architecture: string; description?: string }): string {
  const vendor = VENDORS[info.vendor.toLowerCase()] ?? (info.vendor || 'Unknown GPU');
  const architecture = info.architecture ? info.architecture.replace(/^./, letter => letter.toUpperCase()) : '';
  const detail = info.description?.trim();
  return [vendor, architecture].filter(Boolean).join(' · ') + (detail ? ` (${detail})` : '');
}

export async function listGpus(gpu: GPU | undefined = globalThis.navigator?.gpu): Promise<GpuOption[]> {
  const options: GpuOption[] = [];
  for (const powerPreference of ['high-performance', 'low-power'] as const) {
    const adapter = await gpu?.requestAdapter({ powerPreference }).catch(() => null);
    if (!adapter || adapter.info.isFallbackAdapter) continue;
    const { vendor, architecture, description } = adapter.info;
    if (options.some(o => o.vendor === vendor && o.architecture === architecture && o.description === description)) continue;
    options.push({ powerPreference, vendor, architecture, description, name: gpuName(adapter.info) });
  }
  return options;
}

const KEY = 'coral.onDeviceModel.gpu';

export function loadGpuChoice(storage: Storage | undefined = globalThis.localStorage): GpuChoice | null {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? 'null') as GpuChoice | null;
    return value && typeof value.vendor === 'string' && typeof value.architecture === 'string'
      && (value.powerPreference === 'high-performance' || value.powerPreference === 'low-power') ? value : null;
  } catch { return null; }
}

export function saveGpuChoice(choice: GpuChoice, storage: Storage | undefined = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify({ powerPreference: choice.powerPreference, vendor: choice.vendor, architecture: choice.architecture })); } catch { /* not kept */ }
}

/** The saved choice if this browser still offers it, else the first option. */
export function selectedGpu(options: readonly GpuOption[], saved: GpuChoice | null): GpuOption | undefined {
  return options.find(o => saved && o.vendor === saved.vendor && o.architecture === saved.architecture) ?? options[0];
}
