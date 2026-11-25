/** Bounded migration of the retained Mermaid test corpus into installed source.
 * This is fixture conversion, not an additional production import surface. */
import { canonicalSimpleMermaidSequence028, printWithDiagnostics,
  writeSupplementalMermaidSequence028, type GraphIR } from '@coral-viz/language';
import { parseInstalledDocument028, printInstalledSource028,
  verifyPortableSuccessorSource028, projectInstalledSourceToSuccessor028, printSuccessorSource028 } from '@coral-viz/render';

const none = { marker: { kind: 'none', fill: 'unspecified' } } as const;
const only = (value: object, keys: string[]) => Object.entries(value).every(([key, entry]) => entry === undefined || keys.includes(key));
const arrow = { marker: { kind: 'arrow', fill: 'open' } } as const;

export function writeCorpusSource028(graph: GraphIR): string {
  let text: string | undefined;
  if (graph.metadata?.notation === 'uml-sequence') {
    const canonical = canonicalSimpleMermaidSequence028(graph);
    text = canonical && printInstalledSource028(canonical, 'uml-sequence').text;
    text ??= writeSupplementalMermaidSequence028(graph);
  } else if (graph.metadata?.notation === 'uml-class') {
    text = printInstalledSource028(graph, 'uml-class').text;
    if (!text) {
      // The legacy printer already preserves complete class compartments,
      // operation signatures and visibility. Convert declaration and connector
      // spelling and make generated member IDs legal source identifiers.
      if (!only(graph, ['version', 'id', 'nodes', 'edges', 'metadata', 'profile']) ||
          graph.edges.some(edge => !only(edge, ['id', 'source', 'target', 'type', 'label', 'sourceEnd', 'targetEnd'])))
        throw new Error('Class fixture has fields outside the lossless corpus conversion subset');
      const printed = printWithDiagnostics(graph);
      if (printed.diagnostics.length) throw new Error('Class fixture cannot be printed losslessly');
      let currentNode: GraphIR['nodes'][number] | undefined;
      let part: 'attributes' | 'operations' | undefined;
      let memberOrdinal = 0;
      const nodeBody = printed.text.slice(printed.text.indexOf('\n') + 1)
        .split('\n').filter(line => !/^[A-Za-z_]\w*.* -> /.test(line))
        .map(line => line.replace(/^ {2}(attributes|operations) \{$/, '  $1 = $1 {')
          .replace(/^(class|interface|enum) ("(?:[^"\\]|\\.)*") as (\w+)/,
          '$3 $1 as $2'))
        .map(line => {
          const declaration = /^(\w+) (?:class|interface|enum)\b/.exec(line);
          if (declaration) currentNode = graph.nodes.find(node => node.id === declaration[1]);
          const compartment = /^ {2}(attributes|operations) =/.exec(line);
          if (compartment) { part = compartment[1] as typeof part; memberOrdinal = 0; }
          const compact = /^ {4}([+~#-]) (.*)$/.exec(line);
          if (!compact || !part) return line;
          const section = currentNode?.classifier?.compartments.find(item => item.kind === part);
          const member = section && 'items' in section ? section.items[memberOrdinal++] : undefined;
          if (!member) throw new Error('Class fixture member identity could not be preserved');
          const visibility: Record<string, string> = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
          if (!/^(?:[A-Za-z_]\w*|(?:attribute|operation)-\d+)$/.test(member.id))
            throw new Error('Class fixture has unsupported member identity');
          return `    ${member.id.replace(/-/g, '_')} = ${visibility[compact[1]]} ${part === 'attributes' ? 'attribute' : 'operation'} ${compact[2]}`;
        }).join('\n').trim();
      const connector = (edge: GraphIR['edges'][number]) => {
        const expectedFirst = edge.type === 'composition' || edge.type === 'aggregation'
          ? { kind: 'diamond', fill: edge.type === 'composition' ? 'filled' : 'open' } : none.marker;
        const expectedSecond = edge.type === 'inheritance' ? { kind: 'triangle', fill: 'open' }
          : edge.type === 'association' ? arrow.marker : none.marker;
        if (JSON.stringify(edge.sourceEnd?.marker ?? none.marker) !== JSON.stringify(expectedFirst) ||
            JSON.stringify(edge.targetEnd?.marker ?? none.marker) !== JSON.stringify(expectedSecond))
          throw new Error('Class fixture has unsupported connector appearance');
        if (edge.type === 'inheritance') return '--|>';
        if (edge.type === 'composition') return '--';
        if (edge.type === 'aggregation') return '--';
        if (edge.type === 'association') return '-->';
        throw new Error(`Unsupported class fixture connector ${edge.type}`);
      };
      text = '@diagram uml-class\n' + nodeBody + '\n\n' + graph.edges.map(edge =>
        `${edge.id} = ${edge.source} ${connector(edge)} ${edge.target} [${edge.type}${edge.type === 'composition' ? ', firstEnd: filledDiamond' : edge.type === 'aggregation' ? ', firstEnd: diamond' : ''}]${edge.label === undefined ? '' : ` as ${JSON.stringify(edge.label)}`}`,
      ).join('\n') + '\n';
    }
  } else if (graph.id === 'mermaid-flowchart' && !graph.metadata) {
    // The importer translates these service/dataflow examples to architecture
    // kinds. Keep those exact kinds, topology and labels rather than guessing
    // ISO flowchart semantics from generic GraphIR types.
    const { layoutOptions, ...body } = graph;
    const canonical: GraphIR = { ...body, metadata: { notation: 'architecture' },
      edges: graph.edges.map(edge => ({ ...edge, sourceEnd: edge.sourceEnd ?? none,
        targetEnd: edge.targetEnd ?? arrow })) };
    text = printInstalledSource028(canonical, 'architecture').text;
    if (!text) {
      if (!only(canonical, ['version', 'id', 'nodes', 'edges', 'metadata']) ||
          canonical.nodes.some(node => !only(node, ['id', 'type', 'label'])) ||
          canonical.edges.some(edge => !only(edge, ['id', 'source', 'target', 'label', 'sourceEnd', 'targetEnd']) ||
            JSON.stringify(edge.sourceEnd) !== JSON.stringify(none) ||
            JSON.stringify(edge.targetEnd) !== JSON.stringify(arrow)))
        throw new Error('Flow fixture has fields outside the lossless corpus conversion subset');
      // Generic module is legal source but outside the fail-closed production
      // graph writer. Use the source writer after a production projection.
      const draft = '@diagram architecture\n' + canonical.nodes.map(node =>
        `${node.id} ${node.type} as ${JSON.stringify(node.label)}`).join('\n') + '\n' +
        canonical.edges.map(edge => `${edge.id} = ${edge.source} -> ${edge.target}${edge.label === undefined ? '' : ` as ${JSON.stringify(edge.label)}`}`).join('\n');
      const projected = projectInstalledSourceToSuccessor028(draft);
      if (projected.graph && !projected.diagnostics.length)
        text = printSuccessorSource028(projected.graph).text;
    }
    if (text && layoutOptions) {
      if (Object.keys(layoutOptions).some(key => key !== 'direction'))
        throw new Error('Unsupported corpus layout option');
      text = text.replace(/^((?:@[^\n]*\n)+)/, `$1layout [direction: ${layoutOptions.direction}]\n`);
    }
  }
  if (!text) throw new Error('Diagram has no lossless installed 0.2.8 source representation');
  const parsed = parseInstalledDocument028(text);
  const verified = verifyPortableSuccessorSource028(text);
  if (parsed.header.diagnostics.length || parsed.syntax.diagnostics.length || verified.diagnostics.length)
    throw new Error(`Installed source rejected: ${[...parsed.header.diagnostics, ...parsed.syntax.diagnostics,
      ...verified.diagnostics].map(d => d.message).join('; ')}`);
  return text;
}
