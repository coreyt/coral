/**
 * coral_from_codebase tool
 *
 * Generate diagrams from code analysis via Armada integration.
 */

import { z } from "zod";
import {
  ArmadaClient,
  transformContextToIR,
  transformDependenciesToIR,
  transformImpactToIR,
  transformTraceToIR,
  type TransformOptions,
} from "../armada/index.js";

export const fromCodebaseTool = {
  name: "coral_from_codebase",
  description:
    "Generate a diagram from code analysis. Queries Armada's knowledge graph to understand code structure and relationships, then transforms the results into a visual diagram.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Natural language query describing what to diagram. Examples: 'authentication flow', 'database models', 'API endpoints'",
      },
      type: {
        type: "string",
        enum: ["context", "dependencies", "impact", "trace"],
        description:
          "Type of diagram to generate: 'context' (semantic search), 'dependencies' (upstream/downstream), 'impact' (change blast radius), 'trace' (call paths)",
        default: "context",
      },
      scope: {
        type: "string",
        description:
          "Optional scope to limit the query (file path, module name, etc.)",
      },
      symbol: {
        type: "string",
        description:
          "Symbol ID for dependency/impact/trace analysis (required for non-context types)",
      },
      target: {
        type: "string",
        description: "Target symbol ID for trace analysis",
      },
      direction: {
        type: "string",
        enum: ["upstream", "downstream", "both"],
        description: "Direction for dependency analysis",
        default: "both",
      },
      format: {
        type: "string",
        enum: ["dsl", "json"],
        description: "Output format: 'dsl' for Coral DSL, 'json' for Graph-IR JSON",
        default: "json",
      },
      groupBy: {
        type: "string",
        enum: ["file", "module", "language", "none"],
        description: "How to group nodes in the diagram",
        default: "module",
      },
      maxNodes: {
        type: "number",
        description: "Maximum number of nodes to include",
        default: 50,
      },
    },
    required: ["query"],
  },
};

const FromCodebaseArgsSchema = z.object({
  query: z.string(),
  type: z.enum(["context", "dependencies", "impact", "trace"]).default("context"),
  scope: z.string().optional(),
  symbol: z.string().optional(),
  target: z.string().optional(),
  direction: z.enum(["upstream", "downstream", "both"]).default("both"),
  format: z.enum(["dsl", "json"]).default("json"),
  groupBy: z.enum(["file", "module", "language", "none"]).default("module"),
  maxNodes: z.number().default(50),
});

import type { GraphIR, GraphNode } from "../types.js";

/**
 * Convert Graph-IR to Coral DSL
 */
function irToDsl(ir: GraphIR): string {
  const lines: string[] = [];

  lines.push(`// Generated from codebase: ${ir.name || "Untitled"}`);
  lines.push(`// Source: Armada code analysis`);
  lines.push("");

  // Helper to process nodes (including nested)
  function processNode(node: GraphNode, indent = ""): void {
    const type = node.type || "service";
    const label = node.label || node.id;

    if (node.children && node.children.length > 0) {
      // Group node
      lines.push(`${indent}group "${label}" {`);
      for (const child of node.children) {
        processNode(child, indent + "  ");
      }
      lines.push(`${indent}}`);
    } else {
      // Regular node
      if (node.description) {
        lines.push(`${indent}${type} "${label}" {`);
        lines.push(`${indent}  description: "${node.description.replace(/"/g, '\\"')}"`);
        if (node.properties?.path) {
          lines.push(`${indent}  path: "${node.properties.path}"`);
        }
        lines.push(`${indent}}`);
      } else {
        lines.push(`${indent}${type} "${label}"`);
      }
    }
  }

  // Process all top-level nodes
  for (const node of ir.nodes) {
    processNode(node);
  }

  lines.push("");

  // Process edges
  for (const edge of ir.edges) {
    const relation = edge.type ? ` [${edge.type}]` : "";
    lines.push(`${edge.source} -> ${edge.target}${relation}`);
  }

  return lines.join("\n");
}

// Singleton client instance
let armadaClient: ArmadaClient | null = null;

/**
 * Get or create Armada client
 */
async function getArmadaClient(): Promise<ArmadaClient> {
  if (!armadaClient) {
    armadaClient = new ArmadaClient();
  }
  if (!armadaClient.isConnected()) {
    await armadaClient.connect();
  }
  return armadaClient;
}

export async function handleFromCodebase(args: unknown) {
  const parsed = FromCodebaseArgsSchema.parse(args);
  const { query, type, scope, symbol, target, direction, format, groupBy, maxNodes } = parsed;

  const transformOptions: TransformOptions = {
    groupBy,
    maxNodes,
    includeSourceInfo: true,
  };

  try {
    const client = await getArmadaClient();
    let ir: GraphIR;
    let summary: string;

    switch (type) {
      case "context": {
        const result = await client.getContext(query, scope);
        ir = transformContextToIR(result, transformOptions);
        summary = `Found ${result.nodes.length} code elements matching "${query}"`;
        break;
      }

      case "dependencies": {
        if (!symbol) {
          return {
            content: [
              {
                type: "text",
                text: "Error: 'symbol' is required for dependency analysis",
              },
            ],
            isError: true,
          };
        }
        const result = await client.findDependencies(symbol, direction);
        ir = transformDependenciesToIR(result, transformOptions);
        summary = `Found ${result.nodes.length} ${direction} dependencies of ${symbol}`;
        break;
      }

      case "impact": {
        if (!symbol) {
          return {
            content: [
              {
                type: "text",
                text: "Error: 'symbol' (file path) is required for impact analysis",
              },
            ],
            isError: true,
          };
        }
        const result = await client.impactOf(symbol, scope);
        ir = transformImpactToIR(result, transformOptions);
        summary = `Impact analysis shows ${result.impacted_nodes.length} affected elements (blast radius: ${result.blast_radius})`;
        break;
      }

      case "trace": {
        if (!symbol || !target) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Both 'symbol' (source) and 'target' are required for trace analysis",
              },
            ],
            isError: true,
          };
        }
        const result = await client.traceCalls(symbol, target);
        ir = transformTraceToIR(result, transformOptions);
        summary = result.found
          ? `Found ${result.paths.length} call paths from ${symbol} to ${target}`
          : `No call paths found from ${symbol} to ${target}`;
        break;
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Error: Unknown analysis type: ${type}`,
            },
          ],
          isError: true,
        };
    }

    // Convert to requested format
    const output = format === "dsl" ? irToDsl(ir) : JSON.stringify(ir, null, 2);

    return {
      content: [
        {
          type: "text",
          text: `${summary}\n\nDiagram (${ir.nodes.length} nodes, ${ir.edges.length} edges):\n\n${output}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check if it's a connection error
    if (message.includes("Not connected") || message.includes("ECONNREFUSED")) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Could not connect to Armada MCP server. Make sure Armada is running.\n\nOriginal error: ${message}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Error generating diagram from codebase: ${message}`,
        },
      ],
      isError: true,
    };
  }
}
