/**
 * Accuracy Scoring for the LLM Accuracy Harness
 *
 * Pure, independently testable scoring core for Slice 49's accuracy harness
 * (aspect c). Implements the "Scoring model" section of
 * dev/designs/llm-accuracy-harness.md, including its round 2 (unintended-
 * change detection) and round 3 (semanticJudgment field) amendments.
 *
 * This module deliberately does not reimplement validation, drift, or
 * notation-lint logic -- it calls the existing `validateOutput`,
 * `checkStructuralDrift`, and `lintAgainstNotation`, plus a direct
 * `parseCoralDSL`/`parseMermaidDSL` call for the full node/edge objects none
 * of those three functions expose (see the design doc's "Amendment (round
 * 2)" for why that fourth call is required).
 */

import { parseMermaidDSL, type GraphNode, type GraphEdge, type ParseResult } from '../../src/parsers';
import { checkStructuralDrift } from '../../src/llm/validate';
import { lintAgainstNotation } from '../../src/llm/notationLint';
import { parseGraphFixture, validateFixtureOutput } from './graph-interchange-fixture';
import type { GenerateRequest, GenerateResult, LLMProviderId, OutputFormat } from '../../src/llm/types';

/** `meta.json` shape for one fixture directory under `fixtures/accuracy/<case-id>/`. */
export interface AccuracyFixtureMeta {
  caseId: string;
  caseType:
    | 'generate'
    | 'local-edit'
    | 'add-subgraph'
    | 'restructure'
    | 'injected-mistake'
    | 'ambiguous'
    | 'spatial'
    | 'notation'
    | 'adversarial-label';
  /** For 'notation' cases. */
  notationId?: string;
  outputFormat: OutputFormat;
  /** Required when outputFormat is 'mermaid'; checked against the allowlist before the harness runs the fixture. */
  mermaidDiagramType?: string;
  /** For 'adversarial-label' and similar content-fidelity cases; every entry must appear verbatim in the candidate DSL. */
  expectedSubstrings?: string[];
  /** Who/what authored this fixture and why, one sentence. */
  provenance: string;
  /** Known gaps in what this fixture can prove. */
  limitations: string;
  tags?: string[];
  /** Force scorecard review when mechanical fields cannot prove fulfillment. */
  requiresManualReview?: boolean;
  /** local-edit/add-subgraph/restructure only -- see the design doc's "Amendment (round 2)". */
  expectedChangedNodeIds?: string[];
  /** Narrow node permissions; never grants permission to incident edges. */
  expectedChangedNodeFields?: Record<string, Array<'type' | 'label' | 'properties'>>;
  expectedChangedEdgeIds?: string[];
  /**
   * A brand-new `(source, target)` pair the fixture's prompt legitimately
   * asks the model to add -- distinct from `expectedChangedNodeIds`/
   * `expectedChangedEdgeIds`, neither of which can exempt a genuinely new
   * edge without side effects (see the design doc's "Amendment (round 6)"):
   * Node permissions never exempt edges. Each list entry permits one new
   * edge; repeat a pair for multiple expected parallel additions. Existing
   * edges must instead be explicitly permitted by original edge ID.
   */
  expectedNewEdges?: Array<{ source: string; target: string }>;
  /** Existing endpoint pairs the prompt permits removing, counted one-for-one. */
  expectedRemovedEdges?: Array<{ source: string; target: string }>;
}

/**
 * A fixture with its `existing.txt` (if any) already parsed, so `scoreResult`
 * has the original node IDs and full node/edge objects it needs to compute
 * drift and unintended-change diffs without re-parsing on every call.
 */
export interface LoadedFixture {
  meta: AccuracyFixtureMeta;
  prompt: string;
  /** Raw content of existing.txt, if present. */
  existingDsl?: string;
  /** Parsed from existingDsl via validateOutput; [] for fresh generate. */
  originalNodeIds: string[];
  /** Full parsed nodes (id/type/label/properties), for unintended-change diffing. */
  originalNodes: GraphNode[];
  /** Full parsed edges, likewise. */
  originalEdges: GraphEdge[];
  diagnostics?: string;
  layout?: GenerateRequest['layout'];
}

