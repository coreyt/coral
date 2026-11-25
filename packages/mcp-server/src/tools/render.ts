/** Generate deterministic SVG or standalone HTML from GraphIR or Coral DSL. */

import { z } from 'zod';
import { validateIR, type GraphIR } from '@graph-ir/core';
import { detectFormat, isSequenceGraph, validateSequenceInteraction,
  type CandidateFragmentSyntax, type CandidateNodeSyntax, type CandidatePortSyntax, type Diagnostic } from '@coral-viz/language';
import {
  assessInstalledSuccessorSourceIntegrity028,
  assessSuccessorSourcePortReferences028,
  installedWrittenPortReferenceRanges028,
  notationRegistry,
  parseInstalledDocument028,
  projectInstalledSourceToSuccessor028,
  resolveSuccessorGraphNodes028,
  RenderCapabilityError,
  renderHtml,
  renderSvg,
  sourceLayoutCapabilityNotices028,
  sourceSpatialFailureDiagnostics028,
  spatialValidationGraph028,
  sourceSemanticCapabilityNotices028,
  successorSourceDisplay028,
  successorDisplayFailureDiagnostic028,
  successorSourceDisplayWithSemanticPorts028,
  sourceNodeCatalogChoiceDiagnostics028,
  sourcePortDeclarationDiagnostics028,
  sequenceSourcePortCapabilityDiagnostics028,
  sequenceFragmentDisplayDiagnostics028,
  type DiagramRenderFontSettings,
  type RenderFontWeight,
  type SvgOptions,
} from '@coral-viz/render';
import { layoutGraphForSvg, type SvgLayoutGraph } from '@coral-viz/render/svg-layout';
import { SpatialLayoutError } from '@coral-viz/render/layout';
import { readGraph, type LayoutOptions } from './layout.js';
import { GraphInputFailure, inputFailureResponse } from './diagnostics.js';
import { installedSourceDiagnostics028, readCoralSource028 } from './coralSource028.js';

export const renderTool = {
  name: 'coral_render',
  description: 'Generate a deterministic SVG or standalone HTML visualization of a Coral diagram or Graph-IR.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: { type: 'string', description: 'Graph-IR JSON or Coral DSL to render' },
      options: {
        type: 'object',
        description: 'Rendering options',
        properties: {
          format: {
            type: 'string',
            enum: ['svg', 'html'],
            description: 'Output document format',
            default: 'svg',
          },
          direction: {
            type: 'string',
            enum: ['RIGHT', 'DOWN', 'LEFT', 'UP'],
            description: 'Layout direction for nodes without complete geometry',
            default: 'RIGHT',
          },
          theme: {
            type: 'string',
            enum: ['light', 'dark'],
            description: 'Color theme',
            default: 'light',
          },
          style: {
            type: 'string', enum: ['lowfi', 'hifi', 'anemone', 'ane'],
            description: 'Visual style: monochrome lowfi or hifi, or peer anemone (shorthand ane); thx is reserved', default: 'lowfi',
          },
          nodeSpacing: { type: 'number', description: 'Spacing between nodes', default: 50 },
          fontSettings: {
            type: 'object',
            description: 'Portable diagram font defaults and per-symbol or per-node-type overrides',
            properties: {
              default: { $ref: '#/$defs/fontSettings' },
              symbolOverrides: {
                type: 'object',
                additionalProperties: { $ref: '#/$defs/fontSettings' },
              },
            },
            additionalProperties: false,
          },
          fontFamily: {
            type: 'string', minLength: 1, pattern: '\\S', description: 'Font-family scalar override',
          },
          fontSize: { type: 'number', exclusiveMinimum: 0, description: 'Font-size scalar override' },
          fontWeight: {
            oneOf: [{ enum: ['normal', 'bold'] }, { type: 'number' }],
            description: 'Font-weight scalar override',
          },
          lineHeight: { type: 'number', exclusiveMinimum: 0, description: 'Line-height scalar override' },
          notation: {
            type: 'string', minLength: 1, description: 'Notation catalog for edge and endpoint semantics',
          },
        },
      },
    },
    required: ['content'],
    $defs: {
      fontSettings: {
        type: 'object',
        properties: {
          family: { type: 'string', minLength: 1, pattern: '\\S' },
          size: { type: 'number', exclusiveMinimum: 0 },
          weight: { oneOf: [{ enum: ['normal', 'bold'] }, { type: 'number' }] },
          lineHeight: { type: 'number', exclusiveMinimum: 0 },
        },
        additionalProperties: false,
      },
    },
  },
};

