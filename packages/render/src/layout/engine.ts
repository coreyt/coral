import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode, ElkPort } from 'elkjs';
import type {
  LayoutDefaults,
  LayoutDiagnostic,
  LayoutDirection,
  LayoutEdge,
  LayoutEngine,
  LayoutExecution,
  LayoutNode,
  LayoutOptionInput,
  LayoutRequest,
  LayoutResult,
  LayoutRouting,
  NormalizedLayoutOptions,
  OutsideLabel029,
  Point,
} from './types.js';
import { shapeRegistry } from '../shapes/index.js';
import { stencilFitPoint028, StencilAnchorGeometryCapabilityError } from '../stencilAnchorGeometry028.js';

const ALGORITHMS = new Set(['layered', 'mrtree', 'stress', 'force', 'radial', 'box', 'fixed']);
const DIRECTIONS = new Set<LayoutDirection>(['UP', 'DOWN', 'LEFT', 'RIGHT']);
const ROUTING = new Map<string, LayoutRouting>([
  ['orthogonal', 'ORTHOGONAL'], ['ORTHOGONAL', 'ORTHOGONAL'],
  ['polyline', 'POLYLINE'], ['POLYLINE', 'POLYLINE'],
  ['spline', 'SPLINES'], ['splines', 'SPLINES'], ['SPLINES', 'SPLINES'],
]);
const HIERARCHY = new Set(['INCLUDE_CHILDREN', 'SEPARATE_CHILDREN']);

export class LayoutExecutionError extends Error {
  readonly diagnostics: LayoutDiagnostic[];

