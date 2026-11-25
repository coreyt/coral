/** Edition 0.2.9 user symbols in their GraphIR 4 form (contract §8): the one
 * conversion between Coral's source definitions and `documentCatalog`, and
 * Coral's `coral.svg-artwork` admission check for core validation. */
import { computeDocumentSymbolDigest, type ArtworkAdmissionCheck, type DocumentSymbolDefinition,
  type SemanticAnchor, type SemanticPort } from '@graph-ir/core';
import { admitSvgArtwork029 } from './artwork/svgArtworkAdmission029.js';
import { SVG_ARTWORK_PROFILE_029, SVG_ARTWORK_PROFILE_FROZEN_029 } from './artwork/svgArtworkModel029.js';
import { projectPortAnchor028 } from './portAnchorProjection028.js';
import type { SuccessorUserSymbol029 } from './successorSourceProjection028.js';

/** Core's admission hook for profile version 1; a refusal's detail is the
 * first failure's code and detail (profile §13.3). */
export const svgArtworkAdmissionCheck029: ArtworkAdmissionCheck = Object.freeze({
  profile: Object.freeze({ id: SVG_ARTWORK_PROFILE_029.id, version: SVG_ARTWORK_PROFILE_029.version }),
  admit(text: string) {
    const admitted = admitSvgArtwork029(text);
    if (admitted.ok) return { ok: true as const, canonicalText: admitted.artwork.canonicalText };
    const [first] = admitted.failures;
    return { ok: false as const, detail: `${first!.code}: ${first!.detail}` };
  },
});

/** A source definition as a GraphIR document symbol: canonical admitted
 * artwork, defaults omitted, and core's digest. */
export function documentSymbolDefinition029(symbol: SuccessorUserSymbol029): DocumentSymbolDefinition {
  const admitted = admitSvgArtwork029(symbol.artwork.text);
  if (!admitted.ok) throw new Error(`Symbol ${symbol.id} artwork is not admitted`);
  const definition: Omit<DocumentSymbolDefinition, 'digest'> = {
    id: symbol.symbolId as DocumentSymbolDefinition['id'], name: symbol.name,
    ...(symbol.description !== undefined ? { description: symbol.description } : {}),
    ...(symbol.tags.length ? { tags: [...symbol.tags] } : {}),
    size: { width: symbol.size.width, height: symbol.size.height },
    ...(symbol.label !== 'below' ? { labelSide: symbol.label } : {}),
    ...(symbol.outline !== 'rectangle' ? { outline: symbol.outline } : {}),
    ...(symbol.tint !== 'none' ? { tint: symbol.tint } : {}),
    ...(symbol.source !== undefined || symbol.license !== undefined ? { provenance: {
      ...(symbol.source !== undefined ? { source: symbol.source } : {}),
      ...(symbol.license !== undefined ? { license: symbol.license } : {}) } } : {}),
    artwork: { mediaType: 'image/svg+xml', profile: { ...svgArtworkAdmissionCheck029.profile },
      text: admitted.artwork.canonicalText },
    ...(symbol.anchors.length ? { anchors: symbol.anchors.map((anchor) => anchor.kind === 'boundary'
      ? { id: anchor.id, kind: anchor.kind, side: anchor.side, at: anchor.at }
      : { id: anchor.id, kind: anchor.kind, x: anchor.x, y: anchor.y, exit: anchor.exit }) } : {}),
    ...(symbol.ports.length ? { ports: symbol.ports.map((port): SemanticPort => ({ id: port.id,
      direction: port.direction, ...(port.anchor !== undefined ? { anchor: projectPortAnchor028(port.anchor) } : {}),
      ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}) })) } : {}),
  };
  const digest = computeDocumentSymbolDigest(definition);
  // An uncomputable digest keeps no hex digits, so core reports it at its path.
  return { ...definition, digest: digest.ok ? digest.digest : 'sha256:' };
}

/** The admission list for GraphIR interchange: an unfrozen profile version is
 * named by no check, so core reports `ARTWORK_PROFILE_UNSUPPORTED` (§13.3). */
export const graphIrArtworkAdmission029: readonly ArtworkAdmissionCheck[] =
  Object.freeze(SVG_ARTWORK_PROFILE_FROZEN_029 ? [svgArtworkAdmissionCheck029] : []);

/** The source spelling of a GraphIR port anchor. */
export const portAnchorSpelling029 = (anchor: SemanticAnchor): string =>
  anchor.kind === 'exact' ? anchor.position : anchor.kind === 'symbol' ? anchor.id : anchor.kind;

/** A GraphIR document symbol as a source definition, with defaults filled as
 * the parser fills them; `undefined` when Coral source cannot spell its ID. */
export function userSymbolFromDocumentSymbol029(definition: DocumentSymbolDefinition): SuccessorUserSymbol029 | undefined {
  const id = /^local\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(definition.id)?.[1];
  if (id === undefined) return undefined;
  return { id, symbolId: definition.id, name: definition.name,
    ...(definition.description !== undefined ? { description: definition.description } : {}),
    tags: [...definition.tags ?? []], size: { width: definition.size.width, height: definition.size.height },
    label: definition.labelSide ?? 'below', outline: definition.outline ?? 'rectangle', tint: definition.tint ?? 'none',
    ...(definition.provenance?.source !== undefined ? { source: definition.provenance.source } : {}),
    ...(definition.provenance?.license !== undefined ? { license: definition.provenance.license } : {}),
    anchors: (definition.anchors ?? []).map((anchor) => ({ ...anchor })),
    ports: (definition.ports ?? []).map((port) => ({ id: port.id, direction: port.direction,
      ...(port.anchor !== undefined ? { anchor: portAnchorSpelling029(port.anchor) } : {}),
      ...(port.label !== undefined ? { label: port.label } : {}),
      ...(port.maxConnections !== undefined ? { maxConnections: port.maxConnections } : {}) })),
    artwork: { format: 'svg', text: definition.artwork.text } };
}
