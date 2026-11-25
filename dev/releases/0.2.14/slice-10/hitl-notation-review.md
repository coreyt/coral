# Slice 10: Mandatory HITL Source Notation Review (Edition `0.2.14`)

Status: **awaiting human-in-the-loop (HITL) approval** (`2026-11-24`).

Per [CLAUDE.md](../../../../CLAUDE.md), every change to Coral source syntax,
spellings, canonical printed text, or diagnostics requires human before/after
review *before* implementation. All existing `0.2.8` and `0.2.9` documents
remain 100% valid and unchanged; these proposals ship under saved-source
edition **`0.2.14`** (Language Specification `1.4.0`).

---

## Proposal N1: Complete Intuitive Type Words (Eliminate `[symbol: "..."]`)

Expand `approvedTypeWords` across all notations so every bundled symbol is
directly writable by an intuitive lowercase/camelCase/hyphenated kind word
(lifting Vocabulary Directness from `24.2%` to `>= 98%`).

### Before (`0.2.12`)

```coral
@diagram aiml
dataset dataset [symbol: "aiml-dataset"] as "Dataset"
training training [symbol: "aiml-training"] as "Training"
model model [symbol: "aiml-model"] as "Model"
datasetTraining = dataset -> training [training]
```

### After (`0.2.14`)

```coral
@diagram aiml
@coralVersion "0.2.14"
dataset dataset as "Dataset"
training training as "Training"
model model as "Model"
dataset -> training [training]
```

### Canonical Printed Output & Diagnostics

- **Canonical print:** Preserves authored concise kind word (`training`,
  `model`, `queue`, `cloud`, etc.); never injects redundant `[symbol: "..."]`
  when the type word maps uniquely to the symbol.
- **Diagnostics:** Explicit `[symbol: "..."]` remains valid for overrides and
  `local.<id>` custom symbols. Unmapped unknown type words still produce a
  generic node with a non-blocking notice under `strict` conformance.

---

## Proposal N2: Expanded `@diagram block` (Boxes & Arrows) + Node `[style: ...]`

Expand `@diagram block` with clean geometric primitives (`box`, `rounded`,
`circle`, `oval`, `triangle`, `diamond`, `cylinder`, `pill`, `note`, `group`;
`block` remains an alias for `box`) and allow `[style: ...]` on nodes using the
exact same grammar already shipped on edges (color, fill/stroke tint, line
pattern `solid`/`dashed`/`dotted`, weight `regular`/`thick`).

### Before (`0.2.12`)

```coral
@diagram block
input block as "Sensor Input"
amp block as "Gain Stage"
alert block as "Threshold Alert"
e1 = input -> amp [flow] as "raw"
e2 = amp -> alert [flow] as "spike"
```

*(Impossible in `0.2.12` to draw circles, triangles, diamonds, or colored
emphasis boxes inside `@diagram block`.)*

### After (`0.2.14`)

```coral
@diagram block
@coralVersion "0.2.14"
input circle as "Sensor Input"
filter box as "Noise Filter"
amp triangle [style: "blue"] as "Gain Stage"
alert diamond [style: "red, dashed"] as "Threshold Alert"
store cylinder as "Telemetry Store"
input -> filter as "raw"
filter -> amp as "clean"
amp -> alert [style: "red, dashed"] as "spike"
amp -> store as "archive"
```

### Canonical Printed Output & Diagnostics

- **Canonical print:** Preserves geometric kind (`circle`, `triangle`, etc.)
  and canonicalizes node `style:` dimensions identically to edge `style:`
  (single bare term/hex or double-quoted comma recipe).
- **Diagnostics:** Reuses existing edge-style diagnostics on nodes
  (`coral.style.dimension.duplicate`, `coral.style.term.unknown`); edition
  `0.2.8`/`0.2.9` documents using node `style:` receive a located edition
  diagnostic (`coral.node.style.edition`) rather than silent acceptance.

---

## Proposal N3: C4-Grade `@diagram architecture` + Structured Card Metadata

