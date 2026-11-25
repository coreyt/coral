---
title: Converting between formats
outline: deep
---

Coral converts between its own DSL and Mermaid flowcharts without losing
graph metadata, layout options, or stable edge identifiers.

::: tip
Conversion is lossless in both directions for the supported subset.
:::

## Convert on the command line {#cli}

```bash:line-numbers
npx coral convert diagram.mmd --to coral
```

## Convert in the editor {#editor}

Press <kbd>Ctrl</kbd> and <kbd>Shift</kbd> and <kbd>C</kbd>.

::: code-group

```js [convert.js]
import { convert } from '@coral-viz/convert';
```

```ts [convert.ts]
import { convert } from '@coral-viz/convert';
```

:::

## Limits {#limits}

::: warning
An unsupported Mermaid directive is dropped rather than approximated.
:::

- Subgraph nesting is flattened.
- Class definitions are not carried across.

See [the CLI section](#cli), [the editor section](#editor), and
[the containers page](./containers.md).
