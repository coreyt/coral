/**
 * coral_convert tool
 *
 * Convert between diagram formats (Mermaid, DOT, PlantUML, Coral).
 */

import { z } from "zod";

export const convertTool = {
  name: "coral_convert",
  description:
    "Convert diagrams between formats. Supports Mermaid, Graphviz DOT, PlantUML to Coral, and Coral to other formats.",
  inputSchema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "The diagram content to convert",
      },
      from: {
        type: "string",
        enum: ["mermaid", "dot", "plantuml", "coral", "auto"],
        description: "Source format (use 'auto' to detect)",
        default: "auto",
      },
      to: {
        type: "string",
        enum: ["coral", "mermaid", "json"],
        description: "Target format",
        default: "coral",
      },
    },
    required: ["content"],
  },
};

const ConvertArgsSchema = z.object({
  content: z.string(),
  from: z.enum(["mermaid", "dot", "plantuml", "coral", "auto"]).default("auto"),
  to: z.enum(["coral", "mermaid", "json"]).default("coral"),
});

interface Node {
  id: string;
  type: string;
  label: string;
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
  groups: Array<{ name: string; children: string[] }>;
}

/**
 * Detect source format from content
 */
function detectFormat(content: string): "mermaid" | "dot" | "plantuml" | "coral" {
  const trimmed = content.trim().toLowerCase();

  if (trimmed.startsWith("graph") || trimmed.startsWith("flowchart")) {
    return "mermaid";
  }
  if (trimmed.startsWith("digraph") || trimmed.startsWith("strict graph")) {
    return "dot";
  }
  if (trimmed.startsWith("@startuml")) {
    return "plantuml";
  }
  // Default to coral
  return "coral";
}

/**
 * Convert label to snake_case ID
 */
function toId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

/**
 * Parse Mermaid flowchart
 */
function parseMermaid(content: string): DiagramData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const groups: Array<{ name: string; children: string[] }> = [];
  const nodeMap = new Map<string, Node>();

  const lines = content.split("\n");
  let currentGroup: { name: string; children: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip graph declaration
    if (trimmed.startsWith("graph") || trimmed.startsWith("flowchart")) {
      continue;
    }

    // Subgraph
    const subgraphMatch = trimmed.match(/subgraph\s+(\w+)/i);
    if (subgraphMatch) {
      currentGroup = { name: subgraphMatch[1], children: [] };
      continue;
    }

    if (trimmed === "end" && currentGroup) {
      groups.push(currentGroup);
      currentGroup = null;
      continue;
    }

    // Node with shape: A[Label], A[(Label)], A{{Label}}, A((Label))
    const nodeWithShapeMatch = trimmed.match(/(\w+)\s*(\[{1,2}|\({1,2})\s*([^\]\)]+)\s*(\]{1,2}|\){1,2})/);
    if (nodeWithShapeMatch) {
      const [, id, openBracket, label] = nodeWithShapeMatch;
      let type = "service";

      // Infer type from bracket style
      if (openBracket === "[(") {
        type = "database";
      } else if (openBracket === "{{") {
        type = "external_api";
      } else if (openBracket === "((") {
        type = "actor";
      }

      if (!nodeMap.has(id)) {
        const node = { id: id.toLowerCase(), type, label };
        nodeMap.set(id, node);
        nodes.push(node);

        if (currentGroup) {
          currentGroup.children.push(id.toLowerCase());
        }
      }
    }

    // Edge: A --> B or A --> B[Label]
    const edgeMatch = trimmed.match(/(\w+)\s*(-+>|\.+>|=+>)\s*(\w+)(?:\s*\|([^|]+)\|)?/);
    if (edgeMatch) {
      const [, source, , target, label] = edgeMatch;

      // Create source node if not exists
      if (!nodeMap.has(source)) {
        const node = { id: source.toLowerCase(), type: "service", label: source };
        nodeMap.set(source, node);
        nodes.push(node);
      }

      // Create target node if not exists
      if (!nodeMap.has(target)) {
        const node = { id: target.toLowerCase(), type: "service", label: target };
        nodeMap.set(target, node);
        nodes.push(node);
      }

      edges.push({
        source: source.toLowerCase(),
        target: target.toLowerCase(),
        ...(label && { label }),
      });
    }
  }

  return { nodes, edges, groups };
}

/**
 * Parse Graphviz DOT
 */
