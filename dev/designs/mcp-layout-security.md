# MCP, Layout, Workers, and Supply Chain

The MCP server is stdio-only. JSON inputs are validated by `@graph-ir/core`; Coral text is parsed by `@coral-viz/language` and then validated. ELK computes positions and edge sections. Natural-language generation remains deterministic heuristic extraction, not semantic understanding.

The browser speech backend loads Transformers in a module worker. Vite owns worker bundling and emits the worker, browser runtime, and WASM assets. No esbuild fallback exists.

The root lockfile, exact direct versions, npm install-script allowlist, weekly Dependabot checks, high-severity audit gate, and package dry-runs form the 0.2 supply-chain baseline. Native Tree-sitter generated sources are committed so compilation does not race grammar generation.
