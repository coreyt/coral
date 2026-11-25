# Coral Language Specification 1.3.0

Status: normative for Coral Language **1.3.0** in Coral 0.2.9.
This edition reconciles the existing saved-source and deliberate graph-
interchange contracts. It does not introduce a new source spelling or change
canonical printer output.

## 1. Authority and scope

This specification and the normative files below define accepted Coral syntax,
authored meaning, diagnostics, formatting and explicit loss/refusal boundaries.
The TypeScript implementation implements this contract; acceptance by a parser
alone does not establish intended meaning or target support. Conflicting
artifacts are a specification defect, not permission to choose one silently.
Tree-sitter is syntax tooling; LLM instructions expose a declared safe subset.
The language evolution policy governs proposals and independent change review.

The package distributes this document and the following normative assets:

| Asset | Contract |
| --- | --- |
| `spec/grammar-028.ebnf` | Saved `@diagram` source editions 0.2.8 and 0.2.9, including version-gated symbol productions and separate semantic/capability checks |
| `spec/grammar.ebnf` | Explicit graph-interchange syntax; see the G sections below |
| `spec/diagnostics.json` | Stable diagnostic codes, phases and dispositions for the declared entry points |
| `spec/behavior-matrix.json` | Entry-point behavior, supported/limited results and declared tooling subsets |
| `spec/graphir-field-matrix.json` | Total representation/field dispositions and exact schema provenance |
| `spec/implementation-deltas.json` | Current supported/limited/unsupported results, with historical origins separately recorded |
| `spec/conformance/manifest.json` and referenced fixtures | Entry-point/edition-specific valid, invalid, canonical, round-trip and exact-source cases |
| `spec/upstream/graph-ir.schema.json` | Pinned released GraphIR 3 verification snapshot |
| `spec/upstream/graph-ir-4.0.candidate.schema.json` | Separately pinned installed successor candidate; not a claim of released GraphIR 4 |

A repository revision or matching package archive identifies this contract's
bytes. A moving branch, earlier package or clean build does not establish
conformance to a different candidate.

### 1.1 Independent identities

| Identity | Meaning in Coral 0.2.9 |
| --- | --- |
| Language `1.3.0` | This joined specification; exposed as `CORAL_LANGUAGE_VERSION` |
| Coral package `0.2.9` | Packaging/API release; does not select a source/header edition |
| Source/header `0.2.8` / `0.2.9` | Default saved-source edition / explicitly pinned user-symbol extension |
| Profile and catalog versions/digests | Exact installed interpretation identities, selected through the header manifest |
| GraphIR `3.0.0` | Released graph interchange and optional staging/display carrier |
| GraphIR `4.0.0` candidate | Typed portable successor representation shipped separately inside Core 0.2.4 |

Core 0.2.4's released GraphIR 3 schema provenance is revision
`c23e4bfb4ff077a1fb7901106056deb39b4299c0`; the schema snapshot SHA-256 is
`0769a26cb4afd1d85dcad7b03be2cf35559a230603f92f3182d7af454fc4ad42`.
Its release `specification.json` does not establish successor provenance. The
field matrix separately records exact installed candidate schema/declaration
hashes. External GraphIR owns its schema and geometry contracts; Coral owns
source projection and explicit operation dispositions.

### 1.2 Public entry points and results

| Entry point | Input and result | Guarantee and limit |
| --- | --- | --- |
| Root `parse`, `parseDocument028` | Saved source plus `HeaderRuntime028`; returns `header`, recovered `syntax`, optional GraphIR 3 `graph` | Root `parse` aliases the document reader. Exact text is `header.source`; inspect both diagnostic collections. Optional staging is not complete successor/export authority. |
| Root `parseHeader028` | Source plus exact installed runtime | Resolves saved type/version/profile/catalog/level or returns located findings; preserves exact source. |
| Root `prepareHeaderForSave028` | Source, resolved header result and runtime | Explicit version-pin insertion helper; ordinary save does not call it. |
| Root `formatDocument028` | Valid saved source plus runtime | Expands each indentation tab to two spaces; preserves all other tokens and newline bytes. Invalid source throws `coral.format028.source.invalid`. |
| `/parser` `parse` | Deliberate graph-interchange text; returns graph parse result and diagnostics | Default graph-interchange contract maps GraphIR 3. Explicit `edition: '0.2.8-preview'` selects bounded preview interchange. Neither is the saved document reader. |
| Root or `/printer` `printWithDiagnostics` | GraphIR 3 plus print options; returns text and diagnostics | Reports unrepresentable fields through explicit loss findings; callers inspect them before treating output as lossless. |
| Root or `/printer` `print`, `prettyPrint` | Same graph input; returns generated interchange text | Throw on error diagnostics, but warning/info losses require `printWithDiagnostics` to observe. Never use these as saved-source formatters. |
| `/formats` and root import readers | Mermaid, DOT or PlantUML | Import their declared graph subsets with diagnostics. Imported text is a distinct format; detection does not make it saved Coral. |
| `/sequence` helpers | Graph-level sequence records | Structural sequence operations only; no saved-source or complete notation-conformance guarantee. |

The source runtime supplies `manifest`, `currentVersion`, and trusted catalog
hashes. The installed adapter defaults to source edition `0.2.8` and an immutable
manifest. An explicit `@coralVersion "0.2.9"` selects its user-symbol extension;
the package version alone does not select it. Missing or incompatible
identity prevents a resolved header; valid neighboring syntax remains available
for editing. The root reader does not silently fall back to graph interchange.
The explicit graph reader refuses `@diagram` with
`coral.source.reader.unsupported` and no graph.

Render additionally owns `parseInstalledDocument028`,
`projectInstalledSourceToSuccessor028`, `printInstalledSource028`, and
`printSuccessorSource028`. These are not language-root printer aliases. The
first binds the installed source runtime; projection preserves accepted typed
meaning or returns findings. The GraphIR 3 source writer accepts its declared
bounded profile/field subset and checks semantic replay. The successor source
writer requires exact catalog/schema validation and semantic reparse equality;
it refuses interaction graphs with `coral.writer028.successor.unsupported`.
Neither is a general replacement for exact authored text.