function parseDot(content: string): DiagramData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const groups: Array<{ name: string; children: string[] }> = [];
  const nodeMap = new Map<string, Node>();

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Node definition: id [label="...", shape=...]
    const nodeMatch = trimmed.match(/(\w+)\s*\[([^\]]+)\]/);
    if (nodeMatch && !trimmed.includes("->")) {
      const [, id, attrs] = nodeMatch;

      let label = id;
      let type = "service";

      // Extract label
      const labelMatch = attrs.match(/label\s*=\s*"([^"]+)"/);
      if (labelMatch) {
        label = labelMatch[1];
      }

      // Extract shape
      const shapeMatch = attrs.match(/shape\s*=\s*(\w+)/);
      if (shapeMatch) {
        const shape = shapeMatch[1].toLowerCase();
        if (shape === "cylinder") {
          type = "database";
        } else if (shape === "diamond") {
          type = "external_api";
        }
      }

      if (!nodeMap.has(id)) {
        const node = { id: id.toLowerCase(), type, label };
        nodeMap.set(id, node);
        nodes.push(node);
      }
    }

    // Edge: a -> b
    const edgeMatch = trimmed.match(/(\w+)\s*->\s*(\w+)(?:\s*\[([^\]]+)\])?/);
    if (edgeMatch) {
      const [, source, target, attrs] = edgeMatch;

      // Create nodes if not exist
      if (!nodeMap.has(source)) {
        const node = { id: source.toLowerCase(), type: "service", label: source };
        nodeMap.set(source, node);
        nodes.push(node);
      }
      if (!nodeMap.has(target)) {
        const node = { id: target.toLowerCase(), type: "service", label: target };
        nodeMap.set(target, node);
        nodes.push(node);
      }

      let label: string | undefined;
      if (attrs) {
        const labelMatch = attrs.match(/label\s*=\s*"([^"]+)"/);
        if (labelMatch) {
          label = labelMatch[1];
        }
      }

      edges.push({
        source: source.toLowerCase(),
        target: target.toLowerCase(),
        ...(label && { label }),
      });
    }
  }

  return { nodes, edges, groups };
}

/**
 * Parse PlantUML
 */
function parsePlantUml(content: string): DiagramData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const groups: Array<{ name: string; children: string[] }> = [];
  const nodeMap = new Map<string, Node>();

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip directives
    if (trimmed.startsWith("@")) {
      continue;
    }

    // Component: [Name] or [Name] as id
    const componentMatch = trimmed.match(/\[([^\]]+)\](?:\s+as\s+(\w+))?/);
    if (componentMatch && !trimmed.includes("->") && !trimmed.includes("--")) {
      const [, label, id] = componentMatch;
      const nodeId = (id || toId(label)).toLowerCase();

      if (!nodeMap.has(nodeId)) {
        const node = { id: nodeId, type: "service", label };
        nodeMap.set(nodeId, node);
        nodes.push(node);
      }
    }

    // Database: database "Name" as id
    const dbMatch = trimmed.match(/database\s+"([^"]+)"(?:\s+as\s+(\w+))?/);
    if (dbMatch) {
      const [, label, id] = dbMatch;
      const nodeId = (id || toId(label)).toLowerCase();

      if (!nodeMap.has(nodeId)) {
        const node = { id: nodeId, type: "database", label };
        nodeMap.set(nodeId, node);
        nodes.push(node);
      }
    }

    // Actor: actor Name
    const actorMatch = trimmed.match(/actor\s+(\w+)/);
    if (actorMatch) {
      const [, name] = actorMatch;

      if (!nodeMap.has(name.toLowerCase())) {
        const node = { id: name.toLowerCase(), type: "actor", label: name };
        nodeMap.set(name.toLowerCase(), node);
        nodes.push(node);
      }
    }

    // Edge: a --> b or [A] --> [B]
    const edgeMatch = trimmed.match(/(\w+|\[[^\]]+\])\s*(-+>|\.+>)\s*(\w+|\[[^\]]+\])/);
    if (edgeMatch) {
      let [, source, , target] = edgeMatch;

      // Remove brackets
      source = source.replace(/[\[\]]/g, "");
      target = target.replace(/[\[\]]/g, "");

      const sourceId = toId(source);
      const targetId = toId(target);

      // Create nodes if not exist
      if (!nodeMap.has(sourceId)) {
        const node = { id: sourceId, type: "service", label: source };
        nodeMap.set(sourceId, node);
        nodes.push(node);
      }
      if (!nodeMap.has(targetId)) {
        const node = { id: targetId, type: "service", label: target };
        nodeMap.set(targetId, node);
        nodes.push(node);
      }

      edges.push({
        source: sourceId,
        target: targetId,
      });
    }
  }

  return { nodes, edges, groups };
}

/**
 * Parse Coral DSL
 */
