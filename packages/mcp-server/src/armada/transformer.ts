/**
 * Knowledge Graph → Graph-IR Transformer
 *
 * Transforms Armada knowledge graph results into Graph-IR format
 * for visualization by Coral.
 */

import type {
  ArmadaNode,
  ArmadaEdge,
  ContextResult,
  DependencyResult,
  ImpactResult,
  TraceResult,
} from "./client.js";
import type { GraphIR, GraphNode, GraphEdge, LayoutOptions } from "../types.js";

/**
 * Configuration for the transformer
 */
export interface TransformOptions {
  /** Include source file information in node metadata */
  includeSourceInfo?: boolean;
  /** Group nodes by file or module */
  groupBy?: "file" | "module" | "language" | "none";
  /** Maximum nodes to include (for large results) */
  maxNodes?: number;
  /** Layout algorithm preference */
  layout?: LayoutOptions["algorithm"];
  /** Layout direction */
  direction?: LayoutOptions["direction"];
  /** Custom node type mapping */
  typeMapping?: Record<string, string>;
}

const DEFAULT_OPTIONS: Required<TransformOptions> = {
  includeSourceInfo: true,
  groupBy: "module",
  maxNodes: 100,
  layout: "layered",
  direction: "DOWN",
  typeMapping: {},
};

/**
 * Map Armada node types to Coral node types
 */
const ARMADA_TO_CORAL_TYPE: Record<string, string> = {
  // Python
  module: "module",
  class: "service",
  function: "service",
  method: "service",
  // TypeScript
  interface: "service",
  type_alias: "service",
  // Go
  struct: "service",
  // Generic
  file: "module",
  package: "group",
  directory: "group",
};

/**
 * Map Armada edge types to Coral relation types
 */
const ARMADA_TO_CORAL_RELATION: Record<string, string> = {
  imports: "dependency",
  calls: "http_request",
  inherits: "extends",
  extends: "extends",
  implements: "implements",
  exports: "dependency",
  belongs_to: "contains",
  embeds: "contains",
};

/**
 * Transform an Armada node to a Graph-IR node
 */
function transformNode(
  node: ArmadaNode,
  options: Required<TransformOptions>
): GraphNode {
  const coralType =
    options.typeMapping[node.type] ||
    ARMADA_TO_CORAL_TYPE[node.type] ||
    "service";

  const graphNode: GraphNode = {
    id: node.id,
    type: coralType,
    label: node.name,
    properties: {
      language: node.language,
      path: node.path,
      armadaType: node.type,
    },
  };

  if (node.docstring) {
    graphNode.description = node.docstring;
  }

  if (node.signature) {
    graphNode.properties!.signature = node.signature;
  }

  if (options.includeSourceInfo && node.start_line !== undefined) {
    graphNode.properties!.startLine = node.start_line;
    graphNode.properties!.endLine = node.end_line;
  }

  if (node.confidence !== undefined) {
    graphNode.properties!.confidence = node.confidence;
  }

  return graphNode;
}

/**
 * Transform an Armada edge to a Graph-IR edge
 */
function transformEdge(edge: ArmadaEdge): GraphEdge {
  const relationType =
    ARMADA_TO_CORAL_RELATION[edge.type] || edge.type;

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: relationType,
    label: edge.type,
    properties: edge.metadata,
  };
}

/**
 * Group nodes by their path (file or module)
 */
function groupNodesByPath(
  nodes: GraphNode[],
  groupBy: "file" | "module" | "language"
): Map<string, GraphNode[]> {
  const groups = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    let groupKey: string;

    switch (groupBy) {
      case "file":
        groupKey = (node.properties?.path as string) || "unknown";
        break;
      case "module":
        // Extract module/package from path
        const path = (node.properties?.path as string) || "";
        const parts = path.split("/");
        groupKey = parts.slice(0, -1).join("/") || "root";
        break;
      case "language":
        groupKey = (node.properties?.language as string) || "unknown";
        break;
    }

    const existing = groups.get(groupKey) || [];
    existing.push(node);
    groups.set(groupKey, existing);
  }

  return groups;
}

