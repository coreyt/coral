/**
 * coral_render tool
 *
 * Generate SVG from Graph-IR.
 */

import { z } from "zod";

export const renderTool = {
  name: "coral_render",
  description:
    "Generate an SVG visualization of a Coral diagram or Graph-IR.",
  inputSchema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "Graph-IR JSON or Coral DSL to render",
      },
      options: {
        type: "object",
        description: "Rendering options",
        properties: {
          direction: {
            type: "string",
            enum: ["RIGHT", "DOWN", "LEFT", "UP"],
            description: "Layout direction",
            default: "RIGHT",
          },
          theme: {
            type: "string",
            enum: ["light", "dark"],
            description: "Color theme",
            default: "light",
          },
          nodeSpacing: {
            type: "number",
            description: "Spacing between nodes",
            default: 50,
          },
        },
      },
    },
    required: ["content"],
  },
};

const RenderOptionsSchema = z.object({
  direction: z.enum(["RIGHT", "DOWN", "LEFT", "UP"]).default("RIGHT"),
  theme: z.enum(["light", "dark"]).default("light"),
  nodeSpacing: z.number().default(50),
});

const RenderArgsSchema = z.object({
  content: z.string(),
  options: RenderOptionsSchema.optional(),
});

interface Node {
  id: string;
  type: string;
  label: string;
}

interface Edge {
  source: string;
  target: string;
  label?: string;
}

interface Theme {
  background: string;
  nodeStroke: string;
  nodeFill: Record<string, string>;
  text: string;
  edge: string;
  edgeArrow: string;
}

const themes: Record<string, Theme> = {
  light: {
    background: "#ffffff",
    nodeStroke: "#374151",
    nodeFill: {
      service: "#dbeafe",
      database: "#fef3c7",
      external_api: "#e0e7ff",
      actor: "#fce7f3",
      group: "#f3f4f6",
      module: "#d1fae5",
    },
    text: "#1f2937",
    edge: "#6b7280",
    edgeArrow: "#6b7280",
  },
  dark: {
    background: "#1f2937",
    nodeStroke: "#9ca3af",
    nodeFill: {
      service: "#1e3a5f",
      database: "#78350f",
      external_api: "#312e81",
      actor: "#831843",
      group: "#374151",
      module: "#064e3b",
    },
    text: "#f9fafb",
    edge: "#9ca3af",
    edgeArrow: "#9ca3af",
  },
};

/**
 * Parse content to extract nodes and edges
 */
function parseContent(content: string): { nodes: Node[]; edges: Edge[] } {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(content);
      return {
        nodes: (data.nodes || []).map((n: any) => ({
          id: n.id,
          type: n.type || "service",
          label: n.label || n.id,
        })),
        edges: (data.edges || []).map((e: any) => ({
          source: e.source,
          target: e.target,
          label: e.label,
        })),
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

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
 * Get node dimensions by type
 */
function getNodeDimensions(type: string): { width: number; height: number } {
  switch (type) {
    case "database":
      return { width: 120, height: 70 };
    case "actor":
      return { width: 80, height: 90 };
    default:
      return { width: 140, height: 50 };
  }
}

/**
 * Compute simple layout
 */
function computeLayout(
  nodes: Node[],
  edges: Edge[],
  direction: string,
  spacing: number
): Map<string, { x: number; y: number; width: number; height: number }> {
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();

  // Build layers via topological sort
  const adjList = new Map<string, string[]>();
  for (const node of nodes) {
    adjList.set(node.id, []);
  }
  for (const edge of edges) {
    const neighbors = adjList.get(edge.source) || [];
    neighbors.push(edge.target);
    adjList.set(edge.source, neighbors);
  }

  const layers: string[][] = [];
  const remaining = new Set(nodes.map((n) => n.id));

  while (remaining.size > 0) {
    const layer: string[] = [];
    for (const nodeId of remaining) {
      const incoming = edges.filter(
        (e) => e.target === nodeId && remaining.has(e.source)
      );
      if (incoming.length === 0) {
        layer.push(nodeId);
      }
    }
    if (layer.length === 0) {
      layer.push([...remaining][0]);
    }
    layers.push(layer);
    for (const nodeId of layer) {
      remaining.delete(nodeId);
    }
  }

  const isHorizontal = direction === "RIGHT" || direction === "LEFT";
  const padding = 40;

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    let offset = padding;

    for (const nodeId of layer) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      const dims = getNodeDimensions(node.type);

      let x: number, y: number;
      if (isHorizontal) {
        x = padding + layerIdx * (dims.width + spacing);
        y = offset;
        offset += dims.height + spacing;
      } else {
        x = offset;
        y = padding + layerIdx * (dims.height + spacing);
        offset += dims.width + spacing;
      }

      positions.set(nodeId, { x, y, ...dims });
    }
  }

  return positions;
}

