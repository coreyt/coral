# @coral/mcp-server

MCP (Model Context Protocol) server providing Coral diagram capabilities.

## Tools

### coral_generate

Generate Coral diagrams from natural language descriptions.

**Input:**
- `description` (required): Natural language description of the system
- `format`: Output format - `dsl` (default) or `json`
- `style`: Output style - `minimal` (default) or `detailed`

**Example:**
```json
{
  "description": "E-commerce system with web frontend, API gateway, and PostgreSQL database"
}
```

### coral_validate

Validate Coral DSL or Graph-IR JSON for correctness.

**Input:**
- `content` (required): The diagram content to validate
- `strict`: Treat warnings as errors (default: false)

**Checks:**
- Syntax validation
- Schema compliance
- Cycle detection
- Reference integrity

### coral_convert

Convert between diagram formats.

**Input:**
- `content` (required): The diagram content to convert
- `from`: Source format - `auto` (default), `mermaid`, `dot`, `plantuml`, `coral`
- `to`: Target format - `coral` (default), `mermaid`, `json`

**Example:**
```json
{
  "content": "graph TD\n  A[API] --> B[(Database)]",
  "from": "mermaid",
  "to": "coral"
}
```

### coral_layout

Run ELK layout algorithm and return node positions.

**Input:**
- `content` (required): Graph-IR JSON or Coral DSL to layout
- `options.direction`: Layout direction - `RIGHT` (default), `DOWN`, `LEFT`, `UP`
- `options.nodeSpacing`: Spacing between nodes (default: 50)
- `options.layerSpacing`: Spacing between layers (default: 50)
- `options.algorithm`: Layout algorithm - `layered` (default), `mrtree`, `force`, `box`

**Output:** JSON with computed node positions (x, y, width, height) and diagram dimensions.

### coral_render

Generate SVG visualization of a diagram.

**Input:**
- `content` (required): Graph-IR JSON or Coral DSL to render
- `options.direction`: Layout direction - `RIGHT` (default), `DOWN`, `LEFT`, `UP`
- `options.theme`: Color theme - `light` (default), `dark`
- `options.nodeSpacing`: Spacing between nodes (default: 50)

**Output:** SVG string with rendered diagram.

### coral_explain

Generate natural language explanations of diagrams.

**Input:**
- `content` (required): The diagram to explain
- `level`: Detail level - `brief`, `standard` (default), `detailed`
- `focus`: Optional node ID to focus explanation on

## Installation

```bash
# From the coral repository root
pnpm install
pnpm --filter @coral/mcp-server build
```

## Usage with Claude Code

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "coral": {
      "command": "node",
      "args": ["/path/to/coral/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Development

```bash
# Build
pnpm --filter @coral/mcp-server build

# Watch mode
pnpm --filter @coral/mcp-server dev

# Test
pnpm --filter @coral/mcp-server test
```

## License

MIT
