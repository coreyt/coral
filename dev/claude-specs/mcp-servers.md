# MCP Servers for Coral Development

This document identifies Model Context Protocol (MCP) servers that would be valuable for developing and using Coral.

## Overview

MCP servers extend Claude's capabilities by providing specialized tools. For Coral, we can benefit from:

1. **Existing MCP servers** to accelerate development
2. **Potential custom MCP servers** that Coral could provide to others

---

## Existing MCP Servers to Use

### 1. Tree-sitter MCP Server

**Purpose:** Parse code using Tree-sitter grammars directly in Claude conversations.

**Installation:**
```bash
claude mcp add tree-sitter -- npx -y @anthropic/mcp-server-tree-sitter
```

**Value for Coral:**
- Test Coral DSL grammar during development
- Parse source code for the code-to-diagram agent
- Debug grammar rules without leaving the conversation
- Generate AST visualizations

**Use Cases:**
```
User: Parse this Coral DSL and show the syntax tree:
      service "API" {
        port input(west)
      }

MCP: [returns CST via tree-sitter]
```

### 2. GitHub MCP Server

**Purpose:** Interact with GitHub repositories, issues, and PRs.

**Installation:**
```bash
claude mcp add github -- npx -y @anthropic/mcp-server-github
```

**Value for Coral:**
- Analyze repositories for code-to-diagram agent
- Create issues for discovered architecture documentation
- Review PRs for diagram consistency
- Fetch existing Mermaid diagrams for conversion

**Use Cases:**
```
User: Analyze the architecture of github.com/example/repo

MCP: [fetches repo structure, package.json files, etc.]
Agent: [generates architecture diagram]
```

### 3. Filesystem MCP Server

**Purpose:** Read and write files on the local filesystem.

**Installation:**
```bash
claude mcp add filesystem -- npx -y @anthropic/mcp-server-filesystem /path/to/allowed/dirs
```

**Value for Coral:**
- Read existing diagram files for conversion
- Write generated Coral DSL files
- Batch process directories of diagrams
- Access project source for code analysis

### 4. Fetch MCP Server

**Purpose:** Make HTTP requests to fetch web content.

**Installation:**
```bash
claude mcp add fetch -- npx -y @anthropic/mcp-server-fetch
```

**Value for Coral:**
- Fetch documentation for architecture understanding
- Download example diagrams from the web
- Access API specifications (OpenAPI/Swagger) for diagram generation
- Retrieve package information from npm/PyPI

### 5. PostgreSQL / SQLite MCP Server

**Purpose:** Query databases to understand schema.

**Installation:**
```bash
claude mcp add postgres -- npx -y @anthropic/mcp-server-postgres postgres://...
claude mcp add sqlite -- npx -y @anthropic/mcp-server-sqlite /path/to/db.sqlite
```

**Value for Coral:**
- Generate ER diagrams from database schema
- Understand data relationships for architecture diagrams
- Verify diagram accuracy against actual database

**Use Cases:**
```
User: Generate a diagram of our database schema

MCP: [queries information_schema]
Agent: [generates ER-style Coral diagram]
```

---

## Custom MCP Servers Coral Could Provide

### 1. Coral MCP Server

**Purpose:** Provide Coral diagram capabilities to any Claude conversation.

**Proposed Tools:**

| Tool | Description |
|------|-------------|
| `coral_generate` | Generate Graph-IR from natural language |
| `coral_validate` | Validate Coral DSL or Graph-IR |
| `coral_convert` | Convert between formats |
| `coral_layout` | Run ELK layout and return positions |
| `coral_render` | Generate SVG/PNG from Graph-IR |
| `coral_explain` | Generate explanation of a diagram |

**Installation (future):**
```bash
claude mcp add coral -- npx -y @anthropic/mcp-server-coral
```

**Use Cases:**
```
User: I need a diagram of our payment flow

MCP coral_generate: [returns Graph-IR]
MCP coral_render: [returns SVG]

User: [sees rendered diagram inline]
```

### 2. Architecture Analysis MCP Server

**Purpose:** Analyze codebases and generate architecture insights.

**Proposed Tools:**

| Tool | Description |
|------|-------------|
| `analyze_imports` | Extract import graph from source |
| `analyze_api` | Find API endpoints and handlers |
| `analyze_database` | Extract ORM models and relations |
| `detect_patterns` | Identify architectural patterns |
| `compare_diagrams` | Diff two architecture diagrams |

