# Character renderer 0.2.8 first slice: requirements and design

Status: implementation design checkpoint, 2026-10-13. Authority is the
selected-type plan,
profile ontology and
evidence table. This first
implementation slice accepts bounded Block and flowchart GraphIR 3 inputs
through the public library API, provisionally. The other
seven selected profiles retain explicit unresolved contracts. No diagram type
or symbol gains a population 20% certification from this implementation.

## Current CHAR028-3 refinement (Coral 0.2.9)

The first-slice scope and no-PUA experiment below are historical. Released
0.2.8 integrated the six bounded source families through
Slice 35. The 0.2.9
Slice 12 refinement
applies CHAR028-3 to MonoTrue v0.2.0 at `1dfda76`, Diagram Set 1, using exact
font hashes and verified upstream role mappings. Only the adopted Diagram Set
private-use endpoints may be emitted in controlled pictures. Their shaft-facing
port, one-cell advance, authored marker kind/end and wall-tee contact must agree.
Unknown private-use characters are refused. Missing face/hash/role capability
and all copy/export output select the complete ASCII picture. The installed
picture API continues to require Regular; no font binaries are distributed.

Slice-local R12-1–5 acceptance rows detail this existing requirement's immutable
inputs, marker/contact behavior, capability checks and actual-font/package
verification. They do not allocate a new product requirement family or expand
the admitted notation/source subset.

## Requirements

**CHAR028-1 — Semantic fidelity.** Accept only `block` and `flowchart` authored
GraphIR 3 at the exact bounded first slice. Preserve node and edge IDs,
labels, endpoint identity/direction, edge kind, and source node/edge order.
Flowchart start/end/process/decision roles must be explicit. Never infer a
start/end from a stadium silhouette. Refuse nested groups, ports and unknown
semantic fields until a lossless text mapping is approved. Preserve graph
`id` and optional `name`; source order means `nodes[]` and `edges[]` array
order separately, since GraphIR does not retain one interleaved order. A typed
refusal is
the expected result for DFD, UML use case/state, system architecture and
infrastructure native requests.

**CHAR028-2 — Portable ASCII.** Printable bytes `0x20`–`0x7e` plus LF form
the default whole-diagram output. Use a deterministic fixed-width vertical
box stack plus a keyed node/edge ledger. The ledger is authoritative for
semantic reading and emitted in source order; the boxes are a visual index.
When a spatial relation cannot be depicted in the stack, emit an attributable
`character.spatial.ledger` diagnostic. Never imply a route from vertical
placement alone.

**CHAR028-3 — MonoTrue selection.** Unicode is available only under a
versioned `monotrue-v1` capability supplied by the controlled host, with an
actual selected MonoTrue face, compiled-font SHA-256 and accepted glyph-role
set. The library cannot inspect a recipient's font. If the capability is
absent, mismatched or a needed glyph role unavailable, return the **entire**
diagram in ASCII. Copied/exported text with an unknown recipient font must
use ASCII. No PUA codepoint is
emitted by this slice. A Unicode fixture is a development experiment until
MonoTrue joins and both GNOME hosts pass.

**CHAR028-4 — Reversible labels.** All identifiers and labels use a quoted
ASCII field. Literal backslash and quote are `\\` and `\"`; every
non-ASCII scalar, control and `|` is `\u{HEX}` with uppercase hexadecimal.
Escape sequences are indivisible during line wrapping. Split long fields into
ordered quoted chunks; concatenating decoded chunks reconstructs the exact
input scalar sequence. Invalid scalar escapes and unpaired UTF-16 surrogates
receive typed refusal. Duplicate visible names
remain distinct through stable IDs. Never copy raw escape/control content to
the host surface.

**CHAR028-5 — Bounds and determinism.** Width is exactly 40, 80 or 120
columns. Each LF-separated row must fit. No trailing space, CR, tab, ANSI,
SGR, DEC graphics or code-page characters. Invalid width and unrepresentable
meaning receive typed diagnostics. Repeated renders of equal input and
options have byte-equal output. Refuse any accepted field over 2,048 UTF-16
units or accepted text over 8,192 units **before encoding**; cap final output
at 1,024 rows and 65,536 cells. All four limits use
`character.size.unsupported` rather than producing an unbounded string.