const FontWeightSchema = z.union([
  z.enum(['normal', 'bold']),
  z.number().finite(),
]);
const PartialFontSettingsSchema = z.object({
  family: z.string().trim().min(1).optional(),
  size: z.number().finite().positive().optional(),
  weight: FontWeightSchema.optional(),
  lineHeight: z.number().finite().positive().optional(),
}).strict();
const DiagramFontSettingsSchema = z.object({
  default: PartialFontSettingsSchema.optional(),
  symbolOverrides: z.record(z.string(), PartialFontSettingsSchema).optional(),
}).strict();

const RenderOptionsSchema = z.object({
  format: z.enum(['svg', 'html']).default('svg'),
  direction: z.enum(['RIGHT', 'DOWN', 'LEFT', 'UP']).default('RIGHT'),
  theme: z.enum(['light', 'dark']).default('light'),
  style: z.enum(['lowfi', 'hifi', 'anemone', 'ane']).default('lowfi'),
  nodeSpacing: z.number().positive().default(50),
  fontSettings: DiagramFontSettingsSchema.optional(),
  fontFamily: z.string().trim().min(1).optional(),
  fontSize: z.number().finite().positive().optional(),
  fontWeight: FontWeightSchema.optional(),
  lineHeight: z.number().finite().positive().optional(),
  notation: z.string().trim().min(1).optional(),
});

const RenderArgsSchema = z.object({
  content: z.string(),
  options: RenderOptionsSchema.optional(),
});

type RenderNotice028 = Omit<Diagnostic, 'severity'> & { severity: 'warning' };