/**
 * Create group nodes and reparent children
 */
function applyGrouping(
  nodes: GraphNode[],
  edges: GraphEdge[],
  groupBy: "file" | "module" | "language" | "none"
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (groupBy === "none") {
    return { nodes, edges };
  }

  const groups = groupNodesByPath(nodes, groupBy);
  const groupNodes: GraphNode[] = [];
  const reparentedNodes: GraphNode[] = [];

  for (const [groupKey, groupMembers] of groups) {
    if (groupMembers.length === 1 && groupBy !== "language") {
      // Don't create a group for single items (except for language grouping)
      reparentedNodes.push(groupMembers[0]);
      continue;
    }

    // Create group node
    const groupId = `group_${groupKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const groupNode: GraphNode = {
      id: groupId,
      type: "group",
      label: groupKey.split("/").pop() || groupKey,
      properties: {
        path: groupKey,
        memberCount: groupMembers.length,
      },
      children: groupMembers.map((n) => ({
        ...n,
        parent: groupId,
      })),
    };

    groupNodes.push(groupNode);
  }

  // Combine group nodes with ungrouped nodes
  const finalNodes = [...groupNodes, ...reparentedNodes];

  // Update edges to point to groups if source/target is in a group
  const nodeToGroup = new Map<string, string>();
  for (const group of groupNodes) {
    for (const child of group.children || []) {
      nodeToGroup.set(child.id, group.id);
    }
  }

  // Keep edges as-is (they can point to nested nodes)
  return { nodes: finalNodes, edges };
}

/**
 * Transform Armada context result to Graph-IR
 */
export function transformContextToIR(
  result: ContextResult,
  options: TransformOptions = {}
): GraphIR {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Transform nodes (limit if needed)
  let nodes = result.nodes.slice(0, opts.maxNodes).map((n) => transformNode(n, opts));
  let edges = result.edges.map(transformEdge);

  // Filter edges to only include those with valid source/target
  const nodeIds = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Apply grouping if requested
  const grouped = applyGrouping(nodes, edges, opts.groupBy);

  return {
    version: "1.0",
    id: `context_${Date.now()}`,
    name: `Code Context: ${result.query}`,
    nodes: grouped.nodes,
    edges: grouped.edges,
    metadata: {
      description: `Code context for query: "${result.query}"`,
      custom: {
        source: "armada",
        scope: result.scope,
        confidence: result.confidence,
        originalNodeCount: result.nodes.length,
      },
    },
    layoutOptions: {
      algorithm: opts.layout,
      direction: opts.direction,
      spacing: {
        nodeNode: 50,
        layerSpacing: 100,
      },
    },
  };
}

/**
 * Transform Armada dependency result to Graph-IR
 */
export function transformDependenciesToIR(
  result: DependencyResult,
  options: TransformOptions = {}
): GraphIR {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let nodes = result.nodes.slice(0, opts.maxNodes).map((n) => transformNode(n, opts));
  let edges = result.edges.map(transformEdge);

  // Filter edges
  const nodeIds = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Highlight the root symbol
  const rootNode = nodes.find((n) => n.id.includes(result.symbol));
  if (rootNode) {
    rootNode.properties = {
      ...rootNode.properties,
      highlight: true,
      role: "root",
    };
  }

  const grouped = applyGrouping(nodes, edges, opts.groupBy);

  return {
    version: "1.0",
    id: `deps_${Date.now()}`,
    name: `Dependencies: ${result.symbol}`,
    nodes: grouped.nodes,
    edges: grouped.edges,
    metadata: {
      description: `${result.direction} dependencies of ${result.symbol}`,
      custom: {
        source: "armada",
        direction: result.direction,
        depth: result.depth,
        originalNodeCount: result.nodes.length,
      },
    },
    layoutOptions: {
      algorithm: result.direction === "upstream" ? "layered" : "tree",
      direction: result.direction === "upstream" ? "UP" : "DOWN",
      spacing: {
        nodeNode: 40,
        layerSpacing: 80,
      },
    },
  };
}

/**
 * Transform Armada impact result to Graph-IR
 */
export function transformImpactToIR(
  result: ImpactResult,
  options: TransformOptions = {}
): GraphIR {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let nodes = result.impacted_nodes.slice(0, opts.maxNodes).map((n) => transformNode(n, opts));
  let edges = result.impacted_edges.map(transformEdge);

  // Filter edges
  const nodeIds = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Mark nodes with impact level (based on edge distance from source)
  // For now, just mark all as impacted
  for (const node of nodes) {
    node.properties = {
      ...node.properties,
      impacted: true,
    };
  }

  const grouped = applyGrouping(nodes, edges, opts.groupBy);

  return {
    version: "1.0",
    id: `impact_${Date.now()}`,
    name: `Impact: ${result.file}${result.symbol ? "#" + result.symbol : ""}`,
    nodes: grouped.nodes,
    edges: grouped.edges,
    metadata: {
      description: `Impact analysis for ${result.file}`,
      custom: {
        source: "armada",
        file: result.file,
        symbol: result.symbol,
        blastRadius: result.blast_radius,
        originalNodeCount: result.impacted_nodes.length,
      },
    },
    layoutOptions: {
      algorithm: "radial",
      direction: "DOWN",
      spacing: {
        nodeNode: 60,
        layerSpacing: 120,
      },
    },
  };
}

/**
 * Transform Armada trace result to Graph-IR
 */
export function transformTraceToIR(
  result: TraceResult,
  options: TransformOptions = {}
): GraphIR {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Collect unique nodes from all paths
  const nodeIds = new Set<string>();
  const allEdges: ArmadaEdge[] = [];

  for (const path of result.paths) {
    for (const nodeId of path.nodes) {
      nodeIds.add(nodeId);
    }
    allEdges.push(...path.edges);
  }

  // Create simple nodes for trace (we only have IDs, not full node data)
  const nodes: GraphNode[] = Array.from(nodeIds).map((id) => ({
    id,
    type: "service",
    label: id.split(":").pop() || id,
    properties: {
      isSource: id === result.source,
      isTarget: id === result.target,
    },
  }));

  const edges = allEdges.map(transformEdge);

  // Deduplicate edges
  const uniqueEdges = Array.from(
    new Map(edges.map((e) => [`${e.source}->${e.target}`, e])).values()
  );

  return {
    version: "1.0",
    id: `trace_${Date.now()}`,
    name: `Call Trace: ${result.source} → ${result.target}`,
    nodes,
    edges: uniqueEdges,
    metadata: {
      description: `Call paths from ${result.source} to ${result.target}`,
      custom: {
        source: "armada",
        found: result.found,
        pathCount: result.paths.length,
      },
    },
    layoutOptions: {
      algorithm: "layered",
      direction: "RIGHT",
      spacing: {
        nodeNode: 30,
        layerSpacing: 100,
      },
    },
  };
}

/**
 * Main transformer function that handles any Armada result type
 */
export function transformToIR(
  result: ContextResult | DependencyResult | ImpactResult | TraceResult,
  resultType: "context" | "dependencies" | "impact" | "trace",
  options: TransformOptions = {}
): GraphIR {
  switch (resultType) {
    case "context":
      return transformContextToIR(result as ContextResult, options);
    case "dependencies":
      return transformDependenciesToIR(result as DependencyResult, options);
    case "impact":
      return transformImpactToIR(result as ImpactResult, options);
    case "trace":
      return transformTraceToIR(result as TraceResult, options);
    default:
      throw new Error(`Unknown result type: ${resultType}`);
  }
}
