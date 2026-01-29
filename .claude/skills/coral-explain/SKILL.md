---
name: coral-explain
description: Generate natural language explanations of Coral diagrams for documentation, onboarding, or architecture reviews
---

# /coral-explain

Generate natural language explanations of diagrams.

## Usage

```
/coral-explain [level]
<diagram content>
```

Or focus on a specific node:
```
/coral-explain --focus <node-id>
<diagram content>
```

## Explanation Levels

| Level | Description |
|-------|-------------|
| `brief` | One paragraph summary |
| `standard` | Section-by-section breakdown (default) |
| `detailed` | Comprehensive with every node and edge |

## Examples

### Brief Explanation
```
/coral-explain brief
service "API Gateway"
service "Auth Service"
database "PostgreSQL"
api_gateway -> auth_service [http_request]
auth_service -> postgresql [data_flow]
```
Output:
> This diagram shows a microservices architecture with an API Gateway routing requests to an Auth Service backed by a PostgreSQL database.

### Standard Explanation
```
/coral-explain
<diagram>
```
Output includes:
- Architecture Overview
- Components by Type
- Connections
- Observations (bottlenecks, coupling, missing components)

### Focus on Node
```
/coral-explain --focus auth_service
<diagram>
```
Output focuses on:
- Role of the node
- Incoming connections
- Outgoing connections
- Specific observations

## Pattern Detection

The skill identifies common patterns:
- **3-Tier**: Presentation → Business → Data layers
- **Microservices**: Multiple services with API gateway
- **Event-Driven**: Services connected via queues/events
- **Hub-and-Spoke**: Central node with many connections

## Observations

Provides actionable insights:
- Orphan nodes (no connections)
- Bottlenecks (many incoming connections)
- Shared resources (multiple services using same database)
- Missing components (no cache, no monitoring)

## Audience Modes

- `technical` - Full technical detail (default)
- `executive` - Focus on capabilities
- `onboarding` - Explain context, define terms

## Notes

- Auto-detects diagram format (DSL or JSON)
- Infers component roles from types and labels
- Uses connection patterns to understand data flow
