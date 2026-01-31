# tree-sitter-coral

Tree-sitter grammar for the Coral DSL (Domain Specific Language for architecture diagrams).

## Installation

```bash
npm install tree-sitter-coral
```

## Usage

```javascript
const Parser = require('tree-sitter');
const Coral = require('tree-sitter-coral');

const parser = new Parser();
parser.setLanguage(Coral);

const sourceCode = `
service "Web App"
database "PostgreSQL"

web_app -> postgresql [data_flow]
`;

const tree = parser.parse(sourceCode);
console.log(tree.rootNode.toString());
```

## Coral DSL Syntax

### Node Declarations

```coral
service "Web App"
database "PostgreSQL"
external_api "Stripe"
actor "User"
module "Auth Handler"
group "Backend Services"
```

Supported node types:
- `service` - A service or application
- `database` - A database or data store
- `external_api` - An external API or third-party service
- `actor` - A user or external system
- `module` - An internal module or component
- `group` - A logical grouping of nodes

### Node Bodies

Nodes can contain child nodes and properties:

```coral
service "Payment Service" {
  description: "Handles payment processing"
  technology: "Node.js"

  module "Validation"
  module "Processing"
}
```

### Edge Declarations

```coral
api -> database
api -> database [data_flow]
api -> queue [event, label = "OrderCreated"]
```

Edge attributes:
- First identifier is the relation type (e.g., `data_flow`, `http_request`, `event`)
- Additional attributes use `key = "value"` syntax

### Comments

```coral
// This is a comment
service "API"  // Inline comments are supported
```

## Development

```bash
# Generate parser
npm run generate

# Run tests
npm test

# Parse a file
npm run parse -- examples/sample.coral
```

## Test Corpus

Test cases are in `test/corpus/`:
- `nodes.txt` - Node declaration tests
- `edges.txt` - Edge declaration tests
- `comments.txt` - Comment tests

## License

MIT
