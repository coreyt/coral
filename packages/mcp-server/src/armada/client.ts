/**
 * Armada MCP Client
 *
 * Client for querying Armada's MCP server to get code context
 * and knowledge graph data for diagram generation.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

/**
 * Armada MCP tool names
 */
export type ArmadaTool =
  | "get_context"
  | "find_dependencies"
  | "impact_of"
  | "search"
  | "trace_calls"
  | "generate_cypher"
  | "generate_tree_sitter_query";

/**
 * Node from Armada's knowledge graph
 */
export interface ArmadaNode {
  id: string;
  type: string; // module, class, function, method, interface, struct, etc.
  name: string;
  path: string;
  language: string;
  docstring?: string;
  signature?: string;
  start_line?: number;
  end_line?: number;
  confidence?: number;
}

/**
 * Edge from Armada's knowledge graph
 */
export interface ArmadaEdge {
  id: string;
  source: string;
  target: string;
  type: string; // imports, calls, inherits, extends, implements, exports, belongs_to, embeds
  metadata?: Record<string, unknown>;
}

/**
 * Result from get_context
 */
export interface ContextResult {
  query: string;
  scope?: string;
  nodes: ArmadaNode[];
  edges: ArmadaEdge[];
  confidence: number;
}

/**
 * Result from find_dependencies
 */
export interface DependencyResult {
  symbol: string;
  direction: "upstream" | "downstream" | "both";
  nodes: ArmadaNode[];
  edges: ArmadaEdge[];
  depth: number;
}

/**
 * Result from impact_of
 */
export interface ImpactResult {
  file: string;
  symbol?: string;
  impacted_nodes: ArmadaNode[];
  impacted_edges: ArmadaEdge[];
  blast_radius: number;
}

/**
 * Result from trace_calls
 */
export interface TraceResult {
  source: string;
  target: string;
  paths: Array<{
    nodes: string[];
    edges: ArmadaEdge[];
  }>;
  found: boolean;
}

/**
 * Result from search
 */
export interface SearchResult {
  query: string;
  nodes: ArmadaNode[];
  total_count: number;
}

/**
 * Configuration for connecting to Armada
 */
export interface ArmadaClientConfig {
  /** Path to the Armada MCP server executable or command */
  serverCommand?: string;
  /** Arguments to pass to the server command */
  serverArgs?: string[];
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Working directory for the server process */
  cwd?: string;
}

const DEFAULT_CONFIG: Required<ArmadaClientConfig> = {
  serverCommand: "python",
  serverArgs: ["-m", "armada.mcp.server"],
  timeout: 30000,
  cwd: process.cwd(),
};

/**
 * Client for communicating with Armada's MCP server.
 *
 * Provides methods for querying code context, dependencies,
 * impact analysis, and call traces.
 */
export class ArmadaClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: Required<ArmadaClientConfig>;
  private connected = false;

  constructor(config: ArmadaClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Connect to the Armada MCP server.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const serverProcess = spawn(this.config.serverCommand, this.config.serverArgs, {
      cwd: this.config.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.transport = new StdioClientTransport({
      reader: serverProcess.stdout,
      writer: serverProcess.stdin,
    });

    this.client = new Client(
      {
        name: "coral-armada-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(this.transport);
    this.connected = true;
  }

  /**
   * Disconnect from the Armada MCP server.
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.close();
      this.client = null;
      this.transport = null;
      this.connected = false;
    }
  }

  /**
   * Check if connected to Armada.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Call an Armada MCP tool.
   */
  private async callTool<T>(name: ArmadaTool, args: Record<string, unknown>): Promise<T> {
    if (!this.client || !this.connected) {
      throw new Error("Not connected to Armada MCP server");
    }

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    // Parse the result content
    const content = result.content;
    if (!content || content.length === 0) {
      throw new Error(`No result from Armada tool: ${name}`);
    }

    const textContent = content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error(`Invalid result format from Armada tool: ${name}`);
    }

    return JSON.parse(textContent.text) as T;
  }

  /**
   * Get relevant code context for a natural language query.
   *
   * @param query Natural language query
   * @param scope Optional scope (file path, module name, etc.)
   * @param type Optional filter by node type
   */
  async getContext(
    query: string,
    scope?: string,
    type?: string
  ): Promise<ContextResult> {
    return this.callTool<ContextResult>("get_context", {
      query,
      ...(scope && { scope }),
      ...(type && { type }),
    });
  }

  /**
   * Find dependencies of a symbol.
   *
   * @param symbol Symbol ID or name
   * @param direction Direction to traverse (upstream, downstream, both)
   * @param depth Maximum traversal depth
   */
  async findDependencies(
    symbol: string,
    direction: "upstream" | "downstream" | "both" = "both",
    depth = 3
  ): Promise<DependencyResult> {
    return this.callTool<DependencyResult>("find_dependencies", {
      symbol,
      direction,
      depth,
    });
  }

  /**
   * Analyze the impact of changes to a file or symbol.
   *
   * @param file File path
   * @param symbol Optional symbol within the file
   */
  async impactOf(file: string, symbol?: string): Promise<ImpactResult> {
    return this.callTool<ImpactResult>("impact_of", {
      file,
      ...(symbol && { symbol }),
    });
  }

  /**
   * Semantic search for code.
   *
   * @param query Search query
   * @param type Optional filter by node type
   * @param limit Maximum results
   */
  async search(
    query: string,
    type?: string,
    limit = 20
  ): Promise<SearchResult> {
    return this.callTool<SearchResult>("search", {
      query,
      ...(type && { type }),
      limit,
    });
  }

  /**
   * Find call paths between two nodes.
   *
   * @param source Source node ID
   * @param target Target node ID
   * @param maxDepth Maximum path depth
   */
  async traceCalls(
    source: string,
    target: string,
    maxDepth = 5
  ): Promise<TraceResult> {
    return this.callTool<TraceResult>("trace_calls", {
      source,
      target,
      max_depth: maxDepth,
    });
  }
}

/**
 * Create and connect an Armada client.
 *
 * @param config Client configuration
 * @returns Connected client
 */
export async function createArmadaClient(
  config: ArmadaClientConfig = {}
): Promise<ArmadaClient> {
  const client = new ArmadaClient(config);
  await client.connect();
  return client;
}
