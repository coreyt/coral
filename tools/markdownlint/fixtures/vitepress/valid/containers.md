# Containers

Every approved VitePress container type appears below.

::: tip
Layout options are preserved across a format conversion.
:::

::: info Conversion scope
Mermaid flowcharts convert to Coral DSL and back.
:::

::: warning
Switching formats converts the current graph in place.
:::

::: danger Destructive
Clearing local storage removes every unsaved document.
:::

::: details Why ports are stable
Edge ports are keyed by identifier so that a re-layout does not move them.
:::

::: code-group

```js [coral.config.js]
export default { notation: 'archimate' };
```

```ts [coral.config.ts]
export default { notation: 'archimate' };
```

:::

The document continues after the containers.
