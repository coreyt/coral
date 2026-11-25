/** Compute node and edge geometry with ELK. */
import { detectFormat, isSequenceGraph, type Diagnostic, type GraphIR } from '@coral-viz/language';
import { GraphInputFailure, inputFailureResponse, parseAs } from './diagnostics.js';
import {
  resolveSpatialLayout,
} from '@coral-viz/render/layout';
import { migrateGraphIR2To3, migrateIR, validateIR } from '@graph-ir/core';
import { z } from 'zod';

export const layoutTool = {
  name: 'coral_layout',
  description: 'Run ELK on Graph-IR JSON or Coral DSL and return computed geometry.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: { type: 'string', description: 'Graph-IR JSON or Coral DSL to lay out' },
      options: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['RIGHT', 'DOWN', 'LEFT', 'UP'], default: 'RIGHT' },
          nodeSpacing: { type: 'number', default: 50 },
          layerSpacing: { type: 'number', default: 50 },
          algorithm: { type: 'string', enum: ['layered', 'mrtree', 'force', 'box'], default: 'layered' },
        },
      },
    },
    required: ['content'],
  },
};

export const LayoutOptionsSchema = z.object({
  direction: z.enum(['RIGHT', 'DOWN', 'LEFT', 'UP']).default('RIGHT'),
  nodeSpacing: z.number().positive().default(50),
  layerSpacing: z.number().positive().default(50),
  algorithm: z.enum(['layered', 'mrtree', 'force', 'box']).default('layered'),
});
const Args = z.object({ content: z.string(), options: LayoutOptionsSchema.optional() });

export type LayoutOptions = z.infer<typeof LayoutOptionsSchema>;

/** Migrate GraphIR JSON 1.x and 2 to 3, reporting each step, then validate it. */
export function migrateGraphJson(value: unknown): { graph: unknown; notes: string[]; diagnostics: Diagnostic[] } {
  const version = value && typeof value === 'object' ? (value as { version?: unknown }).version : undefined;
  let candidate: unknown = value;
  const notes: string[] = [];
  const diagnostics: Diagnostic[] = [];
  if (version === '1.0' || version === '1.0.0') {
    const normalized = version === '1.0'
      ? { ...(value as Record<string, unknown>), version: '1.0.0' }
      : value;
    const migrated = migrateIR(normalized);
    if (!migrated.success || !migrated.migrated) {
      throw new GraphInputFailure([
        ...migrated.errors.map((message) => ({
          severity: 'error' as const, code: 'mcp.input.graphir.migration', message,
        })),
        ...migrated.losses.map((loss) => ({
          severity: 'error' as const, code: 'mcp.input.graphir.migration',
          message: `${loss.path}: ${loss.reason}`,
        })),
      ]);
    }
    candidate = migrated.migrated;
  } else if (version !== '2.0.0' && version !== '3.0.0') {
    throw new GraphInputFailure([{
      severity: 'error', code: 'mcp.input.graphir.migration',
      message: `Unsupported GraphIR version: ${String(version ?? 'missing')}`,
    }]);
  }
  if (version === '1.0' || version === '1.0.0' || version === '2.0.0') {
    const migrated = migrateGraphIR2To3(candidate);
    if (!migrated.success || !migrated.migrated) {
      const failures: Diagnostic[] = migrated.diagnostics.length > 0
        ? migrated.diagnostics.map((diagnostic) => ({
            severity: diagnostic.severity,
            code: 'mcp.input.graphir.migration',
            message: `${diagnostic.code} ${diagnostic.path || '/'}: ${diagnostic.message}`,
          }))
        : [
            ...migrated.errors.map((message) => ({
              severity: 'error' as const, code: 'mcp.input.graphir.migration', message,
            })),
            ...migrated.losses.map((loss) => ({
              severity: 'error' as const, code: 'mcp.input.graphir.migration',
              message: `${loss.code} ${loss.path || '/'}: ${loss.message}`,
            })),
          ];
      throw new GraphInputFailure(failures);
    }
    candidate = migrated.migrated;
    diagnostics.push(...migrated.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: `${diagnostic.path || '/'}: ${diagnostic.message}`,
    })));
    notes.push(`Migrated GraphIR ${String(version)} to 3.0.0`,
      ...migrated.losses.map((loss) => `⚠ ${loss.code} ${loss.path || '/'}: ${loss.message}`));
  }
  return { graph: candidate, notes, diagnostics };
}

