# Coral SVG artwork profile, version 1

Status: **frozen** on 2026-10-31 for Coral 0.2.9 after calibration, author
choices and conformance review. The [freeze record](svg-artwork-1/freeze.json)
names the exact SHA-256 of this profile and every vector artifact. Canonical
serialization in [§12](#12-canonical-serialization) was approved by the author
on 2026-10-30; the admitter reproduces every final
[conformance vector](svg-artwork-1/vectors/manifest.json). See
[Freezing](#15-freezing-version-1) for the retained versioning rule.

Owner: [Slice 60 user symbol design](../../../dev/releases/0.2.9/slice-60/design.md),
section "Artwork admission". Requirement:
[R-065](../../../dev/requirements.md) AC-3. Interchange contract:
[GraphIR proposal §8](../../../dev/designs/proposed-graphir-changes-for-coral.md#8-add-a-document-symbol-catalog),
decision GQ-2.

## 1. Identity and versioning

The profile identity is the pair `id: "coral.svg-artwork"`, `version: "1"`.
GraphIR carries it as `DocumentSymbolArtwork.profile`; Coral source edition
`0.2.9` admits every `artwork svg` block with version 1 and has no spelling
for another version.

1. A version is a decimal integer string without leading zeros. There are
   no minor or patch versions.
2. A frozen version is immutable. Any change to what it admits, any budget,
   any failure code or phase, or any byte of canonical output for any input
   is a new version. Only wording that changes no outcome for any input may
   be corrected in place, and the correction is recorded in this document.
3. Version 1 may change in place while it is provisional. No artifact that
   leaves a developer's machine — a published package, a GraphIR export or a
   released document — may name version 1 until it is frozen.
4. A consumer admits text only with the version that the text names. It
   never substitutes a newer or older version, and it never rewrites text
   into another version's canonical form.
5. Canonical text produced by version 1 is admissible by version 1 and is
   its own canonical form (idempotence).

## 2. Scope and conformance

This document fixes, for version 1:

- the input ceilings and the XML subset the parser accepts;
- the elements, attributes and presentation properties admitted;
- the reference rules, value grammars and style resolution;
- the geometry checks, budgets and tiers;
- the exact canonical serialization; and
- the failure codes, the order in which failures are found, and their
  mapping to GraphIR findings.

An **admitter** is an implementation of this profile. Given input text it
returns either an admitted result — a typed artwork model, its tier, its
canonical text and the list of discarded constructs — or a refusal, a
nonempty list of failures. The admitter in `packages/render` (step C2) is the
reference implementation; it has no React or DOM dependency (R-019). Every
Coral consumer — editor, browser package, MCP server and CLI — uses it.

Outside the profile:

- The editor import flow may run a pinned conservative SVGO and strip a byte
  order mark before admission; admission re-validates its output. Neither
  step is part of admission, and neither runs on source text.
- Rendering wraps canonical text in a per-document `<symbol>`, prefixes its
  IDs with `coral-sym-<local ID>-`, applies `tint stroke` through
  `currentColor` on each `<use>`, and isolates it from host styles. These
  are step C4 obligations. Canonical text contains none of them.
- A consumer may stop admission for its own resource or time limit. That
  outcome is not a profile result; see
  [Failure mapping](#13-failures-and-graphir-mapping).

Keywords **must**, **must not** and **may** are normative.

## 3. Admission phases and failure order

Admission runs seven phases in order. Each phase completes before the next
starts. Admission stops after the first phase that finds a failure.

| Phase | Work | Failures reported |
| --- | --- | --- |
| P1 Ingress | Measure the input bytes | The first failure only |
| P2 Parse | Tokenize the XML subset, check well-formedness and namespaces, count elements and depth | The first failure only |
| P3 Vocabulary | Check every element, attribute and value against the allowlists and grammars; count raw path segments | Every failure, in document order |
| P4 References | Check IDs, resolve references and gradient templates, detect cycles | Every failure, in document order |
| P5 Style | Resolve presentation properties; resolve `currentColor` | Every failure, in document order |
| P6 Geometry | Check transforms and effective bounds | Every failure, in document order |
| P7 Budgets | Measure the admitted model and canonical text | One failure listing every exceeded budget |

Document order is the order of start tags in the input; within one element,
the element name is checked before its attributes, and attributes are checked
in input order. In P3, an element whose name is not admitted is reported once,
and its attributes and descendants are not examined further. P3 stops as soon
as the raw segment count exceeds `input.segments`.

Every failure has a code from
[Failures](#13-failures-and-graphir-mapping), a detail naming the element,
attribute, value or budget concerned, and an input position. Coral maps the
position into the document to locate its diagnostic. A conformance vector's
expected codes are the distinct codes of the failing phase, in order of first
occurrence.

## 4. Input ceilings and parser

### 4.1 Input text

Input is a sequence of Unicode scalar values. When it arrives as bytes, they
must be well-formed UTF-8. A byte order mark is not admitted. Before
tokenizing, the admitter replaces each CR LF pair and each remaining CR with
LF, as XML 1.0 §2.11 requires.

P1 measures the UTF-8 length of the input as given, before line-end
normalization, against `input.bytes`. An unpaired surrogate counts as three
bytes, the length of its replacement character; P2 then refuses it. The
admitter must apply this check before building any tree, and should read
input in bounded chunks.

### 4.2 XML subset

The parser accepts XML 1.0 well-formed documents with Namespaces in XML 1.0,
restricted as follows. A violation is `coral.artwork.svg.parse` unless
another code is stated.

1. **Prolog.** An optional XML declaration at offset 0 with `version="1.0"`,
   an optional `encoding` equal to `UTF-8` ignoring ASCII case, and an
   optional `standalone`. Comments and whitespace may precede and follow
   the root element.
2. **No DTD.** A document type declaration anywhere is a failure. The
   parser must never read, expand or fetch a DTD, internal subset or
   external entity.
3. **Entities.** Only `&lt;`, `&gt;`, `&amp;`, `&apos;` and `&quot;` and
   decimal or hexadecimal character references are admitted. A character
   reference must denote an XML `Char`. Any other entity reference is a
   failure.
4. **Characters.** Every character must be an XML `Char`. NUL, other C0
   controls except tab, LF and CR, and unpaired surrogates are failures.
5. **Processing instructions** other than the XML declaration are failures,
   including `xml-stylesheet`.
6. **Comments** are admitted and discarded. They must not contain `--`.
7. **CDATA sections** are lexically admitted as character data; P3 then
   applies the character-data rule below.
8. **Names.** Element and attribute names are ASCII, matching
   `[A-Za-z_][A-Za-z0-9._-]*` with at most one `:` separating a prefix.
9. **Attributes.** Values are quoted with `"` or `'`. A repeated attribute
   on one element is a failure. Attribute values are normalized as XML 1.0
   §3.3.3 requires for CDATA attributes: each literal tab, LF and CR becomes
   a space; character references are then decoded.
10. **Namespaces.** The root element must be `svg` in the namespace
    `http://www.w3.org/2000/svg`, declared by a default namespace declaration
    on the root. A prefix used without a declaration is a failure. A root
    element of any other name or namespace is a failure. As Namespaces in
    XML requires, the prefix `xml` is implicitly bound to
    `http://www.w3.org/XML/1998/namespace` and needs no declaration, so
    `xml:space`, `xml:lang` and every other `xml:*` attribute pass this
    phase; P3 then refuses each of them as
    `coral.artwork.svg.attribute.unsupported`
    ([§6.1](#61-element-attributes)).
11. **Depth.** The root element has depth 1. An element at a depth greater
    than the `nesting` budget is `coral.artwork.svg.budget.exceeded`
    naming `nesting`, found when its start tag is read.
12. **Element count.** Every start tag and empty-element tag counts. A count
    greater than `input.elements` is `coral.artwork.svg.budget.exceeded`
    naming `input.elements`, found when the tag is read.

The parser must not resolve any URI, open any file or use the network.

### 4.3 Character data

Character data, including CDATA sections, may contain only whitespace
(space, tab, LF, CR), except inside `title` and `desc`, where it may contain
any admitted characters. Other character data is
`coral.artwork.svg.element.unsupported` with the detail "character data in
`<name>`": version 1 has no live text.

## 5. Elements

Element names are case-sensitive and must be in the SVG namespace. Any
element not in this table, in another namespace, or in a parent that does not
admit it is `coral.artwork.svg.element.unsupported`.

| Element | Admitted parents | Role |
| --- | --- | --- |
| `svg` | None; the root only | Root |
| `g` | `svg`, `g` | Group |
| `defs` | `svg`, `g` | Container for paint servers and clip paths |
| `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon` | `svg`, `g`, `clipPath` | Primitives: painted in the rendering tree, clip geometry in a `clipPath` |
| `linearGradient`, `radialGradient` | `svg`, `g`, `defs` | Paint servers |
| `stop` | `linearGradient`, `radialGradient` | Gradient stop |
| `clipPath` | `svg`, `g`, `defs` | Clip path |
| `title`, `desc` | `svg`, `g`, painted primitives | Discarded; character data only |

Excluded elements include, with no attempt at completeness: `script`,
`style`, `foreignObject`, `image`, `text`, `tspan`, `textPath`, `a`, `use`,
`symbol`, `marker`, `pattern`, `mask`, `filter` and every `fe*` element,
`animate`, `animateMotion`, `animateTransform`, `set`, `mpath`, `switch`,
`metadata`, `view`, `cursor`, a nested `svg`, every font element and every
element in a foreign namespace. Authors outline text and flatten effects in
their SVG editor.

The **rendering tree** is the root and every `g` and primitive outside
`defs` and `clipPath`. Paint servers and clip paths render only through
references.

## 6. Attributes and presentation properties

### 6.1 Element attributes

Attribute names are case-sensitive. An attribute not admitted on its element
is `coral.artwork.svg.attribute.unsupported`. This includes `class`, every
`on*` event handler, every `xml:*` attribute, `lang`, `tabindex`, `role`,
`aria-*`, `mask`, `filter`, `marker-*`, `display`, `visibility`, every
font and text property and every foreign-namespace attribute.

| Element | Attributes besides the common set |
| --- | --- |
| `svg` | `xmlns` (required); `xmlns:xlink`; `viewBox` (required); `width`, `height`, `preserveAspectRatio`, `version` (discarded) |
| `g` | `transform`, `opacity`, `clip-path` |
| `defs` | None |
| `path` | `d` (required) |
| `rect` | `x`, `y`, `width` (required), `height` (required), `rx`, `ry` |
| `circle` | `cx`, `cy`, `r` (required) |
| `ellipse` | `cx`, `cy`, `rx` (required), `ry` (required) |
| `line` | `x1`, `y1`, `x2`, `y2` |
| `polyline`, `polygon` | `points` (required) |
| Every primitive | `transform`; in the rendering tree also `opacity` and `clip-path` |
| `linearGradient` | `x1`, `y1`, `x2`, `y2`, `gradientUnits`, `gradientTransform`, `spreadMethod`, `href` or `xlink:href` |
| `radialGradient` | `cx`, `cy`, `r`, `fx`, `fy`, `fr`, `gradientUnits`, `gradientTransform`, `spreadMethod`, `href` or `xlink:href` |
| `stop` | `offset`, `stop-color`, `stop-opacity` |
| `clipPath` | `clipPathUnits`, `transform` |
| `title`, `desc` | None, not even the common set |

The common set, on every element except `title` and `desc`, is `id`, `style`
and the inherited properties of [§6.2](#62-presentation-properties).

- `xmlns` must equal `http://www.w3.org/2000/svg` and `xmlns:xlink` must equal
  `http://www.w3.org/1999/xlink`; both are admitted only on the root.
  Another namespace declaration, or either one on another element, is
  `coral.artwork.svg.attribute.unsupported`.
- An element must not carry both `href` and `xlink:href`.
- `clip-path` and `opacity` inside a `clipPath` are
  `coral.artwork.svg.attribute.unsupported`: clip geometry is not itself
  clipped, which bounds clip paths to one level.
- The root admits no `transform`, `opacity` or `clip-path`.

### 6.2 Presentation properties

A property may be given as a presentation attribute or as a declaration in
the `style` attribute. Unless stated, a property applies wherever the common
set is admitted.

| Property | Inherited | Initial value | Value grammar ([§7](#7-value-grammars)) |
| --- | --- | --- | --- |
| `fill` | Yes | `#000000` | paint |
| `fill-opacity` | Yes | `1` | unit number |
| `fill-rule` | Yes | `nonzero` | `nonzero` \| `evenodd` |
| `stroke` | Yes | `none` | paint |
| `stroke-opacity` | Yes | `1` | unit number |
| `stroke-width` | Yes | `1` | length, at least 0 |
| `stroke-linecap` | Yes | `butt` | `butt` \| `round` \| `square` |
| `stroke-linejoin` | Yes | `miter` | `miter` \| `round` \| `bevel` |
| `stroke-miterlimit` | Yes | `4` | number, at least 1 |
| `stroke-dasharray` | Yes | `none` | `none` \| dash list |
| `stroke-dashoffset` | Yes | `0` | length |
| `clip-rule` | Yes | `nonzero` | `nonzero` \| `evenodd` |
| `color` | Yes | none (unresolved) | color |
| `opacity` | No | `1` | unit number; `g` and rendering-tree primitives only |
| `clip-path` | No | `none` | `none` \| local URL; `g` and rendering-tree primitives only |
| `stop-color` | No | `#000000` | color, or `currentColor`; `stop` only |
| `stop-opacity` | No | `1` | unit number; `stop` only |

`transform` is an attribute only; as a `style` declaration it is
`coral.artwork.svg.attribute.unsupported`.

### 6.3 The `style` attribute

The `style` attribute is a list of declarations separated by `;`. Empty
declarations are ignored. Each declaration is `name: value` with optional
whitespace around the name, the colon and the value. A `style` value is
`coral.artwork.svg.attribute.unsupported` when:

- it contains `{`, `}`, `@`, `\`, `/*`, `"`, `'`, `!` or `<`;
- a name is not a lowercase property of [§6.2](#62-presentation-properties),
  including custom properties such as `--brand` and `transform`;
- the same name appears twice; or
- a value fails its grammar, including `var()`, `calc()`, `env()`,
  `attr()`, `expression()` and the CSS-wide keywords.

A `url(` value in a declaration follows the reference rules of
[§8](#8-references).

## 7. Value grammars

Grammars use this notation: `?` optional, `*` zero or more, `+` one or more,
`|` alternatives, quoted text literal. Unless stated, keywords and function
names match ASCII case-insensitively and are written in lowercase in canonical
text. Leading and trailing whitespace in an attribute value is ignored.

```text
wsp        = " " | TAB | LF | CR
comma-wsp  = (wsp+ ","? wsp*) | ("," wsp*)
number     = sign? (digits ("." digits?)? | "." digits) exponent?
exponent   = ("e" | "E") sign? digits
sign       = "+" | "-"
digits     = [0-9]+
length     = number "px"?
percentage = number "%"
unit-number = number                 (value in 0..1)
id         = [A-Za-z_] [A-Za-z0-9_.-]*
local-url  = "url(#" id ")"           (no whitespace or quotes; "url" in any case)
color      = "#" hex{3} | "#" hex{6}
           | "rgb(" wsp* byte wsp* "," wsp* byte wsp* "," wsp* byte wsp* ")"
           | named-color
byte       = digits                  (integer value 0..255)
paint      = "none" | color | "currentColor" | local-url
dash-list  = length (comma-wsp length){0,63}   (each length at least 0)
```

In `local-url`, only the function name `url` matches ASCII
case-insensitively, as in CSS; canonical text writes `url(`. The `#` and the
`id` are exact, and whitespace inside the parentheses makes the URL part
non-local ([§7.3](#73-paint)). A negative dash length fails the grammar; zero
lengths are admitted.

### 7.1 Numbers

A number is converted to an IEEE 754 binary64 value with round-to-nearest,
ties-to-even, as ECMAScript `StringToNumber` does. Then:

- A value that is not finite is a failure. So is a value whose magnitude
  exceeds 1,000,000,000 (bound N1).
- Units other than `px` where a length is admitted, percentages where they
  are not admitted, and the tokens `NaN` and `Infinity` fail the grammar.
- The failure is `coral.artwork.svg.viewbox.invalid` in `viewBox`,
  `coral.artwork.svg.geometry.invalid` in a geometry attribute, and
  `coral.artwork.svg.attribute.unsupported` elsewhere. Geometry attributes
  are `x`, `y`, `width`, `height`, `rx`, `ry`, `cx`, `cy`, `r`, `fx`, `fy`,
  `fr`, `x1`, `y1`, `x2`, `y2`, `d`, `points`, `transform`,
  `gradientTransform` and the `stroke-width` property.

Canonical text writes a number as ECMAScript `Number::toString(x)` in radix
10 (the shortest string that round-trips), except that negative zero is
written `0`. `px` is dropped. Examples: `+3` is `3`, `.5` is `0.5`, `1e2` is
`100`, `-0` is `0`, `0.10` is `0.1`, `1E-7` is `1e-7`, `1.` is `1`.

### 7.2 Colors

- Hexadecimal digits match case-insensitively; `#rgb` expands each digit.
- `rgb()` takes integers only; percentages, decimals and the
  space-separated syntax fail the grammar.
- `named-color` is the 148 named colors of CSS Color Module Level 4 §6.1,
  matched case-insensitively. `transparent` and system colors are not
  admitted.
- Colors with alpha (`#rgba`, `#rrggbbaa`, `rgba()`, `hsla()`) and the
  `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` and `color()`
  functions are `coral.artwork.svg.attribute.unsupported`. Authors use
  `fill-opacity`, `stroke-opacity` or `stop-opacity`.
- `currentColor` is admitted only in `fill`, `stroke` and `stop-color`, and
  is resolved by [§9](#9-style-resolution). `color: currentColor` fails the
  grammar.

Canonical text writes every color as `#rrggbb` in lowercase hexadecimal.

### 7.3 Paint

`paint` is exactly one of `none`, a color, `currentColor` or a local URL.
The same rule applies to `clip-path` values. When a value contains `url(`
ignoring ASCII case, the text from `url(` to the first following `)` is its
URL part:

- a URL part that is not a `local-url` is
  `coral.artwork.svg.reference.unsupported`, for example
  `url(javascript:alert(1))`; and
- a value with a `local-url` part and anything else, such as the fallback in
  `url(#g) red`, fails the grammar.

### 7.4 Transforms

`transform` and `gradientTransform` use the SVG 1.1 transform-list grammar:
functions separated by `comma-wsp` or whitespace, each a name, optional
whitespace, `(`, arguments separated by `comma-wsp`, `)`. Function names are
case-sensitive.

| Function | Arguments | Canonical form |
| --- | --- | --- |
| `matrix` | 6 | `matrix(a b c d e f)` |
| `translate` | 1 or 2 | `translate(tx ty)`; a missing `ty` is `0` |
| `scale` | 1 or 2 | `scale(sx sy)`; a missing `sy` equals `sx` |
| `rotate` | 1 or 3 | `rotate(a)` or `rotate(a cx cy)`, as authored |
| `skewX`, `skewY` | 1 | `skewX(a)`, `skewY(a)` |

Angles are degrees without units. CSS transform syntax, such as units,
`translateX` or `rotate(45deg)`, fails the grammar. Canonical text writes the
functions in authored order separated by one space. An empty list is
admitted and the attribute is then omitted.

### 7.5 Path data

`d` uses the SVG path grammar with the commands `M m L l H h V v C c S s Q q
T t A a Z z`. Numbers may abut where the grammar permits, for example
`M0-1.5.5`. Arc flags are single `0` or `1` characters and need no separator.
The data must be nonempty and begin with `M` or `m`. Any other command,
including the SVG 2 `B` and `R` commands, an arc flag other than `0` or `1`,
an argument count that does not complete a command, or trailing garbage fails
the grammar; there is no SVG-style partial rendering.

Canonical text keeps every command letter and its case. It writes each
coordinate tuple as its own command, so implicit repetitions become explicit;
an implicit line after `M` is written `L`, and after `m` is written `l`.
Tokens are separated by one space: `M 0 0 L 1 1 Z`. Relative commands stay
relative; no arithmetic changes any value.

### 7.6 Point lists and the view box

`points` is a list of numbers separated by `comma-wsp`, with an even count
of at least 2. Canonical text writes the numbers separated by one space.

`viewBox` is four numbers separated by `comma-wsp`: `min-x`, `min-y`,
`width`, `height`. It is required; each number must be finite within N1; and
`width` and `height` must be greater than 0. Any violation, including a
missing `viewBox`, is `coral.artwork.svg.viewbox.invalid`.

### 7.7 Discarded root attributes

`width` and `height` must match `number` followed by an optional unit from
`px`, `pt`, `pc`, `mm`, `cm`, `in`, `em`, `ex` or `%`. `preserveAspectRatio`
must match the SVG grammar `none | <align> (meet | slice)?`. `version` is any
string. They are validated and then discarded: the artwork maps into its frame
as `xMidYMid meet` regardless (design, "Geometry").

### 7.8 Other attributes

| Attribute | Grammar | Notes |
| --- | --- | --- |
| `gradientUnits`, `clipPathUnits` | `userSpaceOnUse` \| `objectBoundingBox` | Case-sensitive |
| `spreadMethod` | `pad` \| `reflect` \| `repeat` | Case-sensitive |
| Gradient coordinates and radii | `length` \| `percentage` | Written as authored kind |
| `offset` | `number` \| `percentage` | In 0..1 or 0%..100%; not less than the previous stop's offset |
| `rx`, `ry`, `r` and `rect` sizes | `length`, at least 0 | `auto` fails the grammar |
| `href`, `xlink:href` | `"#" id` | Exact; see [§8](#8-references) |

An `offset` out of range or out of order is
`coral.artwork.svg.attribute.unsupported`; percentages are compared as the
binary64 value of the number divided by 100.

## 8. References

The only references are a `local-url` in `fill`, `stroke` or `clip-path`,
and `href` or `xlink:href` on a gradient. Everything else that names a
resource is refused.

1. **Local only (P3).** A `url(` value that is not a `local-url`, or an
   `href` value that is not `#` followed by an `id`, is
   `coral.artwork.svg.reference.unsupported`. This covers `http:`, `https:`,
   `file:`, `data:` and `javascript:` URLs, relative files, fragments of
   other documents, quoted URLs and whitespace inside `url()`.
2. **IDs (P4).** `id` must match `id`; a mismatch is
   `coral.artwork.svg.attribute.unsupported` in P3. An ID used by two
   elements is `coral.artwork.svg.reference.unsupported`, reported at the
   second element.
3. **Targets (P4).** `fill` and `stroke` must name a `linearGradient` or
   `radialGradient`; `clip-path` must name a `clipPath`; `href` must name a
   `linearGradient` or `radialGradient`. A missing target or a target of
   another kind is `coral.artwork.svg.reference.unsupported`. Every reference
   is checked wherever it appears, including on elements whose value is
   later discarded.
4. **Gradient templates (P4).** A gradient with `href` inherits from its
   template chain, following SVG: each attribute it does not specify comes
   from the nearest template that specifies it, provided the attribute
   applies to its kind (`gradientUnits`, `gradientTransform`,
   `spreadMethod` and stops apply to both kinds; coordinates only to the
   same kind); its stops are its own if it has any `stop` child, otherwise
   those of the nearest template that has one. Attributes absent from the
   whole chain take their defaults: `gradientUnits` `objectBoundingBox`,
   `spreadMethod` `pad`, linear `x1` `0%`, `y1` `0%`, `x2` `100%`, `y2`
   `0%`, radial `cx` `50%`, `cy` `50%`, `r` `50%`, `fr` `0%`, and `fx` and
   `fy` equal to the resolved `cx` and `cy`. Defaults are written as exactly
   these tokens, whatever the `gradientUnits` and whatever kind (number or
   percentage) the gradient's other coordinates use; `fx` and `fy` copy the
   resolved `cx` and `cy` tokens, kind included. Canonicalization never
   converts between numbers and percentages; how a percentage resolves in
   user space is a rendering matter that follows SVG.
5. **Cycles (P4).** A template chain that revisits a gradient is
   `coral.artwork.svg.reference.cycle`, reported once per cycle at its
   first member in document order, whether or not anything references it.
   Clip paths cannot form cycles because clip geometry carries no
   `clip-path` and references no clip path.
6. **Depth (P4).** A chain longer than `reference-depth` `href` steps is
   `coral.artwork.svg.budget.exceeded` naming `reference-depth`.
7. **Expansion charging (P7).** Each reference from the rendering tree is
   charged at its full resolved size, every time it occurs; see
   [§11](#11-budgets-and-tiers).

Unreferenced paint servers and clip paths are validated and then discarded.
SVG element IDs are never anchors or ports.

## 9. Style resolution

Style is resolved in P5 on the document tree, so that canonical text depends
on no value outside the artwork.

1. The **specified value** of a property on an element is its `style`
   declaration if present, else its presentation attribute if present.
2. The **computed value** of an inherited property is the specified value,
   else the parent's computed value. The root's parent contributes the
   initial values of [§6.2](#62-presentation-properties); no value from a
   host document ever enters resolution.
3. The computed value of a non-inherited property is the specified value,
   else the initial value.
4. `currentColor` in `fill`, `stroke` or `stop-color` resolves to the
   element's computed `color`. When `color` has no computed value, the use
   is `coral.artwork.svg.attribute.unsupported` with the detail "unresolved
   currentColor".
5. A stop's properties resolve in the stop's own place in the document, also
   when another gradient inherits the stop through a template; clip geometry
   resolves `clip-rule` in its own place, never from the referencing
   element.
6. Paint servers apply to each painted primitive with that primitive's own
   bounding box, so moving an inherited `url()` paint onto each primitive
   preserves its meaning.

Canonical text writes the computed values on each painted primitive
([§12.4](#124-attributes-and-their-order)). Inherited properties are never
written on `svg`, `g`, `defs`, `clipPath` or gradients, and `color` is never
written. `opacity` and `clip-path` stay on the element that specifies them,
because group opacity and clipping composite the whole group. On clip
geometry, every property except `clip-rule` is validated, including its
references, and then discarded.

## 10. Geometry

Geometry checks run in P3 (grammars and N1) and P6 (transforms and bounds).

1. **Required geometry (P3).** A missing required attribute of
   [§6.1](#61-element-attributes), or an empty `d` or `points`, is
   `coral.artwork.svg.geometry.invalid`. Optional coordinates default to
   `0`.
2. **Signs (P3).** A negative `width`, `height`, `r`, `rx`, `ry`, `fr`,
   gradient `r` or `stroke-width` is `coral.artwork.svg.geometry.invalid`.
   Zero sizes are admitted; such a shape draws nothing.
3. **Rectangle radii.** When only one of `rx` and `ry` is given, the other
   takes the same value; when neither is given, both are `0`. Clamping to
   half the size is left to rendering.
4. **Transforms (P6).** Each element's current transformation matrix (CTM)
   is its parent's CTM multiplied by its own transform list, applied left to
   right, starting from the identity at the root in view-box user space.
   Arithmetic is binary64. A CTM with a non-finite entry or a determinant
   `a·d − b·c` equal to 0 is `coral.artwork.svg.geometry.invalid`.
5. **Effective bounds (P6).** Let `R = 8 × max(view-box width, view-box
   height)`. For each rendering-tree primitive, every point below,
   transformed by the CTM, must lie in `[min-x − R, min-x + width + R] ×
   [min-y − R, min-y + height + R]`: path end points and control points in
   absolute coordinates, including the first control point that `S`, `s`,
   `T` and `t` imply by reflection; arc end points; `rect`, `circle` and `ellipse`
   bounding-box corners; `line` end points; and `points`. With `s =
   max(|a| + |c|, |b| + |d|)` from the CTM, `stroke-width × s` and each arc
   bound `b × s` must not exceed `R`. For an arc with absolute authored radii
   `rx`, `ry`, let `r = max(rx, ry)`, `q = min(rx, ry)`, and let `(dx, dy)`
   be its absolute end point minus its start point. For large-arc flag `1`
   or `q = 0`, `b = r`. For minor flag `0` with `q > 0`, compute
   `c = hypot(dx, dy)`. If `c = 0`, use `b = 0` directly (SVG omits a
   coincident-endpoint arc); otherwise compute
   `b = min(r, c × (r / q) / 2)` in that order. This retains the
   old radius guard for every previously admitted arc, while allowing short,
   nearly circular minor arcs with large authored radii. The chord/axis-ratio
   term bounds a minor curve's deviation from the chord midpoint; SVG radius
   correction preserves the axis ratio. The guard uses authored radii and
   is a resource bound, not an exact painted extent or zero-overflow rule.
   A violation is
   `coral.artwork.svg.geometry.invalid`. Absolute coordinates accumulate
   relative arguments onto the current point in binary64. A reflected
   control point is `p + (p − q)`, computed in that order, where `p` is the
   current point and `q` the previous command's second control point (for
   `S`) or control point (for `T`); when the previous command is not of the
   same family (`C`, `c`, `S` or `s` for `S`; `Q`, `q`, `T` or `t` for
   `T`), the implied control point is `p`, as SVG specifies.
6. Clip-path and gradient geometry is checked against N1 only in version 1.

`rotate`, `skewX` and `skewY` need trigonometric functions that binary64
libraries approximate; libraries also approximate `hypot`. Results within one
unit in the last place of a bound
may differ between implementations; vectors avoid such edges, and canonical
text never depends on them.

## 11. Budgets and tiers

The numeric limits in this section are frozen after calibration against
representative icons and 1, 100 and 500-instance benchmarks. They are
resource bounds, not a universal browser paint-time guarantee. The author
retained the Standard/Detailed tiers and parser ceilings unchanged.

### 11.1 Measures

- **Segments** of a primitive are the commands of its SVG 2 equivalent path:
  in `d`, one per coordinate tuple of every command and one per `Z` or `z`;
  `rect` 5, or 10 when either resolved radius is greater than 0; `circle`
  and `ellipse` 6; `line` 2; `polyline` one per point; `polygon` one per
  point plus 1.
- **Raw segments** are segments counted over every primitive in the input,
  in P3, before any expansion.
- **Expanded elements** are the elements of the rendering tree, including
  the root, plus, for each reference from the rendering tree, the size of
  its target: a gradient counts 1 plus its resolved stops, and a clip path
  counts 1 plus its children. A `fill` or `stroke` URL counts once for each
  primitive whose computed value names it, including values inherited from a
  group. A `clip-path` URL counts once for each element that specifies it.
- **Expanded segments** are the segments of the rendering tree plus the
  segments of the target clip path's children for each `clip-path`
  reference.
- **Bytes** are the UTF-8 length of the canonical text.

### 11.2 Ceilings and tiers

| Budget | Measures | Checked | Standard | Detailed |
| --- | --- | --- | --- | --- |
| `input.bytes` | Input UTF-8 bytes | P1 | — | 2,097,152 |
| `input.elements` | Input start and empty-element tags | P2 | — | 10,000 |
| `nesting` | Element depth | P2 | — | 32 |
| `input.segments` | Raw segments | P3 | — | 100,000 |
| `reference-depth` | Gradient template steps | P4 | — | 32 |
| `bytes` | Canonical UTF-8 bytes | P7 | 65,536 | 262,144 |
| `elements` | Expanded elements | P7 | 256 | 1,024 |
| `segments` | Expanded segments | P7 | 4,096 | 16,384 |

Each limit is inclusive: a measure equal to it passes. Rows without a
Standard value are ceilings that refuse when exceeded.

Admitted artwork is **Standard** when its `bytes`, `elements` and `segments`
are all within the Standard limits, otherwise **Detailed** when all are within
the Detailed limits. Otherwise P7 refuses with one
`coral.artwork.svg.budget.exceeded` whose detail lists every exceeded Detailed
budget in the order `bytes`, `elements`, `segments`, with measure and limit.
The editor shows a complexity notice for Detailed artwork. A raw input above
a Detailed limit but within the ceilings is admitted when its canonical
model fits; the ceilings are recovery-input limits, not permission to place
large artwork.

Aggregate per-document limits — total definitions, total artwork bytes and
repeated instances — are not part of this profile; the GraphIR document
catalog limits and the proposal's benchmarks own them.

### 11.3 Calibration measurements

Measured on 2026-10-31 by the
[calibration step](../../../dev/releases/0.2.9/slice-60/calibration-design.md)
on one development machine (Node 26.8.2, Chromium 153, AMD Ryzen
Threadripper PRO 5945WX). These are evidence for the author's calibration
decision; they change no limit above.

| Artwork (bytes / elements / segments) | Instances | Cold parse with admission (ms) | SVG (ms) | Browser draw (ms) | Zoom frame p95 (ms) | Zoom raster p50 (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| Typical icon (760 / 8 / 23) | 1 / 100 / 500 | 0.6 / 1.7 / 2.6 | 0.5 / 5.2 / 26.7 | 150 / 220 / 398 | 15 / 33 / 17 | 50 / 55 / 93 |
| Standard at limit (53,370 / 256 / 4,096) | 1 / 100 / 500 | 6.9 / 6.0 / 8.0 | 1.7 / 6.4 / 26.5 | 163 / 316 / 916 | 14 / 33 / 48 | 49 / 204 / 463 |
| Detailed at limit (213,422 / 1,024 / 16,384) | 1 / 100 / 500 | 31.7 / 25.2 / 26.7 | 9.4 / 10.7 / 31.1 | 202 / 661 / 2,363 | 15 / 43 / 162 | 51 / 629 / 1,621 |

Parse and SVG are medians of five samples in Node. Browser draw is the
browser package's `renderTo` to the second animation frame; zoom frame is a
host transform change to the second animation frame; zoom raster is the
change to a completed screenshot, about 50 ms of which is the screenshot
itself. The synthetic artworks paint 255 or 1,023 overlapping translucent
polygons, a heavy case for their limits. Frame timings are quantised by the
display refresh interval, so small differences are not continuous cost
measurements. A proposed 2,097,152 painted-segment document budget was not
adopted. The later sampled My Icons measurements retain the repeated-copy
stress cost as evidence rather than refusing good artwork. The original
64-entry cache overflow was corrected to 512 entries / 256 MiB estimated
retention; the byte-limit warm document parse measured 203.6 ms against its
400 ms development target. Neither change alters this profile's limits.

Of 3,732 real single-path icons (`@iconify-json/simple-icons` 1.2.95), 3,603
are admitted as Standard, 1 as Detailed (by `bytes`) and 128 are refused,
every one by the arc-radius effective bound of [§10](#10-geometry) item 5 on
a minor arc according to a separate probe; the committed corpus survey
records radius refusals without classifying their large-arc flags. The
largest admitted icon has 54,153 input
bytes, 78,195 canonical bytes and 2,316 segments; the p95 is 5,015 canonical
bytes and 199 segments. Median admission takes 0.09 ms.

After the bounded minor-arc change on 2026-10-31, all 3,732 icons are
admitted: 3,731 Standard and 1 Detailed. All canonical forms re-admit without
changes. A sequential local Node probe reports median admission 0.089 ms,
p95 0.360 ms and maximum 4.964 ms; this measures admission, not browser
painting or an import-worker latency guarantee. Input and canonical maxima
remain 54,153 and 78,195 bytes; the portable segment maximum is 2,316. The
[My Icons import design](../../../dev/releases/0.2.9/slice-60/icon-import-policy.md)
uses separate drawing-operation and rendered-shape metrics, a mechanical
collection report and three sampled import/latency rounds. These admission
measurements alone do not certify every product import; the freeze is recorded
separately below.

## 12. Canonical serialization

Canonical text is a deterministic function of the admitted model. It is a
syntactic normal form, not a rendering normal form: two inputs that draw the
same picture may have different canonical texts.

### 12.1 Text

- UTF-8 without a byte order mark, XML declaration, document type or
  comment.
- Every line ends with LF, including the last; there is no CR, tab or
  trailing whitespace.
- Each element is on its own line, indented by two spaces per depth; the
  root has depth 0.
- An element with children is a start tag, its children, and an end tag
  `</name>` at the element's indentation. An element without children is an
  empty-element tag ending `/>` with no space before it. The root always has
  a start and an end tag.
- Each attribute is one space, the name, `="`, the value and `"`. Values
  never contain `"`, `&`, `<` or `>`, because every value is generated from
  the grammars above; an admitter must still escape them as `&quot;`,
  `&amp;`, `&lt;` and `&gt;`.

Every line starts with zero or more spaces followed by `<`, so no line is
ever exactly `"""`, and canonical text always fits a Coral raw artwork block.

### 12.2 Structure

1. The root `<svg xmlns="http://www.w3.org/2000/svg" viewBox="…">` carries no
   other attribute: `width`, `height`, `preserveAspectRatio`, `version` and
   `xmlns:xlink` are removed.
2. When the rendering tree references at least one paint server or clip
   path, the first child of the root is one `defs`. It contains every
   referenced paint server in ascending numeric order of its canonical ID
   (`p1`, `p2`, … `p10`, which is the order of first reference of
   [§12.3](#123-ids)), then every referenced clip path in the same order
   (`c1`, `c2`, …). Numeric order is not lexicographic: `p2` precedes
   `p10`. Nothing else is ever written in `defs`, and no other `defs` is
   written.
3. The rendering tree follows in input document order, with every `g`
   preserved, including empty groups.
4. `title`, `desc`, comments, unreferenced paint servers and clip paths, and
   gradient templates are not written. The admitter reports each discarded
   construct in its result for disclosure in the import preview; discarding
   is never a failure.

### 12.3 IDs

Referenced paint servers are renamed `p1`, `p2`, … and referenced clip paths
`c1`, `c2`, … in order of first reference. References are visited in
rendering-tree document order and, within one element, in the order
`clip-path`, `fill`, `stroke`. A paint server referenced by both `fill` and
`stroke`, or by several primitives, keeps one ID. No other element carries an
`id`. Rendering adds the per-document namespace prefix to these IDs.

### 12.4 Attributes and their order

| Element | Attributes, in order |
| --- | --- |
| `svg` | `xmlns`, `viewBox` |
| `g` | `transform`¹, `clip-path`², `opacity`³ |
| `path` | `d` |
| `rect` | `x`, `y`, `width`, `height`, `rx`, `ry` |
| `circle` | `cx`, `cy`, `r` |
| `ellipse` | `cx`, `cy`, `rx`, `ry` |
| `line` | `x1`, `y1`, `x2`, `y2` |
| `polyline`, `polygon` | `points` |
| Painted primitive, after its geometry | `transform`¹, `clip-path`², `fill`, `fill-opacity`⁴, `fill-rule`⁴, `stroke`, `stroke-opacity`⁴, `stroke-width`, `stroke-linecap`⁴, `stroke-linejoin`⁴, `stroke-miterlimit`⁴, `stroke-dasharray`⁴, `stroke-dashoffset`⁴, `opacity` |
| Clip geometry, after its geometry | `transform`¹, `clip-rule`⁵ |
| `linearGradient` | `id`, `gradientUnits`, `x1`, `y1`, `x2`, `y2`, `spreadMethod`, `gradientTransform`¹ |
| `radialGradient` | `id`, `gradientUnits`, `cx`, `cy`, `r`, `fx`, `fy`, `fr`, `spreadMethod`, `gradientTransform`¹ |
| `stop` | `offset`, `stop-color`, `stop-opacity` |
| `clipPath` | `id`, `clipPathUnits`, `transform`¹ |

1. Written when the resolved transform list is nonempty.
2. Written when the value is not `none`.
3. Written on `g` when the value is not 1.
4. Written when the computed value differs from the initial value.
5. Written when the computed value is `evenodd`.

Every other attribute in a row is always written, so every painted primitive
carries explicit `fill`, `stroke`, `stroke-width` and `opacity`, and every
geometry attribute is written, including defaults. Values follow
[§7](#7-value-grammars): numbers, colors, keywords in lowercase except the
case-sensitive keywords of §7.8, transforms, path data, `points`, dash lists
written as numbers separated by one space, gradient coordinates and offsets
in their authored kind (number or percentage), and `url(#p1)` style
references.

## 13. Failures and GraphIR mapping

### 13.1 Codes

| Code | Phase | Conditions |
| --- | --- | --- |
| `coral.artwork.svg.parse` | P2 | Not well-formed; invalid UTF-8; byte order mark; DTD; entity reference other than the five predefined; character that is not an XML `Char`; processing instruction; bad XML declaration; unbound prefix; repeated attribute; root not an SVG-namespace `svg` |
| `coral.artwork.svg.element.unsupported` | P3 | Element not admitted, or not admitted in its parent; character data outside `title` and `desc` |
| `coral.artwork.svg.attribute.unsupported` | P3, P5 | Attribute not admitted on its element; namespace declaration other than the two admitted; a non-geometry value that fails its grammar or range; a forbidden `style` construct; `href` together with `xlink:href`; malformed `id`; offset out of range or order; unresolved `currentColor` (P5) |
| `coral.artwork.svg.reference.unsupported` | P3, P4 | Non-local `url()` or `href` (P3); duplicate ID; missing target; target of the wrong kind (P4) |
| `coral.artwork.svg.reference.cycle` | P4 | Gradient template chain revisits a gradient |
| `coral.artwork.svg.budget.exceeded` | P1–P4, P7 | A ceiling or budget of [§11](#11-budgets-and-tiers) is exceeded; the detail names it |
| `coral.artwork.svg.geometry.invalid` | P3, P6 | Geometry value fails its grammar, N1 or sign rule; required geometry missing; singular or non-finite CTM; effective bounds exceeded |
| `coral.artwork.svg.viewbox.invalid` | P3 | `viewBox` missing, malformed, non-finite, beyond N1, or with width or height not greater than 0 |

### 13.2 Coral source

In edition `0.2.9` source, an `artwork svg` block that admission refuses
reports its failures as `coral.artwork.svg.*` diagnostics, located in the
block. A block reports at most its first 64 failures, in the order of
[§3](#3-admission-phases-and-failure-order). When admission finds more, the
block reports one further diagnostic that reuses the code of the first
suppressed failure, located at it, with a detail stating how many further
failures were suppressed; no other code is introduced. Refusal is unchanged:
any failure refuses the artwork.

Authored text need not be canonical: noncanonical admissible artwork is not a
finding, and ordinary save keeps its bytes. Rendering, digests and GraphIR
export use the canonical text.

### 13.3 GraphIR

GraphIR import admits `artwork.text` with the version that
`artwork.profile` names. Coral's import diagnostics and the GraphIR findings
map one to one:

| Outcome | Coral import diagnostic | GraphIR finding |
| --- | --- | --- |
| `profile` is not `coral.svg-artwork` version `1`, or names version 1 before it is frozen | `import.graphir.artwork.profile-unsupported` | `ARTWORK_PROFILE_UNSUPPORTED` |
| Admission refuses `text` | `import.graphir.artwork.rejected`, with the `coral.artwork.svg.*` code and detail of the first failure | `ARTWORK_ADMISSION_FAILED` |
| The admission check throws or stops at a consumer limit or deadline | `import.graphir.artwork.rejected`, with the cause in its detail | `ARTWORK_ADMISSION_FAILED` |
| Admission admits `text` but canonical text differs from it | `import.graphir.artwork.noncanonical` | `ARTWORK_NONCANONICAL` |
| Admission admits `text` and it is canonical | None; the digest is then checked | None; discharges `ARTWORK_ADMISSION_UNVERIFIED` |

Every `coral.artwork.svg.*` code maps to `ARTWORK_ADMISSION_FAILED`. GraphIR
export writes only canonical text with `profile: {id: "coral.svg-artwork",
version: "1"}`, and only after version 1 is frozen.

## 14. Conformance vectors

The vectors live in [`svg-artwork-1/vectors`](svg-artwork-1/vectors/manifest.json).
The manifest lists the vector files and the coverage tags they must
jointly cover. Each file names the profile identity and holds vectors with:

- `id`, `description` and `covers` (coverage tags);
- `input` text, or `inputParts`, a list of strings and `{repeat, count}`
  objects concatenated in order, used for large budget vectors; and
- `expect`: either `result: "admitted"` with `tier`, `inputIsCanonical`,
  `canonical` text or `canonicalParts`, and optionally `bytes`; or
  `result: "refused"` with `codes`, the distinct codes of the failing phase
  in order of first occurrence, and `budgets`, the budget names, when
  `coral.artwork.svg.budget.exceeded` is among them.

The vectors are shared with GraphIR by reference to this profile identity;
GraphIR does not vendor them. The C0a digest vectors are separate and take
artwork text as given.

The render package test `svgArtworkVectors029.test.ts` checks vector
structure: identity, unique IDs, coverage, approved codes and budget names,
canonical-text shape, the explicit-paint rule, canonical ID numbering and
`defs` order, the `"""` rule and the tier byte limits.
`svgArtworkConformance029.test.ts` runs the admitter over every vector.

## 15. Freezing version 1

Version 1 is frozen only when all of these hold, and the freeze is recorded
in this document's status and in the Slice 60 status:

1. The budgets of [§11](#11-budgets-and-tiers) are calibrated against the
   SVG icon proposal's corpus and benchmarks, and any change is applied here
   and in the vectors.
2. The step C2 admitter and canonical serializer reproduce every vector
   exactly. A mismatch is resolved in this document and the vectors, never
   by special-casing the implementation.
3. The fuzzing, malicious-input and budget-edge fixtures of step C2 pass.
4. The open questions below are decided.
5. The author approves the canonical serialization of
   [§12](#12-canonical-serialization) in a before/after review with a human
   in the loop. The editor writes canonical artwork into saved source, so
   contributor guidance treats it as source notation. The vectors
   `canonical-design-example` and `canonical-hand-written` are the
   before/after examples. This review must happen before step C2 implements
   the serializer.
6. The freeze record names the SHA-256 of this document and of each vector
   file.

After the freeze, any change that alters an outcome for any input is
version 2.

Freeze completed 2026-10-31: calibration and subsequent sampled import/latency
measurements are recorded in the Slice 60 status; all choices below are
resolved. Conformance, fuzzing, malicious-input and budget-edge checks pass.
The canonical serializer remains unchanged from the author-approved §12.
The [freeze record](svg-artwork-1/freeze.json) pins this document, the vector
manifest and all vector files, avoiding a self-referential document hash.
The render package publishes `spec/`; production GraphIR import/export now
uses the frozen version 1 admission hook.

Corrections recorded under rule 2 of [§1](#1-identity-and-versioning), with
no outcome change: §4.1 states how P1 counts an unpaired surrogate.
Provisional changes approved by the author on 2026-10-30: §13.2 bounds the
diagnostics that one source block reports to 64 plus one counting the rest;
admission results are unchanged.

### 15.1 Resolved choices

| ID | Question | Frozen decision |
| --- | --- | --- |
| SA-1 | Admit `<use>` for internal reuse, expanded at admission? | No in portable version 1; My Icons expands bounded internal copies before admission |
| SA-2 | Write every inherited property explicitly, or only non-initial ones? | The four design-mandated properties always, the rest when not initial; the C4 boundary resets the others: each `<symbol>` wraps its content in a group that sets every inherited painting property to its initial value |
| SA-3 | Are the `display`, `visibility`, root `x`/`y` and `xml:space` refusals too strict for hand-pasted exports? | Refuse in portable version 1; import normalization does not promise to remove unsupported attributes |
| SA-4 | Is the effective-bound margin `R = 8 × max(width, height)` right? | Retain R; use the bounded minor-arc chord/axis-ratio rule of §10 item 5 |
| SA-5 | Does the raw block's final LF before `"""` belong to the artwork text? | Step C1 decided yes: the content runs to the start of the closing line, so canonical text, which ends with LF, embeds unchanged |
| SA-6 | Which paint does `tint stroke` replace at render time? | Step C4 decided: every computed stroke paint that is not `none`, colour or gradient server, becomes `currentColor`; stroke opacity, width and dashes are kept; fills, stops and clip geometry are never tinted. Canonical text is unaffected |
| SA-7 | Should source reading apply a deadline, and with which outcome? | No deadline in source reading; budgets bound the work. GraphIR maps consumer limits to `ARTWORK_ADMISSION_FAILED` |
| SA-8 | Should `packages/render` publish `spec/` in its package files? | Publish `spec/`, including this profile, its freeze record and vectors |
| SA-9 | Should source and GraphIR input use the proposal's 2 MiB recovery ceilings, or a smaller cap nearer the Detailed limits? | The proposal's ceilings for every input; the Detailed budgets bound what is admitted |
| SA-10 | Should `elements` count the root, and should a gradient be charged per reference rather than once? | Both, as [§11.1](#111-measures) states; retained after calibration |
