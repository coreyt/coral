# /coral-scaffold Skill

## Summary

Generates boilerplate code for extending Coral: new node types, custom React Flow components, grammar rules, and Zod schemas. Ensures consistency across the codebase when adding new features.

## Invocation

```
/coral-scaffold <component-type> <name> [options]
```

Component types:
- `node-type` — Add a new node type to the IR
- `component` — Create a React Flow node component
- `grammar-rule` — Add a Tree-sitter grammar rule
- `relation-type` — Add a new edge relation type
- `full-feature` — Scaffold all of the above together

## Value Proposition

- **Consistency**: All scaffolded code follows Coral conventions
- **Completeness**: Never forget to update schema, grammar, and components
- **Speed**: Generate boilerplate in seconds, not minutes
- **Learning**: Shows how Coral's pieces fit together

## Use Cases

### UC1: Add New Node Type
```
User: /coral-scaffold node-type queue

Output:
Generated files:
  packages/ir/src/types.ts (updated)
  packages/ir/src/schema.ts (updated)
  packages/language/grammar.js (updated)
  packages/viz/src/components/nodes/QueueNode.tsx (created)

Changes:
  - Added 'queue' to NodeType union
  - Added QueueNode component with cylinder+arrow icon
  - Added 'queue' keyword to grammar
```

### UC2: Add Custom Component Only
```
User: /coral-scaffold component kubernetes-pod

Output:
Generated files:
  packages/viz/src/components/nodes/KubernetesPodNode.tsx (created)
  packages/viz/src/components/nodes/index.ts (updated)

Component includes:
  - Pod-shaped container with rounded corners
  - Handle positions for typical K8s patterns
  - Placeholder for container icons
```

### UC3: Add Relation Type
```
User: /coral-scaffold relation-type async-message

Output:
Generated files:
  packages/ir/src/types.ts (updated)
  packages/ir/src/schema.ts (updated)
  packages/language/grammar.js (updated)
  packages/viz/src/components/edges/AsyncMessageEdge.tsx (created)

Changes:
  - Added 'async_message' to RelationType union
  - Edge styled with dashed line and arrow
  - Added 'async_message' keyword to grammar
```

### UC4: Full Feature
```
User: /coral-scaffold full-feature lambda --description "AWS Lambda function"

Output:
Generated files across all packages:
  packages/ir/src/types.ts
  packages/ir/src/schema.ts
  packages/language/grammar.js
  packages/language/src/bridge.ts
  packages/language/src/printer.ts
  packages/viz/src/components/nodes/LambdaNode.tsx
  packages/viz/src/components/nodes/index.ts

Test files:
  packages/language/test/lambda.test.ts
  packages/viz/src/components/nodes/LambdaNode.test.tsx
```

## Interface

### Input Parameters

```typescript
interface ScaffoldInput {
  /** What to scaffold */
  componentType: 'node-type' | 'component' | 'grammar-rule' | 'relation-type' | 'full-feature';

  /** Name for the new component (will be normalized) */
  name: string;

  /** Optional description */
  description?: string;

  /** For node-type: visual shape hint */
  shape?: 'box' | 'cylinder' | 'diamond' | 'ellipse' | 'hexagon' | 'cloud';

  /** For node-type: default ports */
  ports?: Array<{ side: 'north' | 'south' | 'east' | 'west'; name?: string }>;

  /** For relation-type: edge style */
  edgeStyle?: 'solid' | 'dashed' | 'dotted';

  /** For relation-type: arrow style */
  arrowStyle?: 'arrow' | 'diamond' | 'circle' | 'none';

  /** Whether to create test files */
  withTests?: boolean;

  /** Whether to actually write files (false = dry run) */
  dryRun?: boolean;
}
```

### Output

```typescript
interface ScaffoldOutput {
  /** Files created or modified */
  files: Array<{
    path: string;
    action: 'created' | 'modified';
    content?: string;  // For dry run
    diff?: string;     // For modifications
  }>;

  /** Next steps for the user */
  nextSteps: string[];

  /** Any warnings */
  warnings?: string[];
}
```

## Generated Code Templates

### Node Type Addition

**packages/ir/src/types.ts:**
```typescript
// Added to NodeType union
export type NodeType =
  | 'service'
  | 'module'
  | 'database'
  | 'external_api'
  | 'actor'
  | 'group'
  | 'queue';  // <-- Added
```

**packages/ir/src/schema.ts:**
```typescript
export const NodeTypeSchema = z.enum([
  'service',
  'module',
  'database',
  'external_api',
  'actor',
  'group',
  'queue',  // <-- Added
]);
```

**packages/language/grammar.js:**
```javascript
node_type: $ => choice(
  'service',
  'module',
  'database',
  'external_api',
  'actor',
  'group',
  'queue',  // <-- Added
),
```

### React Flow Component

**packages/viz/src/components/nodes/QueueNode.tsx:**
```typescript
import { Handle, Position, NodeProps } from '@xyflow/react';

interface QueueNodeData {
  label: string;
  metadata?: Record<string, unknown>;
}

export function QueueNode({ data, selected }: NodeProps<QueueNodeData>) {
  return (
    <div className={`coral-node coral-node--queue ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />

      <div className="coral-node__icon">
        {/* Queue icon: cylinder with arrow */}
        <svg viewBox="0 0 24 24" width="24" height="24">
          <ellipse cx="12" cy="5" rx="8" ry="3" fill="none" stroke="currentColor" />
          <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" fill="none" stroke="currentColor" />
          <path d="M12 12l4 4m0-4l-4 4" stroke="currentColor" />
        </svg>
      </div>

      <div className="coral-node__label">{data.label}</div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

