# Coral - Agent Development Guidelines

This document configures how AI agents work in this repository.

## Project Context

Coral is part of a larger ecosystem managed under `graph-ir-tools`:
- **coral** - Symbiotic diagramming toolchain (this repo)
- **graph-ir** - Graph Intermediate Representation specification
- **graph-ir-tools** - Shared tooling, skills, and consolidation coordination

See `/home/coreyt/projects/graph-ir-tools/CONSOLIDATION-PLAN.md` for cross-project architecture.

## Development Mode

### Implementation Mode (Default)

When working on implementation:

1. **Follow the documentation** - Specifications in `dev/` define what to build:
   - `dev/ARCHITECTURE.md` - Technical design and component specs
   - `dev/DOMAIN.md` - Graph theory and algorithmic foundations
   - `dev/claude-specs/` - Agent and skill specifications

2. **Test-Driven Development (TDD)** - Always:
   - Write tests first (or simultaneously with implementation)
   - Ensure tests pass before considering work complete
   - Run existing tests before and after changes
   - Add test fixtures for new functionality

3. **Verify against documentation** - Implementation should match specs. If specs are unclear or seem wrong, raise the concern before deviating.

### Experimentation Mode

When explicitly in "experimentation mode":
- Exploration and prototyping without strict TDD
- Results should be documented for potential specification updates
- Mark experimental code clearly (comments, branch names, file locations)
- Experimentation outputs may inform future specs

**Default is Implementation Mode** unless explicitly told otherwise.

## Documentation-First Development

Documentation types and their purposes:

| Type | Location | Purpose |
|------|----------|---------|
| Needs & Acceptance Criteria | `dev/` specs | What the feature must do |
| Architecture | `dev/ARCHITECTURE.md` | How components fit together |
| Requirements | Individual specs | Detailed implementation requirements |
| Designs | `dev/claude-specs/` | Agent/skill interface definitions |

**Before implementing**, ensure relevant documentation exists. If not:
1. Ask if documentation should be created first
2. Or clarify if this is experimentation mode

## Test-Driven Development Workflow

```
1. Read the specification
2. Write failing test(s) that verify the spec
3. Implement minimum code to pass tests
4. Refactor while keeping tests green
5. Verify roundtrip behavior where applicable (Text → IR → Text)
```

### Test Categories

- **Unit tests** - Individual function behavior
- **Integration tests** - Component interactions
- **Roundtrip tests** - DSL ↔ IR fidelity (critical for Coral)
- **Grammar tests** - Tree-sitter parse correctness

## Improvement Tracking

Keep tech debt light. When you notice opportunities for improvement, document them:

### Categories to Track

1. **Agent/Skill Improvements** - Better prompts, missing capabilities, edge cases
2. **Test Fixtures** - Missing test cases, better coverage opportunities
3. **Architectural Improvements** - Refactoring opportunities, pattern violations
4. **Documentation Gaps** - Unclear specs, missing examples, stale content
5. **Cross-Project Opportunities** - Shared code that could move to `graph-ir-tools`

### How to Track

Add improvement notes to `dev/IMPROVEMENTS.md` (create if needed) with:
```markdown
## [Category] Brief description
- **Context**: Where this was noticed
- **Suggestion**: What could be improved
- **Priority**: Low/Medium/High
- **Date**: When noticed
```

## Collaboration Principles

1. **Be helpful to each other** - Agents working on related areas should:
   - Leave clear commit messages
   - Update relevant documentation
   - Note dependencies or blockers discovered

2. **Communicate blockers** - If implementation is blocked by:
   - Missing specs → Ask for clarification
   - Cross-repo dependency → Note in IMPROVEMENTS.md
   - Unclear requirements → Request spec update

3. **Preserve context** - When completing work:
   - Summarize what was done
   - Note what remains
   - Flag any concerns discovered

## Quick Reference

### Before Starting Work
- [ ] Identify relevant specs in `dev/`
- [ ] Check for existing tests
- [ ] Understand cross-project dependencies
- [ ] Confirm implementation vs experimentation mode

### During Work
- [ ] Write tests first (TDD)
- [ ] Follow specs precisely
- [ ] Note improvements discovered
- [ ] Keep commits atomic and well-described

### After Completing Work
- [ ] All tests pass
- [ ] Documentation updated if needed
- [ ] Improvements logged
- [ ] Clear summary provided

## Package Structure

```
coral/
├── packages/
│   ├── ir/         # @coral/ir - Graph-IR types & Zod validation
│   ├── language/   # @coral/language - Tree-sitter grammar + Bridge
│   └── viz/        # @coral/viz - React Flow + ELK components
├── apps/
│   └── playground/ # Web application
├── dev/            # Documentation and specifications
│   ├── ARCHITECTURE.md
│   ├── DOMAIN.md
│   ├── claude-specs/
│   │   ├── agents/
│   │   └── skills/
│   └── IMPROVEMENTS.md  # Track opportunities
└── CLAUDE.md       # This file
```

## Related Repositories

| Repo | Path | Purpose |
|------|------|---------|
| graph-ir-tools | `/home/coreyt/projects/graph-ir-tools` | Shared tooling, consolidation |
| coral specs | `/home/coreyt/projects/graph-ir-tools/specs/coral` | Cross-project spec copies |
