---
name: coral-scaffold
description: Generate boilerplate code for extending Coral with new node types, components, grammar rules, or relation types
---

# /coral-scaffold

Generate boilerplate for extending Coral.

## Usage

```
/coral-scaffold <component-type> <name> [options]
```

## Component Types

| Type | Description |
|------|-------------|
| `node-type` | Add a new node type to the IR and grammar |
| `component` | Create a React Flow node component |
| `relation-type` | Add a new edge relation type |
| `grammar-rule` | Add a Tree-sitter grammar rule |
| `full-feature` | Scaffold all of the above together |

## Options

- `--shape <shape>` - Visual shape hint (box, cylinder, diamond, hexagon, cloud)
- `--description <text>` - Description for the new component
- `--with-tests` - Include test file templates
- `--dry-run` - Preview changes without writing files

## Examples

### Add New Node Type
```
/coral-scaffold node-type queue
```
Generates updates to:
- `packages/ir/src/types.ts` - Add to NodeType union
- `packages/ir/src/schema.ts` - Add to NodeTypeSchema
- `packages/language/grammar.js` - Add keyword
- `packages/viz/src/components/nodes/QueueNode.tsx` - New component

### Add Relation Type
```
/coral-scaffold relation-type async-message --description "Asynchronous message passing"
```

### Full Feature
```
/coral-scaffold full-feature message-broker --shape hexagon --with-tests
```
Creates all files needed for a complete new feature including tests.

## Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| Node type | snake_case | `message_broker` |
| Component | PascalCase | `MessageBrokerNode` |
| CSS class | kebab-case | `coral-node--message-broker` |
| File name | PascalCase | `MessageBrokerNode.tsx` |

## Notes

- Always run `pnpm build` after scaffolding
- Test with `pnpm test` to verify integration
- Use `--dry-run` to preview changes first
