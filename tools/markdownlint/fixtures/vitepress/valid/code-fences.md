# Code fences

A plain language tag:

```json
{ "notation": "archimate" }
```

Single-line highlighting:

```js{2}
const graph = load();
const laid = layout(graph);
```

A highlight range and a list:

```ts{1,3-4}
const a = 1;
const b = 2;
const c = 3;
const d = 4;
```

Line numbers:

```bash:line-numbers
npm run verify
```

Line numbers with an offset and highlighting:

```js:line-numbers=2 {1,3}
const a = 1;
const b = 2;
const c = 3;
```
