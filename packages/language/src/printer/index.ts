/**
 * Coral DSL Printer
 *
 * Converts Graph-IR back to Coral DSL text.
 * Enables roundtrip: DSL → IR → DSL
 */

import type {
  GraphIR, GraphNode, GraphEdge, SpatialConstraint, RouteAnchor, InteractionFragment,
} from '../types.js';
import { isSequenceGraph, sequenceMessageToken, sortCanonicalInteraction,
  UML_SEQUENCE_NOTATION, validateSequenceInteraction } from '../sequence.js';
import { printDiagnostic, type Diagnostic } from '../diagnostics.js';
import { formatCompactEnd } from '../compactEnd.js';
import { escapeString, quoteIfNeeded } from '../strings.js';
import { IdAllocator, allocateEdgeId } from '../ids.js';
import { isJsonSafe, stableJson } from '../structured.js';
import {
  LINE_STYLES,
  ROUTINGS,
  isConstraintParameter,
  isDimensions,
  isEdgeLabelPlacement,
  isGraphMetadata,
  isLayoutOptions,
  isNodeLabelPlacement,
  isNodeLayoutOptions,
  isOneOf,
  isPorts,
  isWaypointId,
  validateRelationshipEnd,
  type ConstraintParameter,
} from '../validators.js';
import {
  UML_CLASS_NOTATION,
  UML_CLASS_PROFILE,
  formatUmlMember,
  isPrintableUmlClassifier,
  umlSymbolForKind,
} from '../uml.js';

/** Somewhere to put diagnostics. `print` passes a sink that drops them. */
interface DiagnosticSink {
  push(diagnostic: Diagnostic): void;
}

/** Text plus everything the Coral surface could not carry (R-011 AC-6). */
export interface PrintResult {
  text: string;
  diagnostics: Diagnostic[];
}

/**
 * Canonical shortest round-tripping finite-number spelling, and the checked
 * point for every number the printer writes: a non-finite value has no Coral
 * spelling, so it returns undefined and the caller omits the value with loss.
 */
function formatCoord(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Object.is(value, -0) ? '0' : String(value);
}

/** A `(x, y)` point, or undefined when either coordinate is not finite. */
function formatPoint(point: { x: unknown; y: unknown } | undefined): string | undefined {
  const x = formatCoord(point?.x);
  const y = formatCoord(point?.y);
  return x === undefined || y === undefined ? undefined : `(${x}, ${y})`;
}

/** True when a property value has a Coral spelling. */
export function isPrintableScalar(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return false;
}

function printValue(value: unknown): string {
  return typeof value === 'string' ? `"${escapeString(value)}"` : stableJson(value);
}

/** Edge fields with no Coral spelling. */
const UNPRINTABLE_EDGE_FIELDS: ReadonlyArray<[string, string]> = [
  ['sourceInfo', 'source-info'],
];

/** Report the node's own unprintable fields. Called by printNode, which owns the walk. */
function reportNodeFieldLoss(
  node: GraphNode,
  parentId: string | undefined,
  properties: ReadonlyArray<readonly [string, unknown]>,
  out: DiagnosticSink
): void {
  const bag = node as unknown as Record<string, unknown>;
  if (bag.sourceInfo !== undefined) {
    reportFieldLoss('node', node.id, 'sourceInfo', out);
  }
  if (node.parent !== undefined && node.parent !== parentId) {
    out.push(printDiagnostic({
      severity: 'warning',
      code: `coral.node.parent.${parentId === undefined ? 'dropped' : 'degraded'}`,
      message: parentId === undefined
        ? `Top-level node "${node.id}" carries parent "${node.parent}", which nesting cannot express`
        : `Node "${node.id}" carries parent "${node.parent}" but is nested under "${parentId}"`,
      subject: { kind: 'node', id: node.id },
    }));
  }

  for (const [key, value] of properties) {
    collectPropertyLoss('node', node.id, key, value, out);
  }

}

/** Read a property bag without invoking accessors. */
function propertyEntries(
  kind: 'node' | 'edge',
  id: string,
  properties: unknown,
  out: DiagnosticSink
): Array<[string, unknown]> {
  if (properties === undefined) return [];
  try {
    if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
      throw new TypeError('not an object');
    }
    const prototype = Object.getPrototypeOf(properties);
    const keys = Reflect.ownKeys(properties);
    const descriptors = Object.getOwnPropertyDescriptors(properties);
    if ((prototype !== Object.prototype && prototype !== null) || keys.some((key) => typeof key !== 'string')) {
      throw new TypeError('not a plain string-keyed object');
    }
    const entries: Array<[string, unknown]> = [];
    for (const key of keys) {
      if (typeof key !== 'string') throw new TypeError('symbol key');
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !('value' in descriptor)) throw new TypeError('not enumerable data');
      entries.push([key, descriptor.value]);
    }
    return entries;
  } catch {
    out.push(printDiagnostic({
      severity: 'warning',
      code: `coral.${kind}.properties.dropped`,
      message: `Properties on ${kind} "${id}" are not a plain enumerable data object and are not emitted`,
      subject: { kind, id },
    }));
    return [];
  }
}

function collectPropertyLoss(
  kind: 'node' | 'edge',
  id: string,
  key: string,
  value: unknown,
  out: DiagnosticSink
): void {
  if (key.startsWith('_')) {
    out.push(printDiagnostic({
      severity: 'info',
      code: `coral.${kind}.reserved-property.dropped`,
      message: `Property "${key}" on ${kind} "${id}" is reserved for internal use and is not emitted`,
      subject: { kind, id },
    }));
    return;
  }
  if (!isJsonSafe(value)) {
    out.push(printDiagnostic({
      severity: 'warning',
      code: `coral.${kind}.property.dropped`,
      message: `Property "${key}" on ${kind} "${id}" is not a JSON-safe finite value and is not emitted`,
      subject: { kind, id },
    }));
  }
}

function reportFieldLoss(
  kind: 'graph' | 'node' | 'edge', id: string, field: string, out: DiagnosticSink,
  severity: 'warning' | 'error' = 'warning',
): void {
  const slug = field.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  out.push(printDiagnostic({
    severity,
    code: `coral.${kind}.${slug}.dropped`,
    message: `${kind[0].toUpperCase() + kind.slice(1)} "${id}" carries ${field}, which cannot be represented losslessly`,
    subject: { kind, id },
  }));
}

function reportUnsupportedField(
  kind: 'graph' | 'node' | 'edge', id: string, field: string, out: DiagnosticSink,
): void {
  out.push(printDiagnostic({
    severity: 'warning',
    code: 'coral.print.field.unsupported',
    message: `${kind[0].toUpperCase() + kind.slice(1)} "${id}" carries unsupported field ${field}`,
    subject: { kind, id },
  }));
}

function reportBlockingClassifier(node: GraphNode, out: DiagnosticSink): void {
  out.push(printDiagnostic({
    severity: 'error',
    code: 'coral.node.classifier.unsupported',
    message: `Node "${node.id}" carries classifier data outside the canonical UML class source subset`,
    subject: { kind: 'node', id: node.id },
  }));
}

function reportBlockingProfile(graph: GraphIR, out: DiagnosticSink): void {
  out.push(printDiagnostic({
    severity: 'error',
    code: 'coral.graph.profile.unsupported',
    message: `Graph "${graph.id}" must carry the exact UML class profile for UML class notation`,
    subject: { kind: 'graph', id: graph.id },
  }));
}