Upgrade `@diagram architecture` with C4 system-design type words (`person`,
`system`, `externalSystem`, `container`, `component`, `database`, `queue`,
`boundary`, `systemBoundary`, `containerBoundary`, keeping `actor` and
`service` as first-class compatible words) plus optional structured metadata
keys on nodes (`technology: "..."`, `description: "..."`) and edges
(`technology: "..."` or `protocol: "..."`).

### Before (`0.2.12`)

```coral
@diagram architecture
shopper actor as "Shopper"
stripe service [symbol: "arch-external-api"] as "Stripe Payments"
platform group as "E-Commerce System" {
  web service [variant: "web"] as "Web Storefront"
  api service [variant: "gateway"] as "API Gateway"
  db database [variant: "sql"] as "Orders Database"
}
e1 = shopper -> platform.web [sync] as "Browses catalog"
e2 = platform.web -> platform.api [sync] as "Calls REST API"
e3 = platform.api -> platform.db [data] as "Reads/writes"
e4 = platform.api -> stripe [sync] as "Charges card"
```

### After (`0.2.14`)

```coral
@diagram architecture
@coralVersion "0.2.14"
shopper person [description: "Buys products online"] as "Shopper"
stripe externalSystem [description: "Processes credit card payments"] as "Stripe Payments"
platform systemBoundary as "E-Commerce System" {
  web container [technology: "React SPA", description: "Catalog and cart UI"] as "Web Storefront"
  api container [technology: "Kong / HTTPS", description: "Auth and routing"] as "API Gateway"
  db database [technology: "PostgreSQL", description: "Orders and invoices"] as "Orders Database"
}
shopper -> platform.web [protocol: "HTTPS"] as "Browses catalog"
platform.web -> platform.api [protocol: "JSON / HTTPS"] as "Calls REST API"
platform.api -> platform.db [data, protocol: "SQL"] as "Reads/writes"
platform.api -> stripe [protocol: "HTTPS"] as "Charges card"
```

### Canonical Printed Output & Diagnostics

- **Canonical print:** Bracket fields print in canonical order:
  `symbol`, `variant`, `technology`, `description`, `style`,
  `conformanceException` on nodes; bare/keyed `type`, `protocol`/`technology`,
  `firstPort`, `secondPort`, `firstEnd`, `secondEnd`, `firstLabel`,
  `secondLabel`, `style` on edges.
- **Diagnostics:** Duplicate `technology`/`description`/`protocol` keys emit
  located duplicate-field errors; `protocol` and `technology` on the same edge
  cannot coexist (located conflict error); empty quoted values warn cleanly.

---

## Proposal N4: New `@diagram infrastructure` (AWS, Azure, GCP & Cloud)

Introduce dedicated `@diagram infrastructure` separate from `architecture`.
Supports:

- **Nested cloud boundaries:** `cloud`, `account`, `subscription`, `project`,
  `region`, `az`, `vpc`, `vnet`, `subnet` (with `[variant: "public" | "private"]`),
  `cluster`, `securityGroup`.
- **Cloud-infrastructure node kinds (zero symbol overload):** `users`, `cdn`,
  `dns`, `waf`, `firewall`, `gateway`, `loadBalancer`, `compute`, `vm`,
  `container`, `kubernetes`, `function`, `database`, `nosql`, `cache`,
  `storage`, `blockStorage`, `queue`, `eventBus`, `iam`, `secrets`,
  `monitoring`, `ml`.
- **Optional provider accent & service label:** `[provider: "aws" | "azure" |
  "gcp" | "generic", technology: "ECS Fargate", ...]` — and full support for
  official AWS/Azure/GCP SVG icons via `@symbol` (`[symbol: "local.aws_ec2"]`)
  converted by `scripts/convert-cloud-icons.mjs`.

### Before (`0.2.12`)

*(No `@diagram infrastructure`; authors had to fake VPCs inside `architecture`
with plain black rectangles and `[symbol: "arch-load-balancer"]` hexagons.)*

### After (`0.2.14`)

