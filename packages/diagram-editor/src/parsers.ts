import {
  type GraphNode as CanonicalGraphNode,
  type GraphEdge as CanonicalGraphEdge,
  type GraphIR as CanonicalGraphIR,
  type Position,
  type Diagnostic,
} from '@coral-viz/language';
import {
  assessInstalledSuccessorSourceIntegrity028,
  parseInstalledDocument028,
  installedWrittenPortReferenceRanges028,
  projectInstalledSourceToSuccessor028,
  assessSuccessorSourcePortReferences028,
  assessSuccessorSourcePortLimits029,
  userSymbolNotices029,
  successorSourceDisplay028,
  successorDisplayFailureDiagnostic028,
  successorSourceDisplayWithSemanticPorts028,
  sourcePortDeclarationDiagnostics028,
  sourceNodeCatalogChoiceDiagnostics028,
  sourceSemanticCapabilityNotices028,
  sourceLayoutCapabilityNotices028,
  resolveSuccessorGraphNodes028,
  sequenceSourcePortCapabilityDiagnostics028,
  sequenceFragmentDisplayDiagnostics028,
  type SuccessorSourceGraph028,
  type SpatialSidecar028,
  type NodeInterpretation028,
} from '@coral-viz/render';
import { editionAdmits0217, editionAdmitsUserSymbols029, type CandidateFragmentSyntax, type CandidateNodeSyntax,
  type CandidatePortSyntax } from '@coral-viz/language';

function spatialSidecar028(graph: CanonicalGraphIR): SpatialSidecar028 {
  const paired = graph as CanonicalGraphIR & SpatialSidecar028;
  return {
    ...(paired.spatialConstraints028 ? { spatialConstraints028: paired.spatialConstraints028 } : {}),
    ...(paired.routeIntents028 ? { routeIntents028: paired.routeIntents028 } : {}),
    ...(paired.layoutOptions028 ? { layoutOptions028: paired.layoutOptions028 } : {}),
  };
}

/**
 * DSL Parsers for diagram-editor
 *
 * Self-contained parsers for Coral DSL and Mermaid flowchart syntax.
 * These are simplified implementations for demo purposes.
 */

export type GraphNode = Omit<CanonicalGraphNode, 'label' | 'children'> & {
  label: string;
  /** Parent identity retained while nested GraphIR is flattened for React Flow. */
  parent?: string;
};

export type GraphEdge = CanonicalGraphEdge & {
  /** Compatibility spelling used by the editor's existing styling helpers. */
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  /** Transient resolved route projection; never emitted as authored GraphIR. */
  routingPoints?: Position[];
};

export interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  errors: EditorParseError[];
  /** Complete channel; errors remains the error-only compatibility view. */
  diagnostics?: EditorParseError[];
  /** Source-owned 0.2.8 meaning; never print the read-only canvas graph in its place. */
  sourceGraph?: SuccessorSourceGraph028;
  /** Typed U1 meaning paired with accepted source, even if its scene is unavailable. */
  semanticInterpretations?: ReadonlyMap<string, NodeInterpretation028>;
  /** Effective source edition; edition 0.2.9 enables user symbols and connection-limit checks. */
  coralVersion?: string;
  /** Graph-level fields retained while the editor uses flattened nodes. */
  envelope?: SpatialSidecar028 & Pick<CanonicalGraphIR, 'version' | 'id'> &
    Partial<Pick<CanonicalGraphIR, 'name' | 'metadata' | 'layoutOptions' | 'constraints' | 'profile' | 'interaction'>>;
}

export interface EditorParseError extends Partial<Omit<Diagnostic, 'message'>> {
  line?: number;
  column?: number;
  offset?: number;
  code?: string;
  message: string;
  severity?: 'error' | 'warning' | 'info';
  range?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
}

/** Preserve metadata without inventing a source location for print losses. */
export function editorDiagnostic(diagnostic: Diagnostic): EditorParseError {
  return { ...diagnostic, ...(diagnostic.position ? { ...diagnostic.position } : {}) };
}