## 2. Saved-source characters, whitespace, comments, and tokens

Saved source follows `grammar-028.ebnf`, not the graph-interchange lexical rules
in G.3. Diagnostic locations use one-based lines, zero-based UTF-16 columns and
absolute UTF-16 offsets. CRLF counts as one line ending; LF and a final line
without a terminator are recognized. Ordinary save preserves their exact bytes.

ASCII space and tab are token separators. Unicode whitespace, invisible format
characters and a BOM outside quoted text/comments receive located findings.
Indentation is presentation; braces define ownership. `//` begins a comment;
body statements admit trailing comments where the grammar specifies them.
Quoted text may contain Unicode scalars except prohibited controls and literal
U+2028/U+2029. Single and double quotes must pair. The saved quote escape set is
the active delimiter, backslash and `\n`; it is not the graph reader's JSON
escape set. Unknown escapes and unpaired scalars receive findings.

IDs are ASCII identifiers `[A-Za-z_][A-Za-z0-9_]*`; diagram types additionally
admit hyphens. Dotted references name qualified IDs, not dotted local declaration
names. Finite JSON-style coordinate numbers may use exponents. Applicable
nonnegative, fraction and positive-spacing limits are semantic checks.

## 3. Saved document structure and identity

A saved document requires `@diagram <type>` before body statements. Leading
blank/comment lines are allowed. Optional directives, in any order before the
first statement, are `@coralVersion`, `@profileVersion`, `@catalogVersion` with
quoted versions and `@conformanceLevel none | typical | strict`.
Defaults come from the exact installed manifest; an omitted level is `typical`.
The `@diagram` bracket is reserved: no keyed attribute is admitted in this
source edition. Unknown, duplicate, disabled or incompatible identities have
located diagnostics and do not silently select a replacement.

The installed types are Block, Flowchart, Architecture, BPMN, Code, AIML,
Data Engineering, Sketch, UML Class, UML Sequence and the bounded UML State
source/character edition, using their lowercase manifest keys. ERD identity is
retained with `enabled: false`; syntax recognition is not enabled operation
support. Catalog identity is resolved from trusted installed data, not authored
by copying a digest into source.

```coral
@diagram architecture
api service as "API"
db = database as 'Orders'
request = api -> db [data] as "writes"
```

Node identity comes first. Optional `=` does not change meaning. `as` supplies
rendered text, never identity. An omitted node label displays its exact ID;
`as ""` explicitly suppresses it. A kind is semantic vocabulary, not a promise
that a particular symbol or operation exists. Explicit `symbol`, `variant` and
`conformanceException` fields use the declared node bracket grammar. Exceptions
name the exact selected symbol and cannot hide integrity/capability failures.
Document-local symbol definitions require the explicit 0.2.9 edition described
below; they are not admitted by edition 0.2.8.

A declaration inside groups has its enclosing IDs joined with dots. References
search the current group, enclosing groups, then root; a dotted reference is
absolute. Repetition in one scope is an identity error; same local names in
different groups stay distinct. Semantic ports are node-local and may name an
exact catalog anchor. A port requires one `direction: in | out | inout` and at
most one `anchor`; catalog resolution validates its meaning separately.

Named edges use `id =`. Unnamed staging edges receive deterministic traversal
IDs such as `edge-1`; those derived IDs are not durable authored references.
Routes and other reference-bearing constructs require the corresponding named
identity. Source-preserving edits retain unrelated bytes, tokens and quote
choices; a graph regeneration is not an exact-source edit.

### 3.1 Edition 0.2.9 document-local symbols

An explicit `@coralVersion "0.2.9"` admits `@symbol <id> { ... }` after
all header directives and before body statements. Definition IDs are ASCII
identifiers and unique within the document. A node selects a definition with
`[symbol: "local.<id>"]`; its node kind remains independently authored meaning.
Neither SVG artwork nor a symbol name supplies notation semantics.

| Definition field | Meaning and restrictions |
| --- | --- |
| `name "..."`, `size W x H` | Required display name and positive finite nominal dimensions |
| `description`, `source`, `license` | Optional quoted metadata; not inferred from artwork |
| `tags "..." "..."` | Optional quoted metadata list |
| `label above / below / left / right / center` | Default label position; omitted means below |
| `outline rectangle / rounded / ellipse / diamond` | Connector geometry; omitted means rectangle |
| `tint none / stroke` | Artwork tint policy; omitted means none |
| `anchor id [side: N, at: 0.5]` | Boundary anchor: N/S use left-to-right x, E/W use top-to-bottom y; `at` is in 0..1, then projected inward to the outline |
| `anchor id [x: 0.5, y: 0.5, exit: E]` | Interior normalized point inside/on the outline with a valid outward cardinal exit |
| `id port [direction: out, anchor: E, label: "Out", maxConnections: 2]` | Port direction is required; anchor, label and positive integer connection limit are optional |
| `artwork svg` raw block | Required artwork admitted by frozen `coral.svg-artwork` version 1 in `@coral-viz/render/spec/svg-artwork-1.md` |

Generic anchor names (`auto`, `side`, `corner`, cardinal/diagonal names and
`up`, `down`, `left`, `right`) are reserved. Definition ports are inherited by
each selecting node. A node-local port cannot replace an inherited ID; definition
and instance ownership remain distinct. Edition 0.2.9 also admits `label` and
`maxConnections` on node-local ports. Connection limits count incident endpoints,
including both named endpoints of a self-loop.

The artwork opener ends with three double quotes; its closing line contains
only three double quotes (with optional indentation). The scanner preserves
raw artwork bytes without treating its SVG punctuation as Coral tokens.
Duplicate, late, unclosed or edition-incompatible definitions receive located
findings rather than silently changing editions. Geometry comes from the
explicit size, outline and anchors, not from painted SVG extents.

Selecting a local symbol makes effective notation conformance `none`.
An explicitly requested `typical` or `strict` level receives the existing
conformance notice; an omitted level is quiet. An unused definition alone does
not change effective conformance. Integrity and rendering checks still apply.

