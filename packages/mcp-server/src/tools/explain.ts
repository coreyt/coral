/**
 * coral_explain tool
 *
 * Generate natural language explanations of diagrams.
 */

import { z } from "zod";

export const explainTool = {
  name: "coral_explain",
  description:
    "Generate a natural language explanation of a Coral diagram or Graph-IR JSON.",
  inputSchema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "The Coral DSL or Graph-IR JSON to explain",
      },
      level: {
        type: "string",
        enum: ["brief", "standard", "detailed"],
        description: "Level of detail: brief (1 paragraph), standard (sections), detailed (comprehensive)",
        default: "standard",
      },
      focus: {
        type: "string",
        description: "Optional node ID to focus the explanation on",
      },
    },
    required: ["content"],
  },
};

const ExplainArgsSchema = z.object({
  content: z.string(),
  level: z.enum(["brief", "standard", "detailed"]).default("standard"),
  focus: z.string().optional(),
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
 * Parse Coral DSL or JSON to extract nodes and edges
 */
function parseDiagram(content: string): DiagramData {
  const trimmed = content.trim();

  // Check if JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(content);
      return {
        nodes: (data.nodes || []).map((n: any) => ({
          id: n.id,
          type: n.type || "service",
          label: n.label || n.id,
          description: n.metadata?.description,
        })),
        edges: (data.edges || []).map((e: any) => ({
          source: e.source,
          target: e.target,
          relation: e.relation,
          label: e.label,
        })),
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  // Parse Coral DSL
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("//") || trimmed === "") {
      continue;
    }

    // Node declaration
    const nodeMatch = trimmed.match(
      /^(service|database|external_api|actor|group|module)\s+"([^"]+)"/
    );
    if (nodeMatch) {
      const [, type, label] = nodeMatch;
      const id = label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "_");
      nodes.push({ id, type, label });
    }

    // Edge declaration
    const edgeMatch = trimmed.match(/^(\w+)\s*->\s*(\w+)(?:\s*\[([^\]]+)\])?/);
    if (edgeMatch) {
      const [, source, target, attrs] = edgeMatch;
      let relation: string | undefined;
      let label: string | undefined;

      if (attrs) {
        // Parse relation type or label
        const relationMatch = attrs.match(/^(\w+)/);
        if (relationMatch) {
          relation = relationMatch[1];
        }
        const labelMatch = attrs.match(/label\s*=\s*"([^"]+)"/);
        if (labelMatch) {
          label = labelMatch[1];
        }
      }

      edges.push({ source, target, relation, label });
    }
  }

  return { nodes, edges };
}

/**
 * Detect architectural patterns
 */
function detectPatterns(data: DiagramData): string[] {
  const patterns: string[] = [];

  // Count node types
  const typeCounts = new Map<string, number>();
  for (const node of data.nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) || 0) + 1);
  }

  // Check for API Gateway pattern
  const gateway = data.nodes.find(
    (n) =>
      n.label.toLowerCase().includes("gateway") ||
      n.label.toLowerCase().includes("api")
  );
  if (gateway) {
    const outgoing = data.edges.filter((e) => e.source === gateway.id);
    if (outgoing.length >= 2) {
      patterns.push("API Gateway Pattern");
    }
  }

  // Check for microservices
  const services = data.nodes.filter((n) => n.type === "service");
  if (services.length >= 3) {
    patterns.push("Microservices Architecture");
  }

  // Check for event-driven
  const hasEvents = data.edges.some((e) => e.relation === "event");
  const hasQueue = data.nodes.some(
    (n) =>
      n.label.toLowerCase().includes("queue") ||
      n.label.toLowerCase().includes("kafka") ||
      n.label.toLowerCase().includes("rabbitmq")
  );
  if (hasEvents || hasQueue) {
    patterns.push("Event-Driven Architecture");
  }

  // Check for 3-tier
  const hasFrontend = data.nodes.some(
    (n) =>
      n.label.toLowerCase().includes("frontend") ||
      n.label.toLowerCase().includes("web") ||
      n.label.toLowerCase().includes("ui")
  );
  const hasBackend = data.nodes.some(
    (n) =>
      n.label.toLowerCase().includes("backend") ||
      n.label.toLowerCase().includes("api") ||
      n.label.toLowerCase().includes("server")
  );
  const hasDatabase = data.nodes.some((n) => n.type === "database");
  if (hasFrontend && hasBackend && hasDatabase) {
    patterns.push("3-Tier Architecture");
  }

  return patterns;
}