## Construct-to-output matrix

| Semantic construct | Visual index / MonoTrue role when verified | ASCII/ledger obligation | Current state |
| --- | --- | --- | --- |
| Block unit | box via `stroke.single.nw/h/ne/v/sw/se` | `+ - \|` box, `N` ID/role/label ledger | first slice |
| Block link | no connector route claimed | `E` ID/source/target/type/label ledger with directed `F`/`T` fields | first slice |
| Flowchart start/end | role word in box; same standard box roles | explicit `start`/`end` text with stable ID | first slice |
| Flowchart process/decision | role word in box | exact role text; decision's outgoing edge label in `E` ledger | first slice |
| Flowchart directed transition | `endpoint.arrow_open.w` is U+2192 if future routed layout uses it | `->` and endpoint IDs; no spatial route implied | first slice |
| Meaningful group, port | no accepted glyph or text placement | typed refusal until membership/port ledger accepted | contract gap |
| UML sequence order/message/fragment | standard box/line pieces may serve later | message order/kind and fragment operand/guard ledger | not installed in this slice |
| UML class/member/relation | standard box pieces may serve later; relation role is text | exact relation kind, endpoints, end data and ordered compartment ledger | not installed in this slice |
| UML use case/state, DFD, C4 architecture, infrastructure | role words and standard box pieces can serve later; PUA icons unnecessary for a first semantic ledger | typed IDs, membership, relation kinds and labels; no semantic conflation | native profile contracts absent |

The cited MonoTrue roles are allocated to standard Unicode codepoints in
`CORAL-0.2.8-GLYPH-ENCODING.json`: `┌─┐│└┘` and `→`. A local TTF check found
the six emitted box characters in Regular, Bold, Italic and Bold Italic, each
with 1,200-unit advances at 2,000 units per em. Face-specific SHA-256 values
are required by the capability, so a Regular hash cannot authorize Bold.
Joined geometry and host acceptance are pending. The
74 reserved PUA roles remain undrawn and are not needed for this slice. If a
future pictogram or integrated contour cannot be composed from standard
Unicode, it needs its own measured PUA decision and tombstone lifecycle.

## Output grammar

```text
CHAR/1 <block|flowchart> <ASCII|MonoTrue-v1>
GRAPH
I "<graph ID chunk>"
L "<graph name chunk>"        # only if present
<one 16-cell box per node, in node order>
LEDGER
N <2-digit index>
I "<node ID chunk>"
R <block|start|end|process|decision>
L "<node label chunk>"       # only if present
E <2-digit index>
I "<edge ID chunk>"
F "<source ID chunk>"
T "<target ID chunk>"
K flow
L "<edge label chunk>"       # only if present
```

The `GRAPH` block precedes boxes; `LEDGER` starts the node/edge records.
`N` and `E` sections contain their field tags in the order shown. Repeat a
tag's quoted line to continue a long field; concatenate its decoded chunks.
Each encoded chunk is at most `columns - 4` characters, counting the tag,
space and quotes separately. An empty field is `""`; an absent optional
label/name has no `L` row. IDs are nonempty. Role and kind are finite ASCII
tokens. Indexes refer to the boxes and do not replace stable IDs. Box lines
are always 16 cells and contain only index/role; they assert no routed edge.
`N` and `E` records are machine parseable. The implementation re-parses every
emitted ledger and compares the recovered graph ID/name, node/edge roles,
labels, endpoints and order against the accepted projection. The
`character.spatial.ledger` warning tells consumers that edge routes are
encoded in the ledger.

The accepted GraphIR predicate is deliberately strict. Top-level keys are
`version: "3.0.0"`, `id`, optional `name`, `nodes`, `edges`, and
`metadata: { notation: "block" | "flowchart" }`. Each node has only `id`,
`type`, optional `label`, and for flowchart terminal only optional
`variant: "start" | "end"`; an optional `symbol` is accepted only if it
exactly matches that role's installed catalog symbol. Block nodes must be
`type: "block"` with no role variant/symbol. Each edge has only `id`,
`source`, `target`, optional `label`, optional `type: "flow"`, and
`sourceEnd`/`targetEnd` with exactly the standard none/open-arrow pair
produced by the installed source reader. Both ends are mandatory; reverse,
neutral and double arrows receive typed refusal until their actual traversal
direction and relation kind have a reviewed ledger mapping. Any
unrecognized key/value, nonempty group/port, authored geometry, description,
property, constraint, interaction, style, alternative marker or edge
relation causes `CharacterRenderError` with a stable code and path. Unknown
node IDs or duplicate IDs also refuse. Validation occurs before output
selection, so fallback cannot hide semantic loss.