Optional GraphIR 3 staging does not represent these definitions. Render's shared
source projection and portable GraphIR 4 writer retain the complete definition,
profile identity, artwork digest and node reference, or report refusal. The
portable format retains its 256-definition and 4,194,304-artwork-byte document
limits. The editor and MCP `coral_convert` still refuse raw GraphIR 4 input;
`coral_validate` separately supports its schema, catalog and artwork validation.
Supported flowchart character output uses a labelled process-box fallback for
local symbols; it does not reproduce SVG detail or infer artwork meaning. This
does not add character rendering for other symbol-bearing notations.

## 4. Saved relationships, classifiers and sequences

Edges retain written first and second endpoints, including qualified semantic
ports. Reverse arrows do not swap written identities; semantic direction is a
separate property. Connectors have one to six shaft positions. A dashed shaft
has a single period in its second position and three to six positions. Length
is authored proximity intent, not a promise of fixed pixels or a different
relationship kind. Operation-specific failure to honor it is attributable.

The full connector/marker inventory is in `grammar-028.ebnf`. One leading bare
bracket type or keyed `type:` supplies relationship kind; a second positional
item is not a label. `as` and `label:` write the same label and cannot coexist.
Duplicate assignments and conflicting operator/keyed-end marks have findings.
Equal keyed restatement of an operator end is accepted; marks without shorthand
on that end may be assigned by key. An unspecified end and an explicit `none`
remain distinct. Preserve the canonical semantic mark named by `zeroToMany`.

`style:` admits the existing single term/RGB or double-quoted comma recipe for
line pattern, RGB color, weight and motion. Each dimension is assigned once;
the connector's dashed shaft already assigns line pattern. Unknown terms warn
and block semantic projection rather than being silently discarded. Pattern,
color, weight and motion remain distinct from semantic relationship meaning.

Groups own nested declarations, edges and spatial constructs. Non-group ordinary
node bodies admit ports; class/interface bodies admit the grammar's attribute
and operation compartments. Named and unnamed compartments/members are distinct
supported forms. Named members use `id = visibility attribute/operation`; a
symbolic visibility sign is the unnamed operation form. The exact grammar and
field matrix define visibility, parameters and return types. Enum literal bodies
and undeclared combinations do not gain support from a classifier-shaped box.

UML Sequence preserves participant declaration order and recursive timeline
item order. Solid filled-triangle messages are synchronous, solid open-arrow
messages asynchronous, and dashed open-arrow messages returns unless explicit
creation meaning applies. A dashed/open `[create]` message may introduce its
receiver; ordinary unresolved targets do not gain that privilege. The same
creation meaning applies at every admitted shaft length. `[destroy]` closes a
known receiver's lifetime; invalid later use receives a located finding.
Lost/found successor records are not two-endpoint source authoring forms.

Recursive `alt` requires quoted guards and one or more `else` operands; `par`
requires `and` operands. `opt`/`break` require nonempty guards;
`loop`/`critical`/`par` may omit a guard without manufacturing an empty one.
Activation blocks, notes, labelled regions and root participant groups preserve
their declared ownership and order. Notes resolve participant/message targets
under explicit ambiguity/lifetime rules. Group membership does not reorder
participant lanes. A recognized construct may be portable but unavailable to a
particular scene, character target or writer; that target must report its limit.

## 5. Saved spatial language tiers

Omission selects automatic layout. Authored positions and `pinned`, primary
label placement, named typed constraints/arrangements, finite `layout` settings
and route blocks preserve intent separately from computed positions/bends.
Child positions are relative to their parent content box. Pinning without an
authored position is invalid. Label offsets are nonnegative; an edge label's
`at` is a fraction in 0..1 and centered placement requires zero offset.

Typed rectangle references distinguish nodes, groups, edges and authored primary
labels. An omitted/empty label has no independent authored label rectangle.
Relative relations, ancestor/diagram boundaries, ordered row/column arrangements,
strength and applicable gap/inset/alignment/direction parameters follow the
normative grammar. Required is the saved-source default; preferred may yield
with an attributable result. Fixed members stay fixed; dynamic membership is
not inferred from containment. Raw solver options are not source declarations.

Named edge route blocks retain absolute waypoints and relative offsets anchored
to written first/second endpoints, nodes, semantic ports or named waypoints
as admitted. Named waypoint references may point forward within the same route.
Waypoint identities are local to the route. Duplicate routes,
nonfinite positions and unknown edges/anchors block valid projection. Feasible
waypoint-offset cycles are allowed; inconsistent equations fail spatial
operation admission rather than being silently adjusted.
Generated bends and legacy `routingPoints` never become authored route intent.
Required conflicts refuse the new operation atomically while exact draft text
remains saveable. Supported operations share the portable geometry contract;
this specification does not redefine GraphIR's rectangle equations or tolerance.

## 6. Saved-source validation, formatting and operation guarantees

The following layers are independently observable:

| Layer | What success establishes | What it does not establish |
| --- | --- | --- |
| Header/syntax | Recognized tokens, ranges and selected installed identity | Complete portable projection, U1/U2 or target capability |
| Portable projection/integrity | Typed authored identity/references/order or explicit findings | Universal full-schema or target execution success |
| Exact schema/catalog verification | Complete obligations for the invoked exact verifier | External-standard conformance or every operation's support |
| U1 interpretation | Exact selected symbol/variant/port meaning | Permission to rewrite authored semantic types |
| U2 report | Named ruleset/edition/level findings, exceptions and remaining obligations | Full external-standard certification or geometry capability |
| Target admission/layout/render/export | The invoked target can preserve the admitted subset or refuses | Save authority for a derived display graph |

Browser and MCP rendering use source/display and U1
integrity admission. MCP validation/conversion and character admission invoke
additional exact successor validation. The shared successor conformance helper
can take an ordinary-report shortcut; a report alone is not proof of universal
successor-schema/catalog completeness. Public graph synchronization remains a
host-owned interchange integration, not an automatic source-preserving writer.

Malformed or unsupported text stays saveable exactly. Saving does not claim U2
conformance and never prints a staging/display graph over source. Reopening
rebinds source revision/ownership; stale parsing cannot publish another
document's content. Ordinary save does not inject pins or normalize quotes.
`formatDocument028` is explicit indentation formatting only; generated model
writers are separate operations with bounded replay/loss checks.

