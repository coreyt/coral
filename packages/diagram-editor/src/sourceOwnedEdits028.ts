import { editionAdmitsUserSymbols029, setCandidateLabel, type CandidateNodeSyntax } from '@coral-viz/language';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { assessSuccessorSourcePortLimits029, assessSuccessorSourcePortReferences028,
  printSourcePortLine029, verifyPortableSuccessorSource028,
  installedWrittenPortReferenceRanges028,
  parseInstalledDocument028, pinInstalledDocumentEdition029, printUserSymbolDefinition029,
  projectInstalledSourceToSuccessor028, resolveSuccessorGraphNodes028,
  graphIrExportRefusal029, successorCoreValidationInput029,
  type NodeInterpretation028, type SuccessorGraphIr029, type SuccessorSourceGraph028, type SuccessorSourceNode028,
  type SuccessorUserSymbol029 } from '@coral-viz/render';

/** Key-sorted JSON with undefined fields dropped: the projection equality every edit checks. */
export function canonicalJson(value: unknown): string {
  const sorted = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sorted);
    if (item && typeof item === 'object') return Object.fromEntries(
      Object.entries(item).filter(([, field]) => field !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, field]) => [key, sorted(field)]),
    );
    return item;
  };
  return JSON.stringify(sorted(value));
}

function hasLineCommentOutsideQuotes(source: string): boolean {
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '/' && source[index + 1] === '/') return true;
  }
  return false;
}

function findNode(nodes: SuccessorSourceNode028[], id: string): SuccessorSourceNode028 | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

function subtreeNodeIds(node: SuccessorSourceNode028): Set<string> {
  const ids = new Set<string>();
  const visit = (item: SuccessorSourceNode028): void => {
    ids.add(item.id);
    for (const child of item.children ?? []) visit(child);
  };
  visit(node);
  return ids;
}

function withoutNode(nodes: SuccessorSourceNode028[], id: string): SuccessorSourceNode028[] {
  return nodes.filter((node) => node.id !== id).map((node) => {
    if (!node.children) return node;
    const retained = { ...node };
    delete retained.children;
    const children = withoutNode(node.children, id);
    return children.length ? { ...retained, children } : retained;
  });
}

/** The first port-meaning finding the projection does not carry, as `code: message`. */
function portMeaningFinding028(
  source: string,
  graph: SuccessorSourceGraph028,
  interpretations: ReadonlyMap<string, NodeInterpretation028>,
): string | undefined {
  const node = [...interpretations.values()].flatMap((item) => item.diagnostics).find((diagnostic) =>
    diagnostic.code.startsWith('coral.port.') || diagnostic.code === 'coral.symbol.unknown' ||
    diagnostic.code === 'coral.variant.unknown');
  if (node) return `${node.code}: ${node.message}`;
  const reference = assessSuccessorSourcePortReferences028(graph,
    installedWrittenPortReferenceRanges028(parseInstalledDocument028(source)), interpretations)
    .assessments.flatMap(({ assessment }) => assessment.diagnostics)[0];
  return reference && `${reference.code}: ${reference.message}`;
}

function validPortMeaning028(
  source: string,
  graph: SuccessorSourceGraph028,
  interpretations: ReadonlyMap<string, NodeInterpretation028>,
): boolean {
  return portMeaningFinding028(source, graph, interpretations) === undefined;
}

/** Port meaning plus, in edition 0.2.9, connection limits (C3 edition-scoped read rule). */
export function portFinding029(source: string, graph: SuccessorSourceGraph028): string | undefined {
  const interpretations = resolveSuccessorGraphNodes028(graph);
  const meaning = portMeaningFinding028(source, graph, interpretations);
  if (meaning || !editionAdmitsUserSymbols029(parseInstalledDocument028(source).header.effectiveCoralVersion ?? ''))
    return meaning;
  const limit = assessSuccessorSourcePortLimits029(graph, interpretations)[0];
  return limit && `${limit.code}: ${limit.message}`;
}

/** Export only the exact source revision whose successor meaning was published. */
export function sourceOwnedGraphForExport028(
  source: string,
  acceptedSource: string | undefined,
  acceptedGraph: SuccessorSourceGraph028 | undefined,
): SuccessorGraphIr029 {
  if (source !== acceptedSource || !acceptedGraph) throw new Error(
    'coral.editor.source-export.stale: the current source has no accepted semantic projection',
  );
  const projected = projectInstalledSourceToSuccessor028(source);
  if (!projected.graph || projected.diagnostics.length ||
      canonicalJson(projected.graph) !== canonicalJson(acceptedGraph)) throw new Error(
    'coral.editor.source-export.invalid: the accepted graph no longer matches the current source',
  );
  const verified = verifyPortableSuccessorSource028(source);
  if (!verified.graph || verified.diagnostics.length) throw new Error(
    'coral.editor.source-export.invalid: the current source has integrity or capability errors',
  );
  const [refusal] = graphIrExportRefusal029(verified.graph, source);
  if (refusal) throw new Error(`${refusal.code}: ${refusal.message}`);
  const core = successorCoreValidationInput029(verified.graph, { limits: true });
  const model = validateGraphIRSuccessorWithCatalog(core.graph, core.snapshot, core.options);
  if (!model.valid || !model.verification.complete || model.verification.scope !== 'full') {
    const reasons = [...model.errors, ...model.warnings, ...model.verification.obligations]
      .map(({ code, path }) => `${code} at ${path}`).join('; ');
    throw new Error(`coral.editor.source-export.unverified: ${reasons ||
      'the installed GraphIR successor did not verify the portable model'}`);
  }
  return core.graph;
}

/** The existing source writer places coordinates after the label and label placement. */
function nodePositionInsertionOffset028(declaration: CandidateNodeSyntax): number {
  const placement = declaration.labelPlacement;
  return [declaration.nodeKind, declaration.label, declaration.bracketClose, placement?.side, placement?.offset]
    .filter((token) => token !== undefined)
    .reduce((end, token) => Math.max(end, token.range.end.offset), 0);
}

/** Move selected roots; displayed local coordinates admit a first authored position. */
export function editSourceOwnedNodePositions028(
  source: string, nodeIds: readonly string[], delta: { x: number; y: number },
  displayedPositions?: ReadonlyMap<string, { x: number; y: number }>,
): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length ||
    !validPortMeaning028(source, before.graph, resolveSuccessorGraphNodes028(before.graph))) throw new Error(
    'coral.editor.source-position.invalid: the current Coral source has no complete semantic projection',
  );
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) throw new Error(
    'coral.editor.source-position.invalid: movement must use finite coordinates',
  );
  const selected = new Set(nodeIds);
  const roots = [...selected].filter((id) => {
    const parts = id.split('.');
    return !parts.some((_, index) => index > 0 && selected.has(parts.slice(0, index).join('.')));
  });
  if (!roots.length || delta.x === 0 && delta.y === 0) return source;
  const declarations = parseInstalledDocument028(source).syntax.statements
    .filter((item) => item.kind === 'node');
  const expected = structuredClone(before.graph);
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  for (const id of roots) {
    const declaration = declarations.find((item) => item.qualifiedId === id);
    const node = findNode(expected.nodes, id);
    const origin = node?.position ?? displayedPositions?.get(id);
    if (!declaration || !node || !origin) throw new Error(
      `coral.editor.source-position.missing: node ${id} needs an authored @ (x, y) position`,
    );
    const position = { x: origin.x + delta.x, y: origin.y + delta.y };
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(
      'coral.editor.source-position.invalid: movement exceeds finite coordinates',
    );
    node.position = position;
    if (declaration.position) {
      for (const axis of ['x', 'y'] as const) {
        if (delta[axis] === 0) continue;
        const token = declaration.position[axis];
        replacements.push({ start: token.range.start.offset, end: token.range.end.offset,
          text: String(position[axis]) });
      }
    } else {
      const at = nodePositionInsertionOffset028(declaration);
      replacements.push({ start: at, end: at, text: ` @ (${position.x}, ${position.y})` });
    }
  }
  let edited = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    edited = edited.slice(0, replacement.start) + replacement.text + edited.slice(replacement.end);
  }
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length || canonicalJson(after.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-position.loss: the move changed meaning beyond the selected positions',
  );
  return edited;
}

