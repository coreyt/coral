/* global self, caches, clients, fetch */
'use strict';

const IDENTITY = Object.freeze(__CORAL_RELEASE_IDENTITY_JSON__);
const CACHE_PREFIX = 'coral-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${IDENTITY.version}-${IDENTITY.commit}`;
const TEMP_PREFIX = `${CACHE_NAME}-install-`;
const PRECACHE = self.__WB_MANIFEST;
const PRECACHE_URLS = Object.freeze(PRECACHE.map(({ url }) => new URL(url, self.location.origin).href));
const PRECACHE_SET = new Set(PRECACHE_URLS);
const INDEX_URL = new URL('/coral/index.html', self.location.origin).href;
const NAVIGATION_TARGETS = new Map([
  [new URL('/coral/', self.location.origin).href, INDEX_URL],
  [INDEX_URL, INDEX_URL],
]);
for (const url of PRECACHE_URLS) {
  const parsed = new URL(url);
  if (parsed.origin !== self.location.origin || !parsed.pathname.startsWith('/coral/docs/') || !parsed.pathname.endsWith('.html')) continue;
  NAVIGATION_TARGETS.set(parsed.href, parsed.href);
  if (parsed.pathname.endsWith('/index.html')) {
    NAVIGATION_TARGETS.set(new URL(parsed.pathname.slice(0, -'index.html'.length), parsed.origin).href, parsed.href);
  } else {
    NAVIGATION_TARGETS.set(new URL(parsed.pathname.slice(0, -'.html'.length), parsed.origin).href, parsed.href);
  }
}
const SHELL_NAME = /^coral-shell-[0-9A-Za-z.+-]+-[0-9a-f]{40}$/;
const updateAttempts = new Map();
const usedAuthorizations = new Set();
const bootedClients = new Map();
const authorizationPorts = new Map();

function sameIdentity(left, right) {
  return Boolean(left && right && left.product === right.product && left.version === right.version && left.commit === right.commit);
}

function validIdentity(value) {
  return Boolean(value && value.product === 'coral' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version) && /^[0-9a-f]{40}$/.test(value.commit));
}

function exactShellName(name) {
  return SHELL_NAME.test(name);
}

function hasSensitiveHeaders(request) {
  return ['authorization', 'x-api-key', 'api-key', 'x-goog-api-key'].some((name) => request.headers.has(name));
}

function classifyRequest(request) {
  if (request.method !== 'GET' || hasSensitiveHeaders(request)) return 'network';
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !['http:', 'https:'].includes(url.protocol)) return 'network';
  const navigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
  if (navigation && NAVIGATION_TARGETS.has(url.href)) return 'navigation';
  if (PRECACHE_SET.has(url.href)) return 'asset';
  return 'network';
}

function retainedAssetCandidate(request) {
  if (request.method !== 'GET' || hasSensitiveHeaders(request)) return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin
    && url.search === ''
    && /^\/coral\/assets\/[A-Za-z0-9._-]+\.(?:css|js|wasm|woff2?)$/.test(url.pathname);
}

async function cacheIsComplete(cache) {
  for (const url of PRECACHE_URLS) if (!(await cache.match(url))) return false;
  return true;
}

async function installShell() {
  const existingNames = await caches.keys();
  for (const name of existingNames) {
    if (name.startsWith(TEMP_PREFIX)) await caches.delete(name);
  }
  const hadCurrent = existingNames.includes(CACHE_NAME);
  const existing = await caches.open(CACHE_NAME);
  if (await cacheIsComplete(existing)) return;
  const tempName = `${TEMP_PREFIX}${self.crypto?.randomUUID?.() ?? Date.now()}`;
  const temp = await caches.open(tempName);
  try {
    for (const url of PRECACHE_URLS) {
      const response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
      if (!response || !response.ok || new URL(response.url || url).href !== url) throw new Error(`Failed shell fetch: ${url}`);
      await temp.put(url, response.clone());
    }
    if (!(await cacheIsComplete(temp))) throw new Error('Temporary shell cache is incomplete');
    const prior = new Map();
    for (const url of PRECACHE_URLS) prior.set(url, await existing.match(url));
    try {
      for (const url of PRECACHE_URLS) await existing.put(url, await temp.match(url));
      if (!(await cacheIsComplete(existing))) throw new Error('Promoted shell cache is incomplete');
    } catch (error) {
      for (const [url, response] of prior) {
        if (response) await existing.put(url, response);
        else await existing.delete(url);
      }
      throw error;
    }
  } catch (error) {
    if (!hadCurrent) await caches.delete(CACHE_NAME);
    throw error;
  } finally {
    await caches.delete(tempName);
  }
}

