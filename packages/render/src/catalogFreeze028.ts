/** Installed catalog editions are immutable so a pinned digest cannot outlive changed meaning. */
export function freezeCatalog028<T>(value: T): T {
  const visited = new WeakSet<object>();
  const freeze = (item: unknown): void => {
    if (item === null || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(value);
  return value;
}
