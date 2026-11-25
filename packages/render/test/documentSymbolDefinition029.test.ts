import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeDocumentSymbolDigest, type DocumentSymbolDefinition as DocumentSymbolDefinition029 } from '@graph-ir/core';
import { documentSymbolDefinition029, projectInstalledSourceToSuccessor028 } from '../src/index.js';

// The one source-to-GraphIR definition mapping, shown by the inspector's
// digest (C5) and used by GraphIR export (C7).

const vectors = (JSON.parse(readFileSync(new URL('./fixtures/user-symbol-digest-vectors.json', import.meta.url),
  'utf8')) as { vectors: Array<{ name: string; definition: DocumentSymbolDefinition029; digest: string }> }).vectors;

const quote = (value: string) => JSON.stringify(value);
const portAnchor = (anchor: { kind: string; position?: string; id?: string }) =>
  anchor.kind === 'exact' ? anchor.position! : anchor.kind === 'symbol' ? anchor.id! : anchor.kind;

/** Coral source spelling the vector's members; artwork stays a placeholder. */
function sourceFor(definition: DocumentSymbolDefinition029): string {
  const lines = [`@symbol ${definition.id.slice('local.'.length)} {`, `  name ${quote(definition.name)}`,
    ...(definition.description !== undefined ? [`  description ${quote(definition.description)}`] : []),
    ...(definition.tags ? [`  tags ${definition.tags.map(quote).join(' ')}`] : []),
    `  size ${definition.size.width} x ${definition.size.height}`,
    ...(definition.labelSide ? [`  label ${definition.labelSide}`] : []),
    ...(definition.outline ? [`  outline ${definition.outline}`] : []),
    ...(definition.tint ? [`  tint ${definition.tint}`] : []),
    ...(definition.provenance?.source !== undefined ? [`  source ${quote(definition.provenance.source)}`] : []),
    ...(definition.provenance?.license !== undefined ? [`  license ${quote(definition.provenance.license)}`] : []),
    ...(definition.anchors ?? []).map((anchor) => anchor.kind === 'boundary'
      ? `  anchor ${anchor.id} [side: ${anchor.side}, at: ${anchor.at}]`
      : `  anchor ${anchor.id} [x: ${anchor.x}, y: ${anchor.y}, exit: ${anchor.exit}]`),
    ...(definition.ports ?? []).map((port) => `  ${port.id} port [direction: ${port.direction}${port.anchor
      ? `, anchor: ${portAnchor(port.anchor as never)}` : ''}${port.label !== undefined ? `, label: ${quote(port.label)}` : ''}${
      port.maxConnections !== undefined ? `, maxConnections: ${port.maxConnections}` : ''}]`),
    '  artwork svg """', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>',
    '"""', '}'];
  return ['@diagram architecture', '@coralVersion "0.2.9"', ...lines, `n service [symbol: ${quote(definition.id)}]`, ''].join('\n');
}

const EXPRESSIBLE = ['minimal', 'label-side-above', 'outline-rounded', 'outline-ellipse', 'outline-diamond',
  'tint-stroke', 'provenance-license-only', 'port-anchor-omitted', 'port-anchor-explicit-auto',
  'anchors-boundary-and-interior'];

describe('documentSymbolDefinition029', () => {
  it.each(EXPRESSIBLE)('maps the source spelling of vector %s to its GraphIR digest input', (name) => {
    const vector = vectors.find((item) => item.name === name)!;
    const graph = projectInstalledSourceToSuccessor028(sourceFor(vector.definition)).graph!;
    expect(graph, name).toBeDefined();
    const { digest: _digest, ...mapped } = documentSymbolDefinition029(graph.userSymbols029![0]!);
    const result = computeDocumentSymbolDigest({ ...mapped, artwork: vector.definition.artwork });
    expect(result.ok && result.digest).toBe(vector.digest);
  });

});
