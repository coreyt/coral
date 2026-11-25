# Migrate GraphIR 1 and 2 data to GraphIR 3

Coral 0.2.6 uses `@graph-ir/core@0.2.2` and accepts validated GraphIR 3.0 at
its public GraphIR boundaries. Coral 0.2.5 used core 0.2.1 and GraphIR 2.0.
This is historical 0.2.6 GraphIR API guidance. Use the matching package
version for these adapters. For the Coral 0.2.9 saved-source reader,
see
the [language API](language-api.md); migration does not create authored Coral.

## GraphIR 1 to GraphIR 2 {#graphir-1-to-2}

Use the core package's named `migrateIR` adapter at the load boundary. A
successful first migration returns a GraphIR 2 value. Pass that exact result
to `migrateGraphIR2To3`; only the validated GraphIR 3 result crosses the
language, render, viz, or MCP boundary.

<<< ../examples/graphir-migration.ts

GraphIR 1 `routingPoints` are ambiguous: points do not say whether their
coordinates are absolute, relative, or anchored. Migration therefore refuses
them by default. If discarding that geometry is acceptable, opt in explicitly
with `ambiguousGeometry: 'drop'` and inspect the returned losses before using
the migrated graph.

GraphIR 2 replaces `routingPoints` with authored `routeIntent`, narrows
`GraphIR.version` to `2.0.0`, and removes `LayoutOptions.algorithmOptions`.
Migration does not invent route intent or algorithm-specific meaning that was
not present in the source. Keep the migration at an explicit trust boundary;
do not cast a GraphIR 1 object to GraphIR 2.

## GraphIR 2 to GraphIR 3 {#graphir-2-to-3}

Use `migrateGraphIR2To3` for every GraphIR 2 value. The result records stable,
path-specific changes, losses, and diagnostics. It maps recognized notation
profiles, legacy arrows, unambiguous classifier members, and sequence order;
ambiguous members or invalid references fail rather than being guessed. Do not
change only the `version` field or cast a GraphIR 2 object to GraphIR 3.

## Compatibility boundary

Published Coral 0.2.5/core 0.2.1/schema 2 is the comparison baseline. The
reviewed core 0.2.2/schema 3 transition is the only approved GraphIR public
transition for Coral 0.2.6; unrelated Coral APIs remain compatible.
