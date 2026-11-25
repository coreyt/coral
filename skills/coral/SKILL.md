---
name: coral
description: Generate source-owned Coral diagrams using the installed saved-source editions from natural language
---

# /coral

Generate Coral text that an author can save, edit, and reopen exactly.

## Usage

```text
/coral <description>
```

## Source contract

1. Start with `@diagram <type>`. Use an enabled type such as `architecture`,
   `block`, `flowchart`, `bpmn`, `code`, `aiml`, `data-engineering`, `sketch`,
   `uml-class`, or `uml-sequence`. Chen `erd` is disabled in 0.2.8.
2. Declare an explicit, stable ID before each node kind: `api service`.
   `as` introduces only a matching-quoted rendered label:
   `api service as "API"`. Do not derive identity from visible text at parse
   time or generate an old kind-first declaration.
3. Use written endpoint order for connectors. A plain `api -> db` is valid in
   every profile. Put an explicit relation in a leading bare bracket item,
   such as `[reads]`, only when that relation is intended. Keep the rendered
   label separate: `api -> db [reads] as "lookup"`.
4. Use `id = statement` when a connector, arrangement, or supported sequence
   item needs an authored identity. A group gives each child a qualified ID:
   local `api` inside `sales` is `sales.api`. Inside the group, use `api` to
   address it; from elsewhere, use `sales.api`.
5. Retain the author's terms in labels and comments. Do not invent a symbol,
   relation, port, or connector end as a substitute for an unknown one.
   Malformed or unsupported text remains saveable; show diagnostics and ask
   for an explicit edit before changing its meaning.

## Document-local symbols

Language 1.3.0 in `packages/language/SPEC.md` is the joined authority.
Saved source defaults to 0.2.8; retain an explicit `@coralVersion "0.2.9"`
when using `@symbol` definitions and `[symbol: "local.<id>"]`. Preserve the
complete artwork block, metadata, anchor and port ownership. Use supplied or
explicitly requested artwork; do not invent a license, anchor or semantic port.
A selected local symbol has effective conformance `none`; artwork does not
certify notation meaning. Supported flowchart character output uses a labelled process-box fallback;
other symbol-bearing notations gain no character support.
The browser's built-in AI generation and voice features are deferred to 0.2.10;
this external authoring skill does not enable those application features.

## Examples

### Simple architecture

```coral
@diagram architecture
web service as "Web App"
api service as "API"
db database as "Database"
web -> api
api -> db [reads]
```

### Grouped services

```coral
@diagram architecture
payment group as "Payments" {
  validation service as "Validation"
  fraud service as "Fraud Detection"
  stripe service as "Stripe Integration"
  validation -> fraud
  fraud -> stripe
}
```

### UML class

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
state enum as "State"
order -- state [association]
```

### UML sequence

```coral
@diagram uml-sequence
user actor as "User"
app participant as "App"
ask = user -#> app as "sign in"
alt "valid" {
  ok = app -.-> user as "welcome"
} else "invalid" {
  no = app -.-> user as "denied"
}
note "Passwords are never logged" on app
```

## Editing and checking

Keep the original source bytes until the author requests an edit. A source
edit should preserve neighboring comments, quote choice, and authored IDs.
Use `coral_validate` for located syntax, integrity, and portability findings;
use the read-only `coral_check_conformance` tool for the full profile report.
`conformanceLevel` is saved as `none`, `typical` (default), or `strict`; a
request's `notificationLevel` filters notices independently. Neither a strict
finding nor an unsupported render capability should interrupt ordinary text
save or close.
