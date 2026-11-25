/** Coalesce projected-node measurements within one React Flow store. */
type PendingMeasurements = {
  registrations: Map<string, Set<symbol>>;
  update: (ids: string[]) => void;
};
const pendingByStore = new WeakMap<object, PendingMeasurements>();

export function queueNodeInternals(
  store: object,
  id: string,
  update: (ids: string[]) => void,
): () => void {
  let pending = pendingByStore.get(store);
  if (!pending) {
    pending = { registrations: new Map(), update };
    pendingByStore.set(store, pending);
    const batch = pending;
    queueMicrotask(() => {
      // Retire before dispatch: a resulting projection owns a fresh batch.
      pendingByStore.delete(store);
      const ids = [...batch.registrations].filter(([, tokens]) => tokens.size > 0)
        .map(([nodeId]) => nodeId);
      if (ids.length) batch.update(ids);
    });
  }
  const token = Symbol(id);
  const tokens = pending.registrations.get(id) ?? new Set<symbol>();
  tokens.add(token);
  pending.registrations.set(id, tokens);
  return () => { tokens.delete(token); };
}
