/** Canonical writer for the executable successor spatial source subset. */
import { editionAdmitsUserSymbols029, type Diagnostic } from '@coral-viz/language';
import type {
  SpatialConstraintSuccessor,
  SpatialRectangleReferenceSuccessor,
} from '@graph-ir/core';
import {
  projectInstalledSourceToSuccessor028,
  type SuccessorGraphIr029,
  type SuccessorSourceGraph028,
  type SuccessorSourceNode028,
} from './successorSourceProjection028.js';
import { successorCatalogSnapshot028, successorCoreValidationInput029 } from './successorInterpretation028.js';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { graphIrArtworkAdmission029, portAnchorSpelling029,
  userSymbolFromDocumentSymbol029 } from './graphIrDocumentSymbols029.js';
export interface SuccessorSourceWriteOptions028 {
  /** The document's effective edition; defaults to the oldest edition that can carry the graph. */
  coralVersion?: string;
}
export interface SuccessorSourceWrite028 {
  text?: string;
  diagnostics: Diagnostic[];
}
const quote = (value: string) => JSON.stringify(value);
const ref = (reference: SpatialRectangleReferenceSuccessor): string =>
  reference.kind === 'node'
    ? `node ${reference.nodeId}`
    : reference.kind === 'edge'
      ? `edge ${reference.edgeId}`
      : reference.kind === 'node-label'
        ? `label node ${reference.nodeId}`
        : `label edge ${reference.edgeId}`;
function parameters(constraint: SpatialConstraintSuccessor): string {
  const parts: string[] = [];
  if (constraint.strength === 'preferred') parts.push('preferred');
  if (constraint.kind === 'boundary') {
    if (constraint.inset) parts.push(`inset: ${constraint.inset}`);
  } else {
    if (constraint.gap) parts.push(`gap: ${constraint.gap}`);
    if (constraint.alignment && constraint.alignment !== 'center')
      parts.push(`alignment: ${constraint.alignment}`);
    if (constraint.kind === 'arrangement' && constraint.direction === 'reverse')
      parts.push('direction: reverse');
  }
  return parts.length ? ` [${parts.join(', ')}]` : '';
}
function constraintLine(
  constraint: SpatialConstraintSuccessor,
  id: string,
): string {
  if (constraint.kind === 'arrangement')
    return `${id} = arrange ${constraint.axis}: ${constraint.subjects.every((r) => r.kind === 'node') ? constraint.subjects.map((r) => r.nodeId).join(', ') : constraint.subjects.map(ref).join(', ')}${parameters(constraint)}`;
  if (constraint.kind === 'relative')
    return `constraint ${id}: ${ref(constraint.subject)} ${constraint.relation.replace('-', ' ')} ${ref(constraint.target)}${parameters(constraint)}`;
  return `constraint ${id}: ${ref(constraint.subject)} at the ${constraint.side} of ${constraint.scope.kind === 'graph' ? 'diagram' : `group ${constraint.scope.nodeId}`}${parameters(constraint)}`;
}
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
const semanticCanonical = (graph: SuccessorSourceGraph028): string =>
  canonical({
    ...graph,
    ...(graph.constraints
      ? {
          constraints: graph.constraints.map((constraint) => {
            const normalized = { ...constraint };
            if (normalized.strength === 'required') delete normalized.strength;
            if (normalized.kind === 'boundary') {
              if (normalized.inset === 0) delete normalized.inset;
            } else {
              if (normalized.gap === 0) delete normalized.gap;
              if (normalized.alignment === 'center')
                delete normalized.alignment;
              if (
                normalized.kind === 'arrangement' &&
                normalized.direction === 'forward'
              )
                delete normalized.direction;
            }
            return normalized;
          }),
        }
      : {}),
  });
function usesEdition029(graph: SuccessorSourceGraph028): boolean {
  const visit = (nodes: readonly SuccessorSourceNode028[]): boolean => nodes.some((node) =>
    node.semanticPorts?.some((port) => port.label !== undefined || port.maxConnections !== undefined) ||
    visit(node.children ?? []));
  return Boolean(graph.userSymbols029?.length) || visit(graph.nodes);
}
const IMPORT_CODES_029: Readonly<Record<string, string>> = {
  DOCUMENT_SYMBOL_DIGEST_MISMATCH: 'import.graphir.local-symbol.digest-mismatch',
  ARTWORK_PROFILE_UNSUPPORTED: 'import.graphir.artwork.profile-unsupported',
  ARTWORK_ADMISSION_FAILED: 'import.graphir.artwork.rejected',
  ARTWORK_NONCANONICAL: 'import.graphir.artwork.noncanonical',
};
/** GraphIR 4 import of a document catalog: core validates the graph as given,
 * with Coral's admission and bundled limits, and every finding is located by
 * its GraphIR path; then the definitions take their source form. */
