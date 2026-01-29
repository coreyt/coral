# /coral-explain Skill

## Summary

Generates human-readable explanations of Coral diagrams. Takes Graph-IR or Coral DSL and produces natural language descriptions suitable for documentation, onboarding, or understanding unfamiliar architectures.

## Invocation

```
/coral-explain [level]
<diagram content>
```

Levels:
- `brief` — One paragraph summary
- `standard` — Section-by-section breakdown (default)
- `detailed` — Comprehensive with every node and edge

## Value Proposition

- **Documentation aid**: Auto-generate architecture descriptions
- **Onboarding**: Help new team members understand systems
- **Review**: Verify diagram matches intended architecture
- **Accessibility**: Make diagrams accessible to non-visual consumers

## Use Cases

### UC1: Quick Summary
```
User: /coral-explain brief
      service "API Gateway"
      service "Auth Service"
      service "User Service"
      database "PostgreSQL"

      api_gateway -> auth_service [http_request]
      api_gateway -> user_service [http_request]
      auth_service -> postgresql [data_flow]
      user_service -> postgresql [data_flow]

Output:
This diagram shows a microservices architecture with an API Gateway
routing requests to Auth and User services, both backed by a shared
PostgreSQL database.
```

### UC2: Standard Explanation
```
User: /coral-explain
      [same diagram as above]

Output:
# Architecture Overview

This diagram depicts a microservices architecture with 4 components.

## Components

### Services (3)
- **API Gateway**: The entry point that routes requests to backend services
- **Auth Service**: Handles authentication
- **User Service**: Manages user data

### Data Stores (1)
- **PostgreSQL**: Relational database shared by multiple services

## Connections

### API Gateway
- Routes to Auth Service (HTTP)
- Routes to User Service (HTTP)

### Backend Services
- Auth Service reads/writes to PostgreSQL
- User Service reads/writes to PostgreSQL

## Observations
- Both services share a database (consider if this creates tight coupling)
- No caching layer visible
- No external integrations shown
```

### UC3: Detailed Documentation
```
User: /coral-explain detailed
      [complex diagram with 20 nodes]

Output:
[Multi-page detailed explanation with every node, edge, and architectural pattern identified]
```

### UC4: Focus on Specific Node
```
User: /coral-explain --focus auth_service
      [diagram]

Output:
# Auth Service Analysis

## Role
The Auth Service handles authentication for the system.

## Incoming Connections
- Receives HTTP requests from API Gateway

## Outgoing Connections
- Reads/writes user credentials to PostgreSQL

## Observations
- Single point of authentication (good for consistency)
- Direct database access (consider adding a cache for session data)
```

## Interface

### Input

```typescript
interface ExplainInput {
  /** Diagram content (DSL or JSON) */
  diagram: string;

  /** Explanation detail level */
  level?: 'brief' | 'standard' | 'detailed';

  /** Focus on specific node */
  focus?: string;

  /** Output format */
  format?: 'markdown' | 'plain' | 'html';

  /** Include suggestions/observations */
  includeSuggestions?: boolean;

  /** Target audience */
  audience?: 'technical' | 'executive' | 'onboarding';
}
```

### Output

```typescript
interface ExplainOutput {
  /** The explanation text */
  explanation: string;

  /** Structured data (for programmatic use) */
  structured?: {
    summary: string;
    components: ComponentSummary[];
    connections: ConnectionSummary[];
    patterns: string[];
    suggestions: string[];
  };
}

interface ComponentSummary {
  id: string;
  type: string;
  label: string;
  role: string;
  incomingCount: number;
  outgoingCount: number;
}

interface ConnectionSummary {
  from: string;
  to: string;
  type: string;
  description: string;
}
```

## Explanation Templates

### Brief Template
```
This diagram shows a {pattern} architecture with {nodeCount} components.
{mainFlow}. Key technologies include {technologies}.
```

### Standard Template
```markdown
# Architecture Overview

{summary}

## Components

### {type1} ({count1})
{componentList1}

### {type2} ({count2})
{componentList2}

## Data Flow

{flowDescription}

## Observations

{observations}
```

### Detailed Template
```markdown
# {title} Architecture Documentation

## Executive Summary
{executiveSummary}

## System Overview
{systemOverview}

## Component Catalog

### {componentName}
- **Type**: {type}
- **Purpose**: {purpose}
- **Interfaces**:
  - Incoming: {incoming}
  - Outgoing: {outgoing}
- **Dependencies**: {dependencies}
- **Notes**: {notes}

[Repeated for each component]

## Integration Points
{integrations}

## Data Flow Diagrams
{dataFlowNarrative}

## Security Considerations
{securityNotes}

## Scalability Notes
{scalabilityNotes}

## Appendix
{appendix}
```

## Behavior

### Step 1: Parse Diagram
- Detect format (DSL or JSON)
- Parse to Graph-IR

### Step 2: Analyze Structure
- Count nodes by type
- Identify clusters/groups
- Calculate connectivity metrics
- Detect patterns (3-tier, microservices, event-driven, etc.)

### Step 3: Generate Descriptions
- For each node: infer role from type, label, connections
- For each edge: describe the relationship
- For groups: describe the cluster's purpose

### Step 4: Identify Patterns
Common patterns to detect:
- **3-Tier**: Presentation → Business → Data
- **Microservices**: Multiple services with API gateway
- **Event-Driven**: Services connected via queues
- **Hub-and-Spoke**: Central node with many connections
- **Pipeline**: Linear flow of data
- **Star**: Single service connected to many databases