async function retainedShellNames() {
  return (await caches.keys()).filter(exactShellName).sort((left, right) => left === CACHE_NAME ? -1 : right === CACHE_NAME ? 1 : left.localeCompare(right));
}

async function matchExactAsset(request) {
  if (!PRECACHE_SET.has(new URL(request.url).href) && !retainedAssetCandidate(request)) return undefined;
  for (const name of await retainedShellNames()) {
    // Static responses commonly vary on Origin in preview/hosting servers; the
    // exact allowlisted URL and Coral cache namespace are the security boundary.
    const response = await (await caches.open(name)).match(request, { ignoreSearch: false, ignoreMethod: false, ignoreVary: true });
    if (response) return response;
  }
  return undefined;
}

async function handleFetch(request) {
  const kind = classifyRequest(request);
  if (kind === 'network') {
    if (retainedAssetCandidate(request)) {
      const retained = await matchExactAsset(request);
      if (retained) return retained;
    }
    return fetch(request);
  }
  if (kind === 'asset') return (await matchExactAsset(request)) ?? Response.error();
  const target = NAVIGATION_TARGETS.get(new URL(request.url).href);
  return (target && await (await caches.open(CACHE_NAME)).match(target)) ?? Response.error();
}

async function windowClients() {
  return clients.matchAll({ type: 'window', includeUncontrolled: false });
}

function idsOf(windows) {
  return windows.map(({ id }) => id).filter(Boolean).sort();
}

function equalIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

async function beginUpdate(event) {
  const directPort = event.ports?.[0];
  if (!directPort || !event.source?.id || !validIdentity(event.data.target) || sameIdentity(event.data.target, IDENTITY)) return;
  for (const [nonce, attempt] of updateAttempts) {
    if (Date.now() - attempt.createdAt > 30_000) {
      updateAttempts.delete(nonce);
      continue;
    }
    if (sameIdentity(attempt.target, event.data.target) && Date.now() - attempt.createdAt <= 30_000) return;
  }
  const windows = await windowClients();
  const ids = idsOf(windows);
  if (!ids.includes(event.source.id)) return;
  const nonce = self.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  updateAttempts.set(nonce, { target: event.data.target, initiator: event.source, authorizationPort: directPort, ids, responses: new Map(), createdAt: Date.now() });
  for (const client of windows) client.postMessage({ type: 'UPDATE_QUERY', nonce, target: event.data.target, clientCount: ids.length });
}

async function acceptUpdateResponse(event) {
  const attempt = updateAttempts.get(event.data.nonce);
  if (!attempt || !event.source?.id || !attempt.ids.includes(event.source.id) || !sameIdentity(event.data.target, attempt.target)) return;
  if (Date.now() - attempt.createdAt > 30_000) {
    updateAttempts.delete(event.data.nonce);
    await broadcastUpdateBlocked(event.data.nonce, attempt.target, 1);
    return;
  }
  if (!sameIdentity(event.data.sourceIdentity, IDENTITY) || event.data.accepted !== true || !['clean', 'dirty-recoverable'].includes(event.data.safety)) {
    updateAttempts.delete(event.data.nonce);
    await broadcastUpdateBlocked(event.data.nonce, attempt.target, Math.max(1, attempt.ids.length - attempt.responses.size));
    return;
  }
  attempt.responses.set(event.source.id, true);
  const currentIds = idsOf(await windowClients());
  if (!equalIds(currentIds, attempt.ids)) {
    updateAttempts.delete(event.data.nonce);
    await broadcastUpdateBlocked(event.data.nonce, attempt.target, Math.max(1,
      currentIds.filter((id) => !attempt.responses.has(id)).length));
    return;
  }
  if (attempt.responses.size !== attempt.ids.length) return;
  attempt.authorizationPort.postMessage({ type: 'UPDATE_AUTHORIZATION', nonce: event.data.nonce, target: attempt.target, clients: attempt.ids });
  updateAttempts.delete(event.data.nonce);
}