/**
 * All known node types accepted by the Coral DSL parser.
 * Includes base types and notation-specific types derived from notationSemantics typeSymbols mappings.
 */
export const KNOWN_NODE_TYPES: ReadonlySet<string> = new Set([
  // Base types (work in all notations)
  'service', 'database', 'module', 'external_api', 'actor', 'group',
  // UML sequence
  'participant',
  'queue', 'load_balancer', 'cdn', 'storage', 'document', 'relationship', 'subprocess', 'event',
  // Flowchart
  'process', 'decision', 'terminal', 'block',
  // Canonical BPMN flow objects
  'startEvent', 'endEvent', 'task', 'exclusiveGateway', 'parallelGateway',
  // Code
  'function', 'method', 'class', 'interface', 'enum', 'external_module',
  'type_alias', 'variable', 'constant', 'property', 'struct', 'namespace',
  // AI/ML
  'model', 'llm', 'dataset', 'vector_store', 'embedding', 'training',
  'inference', 'feature_store', 'gpu', 'agent', 'prompt', 'guardrail',
  'evaluator', 'retriever', 'memory', 'tool',
  // Data Engineering
  'source', 'sink', 'transform', 'lake', 'warehouse', 'stream',
  'batch', 'quality', 'schema', 'catalog', 'cdc', 'dashboard', 'pipeline',
  // Sketch
  'step', 'label', 'box', 'circle', 'cloud',
  // UML State (0.2.17)
  'initial', 'state', 'final', 'choice', 'fork', 'join', 'composite', 'note',
]);

/**
 * Parse installed 0.2.8 Coral source. A missing or retired header keeps the
 * author's text editable while withholding semantic meaning.
 */
