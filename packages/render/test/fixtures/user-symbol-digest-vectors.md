# User-symbol digest vectors

`user-symbol-digest-vectors.json` holds the shared digest vectors for
GraphIR 4 document-symbol definitions, Slice 60 delivery step C0a. The digest
rules are in section 8 of the
[GraphIR proposal](../../../../dev/designs/proposed-graphir-changes-for-coral.md#8-add-a-document-symbol-catalog),
and decision GQ-4 makes this the only digest of a user-symbol definition.
The vectors are portable: they depend on no Coral code and no SVG serializer,
and artwork `text` is taken as given. Step G3 copies them into the GraphIR
specification, and Coral's digest and `@graph-ir/core`'s exported digest both
reproduce them.

## Vector fields

| Field | Meaning |
| --- | --- |
| `name` | Unique vector name |
| `covers` | Rule categories the vector exercises |
| `description` | What the vector shows |
| `sameDigestAs` | Optional; a vector whose digest must be equal |
| `differentDigestFrom` | Optional; a vector whose digest must differ |
| `definition` | The GraphIR form of the definition, including its `digest` member |
| `canonicalInput` | The RFC 8785 canonical JSON of the digest input |
| `digest` | `sha256:` and the lowercase hex SHA-256 of the UTF-8 bytes of `canonicalInput` |
| `error` | `DOCUMENT_SYMBOL_DIGEST_UNCOMPUTABLE` or `DOCUMENT_SYMBOL_DIGEST_INPUT_INVALID` instead of `canonicalInput` and `digest` |
| `path` | With `DOCUMENT_SYMBOL_DIGEST_INPUT_INVALID` only; the RFC 6901 pointer to the refused member |

A computable vector's `definition.digest` equals its expected digest, except
in `stale-digest-member-removed`, which shows that the member never enters the
digest input. A vector that expects an error carries an all-zero placeholder
digest.

## Rules the vectors pin

- The `digest` member is removed. `labelSide: "below"`,
  `outline: "rectangle"` and `tint: "none"` are removed, and no other member
  is removed. An explicit port anchor such as `{"kind": "auto"}` keeps its
  presence, and nothing inside a port's `properties` changes.
- `tags` sort by code point, and `anchors` and `ports` sort by `id` in code
  point order. RFC 8785 sorts member names by UTF-16 code units instead, so
  U+1F600 sorts before U+FB33 as a member name but after it as a tag or ID.
- Strings are not Unicode-normalized, so NFC and NFD spellings differ.
- A lone surrogate anywhere in the definition, including member names inside
  `properties`, makes the digest uncomputable.
- An empty `tags`, `anchors` or `ports` array and an empty `provenance` object
  are schema-invalid. They are refused before canonicalization with
  `DOCUMENT_SYMBOL_DIGEST_INPUT_INVALID`, so callers that skip schema
  validation never compute a digest for them. The refusal takes precedence
  over an uncomputable string elsewhere in the definition. The code name is
  Coral's; the GraphIR specification reports these inputs as schema errors.
- Control characters U+0000 to U+001F serialize as `\b`, `\t`, `\n`, `\f`
  and `\r`, or otherwise as lowercase `\u00XX`, whatever escape spelling the
  source used.

## Editing the file

The `definition` objects keep authored number spellings such as `-0`, `1E21`
and `2.0`, and escaped lone surrogates. A JSON formatter that re-serializes
the file loses them, so edit it as text. `canonicalInput` escapes every
non-ASCII character as `\uXXXX` so that invisible differences stay visible.

Each `canonicalInput` was written by hand, independently of the
canonicalization library, and each `digest` was computed from it with
`node:crypto`. The tests in `../userSymbolDigest029.test.ts` re-check every
digest with `node:crypto` and require `@graph-ir/core`'s
`computeDocumentSymbolDigest`, the only digest Coral uses, to reproduce every
canonical input and digest.

## Libraries and runtime support

`@graph-ir/core` 0.2.4 computes the digest with two exact-pinned libraries. Both
fit the platforms that
[ENG-04](../../../../dev/requirements/engineering-constraints.md#eng-04-cross-platform-support-matrix-honesty)
(legacy `R-050`) names: Chrome desktop is supported, Edge, Safari and Firefox
desktop are experimental, and packages run under Node.js 24.19.0 and later.

| Library | Use | Runtime requirement | Fit with R-050 |
| --- | --- | --- | --- |
| `canonicalize` 5.1.0 | RFC 8785 canonical JSON | `String.prototype.isWellFormed` (ES2024: Chrome 111, Safari 16.4, Firefox 119, Node.js 20); `engines.node` `>=22` | Within supported Chrome and Node.js 24.19.0; the experimental browsers' current releases have it |
| `@noble/hashes` 2.4.0 | Synchronous SHA-256 | `TextEncoder` and `Uint8Array`; `engines.node` `>= 20.19.0` | Within every named browser and Node.js 24.19.0 |
