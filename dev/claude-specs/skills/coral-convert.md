# /coral-convert Skill

## Summary

Converts diagrams between formats: Mermaid, Graphviz DOT, PlantUML to Coral DSL, and optionally Coral to other formats. Enables migration from existing diagram libraries and interoperability with teams using different tools.

## Invocation

```
/coral-convert <format>
<diagram content>
```

Supported formats:
- `mermaid` or `mmd`
- `graphviz` or `dot`
- `plantuml` or `puml`
- `json` (Graph-IR JSON to DSL)

## Value Proposition

- **Easy migration**: Convert existing diagrams without manual rewriting
- **Interoperability**: Work with teams using different tools
- **Learning aid**: See how familiar formats map to Coral
- **Batch capability**: Convert entire directories

## Use Cases

### UC1: Mermaid to Coral
```
User: /coral-convert mermaid
      graph TD
        A[API Gateway] --> B[Auth Service]
        A --> C[User Service]
        B --> D[(Database)]
        C --> D

Output:
service "API Gateway"
service "Auth Service"
service "User Service"
database "Database"

api_gateway -> auth_service
api_gateway -> user_service
auth_service -> database [data_flow]
user_service -> database [data_flow]
```

### UC2: Graphviz DOT to Coral
```
User: /coral-convert dot
      digraph {
        rankdir=LR;
        api [label="API Server"];
        db [label="PostgreSQL" shape=cylinder];
        api -> db;
      }

Output:
service "API Server"
database "PostgreSQL"

api_server -> postgresql [data_flow]
```

### UC3: PlantUML to Coral
```
User: /coral-convert plantuml
      @startuml
      [Web App] as web
      [API] as api
      database "DB" as db
      web --> api
      api --> db
      @enduml

Output:
service "Web App"
service "API"
database "DB"

web_app -> api
api -> db [data_flow]
```

### UC4: JSON to DSL
```
User: /coral-convert json
      {
        "version": "1.0",
        "nodes": [
          {"id": "api", "type": "service", "label": "API"}
        ],
        "edges": []
      }

Output:
service "API"
```

### UC5: Coral to Mermaid (reverse)
```
User: /coral-convert to-mermaid
      service "API"
      database "DB"
      api -> db [data_flow]

Output:
graph TD
    api[API]
    db[(DB)]
    api --> db
```

## Interface

### Input Detection

The skill auto-detects format when possible:
- `graph TD` or `flowchart` → Mermaid
- `digraph` or `strict graph` → Graphviz
- `@startuml` → PlantUML
- `{` with `version`, `nodes` → Graph-IR JSON
- `service`, `database`, `->` → Coral DSL

### Output Format

Primary output is always Coral DSL (unless `to-*` format specified).

Include:
- Converted DSL
- Conversion notes (what was mapped, what was lost)
- Warnings for unsupported features

## Format Mappings

### Mermaid → Coral

| Mermaid | Coral |
|---------|-------|
| `A[Label]` | `service "Label"` |
| `A[(Label)]` | `database "Label"` |
| `A([Label])` | `service "Label"` (stadium shape) |
| `A{{Label}}` | `external_api "Label"` |
| `A((Label))` | `actor "Label"` (circle) |
| `A --> B` | `a -> b` |
| `A -.-> B` | `a -> b` + dashed style warning |
| `A ==> B` | `a -> b` + thick style warning |
| `subgraph Name` | `group "Name" { }` |
| `click A href` | Warning: not supported |

### Graphviz → Coral

| Graphviz | Coral |
|----------|-------|
| `node [shape=box]` | `service` |
| `node [shape=cylinder]` | `database` |
| `node [shape=ellipse]` | `service` (default) |
| `node [shape=diamond]` | `service` + warning |
| `A -> B` | `a -> b` |
| `A -> B [label="..."]` | `a -> b [label = "..."]` |
| `subgraph cluster_X` | `group "X" { }` |
| `rankdir=LR` | Note: layout hint, not in IR |

### PlantUML → Coral

| PlantUML | Coral |
|----------|-------|
| `[Component]` | `service "Component"` |
| `(Usecase)` | `service "Usecase"` |
| `database "Name"` | `database "Name"` |
| `actor Name` | `actor "Name"` |
| `package "Name" { }` | `group "Name" { }` |
| `A --> B` | `a -> b` |
| `A ..> B` | `a -> b` + dashed warning |
| `note "..."` | Warning: not supported |