/**
 * One unexpected structural change found while diffing the candidate against
 * the original diagram. Node-field changes are matched by node ID (stable
 * for hand-authored fixtures that give unchanged nodes explicit `as "id"`
 * clauses); edge changes are matched by `(source, target)` pair, since edge
 * IDs auto-derived from `source_to_target` change whenever an edge is
 * redirected and so cannot be used to detect a redirect at all (see the
 * design doc's "Amendment (round 2)" edge-matching correction).
 */
export interface UnintendedChange {
  kind: 'node-field' | 'edge-removed' | 'edge-added' | 'edge-label';
  /** Node id for 'node-field'; `${source}->${target}` for edge kinds. */
  id: string;
  /** Property/label/type name for 'node-field' and 'edge-label'; absent otherwise. */
  field?: string;
  before: unknown;
  after: unknown;
}

/** A bounded, ground-truthed LLM-judge verdict for semantic-defect adversarial fixtures (round 3 amendment). */
export interface SemanticJudgment {
  confidence: 'llm-judge';
  verdict: 'ok' | 'introduced-problem' | 'silently-fixed-unrequested';
  explanation: string;
}

export interface AccuracyScore {
  caseId: string;
  provider: LLMProviderId;
  model: string;
  samplingProfile: string;
  /** validateOutput(result.dsl, outputFormat).valid */
  valid: boolean;
  /** checkStructuralDrift(fixture.originalNodeIds, newNodeIds).lossPercentage; null when originalNodeIds is empty (fresh generate) */
  driftPct: number | null;
  /** lintAgainstNotation(...).filter(severity === 'error').length, 0 if no notationId */
  lintErrorCount: number;
  lintWarningCount: number;
  /** Every meta.expectedSubstrings entry found in result.dsl; null when the fixture sets no expectedSubstrings. */
  contentCheckPassed: boolean | null;
  /** See the design doc's "Amendment (round 2)"; 0 for fresh generate (nothing to preserve). */
  unintendedChangeCount: number;
  unintendedChanges: UnintendedChange[];
  /** True for 'ambiguous' and 'injected-mistake' caseTypes, else false. */
  requiresManualReview: boolean;
  /**
   * Populated by a separate, narrower LLM-judge call site for semantic-defect
   * adversarial fixtures (round 3 amendment) -- `scoreResult` never sets
   * this field itself, it only leaves room for a caller to add it.
   */
  semanticJudgment?: SemanticJudgment;
  /** result.retries */
  retries: number;
  /** result.success */
  succeeded: boolean;
}

/** Parse DSL text with the parser matching the fixture's declared output format. */
function parseByFormat(text: string, format: OutputFormat): ParseResult {
  return format === 'mermaid' ? parseMermaidDSL(text) : parseGraphFixture(text);
}

/**
 * Load a fixture's raw content (already read from its directory by the
 * caller -- this function does no filesystem I/O, to stay pure and testable)
 * into a `LoadedFixture`, parsing `existingDsl` once up front so `scoreResult`
 * doesn't need to.
 */
export function loadFixture(
  meta: AccuracyFixtureMeta,
  prompt: string,
  existingDsl?: string,
  diagnostics?: string,
  layout?: GenerateRequest['layout'],
): LoadedFixture {
  if (existingDsl === undefined) {
    return {
      meta,
      prompt,
      existingDsl,
      originalNodeIds: [],
      originalNodes: [],
      originalEdges: [],
      diagnostics,
      layout,
    };
  }

  const validation = validateFixtureOutput(existingDsl, meta.outputFormat);
  const parsed = parseByFormat(existingDsl, meta.outputFormat);

  return {
    meta,
    prompt,
    existingDsl,
    originalNodeIds: validation.nodeIds,
    originalNodes: parsed.nodes,
    originalEdges: parsed.edges,
    diagnostics,
    layout,
  };
}

function pairKey(edge: Pick<GraphEdge, 'source' | 'target'>): string {
  return `${edge.source}->${edge.target}`;
}

/**
 * Diff the original diagram against the candidate for unintended structural
 * changes: node-field changes (matched by ID) and edge removals/additions/
 * label changes (matched by `(source, target)` pair), each restricted to
 * entities the fixture did not declare as expected to change.
 */