**Value:**
- Powers the code-to-diagram agent
- Could be used by other tools beyond Coral
- Provides structured architecture data

### 3. Diagram Interop MCP Server

**Purpose:** Parse and convert various diagram formats.

**Proposed Tools:**

| Tool | Description |
|------|-------------|
| `parse_mermaid` | Parse Mermaid to structured format |
| `parse_graphviz` | Parse DOT to structured format |
| `parse_plantuml` | Parse PlantUML to structured format |
| `parse_drawio` | Parse draw.io XML to structured format |
| `render_mermaid` | Render Mermaid to SVG |

**Value:**
- Enables format migration
- Provides Mermaid rendering even in non-browser contexts
- Standardizes diagram representation

---

## MCP Server Recommendations by Use Case

### For Coral Development Team

```bash
# Essential for grammar development
claude mcp add tree-sitter -- npx -y @anthropic/mcp-server-tree-sitter

# For testing against real repos
claude mcp add github -- npx -y @anthropic/mcp-server-github

# For local file operations
claude mcp add filesystem -- npx -y @anthropic/mcp-server-filesystem ~/projects
```

### For Coral Users (Architecture Documentation)

```bash
# Full Coral capabilities (future)
claude mcp add coral -- npx -y @anthropic/mcp-server-coral

# To analyze their codebase
claude mcp add filesystem -- npx -y @anthropic/mcp-server-filesystem .

# To fetch external docs
claude mcp add fetch -- npx -y @anthropic/mcp-server-fetch
```

### For Enterprise Architecture Teams

```bash
# Coral capabilities
claude mcp add coral -- npx -y @anthropic/mcp-server-coral

# Database schema analysis
claude mcp add postgres -- npx -y @anthropic/mcp-server-postgres $DB_URL

# Repository analysis
claude mcp add github -- npx -y @anthropic/mcp-server-github

# API spec fetching
claude mcp add fetch -- npx -y @anthropic/mcp-server-fetch
```

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   /coral    │  │ code-to-    │  │   Other Skills/Agents   │ │
│  │   skill     │  │ diagram     │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
│         │                │                       │              │
│         └────────────────┼───────────────────────┘              │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    MCP Server Layer                         ││
│  │                                                             ││
│  │  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  ││
│  │  │tree-sitter│  │  github  │  │filesystem│  │   coral   │  ││
│  │  │    MCP    │  │   MCP    │  │   MCP    │  │   MCP     │  ││
│  │  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  ││
│  └────────┼─────────────┼────────────┼───────────────┼────────┘│
│           │             │            │               │          │
└───────────┼─────────────┼────────────┼───────────────┼──────────┘
            │             │            │               │
            ▼             ▼            ▼               ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
     │Tree-sitter│  │  GitHub  │  │  Local   │  │ @coral/ir    │
     │  Parsers │  │   API    │  │  Files   │  │ @coral/lang  │
     └──────────┘  └──────────┘  └──────────┘  │ @coral/viz   │
                                               └──────────────┘
```

---

## Implementation Priority

### Phase 1: Use Existing MCPs (Now)
1. Add tree-sitter MCP for grammar development
2. Add filesystem MCP for local testing
3. Add GitHub MCP for repo analysis experiments

### Phase 2: Build Coral MCP Server
1. Implement core tools (generate, validate, convert)
2. Package as `@coral/mcp-server`
3. Publish to npm

### Phase 3: Build Specialized MCPs
1. Architecture analysis MCP (if code-to-diagram proves valuable)
2. Diagram interop MCP (if format conversion is heavily used)

---

## Configuration Example

**.claude/mcp.json** for Coral development:
```json
{
  "mcpServers": {
    "tree-sitter": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-tree-sitter"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/home/user/projects/coral"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

---

## Open Questions

1. **Should Coral MCP be a single server or multiple?**
   - One server with all tools vs specialized servers
   - Trade-off: simplicity vs modularity

2. **How to handle rendering in MCP?**
   - Return SVG as base64?
   - Return URL to rendered image?
   - Require browser context?

3. **Caching strategy?**
   - Cache parsed diagrams?
   - Cache layout results?
   - MCP servers are stateless by default

4. **Authentication for enterprise features?**
   - Some tools may need API keys (GitHub, databases)
   - How to handle securely in MCP context?
