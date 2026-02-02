# Getting Started with Coral

This guide will get you from zero to your first diagram.

## Prerequisites

- **Node.js 20.x** — Coral uses nvm to manage versions. An `.nvmrc` file is included.

## Installation

```bash
# Clone the repository
git clone https://github.com/coreyt/coral.git
cd coral

# Load the correct Node version
nvm use

# Install dependencies
npm install
```

## Running the Visual Editor

```bash
cd packages/viz-demo
npm run dev
```

Open http://localhost:5173 in your browser.

## Your First Diagram

The editor opens with a sample flowchart. Try these interactions:

### Edit the Text (Left Panel)

Replace the sample with:

```coral
service "Web App"
database "PostgreSQL"
external_api "Auth0"

web_app -> postgresql [data_flow]
web_app -> auth0 [http_request]
```

The diagram updates automatically as you type.

### Edit Visually (Center Panel)

- **Drag nodes** to reposition them
- **Click a node** to select it and view properties
- **Scroll** to zoom in/out
- **Click and drag background** to pan

### Use the Toolbar

The floating toolbar provides:
- **Zoom controls** — Zoom in, out, or fit to view
- **Reflow** — Re-run automatic layout (Ctrl+Shift+L)
- **Undo/Redo** — Revert layout changes (Ctrl+Z / Ctrl+Shift+Z)

## Node Types

Coral supports these node types:

| Type | Use For |
|------|---------|
| `service` | APIs, microservices, applications |
| `database` | Data stores, caches |
| `module` | Internal components, decision points |
| `external_api` | Third-party services |
| `actor` | Users, clients |
| `group` | Logical groupings, containers |

## Edge Syntax

Connect nodes with arrows:

```coral
source -> target                     // Basic edge
source -> target [relation_type]     // With relation type
source -> target [type, label="msg"] // With attributes
```

## What's Next?

See the **[User Guide](user-guide.md)** for:
- Complete DSL syntax reference
- Notation systems (Flowchart, BPMN, ERD, etc.)
- Layout algorithms and configuration
- File save/load
- Keyboard shortcuts
