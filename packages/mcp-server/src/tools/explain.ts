/**
 * coral_explain tool
 *
 * Generate natural language explanations of diagrams.
 */

import { z } from "zod";
import { detectFormat, isSequenceGraph } from '@coral-viz/language';
import { assessInstalledSuccessorSourceIntegrity028, checkInstalledDocumentConformance028,
  parseInstalledDocument028,
  projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { readGraph } from './layout.js';
import { GraphInputFailure, inputFailureResponse } from './diagnostics.js';

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
  sourcePort?: string;
  targetPort?: string;
  direction?: 'none' | 'both';
  endMarkers?: string;
}

interface DiagramData {
  nodes: Node[];
  edges: Edge[];
  spatialIntent: string[];
}

function describeEndMarkers(edge: {
  first: { node: string }; second: { node: string };
  firstEnd?: { marker?: { kind: string; fill: string } };
  secondEnd?: { marker?: { kind: string; fill: string } };
}): string | undefined {
  const describe = (ordinal: 'first' | 'second', node: string,
    marker: { kind: string; fill: string } | undefined) => {
    if (!marker || marker.kind === 'none') return undefined;
    const name = marker.kind.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const mark = marker.fill === 'filled' &&
      ['arrow', 'triangle', 'diamond', 'circle'].includes(name)
      ? `filled${name.charAt(0).toUpperCase()}${name.slice(1)}` : name;
    return `${ordinal} end at ${node}: ${mark}`;
  };
  const ends = [describe('first', edge.first.node, edge.firstEnd?.marker),
    describe('second', edge.second.node, edge.secondEnd?.marker)].filter(Boolean);
  return ends.length ? ends.join('; ') : undefined;
}

/**
 * Parse Coral DSL or JSON to extract nodes and edges
 */
