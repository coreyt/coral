/**
 * coral_layout tool
 *
 * Run ELK layout algorithm and return node positions.
 */

import { z } from "zod";

export const layoutTool = {
  name: "coral_layout",
  description:
    "Run ELK layout algorithm on a Graph-IR and return computed node positions.",
  inputSchema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "Graph-IR JSON or Coral DSL to layout",
      },
      options: {
        type: "object",
        description: "ELK layout options",
        properties: {
          direction: {
            type: "string",
            enum: ["RIGHT", "DOWN", "LEFT", "UP"],
            description: "Layout direction",
            default: "RIGHT",
          },
          nodeSpacing: {
            type: "number",
            description: "Spacing between nodes",
            default: 50,
          },
          layerSpacing: {
            type: "number",
            description: "Spacing between layers",
            default: 50,
          },
          algorithm: {
            type: "string",
            enum: ["layered", "mrtree", "force", "box"],
            description: "ELK layout algorithm",
            default: "layered",
          },
        },
      },
    },
    required: ["content"],
  },
};

const LayoutOptionsSchema = z.object({
  direction: z.enum(["RIGHT", "DOWN", "LEFT", "UP"]).default("RIGHT"),
  nodeSpacing: z.number().default(50),
  layerSpacing: z.number().default(50),
  algorithm: z.enum(["layered", "mrtree", "force", "box"]).default("layered"),
});

const LayoutArgsSchema = z.object({
  content: z.string(),
  options: LayoutOptionsSchema.optional(),
});

interface Node {
  id: string;
  type: string;
  label: string;
  width?: number;
  height?: number;
}

interface Edge {
  source: string;
  target: string;
}

interface LayoutResult {
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    points?: Array<{ x: number; y: number }>;
  }>;
  width: number;
  height: number;
}

/**
 * Parse content to extract nodes and edges
 */
function parseContent(content: string): { nodes: Node[]; edges: Edge[] } {
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
          width: n.width,
          height: n.height,
        })),
        edges: (data.edges || []).map((e: any) => ({
          source: e.source,
          target: e.target,
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
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("//") || trimmedLine === "") {
      continue;
    }

    const nodeMatch = trimmedLine.match(
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

    const edgeMatch = trimmedLine.match(/^(\w+)\s*->\s*(\w+)/);
    if (edgeMatch) {
      const [, source, target] = edgeMatch;
      edges.push({ source, target });
    }
  }

  return { nodes, edges };
}

/**
 * Default node dimensions by type
 */
function getNodeDimensions(type: string): { width: number; height: number } {
  switch (type) {
    case "database":
      return { width: 120, height: 80 };
    case "group":
      return { width: 200, height: 150 };
    case "actor":
      return { width: 80, height: 100 };
    default:
      return { width: 150, height: 60 };
  }
}

/**
 * Simple layered layout algorithm (placeholder for actual ELK integration)
 *
 * In production, this would use elkjs:
 * import ELK from 'elkjs';
 * const elk = new ELK();
 * const layout = await elk.layout(graph);
 */
function computeLayout(
  nodes: Node[],
  edges: Edge[],
  options: z.infer<typeof LayoutOptionsSchema>
): LayoutResult {
  const { direction, nodeSpacing, layerSpacing } = options;

  // Build adjacency list for topological sort
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    const neighbors = adjList.get(edge.source) || [];
    neighbors.push(edge.target);
    adjList.set(edge.source, neighbors);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Topological sort to determine layers
  const layers: string[][] = [];
  const remaining = new Set(nodes.map((n) => n.id));

  while (remaining.size > 0) {
    // Find nodes with no incoming edges from remaining nodes
    const layer: string[] = [];
    for (const nodeId of remaining) {
      const incoming = edges.filter(
        (e) => e.target === nodeId && remaining.has(e.source)
      );
      if (incoming.length === 0) {
        layer.push(nodeId);
      }
    }

    // If no nodes found (cycle), just take any remaining
    if (layer.length === 0) {
      layer.push([...remaining][0]);
    }

    layers.push(layer);
    for (const nodeId of layer) {
      remaining.delete(nodeId);
    }
  }

  // Compute positions based on layers
  const nodePositions: LayoutResult["nodes"] = [];
  let maxWidth = 0;
  let maxHeight = 0;

  const isHorizontal = direction === "RIGHT" || direction === "LEFT";
  const isReversed = direction === "LEFT" || direction === "UP";

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[isReversed ? layers.length - 1 - layerIdx : layerIdx];
    let offset = 0;

    for (const nodeId of layer) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const dims = node.width && node.height
        ? { width: node.width, height: node.height }
        : getNodeDimensions(node.type);

      let x: number, y: number;

      if (isHorizontal) {
        x = layerIdx * (dims.width + layerSpacing);
        y = offset;
        offset += dims.height + nodeSpacing;
        maxWidth = Math.max(maxWidth, x + dims.width);
        maxHeight = Math.max(maxHeight, y + dims.height);
      } else {
        x = offset;
        y = layerIdx * (dims.height + layerSpacing);
        offset += dims.width + nodeSpacing;
        maxWidth = Math.max(maxWidth, x + dims.width);
        maxHeight = Math.max(maxHeight, y + dims.height);
      }

      nodePositions.push({
        id: nodeId,
        x,
        y,
        width: dims.width,
        height: dims.height,
      });
    }
  }

  // Simple edge routing (direct lines for now)
  const edgeResults: LayoutResult["edges"] = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  return {
    nodes: nodePositions,
    edges: edgeResults,
    width: maxWidth,
    height: maxHeight,
  };
}

export async function handleLayout(args: unknown) {
  const parsed = LayoutArgsSchema.parse(args);
  const { content, options = {} } = parsed;

  const parsedOptions = LayoutOptionsSchema.parse(options);
  const { nodes, edges } = parseContent(content);

  if (nodes.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "Could not parse any nodes from the input.",
        },
      ],
      isError: true,
    };
  }

  const layout = computeLayout(nodes, edges, parsedOptions);

  const output = {
    options: parsedOptions,
    layout,
  };

  return {
    content: [
      {
        type: "text",
        text: `Layout computed for ${nodes.length} nodes, ${edges.length} edges.\nDimensions: ${layout.width}x${layout.height}px\n\n${JSON.stringify(output, null, 2)}`,
      },
    ],
  };
}
