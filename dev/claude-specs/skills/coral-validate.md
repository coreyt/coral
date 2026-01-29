# /coral-validate Skill

## Summary

Validates Coral DSL or Graph-IR JSON for correctness, checking syntax, schema compliance, DAG constraints, and referential integrity. Reports errors with clear explanations and fix suggestions.

## Invocation

```
/coral-validate
<paste Coral DSL or Graph-IR JSON>
```

Or with a file path:
```
/coral-validate path/to/diagram.coral
```

## Value Proposition

- **Catches errors early**: Validate before committing or sharing
- **Clear diagnostics**: Explains what's wrong and how to fix it
- **Comprehensive checks**: Syntax, schema, cycles, references
- **Development aid**: Essential for testing during Coral development

## Use Cases

### UC1: Syntax Check
```
User: /coral-validate
      service "API"
      api -> database

Output:
Validation Results:
✗ Error at line 2: Reference to undefined node 'database'

  Suggestion: Add a node declaration for 'database':
    database "Database"
```

### UC2: Schema Validation
```
User: /coral-validate
      {
        "version": "1.0",
        "nodes": [{ "id": "api", "label": "API" }],
        "edges": []
      }

Output:
Validation Results:
✗ Schema Error: nodes[0] missing required field 'type'

  Valid types are: service, module, database, external_api, actor, group
```

### UC3: Cycle Detection
```
User: /coral-validate
      service "A"
      service "B"
      service "C"

      a -> b
      b -> c
      c -> a

Output:
Validation Results:
✗ Cycle Detected: a → b → c → a

  Coral requires diagrams to be acyclic (DAG).

  Options:
  1. Remove one edge to break the cycle
  2. Mark one edge as a "back edge" in metadata:
     c -> a [metadata.backEdge = true]
```

### UC4: Successful Validation
```
User: /coral-validate
      service "API"
      database "PostgreSQL"
      api -> postgresql [data_flow]

Output:
Validation Results:
✓ Syntax: Valid Coral DSL
✓ Schema: All nodes have required fields
✓ DAG: No cycles detected
✓ References: All edge endpoints exist

Summary: 2 nodes, 1 edge, no issues found.
```

### UC5: Multiple Issues
```
User: /coral-validate
      service "API"
      service "API"
      api -> missing_node
      other -> api

Output:
Validation Results:
✗ Error: Duplicate node ID 'api' (lines 1, 2)
✗ Error: Edge references undefined node 'missing_node'
✗ Error: Edge references undefined node 'other'

Found 3 errors. Fix duplicate IDs first, then undefined references.
```

## Interface

### Input Types

1. **Coral DSL** (detected by syntax)
```coral
service "API"
api -> database
```

2. **Graph-IR JSON** (detected by `{` or `[`)
```json
{"version": "1.0", "nodes": [...], "edges": [...]}
```

3. **File path** (detected by path patterns)
```
/coral-validate src/diagrams/architecture.coral
```

### Output Structure

```typescript
interface ValidationResult {
  /** Overall status */
  valid: boolean;

  /** Input format detected */
  format: 'coral-dsl' | 'graph-ir-json';

  /** Check results */
  checks: {
    syntax: CheckResult;
    schema: CheckResult;
    dag: CheckResult;
    references: CheckResult;
  };

  /** All errors found */
  errors: ValidationError[];

  /** Warnings (non-fatal issues) */
  warnings: ValidationWarning[];

  /** Summary statistics */
  summary: {
    nodeCount: number;
    edgeCount: number;
    errorCount: number;
    warningCount: number;
  };
}

interface CheckResult {
  passed: boolean;
  message: string;
}

interface ValidationError {
  code: string;
  message: string;
  line?: number;
  column?: number;
  path?: string[];  // For JSON: ["nodes", "0", "type"]
  suggestion?: string;
}

interface ValidationWarning {
  code: string;
  message: string;
  line?: number;
}
```

## Validation Checks

### 1. Syntax Check (DSL only)
- Parse with Tree-sitter
- Report syntax errors with line/column
- Show context around error

**Error codes:**
- `SYNTAX_ERROR`: General parse failure
- `UNEXPECTED_TOKEN`: Specific token issue
- `UNCLOSED_BRACE`: Missing `}`
- `UNCLOSED_STRING`: Missing closing quote

### 2. Schema Check
- Validate against Zod schema
- Check required fields
- Validate enum values
- Check nested structures

**Error codes:**
- `MISSING_FIELD`: Required field not present
- `INVALID_TYPE`: Wrong field type
- `INVALID_ENUM`: Value not in allowed set
- `INVALID_ID`: ID doesn't match pattern

### 3. DAG Check
- Build adjacency graph
- Run cycle detection (DFS)
- Report cycle path if found

**Error codes:**
- `CYCLE_DETECTED`: Graph has cycles

### 4. Reference Check
- All edge sources exist as node IDs
- All edge targets exist as node IDs
- Port references (if used) exist on referenced nodes