function parseDiagram(content: string): DiagramData {
  try {
    const sourceProjection = detectFormat(content).format === 'coral' &&
      /^[ \t]*@diagram\b/m.test(content)
      ? projectInstalledSourceToSuccessor028(content) : undefined;
    if (sourceProjection && (!sourceProjection.graph || sourceProjection.diagnostics.length)) {
      throw new GraphInputFailure(sourceProjection.diagnostics.length
        ? sourceProjection.diagnostics.map((item) => ({ severity: 'error' as const,
          code: item.code, message: item.message,
          ...(item.range ? { range: item.range, position: item.range.start } : {}),
          ...(item.related?.length ? { related: item.related.map((related) => ({
            message: related.message, range: related.range,
            position: related.range.start,
          })) } : {}),
        })) : [{ severity: 'error', code: 'mcp.explain.source.projection',
          message: 'The authored source cannot be explained without losing meaning.',
        }]);
    }
    const sourceGraph = sourceProjection?.graph;
    if (sourceGraph) {
      const document = parseInstalledDocument028(content);
      const integrity = assessInstalledSuccessorSourceIntegrity028(document, sourceGraph);
      if (integrity.length) throw new GraphInputFailure(integrity.map((item) => ({
        severity: 'error' as const, code: item.code, message: item.message,
        ...(item.subject ? { subject: item.subject } : {}),
        ...(item.range ? { range: item.range, position: item.range.start } : {}),
      })));
      if (sourceGraph.conformanceExceptions?.length) {
        const checked = checkInstalledDocumentConformance028(content, { requestedLevel: 'none' });
        if (!checked.report) throw new GraphInputFailure([{ severity: 'error',
          code: 'mcp.explain.conformance-exception.unverified',
          message: 'The authored conformance exception cannot be verified for this explanation.',
        }]);
        const exceptions = checked.report.findings.filter((finding) =>
          finding.id === 'CORAL.CONFORMANCE.EXCEPTION.INVALID');
        if (exceptions.length) throw new GraphInputFailure(exceptions.map((finding) => ({
          severity: 'error' as const, code: finding.id, message: finding.message,
          ...(finding.range ? { range: finding.range, position: finding.range.start } : {}),
        })));
      }
    }
    const displayGraph = sourceGraph ? undefined : readGraph(content);
    const graph = sourceGraph ?? displayGraph!;
    if ((displayGraph && isSequenceGraph(displayGraph)) || graph.interaction !== undefined ||
        graph.nodes.some((node) => node.children?.length || node.classifier !== undefined)) {
      throw new GraphInputFailure([{ severity: 'error',
        code: 'mcp.explain.construct.unsupported',
        message: 'This explanation mode cannot faithfully describe sequence interactions, grouped membership, or UML class structure.',
      }]);
    }
    const nodes: Node[] = [];
    const collect = (values: typeof graph.nodes) => {
      for (const node of values) {
        nodes.push({ id: node.id, type: node.type, label: node.label ?? node.id, description: node.description });
        collect(node.children ?? []);
      }
    };
    collect(graph.nodes);
    const rectangleName = (reference: { kind: string; nodeId?: string; edgeId?: string }): string => {
      const id = reference.nodeId ?? reference.edgeId;
      return reference.kind === 'node' ? String(id) : `${reference.kind} ${id}`;
    };
    const spatialIntent = (graph.constraints ?? []).map((constraint) => {
      const identity = `${constraint.strength ?? 'required'} ${constraint.kind} "${constraint.id}"`;
      if (constraint.kind === 'arrangement') return `${identity}: ${constraint.axis} order ` +
        constraint.subjects.map(rectangleName).join(', ') +
        (constraint.direction ? `; direction ${constraint.direction}` : '') +
        (constraint.gap !== undefined ? `; gap ${constraint.gap}` : '') +
        (constraint.alignment ? `; alignment ${constraint.alignment}` : '');
      if (constraint.kind === 'relative') return `${identity}: ${rectangleName(constraint.subject)} ` +
        `${constraint.relation} ${rectangleName(constraint.target)}` +
        (constraint.gap !== undefined ? `; gap ${constraint.gap}` : '') +
        (constraint.alignment ? `; alignment ${constraint.alignment}` : '');
      return `${identity}: ${rectangleName(constraint.subject)} on ${constraint.side} of ` +
        (constraint.scope.kind === 'graph' ? 'the graph' : constraint.scope.nodeId) +
        (constraint.inset !== undefined ? `; inset ${constraint.inset}` : '');
    });
    if (displayGraph) {
      for (const edge of displayGraph.edges) {
        if (edge.routeIntent?.waypoints.length) {
          spatialIntent.push(`edge "${edge.id}" has ${edge.routeIntent.waypoints.length} authored route waypoint(s)`);
        }
      }
    }
    return {
      nodes,
      edges: sourceGraph ? sourceGraph.edges.map((edge) => {
        const reverse = edge.direction === 'second-to-first';
        const sourceEnd = reverse ? edge.second : edge.first;
        const targetEnd = reverse ? edge.first : edge.second;
        const endMarkers = describeEndMarkers(edge);
        return {
          source: sourceEnd.node, target: targetEnd.node,
          ...(sourceEnd.port ? { sourcePort: sourceEnd.port } : {}),
          ...(targetEnd.port ? { targetPort: targetEnd.port } : {}),
          ...(edge.type !== undefined ? { relation: edge.type } : {}),
          ...(edge.label !== undefined ? { label: edge.label } : {}),
          ...(edge.direction === 'none' || edge.direction === 'both'
            ? { direction: edge.direction } : {}),
          ...(endMarkers ? { endMarkers } : {}),
        };
      }) : displayGraph!.edges.map((edge) => ({
        source: edge.source, target: edge.target, relation: edge.type, label: edge.label,
      })),
      spatialIntent,
    };
  } catch (error) {
    if (error instanceof GraphInputFailure) throw error;
    return { nodes: [], edges: [], spatialIntent: [] };
  }
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
    if (edge.direction === 'none') continue;
    const source = connectivity.get(edge.source);
    const target = connectivity.get(edge.target);
    if (source) source.outgoing++;
    if (target) target.incoming++;
    if (edge.direction === 'both') {
      if (source) source.incoming++;
      if (target) target.outgoing++;
    }
  }

  return connectivity;
}

/**
 * Generate brief explanation
 */
