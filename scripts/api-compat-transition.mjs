import { createHash } from 'node:crypto';
import ts from 'typescript';

import { declarationFindingId } from './api-compat-lib.mjs';

export const APPROVED_GRAPH_IR_DELTAS = Object.freeze([
  'graphir.version',
  'graph-edge.route-intent',
  'layout-options.algorithm-options',
]);

const oldVersion = '    version: string;';
const newVersion = "    version: '2.0.0';";
const oldRouting = `    /** Intermediate points for edge routing */
    routingPoints?: Position[];`;
const newRouting = '    /** Authored route meaning. */\n    routeIntent?: RouteIntent;';
const oldAlgorithmOptions = `    /** Additional algorithm-specific options */
    algorithmOptions?: Record<string, string | number | boolean>;`;
const routeDeclarations = `export type RouteAnchor = {
    kind: 'source';
} | {
    kind: 'target';
} | {
    kind: 'node';
    nodeId: string;
} | {
    kind: 'port';
    nodeId: string;
    portId: string;
};
export type WaypointPlacement = {
    kind: 'absolute';
    position: Position;
} | {
    kind: 'relative';
    anchor: RouteAnchor;
    offset: Position;
};
export interface RouteWaypoint {
    id: string;
    placement: WaypointPlacement;
}
export interface RouteIntent {
    waypoints: RouteWaypoint[];
}
`;

