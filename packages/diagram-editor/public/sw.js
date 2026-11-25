// Coral 0.2.6 sunset worker. The application never registers it. Browsers
// still controlled by the 0.2.5 offline shell fetch it as that registration's
// update, so it deletes only Coral's shell caches and unregisters. It handles
// no fetches and never reloads pages; the next user load reaches the network.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await self.caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('coral-shell-')).map((name) => self.caches.delete(name)));
    } catch { /* cleanup is best-effort; retirement must still unregister */ }
    await self.registration.unregister();
  })());
});