Header findings have codes/messages/ranges; body findings add closed severities
and related locations. The catalog distinguishes these producers and
interchange/print diagnostics. Notification filtering and requested U2 level
cannot suppress integrity or capability failures. Import, print and export
results expose their own losses/refusals; a success in one layer cannot replace
checking another layer's result.

## 7. Round-trip and compatibility guarantees

Language 1.3.0 joins existing approved behavior. It does not reinterpret older
`@graph` text as saved `@diagram`, change `as` from a label to an ID in saved
source, or make the two grammars interchangeable. Existing graph-interchange
canonical output and the bounded `0.2.8-preview` option remain explicit. The
G sections define the graph contract and its historical 1.0/1.1 removals.

Exact saved bytes round-trip through save/reopen. Explicit formatting preserves
non-indentation bytes and is idempotent. Supported model writers preserve their
declared semantic projection through parse/write/parse, or expose loss/refusal;
they do not promise preservation of comments, whitespace or original quotes.
The graph printer's second canonical print is a fixpoint for admitted graphs.
GraphIR migrations are named external operations; candidate source projection
is not an implicit migration of arbitrary graph input.

Package, language and source-edition changes are separate decisions. New syntax
or canonical-text changes require before/after human review under contributor
guidance and coordinated grammar, diagnostics, mappings and conformance cases.
The six evolution criteria govern changes; this reconciliation approves no new
syntax, local symbol registry or provider experiment.

## 8. GraphIR disposition and current support

`spec/graphir-field-matrix.json` covers every declared GraphIR 3 field and every
property/branch in the exact successor candidate schema. A field has an authored
spelling, derived meaning, non-semantic rule or explicit unsupported operation
and diagnostic. Presence in a schema does not imply a saved spelling, writer
support, renderability or a notation claim. Candidate sequence interaction, for
example, may project from source while the successor source writer refuses it.

Current behavior records use explicit support results tied to entry points and
cases. Historical slice labels are provenance, not current pass/fail states.
Conformance fixtures exercise each declared reader and representation; normal
verification checks identities, grammar, diagnostic completeness, field mapping,
coverage and distributed normative assets. Tree-sitter and LLM subsets remain
limited independently of these runtime cases.

## G. Deliberate graph-interchange contract

The remaining G sections specify the separately exported `/parser` and graph
printer contract retained from Language 1.1. They do not describe saved-source
syntax. Here `as` assigns graph IDs, comments/JSON strings follow G.3, constraints
have their graph-interchange defaults, and `@graph` carries graph metadata.
References to numbered sections within G refer to this graph contract. The
normative `grammar.ebnf`, top-level GraphIR 3 dispositions and graph-interchange
conformance cases govern these forms. Source/header edition `0.2.8` is not
selected by a `@graph` document.

## G.3. Characters, whitespace, comments, and tokens

Source is Unicode text. Diagnostic offsets and ranges count UTF-16 code units;
lines and columns are one-based lines and zero-based UTF-16 columns. LF is the
canonical newline. Parsers accept CRLF as a single newline and may accept a
final line without a terminator.

Horizontal space separates tokens. Indentation is presentation only; braces
define node bodies. Blank lines are insignificant. A line comment begins with
`//` after optional horizontal space and continues to the newline. This graph
contract does not define trailing inline comments or block comments. Comments are
not semantic and canonical printing omits them; source-preserving tools may
retain them through `sourceInfo`.

A bare identifier is `[A-Za-z_][A-Za-z0-9_]*`. A bare node type additionally
permits internal and trailing `-`. A double-quoted identifier or type may carry
other text but must not be empty where GraphIR requires an identifier.

Strings use JSON escapes: `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, and
`\u` followed by four hexadecimal digits. Unknown escapes and unescaped control
characters are errors. Canonical output uses JSON-compatible escaping.

Numbers use the JSON number grammar, must be finite, and may use exponent
notation. Distances, dimensions, offsets, and insets are non-negative.
Positions and waypoint vector components may be negative. Canonical numeric
output uses RFC 8785 section 3.2.2.3 number serialization, including its
ECMAScript `NumberToString` algorithm and exponent normalization. It never
rounds authored geometry. Negative zero canonicalizes to `0`. The second
parse/print is therefore a fixpoint without changing any JSON-representable
numeric value.

Structured clauses are strict JSON objects. Trailing commas are invalid. A JSON
object states each key once: a key repeated in `@graph`, `data`, or a body value,
at any nesting level, produces one `coral.json.key.duplicate` at the first
occurrence with every later key as an exact related location. The first is
kept for recovery. Keys compare after decoding escapes. JSON objects
used for extension properties must contain only JSON-safe finite values.

## G.4. Document structure

The complete grammar is `spec/grammar.ebnf`. A document contains an optional
graph header followed by declarations. `@graph` may appear once and only before
declarations. It contains a non-empty `id` plus optional `name`, `metadata`, and
portable `layoutOptions`. Any other key is `coral.graph.data-field.unsupported`,
and a wrong-shaped value is `coral.graph.data-field.invalid`; neither is stored.
Raw `layoutOptions.algorithmOptions` is not authored meaning: it is
`coral.graph.data-field.unsupported`, and `layoutOptions` is not stored.

Declarations are nodes, edges, required constraints, identified constraints,
or arrangements. The fixed clause order is deliberate:

```text
node: type label, identity, UML classifier modifiers, label placement, concise relation, exact position,
      pinned marker, structured data, body
edge: source/target, identity, attributes, label placement, structured data,
      authored route
