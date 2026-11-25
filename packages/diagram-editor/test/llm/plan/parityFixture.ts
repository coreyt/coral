import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { capturePlanSnapshot, type CompactSnapshot, type PlanCapture, type PlanSnapshot } from '../../../src/llm/plan/snapshot';

export interface ParityFixture {
  diagrams: Record<string, { id: string; request: string; snapshot: CompactSnapshot; snapshotText: string }>;
  replies: { diagram: string; set: string; turn: number; unauthorized: boolean; text: string;
    expected: { plan: unknown } | { rejected: string } }[];
}

export const parityFixture = JSON.parse(gunzipSync(readFileSync(
  join(import.meta.dirname, '../../fixtures/onDeviceModel/parity.json.gz'))).toString('utf8')) as ParityFixture;

/** A Coral document carrying exactly one fixture diagram's facts. */
export function coralSource(snapshot: CompactSnapshot): string {
  const lines = ['@diagram flowchart'];
  const qualified = new Map<string, string>();
  const write = (parent: string | null, indent: string, prefix: string) => {
    for (const node of snapshot.nodes.filter(n => n.parent === parent)) {
      qualified.set(node.ref, prefix + node.sourceId);
      const label = node.label !== undefined ? ` as ${JSON.stringify(node.label)}` : '';
      lines.push(`${indent}${node.sourceId} ${node.type}${label}${node.type === 'group' ? ' {' : ''}`);
      write(node.ref, `${indent}  `, `${prefix}${node.sourceId}.`);
      if (node.type === 'group') lines.push(`${indent}}`);
    }
  };
  write(null, '', '');
  const end = (e: { node: string; port?: string }) => qualified.get(e.node)! + (e.port ? `:${e.port}` : '');
  for (const r of snapshot.relations) lines.push(`${end(r.first)} -> ${end(r.second)}${r.label !== undefined ? ` as ${JSON.stringify(r.label)}` : ''}`);
  return `${lines.join('\n')}\n`;
}

const local = (id: string) => id.split('.').pop()!;

/**
 * Capture a fixture diagram written as Coral, and map the fixture's refs to
 * the capture's refs: nodes by source ID, relations by endpoints and ports.
 */
export function captureFixtureDiagram(snapshot: CompactSnapshot): { capture: PlanCapture; refOf: Map<string, string> } {
  const result = capturePlanSnapshot({ source: coralSource(snapshot), sourceRevision: 1, requestId: 'fixture' });
  if (!result.ok) throw new Error(result.refusal.message);
  const view = result.capture.view;
  const refOf = new Map<string, string>();
  for (const node of snapshot.nodes) refOf.set(node.ref, view.nodes.find(n => local(n.sourceId) === node.sourceId)!.ref);
  const used = new Set<string>();
  for (const r of snapshot.relations) {
    const match = view.relations.find(m => !used.has(m.ref) &&
      m.first.node === refOf.get(r.first.node) && m.second.node === refOf.get(r.second.node) &&
      m.first.port === r.first.port && m.second.port === r.second.port)!;
    used.add(match.ref);
    refOf.set(r.ref, match.ref);
  }
  return { capture: result.capture, refOf };
}

/** Rewrite a fixture response's existing refs and token for a capture. */
export function remapResponse(response: unknown, refOf: Map<string, string>, token: string): unknown {
  const visit = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map(item => visit(item, key === 'refs' || key === 'contextRefs' ? 'ref' : undefined));
    if (key === 'existing' || key === 'ref') return refOf.get(value as string) ?? value;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, k)]));
    return value;
  };
  return { ...(visit(response) as object), snapshot: token };
}

/**
 * The two mappings P3 owns (W-16, W-17), written out only to compare with the
 * training text: a node's local ID, a decision's yes and no ports only, ports
 * as IDs; nodes and relations in the fixture's order, which fixes handles.
 */
export function trainedView(view: PlanSnapshot, expected: CompactSnapshot, refOf: Map<string, string>): CompactSnapshot {
  const nodes = expected.nodes.map(n => view.nodes.find(m => m.ref === refOf.get(n.ref))!).map(node => {
    if ('stub' in node) throw new Error('trained views are complete');
    const { ports, ...rest } = node;
    const kept = ports?.filter(p => node.type !== 'decision' || p.id === 'yes' || p.id === 'no').map(({ id }) => ({ id }));
    return { ...rest, sourceId: local(node.sourceId), ...(node.type === 'decision' ? { ports: kept } : {}) };
  });
  const relations = expected.relations.map(r => view.relations.find(m => m.ref === refOf.get(r.ref))!);
  const complete: Partial<PlanSnapshot> = { ...view };
  delete complete.totals;
  return { ...(complete as PlanSnapshot), snapshot: expected.snapshot, nodes, relations };
}