```coral
@diagram infrastructure
@coralVersion "0.2.14"
users users as "Internet Users"
cf cdn [provider: "aws", technology: "CloudFront"] as "Edge CDN"
s3 storage [provider: "aws", technology: "Amazon S3"] as "Static Assets"
vpc vpc [provider: "aws", technology: "10.0.0.0/16"] as "Production VPC" {
  pub subnet [variant: "public"] as "Public Subnet" {
    alb loadBalancer [provider: "aws", technology: "ALB"] as "Load Balancer"
  }
  priv subnet [variant: "private"] as "Private App Subnet" {
    api container [provider: "aws", technology: "ECS Fargate"] as "Orders API"
    sqs queue [provider: "aws", technology: "Amazon SQS"] as "Job Queue"
    worker container [provider: "aws", technology: "ECS Fargate"] as "Worker"
  }
  data subnet [variant: "private"] as "Private Data Subnet" {
    rds database [provider: "aws", technology: "RDS Aurora"] as "Orders DB"
    redis cache [provider: "aws", technology: "ElastiCache"] as "Session Cache"
  }
}
users -> cf [protocol: "HTTPS"]
cf -> s3 as "Static"
cf -> vpc.pub.alb as "Origin"
vpc.pub.alb -> vpc.priv.api [protocol: "HTTP"]
vpc.priv.api -> vpc.data.rds [data, protocol: "SQL"]
vpc.priv.api -> vpc.data.redis [data]
vpc.priv.api -> vpc.priv.sqs [async] as "Enqueue"
vpc.priv.sqs -> vpc.priv.worker [async] as "Poll"
vpc.priv.worker -> vpc.data.rds [data] as "Update"
```

### Canonical Printed Output & Diagnostics

- **Canonical print:** Preserves `provider`, `technology`, `description`, and
  nested boundary declarations in authored order.
- **Diagnostics:** Invalid `provider` value emits located
  `coral.infrastructure.provider.unknown`; unknown `infrastructure` types in
  edition `0.2.8`/`0.2.9` refuse with located edition diagnostic.

---

## Proposal N5: Revived `@diagram erd` (Crow's Foot; Chen Retired)

Re-enable `@diagram erd` under edition `0.2.14` with modern Crow's Foot entity
tables, ergonomic cardinality operators, and edge endpoint labels (`DRQ-21`):

- **Entity table `columns { ... }` compartment:**
  `column_line = identifier, hspace, type_name, [ "[", column_flag, ... "]" ]`
  where `column_flag = "pk" | "fk" | "uk" | "null" | "not null"`.
- **Ergonomic Crow's Foot cardinality connectors** (solid `--` = identifying,
  dashed `-.-` = non-identifying; 1:1 mapping onto existing GraphIR
  `firstEnd`/`secondEnd` markers `one`, `zeroOrOne`, `oneOrMany`,
  `zeroOrMany`):
  - First-end (left): `||` (`one`), `|o` (`zeroOrOne`), `}|` (`oneOrMany`),
    `}o` (`zeroOrMany`)
  - Second-end (right): `||` (`one`), `o|` (`zeroOrOne`), `|{` (`oneOrMany`),
    `o{` (`zeroOrMany`)
  - Examples: `||--o{`, `||--|{`, `|o--o{`, `||-.-o{`, `}o--||`
- **Edge endpoint labels (`DRQ-21`):** `[firstLabel: "1", secondLabel: "0..*"]`.

### Before (`0.2.12`)

```coral
@diagram erd
// ERROR: diagram type "erd" is disabled in edition 0.2.8 / 0.2.9
```

*(Even if enabled, Chen notation forced every column to be a separate
`attribute` node connected by an edge, and cardinality required verbose
`users -- orders [firstEnd: one, secondEnd: zeroOrMany] as "places"`.)*

### After (`0.2.14`)

