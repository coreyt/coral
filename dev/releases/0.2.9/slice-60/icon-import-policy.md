# My Icons import limits and latency

Status: implementation design, following the author's 2026-10-31 direction.
The full icon sets receive a mechanical report; actual import-flow and
latency acceptance uses three reproducible sampled rounds at author direction.
The limits below are practical starting limits with
headroom, not measured browser failure thresholds. C6 is implemented and locally
checked; the slice status records review and
the three sampled latency rounds.
The portable artwork profile stays provisional until its freeze checks pass.

## Meaning of one icon

One import entry is one SVG root and the internal definitions it uses. A
sheet of 50 drawings under one SVG root is one entry; importing 50 files is
50 entries. File boundaries are not inferred from disconnected path regions.
Library storage, document definitions, and placed copies are separate counts.
A placed copy adds paint work even when its definition is shared.

The portable profile's existing Standard/Detailed tiers remain available to
saved Coral and interchange. C6's initial import profile below is a simpler
way to bound ordinary icon imports; it does not reinterpret existing profile
`segments` or `elements`. Its expanded, normalized SVG must also pass the
same shared portable admitter used by every consumer.

## Initial import profile

| Property | Limit and exact meaning |
| --- | --- |
| Drawing operations | 3,000 across the expanded icon. Count parsed L/H/V/C/S/Q/T/A tuples and Z once each; exclude M. Repeated coordinate tuples count separately, including implicit lines following M. A straight rect is four edges; a rounded rect is four lines and four quarter arcs; a circle/ellipse is four quarter arcs; a line is one; a polyline with n points is max(0,n−1); a polygon adds one closing edge. A zero-length authored drawing operation still counts. Count every expanded copy. |
| Rendered shapes | 100 primitive occurrences after reference expansion: path, rect, circle, ellipse, line, polyline or polygon. Groups and SVG roots are containers, not shapes. Hidden or zero-opacity content is not a way to evade counting. |
| Bytes | 131,072 UTF-8 bytes (128 KiB), both for uncompressed input and for normalized/canonical SVG. Measure each separately, before compression. The canonical cap makes saved import output fit its own profile. |
| References | Internal fragment references only. Resolve and validate before rendering; reject missing targets, external resources and cycles. Expand shape copies with their inherited styles and transforms before applying operation, shape and depth limits. No canonical `use` is introduced into the portable profile. Paint-server references retain the portable profile's separate expansion charging. |
| Effects | No filters, masks or clip paths in this initial import profile. Check before optimization or clipping; never silently remove a visual effect to pass a limit. This does not remove portable profile support for clip paths. |
| Painted overhang | At most 1% of the longer view-box side on each side, using resvg's unclipped bounds estimate. This is a resource proxy, not an exact caps/joins/miter ink guarantee: butt caps can be overestimated and acute miters underestimated. Allow 0.0001% numeric rounding tolerance; no artwork is silently altered to pass. |
| Depth | At most eight active container/reference levels beneath the root. Root is level zero. Entering a nested group, nested SVG or a reference expansion adds one; entering a primitive adds none. A reference to a group adds a reference level and then that group's container level. An unused definition does not add to the active rendering path but remains subject to parser limits and validation. |

Do not silently downsample or simplify paths. Normalize ordinary equivalent
SVG representations before portable admission, including percentage `rgb()`
colours in the supplied 50 files. Preserve the exact original as optional
opaque recovery data under the approved library design. A normalization that
changes visible artwork needs an explicit preview, not silent admission.

Existing bounded raw parsing must precede reference expansion and SVGO; a
cancellable worker must enforce expansion totals while expanding, not build
an arbitrarily large tree and then count it. Keep the portable profile's
parser/gradient guards. Any extra cap required by implementation must be
stated here and tested against the corpus before it can ship.

## Why these numbers

The measured corpus maximum is 2,222 drawing operations, so 3,000 admits all
six icons above the earlier 1,000 proposal. The largest measured painted
overhang is about 0.469% (Dunked), so 1% admits the five icons beyond 0.1%.
All corpus icons have one shape. The input maximum is 54,153 bytes, but the
largest canonical output is 78,195 bytes: 64 KiB would break a uniform saved
size policy, so 128 KiB leaves practical headroom.

The supplied 50-file CSV reports maxima of 248 operations, 67 shapes and
24,551 input bytes, with no references, effects, nesting or painted overhang.
Their combined sheet has 5,461 operations, 1,243 shapes and 574,556 bytes;
those totals describe one sheet, not the per-file imports. Independent raw
admission currently refuses their percentage RGB colours. In-memory colour
normalization made all 50 pass the current portable admitter; that probe is
not evidence that the unfinished C6 importer works.

## Library and document scale

Keep GraphIR's 256 definitions and 4,194,304 canonical artwork bytes per
document. They are document interchange limits, not a 256-icon global
library quota. Existing library quota/eviction and bundle policies remain
owned by the [approved design](design.md#editor-and-my-icons-library).
Do not sum all library geometry as if it were painted on the canvas.

Do not add the proposed two-million painted-segment diagnostic. The author
has not approved its wording and subsequently directed latency work toward
per-icon imports. Placement counts belong in rendering benchmarks; they do
not turn a reusable good icon into an invalid library entry.

## Acceptance and latency evidence

1. A mechanical script checks icon geometry, bytes, shape counts, depth,
   references/effects and painted bounds, without driving the product UI.
2. Three reproducible rounds of sampled icons exercise the actual worker,
   import/save/reopen and placement. Do not run every corpus or supplied file
   through that flow. Keep private supplied files outside the repository.

3. Boundary tests for repeated path tuples, primitive equivalents, shape
   copies, inherited stroke, transforms, cycles, depth and expansion abort.
4. Benchmark cold import, worker cancellation, warm reopen, thumbnail paint,
   canvas paint and zoom at 1/100/500 placements. Include the corpus maxima,
   the supplied most complex icons, and synthetic near-limit opaque and
   translucent overlap, with stroke joins. Report refresh-quantized frames
   and screenshot overhead honestly.
5. If a case exceeds the latency target, investigate normalization, caching,
   scheduling and drawing first. Record any proposed admission tightening
   against the sampled evidence; never silently exclude good icons to pass a
   benchmark. No performance guarantee or final profile freeze precedes these
   measurements.

Sources: the author's local `complexity-review.csv` and supplied sheet;
[calibration evidence](calibration-design.md); [portable profile](../../../../packages/render/spec/svg-artwork-1.md).
