---
name: coral-validate
description: Validate Coral DSL or Graph-IR JSON for syntax errors, schema compliance, cycles, and referential integrity
---

# /coral-validate

Validate Coral DSL or Graph-IR JSON for correctness.

## Usage

```
/coral-validate
<paste Coral DSL or Graph-IR JSON>
```

Or with a file:
```
/coral-validate path/to/diagram.coral
```

## Validation Checks

1. **Syntax Check** (DSL only)
   - Valid Coral DSL syntax
   - Proper string quoting, balanced braces, valid identifiers

2. **Schema Check**
   - Required fields present (id, type, label for nodes)
   - Valid enum values (node types, relation types)

3. **DAG Check**
   - No cycles in the graph
   - Reports cycle path if found

4. **Reference Check**
   - All edge sources/targets exist as nodes
   - No duplicate node IDs

5. **Warnings** (non-fatal)
   - Orphan nodes (no connections)
   - Empty metadata objects

## Output Format

### Success
```
Validation Results:
✓ Syntax: Valid Coral DSL
✓ Schema: All nodes have required fields
✓ DAG: No cycles detected
✓ References: All edge endpoints exist

Summary: 5 nodes, 7 edges, no issues found.
```

### Errors
```
Validation Results:
✗ Error at line 3: Reference to undefined node 'missing_db'

  Suggestion: Add a node declaration:
    database "Missing DB"

Found 1 error.
```

## Examples

### Valid Diagram
```
/coral-validate
service "API"
database "PostgreSQL"
api -> postgresql [data_flow]
```

### Undefined Reference
```
/coral-validate
service "API"
api -> database
```
Reports: Node 'database' is not defined

### Cycle Detection
```
/coral-validate
service "A"
service "B"
service "C"
a -> b
b -> c
c -> a
```
Reports: Cycle detected: a → b → c → a

## Error Codes

| Code | Description |
|------|-------------|
| `SYNTAX_ERROR` | Invalid DSL syntax |
| `MISSING_FIELD` | Required field not present |
| `INVALID_TYPE` | Unknown node or relation type |
| `CYCLE_DETECTED` | Graph contains cycles |
| `UNDEFINED_NODE` | Edge references non-existent node |
| `DUPLICATE_ID` | Multiple nodes with same ID |

## Notes

- Auto-detects format (DSL vs JSON) from content
- Provides "did you mean" suggestions using fuzzy matching
- Shows context around errors with line numbers
