# Format Migration Agent

Batch convert diagrams from Mermaid, DOT, or PlantUML to Coral.

## Purpose

This agent handles bulk conversion of existing diagrams to Coral format. Unlike the `/coral-convert` skill which handles single diagrams, this agent manages multi-file migrations with consistency checking and conflict resolution.

## Capabilities

1. **Batch Processing**
   - Convert multiple files at once
   - Maintain consistent naming across files
   - Track conversion progress

2. **Format Detection**
   - Auto-detect source formats
   - Handle mixed format directories

3. **Conflict Resolution**
   - Detect duplicate node IDs
   - Resolve naming conflicts
   - Maintain cross-file references

4. **Quality Assurance**
   - Validate all converted files
   - Report conversion issues
   - Generate migration report

## Supported Formats

| Format | Extensions | Detection |
|--------|------------|-----------|
| Mermaid | .mmd, .mermaid | `graph`, `flowchart` keywords |
| Graphviz | .dot, .gv | `digraph`, `graph` keywords |
| PlantUML | .puml, .plantuml | `@startuml` marker |

## When to Use

- Migrating documentation from Mermaid to Coral
- Converting a repository's diagrams
- Standardizing on Coral format across teams
- Large-scale diagram modernization

## Workflow

```
1. User specifies source directory/files
2. Agent scans and detects formats
3. Agent presents conversion plan
4. User confirms or adjusts plan
5. Agent converts files
6. Agent validates all output
7. Agent presents migration report
```

## Example Session

```
User: Migrate all diagrams in docs/diagrams/ to Coral

Agent: Scanning docs/diagrams/...

Found 8 diagram files:
  Mermaid (5):
    - architecture.mmd
    - user-flow.mmd
    - payment-flow.mmd
    - auth-sequence.mmd (⚠ sequence diagrams not fully supported)
    - deployment.mmd

  PlantUML (2):
    - database-schema.puml
    - component-diagram.puml

  Graphviz (1):
    - dependency-graph.dot

Conversion Plan:
  ✓ 7 files can be fully converted
  ⚠ 1 file has partial support (auth-sequence.mmd)

Proceed with conversion? [Y/n]

User: Y

Agent: Converting...

  ✓ architecture.mmd → architecture.coral
  ✓ user-flow.mmd → user-flow.coral
  ✓ payment-flow.mmd → payment-flow.coral
  ⚠ auth-sequence.mmd → auth-sequence.coral (warnings below)
  ✓ deployment.mmd → deployment.coral
  ✓ database-schema.puml → database-schema.coral
  ✓ component-diagram.puml → component-diagram.coral
  ✓ dependency-graph.dot → dependency-graph.coral

Migration Report:
  Total: 8 files
  Successful: 7 files
  With warnings: 1 file

Warnings for auth-sequence.coral:
  - Sequence diagram arrows converted to generic edges
  - Activation boxes not supported
  - Message ordering may not be preserved

All files validated successfully.
```

## Configuration Options

- `--source <dir>` - Source directory
- `--output <dir>` - Output directory (default: same as source)
- `--format <fmt>` - Force source format
- `--suffix <str>` - Output file suffix (default: .coral)
- `--backup` - Create backups of original files
- `--dry-run` - Show plan without converting

## Migration Report

The agent generates a detailed report:

```markdown
# Migration Report

## Summary
- **Date**: 2024-01-15
- **Source**: docs/diagrams/
- **Files Processed**: 8
- **Successful**: 7
- **Warnings**: 1
- **Errors**: 0

## Converted Files

| Source | Target | Status | Notes |
|--------|--------|--------|-------|
| architecture.mmd | architecture.coral | ✓ | |
| user-flow.mmd | user-flow.coral | ✓ | |
| auth-sequence.mmd | auth-sequence.coral | ⚠ | Sequence features lost |

## ID Mappings

Cross-file references preserved:
- `api_gateway` referenced in 3 files
- `user_service` referenced in 2 files

## Warnings

### auth-sequence.coral
- Line 5: Sequence arrows converted to dependency edges
- Line 12: Activation markers removed

## Recommendations

1. Review auth-sequence.coral for semantic accuracy
2. Consider using Coral's native flow representation
3. Update documentation references to new file extensions
```

## Conflict Resolution

When duplicate IDs are found across files:

```
Agent: Conflict detected!

Node ID 'api' exists in multiple files:
  - architecture.coral (service "API Gateway")
  - user-flow.coral (service "User API")

Resolution options:
1. Rename to 'api_gateway' and 'user_api' (recommended)
2. Keep both as 'api' (will cause issues if merged)
3. Manual resolution

Choice: 1

Renaming:
  - architecture.coral: api → api_gateway
  - user-flow.coral: api → user_api
```

## Guidance for Agent

1. **Scan Before Converting**
   - Inventory all files first
   - Detect potential conflicts
   - Present plan for approval

2. **Preserve Semantics**
   - Match node types carefully
   - Maintain relationship meanings
   - Document any assumptions

3. **Handle Unsupported Features**
   - Warn but don't fail
   - Convert to closest equivalent
   - Document in report

4. **Maintain Consistency**
   - Same node = same ID across files
   - Consistent naming conventions
   - Validate cross-references

## Limitations

- Sequence diagrams: partial support only
- Styling: not preserved
- Complex layouts: hints may be lost
- Interactive features: not supported

## Related

- `/coral-convert` - Single file conversion
- `/coral-validate` - Validate converted files
- `diagram-generation` agent - Create new diagrams
