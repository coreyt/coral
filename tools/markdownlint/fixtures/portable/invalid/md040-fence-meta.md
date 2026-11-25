# MD040 VitePress fence meta

VitePress spells line highlighting with no space before the brace, which parses
as a single info token and emits no meta token. Only `allowed_languages`
rejects it. SP-R9.

```ts{1,3}
const first = 1;
const second = 2;
const third = 3;
```

Body text.
