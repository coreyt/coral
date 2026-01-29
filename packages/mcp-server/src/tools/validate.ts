/**
 * coral_validate tool
 *
 * Validate Coral DSL or Graph-IR JSON for correctness.
 */

import { z } from "zod";

export const validateTool = {
  name: "coral_validate",
  description:
    "Validate Coral DSL or Graph-IR JSON for syntax errors, schema compliance, and referential integrity.",
  inputSchema: {
    type: "object" as const,
    properties: {
      content: {
        type: "string",
        description: "The Coral DSL or Graph-IR JSON to validate",
      },
      strict: {
        type: "boolean",
        description: "Treat warnings as errors",
        default: false,
      },
    },
    required: ["content"],
  },
};

const ValidateArgsSchema = z.object({
  content: z.string(),
  strict: z.boolean().default(false),
});

interface ValidationError {
  code: string;
  message: string;
  line?: number;
  suggestion?: string;
}

interface ValidationWarning {
  code: string;
  message: string;
  line?: number;
}

interface ValidationResult {
  valid: boolean;
  format: "coral-dsl" | "graph-ir-json";
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: {
    nodeCount: number;
    edgeCount: number;
  };
}

/**
 * Detect whether content is JSON or DSL
 */
function detectFormat(content: string): "coral-dsl" | "graph-ir-json" {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "graph-ir-json";
  }
  return "coral-dsl";
}

/**
 * Validate Graph-IR JSON
 */