export function parseCoralDSL(text: string): ParseResult {
  const installed = parseInstalledDocument028(text);
  // The read-only GraphIR 3 canvas is a display of source-owned successor
  // meaning, never the authored model or a source-printing authority.
  let successorDisplay: CanonicalGraphIR | undefined;
  let sourceGraph: SuccessorSourceGraph028 | undefined;
  let semanticInterpretations: ReadonlyMap<string, NodeInterpretation028> | undefined;
  const projectionDiagnostics: Diagnostic[] = [];
  if (installed && installed.header.diagnostics.length === 0 &&
    !installed.syntax.diagnostics.some((item) => item.severity === 'error')) {
    const projected = projectInstalledSourceToSuccessor028(text);
    // The successor interpretation is independent of whether the current
    // scene can display a sequence fragment or semantic lifeline port.
    if (projected.graph?.interaction)
      semanticInterpretations = resolveSuccessorGraphNodes028(projected.graph);
    if (projected.graph?.profile.id === 'uml-state' && !editionAdmits0217(installed.header.effectiveCoralVersion ?? '0.2.8')) {
      // The source edition and its U1 meaning remain available for source
      // editing/export even though this consumer cannot publish a canvas.
      sourceGraph = projected.graph;
      semanticInterpretations = resolveSuccessorGraphNodes028(projected.graph);
      const range = installed.header.diagramTypeRange;
      projectionDiagnostics.push({
        severity: 'error', code: 'render.capability.character-only-edition',
        message: 'UML state supports source and character output; SVG and visual editor display are unavailable.',
        ...(range ? { range, position: range.start } : {}),
      });
    }
    projectionDiagnostics.push(...projected.diagnostics.map((item) => ({
      code: item.code, message: item.message, severity: 'error' as const,
      ...(item.range ? { range: item.range, position: item.range.start } : {}),
    })));
    if (projected.graph) projectionDiagnostics.push(...sourceSemanticCapabilityNotices028(
      projected.graph,
      installed.syntax.statements.filter((item): item is CandidateNodeSyntax => item.kind === 'node'),
      installed.syntax.statements.filter((item) => item.kind === 'edge')).map((item): Diagnostic => ({
      ...item, ...(item.range ? { position: item.range.start } : {}),
    })));
    if (projected.graph) projectionDiagnostics.push(...userSymbolNotices029(installed, projected.graph)
      .map((item): Diagnostic => ({ ...item, position: item.range.start })));
    if (projected.graph) projectionDiagnostics.push(...sourceLayoutCapabilityNotices028(
      projected.graph, installed.syntax.statements.filter((item) => item.kind === 'edge'))
      .map((item): Diagnostic => ({ ...item,
        ...(item.range ? { position: item.range.start } : {}),
      })));
    if (projected.graph?.interaction) projectionDiagnostics.push(...
      sequenceSourcePortCapabilityDiagnostics028(installed.syntax.statements.filter(
        (item): item is CandidatePortSyntax => item.kind === 'port')).map((item): Diagnostic => ({
        severity: 'error', code: item.code, message: item.message, subject: item.subject,
        ...(item.range ? { position: item.range.start, range: item.range } : {}),
      })));
    if (projected.graph?.interaction) projectionDiagnostics.push(...
      sequenceFragmentDisplayDiagnostics028(installed.syntax.statements.filter(
        (item): item is CandidateFragmentSyntax => item.kind === 'fragment'),
      projected.graph).map((item): Diagnostic => ({
        severity: 'error', code: item.code, message: item.message,
        position: item.range.start, range: item.range,
      })));
    if (projected.graph?.interaction && semanticInterpretations) {
      // Sequence integrity is source-owned even when a flat scene can draw.
      projectionDiagnostics.push(...assessInstalledSuccessorSourceIntegrity028(
        installed, projected.graph, semanticInterpretations).map((item): Diagnostic => ({
        severity: 'error', code: item.code, message: item.message,
        ...(item.subject ? { subject: item.subject } : {}),
        ...(item.range ? { position: item.range.start, range: item.range } : {}),
      })));
    }
    // These diagnostics describe only the scene. Keep the exact
    // successor model available for source-owned export while the display
    // remains empty and its capability finding remains visible.
    if (projected.graph && projectionDiagnostics.length > 0 &&
      projectionDiagnostics.filter((item) => item.severity === 'error').every((item) => item.code === 'render.capability.sequence-semantic-port' ||
        item.code === 'render.capability.sequence-fragment')) sourceGraph = projected.graph;
    if (projected.graph && !projectionDiagnostics.some((item) => item.severity === 'error')) {
      try {
        if (projected.graph.interaction) {
          successorDisplay = successorSourceDisplay028(projected.graph);
          projectionDiagnostics.push(...sourceNodeCatalogChoiceDiagnostics028(
            installed.syntax.statements.filter((item): item is CandidateNodeSyntax => item.kind === 'node'),
            semanticInterpretations!).map((item): Diagnostic => ({
              severity: 'error', code: item.code, message: item.message, subject: item.subject,
              ...(item.range ? { position: item.range.start, range: item.range } : {}),
            })));
        }
        else {
          const paired = successorSourceDisplayWithSemanticPorts028(projected.graph);
          successorDisplay = paired.display;
          semanticInterpretations = paired.semanticInterpretations;
          projectionDiagnostics.push(...sourcePortDeclarationDiagnostics028(
            installed.syntax.statements.filter((item): item is CandidatePortSyntax => item.kind === 'port'),
            paired.semanticInterpretations).map((item): Diagnostic => ({
              severity: 'error', code: item.code, message: item.message, subject: item.subject,
              ...(item.range ? { position: item.range.start, range: item.range } : {}),
            })));
          projectionDiagnostics.push(...sourceNodeCatalogChoiceDiagnostics028(
            installed.syntax.statements.filter((item): item is CandidateNodeSyntax => item.kind === 'node'),
            paired.semanticInterpretations).map((item): Diagnostic => ({
              severity: 'error', code: item.code, message: item.message, subject: item.subject,
              ...(item.range ? { position: item.range.start, range: item.range } : {}),
            })));
          const checked = assessSuccessorSourcePortReferences028(projected.graph,
            installedWrittenPortReferenceRanges028(installed), paired.semanticInterpretations);
          projectionDiagnostics.push(...checked.assessments.flatMap(({ assessment }) =>
            assessment.diagnostics.map((item): Diagnostic => ({ severity: 'error', code: item.code,
              message: item.message, subject: { kind: 'edge', id: item.edgeId },
              ...(item.range ? { position: item.range.start, range: item.range } : {}),
            }))));
          // Connection limits are read diagnostics only in edition 0.2.9 documents.
          const edition = installed.header.effectiveCoralVersion;
          if (edition !== undefined && editionAdmitsUserSymbols029(edition))
            projectionDiagnostics.push(...assessSuccessorSourcePortLimits029(projected.graph,
              paired.semanticInterpretations, installedWrittenPortReferenceRanges028(installed))
              .map((item): Diagnostic => ({ severity: 'error', code: item.code, message: item.message,
                subject: { kind: 'node', id: item.nodeId },
                ...(item.range ? { position: item.range.start, range: item.range } : {}),
                ...(item.related ? { related: item.related.map((location) => ({ message: location.message,
                  position: location.range.start, range: location.range })) } : {}),
              })));
        }
        sourceGraph = projected.graph;
      }
      catch (cause) {
        sourceGraph = projected.graph;
        projectionDiagnostics.push(successorDisplayFailureDiagnostic028(cause,
          projected.graph, installed, 'coral.editor.source.display.unsupported'));
      }
    } else if (!projected.graph && projectionDiagnostics.length === 0) {
      projectionDiagnostics.push({ severity: 'error', code: 'coral.editor.source.projection.unsupported',
        message: 'The saved Coral source cannot be projected without loss',
      });
    }
  }
  const result = { graph: successorDisplay,
    diagnostics: [...installed.syntax.diagnostics, ...projectionDiagnostics] };
  const headerDiagnostics: EditorParseError[] = installed.header.diagnostics.map((item) => ({
    severity: 'error', code: item.code, message: item.message,
    line: item.range.start.line, column: item.range.start.column,
    offset: item.range.start.offset,
    range: item.range,
    ...(item.related ? { related: item.related.map((location) => ({
      message: location.message, position: location.range.start, range: location.range,
    })) } : {}),
  }));
  const flatten = (node: CanonicalGraphNode, parentId?: string): GraphNode[] => {
    const { children, sourceInfo, ...rest } = node;
    const current = { ...rest, label: node.label ?? node.id, ...(parentId ? { parent: parentId } : {}) } as GraphNode;
    if (sourceInfo) Object.defineProperty(current, 'sourceInfo', { value: sourceInfo, enumerable: false });
    return [
      current,
      ...(children ?? []).flatMap((child) => flatten(child, node.id)),
    ];
  };
  const diagnostics: EditorParseError[] = [
    ...headerDiagnostics, ...result.diagnostics.map(editorDiagnostic),
  ].sort((left, right) => (left.range?.start.offset ?? left.offset ?? Number.MAX_SAFE_INTEGER) -
    (right.range?.start.offset ?? right.offset ?? Number.MAX_SAFE_INTEGER));
  return {
    ...(installed.header.effectiveCoralVersion ? { coralVersion: installed.header.effectiveCoralVersion } : {}),
    ...(sourceGraph ? { sourceGraph } : {}),
    ...(sourceGraph && semanticInterpretations ? { semanticInterpretations } : {}),
    ...(result.graph ? { envelope: {
      version: result.graph.version,
      id: result.graph.id,
      ...(result.graph.name !== undefined ? { name: result.graph.name } : {}),
      ...(result.graph.metadata !== undefined ? { metadata: result.graph.metadata } : {}),
      ...(result.graph.layoutOptions !== undefined ? { layoutOptions: result.graph.layoutOptions } : {}),
      ...(result.graph.constraints !== undefined ? { constraints: result.graph.constraints } : {}),
      ...(result.graph.profile !== undefined ? { profile: result.graph.profile } : {}),
      ...(result.graph.interaction !== undefined ? { interaction: result.graph.interaction } : {}),
      ...spatialSidecar028(result.graph),
    } } : {}),
    nodes: (result.graph?.nodes ?? []).flatMap((node) => flatten(node)),
    edges: (result.graph?.edges ?? []).map((edge) => {
      const { sourceInfo, ...rest } = edge;
      const routingPoints = edge.routeIntent?.waypoints.flatMap((waypoint) =>
        waypoint.placement.kind === 'absolute' ? [waypoint.placement.position] : []);
      const current = {
        ...rest,
        lineStyle: edge.style?.lineStyle,
        ...(routingPoints?.length ? { routingPoints } : {}),
      } as GraphEdge;
      if (sourceInfo) Object.defineProperty(current, 'sourceInfo', { value: sourceInfo, enumerable: false });
      return current;
    }),
    diagnostics,
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === undefined || diagnostic.severity === 'error'),
  };
}

