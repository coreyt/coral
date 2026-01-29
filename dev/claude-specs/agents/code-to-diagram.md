# Code-to-Diagram Agent

## Summary

Analyzes source code to automatically extract and generate architecture diagrams. This agent addresses the "documentation drift" problem by generating diagrams directly from the codebase, ensuring they stay in sync with reality.

## Value Proposition

- **Eliminates documentation drift**: Diagrams are generated from code, not maintained separately
- **Reduces manual effort**: No need to manually trace dependencies
- **Discovers hidden architecture**: Reveals actual dependencies, not just documented ones
- **Enables CI/CD integration**: Can run on every commit to keep diagrams current

## Use Cases

### UC1: Initial Architecture Discovery
A developer joins a project and needs to understand the system structure.

```
User: "Analyze the src/ directory and generate a container diagram"

Agent: [scans code, identifies services/modules, traces dependencies, generates Graph-IR]
```

### UC2: Dependency Visualization
Team wants to understand module dependencies for refactoring.

```
User: "Show me all the import relationships in packages/api/"

Agent: [parses imports, generates module dependency graph]
```

### UC3: API Surface Mapping
Document all API endpoints and their handlers.

```
User: "Extract all REST endpoints from this Express app"

Agent: [finds route definitions, maps to handlers, generates diagram]
```

### UC4: Database Schema Visualization
Generate ER-style diagram from ORM models.

```
User: "Create a diagram from our Prisma schema"

Agent: [parses schema.prisma, extracts models and relations, generates Graph-IR]
```

### UC5: CI/CD Integration
Automated diagram generation on code changes.

```yaml
# .github/workflows/diagrams.yml
- name: Generate Architecture Diagram
  run: coral-agent code-to-diagram --input src/ --output docs/architecture.coral
```

## Interface

### Input

```typescript
interface CodeToDiagramInput {
  /** Root directory or file paths to analyze */
  paths: string[];

  /** Language hint (auto-detected if not provided) */
  language?: 'typescript' | 'javascript' | 'python' | 'go' | 'java' | 'rust';

  /** What level of abstraction to generate */
  level: 'system-context' | 'container' | 'component' | 'module';

  /** Analysis scope */
  scope?: {
    /** Include only these patterns */
    include?: string[];  // e.g., ["src/**/*.ts", "!**/*.test.ts"]
    /** Exclude these patterns */
    exclude?: string[];  // e.g., ["node_modules", "dist"]
  };

  /** What to extract */
  extract?: {
    /** Extract import/export relationships */
    imports?: boolean;
    /** Extract class inheritance */
    inheritance?: boolean;
    /** Extract function calls (expensive) */
    calls?: boolean;
    /** Extract API routes */
    routes?: boolean;
    /** Extract database models */
    models?: boolean;
  };

  /** Grouping strategy */
  grouping?: {
    /** Group by directory structure */
    byDirectory?: boolean;
    /** Group by package.json workspaces */
    byWorkspace?: boolean;
    /** Custom grouping rules */
    rules?: GroupingRule[];
  };
}

interface GroupingRule {
  /** Pattern to match file paths */
  pattern: string;
  /** Node type for the group */
  type: NodeType;
  /** Label for the group */
  label: string;
}
```

### Output

```typescript
interface CodeToDiagramOutput {
  /** Generated Graph-IR */
  graph: CoralGraph;

  /** Coral DSL representation */
  dsl: string;

  /** Analysis metadata */
  analysis: {
    /** Files analyzed */
    filesAnalyzed: number;
    /** Nodes created */
    nodesCreated: number;
    /** Edges created */
    edgesCreated: number;
    /** Detected language */
    language: string;
    /** Analysis duration */
    durationMs: number;
  };

  /** Issues encountered */
  warnings: Array<{
    file: string;
    line?: number;
    message: string;
  }>;

  /** Source mappings (node ID → source locations) */
  sourceMappings: Map<string, SourceLocation[]>;
}

interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
```

## Behavior

### Step 1: File Discovery
- Scan provided paths
- Apply include/exclude filters
- Detect language from extensions and content

### Step 2: Parsing
- Parse source files into ASTs
- Use language-specific parsers:
  - TypeScript: `@typescript-eslint/parser` or TypeScript compiler API
  - Python: `ast` module or tree-sitter-python
  - Go: `go/parser`
  - Java: tree-sitter-java
  - Rust: tree-sitter-rust

### Step 3: Entity Extraction
Based on `level` and `extract` options:

**For `container` level:**
- Find package.json files (Node.js services)
- Find main entry points
- Identify external service calls (HTTP clients, database connections)

**For `component` level:**
- Find class/module definitions
- Extract exported interfaces
- Identify major abstractions

**For `module` level:**
- Map every file as a node
- Extract all import statements
- Build full dependency graph

