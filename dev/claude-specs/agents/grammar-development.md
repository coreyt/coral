# Grammar Development Agent

## Summary

Assists with developing and testing Tree-sitter grammars for the Coral DSL. This agent helps write grammar rules, debug conflicts, generate test cases, and ensure the grammar correctly parses all valid Coral syntax.

## Value Proposition

- **Accelerates grammar development**: Tree-sitter has a learning curve; agent provides expertise
- **Catches edge cases**: Systematically generates test cases for grammar rules
- **Debugs conflicts**: Helps resolve shift/reduce and other parser conflicts
- **Maintains consistency**: Ensures grammar changes don't break existing syntax

## Use Cases

### UC1: Adding New Syntax
Developer wants to add a new language feature.

```
User: "Add support for 'alias' declarations like: alias db = database"

Agent: [writes grammar rule, updates tests, checks for conflicts]
```

### UC2: Debugging Parse Errors
A valid-looking input fails to parse.

```
User: "This should parse but doesn't:
       service 'Single Quotes' { }"

Agent: [identifies that grammar only allows double quotes, suggests fix]
```

### UC3: Conflict Resolution
Tree-sitter reports a grammar conflict.

```
User: "Getting shift/reduce conflict on this rule:
       edge_declaration: $ => seq($.identifier, '->', $.identifier)"

Agent: [analyzes conflict, suggests precedence or rule restructuring]
```

### UC4: Test Generation
Need comprehensive tests for a grammar rule.

```
User: "Generate test cases for the node_declaration rule"

Agent: [generates positive and negative test cases, edge cases]
```

### UC5: Grammar Refactoring
Simplify or optimize existing grammar.

```
User: "The grammar has gotten complex. Can you suggest simplifications?"

Agent: [analyzes grammar, identifies redundancy, suggests refactoring]
```

## Interface

### Input

```typescript
interface GrammarDevelopmentInput {
  /** The task to perform */
  task: 'add-feature' | 'debug' | 'resolve-conflict' | 'generate-tests' | 'refactor';

  /** Current grammar.js content */
  grammar: string;

  /** For 'add-feature': description of the new syntax */
  featureDescription?: string;

  /** For 'debug': the input that fails to parse */
  failingInput?: string;

  /** For 'resolve-conflict': the conflict message from tree-sitter */
  conflictMessage?: string;

  /** For 'generate-tests': the rule name to test */
  ruleName?: string;

  /** Existing test cases (to avoid duplicates) */
  existingTests?: TestCase[];

  /** Whether to run tree-sitter commands */
  runCommands?: boolean;
}

interface TestCase {
  name: string;
  input: string;
  expectedTree?: string;  // S-expression
  shouldFail?: boolean;
}
```

### Output

```typescript
interface GrammarDevelopmentOutput {
  /** Updated grammar.js (if modified) */
  updatedGrammar?: string;

  /** Diff showing changes */
  grammarDiff?: string;

  /** New or updated test cases */
  testCases?: TestCase[];

  /** Explanation of changes */
  explanation: string;

  /** Warnings or potential issues */
  warnings?: string[];

  /** Commands to run */
  commands?: string[];

  /** For conflicts: detailed conflict analysis */
  conflictAnalysis?: {
    conflictType: 'shift-reduce' | 'reduce-reduce';
    involvedRules: string[];
    ambiguousInput: string;
    resolution: string;
  };
}
```

## Behavior

### Task: Add Feature

**Step 1:** Understand the syntax to add
- Parse the feature description
- Identify tokens, structure, and semantics
- Check for conflicts with existing syntax

**Step 2:** Write grammar rule
```javascript
// Example: Adding 'alias' declarations
alias_declaration: $ => seq(
  'alias',
  field('name', $.identifier),
  '=',
  field('target', $.node_type)
),
```

**Step 3:** Integrate into grammar
- Add rule to appropriate choice() or repeat()
- Update 'rules' object
- Consider precedence if needed

**Step 4:** Generate tests
```
==================
Alias declaration
==================
alias db = database
---
(source_file
  (alias_declaration
    name: (identifier)
    target: (node_type)))
```

**Step 5:** Validate
- Run `tree-sitter generate`
- Run `tree-sitter test`
- Check for conflicts or failures

### Task: Debug

**Step 1:** Parse the failing input with current grammar
- Identify where parsing fails
- Get partial tree and ERROR nodes

**Step 2:** Analyze failure
- Is the syntax actually valid? (user error vs grammar bug)
- Which rule should match but doesn't?
- What token is unexpected?

**Step 3:** Diagnose cause
Common causes:
- Missing alternative in choice()
- Incorrect token pattern
- Missing or wrong precedence
- Rule ordering issue

**Step 4:** Suggest fix
- Provide grammar patch
- Explain why it failed and how fix works

### Task: Resolve Conflict

**Step 1:** Parse conflict message
```
Unresolved conflict for symbol sequence:
  identifier  '->'  identifier  •  '['  …
Possible actions:
  1: Shift (precedence 0)
  2: Reduce edge_declaration (precedence 0)
```

**Step 2:** Understand the ambiguity
- What inputs trigger the conflict?
- What are the two possible parse trees?
- Which interpretation is correct?

**Step 3:** Apply resolution strategy