/**
 * Map Mermaid edge connector syntax to lineStyle.
 * Returns undefined for solid (the default).
 */
function mermaidConnectorToLineStyle(connector: string): GraphEdge['lineStyle'] | undefined {
  // -.-> or .-.-> = dashed
  if (connector.includes('.')) return 'dashed';
  // -->, --->, --- = solid (default)
  return undefined;
}

/**
 * Parse Mermaid flowchart DSL
 *
 * Supports:
 * - Flowchart declaration: `flowchart TD` or `graph TD`
 * - Node shapes: `A[rect]`, `A{diamond}`, `A(rounded)`
 * - Edges: `A --> B`, `A -->|label| B`, `A -.-> B` (dashed)
 * - Comments: `%% comment`
 */
export function parseMermaidDSL(text: string): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  const nodeMap = new Map<string, GraphNode>();
  const shapeMap = new Map<string, string>();

  const lines = text.split('\n');

  // Helper to add node if not exists
  function ensureNode(id: string, label?: string, shape?: string): void {
    if (!nodeMap.has(id)) {
      let type = 'process';
      if (shape === '{' || shape === '}') type = 'decision';
      if (shape === 'database') type = 'database';

      // Track diamond shapes for port mapping
      if (shape === '{') shapeMap.set(id, 'diamond');

      const node: GraphNode = { id, type, label: label || id };
      nodeMap.set(id, node);
      nodes.push(node);
    } else if (label) {
      const node = nodeMap.get(id)!;
      node.label = label;
      if (shape === '{' || shape === '}') {
        node.type = 'decision';
        shapeMap.set(id, 'diamond');
      } else if (shape === '[' || shape === '(') {
        node.type = 'process';
        shapeMap.delete(id);
      } else if (shape === 'database') {
        node.type = 'database';
        shapeMap.delete(id);
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines, comments, and flowchart declaration
    if (!line || line.startsWith('%%') || line.match(/^flowchart\s+(TD|TB|BT|LR|RL)/i)) continue;
    if (line.match(/^graph\s+(TD|TB|BT|LR|RL)/i)) continue;

    // Parse edge with nodes: A[Label] --> B[Label]
    // Supports: -->, --->, --, -.->
    const edgePattern = /^(\w+)(?:\[([^\]]+)\]|\{([^\}]+)\}|\(([^\)]+)\))?\s*(-->|---->|---|-\.->|\.-\.->)\s*(?:\|([^|]+)\|)?\s*(\w+)(?:\[([^\]]+)\]|\{([^\}]+)\}|\(([^\)]+)\))?$/;
    const edgeMatch = line.match(edgePattern);

    if (edgeMatch) {
      const [, sourceId, sourceLabel1, sourceLabel2, sourceLabel3, connector, edgeLabel, targetId, targetLabel1, targetLabel2, targetLabel3] = edgeMatch;
      const sourceLabel = sourceLabel1 || sourceLabel2 || sourceLabel3;
      const targetLabel = targetLabel1 || targetLabel2 || targetLabel3;

      // Determine shape for type inference
      const sourceShape = sourceLabel1 ? '[' : sourceLabel2 ? '{' : sourceLabel3 ? '(' : '[';
      const targetShape = targetLabel1 ? '[' : targetLabel2 ? '{' : targetLabel3 ? '(' : '[';

      ensureNode(sourceId, sourceLabel, sourceShape);
      ensureNode(targetId, targetLabel, targetShape);

      // Map Mermaid connector syntax to lineStyle
      const lineStyle = mermaidConnectorToLineStyle(connector);

      const edge: GraphEdge = {
        id: `e_${edges.length}`,
        source: sourceId,
        target: targetId,
        label: edgeLabel,
      };
      if (lineStyle) edge.lineStyle = lineStyle;

      edges.push(edge);
      continue;
    }

    // Parse standalone node definition: A[Label]
    const nodePattern = /^(\w+)(?:\[\(([^\)]*)\)\]|\[([^\]]+)\]|\{([^\}]+)\}|\(([^\)]+)\))$/;
    const nodeMatch = line.match(nodePattern);
    if (nodeMatch) {
      const [, id, databaseLabel, label1, label2, label3] = nodeMatch;
      const label = databaseLabel || label1 || label2 || label3;
      const shape = databaseLabel !== undefined ? 'database' : label1 ? '[' : label2 ? '{' : label3 ? '(' : '[';
      ensureNode(id, label, shape);
      continue;
    }

    // These valid Mermaid constructs are outside the editor's deliberately
    // small flowchart projection. Blocking them preserves their exact source
    // in a draft instead of silently dropping grouping or styling on save.
    if (line.match(/^(subgraph|end|style|classDef|class)\b/i)) {
      errors.push({ line: i + 1, message: `Unsupported Mermaid syntax: ${line}` });
      continue;
    }

    // Do not silently drop source that this intentionally small Mermaid
    // flowchart parser cannot represent. The editor's source-draft save uses
    // this error to preserve the exact text instead of publishing a partial
    // graph over it.
    errors.push({ line: i + 1, message: `Unrecognized Mermaid line: ${line}` });
  }

  return { nodes, edges, errors };
}