**packages/viz/src/components/nodes/index.ts:**
```typescript
export { ServiceNode } from './ServiceNode';
export { DatabaseNode } from './DatabaseNode';
// ... existing exports ...
export { QueueNode } from './QueueNode';  // <-- Added
```

### Edge Component

**packages/viz/src/components/edges/AsyncMessageEdge.tsx:**
```typescript
import { BaseEdge, EdgeProps, getSmoothStepPath } from '@xyflow/react';

export function AsyncMessageEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        strokeDasharray: '5,5',  // Dashed for async
        stroke: selected ? '#3b82f6' : '#64748b',
        strokeWidth: 2,
      }}
      markerEnd="url(#arrow)"
    />
  );
}
```

### Test File

**packages/language/test/queue.test.ts:**
```typescript
import { describe, it, expect } from 'vitest';
import { parse, cstToGraph } from '../src';

describe('queue node type', () => {
  it('parses basic queue declaration', async () => {
    const input = 'queue "Message Queue"';
    const tree = await parse(input);
    expect(tree.rootNode.hasError).toBe(false);

    const graph = cstToGraph(tree.rootNode);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].type).toBe('queue');
    expect(graph.nodes[0].label).toBe('Message Queue');
  });

  it('parses queue with properties', async () => {
    const input = `
      queue "Order Queue" {
        description: "Handles order events"
      }
    `;
    const tree = await parse(input);
    expect(tree.rootNode.hasError).toBe(false);
  });

  it('handles queue in edges', async () => {
    const input = `
      service "Producer"
      queue "Events"
      service "Consumer"

      producer -> events [event]
      events -> consumer [event]
    `;
    const tree = await parse(input);
    const graph = cstToGraph(tree.rootNode);

    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0].target).toBe('events');
    expect(graph.edges[1].source).toBe('events');
  });
});
```

## Behavior

### Step 1: Validate Input
- Check name is valid identifier
- Check component type is supported
- Warn if name conflicts with existing

### Step 2: Generate Code
- Use templates appropriate for component type
- Substitute name, description, options
- Format code consistently

### Step 3: Identify Update Locations
- Find insertion points in existing files
- Preserve existing code structure
- Add to appropriate locations (unions, exports, etc.)

### Step 4: Generate Diffs
- Show what will change in existing files
- Create new file contents

### Step 5: Apply or Preview
- If dry run: show preview only
- Otherwise: write files, report results

### Step 6: Suggest Next Steps
- Run tests
- Rebuild packages
- Update documentation

## Examples

### Example: Full Feature Scaffold

**Input:**
```
/coral-scaffold full-feature message-broker --shape hexagon --description "Message broker like Kafka or RabbitMQ"
```

**Output:**
```
Scaffolding 'message_broker' as a full feature...

Files to create:
  packages/viz/src/components/nodes/MessageBrokerNode.tsx
  packages/viz/src/components/nodes/MessageBrokerNode.test.tsx
  packages/language/test/message-broker.test.ts

Files to modify:
  packages/ir/src/types.ts
    + | 'message_broker'  (line 15, in NodeType)

  packages/ir/src/schema.ts
    + 'message_broker',  (line 8, in NodeTypeSchema)

  packages/language/grammar.js
    + 'message_broker',  (line 42, in node_type)

  packages/language/src/bridge.ts
    (no changes needed - handles all node types generically)

  packages/viz/src/components/nodes/index.ts
    + export { MessageBrokerNode } from './MessageBrokerNode';

  packages/viz/src/Editor.tsx
    + message_broker: MessageBrokerNode,  (line 23, in nodeTypes)

Next steps:
  1. Review generated files
  2. Run: pnpm --filter @coral/language build
  3. Run: pnpm test
  4. Customize the node component icon/styling if needed
```

## Implementation Notes

### Template System
Use a simple template system:
```typescript
const template = `
export function ${pascalCase(name)}Node({ data, selected }: NodeProps) {
  return (
    <div className="coral-node coral-node--${kebabCase(name)}">
      ${generateIcon(shape)}
      <div className="coral-node__label">{data.label}</div>
    </div>
  );
}
`;
```

### File Modification
For modifying existing files:
1. Parse to AST (for .ts files) or regex (for simpler cases)
2. Find insertion point
3. Insert new code
4. Format with Prettier

### Naming Conventions
- Node type: `snake_case` (e.g., `message_broker`)
- Component: `PascalCase` (e.g., `MessageBrokerNode`)
- CSS class: `kebab-case` (e.g., `coral-node--message-broker`)
- Grammar keyword: `snake_case` (e.g., `message_broker`)

## Dependencies

- File system access
- Code formatting (Prettier)
- Template engine (or simple string substitution)

## Open Questions

1. **Should it run builds automatically?**
   - After scaffold, run `pnpm build`?
   - Could be slow, might fail

2. **Interactive mode?**
   - Ask questions about shape, ports, etc.
   - vs. all options upfront

3. **Undo capability?**
   - Track what was generated
   - `/coral-scaffold --undo` to remove

4. **Custom templates?**
   - Allow users to define their own templates
   - For project-specific patterns

## Related Specifications

- [grammar-development agent](../agents/grammar-development.md) — For complex grammar changes
- [/coral-validate skill](coral-validate.md) — Validate after scaffold