/**
 * Set one node's authored local position. Existing `@ (x, y)` coordinates are
 * replaced; otherwise the canonical ` @ (x, y)` is inserted where the
 * successor writer prints it, after the label and label placement.
 */
export function setSourceOwnedNodePosition028(source: string, nodeId: string, position: { x: number; y: number }): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length ||
    !validPortMeaning028(source, before.graph, resolveSuccessorGraphNodes028(before.graph))) throw new Error(
    'coral.editor.source-position.invalid: the current Coral source has no complete semantic projection',
  );
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(
    'coral.editor.source-position.invalid: a position needs finite coordinates',
  );
  const node = findNode(before.graph.nodes, nodeId);
  const declaration = parseInstalledDocument028(source).syntax.statements.find((item) =>
    item.kind === 'node' && item.qualifiedId === nodeId);
  if (!node || !declaration || declaration.kind !== 'node') throw new Error(
    `coral.editor.source-position.missing: node ${nodeId} is not declared`);
  const authored = declaration.position;
  const at = nodePositionInsertionOffset028(declaration);
  // Existing coordinate tokens are replaced in place, so a pin and spacing stay.
  const edited = authored
    ? source.slice(0, authored.x.range.start.offset) + String(position.x) +
      source.slice(authored.x.range.end.offset, authored.y.range.start.offset) + String(position.y) +
      source.slice(authored.y.range.end.offset)
    : `${source.slice(0, at)} @ (${position.x}, ${position.y})${source.slice(at)}`;
  const after = projectInstalledSourceToSuccessor028(edited);
  const expected = structuredClone(before.graph);
  findNode(expected.nodes, nodeId)!.position = { x: position.x, y: position.y };
  if (!after.graph || after.diagnostics.length || canonicalJson(after.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-position.loss: the position changed meaning beyond this node',
  );
  return edited;
}

export interface SourceOwnedNodeLabelPlacement028 {
  side: string;
  offset: number;
}

/** Change only the approved placement fields of one explicit authored label. */
export function editSourceOwnedNodeLabelPlacement028(
  source: string, nodeId: string, placement: SourceOwnedNodeLabelPlacement028,
): string {
  const fail = (reason: string): never => { throw new Error(`coral.editor.source-label-placement.${reason}`); };
  if (!['above', 'below', 'left', 'right', 'center'].includes(placement.side) ||
    !Number.isFinite(placement.offset) || placement.offset < 0 ||
    placement.side === 'center' && placement.offset !== 0) fail('invalid');
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length ||
    !validPortMeaning028(source, before.graph, resolveSuccessorGraphNodes028(before.graph))) fail('invalid');
  const graph = before.graph!;
  const declaration = parseInstalledDocument028(source).syntax.statements.find(
    (item) => item.kind === 'node' && item.qualifiedId === nodeId);
  const node = findNode(graph.nodes, nodeId);
  if (!declaration || declaration.kind !== 'node' || !node) return fail('missing');
  if (!declaration.label?.value || node.classifier || graph.interaction) fail('unsupported');
  const prior = declaration.labelPlacement;
  if (prior?.side.value === placement.side && Number(prior.offset?.value ?? 0) === placement.offset) return source;
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const tokenEdit = (token: { range: { start: { offset: number }; end: { offset: number } } }, text: string) =>
    replacements.push({ start: token.range.start.offset, end: token.range.end.offset, text });
  if (prior) {
    if (prior.side.value !== placement.side) tokenEdit(prior.side, placement.side);
    if (prior.offset) {
      if (Number(prior.offset.value) !== placement.offset) tokenEdit(prior.offset, String(placement.offset));
    } else if (placement.offset !== 0) replacements.push({ start: prior.side.range.end.offset,
      end: prior.side.range.end.offset, text: ` offset ${placement.offset}` });
  } else {
    const end = declaration.label!.range.end.offset;
    replacements.push({ start: end, end, text: ` label ${placement.side} offset ${placement.offset}` });
  }
  let edited = source;
  for (const change of replacements.sort((left, right) => right.start - left.start))
    edited = edited.slice(0, change.start) + change.text + edited.slice(change.end);
  const expected = structuredClone(graph);
  findNode(expected.nodes, nodeId)!.labelPlacement = {
    side: placement.side as 'above' | 'below' | 'left' | 'right' | 'center',
    ...(prior?.offset || !prior || placement.offset !== 0 ? { offset: placement.offset } : {}),
  };
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length || canonicalJson(after.graph) !== canonicalJson(expected)) fail('loss');
  return edited;
}

/** Apply an inspector/inline label edit to authored 0.2.8 source, never its GraphIR 3 display. */
export function editSourceOwnedNodeLabel028(source: string, nodeId: string, label: string): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-label.invalid: the current Coral source has no complete semantic projection',
  );
  if (!validPortMeaning028(source, before.graph, resolveSuccessorGraphNodes028(before.graph))) throw new Error(
    'coral.editor.source-label.invalid: the current Coral source has unresolved symbol or port meaning',
  );
  const document = parseInstalledDocument028(source);
  const declaration = document.syntax.statements.find((item) => item.kind === 'node' && item.qualifiedId === nodeId);
  const authored = findNode(before.graph.nodes, nodeId);
  if (!declaration || declaration.kind !== 'node' || !authored) throw new Error(
    `coral.editor.source-label.missing: node ${nodeId} is not declared`);
  if (authored.label === label) return source;
  const edited = setCandidateLabel(source, declaration, label);
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length) throw new Error(
    'coral.editor.source-label.invalid: the edited Coral source did not parse',
  );
  const expected = structuredClone(before.graph);
  const expectedNode = findNode(expected.nodes, nodeId)!;
  expectedNode.label = label;
  // The UML-class candidate reader derives the classifier's displayed name
  // from this same authored node label. It is not an independent source edit.
  if (expectedNode.type === 'class' && expectedNode.classifier?.kind === 'class' &&
      expectedNode.classifier.name === (declaration.label?.value ?? declaration.id.value)) {
    expectedNode.classifier.name = label;
  }
  if (canonicalJson(after.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-label.loss: the edit changed meaning beyond this node label',
  );
  return edited;
}

/** Change one connector label in its authored source, without printing the display graph. */
export function editSourceOwnedEdgeLabel028(source: string, edgeId: string, label: string): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-edge-label.invalid: the current Coral source has no complete semantic projection',
  );
  if (!validPortMeaning028(source, before.graph, resolveSuccessorGraphNodes028(before.graph))) throw new Error(
    'coral.editor.source-edge-label.invalid: the current Coral source has unresolved symbol or port meaning',
  );
  const index = before.graph.edges.findIndex((edge) => edge.id === edgeId);
  const declaration = parseInstalledDocument028(source).syntax.statements
    .filter((item) => item.kind === 'edge')[index];
  if (index < 0 || !declaration || declaration.kind !== 'edge' ||
    declaration.id && (declaration.qualifiedId ?? declaration.id.value) !== edgeId) throw new Error(
    `coral.editor.source-edge-label.missing: connector ${edgeId} is not declared`,
  );
  const authored = before.graph.edges[index]!;
  if (authored.label === label || authored.label === undefined && label === '') return source;
  const edited = setCandidateLabel(source, declaration, label);
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length) throw new Error(
    'coral.editor.source-edge-label.invalid: the edited Coral source did not parse',
  );
  const expected = structuredClone(before.graph);
  expected.edges[index]!.label = label;
  if (canonicalJson(after.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-edge-label.loss: the edit changed meaning beyond this connector label',
  );
  return edited;
}