/** Report the edge's unprintable fields. Called by printEdge. */
function reportEdgeFieldLoss(
  edge: GraphEdge,
  properties: ReadonlyArray<readonly [string, unknown]>,
  out: DiagnosticSink
): void {
  const bag = edge as unknown as Record<string, unknown>;

  if (bag.routingPoints !== undefined) reportUnsupportedField('edge', edge.id, 'routingPoints', out);
  if (edge.sourceEnd !== undefined && !validateRelationshipEnd(edge.sourceEnd, 'sourceEnd').valid) {
    reportFieldLoss('edge', edge.id, 'sourceEnd', out);
  }
  if (edge.targetEnd !== undefined && !validateRelationshipEnd(edge.targetEnd, 'targetEnd').valid) {
    reportFieldLoss('edge', edge.id, 'targetEnd', out);
  }

  for (const [field, slug] of UNPRINTABLE_EDGE_FIELDS) {
    if (bag[field] !== undefined) {
      out.push(printDiagnostic({
        severity: 'warning',
        code: `coral.edge.${slug}.dropped`,
        message: `Edge "${edge.id}" carries ${field}, which the Coral surface cannot express`,
        subject: { kind: 'edge', id: edge.id },
      }));
    }
  }

  for (const [key, value] of properties) {
    collectPropertyLoss('edge', edge.id, key, value, out);
  }
}

/**
 * Print Graph-IR to Coral DSL text, reporting everything the surface cannot
 * carry.
 *
 * `print` keeps its bare-string signature for existing consumers; this is the
 * variant the editor uses.
 */
export function printWithDiagnostics(graph: GraphIR, options: PrintOptions = {}): PrintResult {
  if (options.edition === '0.2.8-preview') return printPreview028(graph, options);
  const diagnostics: Diagnostic[] = [];
  const text = renderGraph(graph, options, diagnostics);
  return { text, diagnostics };
}

/** The single traversal that both emits text and records what it declined to emit. */
function renderGraph(graph: GraphIR, options: PrintOptions, diagnostics: DiagnosticSink): string {
  const { indent = '  ' } = options;
  const lines: string[] = [];
  if (graph.version !== '3.0.0') {
    throw new Error(
      `Coral Language 1.0 requires GraphIR 3.0.0; migrate GraphIR ${String(graph.version)} ` +
      'through the named migration APIs before printing.',
    );
  }
  const umlProfile = graph.metadata?.notation === UML_CLASS_NOTATION;
  const exactUmlProfile = graph.profile?.id === UML_CLASS_PROFILE.id
    && graph.profile.kind === UML_CLASS_PROFILE.kind
    && graph.profile.version === UML_CLASS_PROFILE.version;
  const sequence = isSequenceGraph(graph);
  if (umlProfile && !exactUmlProfile) {
    reportBlockingProfile(graph, diagnostics);
  } else if (sequence && graph.metadata?.notation !== UML_SEQUENCE_NOTATION) {
    // A portable profile is sufficient to interpret GraphIR, but the current
    // Coral source header cannot carry it. Do not claim a lossless replay.
    reportFieldLoss('graph', graph.id, 'profile', diagnostics, 'error');
  } else if (graph.profile !== undefined && !umlProfile && !sequence) {
    reportFieldLoss('graph', graph.id, 'profile', diagnostics, 'error');
  }
  if (graph.interaction !== undefined && !sequence) reportFieldLoss('graph', graph.id, 'interaction', diagnostics);
  let fragmentPlan: SequenceFragmentPlan | undefined;
  if (sequence) {
    const issues = validateSequenceInteraction(graph);
    for (const issue of issues) {
      diagnostics.push(printDiagnostic({
        severity: 'error',
        code: 'coral.sequence.print.unsupported',
        message: `${issue.message} (${issue.code}); Coral source cannot represent it`,
        subject: issue.entity.kind === 'node' || issue.entity.kind === 'edge'
          ? { kind: issue.entity.kind, id: issue.entity.id } : { kind: 'graph', id: graph.id },
      }));
    }
    // The legacy sequence source spelling derives message kind from edge
    // type. It cannot replay a distinct operator-derived kind, even though
    // that disagreement is a U2 finding rather than GraphIR corruption.
    for (const message of graph.interaction?.messages ?? []) {
      const edge = graph.edges.find((candidate) => candidate.id === message.edgeId);
      if (edge && edge.type !== sequenceMessageToken(message.kind)) {
        diagnostics.push(printDiagnostic({ severity: 'error', code: 'coral.sequence.print.unsupported',
          message: `Message "${message.id}" has an operator kind distinct from its explicit edge type`,
          subject: { kind: 'edge', id: edge.id } }));
      }
    }
    // Only a valid interaction is an ordering authority; otherwise print storage order.
    if (issues.length === 0) {
      graph = orderSequenceGraph(graph);
      fragmentPlan = planSequenceFragments(graph);
    }
  }

  // Make the input safe for the replay: unique, non-empty ids, with edges
  // rewritten to follow (R-010 AC-2, AC-3).
  const safe = normaliseIds(graph, diagnostics);
  graph = safe;

  // Decide which nodes need an explicit `as` clause.
  const explicit = markExplicitIds(graph);
  const explicitEdges = markExplicitEdgeIds(graph);
  const constraintProjection = projectConstraints(validConstraints(graph, diagnostics), graph.nodes);

  // Each header field prints only when it passes the parser's validator.
  const graphData: Record<string, unknown> = {};
  const headerValid = {
    id: (value: unknown) => typeof value === 'string',
    name: (value: unknown) => typeof value === 'string',
    metadata: isGraphMetadata,
    layoutOptions: isLayoutOptions,
  };
  for (const field of ['id', 'name', 'metadata', 'layoutOptions'] as const) {
    let value: unknown = graph[field];
    if (value === undefined) continue;
    if (field === 'layoutOptions' && value && typeof value === 'object' &&
        'algorithmOptions' in value) {
      reportUnsupportedField('graph', graph.id, 'layoutOptions.algorithmOptions', diagnostics);
      const { algorithmOptions: _retired, ...portable } = value as Record<string, unknown>;
      value = portable;
    }
    if (headerValid[field](value)) graphData[field] = value;
    else reportFieldLoss('graph', graph.id, field, diagnostics);
  }
  if (typeof graphData.id === 'string' && graphData.id.length > 0) {
    lines.push(`@graph ${stableJson(graphData)}`);
  } else {
    reportFieldLoss('graph', graph.id, 'id', diagnostics);
  }

  if (lines.length > 0 && (graph.nodes.length > 0 || graph.edges.length > 0)) lines.push('');

  // Top-level nodes only; printNode recurses into children and reports as it goes.
  for (const node of graph.nodes) {
    printNode(node, lines, 0, indent, diagnostics, explicit, undefined,
      constraintProjection.inlineByNode, umlProfile);
  }

  if (graph.nodes.length > 0 && constraintProjection.lines.length > 0) lines.push('');
  lines.push(...constraintProjection.lines);

  if ((graph.nodes.length > 0 || constraintProjection.lines.length > 0) && graph.edges.length > 0) lines.push('');

  if (fragmentPlan) {
    lines.push(...printSequenceMessages(graph, fragmentPlan, (edge) => printEdge(edge, diagnostics, explicitEdges), indent));
    const statements = printSequenceStatements(graph.interaction!);
    if (statements.length) lines.push('', ...statements);
  } else {
    for (const edge of graph.edges) {
      lines.push(printEdge(edge, diagnostics, explicitEdges));
    }
  }

  return lines.join('\n');
}

