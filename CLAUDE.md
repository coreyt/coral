# Coral Contributor Guidance

Documentation changes follow the durable
[Coral documentation authoring style](dev/documentation-style.md).

Use [requirements](dev/requirements.md), [architecture](dev/ARCHITECTURE.md),
the [roadmap](dev/ROADMAP.md), and the [active plan](PLAN.md) as the current
project authorities. `PLAN.md` names the active release and links its release
plan.

The active release is **0.2.12** ([release plan](dev/releases/0.2.12/plan.md)),
preparing the clean public open-source launch of `coreyt/coral` with all six
npm packages, live documentation, and the hosted diagram editor.

Published releases are immutable. Active implementation belongs on the
`release/<version>` branch for the release named in `PLAN.md`. Keep release
work off `main`, and verify the active branch with `git branch --show-current`.

The release toolchain is exactly Node.js 26.8.2 and npm 12.0.2. Run
`npm run check:toolchain` before release validation, then use `npm run verify`
and the additional gates in the active plan. Published packages retain
Node.js 24.19.0 as their minimum runtime; their exact Node 26-built artifacts
are tested separately under Node 24. TypeScript stays at 6.0.3 and public Node
types stay on 24.x for the 0.2.x line. TypeScript 7 and Node 26 types remain
0.3.0 work.

Changes to Coral source notation require a before/after review with a human
in the loop (HITL) before implementation. Source notation means the syntax and
spellings people read and write, and the canonical text the printer and
editor produce. The review shows representative source before and after the
change, the printed canonical output, and the affected diagnostics. An agent
review does not satisfy this gate.

Coral owns diagram authoring, format conversion, layout, rendering, and the
editor. Repository discovery, workspace ownership, and codebase-specific tools
are outside Coral; preserve that boundary in requirements and public APIs.

## AI tooling directories

- `skills/` and `agents/` hold Coral's public agent skills and agent
  definitions (also exposed through `.claude-plugin/`).
- `.claude/` holds optional Claude Code workspace settings, hooks, and
  project-local skills.
- `skills/` and `.claude/skills/` are independent tooling surfaces; neither is
  canonical for the other, and changes are not implicitly synchronized between
  them.
