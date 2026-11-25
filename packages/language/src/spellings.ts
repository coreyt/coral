/**
 * Accepted Coral spellings (R-063 AC-5).
 *
 * One `[row, spelling]` pair per `spellings` entry of the in-scope rows of
 * `spec/graphir-field-matrix.json`. The parser stores every authored GraphIR
 * field through `assign`, whose pair argument is typed by this list, and
 * `scripts/verify-language-spec.mjs` checks the list against the matrix in
 * both directions.
 *
 * This module holds only erasable TypeScript and imports nothing, so Node
 * loads it directly from source.
 *
 * Spelling forms: `header` (@graph JSON key), `clause` (fixed readable
 * clause), `token` (bare bracket token), `attribute` (named edge attribute;
 * `*` is any other key), `body` (node body property), `prefix` (declaration
 * prefix), `parameter` (constraint parameter), and `data` (key path in the
 * object's `data` JSON).
 */

/**
 * The public specification identity, independent of package/source editions.
 * Removed-syntax diagnostics retain their separately approved historical text.
 */
export const CORAL_LANGUAGE_VERSION = '1.3.0';

export const SPELLINGS = [
  ['GraphIR.id', 'header:id'],
  ['GraphIR.name', 'header:name'],
  ['GraphIR.metadata', 'header:metadata'],
  ['GraphIR.layoutOptions', 'header:layoutOptions'],

  ['GraphNode.id', 'clause:as'],
  ['GraphNode.type', 'clause:type'],
  ['GraphNode.label', 'clause:label'],
  ['GraphNode.description', 'data:description'],
  ['GraphNode.symbol', 'data:symbol'],
  ['GraphNode.variant', 'data:variant'],
  ['GraphNode.properties', 'body:*'],
  ['GraphNode.ports', 'data:ports'],
  ['GraphNode.dimensions', 'data:dimensions'],
  ['GraphNode.position', 'clause:@'],
  ['GraphNode.pinned', 'clause:pinned'],
  ['GraphNode.labelPlacement', 'clause:label-placement'],
  ['GraphNode.layoutOptions', 'data:layoutOptions'],
  ['GraphNode.classifier', 'clause:classifier'],

  ['GraphEdge.id', 'clause:as'],
  ['GraphEdge.source', 'clause:source'],
  ['GraphEdge.target', 'clause:target'],
  ['GraphEdge.sourcePort', 'data:sourcePort'],
  ['GraphEdge.targetPort', 'data:targetPort'],
  ['GraphEdge.type', 'token:relation'],
  ['GraphEdge.label', 'attribute:label'],
  ['GraphEdge.description', 'attribute:description'],
  ['GraphEdge.labelPlacement', 'clause:label-placement'],
  ['GraphEdge.routeIntent', 'clause:via'],
  ['GraphEdge.properties', 'attribute:*'],
  ['GraphEdge.properties', 'data:properties'],
  ['GraphEdge.sourceEnd', 'data:sourceEnd'],
  ['GraphEdge.sourceEnd', 'compact:end'],
  ['GraphEdge.targetEnd', 'data:targetEnd'],
  ['GraphEdge.targetEnd', 'compact:end'],
  ['EdgeStyle.lineStyle', 'token:line-style'],
  ['EdgeStyle.routing', 'data:style.routing'],

  ['RelativeConstraint.strength', 'prefix:require'],
  ['RelativeConstraint.strength', 'token:strength'],
  ['RelativeConstraint.gap', 'parameter:gap'],
  ['RelativeConstraint.alignment', 'parameter:alignment'],
  ['BoundaryConstraint.strength', 'prefix:require'],
  ['BoundaryConstraint.strength', 'token:strength'],
  ['BoundaryConstraint.inset', 'parameter:inset'],
  ['ArrangementConstraint.strength', 'prefix:require'],
  ['ArrangementConstraint.strength', 'token:strength'],
  ['ArrangementConstraint.gap', 'parameter:gap'],
  ['ArrangementConstraint.alignment', 'parameter:alignment'],
  ['ArrangementConstraint.direction', 'parameter:direction'],
] as const;

/**
 * Removed spellings with a distinctive token, scanned lexically by the corpus
 * guard. L3 and L4 are unaccepted `data` keys and are caught by parsing.
 */
export const REMOVED_SPELLINGS = [
  { id: 'L1', code: 'coral.edge.legacy-arrow.unsupported', pattern: /"(?:source|target)Arrow"\s*:/ },
  { id: 'L2', code: 'coral.attribute.equals.unsupported', pattern: /\[[^\]]*\b[A-Za-z_]\w*\s*=\s*[^\]]*\]/ },
] as const;
