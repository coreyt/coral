interface RegistrationLike {
  scope: string;
  unregister(): Promise<boolean>;
}

export interface OfflineDeliveryRetirement {
  origin?: string;
  registrations?: () => Promise<RegistrationLike[]>;
  cacheNames?: () => Promise<string[]>;
  deleteCache?: (name: string) => Promise<boolean>;
}

function isCoralScope(scope: string, origin: string): boolean {
  try {
    const url = new URL(scope);
    return url.origin === origin && url.pathname.replace(/\/+$/, '/') === '/coral/';
  } catch {
    return false;
  }
}

/** Retire only Coral's former 0.2.5 offline shell; never block app startup. */
export async function retireOfflineDelivery(overrides: OfflineDeliveryRetirement = {}): Promise<void> {
  const origin = overrides.origin ?? globalThis.location?.origin;
  const registrations = overrides.registrations
    ?? (globalThis.navigator?.serviceWorker?.getRegistrations
      ? () => globalThis.navigator.serviceWorker.getRegistrations() : undefined);
  const cacheNames = overrides.cacheNames
    ?? (globalThis.caches?.keys ? () => globalThis.caches.keys() : undefined);
  const deleteCache = overrides.deleteCache
    ?? (globalThis.caches?.delete ? (name: string) => globalThis.caches.delete(name) : undefined);

  if (origin && registrations) {
    try {
      const current = await registrations();
      await Promise.allSettled(current
        .filter(registration => isCoralScope(registration.scope, origin))
        .map(registration => registration.unregister()));
    } catch { /* legacy cleanup is best-effort */ }
  }
  if (cacheNames && deleteCache) {
    try {
      const names = await cacheNames();
      await Promise.allSettled(names
        .filter(name => name.startsWith('coral-shell-'))
        .map(name => deleteCache(name)));
    } catch { /* legacy cleanup is best-effort */ }
  }
}