function replaceExact(source, from, to, label) {
  const first = source.indexOf(from);
  if (first === -1 || source.indexOf(from, first + from.length) !== -1) {
    throw new Error(`GraphIR transition fingerprint mismatch for ${label}`);
  }
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`;
}

export function deriveApprovedGraphIrDeclaration(
  baselineSource,
  candidateCanonicalSource,
  enabledDeltas = APPROVED_GRAPH_IR_DELTAS,
) {
  const enabled = new Set(enabledDeltas);
  if ([...enabled].some((value) => !APPROVED_GRAPH_IR_DELTAS.includes(value))) {
    throw new Error('GraphIR transition contains an unapproved delta');
  }
  for (const [label, fingerprint] of [
    ['candidate GraphIR.version', newVersion],
    ['candidate GraphEdge.routeIntent', '    routeIntent?: RouteIntent;'],
    ['candidate RouteIntent declarations', routeDeclarations.trim()],
  ]) {
    if (!candidateCanonicalSource.includes(fingerprint)) {
      throw new Error(`GraphIR transition fingerprint mismatch for ${label}`);
    }
  }
  if (candidateCanonicalSource.includes('    routingPoints?: Position[];')
      || candidateCanonicalSource.includes('    algorithmOptions?: Record<string, string | number | boolean>;')) {
    throw new Error('GraphIR candidate retains a reviewed retired field');
  }

  let source = baselineSource;
  const edits = [];
  if (enabled.has('graphir.version')) {
    source = replaceExact(source, oldVersion, newVersion, 'GraphIR.version');
    edits.push({ delta: 'graphir.version', path: 'GraphIR.version' });
  }
  if (enabled.has('graph-edge.route-intent')) {
    source = replaceExact(source, oldRouting, newRouting, 'GraphEdge routing transition');
    source = replaceExact(source, 'export interface Port {', `${routeDeclarations}export interface Port {`, 'route declarations insertion');
    edits.push(
      { delta: 'graph-edge.route-intent', path: 'GraphEdge.routingPoints' },
      { delta: 'graph-edge.route-intent', path: 'GraphEdge.routeIntent' },
    );
  }
  if (enabled.has('layout-options.algorithm-options')) {
    source = replaceExact(source, oldAlgorithmOptions, '', 'LayoutOptions.algorithmOptions');
    edits.push({ delta: 'layout-options.algorithm-options', path: 'LayoutOptions.algorithmOptions' });
  }
  return { source, edits };
}

function moduleSpecifierNodes(sourceFile) {
  const out = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      out.push(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)
        && ts.isLiteralTypeNode(node.argument)
        && ts.isStringLiteral(node.argument.literal)) {
      out.push(node.argument.literal);
    } else if (ts.isExternalModuleReference(node) && ts.isStringLiteral(node.expression)) {
      out.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

export function declarationModuleSpecifiers(source) {
  const sourceFile = ts.createSourceFile('contract.d.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return moduleSpecifierNodes(sourceFile).map((literal) => literal.text);
}

export function rewriteDeclarationSpecifiers(source, replacements) {
  const sourceFile = ts.createSourceFile('contract.d.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];
  for (const literal of moduleSpecifierNodes(sourceFile)) {
    let value = literal.text;
    for (const [from, to] of replacements) {
      const prefixMatch = from.endsWith('/') ? value.startsWith(from) : value.startsWith(`${from}/`);
      if (value === from || prefixMatch) value = `${to}${value.slice(from.length)}`;
    }
    if (value !== literal.text) edits.push({ start: literal.getStart(sourceFile) + 1, end: literal.getEnd() - 1, value });
  }
  return edits.sort((left, right) => right.start - left.start).reduce(
    (text, edit) => `${text.slice(0, edit.start)}${edit.value}${text.slice(edit.end)}`,
    source,
  );
}

export function transitionSubsetKey(deltas) {
  return [...deltas].sort().join(',');
}

export function transitionFindingId(finding) {
  return createHash('sha256').update(declarationFindingId(finding)).digest('hex').slice(0, 24);
}

export function deriveTransitionObservations(actualFindings, findingsBySubset) {
  const actual = new Map(actualFindings.map((finding) => [declarationFindingId(finding), finding]));
  const subsetFindings = new Map([...findingsBySubset].map(([key, findings]) => [
    key,
    new Set(findings.map(declarationFindingId)),
  ]));
  const fullKey = transitionSubsetKey(APPROVED_GRAPH_IR_DELTAS);
  const full = subsetFindings.get(fullKey);
  if (!full) throw new Error('GraphIR transition analysis is missing the full approved subset');
  const observations = [];
  for (const [identity, finding] of actual) {
    if (full.has(identity)) continue;
    if (finding.meaning === 'compiler' || finding.rule.startsWith('compiler.')) {
      throw new Error(`Compiler diagnostic cannot be a GraphIR transition: ${identity}`);
    }
    const disappearing = [...subsetFindings]
      .filter(([, findings]) => !findings.has(identity))
      .map(([key]) => key ? key.split(',') : []);
    const minimal = disappearing.filter((candidate) => !disappearing.some((other) =>
      other.length < candidate.length && other.every((delta) => candidate.includes(delta))));
    if (minimal.length !== 1 || minimal[0].length === 0) {
      throw new Error(`GraphIR transition cause is ambiguous for ${declarationFindingId(finding)}`);
    }
    observations.push({
      id: transitionFindingId(finding),
      package: finding.packageName,
      subpath: finding.subpath,
      export: finding.exportName,
      meaning: finding.meaning,
      contractPath: finding.contractPath,
      direction: finding.direction,
      rule: finding.rule,
      causes: [...minimal[0]].sort(),
    });
  }
  return observations.sort((left, right) => left.id.localeCompare(right.id));
}

export function closeTransitionFindings(actualFindings, findingsBySubset) {
  const observations = deriveTransitionObservations(actualFindings, findingsBySubset);
  const counterfactualFindings = findingsBySubset.get(
    transitionSubsetKey(APPROVED_GRAPH_IR_DELTAS),
  );
  if (!counterfactualFindings) {
    throw new Error('GraphIR transition analysis is missing the full approved subset');
  }
  if (counterfactualFindings.length) {
    throw new Error(counterfactualFindings
      .map((finding) => `${finding.label}: ${finding.message}`)
      .join('\n'));
  }
  return observations;
}

export function assertStableRuntimeSymbols(baselineModule, candidateModule, rules) {
  for (const rule of rules) {
    const baselineSymbol = baselineModule[rule.valueExport];
    const candidateSymbol = candidateModule[rule.valueExport];
    if (typeof baselineSymbol !== 'symbol' || typeof candidateSymbol !== 'symbol'
        || Symbol.keyFor(baselineSymbol) !== rule.runtimeKey
        || Symbol.keyFor(candidateSymbol) !== rule.runtimeKey
        || baselineSymbol !== candidateSymbol) {
      throw new Error(`Stable symbol runtime identity failed for ${rule.valueExport}.`);
    }
  }
}

const ledgerKeys = new Set(['schema', 'release', 'entries']);
const entryKeys = new Set([
  'id', 'package', 'subpath', 'export', 'meaning', 'contractPath', 'direction', 'rule',
  'causes', 'fixtures', 'note',
]);

export function validateTransitionLedgerShape(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) throw new Error('transition ledger must be an object');
  if (Object.keys(ledger).some((key) => !ledgerKeys.has(key))) throw new Error('transition ledger has an unknown field');
  if (ledger.schema !== 'coral.graphir-transition-ledger/v1' || ledger.release !== '0.2.5' || !Array.isArray(ledger.entries)) {
    throw new Error('transition ledger identity is invalid');
  }
  const ids = new Set();
  let previous = '';
  for (const entry of ledger.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || Object.keys(entry).some((key) => !entryKeys.has(key))
        || [...entryKeys].some((key) => !(key in entry))) {
      throw new Error('transition ledger entry shape is invalid');
    }
    if (ids.has(entry.id) || entry.id <= previous) throw new Error('transition ledger entries must have unique sorted IDs');
    ids.add(entry.id);
    previous = entry.id;
    if (!Array.isArray(entry.causes) || entry.causes.length === 0
        || entry.causes.some((cause) => !APPROVED_GRAPH_IR_DELTAS.includes(cause))
        || JSON.stringify(entry.causes) !== JSON.stringify([...new Set(entry.causes)].sort())) {
      throw new Error(`transition ledger causes are invalid for ${entry.id}`);
    }
    if (!Array.isArray(entry.fixtures) || entry.fixtures.length === 0
        || new Set(entry.fixtures).size !== entry.fixtures.length) {
      throw new Error(`transition ledger fixtures are invalid for ${entry.id}`);
    }
    if (typeof entry.note !== 'string' || !entry.note.includes('#')) {
      throw new Error(`transition ledger note is invalid for ${entry.id}`);
    }
  }
}

export function reconcileTransitionLedger(observations, ledger) {
  validateTransitionLedgerShape(ledger);
  const observed = new Map(observations.map((item) => [item.id, item]));
  const recorded = new Map(ledger.entries.map((item) => [item.id, item]));
  const errors = [];
  for (const [id, item] of observed) {
    const entry = recorded.get(id);
    if (!entry) {
      errors.push(`transition ledger is missing ${id}`);
      continue;
    }
    for (const key of ['package', 'subpath', 'export', 'meaning', 'contractPath', 'direction', 'rule']) {
      if (entry[key] !== item[key]) errors.push(`transition ledger ${id} has stale ${key}`);
    }
    if (JSON.stringify(entry.causes) !== JSON.stringify(item.causes)) {
      errors.push(`transition ledger ${id} has the wrong cause set`);
    }
  }
  for (const id of recorded.keys()) if (!observed.has(id)) errors.push(`transition ledger has stale entry ${id}`);
  return errors.sort();
}
