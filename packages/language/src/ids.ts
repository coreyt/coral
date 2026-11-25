/**
 * Identifier allocation (R-010).
 *
 * The parser allocates ids while reading text and the printer replays the same
 * allocation to decide which nodes need an explicit `as` clause. Both use this
 * module, so the two cannot disagree about what id a declaration receives.
 */

/** Fallback base when a label derives nothing usable. */
const EMPTY_BASE = 'node';

/**
 * Convert a label to a snake_case id base.
 */
export function labelToId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[.\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * A document-wide set of taken identifiers.
 *
 * Allocation probes `base`, `base_2`, `base_3` … until it finds one free, so a
 * label that already ends in the suffix form cannot collide with a generated
 * suffix. A per-base counter cannot give that guarantee: it produces
 * `web_app_2` for both the second `"Web App"` and the first `"Web App 2"`.
 */
export class IdAllocator {
  private taken = new Set<string>();

  /**
   * Take `id` without deriving it. Returns false when it was already taken, in
   * which case the caller allocates instead and reports the substitution.
   */
  reserve(id: string): boolean {
    if (id === '' || this.taken.has(id)) return false;
    this.taken.add(id);
    return true;
  }

  /** Return an id to the pool so a later declaration may receive it. */
  release(id: string): void {
    this.taken.delete(id);
  }

  /** Allocate from an explicit base, disambiguating with a numeric suffix. */
  allocateFrom(base: string): string {
    const root = base === '' ? EMPTY_BASE : base;
    if (!this.taken.has(root)) {
      this.taken.add(root);
      return root;
    }
    for (let n = 2; ; n++) {
      const candidate = `${root}_${n}`;
      if (!this.taken.has(candidate)) {
        this.taken.add(candidate);
        return candidate;
      }
    }
  }

  /** Allocate the id a label would receive. */
  allocateFromLabel(label: string): string {
    return this.allocateFrom(labelToId(label));
  }
}

/** Allocate an edge id from its endpoints, over its own set. */
export function allocateEdgeId(source: string, target: string, allocator: IdAllocator): string {
  return allocator.allocateFrom(`${labelToId(source)}_to_${labelToId(target)}`);
}
