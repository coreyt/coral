/** Fail-closed 0.2.8 source writer for approved profile subsets. */
import { printWithDiagnostics, type Diagnostic, type GraphIR } from '@coral-viz/language';
import { parseInstalledDocument028 } from './installedDocument028.js';
import { approvedNotationTypeWords028 } from './notations/index.js';

export interface InstalledSourceWrite028 {
  text?: string;
  diagnostics: Diagnostic[];
}

function failure(code: string, message: string): InstalledSourceWrite028 {
  return { diagnostics: [{ severity: 'error', code: `coral.writer028.${code}`, message }] };
}

function hasOnlyOwnDataKeys(value: unknown, allowed: readonly string[]): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every((key) => typeof key === 'string'
    && 'value' in descriptors[key]
    && (descriptors[key].value === undefined || allowed.includes(key)));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
      : item);
}

const BARE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SOURCE_END = { marker: { kind: 'none', fill: 'unspecified' } };
const TARGET_END = { marker: { kind: 'arrow', fill: 'open' } };
const NEUTRAL_END = { marker: { kind: 'none', fill: 'unspecified' } };
const CROW_END = { marker: { kind: 'crow-foot', fill: 'unspecified' } };
const REVERSE_FIRST_END = TARGET_END;
const REVERSE_SECOND_END = SOURCE_END;
const WRITABLE_PROFILES = new Set([
  'architecture', 'flowchart', 'block', 'bpmn', 'uml-class', 'uml-sequence',
]);

