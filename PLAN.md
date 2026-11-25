# Active Plan

The active release is **Coral 0.2.14** (intentionally skipping `0.2.13`) —
advancing rendering quality (`>= 95 / 100` empirical bar), expressive
presentation (`anemone`/`ane` and `parrotfish` alongside basic monochrome
`lowfi`/`hifi`), and intuitive edition `0.2.14` diagram notations. The
[0.2.14 release plan](dev/releases/0.2.14/plan.md) records the locked owner
decisions, HITL notation approvals, slice breakdown, and verification gates.

Coral 0.2.14 expands `@diagram block` into freeform boxes-and-arrows, overhauls
`@diagram architecture` for C4-grade system design, introduces dedicated cloud
`@diagram infrastructure`, and revives `@diagram erd` with Crow's Foot notation
while retiring Chen. It ships all six public npm packages, the online diagram
editor, and the documentation site from `coreyt/coral`.

Current [requirements](dev/requirements.md),
[architecture](dev/ARCHITECTURE.md), [roadmap](dev/ROADMAP.md), and
[contributor guidance](CLAUDE.md) remain authoritative. Coral markup is the
saved source authority. The release uses `@graph-ir/core@0.2.4`,
Node.js 26.8.2 and npm 12.0.2 as the build toolchain, and Node.js 24.19.0 as
the minimum published package runtime.
