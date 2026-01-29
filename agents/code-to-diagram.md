# Code-to-Diagram Agent

Extract architecture diagrams from source code analysis.

## Purpose

This agent analyzes source code to automatically generate architecture diagrams. It addresses the "documentation drift" problem by creating diagrams directly from code, ensuring they reflect the actual system structure.

## Capabilities

1. **Language Detection**
   - TypeScript/JavaScript
   - Python
   - Go
   - Java
   - Rust

2. **Analysis Types**
   - Import/dependency graphs
   - API endpoint mapping
   - Database model extraction
   - Service boundary detection

3. **Abstraction Levels**
   - System context (external interactions)
   - Container (deployable units)
   - Component (internal modules)
   - Code (class/function level)

## When to Use

- Understanding unfamiliar codebases
- Generating initial architecture documentation
- Detecting actual vs documented dependencies
- Keeping diagrams in sync with code changes

## Analysis Strategies

### Import Analysis
```
User: Analyze imports in src/

Agent: Scanning src/ for import statements...

Found 3 main modules:
- api/ (12 files) - imports from services/, database/
- services/ (8 files) - imports from database/, utils/
- database/ (4 files) - imports from utils/

[Generates module dependency diagram]

group "API Layer" {
  module "Controllers"
  module "Middleware"
  module "Routes"
}

group "Service Layer" {
  module "UserService"
  module "AuthService"
  module "PaymentService"
}

group "Data Layer" {
  module "Database"
  module "Cache"
}

controllers -> user_service
controllers -> auth_service
middleware -> auth_service
user_service -> database
auth_service -> database
auth_service -> cache
```

### API Endpoint Extraction
```
User: Extract REST endpoints from this Express app

Agent: Scanning for route definitions...

Found 12 endpoints:
- GET /users
- POST /users
- GET /users/:id
- PUT /users/:id
- DELETE /users/:id
- POST /auth/login
- POST /auth/logout
- GET /products
- ...

[Generates API diagram]

actor "Client"
service "API Gateway" {
  module "Auth Routes"
  module "User Routes"
  module "Product Routes"
}
service "Auth Handler"
service "User Handler"
service "Product Handler"

client -> api_gateway [http_request]
auth_routes -> auth_handler
user_routes -> user_handler
product_routes -> product_handler
```

### Database Schema Extraction
```
User: Create diagram from our Prisma schema

Agent: Parsing schema.prisma...

Found 5 models:
- User (id, email, name, posts)
- Post (id, title, content, author, comments)
- Comment (id, text, author, post)
- Category (id, name, posts)
- Tag (id, name, posts)

[Generates ER-style diagram]

database "User" {
  description: "User accounts"
}
database "Post" {
  description: "Blog posts"
}
database "Comment" {
  description: "Post comments"
}

user -> post [data_flow, label = "1:N"]
post -> comment [data_flow, label = "1:N"]
user -> comment [data_flow, label = "1:N"]
category -> post [data_flow, label = "N:M"]
tag -> post [data_flow, label = "N:M"]
```

## Workflow

```
1. User specifies target directory/files
2. Agent detects language and framework
3. Agent scans for relevant patterns
4. Agent extracts entities and relationships
5. Agent generates Graph-IR
6. Agent presents diagram with explanations
7. User can request different views or refinements
```

## Configuration Options

- `--depth <level>` - Analysis depth (shallow, medium, deep)
- `--include <pattern>` - Include specific files/directories
- `--exclude <pattern>` - Exclude files/directories
- `--language <lang>` - Force language detection
- `--framework <name>` - Hint about framework (express, fastapi, etc.)

## Example Session

```
User: Analyze the architecture of this Node.js project

Agent: I'll analyze the project structure. Let me scan the codebase...

Detected:
- Language: TypeScript
- Framework: Express.js
- Database: PostgreSQL (via Prisma)
- Structure: src/ with api/, services/, models/

Generating container diagram...

[Output diagram]

actor "Web Client"
actor "Mobile Client"

service "API Server" {
  module "Auth Module"
  module "User Module"
  module "Product Module"
}

database "PostgreSQL"
database "Redis" {
  description: "Session cache"
}

web_client -> api_server [http_request]
mobile_client -> api_server [http_request]
api_server -> postgresql [data_flow]
api_server -> redis [data_flow]

Key findings:
- 3 main modules identified
- Database accessed directly from all modules
- Redis used for caching (found in auth module)
- No message queue detected

Would you like me to:
1. Zoom into a specific module?
2. Show the database schema?
3. Map the API endpoints?
```

## Guidance for Agent

1. **Start with High-Level View**
   - Container/service boundaries first
   - Drill down on request

2. **Detect Frameworks**
   - Look for package.json, requirements.txt, go.mod
   - Identify common patterns (Express routes, FastAPI endpoints)

3. **Find Entry Points**
   - Main files, route definitions
   - Exported modules

4. **Trace Dependencies**
   - Import statements
   - Dependency injection
   - Configuration files

5. **Handle Complexity**
   - Large codebases: offer filtered views
   - Circular dependencies: note them
   - External services: infer from API calls

## Limitations

- Cannot analyze compiled/minified code
- May miss runtime dependencies
- Requires readable source code
- Framework-specific patterns may need hints

## Related

- `diagram-generation` agent - Generate from description
- `/coral-explain` - Explain generated diagrams
- `format-migration` agent - Convert existing diagrams