export function printInstalledSource028(graph: GraphIR, diagramType: string): InstalledSourceWrite028 {
  const umlClass = diagramType === 'uml-class';
  const umlSequence = diagramType === 'uml-sequence';
  const umlFamily = umlClass || umlSequence;
  if (!WRITABLE_PROFILES.has(diagramType))
    return failure('diagram-type.unsupported', `The 0.2.8 writer does not yet support ${diagramType}.`);
  if (!hasOnlyOwnDataKeys(graph, umlSequence
    ? ['version', 'id', 'metadata', 'profile', 'nodes', 'edges', 'interaction']
    : ['version', 'id', 'metadata', 'profile', 'nodes', 'edges']) ||
      graph.version !== '3.0.0' || typeof graph.id !== 'string' ||
      !Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
    return failure('graph.unsupported', 'The graph carries fields or a version outside the approved 0.2.8 source subsets.');
  if ((graph.metadata !== undefined && !hasOnlyOwnDataKeys(graph.metadata, ['notation'])) ||
      (graph.metadata?.notation !== undefined && graph.metadata.notation !== diagramType) ||
      (!umlFamily && graph.metadata?.notation !== diagramType))
    return failure('notation.conflict', 'The graph notation must exactly match the selected installed diagram type.');
  if (umlFamily
    ? canonicalJson(graph.profile) !== canonicalJson({ id: 'uml', kind: umlClass ? 'class' : 'sequence', version: '1.0.0' })
    : graph.profile !== undefined)
    return failure('profile.conflict', 'The graph profile must match the selected installed diagram type.');

  const approvedKinds = new Set([...approvedNotationTypeWords028(diagramType), 'group',
    ...(diagramType === 'bpmn' ? ['event'] : [])]);
  const seenNodes = new WeakSet<object>();
  const checkNode = (node: GraphIR['nodes'][number], parent?: string): InstalledSourceWrite028 | undefined => {
    const allowed = umlClass
      ? ['id', 'type', 'label', 'symbol', 'variant', 'classifier', 'children', 'parent']
      : ['id', 'type', 'label', 'symbol', 'variant', 'children', 'parent'];
    if (!hasOnlyOwnDataKeys(node, allowed) || seenNodes.has(node) ||
        typeof node.id !== 'string' || typeof node.type !== 'string' ||
        !(parent ? node.id.startsWith(`${parent}.`) && BARE.test(node.id.slice(parent.length + 1))
          : BARE.test(node.id)) || !BARE.test(node.type) || typeof node.label !== 'string' ||
        (node.symbol !== undefined && typeof node.symbol !== 'string') ||
        (node.variant !== undefined && typeof node.variant !== 'string') ||
        node.parent !== parent ||
        (node.children !== undefined && (node.type !== 'group' || !Array.isArray(node.children))))
      return failure('node.unsupported', `Node ${String(node?.id)} has an unsupported field, ID, kind, or ownership.`);
    seenNodes.add(node);
    if (!approvedKinds.has(node.type))
      return failure('node.kind.unsupported', `Node ${node.id} uses ${node.type}, which is not an approved ${diagramType} type word.`);
    for (const child of node.children ?? []) {
      const issue = checkNode(child, node.id);
      if (issue) return issue;
    }
    return undefined;
  };
  for (const node of graph.nodes) {
    const issue = checkNode(node);
    if (issue) return issue;
  }
  // This legacy graph-to-text writer cannot emit local child spellings from
  // canonical group-qualified IDs. Source-owned save keeps authored text.
  if (graph.nodes.some((node) => node.children?.length))
    return failure('group-source-required',
      'Grouped nodes require their authored Coral source; graph-to-text export cannot reconstruct local IDs.');
  let implicitEdgeOrdinal = 0;
  for (const edge of graph.edges) {
    const implicit = edge.id === `edge-${implicitEdgeOrdinal + 1}`;
    if (implicit) implicitEdgeOrdinal++;
    if (!hasOnlyOwnDataKeys(edge, umlSequence
      ? ['id', 'source', 'target', 'sourcePort', 'targetPort', 'type', 'label', 'sourceEnd', 'targetEnd', 'style']
      : ['id', 'source', 'target', 'sourcePort', 'targetPort', 'type', 'label', 'sourceEnd', 'targetEnd']) ||
        typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string' ||
        (!BARE.test(edge.id) && !implicit) || !BARE.test(edge.source) || !BARE.test(edge.target) ||
        (edge.sourcePort !== undefined && (typeof edge.sourcePort !== 'string' || !BARE.test(edge.sourcePort))) ||
        (edge.targetPort !== undefined && (typeof edge.targetPort !== 'string' || !BARE.test(edge.targetPort))) ||
        (edge.type !== undefined && (typeof edge.type !== 'string' || !BARE.test(edge.type))) ||
        (umlSequence && (!['sync', 'async', 'return'].includes(edge.type ?? '') ||
          (edge.style !== undefined && (!hasOnlyOwnDataKeys(edge.style, ['lineStyle']) ||
            edge.style.lineStyle !== 'dashed')))) ||
        (edge.label !== undefined && typeof edge.label !== 'string') ||
        (!umlFamily && !(
          (canonicalJson(edge.sourceEnd) === canonicalJson(SOURCE_END) &&
            [diagramType === 'erd' ? NEUTRAL_END : TARGET_END, CROW_END]
              .some((end) => canonicalJson(edge.targetEnd) === canonicalJson(end))) ||
          (diagramType !== 'erd' && canonicalJson(edge.sourceEnd) === canonicalJson(REVERSE_FIRST_END) &&
            canonicalJson(edge.targetEnd) === canonicalJson(REVERSE_SECOND_END)))))
      return failure('edge.unsupported', `Edge ${String(edge.id)} has an unsupported field, ID, style, or connector end.`);
  }

  const printed = printWithDiagnostics(graph, { edition: '0.2.8-preview' });
  const headerEnd = printed.text.indexOf('\n');
  if (printed.diagnostics.length || !printed.text.startsWith('@graph ') || headerEnd < 0)
    return failure('body.unsupported', 'The 0.2.8 body printer could not preserve every supported field.');
  const afterHeader = printed.text.slice(headerEnd + 1);
  const body = afterHeader.startsWith('\n') ? afterHeader.slice(1) : afterHeader;
  const text = `@diagram ${diagramType}\n${body}`;
  const reparsed = parseInstalledDocument028(text);
  if (reparsed.header.diagnostics.length || reparsed.syntax.diagnostics.length ||
      reparsed.header.header?.catalog.id !== diagramType || !reparsed.graph)
    return failure('reparse.failed', 'The printed source did not reparse under the selected installed catalog.');
  const expected: GraphIR = { ...graph, id: reparsed.graph.id,
    ...(umlFamily && graph.metadata === undefined ? { metadata: { notation: diagramType } } : {}) };
  if (canonicalJson(expected) !== canonicalJson(reparsed.graph))
    return failure('reparse.mismatch', 'The printed source changes graph meaning outside the ephemeral graph ID.');
  return { text, diagnostics: [] };
}