export interface PrintOptions {
  /** Explicit draft-0.2.8 body trial until the saved header is settled. */
  edition?: '0.2.8-preview';
  /** Indentation string (default: 2 spaces) */
  indent?: string;
  /** Include comments with metadata */
  includeComments?: boolean;
}

/**
 * Print Graph-IR to Coral DSL text
 */
export function print(graph: GraphIR, options: PrintOptions = {}): string {
  const result = printWithDiagnostics(graph, options);
  const error = result.diagnostics.find((item) => item.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.text;
}

/** Temporary body printer for the settled 0.2.8 core; the saved header is still under author review. */
/** Canonical model-to-source spelling; ordinary source edits keep their CST bytes. */
function previewConnectorOperator028(edge: GraphEdge, notation?: string): string | undefined {
  const first = edge.sourceEnd?.marker;
  const second = edge.targetEnd?.marker;
  const stroke = edge.style?.lineStyle ?? 'solid';
  if (!first || !second) return undefined;
  if (first.kind === 'arrow' && first.fill === 'open' && stroke === 'solid') {
    if (second.kind === 'none' && second.fill === 'unspecified') return '<-';
    if (second.kind === 'arrow' && second.fill === 'open') return '<->';
  }
  if (first.kind !== 'none' || first.fill !== 'unspecified') return undefined;
  if (second.kind === 'none' && second.fill === 'unspecified') {
    return stroke === 'solid' ? '--' : stroke === 'dashed' ? '-.-' : undefined;
  }
  if (second.kind === 'arrow' && second.fill === 'open') {
    return stroke === 'solid' ? '->' : stroke === 'dashed' ? '-.->' : undefined;
  }
  if (stroke !== 'solid') return undefined;
  if (second.kind === 'arrow' && second.fill === 'filled') return '-#>';
  if (second.kind === 'triangle' && second.fill === 'open') return '--|>';
  if (second.kind === 'triangle' && second.fill === 'filled') {
    return notation === UML_SEQUENCE_NOTATION ? '-#>' : '--#|>';
  }
  if (second.kind === 'diamond' && second.fill === 'open') return '-<>';
  if (second.kind === 'diamond' && second.fill === 'filled') return '-#<>';
  if (second.kind === 'circle' && second.fill === 'open') return '--o';
  if (second.kind === 'circle' && second.fill === 'filled') return '--#o';
  if (second.kind === 'bar' && second.fill === 'unspecified') return '--|';
  if (second.kind === 'crow-foot' && second.fill === 'unspecified') return '--{';
  return undefined;
}

function printPreview028(graph: GraphIR, options: PrintOptions): PrintResult {
  const diagnostics: Diagnostic[] = [];
  const reject = (kind: 'graph' | 'node' | 'edge', id: string, field: string): void => {
    diagnostics.push(printDiagnostic({ severity: 'error', code: `coral.preview.${kind}.unsupported`,
      message: `${kind} "${id}" has ${field}, which the 0.2.8 preview printer cannot yet represent`,
      subject: { kind, id } }));
  };
  if (graph.version !== '3.0.0') reject('graph', graph.id, 'a non-GraphIR-3 version');
  const lines: string[] = [];
  if (graph.profile && !(
    graph.profile.id === 'uml' && graph.profile.version === '1.0.0' &&
    (graph.profile.kind === 'sequence' || graph.profile.kind === 'class')
  )) reject('graph', graph.id, 'an unsupported notation profile');
  const profileNotation = graph.profile?.id === 'uml' ? `uml-${graph.profile.kind}` : undefined;
  if (profileNotation && graph.metadata?.notation !== undefined && graph.metadata.notation !== profileNotation) {
    reject('graph', graph.id, 'a notation that contradicts the portable profile');
  }
  const metadata = profileNotation ? { ...graph.metadata, notation: profileNotation } : graph.metadata;
  const notation = metadata?.notation;
  if (graph.interaction?.fragments?.length || graph.interaction?.activations?.length || graph.interaction?.notes?.length) {
    reject('graph', graph.id, 'recursive or supplemental interaction statements');
  }
  if (notation === UML_SEQUENCE_NOTATION && graph.edges.some((edge) => edge.type === 'create')) {
    // GraphIR 3 does not say whether the receiver was authored or introduced by
    // creation. Printing its derived node could silently add a declaration.
    reject('graph', graph.id, 'creation-target declaration provenance');
  }
  for (const field of ['layoutOptions'] as const) {
    if (graph[field] !== undefined) reject('graph', graph.id, field);
  }
  // This explicit preview request still uses the old JSON carrier for graph
  // identity/profile. It must not become the undecided saved 0.2.8 header.
  lines.push(`@graph ${stableJson({ id: graph.id,
    ...(graph.name === undefined ? {} : { name: graph.name }),
    ...(metadata === undefined ? {} : { metadata }) })}`);
  lines.push('');
  const indent = options.indent ?? '  ';
  const printNode028 = (node: GraphNode, depth: number): void => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(node.id) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(node.type)) {
      reject('node', node.id, 'a non-bare ID or type');
      return;
    }
    const umlClass = notation === 'uml-class' && node.type === 'class'
      && node.classifier?.kind === 'class';
    for (const field of ['ports', 'position', 'pinned', 'dimensions',
      'layoutOptions', 'properties', 'labelPlacement', 'description'] as const) {
      if (node[field] !== undefined) reject('node', node.id, field);
    }
    if (node.symbol !== undefined && typeof node.symbol !== 'string') reject('node', node.id, 'a non-text symbol');
    if (node.variant !== undefined && typeof node.variant !== 'string') reject('node', node.id, 'a non-text variant');
    if (node.classifier && !umlClass) reject('node', node.id, 'an unsupported classifier');
    if (notation === 'uml-class' && node.type === 'class' && !umlClass) {
      reject('node', node.id, 'a class without its structured classifier');
    }
    const children = node.children ?? [];
    if (children.length && (node.type !== 'group' || umlClass)) reject('node', node.id, 'unsupported children');
    const label = node.label === undefined ? '' : ` as "${escapeString(node.label)}"`;
    const fields = [
      ...(node.symbol === undefined || umlClass && node.symbol === 'uml-class'
        ? [] : [`symbol: "${escapeString(node.symbol)}"`]),
      ...(node.variant === undefined ? [] : [`variant: "${escapeString(node.variant)}"`]),
    ];
    const bracket = fields.length ? ` [${fields.join(', ')}]` : '';
    const prefix = `${indent.repeat(depth)}${node.id} ${node.type}${bracket}${label}`;
    if (umlClass) {
      const classifier = node.classifier!;
      if (classifier.name !== (node.label ?? node.id) || classifier.modifiers?.length ||
          classifier.compartments[0]?.kind !== 'name' || classifier.compartments[0]?.id !== 'name' ||
          classifier.compartments.slice(1).some((part) => part.kind !== 'attributes')) {
        reject('node', node.id, 'classifier structure outside the preview class subset');
        return;
      }
      const compartments = classifier.compartments.slice(1);
      if (!compartments.length) { lines.push(prefix); return; }
      lines.push(`${prefix} {`);
      for (const part of compartments) {
        if (part.kind !== 'attributes') continue;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part.id)) {
          reject('node', node.id, 'a non-bare compartment ID');
          continue;
        }
        const heading = part.id === 'attributes' ? 'attributes' : `${part.id} = attributes`;
        lines.push(`${indent.repeat(depth + 1)}${heading} {`);
        part.items.forEach((member, index) => {
          if (member.kind !== 'attribute' || member.visibility !== 'public' ||
              !member.type || member.modifiers?.length ||
              !/^[A-Za-z_][A-Za-z0-9_]*$/.test(member.name) ||
              !/^[A-Za-z_][A-Za-z0-9_]*$/.test(member.type)) {
            reject('node', node.id, `unsupported member ${member.id}`);
            return;
          }
          const statement = member.id === `attribute_${index + 1}`
            ? `+ ${member.name}: ${member.type}`
            : `${member.id} = public attribute ${member.name}: ${member.type}`;
          if (member.id !== `attribute_${index + 1}` && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(member.id)) {
            reject('node', node.id, `non-bare member ID ${member.id}`);
            return;
          }
          lines.push(`${indent.repeat(depth + 2)}${statement}`);
        });
        lines.push(`${indent.repeat(depth + 1)}}`);
      }
      lines.push(`${indent.repeat(depth)}}`);
      return;
    }
    if (children.length) {
      lines.push(`${prefix} {`);
      children.forEach((child) => printNode028(child, depth + 1));
      lines.push(`${indent.repeat(depth)}}`);
    } else lines.push(prefix);
  };
  graph.nodes.forEach((node) => printNode028(node, 0));
  for (const constraint of graph.constraints ?? []) {
    if (constraint.kind !== 'arrangement' || !['row', 'column'].includes(constraint.axis) ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(constraint.id) ||
        constraint.subjects.some((subject) => subject.kind !== 'node' ||
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(subject.nodeId)) ||
        constraint.gap !== undefined || constraint.alignment !== undefined || constraint.direction !== undefined) {
      reject('graph', graph.id, `constraint ${constraint.id}`);
      continue;
    }
    lines.push(`${constraint.id} = arrange ${constraint.axis}: ${constraint.subjects.map((subject) => subject.nodeId).join(', ')}${constraint.strength === 'preferred' ? ' [preferred]' : ''}`);
  }
  if (graph.edges.length && (graph.nodes.length || graph.constraints?.length)) lines.push('');
  let implicitEdgeOrdinal = 0;
  for (const edge of graph.edges) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(edge.source) ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(edge.target) || !edge.id) {
      reject('edge', edge.id, 'a non-bare endpoint or empty ID');
      continue;
    }
    for (const field of ['routeIntent', 'labelPlacement',
      'description', 'properties'] as const) {
      if (edge[field] !== undefined) reject('edge', edge.id, field);
    }
    if ((edge.sourcePort !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(edge.sourcePort)) ||
        (edge.targetPort !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(edge.targetPort))) {
      reject('edge', edge.id, 'a non-bare semantic-port reference');
      continue;
    }
    if (edge.style && Object.keys(edge.style).some((field) => field !== 'lineStyle')) {
      reject('edge', edge.id, 'unsupported style');
    }
    const operator = previewConnectorOperator028(edge, notation);
    if (!operator || (edge.sourceEnd && Object.keys(edge.sourceEnd).some((field) => field !== 'marker')) ||
        (edge.targetEnd && Object.keys(edge.targetEnd).some((field) => field !== 'marker'))) {
      reject('edge', edge.id, 'an unprintable connector end or line style');
      continue;
    }
    if (edge.type !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(edge.type)) {
      reject('edge', edge.id, 'a non-bare relation type');
      continue;
    }
    // In UML sequence, these three operators already state the message kind.
    // Keep an explicit bracket only when it carries additional meaning (or a
    // conflict that the conformance checker needs to see).
    const inferredSequenceType = notation === UML_SEQUENCE_NOTATION
      ? operator === '-#>' ? 'sync' : operator === '->' ? 'async'
        : operator === '-.->' ? 'return' : undefined
      : undefined;
    const type = edge.type === undefined || edge.type === inferredSequenceType
      ? '' : ` [${edge.type}]`;
    const label = edge.label === undefined ? '' : ` as "${escapeString(edge.label)}"`;
    // Candidate source gives unnamed edges stable edge-N identities in their
    // own declaration order; a named edge does not consume that sequence.
    const implicit = edge.id === `edge-${implicitEdgeOrdinal + 1}`;
    if (implicit) implicitEdgeOrdinal++;
    const prefix = implicit ? '' : `${quoteIfNeeded(edge.id)} = `;
    const first = `${edge.source}${edge.sourcePort === undefined ? '' : `:${edge.sourcePort}`}`;
    const second = `${edge.target}${edge.targetPort === undefined ? '' : `:${edge.targetPort}`}`;
    lines.push(`${prefix}${first} ${operator} ${second}${type}${label}`);
  }
  return { text: diagnostics.some((item) => item.severity === 'error') ? '' : lines.join('\n'), diagnostics };
}

