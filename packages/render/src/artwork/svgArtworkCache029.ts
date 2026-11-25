/** Bounded LRU caches for coral.svg-artwork admission. Costs are estimated
 * retained bytes: keys are UTF-16 strings, and a refusal failure retains about
 * 550 bytes once frozen (measured on a 170,000-failure flood), costed at 1 KiB. */

/** Author decision 2026-10-30 (profile §13.2): a source block reports at most
 * this many failures, then one diagnostic that counts the rest. */
export const REPORTED_FAILURES_029 = 64;
export const FAILURE_BYTES_029 = 1024;
export const textBytes029 = (text: string): number => 2 * text.length;

export class BoundedCache029<V> {
  private readonly entries = new Map<string, { value: V; bytes: number }>();
  private bytes = 0;
  constructor(private readonly maxEntries: number, private readonly maxBytes: number) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** Store `value` unless it alone exceeds the byte budget; evict least recently used entries. */
  set(key: string, value: V, bytes: number): void {
    if (bytes > this.maxBytes) return;
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.bytes -= previous.bytes;
    }
    while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      const [oldest, entry] = this.entries.entries().next().value!;
      this.entries.delete(oldest);
      this.bytes -= entry.bytes;
    }
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
  }
}
