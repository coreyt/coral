# Diagram Generation Agent

## Summary

Generates valid Coral Graph-IR from natural language descriptions of system architectures. This is Coral's primary AI-native capability—users describe what they want in plain English, and the agent produces a structured diagram.

## Value Proposition

- **Lowers barrier to entry**: Users don't need to learn Coral DSL syntax to create diagrams
- **Leverages LLM strengths**: Natural language → structured JSON is where LLMs excel
- **Validates Coral's design**: Graph-IR was designed to be AI-friendly; this agent proves it
- **Enables iteration**: Users can refine diagrams through conversation

## Use Cases

### UC1: Quick Architecture Sketch
A developer needs to quickly sketch a system architecture for a design discussion.

```
User: "Create a diagram of a typical e-commerce backend with a web frontend,
       API gateway, microservices for users, products, and orders,
       and a shared PostgreSQL database"

Agent: [generates Graph-IR with 6 nodes, appropriate edges, proper types]
```

### UC2: Iterative Refinement
User builds up a diagram through multiple turns.

```
User: "Start with a simple web app connecting to a database"
Agent: [generates 2-node diagram]

User: "Add a Redis cache between them"
Agent: [updates to 3-node diagram with cache in the middle]

User: "Actually, the cache should be a sidecar to the web app, not in the request path"
Agent: [restructures edges]
```

### UC3: From Requirements Document
User provides detailed requirements and gets a comprehensive diagram.

```
User: "Here's our system requirements: [paste 500 words of requirements]
       Generate a C4 container diagram"

Agent: [generates hierarchical diagram with appropriate abstraction level]
```

### UC4: Template-Based Generation
User requests a standard architecture pattern.

```
User: "Generate a standard 3-tier web architecture"
Agent: [generates presentation/business/data layers with typical components]
```

## Interface

### Input

```typescript
interface DiagramGenerationInput {
  /** Natural language description of the desired diagram */
  description: string;

  /** Optional: Existing Graph-IR to modify (for iterative refinement) */
  existingGraph?: CoralGraph;

  /** Optional: Diagram type hint */
  diagramType?: 'system-context' | 'container' | 'component' | 'flowchart';

  /** Optional: Style preferences */
  preferences?: {
    /** Preferred flow direction */
    direction?: 'horizontal' | 'vertical';
    /** Level of detail */
    detail?: 'minimal' | 'standard' | 'detailed';
    /** Include metadata like descriptions */
    includeMetadata?: boolean;
  };
}
```

### Output

```typescript
interface DiagramGenerationOutput {
  /** The generated Graph-IR (always valid according to schema) */
  graph: CoralGraph;

  /** Coral DSL representation (for copy/paste) */
  dsl: string;

  /** Explanation of what was generated */
  explanation: string;

  /** Suggestions for refinement */
  suggestions?: string[];

  /** Warnings about ambiguities in the input */
  warnings?: string[];
}
```

## Behavior

### Step 1: Parse Intent
- Extract entities (services, databases, users, external systems)
- Identify relationships (calls, stores data, authenticates with)
- Determine appropriate node types
- Infer hierarchy (what contains what)

### Step 2: Map to Graph-IR Ontology
- Map entities to Coral node types: `service`, `database`, `external_api`, `actor`, `module`, `group`
- Map relationships to edge types: `dependency`, `data_flow`, `http_request`, `event`
- Determine port requirements (if relationships imply specific connection points)

### Step 3: Generate Graph-IR
- Create nodes with appropriate IDs (snake_case from labels)
- Create edges with correct source/target references
- Add metadata (descriptions) if requested
- Nest children for hierarchical structures

### Step 4: Validate
- Run Zod schema validation
- Check for cycles (DAG requirement)
- Verify all edge references exist
- Ensure unique node IDs

### Step 5: Generate DSL
- Convert Graph-IR to Coral DSL syntax
- Format cleanly for readability

### Step 6: Explain
- Summarize what was created
- Note any assumptions made
- Suggest potential improvements

## Examples

### Example 1: Simple Request

**Input:**
```
description: "A web API that connects to a PostgreSQL database and Redis cache"
```