```coral
@diagram erd
@coralVersion "0.2.14"
users entity as "Users" {
  columns {
    id uuid [pk]
    email varchar [uk, not null]
    full_name varchar
    created_at timestamp [not null]
  }
}
orders entity as "Orders" {
  columns {
    id uuid [pk]
    user_id uuid [fk, not null]
    status varchar [not null]
    total_cents decimal [not null]
  }
}
order_items entity as "Order Items" {
  columns {
    id uuid [pk]
    order_id uuid [fk, not null]
    quantity int [not null]
  }
}
users ||--o{ orders as "places"
orders ||--|{ order_items as "contains"
```

### Canonical Printed Output & Diagnostics

- **Canonical print:** Prints Crow's Foot operators directly (`||--o{`,
  `||--|{`, `||-.-o{`); keys in column brackets print in canonical order
  (`pk`, `fk`, `uk`, `not null` / `null`).
- **Diagnostics:** Legacy Chen kinds (`relationship`, `attribute`, `isa`) in
  edition `0.2.14` emit a clear migration notice (`coral.erd.chen.retired`)
  explaining Crow's Foot entity tables and connectors. Duplicate column names
  within an entity emit `coral.erd.column.duplicate`. Conflicting keyed
  `firstEnd`/`secondEnd` vs. Crow's Foot operator emit the existing
  connector-conflict error.

---

## Proposal N6: Grammar Symmetry & Friction Removal

Fix four small syntactic asymmetries measured in the Slice 10 scorecard:

1. **Hyphenated node kinds and edge types:** Allow internal hyphens in
   `node_kind` and `edge_type` (e.g., `data-flow`, `tool-use`, `stream-flow`,
   `load-balancer`) — resolves the long-standing `aiml` and `data-engineering`
   HITL gate in `supported-diagram-types.md`.
2. **Dashed reverse and bidirectional connectors:** Admit `<-.-`, `<-.--`,
   `<-.->`, `<-.-->` alongside `<--` and `<-->`.
3. **Unnamed UML attribute visibility symmetry:** Allow `-`, `#`, and `~` on
   unnamed class attributes (`- id: UUID`) matching unnamed operations
   (`+`, `-`, `#`, `~`).
4. **Optional unnamed edges without mandatory `[type]`:** Already supported by
   the grammar for unnamed edges (`a -> b`), and now canonical examples and
   writers omit boilerplate `e1 =` and redundant default `[flow]`/`[sync]`
   unless the edge is referenced by a `route` or overrides the default style.

### Before (`0.2.12`)

```coral
// Rejected in 0.2.12:
a -> b [data-flow]            // syntax error: hyphen in bare_type
a <-.-> b                     // syntax error: dashed bidirectional unsupported
class Foo { attributes { - id: UUID } } // syntax error: only + allowed
```

### After (`0.2.14`)

```coral
@coralVersion "0.2.14"
a -> b [data-flow]            // valid: hyphenated relation type
a <-.-> b as "syncs"          // valid: dashed bidirectional connector
class Foo { attributes { - id: UUID } } // valid: full visibility parity
```

### Affected Diagnostics

- Edition `0.2.8` / `0.2.9` documents continue to diagnose hyphenated types,
  dashed bidirectional connectors, and `-`/`#`/`~` unnamed attributes with
  located edition diagnostics so existing conformance tests remain 100% intact.

---

## HITL Decision Checklist

Please reply to approve (or request adjustments on) Proposals **N1–N6** above:

- [ ] **N1:** Complete `approvedTypeWords` across all notations
- [ ] **N2:** Expanded `@diagram block` primitives + node `[style: ...]`
- [ ] **N3:** C4-grade `@diagram architecture` + `technology` / `description` /
  `protocol`
- [ ] **N4:** Dedicated `@diagram infrastructure` + `provider` + two-layer cloud
  icons (built-in Apache-2.0 glyphs + official AWS/GCP/Azure `@symbol`
  converter)
- [ ] **N5:** Crow's Foot `@diagram erd` (`columns { ... }`, `||--o{` operators,
  endpoint labels, Chen retired)
- [ ] **N6:** Grammar symmetry fixes (hyphens, `<-.->`, `-/#/~` attributes,
  concise default edges)