### Step 4: Relationship Inference
- **Import edges**: A imports B → edge from A to B
- **Inheritance edges**: A extends B → edge with `inherits` relation
- **Call edges**: A.method() calls B.method() → edge with `dependency` relation
- **Data flow**: A writes to DB, B reads from DB → edges through DB node

### Step 5: Grouping and Hierarchy
- Apply grouping rules to create parent nodes
- Nest children under appropriate parents
- Collapse internal details based on abstraction level

### Step 6: Graph-IR Generation
- Create nodes with source-derived IDs
- Attach source mappings as metadata
- Validate DAG property (may need to break cycles)

### Step 7: Cycle Handling
Real codebases often have circular dependencies. Strategy:
1. Detect cycles
2. Report them as warnings
3. Either:
   - Break cycle by removing weakest edge
   - Mark one edge as "back edge" in metadata
   - Elevate cycle members to same level

## Examples

### Example 1: TypeScript Monorepo

**Input:**
```typescript
{
  paths: ["packages/"],
  language: "typescript",
  level: "container",
  grouping: { byWorkspace: true }
}
```

**Directory Structure:**
```
packages/
├── api/
│   ├── package.json (name: @myapp/api)
│   └── src/index.ts (imports @myapp/shared)
├── web/
│   ├── package.json (name: @myapp/web)
│   └── src/App.tsx (imports @myapp/shared)
└── shared/
    ├── package.json (name: @myapp/shared)
    └── src/index.ts
```

**Output Graph-IR:**
```json
{
  "version": "1.0",
  "nodes": [
    { "id": "myapp_api", "type": "service", "label": "@myapp/api" },
    { "id": "myapp_web", "type": "service", "label": "@myapp/web" },
    { "id": "myapp_shared", "type": "module", "label": "@myapp/shared" }
  ],
  "edges": [
    { "source": "myapp_api", "target": "myapp_shared", "relation": "dependency" },
    { "source": "myapp_web", "target": "myapp_shared", "relation": "dependency" }
  ]
}
```

### Example 2: Express API Routes

**Input:**
```typescript
{
  paths: ["src/routes/"],
  language: "typescript",
  level: "component",
  extract: { routes: true }
}
```

**Source File (src/routes/users.ts):**
```typescript
import { Router } from 'express';
import { UserService } from '../services/user';

const router = Router();
router.get('/users', UserService.list);
router.post('/users', UserService.create);
router.get('/users/:id', UserService.get);
export default router;
```

**Output Graph-IR:**
```json
{
  "version": "1.0",
  "nodes": [
    {
      "id": "users_routes",
      "type": "module",
      "label": "Users Routes",
      "metadata": {
        "endpoints": ["GET /users", "POST /users", "GET /users/:id"]
      }
    },
    { "id": "user_service", "type": "module", "label": "UserService" }
  ],
  "edges": [
    { "source": "users_routes", "target": "user_service", "relation": "dependency" }
  ]
}
```

## Dependencies

### Required
- `@coral/ir` — Graph-IR types and validation
- `@coral/language` — DSL printer
- File system access

### Language-Specific (loaded on demand)
- TypeScript: `typescript` compiler API
- Python: tree-sitter-python or Python subprocess
- Go: tree-sitter-go
- Java: tree-sitter-java
- Rust: tree-sitter-rust

### Optional
- `glob` — File pattern matching
- `ignore` — Gitignore-style filtering

## Implementation Notes

### Performance Considerations
- Large codebases may have thousands of files
- Use streaming/incremental parsing where possible
- Cache ASTs between runs
- Consider parallel parsing for multi-core systems

### Accuracy vs Completeness Trade-off
- Static analysis cannot capture runtime behavior
- Dynamic imports, reflection, and metaprogramming create blind spots
- Document limitations clearly

### Source Mapping
Store mappings from diagram nodes to source locations:
```typescript
graph.nodes[0].metadata = {
  sourceLocations: [
    { file: "src/services/user.ts", line: 5, column: 0 }
  ]
};
```

This enables "click to navigate" in the visual editor.

### Incremental Updates
For CI/CD integration, support incremental analysis:
1. Accept previous analysis result
2. Detect changed files
3. Re-analyze only changed files
4. Merge with previous result

## Open Questions

1. **How deep should call analysis go?**
   - Tracing all function calls is expensive and noisy
   - Need heuristics for "significant" calls

2. **How to handle dynamic languages?**
   - Python/JavaScript have runtime imports
   - Type hints help but aren't always present

3. **Should it detect architectural patterns?**
   - "This looks like a repository pattern"
   - "This appears to be an event-driven architecture"

4. **Integration with LSP?**
   - Could use Language Server Protocol for more accurate analysis
   - Would work with any language that has an LSP server

5. **How to handle multiple languages in one repo?**
   - Polyglot architectures are common
   - Need to merge graphs from different languages

## Related Specifications

- [diagram-generation agent](diagram-generation.md) — Could refine code-generated diagrams
- [/coral-explain skill](../skills/coral-explain.md) — Explains generated diagrams
