import type { Diagnostic, DiagnosticRange } from '@coral-viz/language';
import { parseInstalledDocument028 } from './installedDocument028.js';

/** Attach executable spatial failures to the exact current authored tokens.
 * Statement ordering is used only when the reader proves edge correspondence. */
export function sourceSpatialFailureDiagnostics028(cause: unknown,
  sourceOrDocument: string | ReturnType<typeof parseInstalledDocument028>): Diagnostic[] {
  const document = typeof sourceOrDocument === 'string' ? parseInstalledDocument028(sourceOrDocument) : sourceOrDocument;
  const raw = (cause as { diagnostics?: unknown } | undefined)?.diagnostics;
  const fallbackMessage = cause instanceof Error && cause.message.trim() ? cause.message : 'Spatial geometry could not be verified';
  const diagnostics = Array.isArray(raw) && raw.length ? raw : [{ code: 'render.capability.scene-layout', severity: 'error',
    message: fallbackMessage }];
  const statements = document.syntax.statements;
  const edges = statements.filter((statement) => statement.kind === 'edge');
  // Successor-only fields deliberately withhold the legacy projection. The
  // clean syntax staging graph still proves statement/edge correspondence.
  const correspondence = document.graph ?? (!document.syntax.diagnostics.some((item) => item.severity === 'error')
    ? document.syntax.graph : undefined);
  const namedEdges = new Map(edges.flatMap((edge) => edge.id ? [[edge.qualifiedId ?? edge.id.value, edge] as const] : []));
  const edgeIds = [...new Set([...namedEdges.keys(), ...correspondence?.edges.map(({ id }) => id) ?? []])]
    .sort((a, b) => b.length - a.length);
  const nodes = new Map(statements.filter((statement) => statement.kind === 'node')
    .map((statement) => [statement.qualifiedId ?? statement.id.value, statement]));
  const rangeOfPlacement = (placement: { side: { range: DiagnosticRange }; at?: { range: DiagnosticRange }; offset?: { range: DiagnosticRange } }) =>
    ({ start: placement.side.range.start, end: (placement.offset ?? placement.at ?? placement.side).range.end });
  return diagnostics.map((value) => {
    const incoming = value as Omit<Diagnostic, 'severity'> & { severity?: Diagnostic['severity']; path?: string };
    const original = { ...incoming, severity: incoming.severity ?? 'error' as const };
    const finding = original.message?.trim() ? original : { ...original, message: fallbackMessage };
    if (finding.range) return finding;
    if (finding.code === 'render.capability.character-only-edition' && document.header.diagramTypeRange) {
      const range = document.header.diagramTypeRange;
      return { ...finding, position: range.start, range };
    }
    const id = finding.path?.startsWith('constraints.') ? finding.path.slice('constraints.'.length)
      : /constraint "([^"]+)"/i.exec(finding.message)?.[1];
    const constraint = statements.find((statement) => (statement.kind === 'constraint' || statement.kind === 'arrangement') &&
      id !== undefined && (statement.qualifiedId ?? statement.id?.value) === id);
    let range: DiagnosticRange | undefined;
    const related: Array<{ message: string; position: DiagnosticRange['start']; range: DiagnosticRange }> = [];
    if (constraint && (constraint.kind === 'constraint' || constraint.kind === 'arrangement')) {
      range = constraint.id?.range ?? (constraint.kind === 'constraint' ? constraint.keyword.range : constraint.keyword.range);
      const refs = constraint.kind === 'constraint' ? [constraint.subject, ...(constraint.target ? [constraint.target] : [])] : constraint.subjects;
      for (const token of refs) related.push({ message: 'Referenced spatial rectangle', position: token.range.start, range: token.range });
    }
    const node = finding.subject?.kind === 'node' ? nodes.get(finding.subject.id) : undefined;
    if (node) range = node.labelPlacement ? rangeOfPlacement(node.labelPlacement) : node.label?.range ?? node.id.range;
    const edgeId = finding.subject?.kind === 'edge' ? finding.subject.id
      : edgeIds.find((id) => finding.path === `edges.${id}` || finding.path?.startsWith(`edges.${id}.`));
    if (edgeId) {
      const edge = namedEdges.get(edgeId) ?? (correspondence && edges.length === correspondence.edges.length
        ? edges[correspondence.edges.findIndex((edge) => edge.id === edgeId)] : undefined);
      if (edge) range = edge.labelPlacement ? rangeOfPlacement(edge.labelPlacement) : edge.label?.range ?? edge.id?.range ?? edge.operator.range;
      const route = statements.find((statement) => statement.kind === 'route' &&
        (statement.edge.value === edgeId || [...statement.scope?.map((token) => token.value) ?? [], statement.edge.value].join('.') === edgeId));
      if (route?.kind === 'route' && finding.path?.includes('routeIntent')) {
        const waypoint = route.waypoints.find((item) => finding.path?.endsWith(`.${item.id.value}`));
        range = waypoint?.anchorWaypoint?.range ?? waypoint?.anchorPort?.range ?? waypoint?.anchor?.range ?? route.edge.range;
      }
    }
    if (!range && finding.path === 'constraints') {
      const first = statements.find((statement) => statement.kind === 'constraint' || statement.kind === 'arrangement');
      if (first?.kind === 'constraint' || first?.kind === 'arrangement') range = first.id?.range ?? first.keyword.range;
    }
    return { ...finding, ...(range ? { position: range.start, range } : {}),
      ...(related.length ? { related: [...finding.related ?? [], ...related] } : {}) };
  });
}