**Error codes:**
- `UNDEFINED_NODE`: Edge references non-existent node
- `UNDEFINED_PORT`: Edge references non-existent port
- `DUPLICATE_ID`: Multiple nodes with same ID

### 5. Warning Checks (non-fatal)
- Orphan nodes (no edges)
- Very long IDs
- Unusual characters in labels
- Empty metadata objects

**Warning codes:**
- `ORPHAN_NODE`: Node has no connections
- `LONG_ID`: ID exceeds recommended length
- `EMPTY_METADATA`: Metadata object is empty

## Output Formatting

### Success Output
```
Validation Results:
✓ Syntax: Valid Coral DSL
✓ Schema: All 5 nodes valid
✓ DAG: Acyclic graph confirmed
✓ References: All edges reference valid nodes

Summary: 5 nodes, 7 edges, no issues found.
```

### Error Output
```
Validation Results:
✓ Syntax: Valid Coral DSL
✗ Schema Error at line 3:

  3 │ service "API" {
  4 │   type: "invalid_type"
    │         ^^^^^^^^^^^^^^

  Invalid node type 'invalid_type'
  Valid types: service, module, database, external_api, actor, group

✗ Reference Error at line 8:

  8 │ api -> undefined_service
    │        ^^^^^^^^^^^^^^^^^

  Node 'undefined_service' is not defined

  Did you mean one of these?
  - user_service
  - auth_service

Summary: 5 nodes, 3 edges, 2 errors found.
```

### JSON Output (optional)
For programmatic use:
```
/coral-validate --json
```

Returns `ValidationResult` as JSON.

## Behavior

### Step 1: Detect Format
- If starts with `{` or `[`: JSON
- If contains `service`, `database`, `->`: Coral DSL
- If looks like path: read file

### Step 2: Parse
- **DSL**: Use Tree-sitter parser
- **JSON**: Use JSON.parse

### Step 3: Run Checks
1. Syntax (DSL) / JSON structure
2. Schema validation (Zod)
3. Cycle detection
4. Reference validation
5. Warning checks

### Step 4: Collect Results
- Aggregate all errors and warnings
- Sort by severity (errors first)
- Sort by location (line number)

### Step 5: Format Output
- Use colors/symbols for pass/fail
- Show context for errors
- Provide suggestions

## Error Suggestions

### For undefined references:
- Fuzzy match against existing node IDs
- Suggest likely matches

### For duplicate IDs:
- Show both locations
- Suggest renaming pattern

### For cycles:
- Show the cycle path
- Suggest which edge to remove (weakest link heuristic)

### For type errors:
- List valid values
- Suggest closest match

## Examples

### Example: Complex Validation

**Input:**
```
/coral-validate
service "API Gateway" {
  description: "Main entry point"
  port input(west)
  port output(east)
}

service "Auth"
service "Auth"  // duplicate!

api_gateway.output -> auth [http_request]
auth -> users_db [data_flow]  // users_db doesn't exist
```

**Output:**
```
Validation Results:

✓ Syntax: Valid Coral DSL (parsed 12 lines)
✓ Schema: Node structures valid

✗ Duplicate ID Error at line 8:

  7 │ service "Auth"
  8 │ service "Auth"  // duplicate!
    │         ^^^^^^

  Node ID 'auth' already defined at line 7
  Suggestion: Rename to 'auth_2' or use a more specific name

✗ Reference Error at line 11:

  11 │ auth -> users_db [data_flow]
     │         ^^^^^^^^

  Node 'users_db' is not defined

  To fix, add:
    database "Users DB"

⚠ Warning: Node 'api_gateway' has port 'input' with no incoming edges

Summary: 3 nodes, 2 edges, 2 errors, 1 warning
```

## Implementation Notes

### Parser Integration
Reuse `@coral/language` parser:
```typescript
import { parse } from '@coral/language';
const tree = await parse(input);
if (tree.rootNode.hasError) {
  // Extract error nodes
}
```

### Schema Validation
Use Zod's `.safeParse()`:
```typescript
import { CoralGraphSchema } from '@coral/ir';
const result = CoralGraphSchema.safeParse(graph);
if (!result.success) {
  // Format Zod errors
}
```

### Fuzzy Matching
For "did you mean" suggestions:
```typescript
import { distance } from 'fastest-levenshtein';
const suggestions = nodeIds
  .map(id => ({ id, dist: distance(unknownRef, id) }))
  .filter(s => s.dist <= 3)
  .sort((a, b) => a.dist - b.dist)
  .slice(0, 3);
```

## Dependencies

- `@coral/ir` — Schema validation
- `@coral/language` — DSL parsing
- File system access — For file path input

## Open Questions

1. **Should it auto-fix simple issues?**
   - `/coral-validate --fix` to auto-correct
   - Risk of unintended changes

2. **Streaming validation for large files?**
   - Validate incrementally as user types

3. **Integration with CI/CD?**
   - Exit codes for scripting
   - Machine-readable output format

## Related Specifications

- [/coral skill](coral.md) — Generates diagrams to validate
- [grammar-development agent](../agents/grammar-development.md) — Maintains the parser