async function toRenderGraph(
  content: string,
  direction: LayoutOptions['direction'],
  nodeSpacing: number,
  svgOptions: SvgOptions,
): Promise<{ graph: SvgLayoutGraph;
  semanticGraph: GraphIR;
  successorSource?: import('@coral-viz/render').SuccessorSourceGraph028;
  capabilityNotices: RenderNotice028[] } | null> {
  let graph;
  let sourceProjection: ReturnType<typeof projectInstalledSourceToSuccessor028> | undefined;
  let installedDocument: ReturnType<typeof parseInstalledDocument028> | undefined;
  let semanticInterpretations: ReturnType<typeof successorSourceDisplayWithSemanticPorts028>['semanticInterpretations'] | undefined;
  try {
    const savedSource = /^[ \t]*@diagram\b/m.test(content);
    if (savedSource) {
      installedDocument = parseInstalledDocument028(content);
      const sourceDiagnostics = installedSourceDiagnostics028(installedDocument);
      if (sourceDiagnostics.some((item) => item.severity === 'error'))
        throw new GraphInputFailure(sourceDiagnostics);
    }
    sourceProjection = installedDocument ? projectInstalledSourceToSuccessor028(installedDocument) : undefined;
    if (sourceProjection && !sourceProjection.graph && sourceProjection.diagnostics.length) {
      throw new GraphInputFailure(sourceProjection.diagnostics.map((item) => ({
        severity: 'error' as const, code: item.code, message: item.message,
        ...(item.range ? { position: item.range.start, range: item.range } : {}),
      })));
    }
    if (sourceProjection && !sourceProjection.graph) throw new GraphInputFailure([{
      severity: 'error', code: 'coral.successor.projection.unsupported',
      message: 'The saved Coral source cannot be projected without loss.',
    }]);
    if (sourceProjection?.graph) {
      const fragmentDeclarations = installedDocument?.syntax.statements.filter(
        (item): item is CandidateFragmentSyntax => item.kind === 'fragment') ?? [];
      const fragmentCapabilities = sourceProjection.graph.interaction
        ? sequenceFragmentDisplayDiagnostics028(fragmentDeclarations, sourceProjection.graph) : [];
      if (fragmentCapabilities.length) {
        const capability = fragmentCapabilities.map((item) => ({
          severity: item.severity, code: item.code, message: item.message,
          position: item.range.start, range: item.range,
        }));
        const integrity = assessInstalledSuccessorSourceIntegrity028(installedDocument!, sourceProjection.graph)
          .map((item) => ({ severity: 'error' as const, code: item.code, message: item.message,
            ...(item.subject ? { subject: item.subject } : {}),
            ...(item.range ? { position: item.range.start, range: item.range } : {}),
          }));
        throw new GraphInputFailure([...capability, ...integrity]);
      }
      const portDeclarations = installedDocument?.syntax.statements.filter(
        (item): item is CandidatePortSyntax => item.kind === 'port') ?? [];
      if (sourceProjection.graph.interaction && portDeclarations.length) {
        const capability = sequenceSourcePortCapabilityDiagnostics028(portDeclarations).map((item) => ({
          severity: 'error' as const, code: item.code, message: item.message,
          subject: item.subject,
          ...(item.range ? { position: item.range.start, range: item.range } : {}),
        }));
        const integrity = assessInstalledSuccessorSourceIntegrity028(installedDocument!, sourceProjection.graph)
          .map((item) => ({ severity: 'error' as const, code: item.code, message: item.message,
            ...(item.subject ? { subject: item.subject } : {}),
            ...(item.range ? { position: item.range.start, range: item.range } : {}),
          }));
        throw new GraphInputFailure([...capability, ...integrity]);
      }
      if (sourceProjection.graph.interaction) {
        const integrity = assessInstalledSuccessorSourceIntegrity028(installedDocument!, sourceProjection.graph);
        if (integrity.length) throw new GraphInputFailure(integrity.map((item) => ({
          severity: 'error' as const, code: item.code, message: item.message,
          ...(item.subject ? { subject: item.subject } : {}),
          ...(item.range ? { position: item.range.start, range: item.range } : {}),
        })));
      }
      try {
        if (sourceProjection.graph.interaction) graph = successorSourceDisplay028(sourceProjection.graph);
        else {
          const paired = successorSourceDisplayWithSemanticPorts028(sourceProjection.graph);
          graph = paired.display;
          semanticInterpretations = paired.semanticInterpretations;
        }
      }
      catch (cause) {
        throw new GraphInputFailure([successorDisplayFailureDiagnostic028(cause,
          sourceProjection.graph, installedDocument, 'coral.successor.display.unsupported')]);
      }
      if (installedDocument) {
        const catalogInterpretations = semanticInterpretations ?? resolveSuccessorGraphNodes028(sourceProjection.graph);
        const sourceIssues = [
          ...sourceNodeCatalogChoiceDiagnostics028(installedDocument.syntax.statements.filter(
            (item): item is CandidateNodeSyntax => item.kind === 'node'), catalogInterpretations),
          ...sourcePortDeclarationDiagnostics028(portDeclarations, catalogInterpretations),
        ];
        if (sourceIssues.length) throw new GraphInputFailure(sourceIssues.map((item) => ({
          severity: 'error' as const, code: item.code, message: item.message,
          subject: item.subject,
          ...(item.range ? { position: item.range.start, range: item.range } : {}),
        })));
      }
    } else graph = readGraph(content);
  } catch (error) {
    if (error instanceof GraphInputFailure) throw error;
    throw new GraphInputFailure([{
      severity: 'error', code: 'render.capability.input-projection',
      message: error instanceof Error ? error.message : 'The input cannot be projected without loss.',
    }]);
  }

  const validation = validateIR(sourceProjection?.graph ? spatialValidationGraph028(graph) : graph);
  const portReferences = semanticInterpretations && sourceProjection?.graph
    ? assessSuccessorSourcePortReferences028(sourceProjection.graph,
      installedDocument ? installedWrittenPortReferenceRanges028(installedDocument) : undefined,
      semanticInterpretations) : undefined;
  const portableErrors = validation.errors.filter((error) =>
    error.code !== 'INVALID_PORT_REFERENCE' ||
      !portReferences?.supersededGraphIrPaths.has(error.path));
  if (portableErrors.length) throw new GraphInputFailure(portableErrors.map((error) => ({
    severity: 'error' as const, code: error.code,
    message: `${error.path || '/'}: ${error.message}`,
  })));
  const semanticPortErrors = portReferences?.assessments.flatMap(({ assessment }) => assessment.diagnostics) ?? [];
  if (semanticPortErrors.length) {
    throw new GraphInputFailure(semanticPortErrors.map((item) => ({
      severity: 'error', code: item.code, message: item.message,
      ...(item.range ? { position: item.range.start, range: item.range } : {}),
      subject: { kind: 'edge', id: item.edgeId },
    })));
  }
  // A sequence document draws the specialized sequence scene: no generic ELK
  // layout, and no silently dropped interaction (R-060 AC-2/AC-4).
  if (isSequenceGraph(graph)) {
    const issues = validateSequenceInteraction(graph);
    if (issues.length) {
      throw new GraphInputFailure(issues.map((issue) => ({ severity: 'error' as const, code: issue.code, message: issue.message })));
    }
  }
  const laidOut = await layoutGraphForSvg(graph, { direction, nodeSpacing, svgOptions,
    ...(semanticInterpretations ? { semanticInterpretations } : {}) });
  const edgeStatements = installedDocument?.syntax.statements.filter((item) => item.kind === 'edge') ?? [];
  const rejectedIntent = (laidOut.layoutDiagnostics028 ?? []).filter((item) =>
    item.code === 'layout.proximity.rejected' || item.code === 'layout.constraint.preferred-rejected' ||
    item.code === 'layout.route.degraded');
  const locatedIntent = installedDocument && rejectedIntent.length
    ? sourceSpatialFailureDiagnostics028({ diagnostics: rejectedIntent }, installedDocument) : rejectedIntent;
  const capabilityNotices: RenderNotice028[] = [
    ...locatedIntent.map((item): RenderNotice028 => ({ ...item, severity: 'warning' })),
    ...(sourceProjection?.graph
    ? [...sourceLayoutCapabilityNotices028(sourceProjection.graph, edgeStatements),
      ...sourceSemanticCapabilityNotices028(sourceProjection.graph,
        installedDocument?.syntax.statements.filter((item): item is CandidateNodeSyntax => item.kind === 'node') ?? [],
        edgeStatements)] : []),
    ...validation.warnings.map((warning): RenderNotice028 => ({
      severity: 'warning', code: warning.code,
      message: `${warning.path || '/'}: ${warning.message}`,
    })),
  ].sort((left, right) =>
      (left.range?.start.offset ?? Number.MAX_SAFE_INTEGER) -
      (right.range?.start.offset ?? Number.MAX_SAFE_INTEGER));
  return { graph: laidOut, semanticGraph: graph, capabilityNotices,
    ...(sourceProjection?.graph ? { successorSource: sourceProjection.graph } : {}) };
}