**Output:**
```json
{
  "graph": {
    "version": "1.0",
    "nodes": [
      { "id": "web_api", "type": "service", "label": "Web API" },
      { "id": "postgresql", "type": "database", "label": "PostgreSQL" },
      { "id": "redis", "type": "database", "label": "Redis Cache" }
    ],
    "edges": [
      { "source": "web_api", "target": "postgresql", "relation": "data_flow" },
      { "source": "web_api", "target": "redis", "relation": "data_flow" }
    ]
  },
  "dsl": "service \"Web API\"\ndatabase \"PostgreSQL\"\ndatabase \"Redis Cache\"\n\nweb_api -> postgresql [data_flow]\nweb_api -> redis [data_flow]\n",
  "explanation": "Created a 3-node diagram with a Web API service connecting to both PostgreSQL (primary storage) and Redis (caching layer).",
  "suggestions": [
    "Consider adding an 'actor' node for the client/user",
    "You might want to specify the cache as type 'cache' if that's added to the schema"
  ]
}
```

### Example 2: Hierarchical Request

**Input:**
```
description: "An order service with internal modules for validation, payment processing, and inventory checks"
diagramType: "component"
```

**Output:**
```json
{
  "graph": {
    "version": "1.0",
    "nodes": [
      {
        "id": "order_service",
        "type": "service",
        "label": "Order Service",
        "children": [
          { "id": "validation", "type": "module", "label": "Validation" },
          { "id": "payment_processing", "type": "module", "label": "Payment Processing" },
          { "id": "inventory_check", "type": "module", "label": "Inventory Check" }
        ]
      }
    ],
    "edges": [
      { "source": "validation", "target": "payment_processing", "relation": "dependency" },
      { "source": "validation", "target": "inventory_check", "relation": "dependency" }
    ]
  },
  "dsl": "service \"Order Service\" {\n  module \"Validation\"\n  module \"Payment Processing\"\n  module \"Inventory Check\"\n}\n\nvalidation -> payment_processing\nvalidation -> inventory_check\n",
  "explanation": "Created a component diagram showing the Order Service with 3 internal modules. Validation runs first, then triggers both payment and inventory checks."
}
```

## Dependencies

### Required
- `@coral/ir` — Graph-IR type definitions and Zod schemas
- `@coral/language` — DSL printer (graphToDSL function)

### Optional
- `@coral/viz` — For visual preview (if running in environment with rendering)

## Implementation Notes

### Prompt Engineering
The agent should be primed with:
1. Full Graph-IR schema with explanations
2. Examples of well-formed diagrams (few-shot learning)
3. Common architecture patterns (microservices, 3-tier, event-driven)
4. Mapping from natural language terms to Coral types

### Validation Strategy
Always validate output before returning:
```typescript
const result = CoralGraphSchema.safeParse(generatedGraph);
if (!result.success) {
  // Self-correct or report error
}
```

### Handling Ambiguity
When input is ambiguous:
1. Make reasonable assumptions
2. Document assumptions in `explanation`
3. Offer alternatives in `suggestions`
4. Don't ask clarifying questions (that's for interactive skills, not agents)

### ID Generation
Generate IDs by:
1. Taking the label
2. Converting to lowercase
3. Replacing spaces with underscores
4. Removing special characters
5. Ensuring uniqueness (append numbers if needed)

## Open Questions

1. **Should the agent support multiple output formats?**
   - Just Graph-IR + DSL, or also Mermaid for compatibility?

2. **How should it handle very large diagrams?**
   - Token limits may prevent generating 100+ node diagrams
   - Could generate in chunks or suggest breaking into sub-diagrams

3. **Should it learn from user corrections?**
   - If user says "no, the cache should connect differently", should that inform future generations?

4. **Integration with code-to-diagram agent?**
   - Could this agent refine output from code analysis?

## Related Specifications

- [/coral skill](../skills/coral.md) — Interactive version of this agent
- [code-to-diagram agent](code-to-diagram.md) — Generates diagrams from source code
- [format-migration agent](format-migration.md) — Converts existing diagrams to Coral