/**
 * Analyze node connectivity
 */
function analyzeConnectivity(
  data: DiagramData
): Map<string, { incoming: number; outgoing: number }> {
  const connectivity = new Map<string, { incoming: number; outgoing: number }>();

  for (const node of data.nodes) {
    connectivity.set(node.id, { incoming: 0, outgoing: 0 });
  }

  for (const edge of data.edges) {
    const source = connectivity.get(edge.source);
    const target = connectivity.get(edge.target);
    if (source) source.outgoing++;
    if (target) target.incoming++;
  }

  return connectivity;
}

/**
 * Generate brief explanation
 */
function generateBrief(data: DiagramData): string {
  const patterns = detectPatterns(data);
  const typeCounts = new Map<string, number>();
  for (const node of data.nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) || 0) + 1);
  }

  const typeDesc: string[] = [];
  if (typeCounts.get("service")) {
    typeDesc.push(`${typeCounts.get("service")} services`);
  }
  if (typeCounts.get("database")) {
    typeDesc.push(`${typeCounts.get("database")} databases`);
  }
  if (typeCounts.get("external_api")) {
    typeDesc.push(`${typeCounts.get("external_api")} external APIs`);
  }

  let explanation = `This diagram shows `;
  if (patterns.length > 0) {
    explanation += `a ${patterns[0].toLowerCase()} with `;
  }
  explanation += `${data.nodes.length} components`;
  if (typeDesc.length > 0) {
    explanation += ` (${typeDesc.join(", ")})`;
  }
  explanation += `. `;

  // Describe main flow
  if (data.edges.length > 0) {
    const connectivity = analyzeConnectivity(data);
    const entryPoints = data.nodes.filter((n) => {
      const conn = connectivity.get(n.id);
      return conn && conn.incoming === 0 && conn.outgoing > 0;
    });
    if (entryPoints.length > 0) {
      explanation += `The system receives requests through ${entryPoints.map((n) => n.label).join(", ")}. `;
    }
  }

  return explanation;
}

/**
 * Generate standard explanation
 */