/** Remove the authored clause, distinct from deliberately setting an empty label. */
export function removeSourceOwnedEdgeLabel028(source: string, edgeId: string): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-edge-label.invalid: the current Coral source has no complete semantic projection',
  );
  if (!validPortMeaning028(source, before.graph, resolveSuccessorGraphNodes028(before.graph))) throw new Error(
    'coral.editor.source-edge-label.invalid: the current Coral source has unresolved symbol or port meaning',
  );
  const index = before.graph.edges.findIndex((edge) => edge.id === edgeId);
  const declaration = parseInstalledDocument028(source).syntax.statements
    .filter((item) => item.kind === 'edge')[index];
  if (index < 0 || !declaration || declaration.kind !== 'edge' ||
    declaration.id && (declaration.qualifiedId ?? declaration.id.value) !== edgeId) throw new Error(
    `coral.editor.source-edge-label.missing: connector ${edgeId} is not declared`,
  );
  const label = declaration.label;
  if (!label) return source;
  let start: number;
  let end = label.range.end.offset;
  if (declaration.labelOrigin === 'as') {
    const lineStart = source.lastIndexOf('\n', label.range.start.offset - 1) + 1;
    const prefix = source.slice(lineStart, label.range.start.offset);
    const clause = /[ \t]+as[ \t]+$/.exec(prefix);
    if (!clause) throw new Error('coral.editor.source-edge-label.invalid: malformed `as` clause');
    start = lineStart + clause.index;
  } else if (declaration.labelOrigin === 'keyed' && declaration.bracketClose) {
    const endpointEnd = (declaration.targetPort ?? declaration.target).range.end.offset;
    const open = source.indexOf('[', endpointEnd);
    const close = declaration.bracketClose.range;
    if (open < 0 || open >= close.start.offset) throw new Error(
      'coral.editor.source-edge-label.invalid: missing edge bracket',
    );
    const prefix = source.slice(open + 1, label.range.start.offset);
    const field = /(?:^|,)[ \t]*label[ \t]*:[ \t]*$/.exec(prefix);
    if (!field) throw new Error('coral.editor.source-edge-label.invalid: malformed keyed label');
    start = open + 1 + field.index;
    const following = /^[ \t]*,[ \t]*/.exec(source.slice(end, close.start.offset));
    if (!field[0].startsWith(',') && following) {
      end += following[0].length;
    } else if (!field[0].startsWith(',')) {
      // The label was the bracket's only field, so remove the empty bracket too.
      start = endpointEnd;
      end = close.end.offset;
    }
  } else throw new Error('coral.editor.source-edge-label.invalid: unknown label origin');
  const edited = source.slice(0, start) + source.slice(end);
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length) throw new Error(
    'coral.editor.source-edge-label.invalid: the edited Coral source did not parse',
  );
  const expected = structuredClone(before.graph);
  delete expected.edges[index]!.label;
  if (canonicalJson(after.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-edge-label.loss: the edit changed meaning beyond this connector label',
  );
  return edited;
}

/** Remove one node's authored `as` label clause; its ID-derived display returns. */
export function removeSourceOwnedNodeLabel028(source: string, nodeId: string): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length ||
    !validPortMeaning028(source, before.graph, resolveSuccessorGraphNodes028(before.graph))) throw new Error(
    'coral.editor.source-label.invalid: the current Coral source has no complete semantic projection',
  );
  const declaration = parseInstalledDocument028(source).syntax.statements.find((item) =>
    item.kind === 'node' && item.qualifiedId === nodeId);
  const node = findNode(before.graph.nodes, nodeId);
  if (!declaration || declaration.kind !== 'node' || !node) throw new Error(
    `coral.editor.source-label.missing: node ${nodeId} is not declared`);
  if (!declaration.label) return source;
  if (node.classifier) throw new Error('coral.editor.source-label.unsupported: a classifier name follows its label');
  const lineStart = source.lastIndexOf('\n', declaration.label.range.start.offset - 1) + 1;
  const clause = /[ \t]+as[ \t]+$/.exec(source.slice(lineStart, declaration.label.range.start.offset));
  if (!clause) throw new Error('coral.editor.source-label.invalid: malformed `as` clause');
  const edited = source.slice(0, lineStart + clause.index) + source.slice(declaration.label.range.end.offset);
  const after = projectInstalledSourceToSuccessor028(edited);
  const expected = structuredClone(before.graph);
  delete findNode(expected.nodes, nodeId)!.label;
  if (!after.graph || after.diagnostics.length || canonicalJson(after.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-label.loss: removing the label changed meaning beyond this node label',
  );
  return edited;
}

/** Delete complete connector lines only when all surviving source meaning is identical. */
/**
 * `renumberUnnamed` admits the one change a removal can make to surviving
 * meaning: later unnamed connectors take the generated `edge-N` IDs that
 * their new source order gives them.
 */
export function deleteSourceOwnedEdges028(source: string, edgeIds: readonly string[],
  options: { renumberUnnamed?: boolean } = {}): string {
  if (!edgeIds.length) return source;
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-delete.invalid: the current source has no supported graph projection',
  );
  const declarations = parseInstalledDocument028(source).syntax.statements
    .filter((item) => item.kind === 'edge');
  if (declarations.length !== before.graph.edges.length) throw new Error(
    'coral.editor.source-delete.invalid: connector declarations do not match their semantic projection',
  );
  const removed = new Set(edgeIds);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const edgeId of removed) {
    const index = before.graph.edges.findIndex((edge) => edge.id === edgeId);
    const declaration = declarations[index];
    if (index < 0 || !declaration || declaration.kind !== 'edge' ||
      declaration.id && (declaration.qualifiedId ?? declaration.id.value) !== edgeId) throw new Error(
      `coral.editor.source-delete.missing: connector ${edgeId} is not declared`,
    );
    const first = (declaration.id ?? declaration.source).range.start.offset;
    const lineStart = source.lastIndexOf('\n', first - 1) + 1;
    const lineEnd = source.indexOf('\n', first);
    const lineContentEnd = lineEnd < 0 ? source.length : lineEnd;
    const finalToken = [declaration.target, declaration.targetPort, declaration.bracketClose,
      declaration.firstEnd, declaration.secondEnd, declaration.edgeType, declaration.label]
      .filter((token) => token !== undefined)
      .reduce((end, token) => Math.max(end, token.range.end.offset), first);
    if (source.slice(lineStart, first).trim() ||
      source.slice(finalToken, lineContentEnd).trim()) throw new Error(
      'coral.editor.source-delete.comment: edit this connector in source to retain attached commentary',
    );
    ranges.push({ start: lineStart, end: lineEnd < 0 ? source.length : lineEnd + 1 });
  }
  let edited = source;
  for (const range of ranges.sort((left, right) => right.start - left.start)) {
    edited = edited.slice(0, range.start) + edited.slice(range.end);
  }
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length) throw new Error(
    'coral.editor.source-delete.invalid: the edited source did not parse',
  );
  const { edges: priorEdges, interaction: priorInteraction, ...priorRest } = before.graph;
  const { edges: nextEdges, interaction: nextInteraction, ...nextRest } = after.graph;
  const expectedInteraction = priorInteraction ? structuredClone(priorInteraction) : undefined;
  if (expectedInteraction) {
    const keep = (item: typeof expectedInteraction.items[number]): boolean =>
      item.kind !== 'message' || !removed.has(item.id);
    expectedInteraction.messages = expectedInteraction.messages.filter((message) => !removed.has(message.id));
    expectedInteraction.items = expectedInteraction.items.filter(keep);
    for (const fragment of expectedInteraction.fragments ?? []) {
      for (const operand of fragment.operands) operand.items = operand.items.filter(keep);
    }
  }
  let unnamed = 0;
  const survivingEdges = priorEdges.filter((edge) => !removed.has(edge.id)).map((edge) =>
    options.renumberUnnamed && !expectedInteraction && /^edge-\d+$/.test(edge.id) ? { ...edge, id: `edge-${++unnamed}` } : edge);
  if (canonicalJson(nextRest) !== canonicalJson(priorRest) ||
    canonicalJson(nextEdges) !== canonicalJson(survivingEdges) ||
    canonicalJson(nextInteraction) !== canonicalJson(expectedInteraction)) throw new Error(
    'coral.editor.source-delete.loss: deletion would change a surviving connector identity or meaning',
  );
  return edited;
}