### Step 5: Generate Observations
- Unused nodes (no connections)
- Potential bottlenecks (many incoming connections)
- Missing components (e.g., no cache, no monitoring)
- Coupling issues (shared databases)

### Step 6: Format Output
- Apply template based on level
- Format for requested output type

## Examples

### Example: E-Commerce Architecture

**Input:**
```
/coral-explain standard
group "Frontend" {
  service "Web App"
  service "Mobile BFF"
}

group "Services" {
  service "Product Catalog"
  service "Shopping Cart"
  service "Order Processing"
  service "Payment"
}

group "Data" {
  database "Products DB"
  database "Orders DB"
  database "Redis Cache"
}

external_api "Stripe"
external_api "Shipping Provider"

web_app -> product_catalog [http_request]
web_app -> shopping_cart [http_request]
mobile_bff -> product_catalog [http_request]
mobile_bff -> shopping_cart [http_request]
shopping_cart -> redis_cache [data_flow]
order_processing -> payment [http_request]
payment -> stripe [http_request]
order_processing -> shipping_provider [http_request]
product_catalog -> products_db [data_flow]
order_processing -> orders_db [data_flow]
```

**Output:**
```markdown
# E-Commerce Architecture Overview

This diagram depicts a modern e-commerce platform with 10 internal components
and 2 external integrations, organized into three tiers.

## Component Groups

### Frontend (2 services)
- **Web App**: Browser-based shopping interface
- **Mobile BFF**: Backend-for-Frontend serving mobile applications

### Services (4 services)
- **Product Catalog**: Manages product listings and search
- **Shopping Cart**: Handles cart state and checkout flow
- **Order Processing**: Orchestrates order fulfillment
- **Payment**: Processes payments via Stripe integration

### Data (3 stores)
- **Products DB**: Product information persistence
- **Orders DB**: Order history and status
- **Redis Cache**: Session and cart caching

## External Integrations

- **Stripe**: Payment processing
- **Shipping Provider**: Order fulfillment and tracking

## Data Flow

1. **Browse Flow**: Web/Mobile → Product Catalog → Products DB
2. **Cart Flow**: Web/Mobile → Shopping Cart → Redis Cache
3. **Checkout Flow**: Order Processing → Payment → Stripe
4. **Fulfillment Flow**: Order Processing → Shipping Provider

## Observations

- **Caching Strategy**: Redis caches cart data, reducing database load
- **Payment Isolation**: Payment service is separate, enabling PCI compliance isolation
- **Mobile Support**: Dedicated BFF suggests mobile-specific API needs
- **Potential Improvement**: Consider adding a search service (e.g., Elasticsearch)
  for Product Catalog if catalog is large
```

### Example: Focus Mode

**Input:**
```
/coral-explain --focus order_processing
[same diagram]
```

**Output:**
```markdown
# Order Processing Service

## Role
Central orchestration service for order fulfillment.

## Incoming Connections
(None shown in diagram - likely receives events or API calls from Shopping Cart)

## Outgoing Connections
- **Payment Service** (HTTP): Initiates payment processing
- **Shipping Provider** (HTTP): Triggers shipping fulfillment
- **Orders DB** (Data): Persists order records

## Responsibilities (Inferred)
1. Validate order details
2. Coordinate payment collection
3. Initiate shipping
4. Track order status
5. Persist order history

## Architectural Notes
- This is a coordinator/orchestrator service
- Consider saga pattern for distributed transaction management
- May benefit from event sourcing for order state
```

## Implementation Notes

### Pattern Detection
Use graph analysis:
```typescript
function detectPattern(graph: CoralGraph): string[] {
  const patterns: string[] = [];

  // Check for API Gateway pattern
  const gatewayNode = graph.nodes.find(n =>
    n.label.toLowerCase().includes('gateway') ||
    n.label.toLowerCase().includes('api')
  );
  if (gatewayNode) {
    const outgoing = graph.edges.filter(e => e.source === gatewayNode.id);
    if (outgoing.length >= 3) {
      patterns.push('API Gateway Pattern');
    }
  }

  // Check for event-driven
  const queues = graph.nodes.filter(n =>
    n.type === 'queue' || n.label.toLowerCase().includes('queue')
  );
  if (queues.length > 0) {
    patterns.push('Event-Driven Architecture');
  }

  // Check for 3-tier
  // ... etc

  return patterns;
}
```

### Role Inference
Infer roles from:
- Node type (`database` → "data store")
- Label keywords (`auth` → "authentication")
- Connection patterns (many incoming → "aggregator")

### Audience Adaptation
- **Technical**: Include all details, use technical terms
- **Executive**: Focus on capabilities, hide implementation
- **Onboarding**: Explain context, define terms

## Dependencies

- `@coral/ir` — For type information
- `@coral/language` — For parsing DSL

## Open Questions

1. **Should it generate diagrams for documentation?**
   - Output Mermaid/PlantUML for docs that need rendered diagrams

2. **Integration with code comments?**
   - Pull descriptions from source code docstrings

3. **Versioning support?**
   - "What changed between v1 and v2 of this diagram?"

4. **Natural language queries?**
   - "How does data get from the web app to the database?"

## Related Specifications

- [/coral skill](coral.md) — Generate diagrams
- [code-to-diagram agent](../agents/code-to-diagram.md) — Could explain generated diagrams
- [diagram-generation agent](../agents/diagram-generation.md) — Inverse operation
