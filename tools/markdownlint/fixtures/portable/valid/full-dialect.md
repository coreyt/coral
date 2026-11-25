# Portable profile full dialect

This fixture exercises every construct Profile P permits. It must lint clean
under the root configuration, and it is the positive control for SP-R1 through
SP-R10.

## Prose and inline marks

Prose hard-wraps at eighty columns. Inline marks are limited to `code spans`,
*emphasis*, **strong emphasis**, and ~~strikethrough~~, all of which npm and
GitHub render identically.

## Links

Links are inline, relative, and keep the `.md` extension, as in
[the line-length fixture](../invalid/md013-long-line.md) and
[the exemption fixture](exemptions.md). A same-file fragment such as
[the tables section](#tables) resolves against a heading in this file.

## Lists

Unordered lists use a dash:

- first item
- second item
- third item

Ordered lists number sequentially from one:

1. first step
2. second step
3. third step

Task lists are a permitted GFM extension:

- [x] completed task
- [ ] outstanding task

## Tables

Tables carry leading and trailing pipes and a constant column count:

| Rule | Requirement | Enforced |
| --- | --- | --- |
| `MD013` | SP-R6 | yes |
| `MD054` | SP-R7 | partly |
| `MD041` | SP-R1, SP-R8 | yes |

## Fenced code

Fences are backtick-delimited and carry a bare language tag:

```ts
export const profile = 'portable';
```

```json
{ "default": false }
```

The file ends with exactly one trailing newline and contains no hard tabs and
no trailing spaces.