/** Remove one leaf declaration and its owned body without changing surviving source. */
export function deleteSourceOwnedLeafNode028(source: string, nodeId: string): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-node-delete.invalid: the current source has no supported graph projection',
  );
  const node = findNode(before.graph.nodes, nodeId);
  const declaration = parseInstalledDocument028(source).syntax.statements.find((item) =>
    item.kind === 'node' && item.qualifiedId === nodeId);
  if (!node || !declaration || declaration.kind !== 'node') throw new Error(
    `coral.editor.source-node-delete.missing: node ${nodeId} is not declared`,
  );
  if (Boolean(declaration.blockOpen) !== Boolean(declaration.blockClose) || node.children?.length) throw new Error(
    'coral.editor.source-node-delete.nested: edit this node body or group in Coral source',
  );
  if (before.graph.edges.some((edge) => edge.first.node === nodeId || edge.second.node === nodeId)) throw new Error(
    'coral.editor.source-node-delete.connected: remove this node’s connections in Coral source first',
  );
  const first = declaration.id.range.start.offset;
  const lineStart = source.lastIndexOf('\n', first - 1) + 1;
  const last = declaration.blockClose?.range.end.offset ?? first;
  const lineEnd = source.indexOf('\n', last);
  const lineContentEnd = lineEnd < 0 ? source.length : lineEnd;
  const finalToken = [declaration.nodeKind, declaration.label, declaration.bracketClose,
    declaration.conformanceException, declaration.symbol, declaration.variant,
    declaration.labelPlacement?.side, declaration.labelPlacement?.at, declaration.labelPlacement?.offset,
    declaration.position?.y, declaration.pinned]
    .filter((token) => token !== undefined)
    .reduce((end, token) => Math.max(end, token.range.end.offset), first);
  // The parser admits a position only with its closing parenthesis after y.
  const positionEnd = declaration.position && !declaration.pinned
    ? source.indexOf(')', declaration.position.y.range.end.offset) + 1 : finalToken;
  const bodyOpen = declaration.blockOpen?.range.end.offset;
  const bodyClose = declaration.blockClose?.range.start.offset;
  const headerLineEnd = source.indexOf('\n', first);
  const multilineBody = bodyOpen !== undefined && bodyClose !== undefined &&
    (headerLineEnd < 0 || bodyClose > headerLineEnd);
  const attachedComment = multilineBody && (
    source.slice(bodyOpen!, headerLineEnd < 0 ? source.length : headerLineEnd).trim() !== '' ||
    source.slice(bodyOpen!, bodyClose!).includes('//'));
  if (source.slice(lineStart, first).trim() || attachedComment ||
    source.slice(declaration.blockClose ? last : Math.max(finalToken, positionEnd), lineContentEnd).trim()) throw new Error(
    'coral.editor.source-node-delete.comment: edit this node in source to retain attached commentary',
  );
  const edited = source.slice(0, lineStart) + source.slice(lineEnd < 0 ? source.length : lineEnd + 1);
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length) throw new Error(
    'coral.editor.source-node-delete.invalid: the edited source did not parse',
  );
  const { nodes: priorNodes, interaction: priorInteraction, ...priorRest } = before.graph;
  const { nodes: nextNodes, interaction: nextInteraction, ...nextRest } = after.graph;
  const expectedInteraction = priorInteraction ? {
    ...priorInteraction,
    participants: priorInteraction.participants.filter((item) => item.nodeId !== nodeId),
    participantOrder: priorInteraction.participantOrder.filter((id) => id !== nodeId),
  } : undefined;
  if (canonicalJson(nextRest) !== canonicalJson(priorRest) ||
    canonicalJson(nextNodes) !== canonicalJson(withoutNode(priorNodes, nodeId)) ||
    canonicalJson(nextInteraction) !== canonicalJson(expectedInteraction)) throw new Error(
    'coral.editor.source-node-delete.loss: deletion would change surviving graph meaning',
  );
  return edited;
}

/** Cascade a top-level node's incident connectors without publishing an intermediate graph. */
export function deleteSourceOwnedNodeWithConnections028(source: string, nodeId: string): string {
  const projected = projectInstalledSourceToSuccessor028(source);
  if (!projected.graph || projected.diagnostics.length) throw new Error(
    'coral.editor.source-node-delete.invalid: the current source has no supported graph projection',
  );
  const incident = projected.graph.edges.filter((edge) =>
    edge.first.node === nodeId || edge.second.node === nodeId).map((edge) => edge.id);
  const withoutConnections = deleteSourceOwnedEdges028(source, incident);
  return deleteSourceOwnedLeafNode028(withoutConnections, nodeId);
}

function deleteSourceOwnedGroup028(source: string, nodeId: string): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-node-delete.invalid: the current source has no supported graph projection',
  );
  const declaration = parseInstalledDocument028(source).syntax.statements.find((item) =>
    item.kind === 'node' && item.qualifiedId === nodeId);
  const group = findNode(before.graph.nodes, nodeId);
  if (!declaration || declaration.kind !== 'node' || declaration.nodeKind.value !== 'group' ||
    !declaration.blockOpen || !declaration.blockClose || !group) throw new Error(
    'coral.editor.source-node-delete.nested: edit this node body or group in Coral source',
  );
  const members = subtreeNodeIds(group);
  if (before.graph.edges.some((edge) => members.has(edge.first.node) || members.has(edge.second.node)))
    throw new Error('coral.editor.source-node-delete.connected: remove this group’s connections first');
  const first = declaration.id.range.start.offset;
  const lineStart = source.lastIndexOf('\n', first - 1) + 1;
  const open = declaration.blockOpen.range.end.offset;
  const close = declaration.blockClose.range.start.offset;
  const headerLineEnd = source.indexOf('\n', open);
  const last = declaration.blockClose.range.end.offset;
  const lineEnd = source.indexOf('\n', last);
  const lineContentEnd = lineEnd < 0 ? source.length : lineEnd;
  const headerComment = headerLineEnd >= 0 && close > headerLineEnd &&
    source.slice(open, headerLineEnd).trim();
  if (source.slice(lineStart, first).trim() || headerComment ||
    hasLineCommentOutsideQuotes(source.slice(open, close)) ||
    source.slice(last, lineContentEnd).trim()) throw new Error(
    'coral.editor.source-node-delete.comment: edit this group in source to retain attached commentary',
  );
  const edited = source.slice(0, lineStart) + source.slice(lineEnd < 0 ? source.length : lineEnd + 1);
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length) throw new Error(
    'coral.editor.source-node-delete.invalid: the edited source did not parse',
  );
  const expected = structuredClone(before.graph);
  expected.nodes = withoutNode(expected.nodes, nodeId);
  if (canonicalJson(after.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-node-delete.loss: deletion would change surviving graph meaning',
  );
  return edited;
}

