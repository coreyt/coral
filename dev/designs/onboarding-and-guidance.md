# Onboarding and in-app guidance

Status: accepted after Slice 40 independent design review and amended by 0.2.6
Slice 30 for online-only delivery.

## Boundaries

Slice 40 adds discovery and truthful guidance around existing owners. The
editor controller remains authoritative for document replacement, recovery,
dirty state, canonical GraphIR, file loading, and the Create Node action.
One pure supplied-identity reader is owned by guidance content and used by
About. The retired install/offline lifecycle is archived under
`dev/archive/offline-pwa/0.2.5/`. A small guidance owner controls dialog
visibility, first-visit acknowledgement, selected example, and announcements.

No guidance component parses DSL, deserializes a document, mutates recovery,
registers a service worker/install listener, or implements authoring. Online
startup may retire only the former exact Coral worker scope and shell caches as
defined by the Slice 30 online-delivery design.

## Startup and replacement state flow

Startup has four ordered observations:

1. recovery detection reports an explicit `isSettled` signal;
2. recoverable data opens Welcome with Recover as the primary action and also
   permits explicit discard;
3. otherwise an absent `coral-welcome-seen:0.2.6` marker opens Welcome;
4. a returning visitor enters the editor and may open Welcome from Help.

Closing Welcome records the marker only after detection settles. Merely
mounting while recovery is still being detected does not. Recover and Discard
remain recovery-owner actions surfaced through Welcome; after either choice,
Welcome closes over the chosen state.

Recover first peeks the candidate without consuming or hiding it, prepares the
replacement, and acknowledges recovery only after the commit succeeds. A
failed recovery load keeps the recovery choice visible and intact.

Every destructive Welcome choice and the existing header/file load call one
`replaceDocument` transaction:

- if current work is dirty, ask for explicit confirmation before any mutation;
- deserialize, validate, and project the entire candidate into a replacement
  snapshot before confirmation or state mutation;
- after confirmation, apply that snapshot in a synchronous, non-throwing commit;
- only a successful commit closes Welcome and announces success;
- refusal, cancellation, or preparation failure changes neither current
  document, history, nor recovery data. Tests inject a projection failure after
  successful deserialization to prove this boundary.

Blank is a valid empty `CoralDocument`. After its successful commit, Welcome
invokes the existing `openAuthoring('node', invoker)` action. File open uses a
dialog-owned hidden input and reads one JSON document before calling the same
transaction. Browser file-picker cancellation is a no-op.

## Example registry

The shared catalog at `packages/diagram-editor/src/example-sources/catalog.json`
owns stable IDs, names, descriptions, notation, edition/support facts and
preview options. Adjacent authored `.coral` files are the semantic masters;
`exampleSources028.ts` adapts them into immutable editor choices. All enabled
notations are represented, with a second architecture example migrated from
the website prototype. ERD is explicitly retired.

The shared validator rejects malformed metadata, duplicate IDs, unsafe source
paths and unsupported capability/preview claims. The production reader and
renderer check source admission. Website generation uses the same manifest and
source bytes for lists, previews and source-owned document downloads.

Versioned website links select a requested example in Welcome, after recovery
has settled. The user explicitly opens it through the existing source-file
transaction; no URL triggers automatic replacement. Missing/wrong editions or
unknown IDs produce a visible refusal and preserve current/recovery content.
Opening copies immutable text into local ownership. There is no remote catalog
fetch or implicit runtime migration. See the
[shared catalog architecture](../ARCHITECTURE.md#shared-example-catalog).

## Content and identity

`guidanceContent.ts` exports a discriminated union of `paragraph`, `steps`,
`table`, `shortcutList`, and `callout` blocks. Components render React elements,
never HTML strings. Help's closed fact matrix covers:

- editor text/canvas/properties/diagnostics/AI regions;
- current keyboard shortcuts including Create Node;
- browser-local documents, recovery, settings, and credential choice;
- the online-hosted application boundary, browser/file-local ownership, and
  network-required LLM and Whisper model loading;
- privacy, bundled licenses, source and support destinations; and
- NVDA/Windows and VoiceOver/Safari as experimental and untested.

External links say “requires a network” in their accessible/visible text and
use safe new-tab attributes. Future Slice 50 routes are not rendered as links
until their files exist; all essential facts are present in the hosted app.

About reads the build-supplied global identity through one pure validator. No
operational or package fallback is returned as display identity. The value is
accepted only when the product is exactly
`coral`, version is a
non-empty semver-like string matching the package release, and commit is 40
lowercase hexadecimal characters. A missing, corrupt, or conflicting value
renders “Version unavailable” and “Commit unavailable”; no zero SHA or
package fallback is presented as release identity.

## Dialog and landmark accessibility

Welcome, Help, and About share a small modal shell; the existing Command
Palette adopts the same trap behavior, and Preferences gains modal semantics:

- `role="dialog"`, `aria-modal="true"`, and a labelled heading;
- initial focus on the heading or first primary action;
- Tab/Shift+Tab wrap within enabled focusable descendants;
- Escape closes when closing is safe;
- the invoking element receives focus on close if still connected; and
- results/errors go to one persistent `role="status"` polite live region.

Only one of Welcome, Help, About, Preferences, Command Palette, and Authoring is
open at once. Every open action closes the previous modal before transferring
focus. The DSL region becomes a named `section`; the
canvas stays the application `main`; the properties pane stays an `aside`.
“Landmark” copy names only actual regions.

## Integration and failure policy

The controller returns narrow view models for Welcome, Help, and About. Header
buttons and command items invoke controller actions; view components contain no
domain state. Welcome gives online browser-use and local-ownership guidance; it
has no install action or install-availability state.

Example/file validation errors are sanitized user text and preserve the prior
document. Focus and announcement failures are acceptance failures. New content
is test-addressable without exporting a public package API. Production build
tests prove the content is in the hosted app bundle and that no retired worker,
manifest, archive, or checksum output ships.