### Coral → Mermaid (reverse)

| Coral | Mermaid |
|-------|---------|
| `service "X"` | `x[X]` |
| `database "X"` | `x[(X)]` |
| `external_api "X"` | `x{{X}}` |
| `actor "X"` | `x((X))` |
| `group "X" { }` | `subgraph X` |
| `a -> b` | `a --> b` |
| `a -> b [data_flow]` | `a --> b` |

## Behavior

### Step 1: Detect Format
- Check explicit format argument
- Otherwise, auto-detect from content

### Step 2: Parse Source
- Use format-specific parser
- Build intermediate representation

### Step 3: Map to Coral
- Convert node types
- Convert edges
- Convert hierarchy/grouping
- Collect warnings for unsupported features

### Step 4: Generate Output
- Format as Coral DSL
- Include conversion notes

### Step 5: Validate
- Run through Coral validator
- Report any issues with converted output

## Examples

### Example: Complex Mermaid

**Input:**
```
/coral-convert mermaid
graph TD
    subgraph Frontend
        A[React App]
        B[Load Balancer]
    end

    subgraph Backend
        C[API Gateway]
        D[Auth Service]
        E[User Service]
    end

    F[(PostgreSQL)]
    G([Redis])

    B --> A
    A --> C
    C --> D
    C --> E
    D --> F
    E --> F
    D --> G
```

**Output:**
```coral
// Converted from Mermaid

group "Frontend" {
  service "React App"
  service "Load Balancer"
}

group "Backend" {
  service "API Gateway"
  service "Auth Service"
  service "User Service"
}

database "PostgreSQL"
service "Redis"

load_balancer -> react_app
react_app -> api_gateway
api_gateway -> auth_service
api_gateway -> user_service
auth_service -> postgresql [data_flow]
user_service -> postgresql [data_flow]
auth_service -> redis

// Conversion notes:
// - Mermaid 'stadium shape' (Redis) mapped to service
// - Consider changing 'redis' to type 'database' if it's a cache
```

### Example: With Unsupported Features

**Input:**
```
/coral-convert mermaid
graph TD
    A[API] --> B[DB]
    click A "https://example.com"
    style A fill:#f9f
```

**Output:**
```coral
service "API"
database "DB"

api -> db [data_flow]

// Warnings:
// ⚠ Line 3: 'click' handlers are not supported in Coral
// ⚠ Line 4: 'style' directives are not supported in Coral
//   Consider using Coral themes for styling
```

## Implementation Notes

### Parser Strategy

**Mermaid:**
- Use regex-based extraction (Mermaid's internal parser is complex)
- Handle common flowchart patterns
- Gracefully skip unknown syntax

**Graphviz:**
- Use or adapt `graphviz-parser` npm package
- DOT syntax is well-defined

**PlantUML:**
- Custom regex-based parser
- Focus on component/deployment diagrams
- Skip UML-specific features (sequence, class details)

### ID Generation
- Convert labels to snake_case
- Remove special characters
- Ensure uniqueness (append numbers)
- Preserve original ID in metadata if different

### Lossy Conversion Warning
Always warn when information is lost:
```
// ⚠ Some features couldn't be converted:
// - Styling (colors, line styles) - use Coral themes
// - Interactivity (click handlers) - not supported
// - Custom shapes - mapped to closest Coral type
```

## Dependencies

- Format-specific parsers
- `@coral/ir` — For validation
- `@coral/language` — For DSL generation

## Open Questions

1. **Should we support batch conversion?**
   - `/coral-convert mermaid *.mmd`
   - Useful for migration

2. **Should we preserve layout hints?**
   - Mermaid `rankdir`, Graphviz `rank`
   - Could store in metadata

3. **Round-trip fidelity?**
   - Coral → Mermaid → Coral should be stable
   - Currently: likely to have differences

4. **Support for more formats?**
   - draw.io XML
   - Structurizr DSL
   - D2

## Related Specifications

- [format-migration agent](../agents/format-migration.md) — Full batch migration
- [/coral skill](coral.md) — Generate new diagrams
- [/coral-validate skill](coral-validate.md) — Validate converted output