/** Apply a mixed canvas selection as one source edit, with no intermediate publication. */
export function deleteSourceOwnedSelection028(
  source: string, nodeIds: readonly string[], edgeIds: readonly string[],
): string {
  if (!nodeIds.length && !edgeIds.length) return source;
  const projected = projectInstalledSourceToSuccessor028(source);
  if (!projected.graph || projected.diagnostics.length) throw new Error(
    'coral.editor.source-delete.invalid: the current source has no supported graph projection',
  );
  const removedNodes = new Set(nodeIds);
  const subtreeIds = new Map<string, Set<string>>();
  for (const nodeId of removedNodes) {
    const node = findNode(projected.graph.nodes, nodeId);
    if (!node) throw new Error(`coral.editor.source-node-delete.missing: node ${nodeId} is not declared`);
    subtreeIds.set(nodeId, subtreeNodeIds(node));
  }
  for (const [nodeId, members] of subtreeIds) {
    for (const childId of members) if (childId !== nodeId) removedNodes.delete(childId);
  }
  const allRemovedNodes = new Set([...removedNodes].flatMap((id) => [...subtreeIds.get(id)!]));
  const removedEdges = new Set(edgeIds);
  for (const edge of projected.graph.edges) {
    if (allRemovedNodes.has(edge.first.node) || allRemovedNodes.has(edge.second.node))
      removedEdges.add(edge.id);
  }
  let edited = deleteSourceOwnedEdges028(source, [...removedEdges]);
  for (const nodeId of removedNodes) {
    const declaration = parseInstalledDocument028(edited).syntax.statements.find((item) =>
      item.kind === 'node' && item.qualifiedId === nodeId);
    edited = declaration?.kind === 'node' && declaration.nodeKind.value === 'group' &&
      declaration.blockOpen ? deleteSourceOwnedGroup028(edited, nodeId)
      : deleteSourceOwnedLeafNode028(edited, nodeId);
  }
  return edited;
}

export interface SourceOwnedNodeDraft028 {
  /** Local name in the selected group; the projected ID is parentId.id. */
  id: string;
  type: string;
  /** Omission keeps the ID-derived label; explicit empty writes `as ""`. */
  label?: string;
  /** Canonical, group-qualified ID of the parent. */
  parentId?: string;
  /** Exact bundled symbol ID, or `local.<id>` for a document-local symbol. */
  symbol?: string;
  /** Definition added in the same edit when the document lacks `symbol`. */
  definition?: SuccessorUserSymbol029;
}

const BARE_NODE_WORD_028 = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SYMBOL_ID_029 = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/** Undoable header edit: pin edition 0.2.9, or leave an existing 0.2.9 pin unchanged. */
export function pinSourceOwnedEdition029(source: string): string {
  try {
    return pinInstalledDocumentEdition029(source).source;
  } catch (error) {
    // The ES2020 lib has no ErrorOptions; attach the cause explicitly.
    const refusal: Error & { cause?: unknown } =
      new Error(`coral.editor.source-pin.invalid: ${(error as Error).message}`);
    refusal.cause = error;
    throw refusal;
  }
}

/** Pin the edition and insert a missing definition after the header-owned
 * lines; an identical definition already in the document is reused. */
function prepareLocalSymbol029(source: string, input: SourceOwnedNodeDraft028): string {
  const symbol = input.symbol;
  if (symbol === undefined || !symbol.startsWith('local.')) {
    if (input.definition) throw new Error(
      'coral.editor.source-node.symbol: a definition needs a matching local. symbol',
    );
    return source;
  }
  if (input.definition && input.definition.symbolId !== symbol) throw new Error(
    `coral.editor.source-node.symbol: the definition does not define ${symbol}`,
  );
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-node.invalid: the current Coral source has no complete semantic projection',
  );
  const existing = before.graph.userSymbols029?.find((item) => item.symbolId === symbol);
  if (existing) {
    if (input.definition && canonicalJson(existing) !== canonicalJson(input.definition)) throw new Error(
      `coral.editor.source-node.symbol: the document already defines ${symbol} differently`,
    );
    return source;
  }
  if (!input.definition) throw new Error(
    `coral.editor.source-node.symbol: the document does not define ${symbol}`,
  );
  let draft = pinSourceOwnedEdition029(source);
  const newline = newlineOf029(draft);
  const body = parseInstalledDocument028(draft).header.body;
  const trivia = /^[ \t]*(?:\/\/.*)?$/;
  const lines: Array<{ text: string; start: number; end: number; newline: boolean }> = [];
  for (let start = 0; start <= draft.length;) {
    const at = draft.indexOf('\n', start);
    const end = at < 0 ? draft.length : at + 1;
    lines.push({ text: draft.slice(start, at < 0 ? end : at).replace(/\r$/, ''), start, end, newline: at >= 0 });
    if (at < 0) break;
    start = end;
  }
  let owner = lines[0]!;
  let next: (typeof lines)[number] | undefined;
  for (const [index, line] of lines.entries()) {
    if (!trivia.test(body.slice(line.start, line.start + line.text.length))) break;
    if (!trivia.test(line.text)) { owner = line; next = lines[index + 1]; }
  }
  const text = (owner.newline ? '' : newline) + newline +
    printUserSymbolDefinition029(input.definition, newline) + (next?.text.trim() ? newline : '');
  draft = draft.slice(0, owner.end) + text + draft.slice(owner.end);
  const after = projectInstalledSourceToSuccessor028(draft);
  const expected = structuredClone(before.graph);
  expected.userSymbols029 = [...expected.userSymbols029 ?? [], structuredClone(input.definition)];
  if (!after.graph || after.diagnostics.length || canonicalJson(after.graph) !== canonicalJson(expected))
    throw new Error('coral.editor.source-node.symbol: the definition did not parse with its intended meaning');
  return draft;
}

/** Add one approved ID-first declaration without printing the existing graph.
 * A `local.` symbol adds its definition and the 0.2.9 pin in the same edit. */