  constructor(diagnostic: LayoutDiagnostic) {
    super(diagnostic.message);
    this.name = 'LayoutExecutionError';
    this.diagnostics = [diagnostic];
  }
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Layout aborted', 'AbortError');
  const error = new Error('Layout aborted');
  error.name = 'AbortError';
  return error;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function invalid(path: string): LayoutDiagnostic {
  return { code: 'layout.option.invalid', severity: 'warning', message: `Invalid layout option at ${path}`, path };
}

function normalizeAlgorithm(value: unknown): string | undefined {
  const candidate = value === 'tree' ? 'mrtree' : value;
  return typeof candidate === 'string' && ALGORITHMS.has(candidate) ? candidate : undefined;
}

function applyInput(
  target: Record<string, string>,
  input: LayoutOptionInput | undefined,
  diagnostics: LayoutDiagnostic[],
  fallback: Record<string, string>,
): void {
  if (!input) return;
  if (input.algorithm !== undefined) {
    const value = normalizeAlgorithm(input.algorithm);
    if (value) target['elk.algorithm'] = value;
    else { diagnostics.push(invalid('algorithm')); target['elk.algorithm'] = fallback['elk.algorithm']; }
  }
  if (input.direction !== undefined) {
    if (DIRECTIONS.has(input.direction as LayoutDirection)) target['elk.direction'] = input.direction;
    else { diagnostics.push(invalid('direction')); target['elk.direction'] = fallback['elk.direction']; }
  }
  const spacing: Array<[keyof NonNullable<LayoutOptionInput['spacing']>, string]> = [
    ['nodeNode', 'elk.spacing.nodeNode'], ['nodeEdge', 'elk.spacing.edgeNode'],
    ['edgeNode', 'elk.spacing.edgeNode'], ['edgeEdge', 'elk.spacing.edgeEdge'],
    ['layerSpacing', 'elk.layered.spacing.nodeNodeBetweenLayers'],
  ];
  for (const [field, key] of spacing) {
    const value = input.spacing?.[field];
    if (value === undefined) continue;
    if (Number.isFinite(value) && value > 0) target[key] = String(value);
    else { diagnostics.push(invalid(`spacing.${field}`)); if (fallback[key] !== undefined) target[key] = fallback[key]; else delete target[key]; }
  }
  if (input.edgeRouting !== undefined) {
    const value = ROUTING.get(input.edgeRouting);
    if (value) target['elk.edgeRouting'] = value;
    else { diagnostics.push(invalid('edgeRouting')); if (fallback['elk.edgeRouting']) target['elk.edgeRouting'] = fallback['elk.edgeRouting']; else delete target['elk.edgeRouting']; }
  }
  if (input.hierarchyHandling !== undefined) {
    if (HIERARCHY.has(input.hierarchyHandling)) target['elk.hierarchyHandling'] = input.hierarchyHandling;
    else { diagnostics.push(invalid('hierarchyHandling')); if (fallback['elk.hierarchyHandling']) target['elk.hierarchyHandling'] = fallback['elk.hierarchyHandling']; else delete target['elk.hierarchyHandling']; }
  }
  for (const [key, raw] of Object.entries(input.elkOptions ?? {})) {
    let valid = true;
    let value = String(raw);
    if (key === 'elk.algorithm') {
      const normalized = normalizeAlgorithm(raw);
      valid = normalized !== undefined;
      if (normalized) value = normalized;
    } else if (key === 'elk.direction') {
      valid = DIRECTIONS.has(raw as LayoutDirection);
    } else if (key === 'elk.edgeRouting') {
      const normalized = ROUTING.get(String(raw));
      valid = normalized !== undefined;
      if (normalized) value = normalized;
    } else if (key === 'elk.hierarchyHandling') {
      valid = HIERARCHY.has(String(raw));
    } else if (key === 'elk.spacing.nodeNode'
      || key === 'elk.spacing.edgeNode'
      || key === 'elk.spacing.edgeEdge'
      || key === 'elk.layered.spacing.nodeNodeBetweenLayers') {
      const numeric = typeof raw === 'number' ? raw : Number(raw);
      valid = Number.isFinite(numeric) && numeric > 0;
      if (valid) value = String(numeric);
    }
    if (valid) target[key] = value;
    else {
      diagnostics.push(invalid(`elkOptions.${key}`));
      if (fallback[key] !== undefined) target[key] = fallback[key];
      else delete target[key];
    }
  }
}

export function normalizeLayoutOptions(
  input: LayoutOptionInput | undefined,
  defaults: LayoutDefaults | undefined,
): NormalizedLayoutOptions {
  const algorithm = normalizeAlgorithm(defaults?.algorithm);
  const direction = defaults?.direction;
  if (!algorithm || !direction || !DIRECTIONS.has(direction as LayoutDirection)) {
    throw new LayoutExecutionError({
      code: 'layout.option.invalid', severity: 'error',
      message: 'Layout caller must supply valid algorithm and direction defaults', path: 'defaults',
    });
  }
  const diagnostics: LayoutDiagnostic[] = [];
  const effectiveOptions: Record<string, string> = {
    'elk.algorithm': algorithm,
    'elk.direction': direction,
  };
  applyInput(effectiveOptions, defaults, diagnostics, { ...effectiveOptions });
  const fallback = { ...effectiveOptions };
  applyInput(effectiveOptions, input, diagnostics, fallback);
  // BRANDES_KOEPF keeps 1-to-1 spines straight with minimal bends and crossings
  // across both flat and compound layered graphs (0.2.11 ADR D1.1).
  if (effectiveOptions['elk.algorithm'] === 'layered'
    && effectiveOptions['elk.layered.nodePlacement.strategy'] === undefined) {
    effectiveOptions['elk.layered.nodePlacement.strategy'] = 'BRANDES_KOEPF';
  }
  if (effectiveOptions['elk.algorithm'] === 'layered'
    && effectiveOptions['elk.edgeRouting'] !== 'POLYLINE'
    && effectiveOptions['elk.edgeRouting'] !== 'SPLINES'
    && effectiveOptions['elk.spacing.portPort'] === undefined) {
    effectiveOptions['elk.spacing.portPort'] = '14';
  }
  return { effectiveOptions, diagnostics };
}

let singleton: LayoutEngine | undefined;

export function getElkLayoutEngine(): LayoutEngine {
  const ElkConstructor = ELK as unknown as new () => LayoutEngine;
  singleton ??= new ElkConstructor();
  return singleton;
}

function nodeOptions(node: LayoutNode): Record<string, string> {
  const options: Record<string, string> = {};
  const value = node.layoutOptions ?? {};
  if (value.portConstraints) options['elk.portConstraints'] = value.portConstraints;
  if (value.portAlignment) options['elk.portAlignment.default'] = value.portAlignment;
  if (value.sizeConstraints) options['elk.nodeSize.constraints'] = `[${value.sizeConstraints.join(', ')}]`;
  if (value.minimumSize) options['elk.nodeSize.minimum'] = `(${value.minimumSize.width},${value.minimumSize.height})`;
  // A mixed group places its automatic children in its automatic padding (D6).
  const padding = node.automaticPadding028 ?? value.padding;
  if (padding) {
    const { top = 0, right = 0, bottom = 0, left = 0 } = padding;
    options['elk.padding'] = `[top=${top},left=${left},bottom=${bottom},right=${right}]`;
  }
  return options;
}

// ELK skips a label without text; this text is never measured or drawn.
const LABEL_TEXT029 = 'label';
const OUTSIDE_LABEL_PLACEMENT029 = {
  above: 'OUTSIDE V_TOP H_CENTER', below: 'OUTSIDE V_BOTTOM H_CENTER',
  left: 'OUTSIDE H_LEFT V_CENTER', right: 'OUTSIDE H_RIGHT V_CENTER',
} as const;

interface BuildContext {
  diagnostics: LayoutDiagnostic[];
  ports: Map<string, Map<string, string>>;
  labels: Map<string, OutsideLabel029>;
  nextPort: number;
  direction?: LayoutDirection;
}

const isSpacingOption = (key: string) => key.startsWith('elk.spacing.') || key.startsWith('elk.layered.spacing.');
const spacingOptions = (options: Record<string, string>) => Object.fromEntries(
  Object.entries(options).filter(([key]) => isSpacingOption(key)));

function buildNode(node: LayoutNode, context: BuildContext, inheritedSpacing: Record<string, string>): ElkNode {
  const portMap = new Map<string, string>();
  const hasFreePorts = !!node.ports?.some((port) => port.attachment === 'free');
  const hasFixedPorts = !!node.ports?.some((port) => port.attachment !== 'free');
  // ELK's constraint is node-wide. For a mixed node these sides are only
  // provisional; the spatial resolver rebinds free ports after node layout.
  const freePorts = hasFreePorts && !hasFixedPorts;
  const ports: ElkPort[] | undefined = node.ports?.map((port) => {
    const id = `__coral_port_${context.nextPort++}`;
    portMap.set(port.id, id);
    const valid = port.position === undefined || (Number.isFinite(port.position) && port.position >= 0 && port.position <= 1);
    if (!valid) context.diagnostics.push({
      code: 'layout.port.invalid', severity: 'warning', message: 'Invalid layout port position',
      path: `nodes.${node.id}.ports.${port.id}.position`,
    });
    if (freePorts) return { id, width: 0, height: 0 };
    const position = valid ? (port.position ?? 0.5) : 0.5;
    const horizontal = port.side === 'NORTH' || port.side === 'SOUTH';
    // A user outline is frame geometry: its outline point maps by the identity.
    const shape = port.frameOutline029 ? undefined
      : port.stencilShapeId ? shapeRegistry.get(port.stencilShapeId) : undefined;
    if (port.stencilShapeId && !shape && !port.frameOutline029)
      throw new StencilAnchorGeometryCapabilityError(port.stencilShapeId);
    const outline = port.outlinePoint && shape
      ? stencilFitPoint028(shape, port.outlinePoint, node.width, node.height,
        { ...(port.stencilSymbolId ? { symbolId: port.stencilSymbolId } : {}),
          ...(context.direction ? { layoutDirection: context.direction } : {}) }) : port.outlinePoint;
    return { id, width: 0, height: 0,
      x: outline ? node.width * outline.x
        : horizontal ? node.width * position : (port.side === 'EAST' ? node.width : 0),
      y: outline ? node.height * outline.y
        : horizontal ? (port.side === 'SOUTH' ? node.height : 0) : node.height * position,
      layoutOptions: { 'elk.port.side': port.side } };
  });
  if (node.ports !== undefined) context.ports.set(node.id, portMap);
  // ELK does not inherit these spacings into compound subgraphs. Apply the
  // caller's normalized spacing to each container, keeping local overrides.
  const compoundSpacing = node.children?.length ? { ...inheritedSpacing } : {};
  if (node.children?.length) {
    const local = node.layoutOptions as LayoutNode['layoutOptions'] & Pick<LayoutOptionInput, 'spacing' | 'elkOptions'>;
    applyInput(compoundSpacing, local && { spacing: local.spacing,
      elkOptions: Object.fromEntries(Object.entries(local.elkOptions ?? {}).filter(([key]) => isSpacingOption(key))) },
      context.diagnostics, inheritedSpacing);
  }
  const layoutOptions = { ...compoundSpacing, ...nodeOptions(node) };
  // An empty projected catalog has no fixed contacts. Giving ELK FIXED_POS
  // here pins its implicit edge contacts to the node origin and creates
  // corner detours when the spatial resolver later reattaches the route.
  if (ports?.length && !layoutOptions['elk.portConstraints']) layoutOptions['elk.portConstraints'] = freePorts ? 'FREE' : 'FIXED_POS';
  // ELK layered adds an outside label to the node's margins, so neighbours and
  // its routes keep clear of it; the node's own size and ports are unchanged.
  const label = node.outsideLabel029;
  if (label) {
    layoutOptions['elk.nodeLabels.placement'] = OUTSIDE_LABEL_PLACEMENT029[label.side];
    context.labels.set(node.id, label);
  }
  return {
    id: node.id, width: node.width, height: node.height,
    ...(node.position ? { x: node.position.x, y: node.position.y } : {}),
    ...(ports?.length ? { ports } : {}),
    ...(label ? { labels: [{ id: `${node.id}:__coral_label`, text: LABEL_TEXT029, width: label.width, height: label.height }] } : {}),
    ...(Object.keys(layoutOptions).length ? { layoutOptions } : {}),
    ...(node.children ? { children: node.children.map((child) => buildNode(child, context, spacingOptions(layoutOptions))) } : {}),
  };
}

function endpoint(nodeId: string, portId: string | undefined, edgeId: string, role: string, context: BuildContext): string {
  if (portId === undefined) return nodeId;
  const mapped = context.ports.get(nodeId)?.get(portId);
  if (mapped) return mapped;
  context.diagnostics.push({
    code: 'layout.port.missing', severity: 'warning', message: 'Layout edge references an unavailable port',
    path: `edges.${edgeId}.${role}Port`,
  });
  return nodeId;
}

function buildEdge(edge: LayoutEdge, context: BuildContext): ElkExtendedEdge {
  return {
    id: edge.id,
    sources: [endpoint(edge.source, edge.sourcePort, edge.id, 'source', context)],
    targets: [endpoint(edge.target, edge.targetPort, edge.id, 'target', context)],
  };
}

function shift(point: Point, offset: Point): Point {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

function collectNodeOffsets(
  container: ElkNode,
  containerOffset: Point,
  offsets = new Map<string, Point>(),
): Map<string, Point> {
  for (const node of container.children ?? []) {
    const absolute = shift({ x: node.x ?? 0, y: node.y ?? 0 }, containerOffset);
    offsets.set(node.id, absolute);
    collectNodeOffsets(node, absolute, offsets);
  }
  return offsets;
}

function decode(
  container: ElkNode,
  parentId: string | undefined,
  containerOffset: Point,
  nodeOffsets: Map<string, Point>,
  result: LayoutResult,
): void {
  for (const edge of container.edges ?? []) {
    const edgeContainer = (edge as typeof edge & { container?: string }).container;
    const edgeOffset = edgeContainer ? (nodeOffsets.get(edgeContainer) ?? containerOffset) : containerOffset;
    result.edges.push({
      id: edge.id,
      sections: (edge.sections ?? []).map((section) => ({
        startPoint: shift(section.startPoint, edgeOffset),
        bendPoints: (section.bendPoints ?? []).map((point) => shift(point, edgeOffset)),
        endPoint: shift(section.endPoint, edgeOffset),
      })),
    });
  }
  for (const node of container.children ?? []) {
    const position = { x: node.x ?? 0, y: node.y ?? 0 };
    const absolutePosition = shift(position, containerOffset);
    result.nodes.push({
      id: node.id,
      ...(parentId ? { parentId } : {}),
      position,
      absolutePosition,
      width: node.width ?? 0,
      height: node.height ?? 0,
    });
    decode(node, node.id, absolutePosition, nodeOffsets, result);
  }
}

export async function computeElkLayout(request: LayoutRequest, execution: LayoutExecution = {}): Promise<LayoutResult> {
  checkAbort(execution.signal);
  const normalized = normalizeLayoutOptions(request.options, request.defaults);
  const direction = normalized.effectiveOptions['elk.direction'] as LayoutDirection | undefined;
  const context: BuildContext = { diagnostics: [...normalized.diagnostics], ports: new Map(), labels: new Map(), nextPort: 0, direction };
  const children = request.nodes.map((node) => buildNode(node, context, spacingOptions(normalized.effectiveOptions)));
  const graph: ElkNode = {
    id: request.id,
    layoutOptions: normalized.effectiveOptions,
    children,
    edges: request.edges.map((edge) => buildEdge(edge, context)),
  };
  checkAbort(execution.signal);
  let output: ElkNode;
  try {
    output = await (execution.engine ?? getElkLayoutEngine()).layout(graph);
  } catch {
    if (execution.signal?.aborted) throw abortError();
    throw new LayoutExecutionError({
      code: 'layout.engine.failed', severity: 'error', message: 'ELK layout execution failed',
    });
  }
  checkAbort(execution.signal);
  const result: LayoutResult = {
    nodes: [], edges: [], width: output.width ?? 0, height: output.height ?? 0,
    effectiveOptions: normalized.effectiveOptions, diagnostics: context.diagnostics,
  };
  const origin = { x: 0, y: 0 };
  decode(output, undefined, origin, collectNodeOffsets(output, origin), result);
  for (const node of result.nodes) {
    const label = context.labels.get(node.id);
    if (label) node.outsideLabel029 = label;
  }
  return result;
}