async function broadcastUpdateBlocked(nonce, target, blockingClients) {
  for (const client of await windowClients()) {
    client.postMessage({ type: 'UPDATE_BLOCKED', nonce, target, blockingClients });
  }
}

async function applyAuthorization(data, port) {
  const { nonce, target, clients: authorizedClients } = data;
  if (!sameIdentity(target, authorizationPorts.get(port))
    || !sameIdentity(target, IDENTITY) || typeof nonce !== 'string' || !nonce
    || usedAuthorizations.has(nonce) || !Array.isArray(authorizedClients)) return;
  const ids = [...new Set(authorizedClients)].filter((id) => typeof id === 'string' && id).sort();
  if (!ids.length || ids.length !== authorizedClients.length) return;
  usedAuthorizations.add(nonce);
  try {
    await self.skipWaiting();
    for (const authorizedPort of authorizationPorts.keys()) authorizedPort.close?.();
    authorizationPorts.clear();
    for (const client of await clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      client.postMessage({ type: 'AUTHORIZATION_ACCEPTED', target: IDENTITY });
    }
  } catch {
    for (const client of await clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      client.postMessage({ type: 'UPDATE_FAILED', target: IDENTITY });
    }
  }
}

function setAuthorizationPort(event) {
  if (!sameIdentity(event.data.target, IDENTITY) || !event.ports?.[0]) return;
  const port = event.ports[0];
  authorizationPorts.set(port, event.data.target);
  port.onmessage = (message) => { void applyAuthorization(message.data, port); };
  port.start?.();
}

async function cleanupAfterBoot() {
  const windows = await windowClients();
  const ids = idsOf(windows);
  if (!ids.length || !ids.every((id) => sameIdentity(bootedClients.get(id), IDENTITY))) return;
  for (const name of await caches.keys()) {
    if (exactShellName(name) && name !== CACHE_NAME) await caches.delete(name);
  }
}

async function onMessage(event) {
  const data = event.data;
  if (!data || typeof data.type !== 'string') return;
  if (data.type === 'GET_IDENTITY') (event.ports?.[0] ?? event.source)?.postMessage({ type: 'IDENTITY', identity: IDENTITY });
  else if (data.type === 'SET_AUTHORIZATION_PORT') setAuthorizationPort(event);
  else if (data.type === 'BEGIN_UPDATE') await beginUpdate(event);
  else if (data.type === 'UPDATE_RESPONSE') await acceptUpdateResponse(event);
  else if (data.type === 'BOOT_OK' && event.source?.id && sameIdentity(data.identity, IDENTITY)) {
    bootedClients.set(event.source.id, data.identity);
    try { await cleanupAfterBoot(); } catch { event.source.postMessage({ type: 'CLEANUP_FAILED', identity: IDENTITY }); }
  }
}

self.addEventListener('install', (event) => event.waitUntil(installShell()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(handleFetch(event.request)));
self.addEventListener('message', (event) => event.waitUntil(onMessage(event)));

self.__CORAL_WORKER_TEST__ = {
  identity: IDENTITY, cacheName: CACHE_NAME, classifyRequest, installShell,
  matchExactAsset, handleFetch, onMessage, cleanupAfterBoot, exactShellName,
};