function generateBrief(data: DiagramData, includeSpatialIntent = true): string {
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

  if (includeSpatialIntent && data.spatialIntent.length > 0) {
    explanation += `Authored spatial intent: ${data.spatialIntent.join('; ')}. `;
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
  lines.push(generateBrief(data, false));
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

    for (const node of data.nodes) {
      const outgoing = data.edges.filter((e) => e.source === node.id && !e.direction);
      if (outgoing.length > 0) {
        lines.push(`### ${node.label}`);
        for (const edge of outgoing) {
          const target = data.nodes.find((n) => n.id === edge.target);
          const targetLabel = target?.label || edge.target;
          const relation = edge.relation || "connects to";
          const sourceRef = `${node.label}${edge.sourcePort ? `:${edge.sourcePort}` : ''}`;
          const targetRef = `${targetLabel}${edge.targetPort ? `:${edge.targetPort}` : ''}`;
          lines.push(edge.sourcePort || edge.targetPort || edge.label
            ? `- ${relation.replace('_', ' ')}: ${sourceRef} → ${targetRef}` +
              (edge.label ? `; label ${JSON.stringify(edge.label)}` : '') +
              (edge.endMarkers ? `; ${edge.endMarkers}` : '')
            : `- ${relation.replace('_', ' ')} → ${targetRef}` +
              (edge.endMarkers ? `; ${edge.endMarkers}` : ''));
        }
        lines.push("");
      }
    }
    const nondirectional = data.edges.filter((edge) => edge.direction !== undefined);
    if (nondirectional.length > 0) {
      lines.push('### Other connections');
      for (const edge of nondirectional) {
        const first = (data.nodes.find((node) => node.id === edge.source)?.label ?? edge.source) +
          (edge.sourcePort ? `:${edge.sourcePort}` : '');
        const second = (data.nodes.find((node) => node.id === edge.target)?.label ?? edge.target) +
          (edge.targetPort ? `:${edge.targetPort}` : '');
        const mark = edge.direction === 'both' ? '↔' : '—';
        lines.push(`- ${first} ${mark} ${second}` +
          (edge.relation ? ` (${edge.relation.replace('_', ' ')})` : '') +
          (edge.label ? `; label ${JSON.stringify(edge.label)}` : '') +
          (edge.endMarkers ? `; ${edge.endMarkers}` : ''));
      }
      lines.push('');
    }
  }

  // Observations
  lines.push("## Observations");
  lines.push("");

  for (const intent of data.spatialIntent) lines.push(`- Authored spatial intent: ${intent}`);

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
  const incoming = data.edges.filter((e) => e.target === nodeId && !e.direction);
  lines.push("## Incoming Connections");
  if (incoming.length === 0) {
    lines.push("No incoming directed connections");
  } else {
    for (const edge of incoming) {
      const source = data.nodes.find((n) => n.id === edge.source);
      const sourceLabel = source?.label || edge.source;
      const relation = edge.relation || "connects from";
      lines.push(`- ${sourceLabel}${edge.sourcePort ? `:${edge.sourcePort}` : ''} ` +
        `(${relation.replace('_', ' ')}${edge.label ? `; label ${JSON.stringify(edge.label)}` : ''}` +
        `${edge.endMarkers ? `; ${edge.endMarkers}` : ''})`);
    }
  }
  lines.push("");

  // Outgoing connections
  const outgoing = data.edges.filter((e) => e.source === nodeId && !e.direction);
  lines.push("## Outgoing Connections");
  if (outgoing.length === 0) {
    lines.push("No outgoing directed connections");
  } else {
    for (const edge of outgoing) {
      const target = data.nodes.find((n) => n.id === edge.target);
      const targetLabel = target?.label || edge.target;
      const relation = edge.relation || "connects to";
      lines.push(`- ${targetLabel}${edge.targetPort ? `:${edge.targetPort}` : ''} ` +
        `(${relation.replace('_', ' ')}${edge.label ? `; label ${JSON.stringify(edge.label)}` : ''}` +
        `${edge.endMarkers ? `; ${edge.endMarkers}` : ''})`);
    }
  }
  lines.push("");

  const other = data.edges.filter((edge) => edge.direction !== undefined &&
    (edge.source === nodeId || edge.target === nodeId));
  if (other.length > 0) {
    lines.push('## Other Connections');
    for (const edge of other) {
      const neighborId = edge.source === nodeId ? edge.target : edge.source;
      const neighbor = (data.nodes.find((candidate) => candidate.id === neighborId)?.label ?? neighborId) +
        (edge.source === nodeId && edge.targetPort ? `:${edge.targetPort}` :
          edge.target === nodeId && edge.sourcePort ? `:${edge.sourcePort}` : '');
      lines.push(`- ${neighbor} (${edge.direction === 'both' ? 'bidirectional' : 'undirected'} connection` +
        (edge.label ? `; label ${JSON.stringify(edge.label)}` : '') +
        (edge.endMarkers ? `; ${edge.endMarkers}` : '') + ')');
    }
    lines.push('');
  }

  // Observations
  lines.push("## Observations");
  for (const intent of data.spatialIntent) lines.push(`- Authored spatial intent: ${intent}`);
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

  let data;
  try { data = parseDiagram(content); }
  catch (error) {
    if (error instanceof GraphInputFailure) return inputFailureResponse(error);
    throw error;
  }

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