function parseCoral(content: string): DiagramData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const groups: Array<{ name: string; children: string[] }> = [];

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
      const id = toId(label);
      nodes.push({ id, type, label });
    }

    // Edge declaration
    const edgeMatch = trimmed.match(/^(\w+)\s*->\s*(\w+)(?:\s*\[([^\]]+)\])?/);
    if (edgeMatch) {
      const [, source, target, relation] = edgeMatch;
      edges.push({
        source,
        target,
        ...(relation && { relation }),
      });
    }
  }

  return { nodes, edges, groups };
}

/**
 * Output as Coral DSL
 */
function toCoral(data: DiagramData): string {
  const lines: string[] = [];

  lines.push("// Converted to Coral DSL");
  lines.push("");

  // Output groups with their children
  for (const group of data.groups) {
    lines.push(`group "${group.name}" {`);
    for (const childId of group.children) {
      const node = data.nodes.find((n) => n.id === childId);
      if (node) {
        lines.push(`  ${node.type} "${node.label}"`);
      }
    }
    lines.push("}");
    lines.push("");
  }

  // Output ungrouped nodes
  const groupedIds = new Set(data.groups.flatMap((g) => g.children));
  for (const node of data.nodes) {
    if (!groupedIds.has(node.id)) {
      lines.push(`${node.type} "${node.label}"`);
    }
  }

  if (data.edges.length > 0) {
    lines.push("");
  }

  // Output edges
  for (const edge of data.edges) {
    if (edge.relation) {
      lines.push(`${edge.source} -> ${edge.target} [${edge.relation}]`);
    } else if (edge.label) {
      lines.push(`${edge.source} -> ${edge.target} [label = "${edge.label}"]`);
    } else {
      lines.push(`${edge.source} -> ${edge.target}`);
    }
  }

  return lines.join("\n");
}

/**
 * Output as Mermaid
 */
function toMermaid(data: DiagramData): string {
  const lines: string[] = [];

  lines.push("graph TD");

  // Output groups as subgraphs
  for (const group of data.groups) {
    lines.push(`    subgraph ${group.name}`);
    for (const childId of group.children) {
      const node = data.nodes.find((n) => n.id === childId);
      if (node) {
        const shape = getMermaidShape(node.type);
        lines.push(`        ${node.id}${shape.open}${node.label}${shape.close}`);
      }
    }
    lines.push("    end");
  }

  // Output ungrouped nodes
  const groupedIds = new Set(data.groups.flatMap((g) => g.children));
  for (const node of data.nodes) {
    if (!groupedIds.has(node.id)) {
      const shape = getMermaidShape(node.type);
      lines.push(`    ${node.id}${shape.open}${node.label}${shape.close}`);
    }
  }

  // Output edges
  for (const edge of data.edges) {
    if (edge.label) {
      lines.push(`    ${edge.source} -->|${edge.label}| ${edge.target}`);
    } else {
      lines.push(`    ${edge.source} --> ${edge.target}`);
    }
  }

  return lines.join("\n");
}

function getMermaidShape(type: string): { open: string; close: string } {
  switch (type) {
    case "database":
      return { open: "[(", close: ")]" };
    case "external_api":
      return { open: "{{", close: "}}" };
    case "actor":
      return { open: "((", close: "))" };
    default:
      return { open: "[", close: "]" };
  }
}

/**
 * Output as Graph-IR JSON
 */
function toJson(data: DiagramData): string {
  const ir = {
    version: "1.0",
    nodes: data.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
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

export async function handleConvert(args: unknown) {
  const parsed = ConvertArgsSchema.parse(args);
  let { content, from, to } = parsed;

  // Auto-detect format
  if (from === "auto") {
    from = detectFormat(content);
  }

  // Parse source format
  let data: DiagramData;
  switch (from) {
    case "mermaid":
      data = parseMermaid(content);
      break;
    case "dot":
      data = parseDot(content);
      break;
    case "plantuml":
      data = parsePlantUml(content);
      break;
    case "coral":
      data = parseCoral(content);
      break;
    default:
      throw new Error(`Unsupported source format: ${from}`);
  }

  // Generate target format
  let output: string;
  switch (to) {
    case "coral":
      output = toCoral(data);
      break;
    case "mermaid":
      output = toMermaid(data);
      break;
    case "json":
      output = toJson(data);
      break;
    default:
      throw new Error(`Unsupported target format: ${to}`);
  }

  const summary = `Converted from ${from} to ${to}: ${data.nodes.length} nodes, ${data.edges.length} edges`;

  return {
    content: [
      {
        type: "text",
        text: `${summary}\n\n${output}`,
      },
    ],
  };
}
