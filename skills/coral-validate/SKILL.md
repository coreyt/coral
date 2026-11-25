---
name: coral-validate
description: Validate saved Coral source or GraphIR JSON without rewriting it
---

# /coral-validate

Use the `coral_validate` MCP tool to check saved Coral source for syntax,
references, portable GraphIR projection, and available model validation.
It also accepts GraphIR JSON as an explicitly separate input format.

## Usage

```text
/coral-validate path/to/diagram.coral
```

Or provide the exact source text. Coral source starts with a saved
`@diagram <type>` header and uses ID-first declarations. A missing header,
retired `@graph` header, or kind-first declaration is reported at its source
location. The tool never repairs or replaces the supplied text.

## Edition and portable boundaries

Language 1.3.0 documents default saved edition 0.2.8 and explicit 0.2.9.
For `@symbol` content, validate the exact definition, inherited/node-local ports
and artwork; do not infer semantic meaning from SVG. Selected local symbols
have effective conformance `none`, while integrity checks still apply.
`coral_validate` accepts raw GraphIR 4 for schema, catalog and artwork
validation. The editor and `coral_convert` still refuse raw GraphIR 4 input;
do not strip definitions into a GraphIR 3 display copy to bypass that boundary.

## Positive example

```coral
@diagram architecture
api service as "API"
db database as "PostgreSQL"
api -> db [reads]
```

This source has two declared nodes and one connector. A plain connector would
also be valid; `[reads]` is an explicit authored relation.

## Located reference example

```coral
// Example: unresolved target
@diagram architecture
api service as "API"
api -> missing
```

`coral_validate` reports `coral.reference.target.unresolved` at `missing`.
Keep this source saveable as text while the author decides how to repair it.

## Report handling

- Show every structured diagnostic with its code, severity, authored range,
  and any related location. Do not silently substitute an ID, symbol, port,
  relation, connector, or label.
- Treat a failed projection, unknown catalog, or unsupported capability as a
  refusal to verify portable meaning, not as a reason to block ordinary text
  save or close.
- `strict: true` makes warnings fail this validation request. It does not
  change the saved `conformanceLevel` or turn validation into a full notation
  conformance claim.
- For profile rules, run `coral_check_conformance` explicitly. Its full
  findings and unverified obligations are separate from the notice filter;
  partial 0.2.8 rule cards cannot certify full conformance.
