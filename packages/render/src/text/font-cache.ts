export type CachedPortableFontId = 'sans' | 'serif' | 'mono' | 'handwritten' | 'caveat';

export interface CachedFontResolution {
  id: CachedPortableFontId;
  usedFallback: boolean;
}

const MAX_FONT_RESOLUTION_CACHE_ENTRIES = 128;
const resolutionCache = new Map<string, CachedFontResolution>();
let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;

/** Cache only the family-to-portable-profile decision using insertion order as LRU recency. */
export function cachedFontResolution(
  requestedFamily: string,
  resolve: () => CachedFontResolution,
): CachedFontResolution {
  const existing = resolutionCache.get(requestedFamily);
  if (existing) {
    cacheHits += 1;
    resolutionCache.delete(requestedFamily);
    resolutionCache.set(requestedFamily, existing);
    return existing;
  }

  cacheMisses += 1;
  const resolved = resolve();
  if (resolutionCache.size === MAX_FONT_RESOLUTION_CACHE_ENTRIES) {
    const leastRecent = resolutionCache.keys().next().value;
    if (leastRecent !== undefined) {
      resolutionCache.delete(leastRecent);
      cacheEvictions += 1;
    }
  }
  resolutionCache.set(requestedFamily, resolved);
  return resolved;
}

/** Internal test control; this module is deliberately absent from the package root barrel. */
export function resetFontResolutionCacheForTests(): void {
  resolutionCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  cacheEvictions = 0;
}

/** Internal test observation; production callers use only cachedFontResolution. */
export function fontResolutionCacheSnapshotForTests(): {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  keys: string[];
} {
  return {
    size: resolutionCache.size,
    hits: cacheHits,
    misses: cacheMisses,
    evictions: cacheEvictions,
    keys: [...resolutionCache.keys()],
  };
}