/** The label text the printer will actually emit for a node. */
function emittedLabel(node: GraphNode): string {
  return node.label ?? 'node';
}

/** Every node, in declaration order, children included. */
function inDeclarationOrder(nodes: GraphNode[]): GraphNode[] {
  const out: GraphNode[] = [];
  const walk = (list: GraphNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Give every node a unique, non-empty id before the replay runs, rewriting the
 * edges that referenced a substituted id (R-010 AC-2, AC-3).
 *
 * Returns the original graph untouched when nothing needed changing, so the
 * common path allocates nothing.
 */
function normaliseIds(graph: GraphIR, out: DiagnosticSink): GraphIR {
  const seen = new Set<string>();
  const substitutions = new Map<string, string>();
  const pool = new IdAllocator();

  // Seed with every id that is already unique and usable, so the pre-pass does
  // not hand a later node an id an untouched node is holding.
  for (const node of inDeclarationOrder(graph.nodes)) {
    if (node.id !== '' && !seen.has(node.id)) {
      seen.add(node.id);
      pool.reserve(node.id);
    }
  }

  const taken = new Set<string>();
  const rewrite = new Map<GraphNode, string>();
  for (const node of inDeclarationOrder(graph.nodes)) {
    if (node.id !== '' && !taken.has(node.id)) {
      taken.add(node.id);
      continue;
    }
    const replacement = pool.allocateFromLabel(emittedLabel(node));
    rewrite.set(node, replacement);
    taken.add(replacement);
    // Only an empty id is orphaned. A duplicate id is still held by the
    // earlier node, which keeps it, so edges must continue to resolve there
    // (R-010 AC-3) and must not be rewritten to the renamed occurrence.
    if (node.id === '' && !substitutions.has('')) substitutions.set('', replacement);
    out.push(
      printDiagnostic({
        severity: 'warning',
        code: 'coral.node.id.degraded',
        message:
          node.id === ''
            ? `A node had an empty id, which Coral cannot express; it was given "${replacement}"`
            : `Node id "${node.id}" was used more than once; one occurrence was given "${replacement}"`,
        subject: { kind: 'node', id: replacement },
      })
    );
  }

  // Edges get the same treatment: an empty or duplicate edge id has no Coral
  // spelling, because the parser rejects it (R-063 AC-5).
  const edgePool = new IdAllocator();
  const seenEdges = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.id !== '' && !seenEdges.has(edge.id)) {
      seenEdges.add(edge.id);
      edgePool.reserve(edge.id);
    }
  }
  const takenEdges = new Set<string>();
  const edgeRewrite = new Map<GraphEdge, string>();
  for (const edge of graph.edges) {
    if (edge.id !== '' && !takenEdges.has(edge.id)) {
      takenEdges.add(edge.id);
      continue;
    }
    const replacement = allocateEdgeId(
      substitutions.get(edge.source) ?? edge.source, substitutions.get(edge.target) ?? edge.target, edgePool,
    );
    edgeRewrite.set(edge, replacement);
    takenEdges.add(replacement);
    out.push(printDiagnostic({
      severity: 'warning',
      code: 'coral.edge.id.degraded',
      message: edge.id === ''
        ? `An edge had an empty id, which Coral cannot express; it was given "${replacement}"`
        : `Edge id "${edge.id}" was used more than once; one occurrence was given "${replacement}"`,
      subject: { kind: 'edge', id: replacement },
    }));
  }

  if (rewrite.size === 0 && edgeRewrite.size === 0) return graph;

  const cloneNode = (node: GraphNode): GraphNode => ({
    ...node,
    id: rewrite.get(node) ?? node.id,
    ...(node.children ? { children: node.children.map(cloneNode) } : {}),
  });

  return {
    ...graph,
    nodes: graph.nodes.map(cloneNode),
    edges: graph.edges.map((edge) => ({
      ...edge,
      id: edgeRewrite.get(edge) ?? edge.id,
      source: substitutions.get(edge.source) ?? edge.source,
      target: substitutions.get(edge.target) ?? edge.target,
    })),
  };
}

