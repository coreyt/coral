# PWA lifecycle design

Status: historical 0.2.5 design, superseded by the 0.2.6 online-delivery
design (`dev/designs/static-delivery.md`). The retired offline PWA code is
preserved outside the public repository.

## Ownership and build boundary

The private diagram editor owns manifest metadata, install/update/offline UI,
registration, and the document-safety query. A repository script owns service
worker finalization. Published packages, GraphIR, the Coral document schema,
and provider clients do not acquire PWA behavior.

One orchestration command validates `{ product: 'coral', version, commit }`
before building, supplies that exact value to Vite, and then supplies it to the
repository finalizer. The finalizer verifies the emitted browser identity before
generating the worker; it never edits an already hashed browser bundle. Vite
builds the editor at `/coral/`. The finalizer accepts the clean staged directory
and reviewed worker source. It enumerates only regular same-origin payload
files under that directory and invokes Workbox `injectManifest`. Workbox only
substitutes `self.__WB_MANIFEST`; Coral code owns install/fetch/cache/update
behavior. Warnings,
duplicate/out-of-base URLs, source maps, metadata/test output, missing HTML,
manifest, icon, JS/CSS, worker, WASM, or font categories, or a partial worker
write fail the build. Slice 20 requires categories the editor actually emits;
Slice 30 adds docs/examples/Help and freezes the final category set.

The generated identity is injected into both the browser bundle and worker.
The shell cache is `coral-shell-<version>-<full-commit>`. `coral-shell-` is the
only cleanup prefix. Whisper never shares this namespace.

## Worker policy

Install populates a unique identity-qualified temporary cache first, then copies
the verified complete entries to the current shell cache. If addition or
promotion fails, only artifacts created by that attempt are removed; a complete
pre-existing same-identity cache and all older active caches remain. The worker
waits and never calls `skipWaiting()` during install.

Fetch handling is closed:

- only GET, same-origin requests with no authorization/API-key headers can be
  considered;
- exact precached asset URLs are cache-only with no runtime insertion;
- only `/coral/` and `/coral/index.html` navigations fall back to cached app
  HTML;
- cross-origin, provider, telemetry, model, microphone/blob/data/extension,
  docs, ZIP/checksum/integrity, missing, and unknown requests use the network
  unchanged and are never cached.

Activation claims clients but retains old caches. Only a validated completed
client handshake can call `skipWaiting()`. During transition the new worker
resolves exact hashed asset requests across all retained validated Coral shell
caches, so worker termination cannot strand an old page's lazy asset.
Navigations use the target shell; only consenting tabs reload into it. Every client then reports
`BOOT_OK` with the target identity. The worker rechecks `clients.matchAll()` and
deletes superseded `coral-shell-` caches only when every remaining window client
has booted the target and no old-identity client remains. Cleanup failure is
reported without touching the current cache or local storage.

## Registration and update state

The client state is:

```text
unsupported | registering | current | offline
            | update-available | update-blocked
            | activating | activation-failed
```

The adapter uses `workbox-window` for registration/update discovery. A
`BroadcastChannel` may synchronize UI state but is never evidence that a client
closed. The active old worker, which controls the old tabs, owns each nonce/
target census with `clients.matchAll({ type: 'window', includeUncontrolled:
false })`, queries that exact client-id set, and requires a response from every
member. Immediately before authorization it repeats the census and requires
exact set equality, so a newly opened tab joins and blocks. The initiating
client transfers opposite ends of a `MessageChannel` to the active and waiting
workers; after the census the active worker sends its one-shot authorization
directly to the waiting worker over that channel. Lost worker memory, timeout, suspension, malformed data, a
different identity, unsafe state, nonresponse, or a changed set blocks and
requires a fresh attempt; none implies consent or closure. Every live old tab
explicitly confirms in its own UI.