The API result carries `{text, charset, width, height, diagnostics}`. A refusal
throws `CharacterRenderError` with `{code, diagnostics:[{code, severity,
path, message}]}`. The graph is never mutated. A 40-column golden output
with IDs requiring multiple chunks is a required acceptance fixture.

## Acceptance criteria and RED/GREEN record

1. Save failing package fixtures for a real parsed Block source and a
   decision-flowchart source at 40/80/120 columns. Assert labels, IDs,
   edge endpoints/direction and role cues in output. Keep RED output in the
   implementation log before adding the renderer.
2. Add a hostile-label round-trip fixture including non-ASCII, newlines,
   backslash, quote, pipe, control characters and duplicate labels. Assert
   decoder equality and ASCII bytes only.
3. Assert whole-diagram ASCII when MonoTrue is unconfirmed or any required
   role is unavailable; test an explicit accepted capability separately.
4. Assert typed refusal for a group, port, unknown relation and every
   out-of-slice selected notation, including bounded UML sequence/class.
   Assert the original GraphIR remains unchanged.
5. Run package tests and a parser-to-GraphIR-to-renderer integration fixture.
   Run package typecheck/build and branch-specific regressions. Two-host
   screenshots are required before any Unicode or profile support claim;
   an ASCII fixture without those screenshots is still provisional.

The initial RED run failed because `characters028` did not exist; the parsed
Block/flowchart and escape fixtures then passed GREEN. A second RED run
showed a 100,000-character label produced unbounded output; the text/row/cell
budget made the new fixture GREEN. A third RED run showed the ledger parser
was absent; a real 40-column long-ID/hostile-label round-trip is now GREEN.
A fourth RED run exposed that a Regular-font hash falsely authorized a Bold
capability; per-face hashes made that fallback fixture GREEN.
The final targeted suite is 10/10, including a controlled-host capability
simulation, copy/export ASCII fallback and parity through the public package
entry point. The full render package suite is
871/872; its one failure is in unchanged `profileWords028.test.ts`, where a
BPMN strict claim is `failed` rather than the expected `unverified`. The
package build and typecheck stop on the unchanged successor-sequence type
errors; neither failure was introduced by this character slice.

The repository has no CLI package or existing character-export command. The
editor's export path currently consumes `renderSvg` and `renderHtml` in a
large controller, and its nearby test file has unrelated local changes.
Adding a new editor control would expose a profile before the required native
host acceptance and would couple this first source/API slice to unrelated
export behavior. The public `@coral-viz/render` entry point is wired and
tested for library consumers; an editor control remains a separate release
integration step after acceptance. This checkpoint makes no UI support claim.

The required native visual check was attempted on 2026-10-13. GNOME Terminal
3.52 and GNOME Text Editor 46.3 are installed, and `fc-scan` identifies the
built MonoTrue Regular TTF. A real parsed Block/flowchart specimen was
generated at 40/80/120 columns for a controlled MonoTrue capability. The
sandbox refused a session D-Bus connection; an escalated GNOME Shell
Screenshot call then returned `org.freedesktop.DBus.Error.AccessDenied:
Screenshot is not allowed`. Native computer control is unavailable through
the enabled UI tool. No host screenshot or visual defect review was possible,
so neither Unicode nor these diagram profiles have passed release acceptance.
The user's font settings were not changed.

## Release/experiment reconciliation

The experiment's `characters/index.ts` at `0ea1da5c` is a useful fixture
source but is not copied into this release slice. It uses a broader adapter
set and a different glyph/font assumption. The SVG branch at `20b2d4f3`
describes shapes and compositor behavior, not character capability. Recheck
both after implementing this slice and record any source/catalog drift. The
`experiment/new-svg` ref was rechecked after the renderer checkpoint on
2026-10-13 and still resolved to `20b2d4f3`; no new SVG delta changes this
character slice.
