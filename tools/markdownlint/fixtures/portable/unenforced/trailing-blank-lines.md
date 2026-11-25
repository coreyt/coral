# Unenforced trailing blank lines

Profile P rule 10 requires exactly one trailing newline. `MD047` reports only a
missing one: `md047.mjs` passes as soon as the last line is blank, so this file
ends with two extra blank lines and lints clean. `MD012` would catch it but
also forbids mid-document blank pairs, which Profile P does not mention, so it
is not enabled. The gap is recorded rather than hidden.


