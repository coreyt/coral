/**
 * coral_generate tool
 *
 * Generate Coral DSL or Graph-IR from natural language descriptions.
 */

import { z } from "zod";

export const generateTool = {
  name: "coral_generate",
  description:
    "Generate a Coral diagram from a natural language description. Returns valid Coral DSL that can be used directly.",
  inputSchema: {
    type: "object" as const,
    properties: {
      description: {
        type: "string",
        description:
          "Natural language description of the system architecture to diagram",
      },
      format: {
        type: "string",
        enum: ["dsl", "json"],
        description: "Output format: 'dsl' for Coral DSL (default), 'json' for Graph-IR JSON",
        default: "dsl",
      },
      style: {
        type: "string",
        enum: ["minimal", "detailed"],
        description:
          "Output style: 'minimal' for basic diagram, 'detailed' for descriptions and metadata",
        default: "minimal",
      },
    },
    required: ["description"],
  },
};

const GenerateArgsSchema = z.object({
  description: z.string(),
  format: z.enum(["dsl", "json"]).default("dsl"),
  style: z.enum(["minimal", "detailed"]).default("minimal"),
});

interface Node {
  id: string;
  type: string;
  label: string;
  description?: string;
}

interface Edge {
  source: string;
  target: string;
  relation?: string;
  label?: string;
}

interface DiagramData {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Parse natural language to extract diagram components.
 * This is a simplified implementation - in production, this would
 * use more sophisticated NLP or delegate to an LLM.
 */
function parseDescription(description: string): DiagramData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeMap = new Map<string, string>();

  // Keywords that indicate node types
  const typeKeywords: Record<string, string[]> = {
    service: ["service", "microservice", "api", "server", "backend", "frontend", "app", "application"],
    database: ["database", "db", "postgres", "mysql", "mongo", "store", "storage"],
    external_api: ["external", "third-party", "stripe", "aws", "cloud"],
    actor: ["user", "client", "customer", "admin"],
    group: ["group", "cluster", "tier", "layer"],
  };

  // Relationship keywords
  const relationKeywords: Record<string, string[]> = {
    http_request: ["calls", "requests", "sends to", "connects to"],
    data_flow: ["stores", "reads", "writes", "queries", "persists"],
    dependency: ["depends on", "uses", "requires"],
    event: ["publishes", "emits", "triggers", "subscribes"],
  };

  // Convert label to snake_case ID
  function toId(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
  }

  // Infer node type from label
  function inferType(label: string): string {
    const lowerLabel = label.toLowerCase();
    for (const [type, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some((kw) => lowerLabel.includes(kw))) {
        return type;
      }
    }
    return "service"; // Default
  }

  // Simple extraction: split by common connectors and look for nouns
  const words = description.toLowerCase();

  // Extract potential components (simple heuristic)
  const componentPattern = /(?:a|an|the|with)?\s*(\w+(?:\s+\w+)?)\s*(?:service|database|api|server|app|client|cache|queue)?/gi;
  const matches = [...description.matchAll(componentPattern)];

  // Look for common architecture patterns
  const patterns = [
    { pattern: /(\w+)\s*->\s*(\w+)/gi, relation: "dependency" },
    { pattern: /(\w+)\s+(?:connects?|calls?|sends?)\s+(?:to\s+)?(\w+)/gi, relation: "http_request" },
    { pattern: /(\w+)\s+(?:stores?|writes?|reads?|queries?)\s+(?:from\s+|to\s+)?(\w+)/gi, relation: "data_flow" },
  ];

  // Extract from "with" clauses: "system with A, B, and C"
  const withMatch = description.match(/with\s+(.+?)(?:\.|$)/i);
  if (withMatch) {
    const components = withMatch[1].split(/,\s*|\s+and\s+/);
    for (const comp of components) {
      const trimmed = comp.trim();
      if (trimmed && trimmed.length > 1) {
        const id = toId(trimmed);
        if (!nodeMap.has(id)) {
          nodeMap.set(id, trimmed);
          nodes.push({
            id,
            type: inferType(trimmed),
            label: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
          });
        }
      }
    }
  }

  // If we haven't extracted anything, create a basic structure
  if (nodes.length === 0) {
    // Look for specific components mentioned
    const mentioned = description.match(/\b(api|database|web|app|server|service|client|cache|frontend|backend)\b/gi);
    if (mentioned) {
      const unique = [...new Set(mentioned.map((m) => m.toLowerCase()))];
      for (const comp of unique) {
        const id = toId(comp);
        if (!nodeMap.has(id)) {
          nodeMap.set(id, comp);
          nodes.push({
            id,
            type: inferType(comp),
            label: comp.charAt(0).toUpperCase() + comp.slice(1),
          });
        }
      }
    }
  }

  // Create edges based on typical flow patterns
  if (nodes.length >= 2) {
    // Simple heuristic: services connect to databases, frontends connect to backends
    const services = nodes.filter((n) => n.type === "service");
    const databases = nodes.filter((n) => n.type === "database");

    for (const service of services) {
      for (const db of databases) {
        edges.push({
          source: service.id,
          target: db.id,
          relation: "data_flow",
        });
      }
    }

    // Connect services in a chain if no other pattern detected
    if (edges.length === 0 && services.length >= 2) {
      for (let i = 0; i < services.length - 1; i++) {
        edges.push({
          source: services[i].id,
          target: services[i + 1].id,
          relation: "http_request",
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Generate Coral DSL from diagram data
 */
function toDsl(data: DiagramData, detailed: boolean): string {
  const lines: string[] = [];

  lines.push("// Generated by coral_generate");
  lines.push("");

  // Group nodes by type for organization
  const byType = new Map<string, Node[]>();
  for (const node of data.nodes) {
    const existing = byType.get(node.type) || [];
    existing.push(node);
    byType.set(node.type, existing);
  }

  // Output nodes grouped by type
  for (const [type, nodes] of byType) {
    for (const node of nodes) {
      if (detailed && node.description) {
        lines.push(`${type} "${node.label}" {`);
        lines.push(`  description: "${node.description}"`);
        lines.push("}");
      } else {
        lines.push(`${type} "${node.label}"`);
      }
    }
    lines.push("");
  }

  // Output edges
  for (const edge of data.edges) {
    if (edge.relation && edge.relation !== "dependency") {
      lines.push(`${edge.source} -> ${edge.target} [${edge.relation}]`);
    } else {
      lines.push(`${edge.source} -> ${edge.target}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate Graph-IR JSON from diagram data
 */
function toJson(data: DiagramData): string {
  const ir = {
    version: "1.0",
    nodes: data.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      ...(n.description && { metadata: { description: n.description } }),
    })),
    edges: data.edges.map((e, i) => ({
      id: `edge_${i}`,
      source: e.source,
      target: e.target,
      ...(e.relation && { relation: e.relation }),
      ...(e.label && { label: e.label }),
    })),
  };

  return JSON.stringify(ir, null, 2);
}

export async function handleGenerate(args: unknown) {
  const parsed = GenerateArgsSchema.parse(args);
  const { description, format, style } = parsed;

  // Parse the description to extract diagram components
  const diagramData = parseDescription(description);

  // Generate output in requested format
  let output: string;
  if (format === "json") {
    output = toJson(diagramData);
  } else {
    output = toDsl(diagramData, style === "detailed");
  }

  // Add summary
  const summary = `Generated diagram with ${diagramData.nodes.length} nodes and ${diagramData.edges.length} edges.`;

  return {
    content: [
      {
        type: "text",
        text: `${summary}\n\n${output}`,
      },
    ],
  };
}