function reportConstraintLoss(
  graphId: string, constraintId: unknown, parameter: ConstraintParameter | undefined, out: DiagnosticSink,
): void {
  out.push(printDiagnostic({
    severity: 'warning',
    code: parameter === undefined ? 'coral.graph.constraint.dropped' : `coral.graph.constraint.${parameter}.dropped`,
    message: parameter === undefined
      ? `Constraint "${String(constraintId)}" has an empty or duplicate id or invalid subjects and is not emitted`
      : `Constraint "${String(constraintId)}" carries an invalid or inapplicable ${parameter}, which is not emitted`,
    subject: { kind: 'graph', id: graphId },
  }));
}

/**
 * The constraints the printer can spell: a later constraint with an empty or
 * duplicate id, or an arrangement without two distinct subjects, is omitted;
 * an invalid or inapplicable parameter is omitted from a copy (R-063 AC-5).
 */
function validConstraints(graph: GraphIR, out: DiagnosticSink): SpatialConstraint[] {
  const ids = new Set<string>();
  const valid: SpatialConstraint[] = [];
  for (const constraint of graph.constraints ?? []) {
    const subjects = constraint.kind === 'arrangement' ? constraint.subjects.map(({ nodeId }) => nodeId) : [];
    if (typeof constraint.id !== 'string' || constraint.id === '' || ids.has(constraint.id) ||
        (constraint.kind === 'arrangement' && (subjects.length < 2 || new Set(subjects).size !== subjects.length))) {
      reportConstraintLoss(graph.id, constraint.id, undefined, out);
      continue;
    }
    ids.add(constraint.id);
    const bag = constraint as unknown as Record<string, unknown>;
    let copy: Record<string, unknown> | undefined;
    for (const parameter of ['gap', 'inset', 'alignment', 'direction'] as const) {
      if (bag[parameter] === undefined || isConstraintParameter(constraint.kind, parameter, bag[parameter])) continue;
      copy ??= { ...bag };
      delete copy[parameter];
      reportConstraintLoss(graph.id, constraint.id, parameter, out);
    }
    valid.push((copy ?? constraint) as unknown as SpatialConstraint);
  }
  return valid;
}

/**
 * Decide which nodes need an explicit `as` clause.
 *
 * One forward pass in declaration order, applying each decision immediately: a
 * node whose allocated id matches keeps it, otherwise the speculative id is
 * released so a later node may still receive it, and `node.id` is reserved.
 * Deciding every node before applying any of them over-annotates, because
 * marking one node explicit changes what a later node is allocated.
 */
function markExplicitIds(graph: GraphIR): ReadonlySet<string> {
  const allocator = new IdAllocator();
  const explicit = new Set<string>();

  for (const node of inDeclarationOrder(graph.nodes)) {
    if (node.label === undefined) {
      allocator.reserve(node.id);
      explicit.add(node.id);
      continue;
    }
    const allocated = allocator.allocateFromLabel(emittedLabel(node));
    if (allocated === node.id) continue;
    allocator.release(allocated);
    allocator.reserve(node.id);
    explicit.add(node.id);
  }

  return explicit;
}

function markExplicitEdgeIds(graph: GraphIR): ReadonlySet<string> {
  const allocator = new IdAllocator();
  const explicit = new Set<string>();
  for (const edge of graph.edges) {
    const allocated = allocateEdgeId(edge.source, edge.target, allocator);
    if (allocated === edge.id) continue;
    allocator.release(allocated);
    allocator.reserve(edge.id);
    explicit.add(edge.id);
  }
  return explicit;
}

function projectConstraints(
  constraints: readonly SpatialConstraint[],
  nodes: readonly GraphNode[],
): {
  inlineByNode: ReadonlyMap<string, string>;
  lines: string[];
} {
  const inlineByNode = new Map<string, string>();
  const lines: string[] = [];
  const declarationIndex = new Map(inDeclarationOrder([...nodes]).map((node, index) => [node.id, index]));
  const inline = new Set<number>();
  let previousInlineDeclaration = -1;

  // Inline constraints are parsed while their subject nodes are declared,
  // before all top-level constraint lines. They are therefore safe only as
  // an initial array prefix, in node declaration order, with the exact id the
  // parser will derive at that ordinal.
  for (let index = 0; index < constraints.length; index++) {
    const constraint = constraints[index];
    const simple = constraint.strength === 'preferred' && isDefaultConstraint(constraint);
    if (!simple || constraint.kind === 'arrangement' ||
        constraint.id !== derivedConstraintId(constraint, index + 1) ||
        inlineByNode.has(constraint.subject.nodeId)) break;
    const nodeIndex = declarationIndex.get(constraint.subject.nodeId);
    if (nodeIndex === undefined || nodeIndex <= previousInlineDeclaration) break;
    inline.add(index);
    inlineByNode.set(constraint.subject.nodeId, ` ${inlineConstraintExpression(constraint)}`);
    previousInlineDeclaration = nodeIndex;
  }

  for (let index = 0; index < constraints.length; index++) {
    const constraint = constraints[index];
    if (inline.has(index)) continue;
    // Preferred relative/boundary expressions have no standalone concise
    // grammar; they are concise only when attached to a node declaration.
    const safelyDerived = constraint.id === derivedConstraintId(constraint, index + 1) &&
      (constraint.strength === 'required' || constraint.kind === 'arrangement');
    if (safelyDerived) {
      const prefix = constraint.strength === 'preferred' ? '' : 'require ';
      const parameters = conciseConstraintParameters(constraint);
      lines.push(`${prefix}${constraintExpression(constraint)}` +
        (parameters.length > 0 ? ` [${parameters.join(', ')}]` : ''));
      continue;
    }
    const parameters = constraintParameters(constraint);
    lines.push(`constraint ${quoteIfNeeded(constraint.id)}: ${constraintExpression(constraint)}` +
      (parameters.length > 0 ? ` [${parameters.join(', ')}]` : ''));
  }
  return { inlineByNode, lines };
}