**Strategy A: Precedence**
```javascript
edge_declaration: $ => prec.left(1, seq(
  $.identifier, '->', $.identifier,
  optional($.edge_attributes)
)),
```

**Strategy B: Rule restructuring**
Factor out common prefix to eliminate ambiguity.

**Strategy C: Conflict marker**
```javascript
conflicts: $ => [
  [$.edge_declaration, $.property_access]
],
```

**Step 4:** Verify resolution
- Regenerate parser
- Test ambiguous inputs
- Ensure both interpretations are handled correctly

### Task: Generate Tests

**Step 1:** Analyze rule structure
- Identify required and optional parts
- Find choice points
- Note recursive structures

**Step 2:** Generate positive cases
- Minimal valid input
- Each optional part present/absent
- Each choice alternative
- Nested/recursive cases
- Edge cases (empty, single, many)

**Step 3:** Generate negative cases
- Missing required tokens
- Invalid token types
- Wrong order
- Malformed structure

**Step 4:** Format as tree-sitter test file
```
==================
Test name
==================
input text
---
(expected_tree)
```

### Task: Refactor

**Step 1:** Analyze grammar
- Build rule dependency graph
- Identify unused rules
- Find duplicate patterns
- Measure complexity

**Step 2:** Identify improvements
- Extract common patterns into named rules
- Simplify deeply nested structures
- Remove dead code
- Improve naming

**Step 3:** Propose changes
- Show before/after for each change
- Explain benefits
- Warn about semantic changes

## Examples

### Example 1: Adding Alias Feature

**Input:**
```json
{
  "task": "add-feature",
  "featureDescription": "Add alias declarations: alias short_name = long_type_name",
  "grammar": "/* current grammar.js content */"
}
```

**Output:**
```json
{
  "updatedGrammar": "/* updated grammar.js with alias_declaration rule */",
  "grammarDiff": "@@ -15,6 +15,13 @@\n+    alias_declaration: $ => seq(...)",
  "testCases": [
    {
      "name": "simple alias",
      "input": "alias db = database",
      "expectedTree": "(source_file (alias_declaration name: (identifier) target: (node_type)))"
    },
    {
      "name": "alias with underscore",
      "input": "alias ext_api = external_api",
      "expectedTree": "..."
    }
  ],
  "explanation": "Added 'alias_declaration' rule that allows creating short names for node types. The rule is added to the top-level source_file alternatives.",
  "commands": ["tree-sitter generate", "tree-sitter test"]
}
```

### Example 2: Resolving Conflict

**Input:**
```json
{
  "task": "resolve-conflict",
  "grammar": "/* grammar with conflict */",
  "conflictMessage": "Unresolved conflict for symbol sequence:\n  identifier  '.'  identifier  •  '->'  …"
}
```

**Output:**
```json
{
  "updatedGrammar": "/* fixed grammar */",
  "explanation": "The conflict arises because 'a.b -> c' could be parsed as either:\n1. Property access 'a.b' followed by edge operator\n2. Edge from 'a.b' (port reference) to 'c'\n\nResolved by giving edge_declaration higher precedence, since port references in edges are more common than property access followed by edges.",
  "conflictAnalysis": {
    "conflictType": "shift-reduce",
    "involvedRules": ["port_reference", "edge_declaration"],
    "ambiguousInput": "a.b -> c",
    "resolution": "prec.left(2, ...) on edge_declaration"
  }
}
```

## Dependencies

### Required
- Tree-sitter CLI (`tree-sitter generate`, `tree-sitter test`)
- Node.js (for grammar.js processing)
- File system access (to read/write grammar files)

### Optional
- `tree-sitter-cli` npm package for programmatic access
- Diff library for showing changes

## Implementation Notes

### Grammar Analysis
Parse grammar.js as JavaScript to:
- Extract rule names
- Build rule dependency graph
- Identify patterns and structure

### Conflict Detection
Run `tree-sitter generate 2>&1` and parse stderr for conflict messages.

### Test Format
Tree-sitter tests use a specific format:
```
==================
Test name
==================
source code
---
(expected_tree)

==================
Next test
==================
...
```

### Incremental Changes
When modifying grammar:
1. Make minimal changes
2. Test after each change
3. Roll back if tests fail
4. Build up incrementally

### Common Patterns
Maintain library of common grammar patterns:
- Comma-separated lists: `sepBy(',', $.rule)`
- Optional trailing comma
- Balanced delimiters
- Comment handling
- String escaping

## Open Questions

1. **How much should it automate vs explain?**
   - Fully automated changes risk unexpected behavior
   - But manual changes are tedious
   - Maybe: always explain, optionally apply

2. **Should it understand Coral semantics?**
   - Grammar is syntax, but some rules have semantic meaning
   - e.g., "node IDs must be unique" isn't enforceable in grammar

3. **Integration with IDE?**
   - Real-time grammar validation as user types
   - Preview parse tree for test inputs

4. **How to handle breaking changes?**
   - Changing grammar may break existing .coral files
   - Need migration strategy

5. **Should it generate the WASM file?**
   - `tree-sitter build-wasm` is needed for browser
   - Could automate full build pipeline

## Related Specifications

- [/coral-validate skill](../skills/coral-validate.md) — Uses the grammar to parse DSL
- [format-migration agent](format-migration.md) — May need grammar updates for new features
