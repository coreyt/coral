/**
 * Snapshot and eligibility for the on-device editing model (R-066; coralsmol
 * integration plan P3, W-16 to W-18).
 *
 * An adapter over the shared slice 20 capture. It refuses, in plain words, a
 * document the model was not trained to read, and otherwise maps the
 * capture's view onto the compact snapshot the model was trained on:
 * complete coverage, no selection or comment, a node's local ID, and only the
 * trained ports and types. It also maps the model's type words back to
 * Coral's on the way out. Type-only imports keep it light enough for the
 * model worker, which shares its input-cap message.
 */
import type { PlanOperation, PlanResponse } from '../llm/plan/decode';
import type { CaptureResult, CompactSnapshot, PlanRefusal } from '../llm/plan/snapshot';

/**
 * Coral flowchart type to the trained type the model reads and writes. Every
 * other Coral type is refused, including `io`, `document` and generic words
 * such as `datastore`, so the mapping is one to one in both directions.
 */
export const TRAINED_TYPES: Readonly<Record<string, string>> = {
  terminal: 'terminal', process: 'process', decision: 'decision', database: 'datastore', group: 'group',
};
const CORAL_TYPES = Object.fromEntries(Object.entries(TRAINED_TYPES).map(([coral, trained]) => [trained, coral]));
/** The only relation type the model was trained on. */
const TRAINED_RELATION = 'flow';
/** Ports the model saw. Coral's catalog also gives decisions `in` and `alt`, and processes `in` and `out`. */
const TRAINED_PORTS: Readonly<Record<string, readonly string[]>> = { decision: ['yes', 'no'] };

export type CompactResult = { ok: true; snapshot: CompactSnapshot } | { ok: false; refusal: PlanRefusal };

const refuse = (code: string, message: string): CompactResult => ({ ok: false, refusal: { code, message } });
const TOO_LARGE = 'This diagram is too large for the on-device model. Try it on a smaller flowchart.';

/** Plain reasons for the shared capture's refusals. */
function captureReason(refusal: PlanRefusal): PlanRefusal {
  switch (refusal.code) {
    case 'coral.plan.snapshot.invalid':
      return { code: refusal.code, message: 'The diagram has source errors. Fix them in the Coral source, then ask again.' };
    case 'coral.plan.snapshot.profile':
      return { code: refusal.code, message: 'The on-device model edits flowcharts only.' };
    case 'coral.plan.snapshot.too-large':
      return { code: refusal.code, message: TOO_LARGE };
    case 'coral.plan.busy':
      return { code: refusal.code, message: 'The diagram is still updating. Ask again when it has finished.' };
    default:
      return refusal;
  }
}

/** The compact snapshot for one capture, or the reason the model cannot edit this document. */
export function compactSnapshot(captured: CaptureResult): CompactResult {
  if (!captured.ok) return { ok: false, refusal: captureReason(captured.refusal) };
  const view = captured.capture.view;
  if (view.coverage.nodes !== 'complete' || view.coverage.relations !== 'complete') {
    return refuse('coral.on-device.too-large', TOO_LARGE);
  }
  const nodes: CompactSnapshot['nodes'] = [];
  for (const node of view.nodes) {
    if ('stub' in node) return refuse('coral.on-device.too-large', TOO_LARGE);
    const trained = TRAINED_TYPES[node.type];
    if (!trained) {
      const name = node.label !== undefined ? `"${node.label}"` : node.sourceId;
      return refuse('coral.on-device.type', `The on-device model cannot edit ${name}, a ${node.type} node. ` +
        'It edits terminal, process, decision, database and group nodes only.');
    }
    const { ports, ...rest } = node;
    const shown = TRAINED_PORTS[node.type];
    nodes.push({ ...rest, type: trained, sourceId: node.sourceId.split('.').pop()!,
      ...(shown ? { ports: (ports ?? []).filter(port => shown.includes(port.id)).map(({ id }) => ({ id })) } : {}) });
  }
  const other = view.relations.find(relation => relation.type !== TRAINED_RELATION);
  if (other) return refuse('coral.on-device.relation', `The on-device model edits flow arrows only; this diagram has a ${other.type} connection.`);
  // A connection on a port the model never sees would show a port its node does not list.
  const byRef = new Map(nodes.map(node => [node.ref, node]));
  for (const relation of view.relations) {
    for (const end of [relation.first, relation.second]) {
      const node = byRef.get(end.node)!;
      if (end.port !== undefined && !node.ports?.some(port => port.id === end.port)) {
        const name = node.label !== undefined ? `"${node.label}"` : node.sourceId;
        return refuse('coral.on-device.port', `The on-device model cannot read the connection at the ${end.port} port of ${name}. ` +
          'It knows only the yes and no ports of decisions.');
      }
    }
  }
  const { totals: _totals, selected: _selected, ...rest } = view;
  return { ok: true, snapshot: { ...rest, selected: [], nodes } };
}

/** A translated plan in Coral's type words, for the shared executor. Other responses pass unchanged. */
export function coralPlan(response: PlanResponse): PlanResponse {
  if (response.kind !== 'plan') return response;
  return { ...response, operations: response.operations.map((op): PlanOperation =>
    (op.op === 'node.add' ? { ...op, type: CORAL_TYPES[op.type as string] ?? op.type } : op)) };
}

/** The input-cap refusal, which the model worker reports before loading the model. */
export function inputCapMessage(needed: number, limit: number): string {
  return `This request and diagram are too long for the on-device model (${needed} tokens; the limit is ${limit}). ` +
    'Shorten the request or try a smaller flowchart.';
}
