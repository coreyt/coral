# @coral-viz/language

## Coral 0.2.14

Install verified 0.2.14 archives together with the matching published GraphIR
Core 0.2.4 dependency. The commands below use exact local archive names.
The root `parse` and `parseDocument028` read saved Coral source: default edition
0.2.8 and explicitly pinned 0.2.9.
Edition 0.2.9 adds document-local symbols and port labels/connection limits;
SVG admission and portable projection are separate render operations.
The graph-only reader remains on the explicit `@coral-viz/language/parser`
entry for deliberate interchange; it is not saved-source authority.

Portable Coral DSL parsing, deterministic printing, Mermaid/DOT/PlantUML
imports, diagnostics, and conservative syntax repair.

```sh
npm install ./graph-ir-core-0.2.4.tgz ./coral-viz-language-0.2.14.tgz
```

Saved 0.2.8 source includes the diagram type and declares each ID first:

```coral
@diagram architecture
api service as "API"
```

```javascript
import { HEADER_MANIFEST_028, parseDocument028 } from '@coral-viz/language';

const source = '@diagram architecture\napi service as "API"';
const trustedDigests = Object.fromEntries(
  Object.values(HEADER_MANIFEST_028['0.2.8']).flatMap((edition) =>
    edition.catalogs.map((catalog) =>
      [`${catalog.id}@${catalog.version}`, catalog.digest])));
const result = parseDocument028(source, {
  manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests,
});
if (result.header.diagnostics.length || result.syntax.diagnostics.length)
  throw new Error('Invalid Coral source');
```

Language Specification **1.3.0** owns syntax, meaning and declared entry-point
contracts. `CORAL_LANGUAGE_VERSION` exposes that identity independently of
package 0.2.14 and source/header editions 0.2.8, 0.2.9, and 0.2.14.
The TypeScript reader implements the saved contract; its optional GraphIR 3
staging view is not a complete portable successor projection.
`repairCoralDsl` byte-preserves parser-valid legacy input, reports every
applied fix, and leaves ambiguous defects unresolved. Review repaired source
before replacing authored text.

Public entries are the root plus `/parser`, `/sequence`, `/printer`, and `/formats`.
The narrow `/sequence` entry exposes structural UML sequence validation for
GraphIR consumers without loading the source parser.
Coral 0.2.9 exposes versioned `parseDocument028`,
`parseHeader028`, `prepareHeaderForSave028`, and `HEADER_MANIFEST_028` from the
root entry. These read the required source `@diagram` type, resolve optional
header fields through an exact installed catalog snapshot. The version-pin
helper inserts a pin only when explicitly called; ordinary editor save keeps
the authored source bytes. These APIs do not imply an installed GraphIR 4
package or complete recursive scene and conformance support.
The normative saved-source grammar is `spec/grammar-028.ebnf`, separate from
graph interchange in `spec/grammar.ebnf`, and is
exercised by parser tests. The native Tree-sitter grammar recognizes the saved
0.2.8/0.2.9 syntax and is checked against the runtime reader; semantic interpretation
and runtime diagnostics remain implemented by the TypeScript reader. `SPEC.md`
and the versioned `spec/` assets form the joined Language 1.3.0 contract, including
entry-point conformance, current support and exact schema/field dispositions.

See the
[Language Specification 1.3.0](https://coreyt.github.io/coral/docs/embed/reference/language-specification-1.3.0),
[Language API](https://coreyt.github.io/coral/docs/embed/reference/language-api)
and the executable
[rendering workflow](https://coreyt.github.io/coral/docs/embed/how-to/render-a-diagram).

Apache-2.0. See `LICENSE`.
