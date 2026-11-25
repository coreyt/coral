---
name: coral-dsl
description: Read and write installed saved Coral source using the current grammar and catalog
---

# /coral-dsl

Use `packages/language/SPEC.md` and its normative assets for Language 1.3.0.
`grammar-028.ebnf` describes saved editions 0.2.8 and explicit 0.2.9; the
separate `@graph` grammar describes deliberate graph interchange. Check the
installed catalog before claiming profile meaning. A parser implementation
does not supersede the specification or recorded author decisions.

## Source shape

Start with `@diagram <type>`. Enabled types are `architecture`, `block`,
`flowchart`, `bpmn`, `code`, `aiml`, `data-engineering`, `sketch`, `uml-class`,
and `uml-sequence`. Chen `erd` text remains saveable but cannot project,
render, or export as a 0.2.8 diagram. An optional `@conformanceLevel none`,
`typical`, or `strict` follows the header; omission means `typical`.

Declare IDs first. `as` is only for a matching-quoted rendered label. A
group child has a qualified identity such as `sales.api`, while `api` refers
to it inside that group. `id = statement` names a connector, arrangement,
or supported sequence item without using `as` for identity. Do not infer an
ID from a label or normalize the author's spelling.

```coral
@diagram architecture
sales group as "Sales" {
  api service as "API"
  db database as "Orders"
  read = api -> db [reads] as "lookup"
}
```

## Brackets and ports

An edge bracket has at most one leading bare relation and keyed fields.
The seven edge keys are `type` (bare relation ID), `label` (quoted text),
`firstPort`/`secondPort` (port IDs), `firstEnd`/`secondEnd` (closed end names),
and `style` (one bare term, RGB `#RRGGBB`, or a double-quoted comma recipe).
`as` and `label:` both assign the same rendered label and conflict if used
together. A repeated keyed field is diagnosed at the authored assignment.
Keyed end spelling on the same end as an operator shorthand may restate an
equal mark, but a different mark conflicts. Written endpoint order never
changes when an arrow points backward.

`api:out -> db:in` and keyed `firstPort`/`secondPort` are equivalent ways to
name semantic ports. Node-local ports use a keyed `direction` and optional
`anchor`. Authored ports add to catalog ports; a same-ID collision is an
error, not an override. An exact anchor pins a side; `auto` leaves layout
free to choose an attachment.

```coral
@diagram architecture
api service {
  audit port [direction: out, anchor: E]
}
db database {
  ingest port [direction: in, anchor: auto]
}
api:audit -> db:ingest [type: reads, secondEnd: arrow]
```

Connector shafts have one through six positions. A dashed shaft puts one
period in the second position, counted within the six. Length hints do not
change written endpoint identity or a profile's relation meaning. Semantic
end names resolve to canonical geometric marks without changing the authored
spelling; Chen meaning is disabled in 0.2.8.

## Document-local symbols

An explicit `@coralVersion "0.2.9"` admits `@symbol` definitions after header
directives and before body statements. Select one using
`[symbol: "local.<id>"]`. Preserve raw artwork, definition metadata and exact
port ownership. Edition 0.2.9 also admits port labels and positive integer
`maxConnections`; a node cannot override an inherited port ID. Artwork supplies
appearance; node kind, outline and anchors retain independently authored meaning.
A selected local symbol has effective notation conformance `none`. Supported
flowchart character output uses a labelled process-box fallback; other
symbol-bearing notations gain no character support. Follow the owning import guide for SVG admission
limits rather than inventing a broader SVG subset.

## UML class

Structured class and interface members use `attributes` and `operations`
blocks. A named word-form operation is `saveOp = public operation save()`;
an unnamed symbolic operation is `+ save()`. The current bounded grammar
does not author enum literal bodies or the old unkeyed classifier modifiers.

```coral
@diagram uml-class
order class as "Order" {
  attributes {
    orderId = private attribute id: UUID
  }
  operations {
    saveOp = public operation save(): Void
  }
}
repository interface as "Repository"
order -- repository [realization]
```

## UML sequence

Declare participants in lifeline order and messages in timeline order.
`-#>` is synchronous, `->` asynchronous, and `-.->` return in the UML
sequence profile. A quoted `alt` needs an `else`; `par` uses `and` and at
least two operands. `opt` and `break` require a quoted guard, while `loop`
and `critical` allow an omitted guard. Activation is a scoped block. A note
targets a participant or named message at its written timeline position;
inside an alternative it stays in that operand.

```coral
@diagram uml-sequence
user actor as "User"
app participant as "App"
ask = user -#> app as "sign in"
choice = alt "valid" {
  work = activation app {
    ok = app -.-> user as "welcome"
  }
} else "invalid" {
  no = app -.-> user as "denied"
}
note "Passwords are never logged" on app
```

## Validation boundary

Use the installed edition-aware source reader, packaged Tree-sitter grammar for
syntax tooling, and exact-version local GraphIR bridge for portable meaning.
Run `coral_validate` for syntax and portability, then the read-only
`coral_check_conformance` tool for profile findings and unverified rule
obligations. `notificationLevel` filters notices without changing meaning.
An unknown symbol, conflict, malformed construct, or unsupported capability
must never be silently rewritten. Preserve every source byte on ordinary
save and close, even when rendering, export, or conformance fails closed.
