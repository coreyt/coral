# Tree-sitter grammar

Use `tree-sitter-coral` for native syntax trees, queries, and editor tooling,
not as Coral's runtime or semantic parser.
Coral 0.2.9 follows the 0.2.8 compatibility baseline. Its package version is
distinct from default saved source edition 0.2.8, explicit edition 0.2.9 and
Language Specification 1.3.0. Historical `tree-sitter-coral@0.2.6`
has an earlier grammar; use that edition’s documentation for that package.

| Concern | Contract |
| --- | --- |
| Package | `tree-sitter-coral@0.2.15` archive with peer `tree-sitter@0.25.1` |
| Build | Native addon compiled from source during install |
| Syntax | Saved `@diagram` documents, ID-first declarations, keyed fields, ports, and recursive UML sequence blocks |
| Not owned | semantic references, capabilities, canonicalization, repair, and rich diagnostics |

## Native installation

The package doesn't ship prebuilt binaries. Python is required on every
supported native-build platform. Linux/Unix also needs `make` and a C/C++
toolchain; macOS needs Xcode Command Line Tools; Windows needs Visual Studio
C++ build tools.

Before installing with npm 12, approve the native lifecycle scripts in the
consumer's root `package.json`:

```json
{
  "allowScripts": {
    "tree-sitter-coral": true,
    "tree-sitter": true
  }
}
```

Then install the verified 0.2.15 archive and exact peer version:

```sh
npm install ./tree-sitter-coral-0.2.15.tgz tree-sitter@0.25.1
```

## Parse Coral

```coral
@diagram architecture
api service as "API"
```

```js
import Parser from 'tree-sitter';
import Coral from 'tree-sitter-coral';

const parser = new Parser();
parser.setLanguage(Coral);
const tree = parser.parse('@diagram architecture\napi service as "API"');
if (tree.rootNode.hasError) throw new Error(tree.rootNode.toString());
```

The 0.2.9 package grammar recognizes saved editions 0.2.8 and explicit 0.2.9,
including raw `@symbol`
blocks, labels,
semantic ports, connector ends, styles, groups, arrangements, UML class
members, and recursive UML sequence fragments, notes, and activations. Use
the edition-aware TypeScript reader to resolve references and report semantic
diagnostics. Tree-sitter syntax acceptance alone does not verify GraphIR
meaning.

Reference owners: [Language Specification
1.3.0](language-specification-1.3.0.md), [Language evolution
policy](../../contribute/reference/language-evolution.md).

## Related

- [Language API](language-api.md)
- [Embed Coral](../index.md)
- [Coral DSL](../../use/reference/coral-dsl.md)
