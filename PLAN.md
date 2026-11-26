# Active Plan

The active release is **Coral 0.2.15**, an editor interaction hotfix following
the immutable `0.2.14` release. The [release plan](dev/releases/0.2.15/plan.md)
records the approved behavior, source review, verification, and publication.

Properties starts closed and opens only on request. Pointer and keyboard
movement persist existing Coral coordinates, including a first move from
layout-managed placement. Source comments, grouping, connections, history,
saving, and reopening remain preserved. Repeated command-palette openings
restore focus to the current invoker.

The package version is independent of Language Specification `1.3.0` and
saved-source editions `0.2.8`, `0.2.9`, and `0.2.14`. Their catalogs and syntax
authorities remain unchanged. The build uses Node.js `26.8.2`, npm `12.0.2`,
and `@graph-ir/core@0.2.4`; published consumers retain Node.js `24.19.0` as
the minimum runtime.

Current [requirements](dev/requirements.md),
[architecture](dev/ARCHITECTURE.md), [roadmap](dev/ROADMAP.md), and
[contributor guidance](CLAUDE.md) remain authoritative. Coral markup is the
saved source authority.