```

This keeps ordinary declarations short and makes each optional clause
unambiguous. A node body contains properties and nested nodes. Properties appear
one per line. Edges and top-level constraint declarations are not permitted
inside a node body.

## G.5. Nodes, properties, and containment

The ordinary declaration is:

```coral
service "API" as api
```

The first token is an open node-type vocabulary. Notation or editor allowlists
are consumer policy, not core syntax. The quoted label is display text. `as`
supplies the exact node ID; omission derives it by lowercasing the label,
replacing each run of dots, whitespace, or hyphens with `_`, removing other
non-ASCII-alphanumeric/underscore characters, collapsing/trimming `_`, using
`node` if empty, and adding `_2`, `_3`, and so on in declaration order until
unique. Thus `a+b` derives `ab`, not `a_b`. An explicit ID that is empty or
already held by an earlier declaration of the same kind, explicit or derived,
is the error `coral.node.id.invalid` or `coral.edge.id.invalid` at the ID
token. The declaration keeps its derived ID only so later references resolve.

The advanced `service as api` form omits a display label and preserves an
absent GraphIR `label`. Canonical printing never invents `label = id`.

Nested declarations create `children`; a child's `parent` equals its immediate
enclosing node ID. IDs are unique over the recursive graph. A top-level node
omits `parent`.

Body properties map to `properties`. Bare or quoted keys are allowed, and a
body states each key once: a repeated key produces `coral.node.field.duplicate`
at its first occurrence with later keys as related locations. Keys beginning
`_` are reserved and are the error
`coral.node.reserved-key.invalid`; they are never stored. Values are
strings, numbers, booleans, null, arrays, or objects containing JSON-safe
values. Canonical printing sorts property keys by Unicode code-point order and
quotes a key only when required.

The node `data` object exposes uncommon first-class fields: `description`,
`symbol`, `variant`, `dimensions`, `ports`, and `layoutOptions`. Node label
placement and exact position have readable clauses and do not appear in `data`.
Any other key, including a readable field, is `coral.node.data-field.unsupported`,
and an accepted key with the wrong shape is `coral.node.data-field.invalid`;
neither is stored, and the message names the readable spelling where one
exists.

`@ (x, y)` maps to authored `position`. `pinned` requires a position and maps to
`pinned: true`; omission means unpinned. A child position is parent-content-box
local as defined by GraphIR. Exact authored position survives parse, print,
save, and reopen. Explicit Reflow may resolve an unpinned node elsewhere but
does not silently rewrite or delete its authored source.

### G.5.1 UML class profile and classifiers

When `@graph.metadata.notation` is `uml-class`, the parser derives the exact
GraphIR profile `{id:"uml", kind:"class", version:"1.0.0"}`. The only
structured classifier declarations are `class`, `interface`, and `enum`; each
has a quoted name, the matching `uml-class`, `uml-interface`, or `uml-enum`
symbol, and a leading implicit `{id:"name", kind:"name"}` compartment.

Classifier modifiers have the one spelling `modifiers {abstract, static}`
between identity and later node clauses. `abstract` is valid for classes and
interfaces; `static` is valid only for classes. Tokens are unique and remain in
that order. A classifier body may contain one block of each applicable kind:
classes and interfaces accept `attributes` and `operations`; enums require one
`literals` block. A block may use `as id` to preserve a non-default compartment
identity.

Attribute and operation lines begin with `+`, `-`, `#`, or `~` for
public/private/protected/package visibility, or with the words `attribute` and
`operation` when visibility is absent. Attributes accept a name, optional type,
optional `as id`, and ordered modifiers from `static`, `readonly`, `derived`.
Operations accept a name, typed parameter list, optional return type, optional
`as id`, and ordered modifiers from `abstract`, `static`. Enum literals use
`literal NAME`, with optional quoted value and optional `as id`. Member names,
parameter names, and type tokens use bare identifier/type spelling. Default
member IDs are `attribute-N`, `operation-N`, and `literal-N` in their stored
compartment order; the printer emits `as` whenever a stored identity differs.

Compartment kinds may occur in either valid order but never repeat. Member and
compartment order is semantic and round-trips exactly. Any invalid kind,
modifier, identity, missing enum literals block, or malformed member is a
`coral.uml.*` error and is not silently coerced. Programmatic classifiers
outside this finite source subset produce attributable print loss.

### G.5.2 UML sequence profile and interaction

When `@graph.metadata.notation` is `uml-sequence`, the parser derives the exact
GraphIR profile `{id:"uml", kind:"sequence", version:"1.0.0"}` and the
`interaction` record; neither has an authored spelling. Every node is a
top-level `participant` or `actor`; every edge is a message whose first
attribute is exactly one kind token: `sync`, `async`, or `return`. Participant
and message identities are the node and edge identities. Declaration order is
the only spelling of participant and message order.

```coral
@graph {"id":"sign-in","metadata":{"notation":"uml-sequence"}}

actor "User"
participant "App"

user -> app as ask [sync, label: "sign in"]
alt "valid" {
  app -> user as ok [return, label: "welcome"]
} else "invalid" {
  app -> user as no [return, label: "denied"]
}

activation app from ask to no
note "Passwords are never logged" on app
```

A `loop`, `alt`, or `opt` block owns exactly the messages declared inside it,
with an optional quoted guard and `as id`. Only `alt` continues with
`} else ["guard"] {` operands, which may be empty; an `alt` needs at least
two operands, as GraphIR 3 requires; every fragment owns at least
one message. Fragments do not nest. `activation P from M1 to M2 [as id]` and
`note "text" on T, … [as id]` are top-level statements whose position is
inert; note targets are participant or message identities. Activations, notes,
and fragments have one canonical order (fragments by message range,
activations by start then end message then participant, notes with
participant-only notes first then by their last message target), with ids
breaking ties; default ids are `activation-N`, `note-N`, and `fragment-N` at
their canonical position, and operand and guard ids derive from the fragment.

Nodes carry only identity, type, label, description, and properties; edges
carry only identity, endpoints, kind token, label, description, and
properties. Geometry, symbols, styles, ports, routes, label placement, and
constraints are `coral.sequence.field.unsupported`. Nested fragments,
`par`/`critical`/`break`/`rect`/`box`/`group`, `autonumber`, and
`create`/`destroy` messages are refused with `coral.sequence.*` errors; they are
0.2.7 work. Programmatic GraphIR outside this subset is a blocking
`coral.sequence.print.unsupported` print diagnostic.

## G.6. Edges and attributes

An edge is `source -> target`. Endpoints use the reference rules in section 8.
`as` supplies the edge ID. After resolving both references to node IDs, omission
derives the base
`labelToId(resolvedSourceId) + "_to_" + labelToId(resolvedTargetId)`. An empty
normalized endpoint contributes `node`. The forward allocator takes that base
when free or appends `_2`, `_3`, and so on in edge declaration order. Edge IDs
are unique.