/**
 * Generate SVG shape for node type
 */
function renderNodeShape(
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  stroke: string
): string {
  switch (type) {
    case "database":
      // Cylinder shape
      const ry = 10;
      return `
        <path d="M${x} ${y + ry}
                 L${x} ${y + height - ry}
                 Q${x} ${y + height} ${x + width / 2} ${y + height}
                 Q${x + width} ${y + height} ${x + width} ${y + height - ry}
                 L${x + width} ${y + ry}
                 Q${x + width} ${y} ${x + width / 2} ${y}
                 Q${x} ${y} ${x} ${y + ry}
                 Z"
              fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <ellipse cx="${x + width / 2}" cy="${y + ry}" rx="${width / 2}" ry="${ry}"
                 fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      `;

    case "actor":
      // Stick figure
      const headR = 12;
      const centerX = x + width / 2;
      return `
        <circle cx="${centerX}" cy="${y + headR + 5}" r="${headR}"
                fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <line x1="${centerX}" y1="${y + headR * 2 + 5}" x2="${centerX}" y2="${y + height - 25}"
              stroke="${stroke}" stroke-width="2"/>
        <line x1="${x + 10}" y1="${y + 40}" x2="${x + width - 10}" y2="${y + 40}"
              stroke="${stroke}" stroke-width="2"/>
        <line x1="${centerX}" y1="${y + height - 25}" x2="${x + 10}" y2="${y + height - 5}"
              stroke="${stroke}" stroke-width="2"/>
        <line x1="${centerX}" y1="${y + height - 25}" x2="${x + width - 10}" y2="${y + height - 5}"
              stroke="${stroke}" stroke-width="2"/>
      `;

    case "external_api":
      // Cloud shape (simplified)
      return `
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ry="8"
              fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-dasharray="5,3"/>
      `;

    default:
      // Rectangle with rounded corners
      return `
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" ry="6"
              fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      `;
  }
}

/**
 * Generate SVG
 */
function generateSvg(
  nodes: Node[],
  edges: Edge[],
  options: z.infer<typeof RenderOptionsSchema>
): string {
  const theme = themes[options.theme];
  const positions = computeLayout(nodes, edges, options.direction, options.nodeSpacing);

  // Calculate SVG dimensions
  let maxX = 0;
  let maxY = 0;
  for (const pos of positions.values()) {
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }

  const svgWidth = maxX + 40;
  const svgHeight = maxY + 40;

  const parts: string[] = [];

  // SVG header
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">`);

  // Background
  parts.push(`<rect width="100%" height="100%" fill="${theme.background}"/>`);

  // Arrow marker definition
  parts.push(`
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="${theme.edgeArrow}"/>
      </marker>
    </defs>
  `);

  // Render edges
  for (const edge of edges) {
    const sourcePos = positions.get(edge.source);
    const targetPos = positions.get(edge.target);

    if (sourcePos && targetPos) {
      const x1 = sourcePos.x + sourcePos.width;
      const y1 = sourcePos.y + sourcePos.height / 2;
      const x2 = targetPos.x;
      const y2 = targetPos.y + targetPos.height / 2;

      parts.push(`
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              stroke="${theme.edge}" stroke-width="2" marker-end="url(#arrowhead)"/>
      `);
    }
  }

  // Render nodes
  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;

    const fill = theme.nodeFill[node.type] || theme.nodeFill.service;

    parts.push(renderNodeShape(node.type, pos.x, pos.y, pos.width, pos.height, fill, theme.nodeStroke));

    // Label
    const labelY = node.type === "actor" ? pos.y + pos.height + 15 : pos.y + pos.height / 2 + 5;
    parts.push(`
      <text x="${pos.x + pos.width / 2}" y="${labelY}"
            text-anchor="middle" fill="${theme.text}" font-family="system-ui, sans-serif" font-size="12">
        ${escapeXml(node.label)}
      </text>
    `);
  }

  parts.push("</svg>");

  return parts.join("\n");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function handleRender(args: unknown) {
  const parsed = RenderArgsSchema.parse(args);
  const { content, options = {} } = parsed;

  const parsedOptions = RenderOptionsSchema.parse(options);
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

  const svg = generateSvg(nodes, edges, parsedOptions);

  return {
    content: [
      {
        type: "text",
        text: `Generated SVG for ${nodes.length} nodes, ${edges.length} edges.\n\n${svg}`,
      },
    ],
  };
}