/**
 * A correction applied by {@link repairKnownNodeTypeTypos} to a single node
 * declaration whose type keyword was a near-miss (misspelling) or a
 * case-variant of an entry in {@link KNOWN_NODE_TYPES}.
 */
export interface KnownTypeFix {
  originalType: string;
  correctedType: string;
  nodeLabel: string;
  location: { line: number };
}

export interface KnownTypeRepairResult {
  /** The full DSL text with corrected type keywords. */
  fixed: string;
  appliedFixes: KnownTypeFix[];
  /** Node labels whose declared type couldn't be confidently corrected. */
  unresolved: string[];
}

/**
 * Node declaration recognition for `repairKnownNodeTypeTypos`, approximating
 * the shape `@coral-viz/language`'s own node-declaration regex recognizes
 * (`parseNodeDeclaration` in packages/language/src/parser/index.ts) closely
 * enough to find a declaration's leading type keyword and quoted label:
 * `<word> "<label>"`, optionally followed by `as`, position, `pinned`,
 * `data`, or `{`/`{}` — none of which need to be parsed here since only the
 * type keyword is ever rewritten, and everything after the label is carried
 * through unchanged.
 */
const NODE_DECLARATION_LINE = /^(\s*)([A-Za-z_][\w-]*)(\s+)"((?:[^"\\]|\\.)*)"/;