The bracket list has at most one leading relation type followed by named
attributes. If both relation and style are present, relation precedes style;
style precedes named attributes. `:` is the only attribute separator; the
removed Language 0.2 `=` is `coral.attribute.equals.unsupported` at the `=`
token, and its message names the `:` spelling. A named attribute value is a
quoted string, a number, `true`, `false`, or `null`; an unquoted string such as
`[k: hello]` is `coral.attribute.value.unparsed`. Bare `solid`, `dashed`, or
`dotted` maps to `style.lineStyle`; quote one of those words to use it as a
relation type. A second line style, a repeated named attribute, empty entries,
extra bare relation tokens, non-string `label`, and malformed keys are errors.
A relation type after a line style, such as `[dashed, event]`, is
`coral.attribute.relation.invalid`. A relation type or line style after a named
attribute, such as `[label: "x", dashed]` or `[label: "x", event]`, is the same
`coral.attribute.relation.invalid`. A removed `=` attribute counts as a named
attribute for this order. Each misplaced token is its own error and is not
stored. Every such message names the whole list rewritten in canonical order:
relation tokens, then line styles, then named attributes, each in source order
with its raw value. For example, `[label: "x", dashed, event]` reports two
errors, and each names `[event, dashed, label: "x"]`.

`label` maps to first-class edge `label`. `description` maps to first-class edge
`description`. Other scalar named attributes map to `properties`. Edge `data`
accepts `sourcePort`, `targetPort`, `style.routing`, `sourceEnd`, `targetEnd`,
and `properties`. `data.properties` holds non-scalar values and the keys
`label` and `description`, which are properties distinct from the first-class
fields; a scalar under any other key is written `[k: v]`, and in `data` it is
`coral.edge.data-field.unsupported`. `description` is written
`[description: …]`; edge `data.description` is removed. Any other `data` key,
including a readable field such as `label` or `style.lineStyle`, is
`coral.edge.data-field.unsupported`, and a wrong-shaped accepted value is
`coral.edge.data-field.invalid`; neither is stored. Canonical printing orders
relation type, line style, label, description, then lexically sorted extension
properties.

An edge states each field once. When one edge gives a field through two
spellings, such as `[k: 1]` and `data {"properties":{"k":[2]}}`, or through one
spelling twice, one `coral.edge.field.duplicate` is reported at the first
occurrence with each later spelling as an exact related location.

Relationship ends use a parenthesized annotation immediately after their
endpoint: `a (1 "owner" diamond+ nav) -> b (0..*)`. Each part occurs at most
once, in the order multiplicity, quoted role, marker, navigability. Parts out
of that order, judged by the first occurrence of each part, are
`coral.edge.end.order.invalid` on the annotation, even when another part is
also invalid or repeated. Its message names the full canonical rewrite, using
the canonical token for a noncanonical bound, unless an unknown part or a
bound without a canonical token makes no single rewrite possible. An end with
any error, including a repeated part, stores nothing.
A bound is `0` or a nonzero digit followed by digits, at most
9007199254740991; a sign, fraction, exponent, or leading zero is invalid. A
single bound means equal lower/upper bounds, and equal bounds are written
once: `1`, never `1..1`. `n..m` and `n..*` mean explicit bounds. A
noncanonical or out-of-range bound is `coral.edge.end.invalid` at that part,
and names the canonical bound when one exists; a plain-digit bound above the
maximum names whole-end `data` as the route for a larger bound.
Fillable markers `arrow`, `triangle`, `diamond`, and `circle` use `-` for open,
`+` for filled, and no suffix for explicit unspecified fill. Fixed markers
`none`, `bar`, `crow-foot`, `zero-or-one`, `one`, `zero-or-many`, and
`one-or-many` have unspecified fill and no suffix. `nav` means navigability
`navigable` and `nonav` means `non-navigable`; the part `navigable`,
`non-navigable`, or `unspecified` is `coral.edge.end.invalid` and its message
names `nav`, `nonav`, or whole-end data. No other field is inferred.
Empty parentheses, bare roles, commas, and a standalone `*` are invalid.
Only spaces or tabs may pad the inside of the parentheses and separate parts;
any other whitespace character there is `coral.edge.end.invalid` at that
character. Like the spacing inside a point or attribute list, this is
layout, not a second spelling, and the printer normalizes it. A
multiplicity is one part, so `1 .. 2` is invalid.

Empty ends, ends with explicit `unspecified` navigability, and ends with a
bound above 9007199254740991 use the complete `data.sourceEnd` or
`data.targetEnd` object. An otherwise valid data end fully
expressible compactly is rejected with `coral.edge.end.compact.required` at
its JSON key; its message gives the compact replacement. Each side chooses
independently. Writing the same end compactly and in data is a whole-end
collision, even when the parts are disjoint; its message says to write the
whole end in one spelling, and it suppresses the redundant
compact-required error. Each end is a strict GraphIR 3 object with fields `role`,
`multiplicity`, `navigability`, and `marker`. Multiplicity bounds are
non-negative integers (or `"*"` for the upper bound), marker kind/fill follows
the GraphIR schema, and cardinality markers must agree with an accompanying
multiplicity. Invalid ends produce `coral.edge.end.invalid` and are not stored.

The Language 0.2 fields `data.style.sourceArrow` and `targetArrow` are
removed. Each is `coral.edge.legacy-arrow.unsupported`, stores nothing, and its
message names the replacement, such as `(arrow)` after the target reference.
A full end
beside a removed arrow stands alone. Canonical output chooses exactly one
spelling for each end using the rules above. Absent ends, empty ends, explicit
`none`, unspecified fill, and explicit unspecified navigability remain distinct.

Attribute and `data.properties` keys beginning `_` are reserved and are the
error `coral.edge.reserved-key.invalid`. They never become authored GraphIR
properties.

## G.7. Spatial language tiers

### G.7.1 Label placement

Node label placement follows identity and precedes spatial relation:

```coral
service "Worker" as worker label below offset 12
```

Edge label placement follows attributes:

```coral
api -> orders [label: "writes"] label below at 0.25 offset 12
```

Sides are `above`, `below`, `left`, `right`, and `center`. Offset defaults to
zero. Edge `at` defaults to `0.5` and is inclusive from zero through one.
`center` requires zero or omitted offset. Meaning is the GraphIR page-relative
bounding-box contract. Operations without label-placement support must refuse
with `coral.capability.label-placement.unsupported`.

### G.7.2 Concise preferred constraints

An inline node relation creates a preferred constraint:

```coral
service "API" as api above orders
service "Ingress" as ingress at the top
service "Worker" as worker at the left of backend
arrange api, worker, orders as row
```

Relative defaults are gap `0` and alignment `center`. Boundary scope omission
means graph and inset defaults to `0`. Arrangement direction omission means
`forward`, gap `0`, alignment `center`, and requires at least two distinct
explicit subjects. Source order is arrangement subject order and preferred
constraint order.

Each concise constraint receives `coral.constraint.<kind>.<ordinal>` where
ordinal is its one-based position among all source constraints. Its strength is
explicitly `preferred`. The exact derived ID algorithm is stable for Language
1.x; inserting an earlier constraint may renumber later derived identities, so
externally referenced identities use an identified declaration.

### G.7.3 Required and identified constraints

`require` makes the guarantee visible:

```coral
require api above orders
require worker at the left of backend
require arrange api, worker, orders as row
```

Required concise forms receive the same deterministic ID family and map to
`strength: required`. All required constraints must hold in final geometry or
the operation fails atomically.

Identified declarations preserve advanced fields:

```coral
constraint auth_above_orders: auth above orders [required, gap: 24, alignment: center]
constraint ingress_boundary: ingress at the top of backend [preferred, inset: 8]
constraint service_row: arrange api, worker, orders as row [preferred, direction: forward, gap: 16, alignment: start]
```

Omitted identified strength follows GraphIR and means `required`. Relative and
arrangement declarations accept `gap` and `alignment`; boundary declarations
accept `inset`; arrangements additionally accept `direction`. Canonical output
uses identified syntax whenever concise syntax cannot reproduce all authored
fields or the stable ID.

`require` and concise `arrange` lines take value parameters only, such as
`require api above orders [gap: 8]`. A strength flag belongs only to a
`constraint id:` line: `require` with `[required]` or `[preferred]` states
strength twice and is `coral.constraint.field.duplicate` at both, and a flag on
an `arrange` line is `coral.constraint.parameter.invalid`. A declaration states
each parameter once. `alignment` and `direction` take bare keywords; a quoted
keyword such as `alignment: "start"` is `coral.constraint.parameter.invalid`.

`children of <container>` is reserved and always diagnosed as
`coral.constraint.dynamic-membership.unsupported`. GraphIR 3.0 carries fixed
subjects; expanding children during parsing would silently change meaning after
membership edits.

### G.7.4 Required/preferred evaluation

Required constraints are an unordered conjunction. Preferred constraints are
considered in authored/GraphIR array order and accepted only while jointly
satisfiable with all required and previously accepted preferences. Every
accepted constraint holds in published geometry. Each rejected preference
remains authored and produces a diagnostic naming its constraint ID. Solver
choice is outside this language specification.

## G.8. References and semantic validation

References may be bare or quoted and may be forward. Resolution happens after
the complete document is collected:

1. an exact node ID wins;
2. otherwise normalize labels with the node-ID derivation algorithm;
3. exactly one matching node succeeds;
4. zero matches are unresolved and multiple matches are ambiguous.

Edge endpoints, relative targets, arrangement subjects, boundary scopes, node
route anchors, and port route anchors follow this rule. A boundary node scope
must be a transitive ancestor of the subject. Constraint subjects/targets are
nodes only. Self relations, duplicate arrangement subjects, invalid scopes,
unknown ports, duplicate IDs, and GraphIR's required static contradiction
subset are semantic errors.

Route anchors have two contextual keywords. Unquoted `source` and `target`
select the containing edge's special endpoint-attachment anchors. Quoted
`"source"` and `"target"` are ordinary node references and therefore follow the
exact-ID-before-unique-label rule above. Canonical printing always quotes a
node-anchor ID that collides with either keyword. `port` introduces a port
anchor only when followed by its node-and-port reference; a node whose ID is
`port` remains an ordinary node reference.

Syntax diagnostics describe token/grammar failures. Semantic diagnostics cover
identity, references, containment, ranges, and contradictions provable without
layout. Layout diagnostics cover required failure and rejected preferences.
Capability diagnostics cover an operation that cannot honor valid authored
meaning. The catalog assigns stable codes; human text is not an API.

## G.9. Authored route intent

The simple absolute form is:

```coral
api -> orders via (240, 80) (240, 180)
```

In Language 1.0 this maps to `routeIntent.waypoints`, never generated
`routingPoints`. Waypoints receive `coral.waypoint.<edge-id>.<ordinal>`.

Identified absolute and relative forms preserve stable IDs and anchors:

```coral
api -> orders via waypoint turn_1 at (240, 80), waypoint approach relative to target offset (-20, 0)
api -> orders via waypoint port_entry relative to port orders.in offset (-12, 0)
```

Anchors are `source`, `target`, a node reference, or `port <node>.<port>`.
Offsets are graph-axis vectors. Waypoint order is semantic. Generated bends and
resolved route sections never print. GraphIR 1.x `routingPoints` have ambiguous
provenance and migration never infers route intent from them.

## G.10. Canonical printing

Canonical output:

1. always emits `@graph` with stable recursively sorted JSON; a source without
   a header receives graph ID `coral-graph` unless parse options supply another
   ID, and the canonical header preserves that resolved ID;
2. preserves node declaration and nesting order, then constraint source order,
   then edge declaration order;
3. inserts one blank line between graph header, nodes, constraints, and edges;
4. uses two spaces per nesting level;
5. prints only IDs needed to reproduce identity. In one forward declaration-
   order pass, children included, it speculatively allocates from the emitted
   label; on a match it keeps the allocation, and on a mismatch it releases the
   speculative ID, marks `as`, and reserves the authored ID immediately. Edge
   IDs replay the same rule in edge order from
   `labelToId(resolvedSourceId) + "_to_" + labelToId(resolvedTargetId)`, with
   empty endpoint components replaced by `node`;