On confirmation, the existing recovery owner synchronously flushes pending data
and reads it back. A dirty tab then writes that exact serialized snapshot to a
fresh random update-handoff key and verifies both the record and a tab-local
session pointer bound to the target release identity before acknowledging. A
clean tab writes an identity-bound clean marker. Thus an opener-created or
duplicated old-version tab ignores an inherited future-target pointer and every
consenting tab replaces it with its own clean/dirty result. The target bundle
alone may follow the pointer after the approved reload. Later autosaves update
both the active handoff and ordinary fallback record, so reload never shadows a
newer edit; explicit save/discard/clear retires that tab's active handoff.
Blocked, declined, or failed attempts retarget the in-memory-owned handoff to
the still-running identity, preserving each tab's crash/reload recovery; a
later successful consent replaces and retires only its own superseded handoff.
Missing/corrupt/stale exact-target handoffs clear only themselves and fall back
to ordinary recovery. A denied pointer or storage operation blocks
consent. The ordinary recovery record and its existing crash/relaunch behavior
remain unchanged. It returns
`dirty-recoverable` only when the exact current
snapshot was written, parsed, and verified. Unavailable storage, write, read,
parse, or mismatch returns `dirty-unconfirmed` and blocks; retry repeats the
check. Clean state requires no write. Recoverable state warns but may
acknowledge after explicit confirmation. Decline clears only this tab's
acknowledgment and leaves the waiting worker untouched.

When every client in the active worker's repeated exact census acknowledges,
the waiting worker accepts the one-shot authorization and activates.
`controllerchange` reloads only tabs that recorded explicit
consent for that exact identity; it never reloads merely because control
changed. A timeout or registration/activation error enters
`activation-failed`, retains the old shell and local data, and permits retry.
After boot, every new client sends `BOOT_OK`. The same protocol accepts a
different validated lower known-good identity; Slice 20 proves downgrade/
rollback without implementing a Pages redeploy.

## UI and failure behavior

An accessible status region reports offline/online state and PWA failures. An
Install action appears only after a real `beforeinstallprompt`; dismissing or
lacking that event is web-use guidance, not an installed claim. A waiting
update names the target version, warns for recoverable work, reports blocking
tabs, and offers explicit Update and Later actions. No background event alone
reloads the page.

Offline mode continues cached core editing, local file open/save, recovery,
layout workers/WASM, and local exports. Provider submission fails before fetch
with a visible fixed network-required diagnostic. Credentials, prompts,
responses, documents, recovery, and preferences are never CacheStorage input.

## Whisper decision

Transformers.js 4.2.0 was inspected before finalization. Although it exposes
`env.cacheKey` and a custom Cache-like hook, pipeline construction determines
its resource set internally, successful pipeline construction does not expose
an immutable required-file manifest, and its browser-cache write path may warn
and continue after a failed write. Consequently, `ready` cannot prove a
complete durable model/revision cache with per-file verification.

Slice 20 therefore takes the approved safe fallback: before pipeline creation,
the Whisper worker disables Transformers browser and WASM caches. Local speech
remains on-device but online-required for every model load, and the UI/status
must not claim offline readiness. This prevents incomplete model assets from
contaminating or being confused with the shell cache. Browser Clear Site Data
naturally clears Coral storage; there is no Coral-owned Whisper cache/control
to expose. The fallback can be replaced only by a reviewed adapter with an
exact revision, required-file list, verified writes, and explicit clear state.

## Test seams and compatibility

Pure worker-policy and update-coordination modules receive fake caches,
clients, clocks, channels, registrations, and navigation. Component tests use
an injected adapter. Production tests serve generated output beneath
`/coral/`, fail installation requests, inspect CacheStorage/request traffic,
restart offline, and stage two identities/tabs forward and backward. Recovery
tests cover pending debounce flush plus write/quota/read/parse/mismatch failures
and retry. Worker tests cover failed same-identity reinstall, exact-asset lookup
after worker state loss, nonresponding clients, active-worker two-tab discovery,
a tab opened during handoff, every-client boot, and exact cleanup. Existing
recovery, local file, layout/export, provider, and speech tests cover adjacent
owners.

No published declaration, package export, document/schema version, recovery
key, preference key, credential key, or provider URL changes. Private,
identity-randomized update handoff records supplement normal recovery only for
an explicitly approved reload. Cleanup targets only generated output and exact
Coral shell caches.

## Icon source and provenance

`packages/diagram-editor/public/icons/coral-source.svg` is the tracked original
derivation authority, authored for Coral in this repository under the repository
license. Deterministic generation produces inspected 192×192 and 512×512 PNGs
for `any` presentation and a maskable-safe symbol inside the central 80% safe
zone. Tests verify source/output determinism, PNG signatures/dimensions,
manifest MIME/sizes/purposes, and provenance. No borrowed asset is introduced.