export function appendSourceOwnedNode028(original: string, input: SourceOwnedNodeDraft028): string {
  if (!BARE_NODE_WORD_028.test(input.id) || !BARE_NODE_WORD_028.test(input.type)) throw new Error(
    'coral.editor.source-node.word: node ID and type must be bare Coral words',
  );
  if (input.symbol !== undefined && !SYMBOL_ID_029.test(input.symbol)) throw new Error(
    'coral.editor.source-node.symbol: a symbol ID must be a plain catalog or local. ID',
  );
  const source = prepareLocalSymbol029(original, input);
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-node.invalid: the current Coral source has no complete semantic projection',
  );
  const qualifiedId = input.parentId ? `${input.parentId}.${input.id}` : input.id;
  if (findNode(before.graph.nodes, qualifiedId)) throw new Error(
    `coral.editor.source-node.duplicate: node ${qualifiedId} already exists`,
  );
  if (before.graph.interaction && (input.parentId || !['participant', 'actor'].includes(input.type))) throw new Error(
    'coral.editor.source-node.sequence: a flat sequence diagram accepts only top-level participants or actors',
  );
  const parent = input.parentId ? findNode(before.graph.nodes, input.parentId) : undefined;
  if (input.parentId && parent?.type !== 'group') throw new Error(
    `coral.editor.source-node.parent: ${input.parentId} is not a declared group`,
  );
  const newline = newlineOf029(source);
  const declaration = `${input.id} ${input.type}${input.symbol !== undefined
    ? ` [symbol: ${JSON.stringify(input.symbol)}]` : ''}${input.type === 'group' ? ' {}' : ''}`;
  let draft: string;
  if (input.parentId) {
    const syntax = parseInstalledDocument028(source).syntax.statements.find((item) =>
      item.kind === 'node' && item.qualifiedId === input.parentId);
    if (!syntax || syntax.kind !== 'node' || !syntax.blockClose) throw new Error(
      `coral.editor.source-node.parent: group ${input.parentId} has no addressable closing brace`,
    );
    const closeAt = syntax.blockClose.range.start.offset;
    const closeLineStart = source.lastIndexOf('\n', closeAt - 1) + 1;
    const closePrefix = source.slice(closeLineStart, closeAt);
    if (/^[ \t]*$/.test(closePrefix)) {
      draft = source.slice(0, closeLineStart) + `${closePrefix}  ${declaration}${newline}` +
        source.slice(closeLineStart);
    } else {
      const parentLineStart = source.lastIndexOf('\n', syntax.id.range.start.offset - 1) + 1;
      const parentIndent = source.slice(parentLineStart, syntax.id.range.start.offset);
      if (!/^[ \t]*$/.test(parentIndent)) throw new Error(
        `coral.editor.source-node.parent: group ${input.parentId} has an unsupported inline scope`,
      );
      draft = source.slice(0, closeAt) + `${newline}${parentIndent}  ${declaration}${newline}${parentIndent}` +
        source.slice(closeAt);
    }
  } else draft = source + (source.endsWith('\n') ? '' : newline) + declaration + newline;
  if (input.label !== undefined) {
    const syntax = parseInstalledDocument028(draft).syntax.statements.find((item) =>
      item.kind === 'node' && item.qualifiedId === qualifiedId);
    if (!syntax) throw new Error('coral.editor.source-node.label: the new node did not parse');
    draft = setCandidateLabel(draft, syntax, input.label);
  }
  const after = projectInstalledSourceToSuccessor028(draft);
  const added = after.graph && findNode(after.graph.nodes, qualifiedId);
  if (!after.graph || after.diagnostics.length || !added || added.type !== input.type ||
    added.label !== input.label || added.parent !== input.parentId || added.symbol !== input.symbol) throw new Error(
    'coral.editor.source-node.invalid: the new node did not parse with its intended meaning',
  );
  const expected = structuredClone(before.graph);
  if (input.parentId) findNode(expected.nodes, input.parentId)!.children ??= [];
  (input.parentId ? findNode(expected.nodes, input.parentId)!.children! : expected.nodes)
    .push(structuredClone(added));
  if (expected.interaction) {
    expected.interaction.participants.push({ id: input.id, nodeId: input.id });
    expected.interaction.participantOrder.push(input.id);
  }
  if (canonicalJson(after.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-node.loss: the edit changed existing graph meaning',
  );
  return draft;
}

export interface SourceOwnedConnection028 {
  /** Optional referenceable identity; omission keeps the generated edge ID. */
  id?: string;
  /** Optional semantic relation/message type, written as the leading bracket item. */
  type?: string;
  sourceId: string;
  targetId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  /** Insert a named sequence message in the same operand as this message. */
  afterMessageId?: string;
}

function insertSequenceItemAfter028(
  interaction: NonNullable<SuccessorSourceGraph028['interaction']>,
  afterMessageId: string,
  insertedId: string,
): boolean {
  const visit = (items: typeof interaction.items): boolean => {
    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      if (item.kind === 'message' && item.id === afterMessageId) {
        items.splice(index + 1, 0, { kind: 'message', id: insertedId });
        return true;
      }
      if (item.kind === 'fragment') {
        const fragment = interaction.fragments?.find((candidate) => candidate.id === item.id);
        if (fragment?.operands.some((operand) => visit(operand.items))) return true;
      }
    }
    return false;
  };
  return visit(interaction.items);
}

/** A sequence append writes after its final top-level item; every existing
 * recursive item must have one addressable owner before that edit is offered. */
export function canAppendSourceOwnedEdge028(graph: SuccessorSourceGraph028): boolean {
  const sequence = graph.interaction;
  if (!sequence) return true;
  const messages = new Set(sequence.messages.map((message) => message.id));
  const fragments = new Map((sequence.fragments ?? []).map((fragment) => [fragment.id, fragment]));
  if (messages.size !== sequence.messages.length || fragments.size !== (sequence.fragments?.length ?? 0)) return false;
  const seenMessages = new Set<string>();
  const seenFragments = new Set<string>();
  const visit = (items: typeof sequence.items): boolean => items.every((item) => {
    if (item.kind === 'message') {
      if (!messages.has(item.id) || seenMessages.has(item.id)) return false;
      seenMessages.add(item.id);
      return true;
    }
    const fragment = fragments.get(item.id);
    if (!fragment || seenFragments.has(item.id) ||
      fragment.operands.length < (fragment.kind === 'alt' || fragment.kind === 'par' ? 2 : 1)) return false;
    seenFragments.add(item.id);
    return fragment.operands.every((operand) => visit(operand.items));
  });
  return visit(sequence.items) && seenMessages.size === messages.size && seenFragments.size === fragments.size;
}

function sourcePort028(
  ports: readonly { id: string; direction: 'in' | 'out' | 'inout' }[],
  raw: string | null | undefined,
  endpoint: 'source' | 'target',
): string | undefined {
  // A plain connector may leave either semantic port unspecified. Layout
  // derives an attachment, but this must not materialize a port in source.
  if (!raw) return undefined;
  const direct = ports.find((port) => port.id === raw);
  const suffix = endpoint === 'source' ? '-out' : '-in';
  const fromView = !direct && raw.endsWith(suffix)
    ? ports.find((port) => port.id === raw.slice(0, -suffix.length) && port.direction === 'inout')
    : undefined;
  const selected = direct ?? fromView;
  if (!selected || endpoint === 'source' && selected.direction === 'in' ||
    endpoint === 'target' && selected.direction === 'out') throw new Error(
    `coral.editor.source-edge.port: ${raw} is not a valid ${endpoint} port`,
  );
  return selected.id;
}

export function resolveSourceOwnedHandle028(
  interpretation: NodeInterpretation028,
  raw: string | null | undefined,
  endpoint: 'source' | 'target',
): string | undefined {
  return sourcePort028(interpretation.semanticPorts, raw, endpoint);
}

/** Resolve canvas handle IDs against the current source-owned port union. */
export function resolveSourceOwnedEdgePorts028(
  graph: SuccessorSourceGraph028,
  interpretations: ReadonlyMap<string, NodeInterpretation028>,
  input: SourceOwnedConnection028,
): { sourcePort?: string; targetPort?: string } {
  if (!canAppendSourceOwnedEdge028(graph)) throw new Error(
    'coral.editor.source-edge.invalid: the sequence timeline has unresolved source positions',
  );
  const first = interpretations.get(input.sourceId);
  const second = interpretations.get(input.targetId);
  if (!first || !second) throw new Error('coral.editor.source-edge.node: both endpoints must be declared');
  if ([first, second].some((node) => node.diagnostics.some((diagnostic) =>
    diagnostic.code.startsWith('coral.port.') || diagnostic.code === 'coral.symbol.unknown' ||
    diagnostic.code === 'coral.variant.unknown'))) throw new Error(
    'coral.editor.source-edge.invalid: an endpoint has unresolved symbol or port meaning',
  );
  const sourcePort = sourcePort028(first.semanticPorts, input.sourceHandle, 'source');
  const targetPort = sourcePort028(second.semanticPorts, input.targetHandle, 'target');
  return { ...(sourcePort ? { sourcePort } : {}), ...(targetPort ? { targetPort } : {}) };
}

