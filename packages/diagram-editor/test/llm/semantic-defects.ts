/**
 * Validation for Fable-5.1-authored semantic defect test data (Slice 49,
 * R-049.6 AC-2/AC-3). Implements the design's "Output validation and retry,
 * stated explicitly" requirement: a record is only accepted once its
 * `affectedNodeIds`/`affectedEdgeIds` are confirmed to exist in the
 * diagram's actual known-good DSL, and its defective output DSL is
 * confirmed to still be syntactically valid Coral (a semantic defect must
 * never also be a syntax defect -- those are the other pipeline's job).
 */

import { parseGraphFixture } from './graph-interchange-fixture';

export interface SemanticDefectMeta {
  originalFilename: string;
  defectType: string;
  affectedNodeIds: string[];
  affectedEdgeIds?: string[];
  explanation: string;
  outputFilename: string;
}

/** IDs not present in the diagram's known-good DSL, and any output-DSL parse errors. */
export interface SemanticDefectValidation {
  unknownNodeIds: string[];
  unknownEdgeIds: string[];
  outputParseErrors: string[];
  outputUnchanged: boolean;
  outputGraphUnchanged: boolean;
  affectedChangeObserved: boolean;
  valid: boolean;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]));
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function canonicalEntityMultiset<T>(entities: T[]): string {
  return JSON.stringify(entities.map(stableJson).sort());
}

function orderedEntityOccurrences<T extends { id: string }>(entities: T[], id: string): string {
  return JSON.stringify(entities.flatMap((entity, index) =>
    entity.id === id ? [{ index, entity: stableJson(entity) }] : []));
}

function affectedNodeSignature(result: ReturnType<typeof parseGraphFixture>, id: string): string {
  return JSON.stringify({
    nodes: canonicalEntityMultiset(result.nodes.filter((node) => node.id === id)),
    incidentEdges: canonicalEntityMultiset(result.edges.filter((edge) =>
      edge.source === id || edge.target === id)),
  });
}

export function validateSemanticDefect(meta: SemanticDefectMeta, knownGoodDsl: string, outputDsl: string): SemanticDefectValidation {
  const known = parseGraphFixture(knownGoodDsl);
  const nodeIds = new Set(known.nodes.map((n) => n.id));
  const edgeIds = new Set(known.edges.map((e) => e.id));

  const unknownNodeIds = meta.affectedNodeIds.filter((id) => !nodeIds.has(id));
  const unknownEdgeIds = (meta.affectedEdgeIds ?? []).filter((id) => !edgeIds.has(id));

  const output = parseGraphFixture(outputDsl);
  const outputParseErrors = output.errors.map((e) => e.message);
  const outputUnchanged = outputDsl === knownGoodDsl;
  const sequenceOrderMatters = meta.defectType === 'out-of-order-sequence';
  const edgesUnchanged = sequenceOrderMatters
    ? stableJson(output.edges) === stableJson(known.edges)
    : canonicalEntityMultiset(output.edges) === canonicalEntityMultiset(known.edges);
  const outputGraphUnchanged = stableJson(output.envelope) === stableJson(known.envelope)
    && canonicalEntityMultiset(output.nodes) === canonicalEntityMultiset(known.nodes)
    && edgesUnchanged;

  const affectedChangeObserved = meta.affectedNodeIds.some(
    (id) => affectedNodeSignature(known, id) !== affectedNodeSignature(output, id),
  ) || (meta.affectedEdgeIds ?? []).some(
    (id) => sequenceOrderMatters
      ? orderedEntityOccurrences(known.edges, id) !== orderedEntityOccurrences(output.edges, id)
      : canonicalEntityMultiset(known.edges.filter((edge) => edge.id === id))
        !== canonicalEntityMultiset(output.edges.filter((edge) => edge.id === id)),
  );

  return {
    unknownNodeIds,
    unknownEdgeIds,
    outputParseErrors,
    outputUnchanged,
    outputGraphUnchanged,
    affectedChangeObserved,
    valid: unknownNodeIds.length === 0 && unknownEdgeIds.length === 0
      && outputParseErrors.length === 0 && !outputGraphUnchanged && affectedChangeObserved,
  };
}