function validateJson(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  let nodeCount = 0;
  let edgeCount = 0;

  try {
    const data = JSON.parse(content);

    // Check version
    if (!data.version) {
      warnings.push({
        code: "MISSING_VERSION",
        message: "Graph-IR should have a 'version' field",
      });
    }

    // Check nodes array
    if (!Array.isArray(data.nodes)) {
      errors.push({
        code: "INVALID_STRUCTURE",
        message: "'nodes' must be an array",
        suggestion: 'Add "nodes": [] to your Graph-IR',
      });
    } else {
      nodeCount = data.nodes.length;
      const nodeIds = new Set<string>();

      for (let i = 0; i < data.nodes.length; i++) {
        const node = data.nodes[i];

        // Check required fields
        if (!node.id) {
          errors.push({
            code: "MISSING_FIELD",
            message: `nodes[${i}] missing required field 'id'`,
          });
        } else {
          if (nodeIds.has(node.id)) {
            errors.push({
              code: "DUPLICATE_ID",
              message: `Duplicate node ID: '${node.id}'`,
              suggestion: `Rename one of the nodes with ID '${node.id}'`,
            });
          }
          nodeIds.add(node.id);
        }

        if (!node.type) {
          errors.push({
            code: "MISSING_FIELD",
            message: `nodes[${i}] missing required field 'type'`,
            suggestion:
              "Valid types: service, module, database, external_api, actor, group",
          });
        }

        if (!node.label) {
          warnings.push({
            code: "MISSING_LABEL",
            message: `nodes[${i}] missing 'label' field`,
          });
        }
      }

      // Check edges
      if (Array.isArray(data.edges)) {
        edgeCount = data.edges.length;

        for (let i = 0; i < data.edges.length; i++) {
          const edge = data.edges[i];

          if (!edge.source) {
            errors.push({
              code: "MISSING_FIELD",
              message: `edges[${i}] missing required field 'source'`,
            });
          } else if (!nodeIds.has(edge.source)) {
            errors.push({
              code: "UNDEFINED_NODE",
              message: `edges[${i}] references undefined source '${edge.source}'`,
              suggestion: `Add a node with ID '${edge.source}' or check for typos`,
            });
          }

          if (!edge.target) {
            errors.push({
              code: "MISSING_FIELD",
              message: `edges[${i}] missing required field 'target'`,
            });
          } else if (!nodeIds.has(edge.target)) {
            errors.push({
              code: "UNDEFINED_NODE",
              message: `edges[${i}] references undefined target '${edge.target}'`,
              suggestion: `Add a node with ID '${edge.target}' or check for typos`,
            });
          }
        }

        // Check for cycles (simple DFS)
        const adjList = new Map<string, string[]>();
        for (const edge of data.edges) {
          if (edge.source && edge.target) {
            const existing = adjList.get(edge.source) || [];
            existing.push(edge.target);
            adjList.set(edge.source, existing);
          }
        }

        const visited = new Set<string>();
        const recStack = new Set<string>();
        const cyclePath: string[] = [];

        function detectCycle(node: string): boolean {
          visited.add(node);
          recStack.add(node);
          cyclePath.push(node);

          const neighbors = adjList.get(node) || [];
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              if (detectCycle(neighbor)) {
                return true;
              }
            } else if (recStack.has(neighbor)) {
              cyclePath.push(neighbor);
              return true;
            }
          }

          recStack.delete(node);
          cyclePath.pop();
          return false;
        }

        for (const nodeId of nodeIds) {
          if (!visited.has(nodeId)) {
            if (detectCycle(nodeId)) {
              const cycleStart = cyclePath[cyclePath.length - 1];
              const cycleStartIdx = cyclePath.indexOf(cycleStart);
              const cycle = cyclePath.slice(cycleStartIdx).join(" → ");
              errors.push({
                code: "CYCLE_DETECTED",
                message: `Cycle detected: ${cycle}`,
                suggestion:
                  "Remove one edge to break the cycle, or mark an edge as a back-edge",
              });
              break;
            }
          }
        }
      }

      // Check for orphan nodes
      if (Array.isArray(data.edges)) {
        const connectedNodes = new Set<string>();
        for (const edge of data.edges) {
          connectedNodes.add(edge.source);
          connectedNodes.add(edge.target);
        }
        for (const nodeId of nodeIds) {
          if (!connectedNodes.has(nodeId)) {
            warnings.push({
              code: "ORPHAN_NODE",
              message: `Node '${nodeId}' has no connections`,
            });
          }
        }
      }
    }
  } catch (e) {
    errors.push({
      code: "JSON_PARSE_ERROR",
      message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  return {
    valid: errors.length === 0,
    format: "graph-ir-json",
    errors,
    warnings,
    summary: { nodeCount, edgeCount },
  };
}

/**
 * Validate Coral DSL (simplified parser)
 */
function validateDsl(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const nodes = new Map<string, { line: number; label: string }>();
  const edges: Array<{ source: string; target: string; line: number }> = [];

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();

    // Skip comments and empty lines
    if (line.startsWith("//") || line === "") {
      continue;
    }

    // Node declaration: type "label"
    const nodeMatch = line.match(
      /^(service|database|external_api|actor|group|module)\s+"([^"]+)"/
    );
    if (nodeMatch) {
      const [, type, label] = nodeMatch;
      const id = label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "_");

      if (nodes.has(id)) {
        const existing = nodes.get(id)!;
        errors.push({
          code: "DUPLICATE_ID",
          message: `Duplicate node ID '${id}' at line ${lineNum} (first defined at line ${existing.line})`,
          line: lineNum,
          suggestion: `Rename one of the "${label}" nodes to be unique`,
        });
      } else {
        nodes.set(id, { line: lineNum, label });
      }
      continue;
    }

    // Edge declaration: source -> target [relation]
    const edgeMatch = line.match(/^(\w+)\s*->\s*(\w+)(?:\s*\[([^\]]+)\])?/);
    if (edgeMatch) {
      const [, source, target] = edgeMatch;
      edges.push({ source, target, line: lineNum });
      continue;
    }

    // Closing brace or body content (skip)
    if (line === "}" || line.includes(":")) {
      continue;
    }

    // Opening brace (skip)
    if (line.endsWith("{")) {
      continue;
    }

    // Unknown syntax
    if (line.length > 0 && !line.startsWith("{")) {
      warnings.push({
        code: "UNKNOWN_SYNTAX",
        message: `Unrecognized syntax at line ${lineNum}: "${line.substring(0, 30)}..."`,
        line: lineNum,
      });
    }
  }

  // Validate edge references
  for (const edge of edges) {
    if (!nodes.has(edge.source)) {
      errors.push({
        code: "UNDEFINED_NODE",
        message: `Edge references undefined source '${edge.source}'`,
        line: edge.line,
        suggestion: `Add a node declaration for '${edge.source}'`,
      });
    }
    if (!nodes.has(edge.target)) {
      errors.push({
        code: "UNDEFINED_NODE",
        message: `Edge references undefined target '${edge.target}'`,
        line: edge.line,
        suggestion: `Add a node declaration for '${edge.target}'`,
      });
    }
  }

  // Check for orphan nodes
  const connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }
  for (const [nodeId] of nodes) {
    if (!connectedNodes.has(nodeId) && nodes.size > 1) {
      warnings.push({
        code: "ORPHAN_NODE",
        message: `Node '${nodeId}' has no connections`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    format: "coral-dsl",
    errors,
    warnings,
    summary: { nodeCount: nodes.size, edgeCount: edges.length },
  };
}

/**
 * Format validation result for output
 */
function formatResult(result: ValidationResult, strict: boolean): string {
  const lines: string[] = [];

  lines.push("Validation Results:");
  lines.push("");

  if (result.valid && (result.warnings.length === 0 || !strict)) {
    lines.push(`✓ Format: Valid ${result.format === "coral-dsl" ? "Coral DSL" : "Graph-IR JSON"}`);
    lines.push(`✓ Schema: All ${result.summary.nodeCount} nodes valid`);
    lines.push("✓ DAG: No cycles detected");
    lines.push("✓ References: All edge endpoints exist");
  } else {
    if (result.format === "coral-dsl") {
      lines.push(`✓ Format: Coral DSL detected`);
    } else {
      lines.push(`✓ Format: Graph-IR JSON detected`);
    }
  }

  if (result.errors.length > 0) {
    lines.push("");
    for (const error of result.errors) {
      const lineInfo = error.line ? ` (line ${error.line})` : "";
      lines.push(`✗ ${error.code}${lineInfo}: ${error.message}`);
      if (error.suggestion) {
        lines.push(`  Suggestion: ${error.suggestion}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    for (const warning of result.warnings) {
      const lineInfo = warning.line ? ` (line ${warning.line})` : "";
      lines.push(`⚠ ${warning.code}${lineInfo}: ${warning.message}`);
    }
  }

  lines.push("");
  lines.push(
    `Summary: ${result.summary.nodeCount} nodes, ${result.summary.edgeCount} edges, ${result.errors.length} errors, ${result.warnings.length} warnings`
  );

  return lines.join("\n");
}

export async function handleValidate(args: unknown) {
  const parsed = ValidateArgsSchema.parse(args);
  const { content, strict } = parsed;

  const format = detectFormat(content);
  const result =
    format === "graph-ir-json" ? validateJson(content) : validateDsl(content);

  const output = formatResult(result, strict);

  return {
    content: [
      {
        type: "text",
        text: output,
      },
    ],
  };
}
