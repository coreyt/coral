# Embed Coral

Choose among six public packages, install only what your application needs, and
compose Coral's public APIs or standalone executables. Package version `0.2.17`,
Language Specification `1.3.0`, and saved source/header editions `0.2.8`,
`0.2.9`, `0.2.14`, and `0.2.17` are distinct.

## Choose a package

| Job | Package | Public entry points |
| --- | --- | --- |
| Parse, print, import, transpile Mermaid, diagnose, or repair Coral text | `@coral-viz/language` | root, `@coral-viz/language/parser`, `@coral-viz/language/printer`, `@coral-viz/language/formats` |
| Render SVG, HTML, or ASCII, compute geometry, or run the standalone CLI | `@coral-viz/render` | root, `@coral-viz/render/layout`, `@coral-viz/render/svg-layout`, executable `coral` |
| Render Coral source in an ordinary page without React/editor | `@coral-viz/browser` | root ESM, self-contained IIFE |
| Embed React editors and editing helpers | `@coral-viz/viz` | root, `@coral-viz/viz/editor`, `@coral-viz/viz/layout`, `@coral-viz/viz/text-editor` |
| Expose Coral tools to an MCP client | `@coral-viz/mcp-server` | executable `coral-mcp` |
| Add Coral syntax tooling | `tree-sitter-coral` | package main with `tree-sitter@0.25.1` |

`@graph-ir/core@0.2.4` is an external dependency used to validate GraphIR 3.0.
It is not one of Coral's six public packages.

## Quick start: CLI and MCP

Run the standalone Coral CLI directly via `npx` (`validate`, `render`,
`convert`):

```sh
npx -y --package=@coral-viz/render -- coral validate diagram.coral
npx -y --package=@coral-viz/render -- coral render --format svg diagram.coral > diagram.svg
npx -y --package=@coral-viz/render -- coral convert --from mermaid --to coral flow.mmd > flow.coral
```

Start the MCP stdio server directly via `npx`:

```sh
npx -y @coral-viz/mcp-server
```

## Generated reference

The [generated API reference](https://coreyt.github.io/coral/docs/api/) lists
public signatures and type shapes from the current built declarations, including
typed subpaths and character rendering. Its inventory also identifies browser
IIFE/metadata exports without type entries. The MCP entry has no library
functions; use its CLI guide. Tree-sitter retains its native `Parser.Language`
binding. The authored guides explain source preservation, examples, and
capability limits. Generated signatures alone do not establish runtime or
installed-package acceptance.

## Shared requirements

- Node.js 24.19.0 or newer is the consumer runtime for the five JavaScript
  packages. Coral 0.2.17 is built with Node 26.8.2 and npm 12.0.2.
- `@coral-viz/viz` has peers on React and React DOM 18.3 or 19 and
  `@xyflow/react` 12. Import the React Flow stylesheet once.
- `tree-sitter-coral` compiles a native addon from source. Python is required
  on every supported native-build platform. Linux/Unix also needs `make` and a
  C/C++ toolchain; macOS needs Xcode Command Line Tools; Windows needs Visual
  Studio C++ build tools. npm 12 consumers must approve its lifecycle script
  before installation.
- Coral 0.2.x APIs are additive against published 0.2.8. GraphIR's schema
  version is independent of the Coral package version. Existing GraphIR 1 and
  GraphIR 2 data must follow the named
  [GraphIR migration chain](reference/graphir-migration.md) before it reaches
  GraphIR 3 APIs.

## Install packages

Install matching Coral packages from npm with the exact published Core pin
`@graph-ir/core@0.2.4`:

```sh
npm install @graph-ir/core@0.2.4 @coral-viz/language @coral-viz/render
npm install @graph-ir/core@0.2.4 @coral-viz/browser
```

For managed environments using verified 0.2.17 archives, install matching local
tarballs together so Coral dependencies resolve to the same version. Archive
names identify inputs, not publication evidence.

For the canonical rendering chain:

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-language-0.2.17.tgz \
  ./coral-viz-render-0.2.17.tgz
```

For the React editor:

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-language-0.2.17.tgz \
  ./coral-viz-render-0.2.17.tgz ./coral-viz-viz-0.2.17.tgz \
  @xyflow/react@^12 react@^19 react-dom@^19
```

For browser rendering without React:

```sh
npm install @graph-ir/core@0.2.4 ./coral-viz-browser-0.2.17.tgz
```

The browser archive bundles its Coral language and rendering implementation.
Install the MCP server or grammar only when needed; their references give the
complete archive and native/client setup. Use the documentation matching an
older published package when maintaining that version.

## Start with a workflow

- [Render a diagram](how-to/render-a-diagram.md) for the full parse, validate,
  layout, SVG, and HTML chain.
- [Render in an ordinary browser page](how-to/render-in-a-browser.md) for ESM,
  the self-contained script, DOM scan, and custom element.
- [Embed the React editor](how-to/embed-the-react-editor.md) for React 18/19,
  converters, ownership, and sizing.

Reference owners: [Shared examples and editable
source](../use/how-to/start-from-an-example.md), [Language Specification
1.3.0](reference/language-specification-1.3.0.md), [Language evolution
policy](../contribute/reference/language-evolution.md).

## Related

- [Language API](reference/language-api.md)
- [Render API](reference/render-api.md)
- [MCP server](reference/mcp-server.md)