/** Connect through the saved semantic graph, then reparse before publishing any text. */
export function appendSourceOwnedEdge028(source: string, input: SourceOwnedConnection028): string {
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) throw new Error(
    'coral.editor.source-edge.invalid: the current source has no supported graph projection',
  );
  const sequence = before.graph.interaction;
  const { edges: priorEdges, interaction: priorInteraction, ...priorRest } = before.graph;
  if (!canAppendSourceOwnedEdge028(before.graph)) throw new Error(
    'coral.editor.source-edge.invalid: the sequence timeline has unresolved source positions',
  );
  if (input.afterMessageId !== undefined && (!sequence || !input.id)) throw new Error(
    'coral.editor.source-edge.id-required: positioned sequence insertion needs a named message',
  );
  const interpretations = resolveSuccessorGraphNodes028(before.graph);
  if (!validPortMeaning028(source, before.graph, interpretations)) throw new Error(
    'coral.editor.source-edge.invalid: existing symbol or semantic-port references need repair',
  );
  if ((input.id !== undefined && !BARE_NODE_WORD_028.test(input.id)) ||
    (input.type !== undefined && !BARE_NODE_WORD_028.test(input.type))) throw new Error(
    'coral.editor.source-edge.word: edge ID and type must be bare Coral words',
  );
  if (input.id && (findNode(before.graph.nodes, input.id) ||
    before.graph.edges.some((edge) => edge.id === input.id) ||
    sequence?.items.some((item) => item.id === input.id) ||
    sequence?.fragments?.some((fragment) => fragment.id === input.id))) throw new Error(
    `coral.editor.source-edge.duplicate: ${input.id} already exists`,
  );
  if (sequence && input.type !== undefined && !['sync', 'async', 'return'].includes(input.type))
    throw new Error('coral.editor.source-edge.invalid: unsupported sequence message type');
  const { sourcePort, targetPort } = resolveSourceOwnedEdgePorts028(before.graph, interpretations, input);
  const newline = newlineOf029(source);
  const operator = sequence && input.type === 'sync' ? '-#>'
    : sequence && input.type === 'return' ? '-.->' : '->';
  const edgeText = `${input.id ? `${input.id} = ` : ''}` +
    `${input.sourceId}${sourcePort ? `:${sourcePort}` : ''} ${operator} ` +
    `${input.targetId}${targetPort ? `:${targetPort}` : ''}` +
    `${input.type ? ` [${input.type}]` : ''}`;
  const insertAtIndex = input.afterMessageId === undefined ? priorEdges.length
    : priorEdges.findIndex((edge) => edge.id === input.afterMessageId) + 1;
  if (input.afterMessageId !== undefined && insertAtIndex === 0) throw new Error(
    `coral.editor.source-edge.position: message ${input.afterMessageId} is not declared`,
  );
  let edited: string;
  if (input.afterMessageId === undefined) {
    edited = source + (source.endsWith('\n') ? '' : newline) + edgeText + newline;
  } else {
    const declarations = parseInstalledDocument028(source).syntax.statements
      .filter((item) => item.kind === 'edge');
    const anchor = declarations[insertAtIndex - 1];
    if (declarations.length !== priorEdges.length || !anchor || anchor.kind !== 'edge' ||
      anchor.id && anchor.id.value !== input.afterMessageId) throw new Error(
      'coral.editor.source-edge.position: message source position is unavailable',
    );
    const first = (anchor.id ?? anchor.source).range.start.offset;
    const lineStart = source.lastIndexOf('\n', first - 1) + 1;
    const indent = source.slice(lineStart, first);
    if (!/^[ \t]*$/.test(indent)) throw new Error(
      'coral.editor.source-edge.position: message source indentation is unavailable',
    );
    const lineEnd = source.indexOf('\n', first);
    const insertAt = lineEnd < 0 ? source.length : lineEnd + 1;
    edited = source.slice(0, insertAt) + (lineEnd < 0 ? newline : '') +
      indent + edgeText + newline + source.slice(insertAt);
  }
  const after = projectInstalledSourceToSuccessor028(edited);
  if (!after.graph || after.diagnostics.length || after.graph.edges.length !== before.graph.edges.length + 1) {
    throw new Error('coral.editor.source-edge.invalid: the new connector did not parse');
  }
  const inserted = after.graph.edges[insertAtIndex];
  if (sequence) {
    const next = after.graph.interaction;
    const message = next?.messages[insertAtIndex];
    const expectedKind = input.type === 'sync' ? 'synchronous'
      : input.type === 'return' ? 'return' : 'asynchronous';
    if (!next || !message || !inserted || message.id !== inserted.id ||
      message.edgeId !== message.id ||
      message.senderParticipantId !== input.sourceId ||
      message.receiverParticipantId !== input.targetId || message.kind !== expectedKind)
      throw new Error('coral.editor.source-edge.loss: the new message changed meaning');
    const expectedInteraction = structuredClone(sequence);
    expectedInteraction.messages.splice(insertAtIndex, 0, message);
    if (input.afterMessageId === undefined) expectedInteraction.items.push({ kind: 'message', id: message.id });
    else if (!insertSequenceItemAfter028(expectedInteraction, input.afterMessageId, message.id)) throw new Error(
      'coral.editor.source-edge.position: anchor is absent from the recursive timeline',
    );
    if (canonicalJson(next) !== canonicalJson(expectedInteraction)) throw new Error(
      'coral.editor.source-edge.loss: the edit changed existing sequence meaning',
    );
  }
  const currentReferences = assessSuccessorSourcePortReferences028(after.graph,
    installedWrittenPortReferenceRanges028(parseInstalledDocument028(edited)));
  if (currentReferences.assessments.some(({ assessment }) => assessment.diagnostics.length)) throw new Error(
    'coral.editor.source-edge.invalid: the new connector has an invalid semantic-port reference',
  );
  const { edges: nextEdges, interaction: nextInteraction, ...nextRest } = after.graph;
  if (canonicalJson(nextRest) !== canonicalJson(priorRest) ||
    canonicalJson(nextEdges.filter((_, index) => index !== insertAtIndex)) !== canonicalJson(priorEdges) ||
    (input.id !== undefined && inserted?.id !== input.id) ||
    (input.type !== undefined && inserted?.type !== input.type) ||
    inserted?.first.node !== input.sourceId ||
    inserted?.first.port !== sourcePort ||
    inserted?.second.node !== input.targetId ||
    inserted?.second.port !== targetPort ||
    (sequence && (inserted.direction !== 'first-to-second' ||
      nextInteraction?.messages[insertAtIndex]?.id !== inserted.id)) ||
    (!sequence && canonicalJson(nextInteraction) !== canonicalJson(priorInteraction))) throw new Error(
    'coral.editor.source-edge.loss: the edit changed existing graph meaning',
  );
  if (input.label === undefined) return edited;
  const declarations = parseInstalledDocument028(edited).syntax.statements
    .filter((item) => item.kind === 'edge');
  const declaration = declarations[insertAtIndex];
  if (!declaration) throw new Error('coral.editor.source-edge.label: the new connector has no declaration');
  const labeled = setCandidateLabel(edited, declaration, input.label);
  const labeledProjection = projectInstalledSourceToSuccessor028(labeled);
  const expected = structuredClone(after.graph);
  expected.edges[insertAtIndex]!.label = input.label;
  if (!labeledProjection.graph || labeledProjection.diagnostics.length ||
    canonicalJson(labeledProjection.graph) !== canonicalJson(expected)) throw new Error(
    'coral.editor.source-edge.label: the label did not parse without changing other graph meaning',
  );
  return labeled;
}