/**
 * Largest edit distance at which a misspelled type keyword is still treated
 * as a confident correction, for a string long enough that two edits are
 * still a small fraction of it (e.g. "servics" -> "service", 1 edit over 7
 * characters). This absolute cap is combined with a length-relative cap in
 * `findKnownTypeCorrection` — fixed after independent code review found the
 * absolute-only version corrected a plausible short type name into an
 * unrelated one (`levenshteinDistance('api', 'gpu') === 2`, so `repairKnownNodeTypeTypos`
 * silently rewrote `api "External API"` to `gpu "External API"`). A type
 * that shares little more than a letter or two with any KNOWN_NODE_TYPES
 * entry (e.g. "whatchamacallit") is left unresolved rather than guessed at.
 */
const TYPO_EDIT_DISTANCE_THRESHOLD = 2;

/**
 * A correction is only confident when the edit distance is small relative to
 * the declared type's own length — two edits on a 3-letter word changes most
 * of it, while two edits on a 7-letter word barely touches it. `Math.floor(n / 3)`
 * gives 0 for length ≤ 2 (no correction without an exact match), 1 for length
 * 3-5, 2 for length 6+, capped by `TYPO_EDIT_DISTANCE_THRESHOLD`.
 */
function relativeEditDistanceThreshold(length: number): number {
  return Math.min(TYPO_EDIT_DISTANCE_THRESHOLD, Math.floor(length / 3));
}