function diffUnintendedChanges(
  originalNodes: GraphNode[],
  originalEdges: GraphEdge[],
  candidateNodes: GraphNode[],
  candidateEdges: GraphEdge[],
  expectedChangedNodeIds: ReadonlySet<string>,
  expectedChangedEdgeIds: ReadonlySet<string>,
  expectedNewEdgePairs: readonly string[],
  expectedRemovedEdgePairs: readonly string[],
  expectedChangedNodeFields: AccuracyFixtureMeta['expectedChangedNodeFields'],
): UnintendedChange[] {
  const changes: UnintendedChange[] = [];

  // --- Nodes: matched by ID; only nodes present in both are compared. ---
  const candidateNodeById = new Map(candidateNodes.map((node) => [node.id, node]));
  for (const original of originalNodes) {
    if (expectedChangedNodeIds.has(original.id)) continue;
    const candidate = candidateNodeById.get(original.id);
    if (!candidate) continue; // a removed node is drift's concern, not unintended-change diffing's
    const allowedFields = expectedChangedNodeFields?.[original.id] ?? [];

    if (original.type !== candidate.type && !allowedFields.includes('type')) {
      changes.push({ kind: 'node-field', id: original.id, field: 'type', before: original.type, after: candidate.type });
    }
    if (original.label !== candidate.label && !allowedFields.includes('label')) {
      changes.push({ kind: 'node-field', id: original.id, field: 'label', before: original.label, after: candidate.label });
    }
    const originalProps = JSON.stringify(original.properties ?? {});
    const candidateProps = JSON.stringify(candidate.properties ?? {});
    if (originalProps !== candidateProps && !allowedFields.includes('properties')) {
      changes.push({ kind: 'node-field', id: original.id, field: 'properties', before: original.properties, after: candidate.properties });
    }
  }

  // --- Edges: grouped by (source, target) pair, never matched by (unstable)
  // ID. Coral legally allows parallel edges between the same two nodes
  // (e.g. `a -> b [label: "reads"]` and `a -> b [label: "writes"]`), so a
  // single-edge-per-pair Map silently dropped all but the last edge in a
  // group -- fixed after independent code review found this by direct
  // execution. Each group is diffed as a multiset: edges whose label
  // matches exactly between original and candidate are removed from
  // consideration first (they didn't change), and only the genuine leftover
  // is paired up as relabeled/removed/added -- diffing by a global sort on
  // label would spuriously pair two edges that never changed just because
  // sorting shuffled their relative order (caught by this fix's own
  // regression test).
  const groupByPair = (edges: GraphEdge[]): Map<string, GraphEdge[]> => {
    const groups = new Map<string, GraphEdge[]>();
    for (const edge of edges) {
      const key = pairKey(edge);
      const group = groups.get(key);
      if (group) group.push(edge);
      else groups.set(key, [edge]);
    }
    return groups;
  };

  const byLabel = (edge: GraphEdge): string => edge.label ?? '';

  /** Remove one-for-one exact-label matches, leaving only genuinely differing edges. */
  const subtractMatchedLabels = (
    original: GraphEdge[],
    candidate: GraphEdge[],
  ): { remainingOriginal: GraphEdge[]; remainingCandidate: GraphEdge[] } => {
    const remainingOriginal = [...original];
    const remainingCandidate = [...candidate];
    for (let i = remainingOriginal.length - 1; i >= 0; i--) {
      const label = byLabel(remainingOriginal[i]);
      const matchIndex = remainingCandidate.findIndex((edge) => byLabel(edge) === label);
      if (matchIndex !== -1) {
        remainingOriginal.splice(i, 1);
        remainingCandidate.splice(matchIndex, 1);
      }
    }
    return { remainingOriginal, remainingCandidate };
  };

  const originalGroups = groupByPair(originalEdges);
  const candidateGroups = groupByPair(candidateEdges);
  const allPairKeys = new Set([...originalGroups.keys(), ...candidateGroups.keys()]);

  for (const key of allPairKeys) {
    const originalGroup = originalGroups.get(key) ?? [];
    const candidateGroup = candidateGroups.get(key) ?? [];
    const { remainingOriginal, remainingCandidate } = subtractMatchedLabels(originalGroup, candidateGroup);
    const relabeledCount = Math.min(remainingOriginal.length, remainingCandidate.length);

    for (let i = 0; i < relabeledCount; i++) {
      if (expectedChangedEdgeIds.has(remainingOriginal[i].id)) continue;
      changes.push({
        kind: 'edge-label',
        id: key,
        field: 'label',
        before: remainingOriginal[i].label,
        after: remainingCandidate[i].label,
      });
    }
    const permittedRemovals = expectedRemovedEdgePairs.filter((pair) => pair === key).length;
    for (let i = relabeledCount + permittedRemovals; i < remainingOriginal.length; i++) {
      if (expectedChangedEdgeIds.has(remainingOriginal[i].id)) continue;
      changes.push({ kind: 'edge-removed', id: key, before: remainingOriginal[i], after: undefined });
    }
    const permittedAdditions = expectedNewEdgePairs.filter((pair) => pair === key).length;
    for (let i = relabeledCount + permittedAdditions; i < remainingCandidate.length; i++) {
      changes.push({ kind: 'edge-added', id: key, before: undefined, after: remainingCandidate[i] });
    }
  }

  return changes;
}

