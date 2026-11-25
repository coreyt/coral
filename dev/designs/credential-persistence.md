# Credential persistence boundary

Status: accepted for Coral 0.2.5 Slice 10 after independent re-review.

## Decision

`useLlmChat` owns a private credential-persistence adapter. The adapter is the
only editor code that reads, writes, migrates, or removes the API key in
browser storage. It knows the two pre-existing locations:

- `coral-llm-api-key`, the durable owner when persistence is enabled;
- `coral:user-preferences.llmSavedApiKey`, a compatibility field that remains
  in the public `UserPreferences` shape but is always persisted as `''`.

The adapter returns typed success/failure results with fixed, sanitized error
text. It never includes a key or a storage exception's message. Browser
storage is synchronous but not transactional across keys. Success therefore
requires verified postconditions, while operation order makes partial failure
privacy-safe and leaves the controlled UI at its prior state.

## Boot boundary

Before normal preference persistence begins, the controller takes one
render-pure snapshot of the raw preference record, its parse status, the two
preference flags/values, and the standalone key. It supplies sanitized React
preferences (`llmSavedApiKey: ''`) and an initially empty hook key. Reading is
allowed during lazy initialization; no browser-storage mutation occurs during
render, including StrictMode replay.

`useSettings` does not echo its just-loaded initial snapshot in its first
passive effect. The adapter's startup effect reconciles the captured durable
state first. On success it mirrors the already-durable sanitized preferences
into React and hydrates the key. Later settings persistence is an idempotent
write. On failure it hydrates no key and reports the fixed error.

## State transitions

| State/event | Durable result | In-memory result |
| --- | --- | --- |
| startup, opted out | write opted-out sanitized preferences; remove standalone key | empty |
| startup, opted in, standalone key present | retain standalone; scrub preference copy | standalone key |
| startup, opted in, only legacy preference key present | write standalone; scrub preference copy | migrated key |
| startup, opted in, equal duplicate keys | retain standalone; scrub preference copy | standalone key |
| startup, opted in, differing non-empty keys | no hydration; report ambiguous storage | empty |
| key edit while opted in | write standalone; preference copy stays empty | edited key |
| opt in | write current non-empty key if present; scrub preference copy; then set preference true | unchanged |
| opt out | write opted-out sanitized preferences; remove standalone; then mirror preference false | unchanged until reload |

Empty keys remove the standalone entry rather than persisting an empty secret.
Malformed preference JSON or an unreadable snapshot fails closed and hydrates
no key. It is not overwritten implicitly.

Startup, opt-in, and migration write/verify the standalone owner first and
then write/verify the complete sanitized opted-in preference record. Opt-out
writes/verifies the complete sanitized opted-out preference record first and
then removes/verifies the standalone entry. Thus a second-step opt-out failure
cannot cause a later reload to restore the remaining standalone key, because
startup sees the durable opt-out and retries removal without hydration.
Second-step opt-in failure leaves the UI unchanged and startup fails closed on
the ambiguous durable state. The adapter reports failure and does not pretend
the two-key operation was atomic.

## Integration and failure behavior

The hook receives the boot snapshot and current complete preferences plus a
callback that mirrors an already-committed record into React. It returns a
serialized toggle operation and a sanitized persistence error.
`PreferencesDialog` calls that operation instead of mutating these fields
directly and renders the error with `role="alert"`. A current-key ref orders
same-tab key edits and rapid toggles. Cross-tab synchronization is not claimed;
a reload takes a new authoritative snapshot.

When a required read, write, verification, or removal fails, the adapter
reports only `Unable to update saved API-key settings in this browser.` A
differing-key conflict uses `Saved API-key settings conflict in this browser.`
Neither message contains stored values or exception text. The requested
preference-state callback is not invoked, so the checkbox does not claim the
transition completed. A key already held in memory is not erased merely by a
storage failure and remains available for the current session. Initialization
failure hydrates no credential.

## Compatibility and privacy

The public preference fields and defaults remain source-compatible; public
package documentation marks `llmSavedApiKey` deprecated. Its released
declaration comment remains byte-identical for the 0.2.x compatibility gate;
the runtime always persists the field empty. No package export or
dependency changes. The adapter never logs, caches, transmits, or includes a
credential in an error. Provider transmission remains unchanged and occurs
only when the user invokes an existing provider-backed action.

## Verification

Unit tests cover every table row, read/parse and each second-step failure,
verified postconditions, migration, both-location cleanup, rapid operation
ordering, StrictMode, and exact sanitized error text. Controller/dialog
integration covers success-gated checkbox state and alert rendering. Mounted
browser tests perform store → opt-out → reload and opted-in legacy migration →
reload, inspect both locations, and prove key input state. A conflicting-key
case proves fail-closed behavior.
