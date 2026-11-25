# Unenforced Profile P prohibitions

This fixture is a negative control. Every construct below is prohibited by
Profile P and is NOT detected by `markdownlint-cli2` 0.23.2 with
`markdownlint` 0.41.1. The test asserts that this file lints clean, so that
the gap is recorded as a fact rather than assumed. If a later toolchain starts
reporting one of these, the test fails and the record must be revisited.

An HTML comment is prohibited by Profile P rule 2 and `MD033` reports only
elements:

<!-- this comment is invisible to MD033 -->

A VitePress container is prohibited by Profile P rule 9 and parses as
paragraph text:

::: tip
Container body.
:::

A table-of-contents token is prohibited by Profile P rule 9 and parses as
paragraph text:

[[toc]]

## A heading anchor suffix is prohibited by Profile P rule 9 {#custom-slug}

Root-absolute and extensionless link targets are also unenforced, but they are
deliberately not written here: `scripts/check-markdown-links.mjs` resolves
every inline target against the filesystem, so a fixture containing one would
fail `check:docs` with a misleading filesystem error rather than a clear
diagnosis. That behaviour is exactly what Appendix A6 of the design note
describes, and it is why the prohibition needs a `check:docs` extension rather
than a lint rule.
