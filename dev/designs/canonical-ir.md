# Canonical IR Design

`@graph-ir/core` owns `GraphIR`, node/edge types, schema validation, migration,
and semantic reference checks. Coral re-exports those types for compatibility;
it does not fork them. Coral 0.2.9 pins registry Core `0.2.3` exactly. The
[Language 1.2.0 specification](../../packages/language/SPEC.md) owns source and
representation mappings, including independently pinned GraphIR 3 release and
GraphIR 4 candidate schemas/types. The candidate is not a tagged GraphIR 4
release. The [current architecture](../ARCHITECTURE.md#source-portable-meaning-and-display)
distinguishes exact source, optional staging, portable meaning and display.

Coral emits authored GraphIR `version: "3.0.0"`. Named ingestion adapters
migrate GraphIR 1 through the existing 1-to-2 policy and then cross the
published `migrateGraphIR2To3` boundary. Direct GraphIR 2 input uses that same
2-to-3 boundary. A cast or version relabel is not migration, and unknown future
versions remain errors. This migration description applies to deliberate graph
interchange. Saved `@diagram` edition 0.2.8 is a different reader contract; it
projects typed successor meaning separately and never saves a display carrier
over authored text. Language and document/schema versions remain independent.

External consumers may attach domain data through GraphIR properties/metadata. Coral treats that data as opaque rendering input and does not acquire repository-indexing responsibilities.

Published Coral 0.2.4/core 0.2.0 used
`edge.properties.description` as a string convention because GraphIR 1 did not
declare a top-level edge description. Authored GraphIR 2 declared the top-level
field, and GraphIR 3 adds portable notation profiles, structured classifier
items, relationship ends, and interaction entities. The explicit migration
boundaries preserve old conventions without pretending that they were part of
the old typed contracts. Coral syntax that cannot represent a GraphIR 3 field
reports attributable loss instead of silently dropping authored meaning.
Further extension-contract changes still require coordinated type, schema,
diff, documentation, and consumer evidence.