function derivedConstraintId(constraint: SpatialConstraint, ordinal: number): string {
  return `coral.constraint.${constraint.kind}.${ordinal}`;
}

function conciseConstraintParameters(constraint: SpatialConstraint): string[] {
  return constraintParameters(constraint).filter((parameter) => parameter !== 'preferred');
}

function inlineConstraintExpression(
  constraint: Exclude<SpatialConstraint, { kind: 'arrangement' }>,
): string {
  if (constraint.kind === 'relative') {
    return `${constraint.relation.replace('-', ' ')} ${quoteIfNeeded(constraint.target.nodeId)}`;
  }
  return `at the ${constraint.side}` +
    (constraint.scope.kind === 'node' ? ` of ${quoteIfNeeded(constraint.scope.nodeId)}` : '');
}

function isDefaultConstraint(constraint: SpatialConstraint): boolean {
  if (constraint.kind === 'relative') {
    return (constraint.gap ?? 0) === 0 && (constraint.alignment ?? 'center') === 'center';
  }
  if (constraint.kind === 'boundary') return (constraint.inset ?? 0) === 0;
  return (constraint.gap ?? 0) === 0 && (constraint.alignment ?? 'center') === 'center' &&
    (constraint.direction ?? 'forward') === 'forward';
}

function constraintExpression(constraint: SpatialConstraint): string {
  if (constraint.kind === 'relative') {
    return `${quoteIfNeeded(constraint.subject.nodeId)} ${constraint.relation.replace('-', ' ')} ` +
      quoteIfNeeded(constraint.target.nodeId);
  }
  if (constraint.kind === 'boundary') {
    return `${quoteIfNeeded(constraint.subject.nodeId)} at the ${constraint.side}` +
      (constraint.scope.kind === 'node' ? ` of ${quoteIfNeeded(constraint.scope.nodeId)}` : '');
  }
  return `arrange ${constraint.subjects.map((subject) => quoteIfNeeded(subject.nodeId)).join(', ')} ` +
    `as ${constraint.axis}`;
}

function constraintParameters(constraint: SpatialConstraint): string[] {
  const parts: string[] = [];
  if (constraint.strength === 'preferred') parts.push('preferred');
  if (constraint.kind === 'relative' || constraint.kind === 'arrangement') {
    const gap = formatCoord(constraint.gap);
    if (gap !== undefined && constraint.gap !== 0) parts.push(`gap: ${gap}`);
    if (constraint.alignment !== undefined && constraint.alignment !== 'center') {
      parts.push(`alignment: ${constraint.alignment}`);
    }
  }
  const inset = constraint.kind === 'boundary' ? formatCoord(constraint.inset) : undefined;
  if (constraint.kind === 'boundary' && inset !== undefined && constraint.inset !== 0) {
    parts.push(`inset: ${inset}`);
  }
  if (constraint.kind === 'arrangement' && constraint.direction !== undefined && constraint.direction !== 'forward') {
    parts.push(`direction: ${constraint.direction}`);
  }
  return parts;
}

/**
 * Print a single node and its children
 */
function printNode(
  node: GraphNode,
  lines: string[],
  depth: number,
  indent: string,
  out: DiagnosticSink,
  explicit: ReadonlySet<string>,
  parentId: string | undefined,
  inlineConstraints: ReadonlyMap<string, string>,
  umlProfile: boolean,
): void {
  const properties = propertyEntries('node', node.id, node.properties, out);
  reportNodeFieldLoss(node, parentId, properties, out);
  const prefix = indent.repeat(depth);
  // Coral has no empty type; the node prints as a service (R-063 AC-5).
  let type = node.type;
  if (type === '') {
    type = 'service';
    out.push(printDiagnostic({
      severity: 'warning',
      code: 'coral.node.type.degraded',
      message: `Node "${node.id}" has an empty type, which Coral cannot express; it was printed as service`,
      subject: { kind: 'node', id: node.id },
    }));
  }
  const nodeType = /^[A-Za-z_][\w-]*$/.test(type) ? type : `"${escapeString(type)}"`;
  const authoredClassifier = umlProfile ? node.classifier : undefined;
  const classifier = authoredClassifier && isPrintableUmlClassifier(authoredClassifier, node.type, node.label)
    ? authoredClassifier : undefined;
  if (node.classifier && !umlProfile) reportFieldLoss('node', node.id, 'classifier', out);
  if (authoredClassifier && !classifier) reportBlockingClassifier(node, out);
  if (!authoredClassifier && umlProfile && ['class', 'interface', 'enum'].includes(node.type)) {
    reportBlockingClassifier(node, out);
  }
  const umlClassifierNode = umlProfile && ['class', 'interface', 'enum'].includes(type);
  const emittedNodeLabel = umlClassifierNode ? node.label ?? authoredClassifier?.name ?? node.id : node.label;
  const label = emittedNodeLabel === undefined ? '' : ` "${escapeString(emittedNodeLabel)}"`;
  const idClause = explicit.has(node.id) ? ` as ${quoteIfNeeded(node.id)}` : '';
  let classifierModifiers = '';
  if (classifier?.modifiers?.length) {
    classifierModifiers = ` modifiers {${classifier.modifiers.join(', ')}}`;
  }
  let labelPlacement = '';
  if (node.labelPlacement !== undefined) {
    if (isNodeLabelPlacement(node.labelPlacement)) {
      const offset = formatCoord(node.labelPlacement.offset);
      labelPlacement = ` label ${node.labelPlacement.side}${offset !== undefined ? ` offset ${offset}` : ''}`;
    } else reportFieldLoss('node', node.id, 'labelPlacement', out);
  }
  const spatial = inlineConstraints.get(node.id) ?? '';
  const point = node.position === undefined ? undefined : formatPoint(node.position);
  if (node.position !== undefined && point === undefined) reportFieldLoss('node', node.id, 'position', out);
  const geometry = point !== undefined ? ` @ ${point}` : '';
  // Pinned requires an authored position, so it prints only beside one.
  if (node.pinned && point === undefined) reportFieldLoss('node', node.id, 'pinned', out);
  const pinned = node.pinned && point !== undefined ? ' pinned' : '';
  const data: Record<string, unknown> = {};
  const isText = (value: unknown) => typeof value === 'string';
  const nodeDataValid = {
    description: isText, dimensions: isDimensions, layoutOptions: isNodeLayoutOptions,
    ports: isPorts, symbol: isText, variant: isText,
  };
  for (const field of ['description', 'dimensions', 'layoutOptions', 'ports', 'symbol', 'variant'] as const) {
    const value = node[field];
    if (value === undefined) continue;
    if (field === 'symbol' && umlClassifierNode) {
      if (value !== umlSymbolForKind(type as 'class' | 'interface' | 'enum')) reportFieldLoss('node', node.id, 'symbol', out);
      continue;
    }
    if (isJsonSafe(value) && nodeDataValid[field](value)) data[field] = value;
    else reportFieldLoss('node', node.id, field, out);
  }
  const dataClause = Object.keys(data).length > 0 ? ` data ${stableJson(data)}` : '';

  // Check if node has body content (children or printable properties)
  const hasChildren = node.children && node.children.length > 0;
  const hasProperties = properties.some(
    ([key, value]) => !key.startsWith('_') && isJsonSafe(value)
  );
  const classifierParts = classifier?.compartments.filter((part) => part.kind !== 'name') ?? [];
  const minimalEnumBody = !classifier && umlClassifierNode && type === 'enum';
  const hasClassifierBody = classifierParts.length > 0 || minimalEnumBody;
  const hasBody = hasChildren || hasProperties || hasClassifierBody;

  if (hasBody) {
    lines.push(`${prefix}${nodeType}${label}${idClause}${classifierModifiers}${labelPlacement}${spatial}${geometry}${pinned}${dataClause} {`);

    // Print properties first
    if (hasProperties) {
      for (const [key, value] of [...properties].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        // Skip internal properties
        if (key.startsWith('_')) continue;
        if (!isJsonSafe(value)) continue;
        lines.push(`${prefix}${indent}${quoteIfNeeded(key)}: ${printValue(value)}`);
      }
    }

    if (hasClassifierBody) {
      if (minimalEnumBody) {
        lines.push(`${prefix}${indent}literals {`);
        lines.push(`${prefix}${indent}}`);
      }
      for (const part of classifierParts) {
        if (!('items' in part)) continue;
        const defaultId = part.kind;
        const id = part.id === defaultId ? '' : ` as ${quoteIfNeeded(part.id)}`;
        lines.push(`${prefix}${indent}${part.kind}${id} {`);
        part.items.forEach((member, index) => {
          lines.push(`${prefix}${indent}${indent}${formatUmlMember(member, `${member.kind}-${index + 1}`)}`);
        });
        lines.push(`${prefix}${indent}}`);
      }
    }

    // Print children
    if (hasChildren) {
      for (const child of node.children!) {
        printNode(child, lines, depth + 1, indent, out, explicit, node.id, inlineConstraints, umlProfile);
      }
    }

    lines.push(`${prefix}}`);
  } else {
    lines.push(`${prefix}${nodeType}${label}${idClause}${classifierModifiers}${labelPlacement}${spatial}${geometry}${pinned}${dataClause}`);
  }
}