export async function handleRender(args: unknown) {
  const parsed = RenderArgsSchema.parse(args);
  const options = RenderOptionsSchema.parse(parsed.options ?? {});
  if (options.notation !== undefined && !notationRegistry.get(options.notation)) {
    return {
      content: [{ type: 'text' as const, text: `Unknown notation "${options.notation}".` }],
      isError: true,
    };
  }
  if (options.notation !== undefined && detectFormat(parsed.content).format === 'coral') {
    const source = readCoralSource028(parsed.content);
    const selected = source.header?.catalog.id;
    const successorAccepted = !source.parse.success && /^[ \t]*@diagram\b/m.test(parsed.content)
      ? projectInstalledSourceToSuccessor028(parsed.content).graph !== undefined : false;
    if ((source.parse.success || successorAccepted) && selected !== undefined && options.notation !== selected) {
      const diagnostic = { severity: 'error' as const, code: 'mcp.render.notation.conflict',
        message: `Source selects notation "${selected}"; the render option cannot replace it with "${options.notation}".` };
      return { content: [{ type: 'text' as const, text: diagnostic.message }],
        structuredContent: { diagnostics: [diagnostic] }, isError: true as const };
    }
  }
  const scalarFontOption = options.fontFamily !== undefined
    || options.fontSize !== undefined
    || options.fontWeight !== undefined
    || options.lineHeight !== undefined;
  const normalizedStyle = options.style === 'ane' ? 'anemone' : options.style;
  const svgOptions: SvgOptions = {
    theme: options.theme,
    style: normalizedStyle === 'lowfi' ? 'lowfi' : 'hifi',
    renderStyle: normalizedStyle,
    layoutDirection: options.direction,
    ...(options.fontSettings !== undefined || scalarFontOption
      ? { fontSettings: (options.fontSettings ?? {}) as DiagramRenderFontSettings }
      : {}),
    ...(options.fontFamily !== undefined ? { fontFamily: options.fontFamily } : {}),
    ...(options.fontSize !== undefined ? { fontSize: options.fontSize } : {}),
    ...(options.fontWeight !== undefined
      ? { fontWeight: options.fontWeight as RenderFontWeight }
      : {}),
    ...(options.lineHeight !== undefined ? { lineHeight: options.lineHeight } : {}),
    ...(options.notation !== undefined ? { notation: options.notation } : {}),
  };
  let rendered;
  try { rendered = await toRenderGraph(
    parsed.content,
    options.direction,
    options.nodeSpacing,
    svgOptions,
  ); } catch (error) {
    if (error instanceof GraphInputFailure) return inputFailureResponse(error);
    if (error instanceof RenderCapabilityError) return renderCapabilityResponse(error, parsed.content);
    if (error instanceof SpatialLayoutError) return spatialLayoutFailureResponse(error, parsed.content);
    throw error;
  }

  if (!rendered || rendered.graph.nodes.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'Could not parse and validate any nodes from the input.' }],
      isError: true,
    };
  }

  const { graph, semanticGraph, successorSource, capabilityNotices } = rendered;

  const renderOptions = { ...svgOptions, edgeRoutes: graph.edgeRoutes, semanticGraph,
    ...(successorSource ? { successorSource } : {}),
  };
  let document: string;
  try {
    document = options.format === 'html'
      ? renderHtml(graph, renderOptions)
      : renderSvg(graph, renderOptions);
  } catch (error) {
    if (error instanceof RenderCapabilityError) return renderCapabilityResponse(error, parsed.content);
    throw error;
  }
  const label = options.format.toUpperCase();

  return {
    content: [{
      type: 'text' as const,
      text: `Generated ${label} for ${graph.nodes.length} nodes, ${graph.edges.length} edges.` +
        (capabilityNotices.length ? `\nWarning: ${capabilityNotices.map((item) => item.message).join(' ')}` : '') +
        `\n\n${document}`,
    }],
    ...(capabilityNotices.length ? { structuredContent: { diagnostics: capabilityNotices } } : {}),
  };
}

function renderCapabilityResponse(error: RenderCapabilityError, source?: string) {
  return {
    content: [{ type: 'text' as const, text: `Could not render diagram:\n${error.message}` }],
    structuredContent: { diagnostics: source ? sourceSpatialFailureDiagnostics028(error, source) : error.diagnostics.map((diagnostic) => ({
      severity: 'error' as const, ...diagnostic,
    })) },
    isError: true as const,
  };
}

function spatialLayoutFailureResponse(error: SpatialLayoutError, source?: string) {
  return {
    content: [{ type: 'text' as const, text: `Could not lay out diagram:\n${error.message}` }],
    structuredContent: { diagnostics: source ? sourceSpatialFailureDiagnostics028(error, source) : error.diagnostics },
    isError: true as const,
  };
}
