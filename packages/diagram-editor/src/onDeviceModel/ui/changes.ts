/**
 * Review text for a staged plan (coralsmol integration design, "Review and
 * apply boundary"): one line per change computed from the base and candidate
 * documents, every removal marked in words, and a count line.
 */
import type { SuccessorSourceGraph028 } from '@coral-viz/render';
import { preorder } from '../../llm/plan/snapshot';
import type { PlanChange, PlanStage } from '../../llm/plan/stage';

const FIELD_WORDS: Record<string, string> = { position: 'moved', pinned: 'pin changed', parent: 'moved to another group' };

function namer(...graphs: SuccessorSourceGraph028[]) {
  const labels = new Map<string, string | undefined>();
  for (const graph of graphs) for (const node of preorder(graph.nodes)) if (!labels.has(node.id)) labels.set(node.id, node.label);
  return (id: string) => {
    const label = labels.get(id);
    return label !== undefined ? `"${label}"` : id;
  };
}

/**
 * One plain sentence per change; removals begin with "Removed". A node moved
 * clear of a placement says how far; a node whose place was only written
 * down says it stays where it is.
 */
export function describeChanges(stage: Pick<PlanStage, 'changes' | 'graph' | 'capture'> & Partial<Pick<PlanStage, 'moved' | 'anchored'>>): string[] {
  const after = namer(stage.graph, stage.capture.graph);
  const before = namer(stage.capture.graph, stage.graph);
  const moved = new Map((stage.moved ?? []).map(item => [item.id, item.distance]));
  const anchored = new Set(stage.anchored ?? []);
  const position = (id: string) => moved.has(id) ? `moved ${Math.round(moved.get(id)!)} units to make room`
    : anchored.has(id) ? 'kept in place' : FIELD_WORDS.position;
  return stage.changes.map((change: PlanChange) => {
    // A removal is described as the base document had it.
    const name = change.change === 'removed' ? before : after;
    const what = change.kind === 'node' ? `${change.type ?? 'node'} ${name(change.id)}`
      : change.kind === 'relation' ? `arrow from ${name(change.first!)} to ${name(change.second!)}${change.label !== undefined ? ` "${change.label}"` : ''}`
        : 'diagram settings';
    if (change.change === 'added') return `Added ${what}${change.parent ? ` in ${name(change.parent)}` : ''}`;
    if (change.change === 'removed') return `Removed ${what}`;
    const label = change.fields?.find(field => field.field === 'label');
    const rest = (change.fields ?? []).filter(field => field.field !== 'label')
      .map(field => field.field === 'position' ? position(change.id) : FIELD_WORDS[field.field] ?? `${field.field} changed`);
    const parts = [...(label ? [label.after === undefined ? 'label removed'
      : `${label.before === undefined ? 'labelled' : 'renamed'} "${String(label.after)}"`] : []), ...rest];
    const subject = change.kind === 'node' && label?.before !== undefined ? `${change.type} "${String(label.before)}"` : what;
    return `Changed ${subject}: ${parts.join(', ')}`;
  });
}

/**
 * "3 changes: 1 added, 1 removed, 1 changed". Nodes whose canvas place was
 * written unchanged (`anchored`) count as kept in place, not as changes.
 */
export function changeCount(changes: readonly PlanChange[], anchored: readonly string[] = []): string {
  const kept = changes.filter(change => change.change === 'changed' && anchored.includes(change.id)
    && change.fields?.every(field => field.field === 'position'));
  const real = changes.filter(change => !kept.includes(change));
  const count = (kind: PlanChange['change']) => real.filter(change => change.change === kind).length;
  const parts = (['added', 'removed', 'changed'] as const).filter(kind => count(kind) > 0).map(kind => `${count(kind)} ${kind}`);
  return `${real.length} ${real.length === 1 ? 'change' : 'changes'}${parts.length ? `: ${parts.join(', ')}` : ''}${kept.length ? `; ${kept.length} kept in place` : ''}`;
}

/** Every warning from the candidate's layout, such as a degraded or retried route, one sentence each. */
export function describeLayoutWarnings(stage: Pick<PlanStage, 'layoutDiagnostics'>): string[] {
  return stage.layoutDiagnostics.filter(item => item.severity === 'warning').map(item => item.message);
}