/**
 * Print a single edge
 */
function printEdge(edge: GraphEdge, out: DiagnosticSink, explicit: ReadonlySet<string>): string {
  const properties = propertyEntries('edge', edge.id, edge.properties, out);
  reportEdgeFieldLoss(edge, properties, out);
  const ends = Object.fromEntries((['sourceEnd', 'targetEnd'] as const).map(field => {
    const validation = edge[field] === undefined ? undefined : validateRelationshipEnd(edge[field], field);
    return [field, validation?.valid ? formatCompactEnd(validation.value) : undefined];
  }));
  const parts = [`${quoteIfNeeded(edge.source)}${ends.sourceEnd ? ` ${ends.sourceEnd}` : ''} -> ${quoteIfNeeded(edge.target)}${ends.targetEnd ? ` ${ends.targetEnd}` : ''}`];
  if (explicit.has(edge.id)) parts.push(`as ${quoteIfNeeded(edge.id)}`);

  // Build attributes
  const attrs: string[] = [];

  if (edge.type) {
    // A bare leading token that spells a line style would be misread as one,
    // so it is quoted; a quoted leading token is always the relation type.
    const ambiguous = ['solid', 'dashed', 'dotted'].includes(edge.type);
    attrs.push(ambiguous || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(edge.type)
      ? `"${escapeString(edge.type)}"`
      : edge.type);
  }

  // `solid` is emitted like any other style so it survives the round-trip.
  if (edge.style?.lineStyle !== undefined) {
    if (isOneOf(LINE_STYLES, edge.style.lineStyle)) attrs.push(edge.style.lineStyle);
    else reportFieldLoss('edge', edge.id, 'style.lineStyle', out);
  }

  for (const field of ['label', 'description'] as const) {
    const value = edge[field];
    if (value === undefined) continue;
    if (typeof value === 'string') attrs.push(`${field}: "${escapeString(value)}"`);
    else reportFieldLoss('edge', edge.id, field, out);
  }

  // Add other properties as attributes (sorted for deterministic output)
  if (properties.length > 0) {
    for (const [key, value] of [...properties].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (key === 'label' || key === 'description') continue; // Same-named properties use edge data.
      // Reserved for internal use; omitted on both sides (R-009 AC-7).
      if (key.startsWith('_')) continue;
      if (!isPrintableScalar(value)) continue;
      attrs.push(`${quoteIfNeeded(key)}: ${printValue(value)}`);
    }
  }

  if (attrs.length > 0) {
    parts.push(`[${attrs.join(', ')}]`);
  }

  const data: Record<string, unknown> = {};
  for (const field of ['sourcePort', 'targetPort'] as const) {
    const value = edge[field];
    if (value === undefined) continue;
    if (typeof value === 'string') data[field] = value;
    else reportFieldLoss('edge', edge.id, field, out);
  }
  // `data.style` has one key, `routing`; the line style prints as a bracket
  // token. Any other style key, a stray legacy arrow included, has no Coral
  // spelling and is reported as loss (R-063 AC-5).
  if (edge.style !== undefined) {
    if (!isJsonSafe(edge.style)) {
      reportFieldLoss('edge', edge.id, 'style', out);
    } else {
      for (const key of Object.keys(edge.style)) {
        if (key !== 'lineStyle' && key !== 'routing') reportFieldLoss('edge', edge.id, `style.${key}`, out);
      }
      if (edge.style.routing !== undefined) {
        if (isOneOf(ROUTINGS, edge.style.routing)) data.style = { routing: edge.style.routing };
        else reportFieldLoss('edge', edge.id, 'style.routing', out);
      }
    }
  }
  // Data-only ends are emitted whole; compact ends were emitted at the reference.
  for (const field of ['sourceEnd', 'targetEnd'] as const) {
    const value = edge[field];
    if (value === undefined) continue;
    const validated = validateRelationshipEnd(value, field);
    if (validated.valid && !ends[field]) data[field] = validated.value;
  }
  const complexProperties = Object.fromEntries(properties.filter(
    ([key, value]) => !key.startsWith('_') && isJsonSafe(value) &&
      (key === 'label' || key === 'description' || !isPrintableScalar(value))
  ));
  if (Object.keys(complexProperties).length > 0) data.properties = complexProperties;
  if (Object.keys(data).length > 0) parts.push(`data ${stableJson(data)}`);

  if (edge.labelPlacement !== undefined && !isEdgeLabelPlacement(edge.labelPlacement)) {
    reportFieldLoss('edge', edge.id, 'labelPlacement', out);
  } else if (edge.labelPlacement) {
    const placement = [`label ${edge.labelPlacement.side}`];
    const at = formatCoord(edge.labelPlacement.at);
    const offset = formatCoord(edge.labelPlacement.offset);
    if (at !== undefined) placement.push(`at ${at}`);
    if (offset !== undefined) placement.push(`offset ${offset}`);
    const dataIndex = parts.findIndex((part) => part.startsWith('data '));
    if (dataIndex < 0) parts.push(placement.join(' '));
    else parts.splice(dataIndex, 0, placement.join(' '));
  }

  const route = printRouteIntent(edge, out);
  if (route !== undefined) parts.push(`via ${route}`);

  return parts.join(' ');
}