export function readGraph(content: string): GraphIR {
  const { format, candidates } = detectFormat(content);
  if (format === null) {
    throw new GraphInputFailure([{
      severity: 'error', code: 'mcp.input.unrecognized',
      message: `The input matches no supported format; expected one of: ${candidates.join(', ')}.`,
    }]);
  }
  if (format === 'coral-document') {
    throw new GraphInputFailure([{
      severity: 'error', code: 'mcp.input.coral-document',
      message: 'A Coral document was given; pass its content.graphIR or the source text, not a Coral document.',
    }]);
  }
  if (format === 'graphir-json') {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch (error) {
      throw new GraphInputFailure([{
        severity: 'error', code: 'mcp.input.graphir.json',
        message: error instanceof Error ? error.message : String(error),
      }]);
    }
    const { graph: candidate } = migrateGraphJson(value);
    const validation = validateIR(candidate);
    if (!validation.valid) {
      throw new GraphInputFailure(validation.errors.map((error) => ({
        severity: 'error' as const,
        code: 'mcp.input.graphir.invalid',
        message: `${error.code} ${error.path || '/'}: ${error.message}`,
      })));
    }
    return candidate as GraphIR;
  }
  const parsed = parseAs(format!, content);
  if (!parsed.success || !parsed.graph) {
    throw new GraphInputFailure(parsed.diagnostics);
  }
  return parsed.graph;
}

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

export interface ComputedLayout {
  nodes: PositionedNode[];
  edges: Array<{
    id: string;
    sections: Array<{
      startPoint: { x: number; y: number };
      bendPoints: Array<{ x: number; y: number }>;
      endPoint: { x: number; y: number };
    }>;
  }>;
  width: number;
  height: number;
}

export async function handleLayout(args: unknown) {
  const parsed = Args.parse(args);
  const options = LayoutOptionsSchema.parse(parsed.options ?? {});
  let graph;
  try { graph = readGraph(parsed.content); }
  catch (error) {
    if (error instanceof GraphInputFailure) return inputFailureResponse(error);
    throw error;
  }
  const validation = validateIR(graph);
  if (!validation.valid) {
    throw new Error(validation.errors.map((error) => error.message).join('; '));
  }
  if (isSequenceGraph(graph)) {
    return inputFailureResponse(new GraphInputFailure([{ severity: 'error',
      code: 'mcp.layout.sequence.unsupported',
      message: 'Generic spatial layout does not represent sequence lifeline timing and fragments; use coral_render for the sequence scene.',
    }]));
  }

  const layout = await computeLayout(graph, options);
  return { content: [{ type: 'text' as const,
    text: `Layout computed with ELK for ${layout.nodes.length} nodes.\n\n${JSON.stringify({ options, layout }, null, 2)}` }] };
}

/** Shared recursive ELK adapter used by both coral_layout and coral_render. */
export async function computeLayout(graph: GraphIR, options: LayoutOptions): Promise<ComputedLayout> {
  const result = await resolveSpatialLayout({
    revision: `mcp:${graph.id}`,
    graph,
    operation: 'load',
    defaults: {
      algorithm: options.algorithm,
      direction: options.direction,
      spacing: {
        nodeNode: options.nodeSpacing,
        layerSpacing: options.layerSpacing,
      },
      hierarchyHandling: 'INCLUDE_CHILDREN',
    },
  });

  return {
    nodes: result.nodes.map((node) => ({
      id: node.id,
      x: node.absolutePosition.x,
      y: node.absolutePosition.y,
      width: node.width,
      height: node.height,
      ...(node.parentId ? { parentId: node.parentId } : {}),
    })),
    edges: result.edges,
    width: result.width,
    height: result.height,
  };
}