const newlineOf029 = (source: string): string =>
  source.includes('\r\n') && !source.split('\r\n').join('').includes('\n') ? '\r\n' : '\n';

function walkSourceNodes029(nodes: readonly SuccessorSourceNode028[], visit: (node: SuccessorSourceNode028) => void): void {
  for (const node of nodes) { visit(node); walkSourceNodes029(node.children ?? [], visit); }
}

/** Connectors that name `portId` on a node selecting `symbolId`, as `node:port -> node`. */
export function connectorsNamingPort029(graph: SuccessorSourceGraph028, symbolId: string, portId: string): string[] {
  const nodes = new Set<string>();
  walkSourceNodes029(graph.nodes, (node) => { if (node.symbol === symbolId) nodes.add(node.id); });
  const end = ({ node, port }: { node: string; port?: string }) => port === undefined ? node : `${node}:${port}`;
  return graph.edges.filter((edge) => [edge.first, edge.second].some((item) =>
    nodes.has(item.node) && item.port === portId)).map((edge) => `${end(edge.first)} -> ${end(edge.second)}`);
}

/** Replace one `@symbol` block with its canonical print; artwork bytes and
 * every byte outside the block are kept (c5-design.md "Source edits"). */
export function editSourceOwnedSymbolDefinition029(
  source: string, symbolId: string, next: SuccessorUserSymbol029,
): string {
  const fail = (reason: string, detail: string): never => {
    throw new Error(`coral.editor.source-symbol.${reason}: ${detail}`);
  };
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) return fail('invalid',
    'the current Coral source has no complete semantic projection');
  const unresolved = portFinding029(source, before.graph);
  if (unresolved) fail('invalid', `the current Coral source has unresolved port meaning (${unresolved})`);
  const graph = before.graph!;
  const index = graph.userSymbols029?.findIndex((item) => item.symbolId === symbolId) ?? -1;
  if (index < 0) fail('missing', `the document does not define ${symbolId}`);
  const current = graph.userSymbols029![index]!;
  if (next.id !== current.id || next.symbolId !== symbolId) fail('invalid', 'a definition keeps its ID');
  for (const port of current.ports) {
    if (next.ports.some((item) => item.id === port.id)) continue;
    const used = connectorsNamingPort029(graph, symbolId, port.id);
    if (used.length) fail('port-used', `Port ${port.id} is used by ${used.join(', ')}. Remove those connectors first.`);
  }
  const region = parseInstalledDocument028(source).header.definitionRegions?.find((item) => item.id === current.id);
  if (!region) return fail('missing', `the definition of ${symbolId} has no source region`);
  const { start, end } = { start: region!.range.start.offset, end: region!.range.end.offset };
  let structural = '';
  let at = start;
  for (const raw of region!.rawBlocks) { structural += source.slice(at, raw.content.start); at = raw.content.end; }
  structural += source.slice(at, end);
  if (structural.split('\n').some((line) => hasLineCommentOutsideQuotes(line))) fail('comment',
    'Edit this definition in source to keep its comments.');
  const newline = newlineOf029(source);
  const printed = printUserSymbolDefinition029(next, newline);
  const edited = source.slice(0, start) + printed.slice(0, -newline.length) + source.slice(end);
  const after = projectInstalledSourceToSuccessor028(edited);
  const first = after.diagnostics[0];
  if (first) fail('invalid', `${first.code}: ${first.message}`);
  const expected = structuredClone(graph);
  expected.userSymbols029![index] = structuredClone(next);
  if (!after.graph || canonicalJson(after.graph) !== canonicalJson(expected)) fail('invalid',
    'the definition did not parse with its intended meaning');
  const finding = portFinding029(edited, after.graph!);
  if (finding) fail('invalid', finding);
  return edited;
}

/** Set the complete label and limit of one port authored on a node; a 0.2.8
 * document that gains either is pinned to 0.2.9 in the same edit (Q-C5-1). */
export function editSourceOwnedPortFields029(
  source: string, nodeId: string, portId: string, fields: { label?: string; maxConnections?: number },
): string {
  const fail = (reason: string, detail: string): never => {
    throw new Error(`coral.editor.source-port.${reason}: ${detail}`);
  };
  if (fields.maxConnections !== undefined && !(Number.isInteger(fields.maxConnections) && fields.maxConnections > 0))
    fail('invalid', 'a connection limit is a positive whole number');
  const before = projectInstalledSourceToSuccessor028(source);
  if (!before.graph || before.diagnostics.length) return fail('invalid',
    'the current Coral source has no complete semantic projection');
  const unresolved = portFinding029(source, before.graph);
  if (unresolved) fail('invalid', `the current Coral source has unresolved port meaning (${unresolved})`);
  const syntax = parseInstalledDocument028(source).syntax.statements.find((item) => item.kind === 'port' &&
    item.ownerQualifiedId === nodeId && item.id.value === portId);
  const authored = findNode(before.graph!.nodes, nodeId)?.semanticPorts?.find((port) => port.id === portId);
  if (syntax?.kind !== 'port' || !authored) return fail('not-authored', `port ${portId} is not authored on ${nodeId}`);
  if (authored!.label === fields.label && authored!.maxConnections === fields.maxConnections) return source;
  const port = syntax as Extract<typeof syntax, { kind: 'port' }>;
  const last = Math.max(...[port.direction, port.anchor, port.label, port.maxConnections]
    .flatMap((token) => token ? [token.range.end.offset] : []));
  const close = source.indexOf(']', last);
  if (close < 0) fail('invalid', `port ${portId} has no closing bracket`);
  let edited = source.slice(0, port.id.range.start.offset) + printSourcePortLine029({ id: portId,
    direction: port.direction.value, ...(port.anchor ? { anchor: port.anchor.value } : {}),
    ...(fields.label !== undefined ? { label: fields.label } : {}),
    ...(fields.maxConnections !== undefined ? { maxConnections: fields.maxConnections } : {}) }) +
    source.slice(close + 1);
  if (fields.label !== undefined || fields.maxConnections !== undefined) edited = pinSourceOwnedEdition029(edited);
  const after = projectInstalledSourceToSuccessor028(edited);
  const first = after.diagnostics[0];
  if (first) fail('invalid', `${first.code}: ${first.message}`);
  const expected = structuredClone(before.graph!);
  const target = findNode(expected.nodes, nodeId)!.semanticPorts!.find((item) => item.id === portId)! as
    { label?: string; maxConnections?: number };
  delete target.label; delete target.maxConnections;
  Object.assign(target, fields.label !== undefined ? { label: fields.label } : {},
    fields.maxConnections !== undefined ? { maxConnections: fields.maxConnections } : {});
  if (!after.graph || canonicalJson(after.graph) !== canonicalJson(expected)) fail('invalid',
    'the port did not parse with its intended meaning');
  const finding = portFinding029(edited, after.graph!);
  if (finding) fail('invalid', finding);
  return edited;
}
