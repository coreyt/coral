# Improvement Opportunities

Track technical debt, enhancement opportunities, and observations here.

## Format

```markdown
## [Category] Brief description
- **Context**: Where this was noticed
- **Suggestion**: What could be improved
- **Priority**: Low/Medium/High
- **Date**: When noticed
```

## Categories

- **Agent/Skill Improvements** - Better prompts, missing capabilities
- **Test Fixtures** - Missing test cases, coverage gaps
- **Architectural Improvements** - Refactoring, pattern violations
- **Documentation Gaps** - Unclear specs, missing examples
- **Cross-Project Opportunities** - Code to move to graph-ir-tools

---

## [Infrastructure] Missing monorepo setup
- **Context**: Initial exploration of repository
- **Suggestion**: Create package.json, pnpm-workspace.yaml, TypeScript config to enable development
- **Priority**: High
- **Date**: 2026-01-29

## [Infrastructure] No test framework configured
- **Context**: TDD workflow requires test infrastructure
- **Suggestion**: Set up Vitest with workspace support, create initial test fixtures
- **Priority**: High
- **Date**: 2026-01-29

## [Documentation] No contributor setup guide
- **Context**: New agents/developers need onboarding instructions
- **Suggestion**: Add CONTRIBUTING.md with environment setup, dev workflow, testing instructions
- **Priority**: Medium
- **Date**: 2026-01-29

## [Cross-Project] Shared skill implementations
- **Context**: CONSOLIDATION-PLAN.md identifies shared skills (`/validate`, `/generate`, `/test`)
- **Suggestion**: Implement shared infrastructure in graph-ir-tools before project-specific work
- **Priority**: High
- **Date**: 2026-01-29