/**
 * Score one generation result against its fixture. Calls the existing
 * `validateOutput`, `checkStructuralDrift`, and `lintAgainstNotation`, plus a
 * direct parse of `result.dsl` for the full node/edge objects unintended-
 * change diffing needs -- it never reimplements what those functions do.
 *
 * `provider`/`model`/`samplingProfile` are not derivable from `fixture` or
 * `result` (neither carries them); this function leaves them as empty-string
 * placeholders for the harness's run-matrix loop (out of scope here) to fill
 * in from the config/profile it already has, the same way `semanticJudgment`
 * is left unpopulated for a separate call site to add.
 */
export function scoreResult(fixture: LoadedFixture, result: GenerateResult): AccuracyScore {
  const format = fixture.meta.outputFormat;
  const dsl = result.dsl ?? '';

  const validation = validateFixtureOutput(dsl, format);

  const driftPct =
    fixture.originalNodeIds.length === 0
      ? null
      : checkStructuralDrift(fixture.originalNodeIds, validation.nodeIds).lossPercentage;

  const parsedCandidate = dsl.trim() ? parseByFormat(dsl, format) : { nodes: [], edges: [], errors: [] };

  let lintErrorCount = 0;
  let lintWarningCount = 0;
  if (fixture.meta.notationId) {
    const lintResults = lintAgainstNotation(parsedCandidate.nodes, parsedCandidate.edges, fixture.meta.notationId);
    lintErrorCount = lintResults.filter((lintResult) => lintResult.severity === 'error').length;
    lintWarningCount = lintResults.filter((lintResult) => lintResult.severity === 'warning').length;
  }

  const contentCheckPassed =
    fixture.meta.expectedSubstrings === undefined
      ? null
      : fixture.meta.expectedSubstrings.every((substring) => dsl.includes(substring));

  const unintendedChanges =
    fixture.originalNodeIds.length === 0
      ? []
      : diffUnintendedChanges(
          fixture.originalNodes,
          fixture.originalEdges,
          parsedCandidate.nodes,
          parsedCandidate.edges,
          new Set(fixture.meta.expectedChangedNodeIds ?? []),
          new Set(fixture.meta.expectedChangedEdgeIds ?? []),
          (fixture.meta.expectedNewEdges ?? []).map(pairKey),
          (fixture.meta.expectedRemovedEdges ?? []).map(pairKey),
          fixture.meta.expectedChangedNodeFields,
        );

  const requiresManualReview = fixture.meta.requiresManualReview === true
    || fixture.meta.caseType === 'ambiguous'
    || fixture.meta.caseType === 'injected-mistake';

  return {
    caseId: fixture.meta.caseId,
    provider: '' as LLMProviderId,
    model: '',
    samplingProfile: '',
    valid: validation.valid,
    driftPct,
    lintErrorCount,
    lintWarningCount,
    contentCheckPassed,
    unintendedChangeCount: unintendedChanges.length,
    unintendedChanges,
    requiresManualReview,
    retries: result.retries,
    succeeded: result.success,
  };
}