function generateStandard(data: DiagramData): string {
  const lines: string[] = [];
  const patterns = detectPatterns(data);

  lines.push("# Architecture Overview");
  lines.push("");

  // Summary
  lines.push(generateBrief(data));
  lines.push("");

  // Patterns
  if (patterns.length > 0) {
    lines.push(`**Detected Patterns**: ${patterns.join(", ")}`);
    lines.push("");
  }

  // Components by type
  lines.push("## Components");
  lines.push("");

  const byType = new Map<string, Node[]>();
  for (const node of data.nodes) {
    const existing = byType.get(node.type) || [];
    existing.push(node);
    byType.set(node.type, existing);
  }

  for (const [type, nodes] of byType) {
    const typeName = type.replace("_", " ").charAt(0).toUpperCase() + type.slice(1).replace("_", " ");
    lines.push(`### ${typeName}s (${nodes.length})`);
    for (const node of nodes) {
      lines.push(`- **${node.label}**${node.description ? `: ${node.description}` : ""}`);
    }
    lines.push("");
  }

  // Connections
  if (data.edges.length > 0) {
    lines.push("## Connections");
    lines.push("");

    const connectivity = analyzeConnectivity(data);

    for (const node of data.nodes) {
      const outgoing = data.edges.filter((e) => e.source === node.id);
      if (outgoing.length > 0) {
        lines.push(`### ${node.label}`);
        for (const edge of outgoing) {
          const target = data.nodes.find((n) => n.id === edge.target);
          const targetLabel = target?.label || edge.target;
          const relation = edge.relation || "connects to";
          lines.push(`- ${relation.replace("_", " ")} → ${targetLabel}`);
        }
        lines.push("");
      }
    }
  }

  // Observations
  lines.push("## Observations");
  lines.push("");

  const connectivity = analyzeConnectivity(data);

  // Find bottlenecks
  for (const node of data.nodes) {
    const conn = connectivity.get(node.id);
    if (conn && conn.incoming >= 3) {
      lines.push(`- **${node.label}** has high incoming traffic (${conn.incoming} connections) - potential bottleneck`);
    }
  }

  // Find orphans
  for (const node of data.nodes) {
    const conn = connectivity.get(node.id);
    if (conn && conn.incoming === 0 && conn.outgoing === 0) {
      lines.push(`- **${node.label}** is disconnected from the rest of the system`);
    }
  }

  // Shared databases
  const databases = data.nodes.filter((n) => n.type === "database");
  for (const db of databases) {
    const incoming = data.edges.filter((e) => e.target === db.id);
    if (incoming.length >= 2) {
      lines.push(`- **${db.label}** is shared by ${incoming.length} services (consider if coupling is intentional)`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate focused explanation
 */
function generateFocused(data: DiagramData, nodeId: string): string {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return `Node '${nodeId}' not found in diagram.`;
  }

  const lines: string[] = [];

  lines.push(`# ${node.label} Analysis`);
  lines.push("");

  lines.push("## Role");
  lines.push(`${node.type.charAt(0).toUpperCase() + node.type.slice(1).replace("_", " ")} component.`);
  if (node.description) {
    lines.push(node.description);
  }
  lines.push("");

  // Incoming connections
  const incoming = data.edges.filter((e) => e.target === nodeId);
  lines.push("## Incoming Connections");
  if (incoming.length === 0) {
    lines.push("No incoming connections (entry point or isolated node)");
  } else {
    for (const edge of incoming) {
      const source = data.nodes.find((n) => n.id === edge.source);
      const sourceLabel = source?.label || edge.source;
      const relation = edge.relation || "connects from";
      lines.push(`- ${sourceLabel} (${relation.replace("_", " ")})`);
    }
  }
  lines.push("");

  // Outgoing connections
  const outgoing = data.edges.filter((e) => e.source === nodeId);
  lines.push("## Outgoing Connections");
  if (outgoing.length === 0) {
    lines.push("No outgoing connections (terminal node or isolated node)");
  } else {
    for (const edge of outgoing) {
      const target = data.nodes.find((n) => n.id === edge.target);
      const targetLabel = target?.label || edge.target;
      const relation = edge.relation || "connects to";
      lines.push(`- ${targetLabel} (${relation.replace("_", " ")})`);
    }
  }
  lines.push("");

  // Observations
  lines.push("## Observations");
  if (incoming.length >= 3) {
    lines.push(`- High incoming traffic (${incoming.length} connections) - may be a bottleneck`);
  }
  if (outgoing.length >= 3) {
    lines.push(`- High coupling (${outgoing.length} outgoing connections)`);
  }
  if (incoming.length === 0 && outgoing.length > 0) {
    lines.push("- This appears to be an entry point to the system");
  }
  if (outgoing.length === 0 && incoming.length > 0) {
    lines.push("- This appears to be a terminal node (data sink or output)");
  }

  return lines.join("\n");
}

export async function handleExplain(args: unknown) {
  const parsed = ExplainArgsSchema.parse(args);
  const { content, level, focus } = parsed;

  const data = parseDiagram(content);

  if (data.nodes.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "Could not parse any nodes from the diagram. Please ensure it's valid Coral DSL or Graph-IR JSON.",
        },
      ],
    };
  }

  let explanation: string;

  if (focus) {
    explanation = generateFocused(data, focus);
  } else {
    switch (level) {
      case "brief":
        explanation = generateBrief(data);
        break;
      case "detailed":
        // For now, detailed is same as standard with more sections
        explanation = generateStandard(data);
        break;
      default:
        explanation = generateStandard(data);
    }
  }

  return {
    content: [
      {
        type: "text",
        text: explanation,
      },
    ],
  };
}
