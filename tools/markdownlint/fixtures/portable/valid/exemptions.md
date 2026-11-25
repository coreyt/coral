# Portable profile line-length exemptions

This fixture exercises every exemption Profile P rule 6 grants to the
eighty-column wrap. It must lint clean.

## A heading that is itself deliberately far longer than eighty columns so that the heading exemption is exercised

Tables are exempt, so a wide row is permitted:

| Rule identifier | Requirement identifier | Option that carries the exemption |
| --- | --- | --- |
| `MD013` | SP-R6 | `headings`, `tables`, and `code_blocks` are all set to false |

Fenced code is exempt, so a wide code line is permitted:

```ts
export const wide = 'this fenced code line is deliberately far longer than eighty columns';
```

A standalone line containing only a link is exempt:

[a deliberately long descriptive link text that carries this standalone line well past eighty columns](full-dialect.md)

A line whose overflow contains no whitespace is exempt:
this-single-token-runs-past-the-eightieth-column-without-any-whitespace-at-all-so-it-is-permitted