/**
 * Levenshtein edit distance between two strings, computed with the standard
 * single-row dynamic-programming recurrence (no external dependency).
 */
function levenshteinDistance(a: string, b: string): number {
  const width = b.length;
  const row = Array.from({ length: width + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= width; j++) {
      const previous = row[j];
      row[j] = a[i - 1] === b[j - 1]
        ? diagonal
        : 1 + Math.min(diagonal, row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  return row[width];
}

/**
 * Finds the correction for a declared node type that is not itself in
 * KNOWN_NODE_TYPES. An exact case-insensitive match (`keyword-case-mutation`,
 * e.g. "Service" for "service") takes priority over the closest
 * edit-distance match (`misspelled-keyword`, e.g. "servics" for "service").
 * Returns undefined when neither is a confident correction: the distance
 * exceeds the length-relative threshold, or two known types are tied for
 * closest (an ambiguous correction is not a confident one either).
 */
function findKnownTypeCorrection(declaredType: string): string | undefined {
  const lowerDeclared = declaredType.toLowerCase();
  for (const known of KNOWN_NODE_TYPES) {
    if (known.toLowerCase() === lowerDeclared) return known;
  }

  let bestMatch: string | undefined;
  let bestDistance = Infinity;
  let bestIsUnique = true;
  for (const known of KNOWN_NODE_TYPES) {
    const distance = levenshteinDistance(lowerDeclared, known.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = known;
      bestIsUnique = true;
    } else if (distance === bestDistance) {
      bestIsUnique = false;
    }
  }
  if (!bestIsUnique) return undefined;
  const threshold = relativeEditDistanceThreshold(lowerDeclared.length);
  return bestDistance <= threshold ? bestMatch : undefined;
}

/**
 * Repairs `misspelled-keyword` and `keyword-case-mutation` node-type
 * defects: a declared node type that's a near-miss or case-variant of a
 * KNOWN_NODE_TYPES entry (e.g. `servics "API"` -> `service "API"`, or
 * `Service "API"` -> `service "API"`).
 *
 * This lives here rather than in `@coral-viz/language`'s `repairCoralDsl`
 * because KNOWN_NODE_TYPES is a diagram-editor-only concept: the canonical
 * parser never validates node-type strings against any vocabulary, so a
 * repair function for it can't live in `@coral-viz/language` without
 * inverting the real workspace dependency direction (`diagram-editor`
 * depends on `language`, never the reverse). See
 * dev/designs/coral-defect-corpus.md, Step 5/Step 6.
 */
export function repairKnownNodeTypeTypos(source: string): KnownTypeRepairResult {
  const appliedFixes: KnownTypeFix[] = [];
  const unresolved: string[] = [];

  const fixedLines = source.split('\n').map((line, index) => {
    const match = NODE_DECLARATION_LINE.exec(line);
    if (!match) return line;

    const [fullMatch, leading, declaredType, gap, label] = match;
    if (KNOWN_NODE_TYPES.has(declaredType)) return line;

    const correctedType = findKnownTypeCorrection(declaredType);
    if (correctedType === undefined) {
      unresolved.push(label);
      return line;
    }

    appliedFixes.push({
      originalType: declaredType,
      correctedType,
      nodeLabel: label,
      location: { line: index + 1 },
    });
    return `${leading}${correctedType}${gap}"${label}"${line.slice(fullMatch.length)}`;
  });

  return { fixed: fixedLines.join('\n'), appliedFixes, unresolved };
}
