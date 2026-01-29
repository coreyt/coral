# Coral Claude Specifications

This directory contains specifications for Claude Code agents and skills that support the Coral diagramming project.

## Overview

Coral is a symbiotic diagramming toolchain with a JSON-based Graph-IR at its core. These agents and skills leverage Claude's capabilities to:

1. **Generate diagrams** from natural language descriptions
2. **Validate** Graph-IR for correctness
3. **Convert** between diagram formats
4. **Analyze code** to extract architecture diagrams
5. **Assist development** of the Coral toolchain itself

## Specifications

### Agents

| Agent | Purpose | Status |
|-------|---------|--------|
| [diagram-generation](agents/diagram-generation.md) | Generate Graph-IR from natural language | Proposed |
| [code-to-diagram](agents/code-to-diagram.md) | Extract architecture from source code | Proposed |
| [format-migration](agents/format-migration.md) | Convert Mermaid/DOT/PlantUML to Coral | Proposed |
| [elk-tuning](agents/elk-tuning.md) | Optimize ELK layout configuration | Proposed |
| [grammar-development](agents/grammar-development.md) | Assist Tree-sitter grammar development | Proposed |

### Skills

| Skill | Purpose | Status |
|-------|---------|--------|
| [/coral](skills/coral.md) | Generate Coral diagrams inline | Proposed |
| [/coral-validate](skills/coral-validate.md) | Validate Graph-IR or DSL | Proposed |
| [/coral-convert](skills/coral-convert.md) | Convert between diagram formats | Proposed |
| [/coral-scaffold](skills/coral-scaffold.md) | Generate boilerplate for new components | Proposed |
| [/coral-explain](skills/coral-explain.md) | Explain diagrams in natural language | Proposed |

### MCP Servers

See [mcp-servers.md](mcp-servers.md) for:
- Existing MCP servers useful for Coral development (tree-sitter, github, filesystem)
- Proposed custom MCP servers Coral could provide (coral, architecture-analysis)

## Specification Format

Each specification follows this structure:

```markdown
# Name

## Summary
Brief description of purpose and value.

## Use Cases
Concrete scenarios where this is useful.

## Interface
Inputs, outputs, parameters.

## Behavior
How it works, step by step.

## Examples
Input/output examples.

## Dependencies
What it requires (packages, APIs, tools).

## Implementation Notes
Technical considerations.

## Open Questions
Unresolved design decisions.
```

## Cross-Repository Coordination

These specifications will be consolidated with:
- **graph-ir** — Core data structure agents/skills
- **armada** — Orchestration and multi-agent coordination

The consolidated specifications will live in a dedicated repository for refactoring before implementation.