/**
 * Print the valid waypoints: an empty or repeated id, or a non-finite
 * coordinate, has no Coral spelling, so that waypoint is omitted with loss.
 */
function printRouteIntent(edge: GraphEdge, out: DiagnosticSink): string | undefined {
  const seen = new Set<string>();
  const waypoints: Array<{ id: string; point: string; text: string; simple: boolean }> = [];
  for (const waypoint of edge.routeIntent?.waypoints ?? []) {
    const placement = waypoint.placement;
    const point = placement.kind === 'absolute' ? formatPoint(placement.position) : formatPoint(placement.offset);
    if (!isWaypointId(waypoint.id, seen) || point === undefined) {
      out.push(printDiagnostic({
        severity: 'warning',
        code: 'coral.edge.waypoint.dropped',
        message: `Edge "${edge.id}" carries waypoint "${String(waypoint.id)}" with an empty or repeated id or a non-finite coordinate; it is not emitted`,
        subject: { kind: 'edge', id: edge.id },
      }));
      continue;
    }
    seen.add(waypoint.id);
    waypoints.push({
      id: waypoint.id,
      point,
      simple: placement.kind === 'absolute',
      text: placement.kind === 'absolute'
        ? `waypoint ${quoteIfNeeded(waypoint.id)} at ${point}`
        : `waypoint ${quoteIfNeeded(waypoint.id)} relative to ${printRouteAnchor(placement.anchor)} offset ${point}`,
    });
  }
  if (waypoints.length === 0) return undefined;
  const simple = waypoints.every((waypoint, index) =>
    waypoint.simple && waypoint.id === `coral.waypoint.${edge.id}.${index + 1}`);
  if (simple) return waypoints.map(({ point }) => point).join(' ');
  return waypoints.map(({ text }) => text).join(', ');
}

function printRouteAnchor(anchor: RouteAnchor): string {
  if (anchor.kind === 'source' || anchor.kind === 'target') return anchor.kind;
  if (anchor.kind === 'node') {
    return anchor.nodeId === 'source' || anchor.nodeId === 'target'
      ? `"${escapeString(anchor.nodeId)}"`
      : quoteIfNeeded(anchor.nodeId);
  }
  return `port ${quoteIfNeeded(anchor.nodeId)}.${quoteIfNeeded(anchor.portId)}`;
}


/**
 * Format options for pretty printing
 */
export interface FormatOptions extends PrintOptions {
  /** Sort nodes by type */
  sortByType?: boolean;
  /** Group nodes by parent */
  groupByParent?: boolean;
}

/**
 * Pretty print with additional formatting options
 */
export function prettyPrint(graph: GraphIR, options: FormatOptions = {}): string {
  const { sortByType = false, ...printOptions } = options;

  let nodes = [...graph.nodes];

  if (sortByType) {
    const typeOrder = ['actor', 'service', 'module', 'database', 'external_api', 'group'];
    nodes.sort((a, b) => {
      const aIndex = typeOrder.indexOf(a.type || 'service');
      const bIndex = typeOrder.indexOf(b.type || 'service');
      return aIndex - bIndex;
    });
  }

  return print({ ...graph, nodes }, printOptions);
}

interface SequenceFragmentPlan {
  /** The fragment and operand index that owns each message. */
  owner: Map<string, { fragment: InteractionFragment; operand: number }>;
  /** Derived identity at each fragment's printed position. */
  derivedId: Map<InteractionFragment, string>;
}

/** Nodes and edges in participant and message order (F10). */
function orderSequenceGraph(graph: GraphIR): GraphIR {
  const interaction = graph.interaction!;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  return {
    ...graph,
    interaction: sortCanonicalInteraction(interaction),
    nodes: interaction.participantOrder.map((id) => nodes.get(id)!),
    edges: interaction.messageOrder.map((id) => edges.get(id)!),
  };
}

function planSequenceFragments(graph: GraphIR): SequenceFragmentPlan {
  const owner: SequenceFragmentPlan['owner'] = new Map();
  const position = new Map(graph.interaction!.messageOrder.map((id, index) => [id, index]));
  for (const fragment of graph.interaction!.fragments ?? []) {
    fragment.operands.forEach((operand, index) => {
      for (const id of operand.messageIds) owner.set(id, { fragment, operand: index });
    });
  }
  const first = (fragment: InteractionFragment) =>
    Math.min(...fragment.operands.flatMap((operand) => operand.messageIds.map((id) => position.get(id)!)));
  const derivedId = new Map([...(graph.interaction!.fragments ?? [])]
    .sort((a, b) => first(a) - first(b))
    .map((fragment, index) => [fragment, `fragment-${index + 1}`] as const));
  return { owner, derivedId };
}

function guardText(operand: InteractionFragment['operands'][number]): string {
  return operand.guard ? ` "${escapeString(operand.guard.text)}"` : '';
}

/** Messages in order, with each flat fragment's range wrapped in its block. */
function printSequenceMessages(
  graph: GraphIR,
  plan: SequenceFragmentPlan,
  printMessage: (edge: GraphEdge) => string,
  indent: string,
): string[] {
  const lines: string[] = [];
  let open: { fragment: InteractionFragment; operand: number } | undefined;
  const advance = (to: number) => {
    while (open && open.operand < to) {
      open.operand++;
      lines.push(`} else${guardText(open.fragment.operands[open.operand])} {`);
    }
  };
  const close = () => {
    if (!open) return;
    advance(open.fragment.operands.length - 1);
    lines.push('}');
    open = undefined;
  };
  for (const edge of graph.edges) {
    const owned = plan.owner.get(edge.id);
    if (open && owned?.fragment !== open.fragment) close();
    if (owned && !open) {
      const fragment = owned.fragment;
      const id = fragment.id === plan.derivedId.get(fragment) ? '' : ` as ${quoteIfNeeded(fragment.id)}`;
      lines.push(`${fragment.kind}${guardText(fragment.operands[0])}${id} {`);
      open = { fragment, operand: 0 };
    }
    if (owned) advance(owned.operand);
    lines.push(owned ? `${indent}${printMessage(edge)}` : printMessage(edge));
  }
  close();
  return lines;
}

function printSequenceStatements(interaction: NonNullable<GraphIR['interaction']>): string[] {
  const id = (value: string, derived: string) => (value === derived ? '' : ` as ${quoteIfNeeded(value)}`);
  return [
    ...(interaction.activations ?? []).map((activation, index) =>
      `activation ${quoteIfNeeded(activation.participantId)} from ${quoteIfNeeded(activation.startMessageId)} `
      + `to ${quoteIfNeeded(activation.endMessageId)}${id(activation.id, `activation-${index + 1}`)}`),
    ...(interaction.notes ?? []).map((note, index) =>
      `note "${escapeString(note.text)}" on ${[...(note.participantIds ?? []), ...(note.messageIds ?? [])]
        .map(quoteIfNeeded).join(', ')}${id(note.id, `note-${index + 1}`)}`),
  ];
}