function importDocumentCatalog029(graph: SuccessorGraphIr029): { graph?: SuccessorSourceGraph028; diagnostics: Diagnostic[] } {
  const { documentCatalog = [], ...rest } = graph;
  const symbols = documentCatalog.map(userSymbolFromDocumentSymbol029);
  const diagnostics: Diagnostic[] = symbols.flatMap((symbol, index) => symbol ? [] : [{ severity: 'error' as const,
    code: 'import.graphir.local-symbol.id-unsupported',
    message: `Document symbol ${documentCatalog[index]!.id} has an ID that Coral source cannot spell at /documentCatalog/${index}/id` }]);
  const snapshot = successorCatalogSnapshot028(graph);
  const checked = validateGraphIRSuccessorWithCatalog(graph, snapshot, { artworkAdmission: graphIrArtworkAdmission029 });
  // Open obligations matter only for a graph without errors.
  const findings = checked.errors.length ? checked.errors : checked.verification.obligations;
  for (const finding of findings) diagnostics.push({ severity: 'error',
    code: IMPORT_CODES_029[finding.code] ?? `GRAPHIR.${finding.code}`, message: `${finding.message} at ${finding.path}` });
  if (diagnostics.length || !checked.valid) return { diagnostics };
  return { graph: { ...rest, userSymbols029: symbols as NonNullable<SuccessorSourceGraph028['userSymbols029']> },
    diagnostics };
}
/** Port fields print as direction, anchor, label, maxConnections. */
function portLine(indent: string, id: string, direction: string, anchor: string | undefined,
  label: string | undefined, maxConnections: number | undefined): string {
  const fields = [`direction: ${direction}`,
    ...(anchor !== undefined ? [`anchor: ${anchor}`] : []),
    ...(label !== undefined ? [`label: ${quote(label)}`] : []),
    ...(maxConnections !== undefined ? [`maxConnections: ${maxConnections}`] : [])];
  return `${indent}${id} port [${fields.join(', ')}]`;
}
/** One port line without indent, in the approved field order; the editor's
 * port-field edit prints through it so the order has one owner. */
export function printSourcePortLine029(port: { id: string; direction: string; anchor?: string; label?: string;
  maxConnections?: number }): string {
  return portLine('', port.id, port.direction, port.anchor, port.label, port.maxConnections);
}
/** Canonical definition text. Structural lines end with `newline`; artwork is
 * copied byte for byte after its opening line. */