6. sorts body properties and extension attributes lexically;
7. uses `:` attributes, one spelling per field, compact relationship ends when
   fully expressible, whole-end data otherwise, and stable JSON formatting;
8. omits default advanced parameters when omission preserves authored meaning.
   A constraint uses concise syntax only when a deterministic candidate
   projection, reparsed under this specification, reproduces the complete
   default-normalized authored constraint semantics (IDs, array order,
   strength, and parameters), excluding projection-only `sourceInfo` and JSON
   object key order; otherwise it uses identified syntax in array order;
9. never emits generated geometry, raw solver options, or comments; and
10. reaches a text fixpoint after parse/print/parse/print.

The printer emits a field only when its value passes the validator the parser
applies to that field. An invalid programmatic value, including a non-finite
number, is omitted or renamed and reported as print loss, so printed text
re-parses without a field-level diagnostic. References to missing nodes or
ports are outside this guarantee.

Printing a GraphIR document is lossless only when no warning/error diagnostic is
reported. The compatibility `print(graph): string` API may hide diagnostics for
existing callers; conformance and new integrations use the diagnostic variant.

## G.11. Partial parsing and recovery

A parser returns diagnostics in source order and may return a best-effort graph
containing declarations that parsed independently. Error diagnostics make the
result unsuccessful; warnings and information do not. The Coral parser reports
only errors. When one object states a field more than once, one primary error
points to the first occurrence and `related` contains every later occurrence
in source order. The recovered graph keeps the first occurrence, including an
invalid first occurrence reserving its field. Independent same-code defects
are not grouped. A
malformed declaration must not mutate a different declaration or fabricate
references. Exact ranges are half-open UTF-16 ranges whenever both boundaries
are known.

`DiagnosticRelatedLocation` contains `message`, required `position`, and optional
`range`. Coral duplicate locations always have exact ranges. Related locations
do not increase primary error counts. Edge, constraint, scope, and route
reference diagnostics retain their actual authored tokens independently of
optional GraphIR `sourceInfo`, including quoted references and UTF-16 offsets.

Recovery is implementation-specific only where the fixture corpus does not
require an outcome. Recovery never changes the accepted grammar. Automatic
repair is a separate explicit operation and is not parsing.

## G.12. Round-trip and compatibility guarantees

For every admitted graph-interchange source, canonical print followed by parse preserves
authored GraphIR meaning, IDs, constraint and waypoint order, properties,
geometry, label placement, and route intent. A second canonical print is byte
identical. `sourceInfo` and comments may differ because they are projection
metadata, not authored graph semantics.

The retained graph contract includes the Language 1.1.0 removals: it rejects
graph-interchange source that 1.0.0
accepted, and each rejection is a positioned error; removed and non-canonical
spellings name their replacement:

- a field stated twice on one object, through two spellings or one spelling
  repeated (`coral.edge.field.duplicate`, `coral.node.field.duplicate`,
  `coral.constraint.field.duplicate`);
- a JSON key repeated in one object (`coral.json.key.duplicate`);
- an empty or duplicate explicit ID (`coral.node.id.invalid`,
  `coral.edge.id.invalid`);
- an unaccepted or wrong-shaped `data` or `@graph` key
  (`coral.<kind>.data-field.unsupported`, `coral.<kind>.data-field.invalid`);
- the removed spellings edge `data.style.sourceArrow`/`targetArrow`
  (`coral.edge.legacy-arrow.unsupported`), `=` in attributes and constraint
  parameters (`coral.attribute.equals.unsupported`), `@graph`
  `layoutOptions.algorithmOptions`, and edge `data.description`;
- keys beginning `_` (`coral.node.reserved-key.invalid`,
  `coral.edge.reserved-key.invalid`, renamed from the 1.0.0 information codes
  `coral.property.reserved-key.dropped` and `coral.edge.reserved-key.dropped`);
- a strength flag outside a `constraint id:` line;
- a scalar in edge `data.properties` under a key other than `label` or
  `description`;
- an unquoted string attribute value (`coral.attribute.value.unparsed`);
- a relation type or line style after a named attribute, or a relation type
  after a line style (`coral.attribute.relation.invalid`);
- a relationship end in `data` that the compact form fully expresses,
  including a navigable or non-navigable end
  (`coral.edge.end.compact.required`);
- compact end parts out of canonical order (`coral.edge.end.order.invalid`),
  or a bound that is not canonical plain digits
  (`coral.edge.end.invalid`); and
- a quoted `alignment` or `direction` keyword.

`coral.edge.property.degraded` is retired. `coral.node.id.degraded` and
`coral.edge.id.degraded` are print-phase diagnostics for programmatic graphs.
Saved GraphIR documents are not Coral source and are unaffected.

**Pre-1.0 exception.** While Coral, the product, is pre-1.0, a Coral Language
minor version may remove or reject previously accepted spellings. Every such
change is listed in `CHANGELOG.md` and in this section. That historical removal
shipped as Language 1.1.0 under this exception.
Language 1.3.0 retains those removals and their approved diagnostic wording,
including historical Language 1.2.0 text. Advancing the specification identity
does not rewrite an existing diagnostic.

Package version changes do not implicitly change the language. Outside the
pre-1.0 exception, a breaking grammar/semantic change increments the language
major version and provides migration/loss rules.

## G.13. GraphIR disposition

`spec/graphir-field-matrix.json` is the total field-level disposition for
canonical GraphIR 3.0. `concise` and `advanced` fields have normative Coral
spellings. `derived` fields are represented structurally by nesting or another
clause. `projection-only` fields such as `sourceInfo` may be regenerated or
omitted without semantic loss. `unsupported` means the input operation returns
the named capability/loss diagnostic and does not silently continue.

GraphIR's authored-spatial-intent document remains normative for rectangle
equations, containment coordinate frames, label bounding-box meaning,
constraint satisfaction, route anchors, numeric tolerance, and validation
boundaries. This specification defines their textual projection and does not
copy them into a competing geometry contract.
