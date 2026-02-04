# Armada Branch Projection Integration

> **Status**: Future Feature (blocked by Armada implementation)
> **GitHub Issue**: https://github.com/coreyt/coral/issues/13

## Overview

Armada will support "branch projections" - allowing developers to query a unified view of multiple branches. This enables team workflows where developers working on related features can see their combined codebase state.

```
main |-> dev |-> (branch-alice ∪ branch-bob)
```

## Use Case

Two developers (Alice and Bob) are working on related features:
- Alice's branch: `feature/auth-refactor`
- Bob's branch: `feature/api-updates`
- Both branched from: `dev`

Each developer wants to see:
1. All code from `dev` (their shared base)
2. Their own changes
3. Their teammate's changes
4. How their changes interact

With branch projection, they can query Armada with:
```
include_branches: ["dev", "feature/auth-refactor", "feature/api-updates"]
```

And receive a unified view showing the "projected" state of the codebase.

---

## Armada Implementation (Backend)

### Phase 1: Configuration Schema

```yaml
# armada.yaml
git:
  index_branches:
    - main
    - dev
    - "feature/*"
  default_query_branch: dev
  branch_exclude:
    - "wip/*"
    - "tmp/*"
```

### Phase 2: Graph Schema

New node types:
- `BRANCH` nodes (`id: branch:{repo}:{branch_name}`)
- `TAG` nodes (`id: tag:{repo}:{tag_name}`)

New edge types:
- `ON_BRANCH` (Commit → Branch)
- `TAGGED_AS` (Commit → Tag)
- `FILE_VERSION` (Branch → File with version info)

### Phase 3: Multi-Branch Indexing

Modify `GitIndexer.index_history()` to:
1. Enumerate configured branches
2. Create BRANCH nodes
3. Index commits per branch with ON_BRANCH edges
4. Track file versions per branch

### Phase 4: Projection Resolver

```python
@dataclass
class BranchProjection:
    base_branch: str
    include_branches: list[str]

class ProjectionResolver:
    def resolve_file(self, path: str, projection: BranchProjection) -> FileVersion:
        """Return the file version from the most recent branch in projection."""

    def detect_conflicts(self, projection: BranchProjection) -> list[Conflict]:
        """Find files/symbols modified differently in multiple branches."""
```

### Phase 5: MCP Tool Parameters

All relevant tools gain `include_branches` parameter:

```python
@mcp.tool()
async def search(
    query: str,
    include_branches: list[str] | None = None,  # NEW
    # ... existing params
) -> list[SearchResult]:
```

---

## coral-code-design Implementation (Frontend)

### Branch Selection UI

```typescript
interface BranchProjectionConfig {
  baseBranch: string;           // e.g., "dev"
  includeBranches: string[];    // e.g., ["feature/auth", "feature/api"]
}

// In WorkspaceSettings
interface WorkspaceSettings {
  // ... existing
  branchProjection?: BranchProjectionConfig;
}
```

### Components Needed

| Component | Purpose |
|-----------|---------|
| `BranchSelector` | Multi-select dropdown for branches |
| `BranchBadge` | Shows source branch on nodes/files |
| `ConflictIndicator` | Warning icon for conflicting symbols |
| `ProjectionStatus` | Status bar showing active projection |

### ArmadaProvider Changes

```typescript
// Extended fetch methods
fetchDiagram(type, scope, mode, {
  includeBranches: ["dev", "feature/auth"]
})

fetchSymbols(scope, {
  includeBranches: ["dev", "feature/auth"]
})
```

### Visual Indicators

1. **Node badges**: Small icon showing source branch
2. **File tree markers**: Indicate which branch modified a file
3. **Conflict highlights**: Red/orange border on conflicting nodes
4. **Tooltip details**: "Modified in feature/auth (line 45) and feature/api (line 52)"

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│                        ARMADA                                │
├─────────────────────────────────────────────────────────────┤
│ 1. BranchConfig schema                                       │
│ 2. Branch/Tag node types                                     │
│ 3. Multi-branch indexing                                     │
│ 4. ProjectionResolver                                        │
│ 5. MCP tool parameters                                       │
│ 6. HTTP API parameters                                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    CORAL-CODE-DESIGN                         │
├─────────────────────────────────────────────────────────────┤
│ 7. BranchSelector component                                  │
│ 8. ArmadaProvider includeBranches                            │
│ 9. BranchBadge on nodes                                      │
│ 10. ConflictIndicator                                        │
│ 11. Workspace config persistence                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Current Status

### Armada Backend (coreyt/armada)

| Phase | Issue | Status |
|-------|-------|--------|
| 1. BranchConfig | [#19](https://github.com/coreyt/armada/issues/19) | ✅ Complete |
| 2. Branch/Tag Discovery | [#20](https://github.com/coreyt/armada/issues/20) | ✅ Complete |
| 3. Branch/Tag Node Creation | [#21](https://github.com/coreyt/armada/issues/21) | ✅ Complete |
| 4. Multi-branch Commit Indexing | [#22](https://github.com/coreyt/armada/issues/22) | ✅ Complete |
| 5. CLI Integration | [#23](https://github.com/coreyt/armada/issues/23) | ✅ Complete |
| 6. FILE_VERSION Edge Tracking | [#24](https://github.com/coreyt/armada/issues/24) | ✅ Complete |
| 7. BranchProjection Resolver | [#25](https://github.com/coreyt/armada/issues/25) | ✅ Complete |
| 8. MCP Tools with include_branches | [#26](https://github.com/coreyt/armada/issues/26) | ✅ Complete |

### coral-code-design Frontend

| Component | Status |
|-----------|--------|
| BranchSelector UI | ❌ Not started |
| ArmadaProvider includeBranches | ❌ Not started |
| BranchBadge on nodes | ❌ Not started |
| ConflictIndicator | ❌ Not started |

**Next Step**: Armada #26 is complete. coral-code-design can now implement the UI (#13).

---

## References

### Coral
- GitHub Issue: https://github.com/coreyt/coral/issues/13
- ArmadaProvider: `packages/coral-code-design/core/src/providers/ArmadaProvider.tsx`

### Armada
- Multi-Branch Issues: https://github.com/coreyt/armada/issues?q=Multi-Branch
- Git Indexer: `cartographer/armada/indexers/git.py`
- MCP Server: `cartographer/armada/mcp/server.py`