export function printUserSymbolDefinition029(
  symbol: NonNullable<SuccessorSourceGraph028['userSymbols029']>[number], newline = '\n',
): string {
  const lines = definitionLines(symbol);
  return lines.slice(0, -3).join(newline) + newline +
    `  artwork ${symbol.artwork.format} """${newline}${symbol.artwork.text}"""${newline}}${newline}`;
}
/** Canonical definition order; defaults are omitted and artwork is copied byte for byte. */
function definitionLines(symbol: NonNullable<SuccessorSourceGraph028['userSymbols029']>[number]): string[] {
  return [`@symbol ${symbol.id} {`,
    `  name ${quote(symbol.name)}`,
    ...(symbol.description !== undefined ? [`  description ${quote(symbol.description)}`] : []),
    ...(symbol.tags.length ? [`  tags ${symbol.tags.map(quote).join(' ')}`] : []),
    `  size ${symbol.size.width} x ${symbol.size.height}`,
    ...(symbol.label !== 'below' ? [`  label ${symbol.label}`] : []),
    ...(symbol.outline !== 'rectangle' ? [`  outline ${symbol.outline}`] : []),
    ...(symbol.tint !== 'none' ? [`  tint ${symbol.tint}`] : []),
    ...(symbol.source !== undefined ? [`  source ${quote(symbol.source)}`] : []),
    ...(symbol.license !== undefined ? [`  license ${quote(symbol.license)}`] : []),
    ...symbol.anchors.map((anchor) => anchor.kind === 'boundary'
      ? `  anchor ${anchor.id} [side: ${anchor.side}, at: ${anchor.at}]`
      : `  anchor ${anchor.id} [x: ${anchor.x}, y: ${anchor.y}, exit: ${anchor.exit}]`),
    ...symbol.ports.map((port) => portLine('  ', port.id, port.direction, port.anchor, port.label,
      port.maxConnections)),
    `  artwork ${symbol.artwork.format} """\n${symbol.artwork.text}"""`,
    '}', ''];
}
/** Coral source for a projection, or GraphIR 4 import when the graph carries a `documentCatalog`. */
export function printSuccessorSource028(
  input: SuccessorSourceGraph028 | SuccessorGraphIr029,
  options: SuccessorSourceWriteOptions028 = {},
): SuccessorSourceWrite028 {
  const failure = (message: string): SuccessorSourceWrite028 => ({
    diagnostics: [
      {
        severity: 'error',
        code: 'coral.writer028.successor.unsupported',
        message,
      },
    ],
  });
  try {
    let graph = input as SuccessorSourceGraph028;
    if ('documentCatalog' in input && input.documentCatalog) {
      const imported = importDocumentCatalog029(input);
      if (!imported.graph) return { diagnostics: imported.diagnostics };
      graph = imported.graph;
    }
    const coralVersion = options.coralVersion ?? (usesEdition029(graph) ? '0.2.9' : '0.2.8');
    if (usesEdition029(graph) && !editionAdmitsUserSymbols029(coralVersion))
      return failure(
        `Symbol definitions and port label or maxConnections require @coralVersion "0.2.9", not ${coralVersion}.`,
      );
    const core = successorCoreValidationInput029(graph);
    const checked = validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options);
    if (!checked.valid || !checked.verification.complete)
      return failure(
        'The successor graph must pass exact installed catalog validation before source generation.',
      );
    if (graph.interaction)
      return failure(
        'Recursive interaction generation requires its authored source.',
      );
    const lines = [
      `@diagram ${graph.catalog.id}`,
      `@coralVersion ${quote(coralVersion)}`,
      `@profileVersion ${quote(graph.profile.version)}`,
      `@catalogVersion ${quote(graph.catalog.version)}`,
      `@conformanceLevel ${graph.conformanceLevel}`,
      '',
      ...(graph.userSymbols029 ?? []).flatMap(definitionLines),
    ];
    if (graph.layoutOptions) {
      const options = graph.layoutOptions;
      const entries = [
        ...['algorithm', 'direction', 'edgeRouting'].flatMap((key) =>
          options[key as 'algorithm'] === undefined
            ? []
            : [`${key}: ${options[key as 'algorithm']}`],
        ),
        ...['nodeNode', 'nodeEdge', 'edgeEdge', 'layerSpacing'].flatMap(
          (key) =>
            options.spacing?.[key as 'nodeNode'] === undefined
              ? []
              : [`${key}: ${options.spacing[key as 'nodeNode']}`],
        ),
      ];
      lines.push(`layout [${entries.join(', ')}]`);
    }
    const local = (id: string, parent: string | undefined) =>
      parent ? id.slice(parent.length + 1) : id;
    const owner = (id: string) =>
      id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : undefined;
    const placement = (value: SuccessorSourceNode028['labelPlacement']) =>
      value
        ? ` label ${value.side}${value.offset === undefined ? '' : ` offset ${value.offset}`}`
        : '';
    const emitScope = (
      nodes: SuccessorSourceNode028[],
      parent?: string,
      depth = 0,
    ): void => {
      const indent = '  '.repeat(depth);
      for (const node of nodes) {
        const fields = [
          ...(node.symbol ? [`symbol: ${quote(node.symbol)}`] : []),
          ...(node.variant ? [`variant: ${quote(node.variant)}`] : []),
          ...(graph.conformanceExceptions
            ?.filter((e) => e.nodeId === node.id)
            .map((e) => `conformanceException: ${quote(e.symbol)}`) ?? []),
        ];
        let line = `${indent}${local(node.id, parent)} ${node.type}${fields.length ? ` [${fields.join(', ')}]` : ''}${node.label === undefined ? '' : ` as ${quote(node.label)}`}${placement(node.labelPlacement)}${node.position ? ` @ (${node.position.x}, ${node.position.y})` : ''}${node.pinned ? ' pinned' : ''}`;
        if (node.children?.length || node.semanticPorts?.length) {
          lines.push(line + ' {');
          for (const port of node.semanticPorts ?? [])
            lines.push(portLine(`${indent}  `, port.id, port.direction,
              port.anchor && portAnchorSpelling029(port.anchor), port.label, port.maxConnections));
          emitScope(node.children ?? [], node.id, depth + 1);
          lines.push(indent + '}');
        } else lines.push(line);
      }
      for (const edge of graph.edges.filter(
        (edge) => owner(edge.id) === parent,
      )) {
        const arrow =
          edge.direction === 'first-to-second'
            ? '->'
            : edge.direction === 'second-to-first'
              ? '<-'
              : edge.direction === 'both'
                ? '<->'
                : '-';
        const field: string[] = [];
        if (edge.type) field.push(`type: ${edge.type}`);
        const mark = (end: typeof edge.firstEnd) => {
          if (!end?.marker) return;
          const { kind, fill } = end.marker;
          const names: Record<string, string> = {
            'zero-or-one': 'zeroOrOne',
            'zero-or-many': 'zeroOrMany',
            'one-or-many': 'oneOrMany',
            'crow-foot': 'crowFoot',
          };
          return fill === 'filled' &&
            ['arrow', 'triangle', 'diamond', 'circle'].includes(kind)
            ? `filled${kind[0]!.toUpperCase() + kind.slice(1)}`
            : (names[kind] ?? kind);
        };
        const first = mark(edge.firstEnd),
          second = mark(edge.secondEnd);
        if (first) field.push(`firstEnd: ${first}`);
        if (second) field.push(`secondEnd: ${second}`);
        const edgePlacement = edge.labelPlacement
          ? ` label ${edge.labelPlacement.side}${edge.labelPlacement.at === undefined ? '' : ` at ${edge.labelPlacement.at}`}${edge.labelPlacement.offset === undefined ? '' : ` offset ${edge.labelPlacement.offset}`}`
          : '';
        lines.push(
          `${indent}${local(edge.id, parent)} = ${edge.first.node}${edge.first.port ? ':' + edge.first.port : ''} ${arrow} ${edge.second.node}${edge.second.port ? ':' + edge.second.port : ''}${field.length ? ` [${field.join(', ')}]` : ''}${edge.label === undefined ? '' : ` as ${quote(edge.label)}`}${edgePlacement}`,
        );
      }
      for (const constraint of graph.constraints ?? [])
        if (owner(constraint.id) === parent)
          lines.push(
            indent + constraintLine(constraint, local(constraint.id, parent)),
          );
    };
    emitScope(graph.nodes);
    for (const edge of graph.edges) {
      if (!edge.routeIntent) continue;
      lines.push(`route edge ${edge.id} {`);
      for (const waypoint of edge.routeIntent.waypoints) {
        const p = waypoint.placement;
        const anchor = p.kind === 'relative' ? p.anchor : undefined;
        const phrase = !anchor
          ? ''
          : anchor.kind === 'first' || anchor.kind === 'second'
            ? anchor.kind
            : anchor.kind === 'waypoint'
              ? `waypoint ${anchor.waypointId}`
              : anchor.kind === 'node'
                ? `node ${anchor.nodeId}`
                : `port ${anchor.nodeId}:${anchor.portId}`;
        const point = p.kind === 'absolute' ? p.position : p.offset;
        lines.push(
          `  ${waypoint.id} = waypoint ${p.kind === 'absolute' ? 'at' : `relative to ${phrase} offset`} (${point.x}, ${point.y})`,
        );
      }
      lines.push('}');
    }
    const text = lines.join('\n') + '\n';
    const reparsed = projectInstalledSourceToSuccessor028(text);
    if (
      reparsed.diagnostics.length ||
      !reparsed.graph ||
      semanticCanonical(reparsed.graph) !== semanticCanonical(graph)
    )
      return failure(
        'The graph contains fields outside the lossless successor source generation subset. Preserve its authored source.',
      );
    return { text, diagnostics: [] };
  } catch {
    return failure(
      'The successor graph cannot be safely represented by the installed source writer.',
    );
  }
}
