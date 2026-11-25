/**
 * Detached staging and review for executed `coral-plan/1` plans (0.2.10
 * design, "Preview, commit and recovery"; plan slice 40).
 *
 * `stagePlan` checks the capture is still current, executes the plan on a
 * detached copy (spatial operations measured by slice 60 with the canvas's
 * own layout, after checking it reproduces the canvas), computes the change
 * list from the base and candidate
 * documents, and lays out and draws the candidate off-screen in a worker. The
 * live document is never touched. Only a stage that rendered and was not
 * cancelled or discarded is open for commit; the editor controller rechecks
 * the revisions and commits it through its source-owned edit path.
 */
import { renderSvg, successorSourceDisplayWithSemanticPorts028, type SvgOptions,
  type SuccessorSourceEdge028, type SuccessorSourceGraph028, type SuccessorSourceNode028 } from '@coral-viz/render';
import { layoutGraphForSvg, type SvgLayoutOptions } from '@coral-viz/render/svg-layout';
import type { LayoutWorkerFactory } from '../../layoutWorkerClient';
import { canonicalJson } from '../../sourceOwnedEdits028';
import type { ResolvedLayoutDiagnostic } from '@coral-viz/render/layout';
import type { PlanResponse } from './decode';
import type { SpatialRect } from '../spatial/types';
import type { PlanExecution, PlanExecutionRefusal } from './execute';
import { executePlanWithGeometry, type MeasurePlanGeometry } from './spatial';
import { planCaptureIsCurrent, preorder, type CaptureInput, type PlanCapture } from './snapshot';

/** The live document a capture was taken from, as the editor reports it now. */
export type PlanBase = Required<Pick<CaptureInput, 'source' | 'sourceRevision' | 'geometryRevision'>>;

/** One difference between the base and candidate documents. */
export interface PlanChange {
  change: 'added' | 'removed' | 'changed';
  kind: 'node' | 'relation' | 'document';
  /** Source identity; empty for the document. */
  id: string;
  type?: string;
  /** The label after the change, or before a removal. */
  label?: string;
  parent?: string;
  first?: string;
  second?: string;
  /** For `changed`: each differing field, with its value before and after (absent when unset). */
  fields?: { field: string; before?: unknown; after?: unknown }[];
}

export interface PlanStage {
  readonly capture: PlanCapture;
  /** The candidate source, compiled from the base by source-owned edits. */
  readonly source: string;
  /** The reparsed candidate meaning. */
  readonly graph: SuccessorSourceGraph028;
  /** Computed from base and candidate documents, never from the model's response. */
  readonly changes: readonly PlanChange[];
  /** Base-document IDs the plan removes, for marking on the live canvas. */
  readonly removed: { readonly nodes: readonly string[]; readonly relations: readonly string[] };
  readonly allocations: Readonly<Record<string, string>>;
  /** Surviving unnamed connectors whose derived `edge-N` ID changes: old ID to new. */
  readonly renumbered: Readonly<Record<string, string>>;
  /** The candidate drawn off-screen at full scale. */
  readonly preview: string;
  /** Automatic nodes moved clear of a placement (slice 60 bounded repair), each listed in the review. */
  readonly moved: NonNullable<PlanExecution['moved']>;
  /** Automatic nodes whose unchanged measured place was written to anchor their frame. */
  readonly anchored: readonly string[];
  /** Diagnostics from the preview's layout of the candidate; the review lists every warning. */
  readonly layoutDiagnostics: readonly ResolvedLayoutDiagnostic[];
}

export type PlanStageResult =
  | { status: 'staged'; stage: PlanStage }
  | { status: 'no-change' }
  | { status: 'refused'; refusal: PlanExecutionRefusal }
  | { status: 'canceled' };

export interface PlanPreviewOptions {
  svgOptions?: Pick<SvgOptions, 'theme' | 'style' | 'fontSettings'>;
  /** The canvas's layout direction and spacing, exactly as the canvas uses them. */
  direction?: SvgLayoutOptions['direction'];
  spacing?: { nodeNode?: number; layerSpacing?: number };
}

const stale = (): PlanStageResult => ({ status: 'refused',
  refusal: { code: 'coral.plan.stale', message: 'The diagram changed after this request; ask again.' } });

/** Stages that rendered and are still open for commit. */
const open = new WeakSet<PlanStage>();

/** True until the stage is discarded or committed. */
export function planStageIsOpen(stage: PlanStage): boolean {
  return open.has(stage);
}

/** Close a stage; it can no longer be committed. */
export function discardPlanStage(stage: PlanStage): void {
  open.delete(stage);
}

const nodeFields = (node: SuccessorSourceNode028) => {
  const { children: _children, ...fields } = node;
  return fields as Record<string, unknown>;
};

function fieldDiff(before: Record<string, unknown>, after: Record<string, unknown>) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter(field => canonicalJson(before[field] ?? null) !== canonicalJson(after[field] ?? null))
    .map(field => ({ field, ...(field in before ? { before: before[field] } : {}), ...(field in after ? { after: after[field] } : {}) }));
}

/**
 * Every difference between two documents: removed and changed entities in
 * base order, then added ones in candidate order; nodes, relations, then any
 * document-level field.
 */
export function diffPlanDocuments(base: SuccessorSourceGraph028, candidate: SuccessorSourceGraph028): PlanChange[] {
  const describeNode = (node: SuccessorSourceNode028) => ({ kind: 'node' as const, id: node.id, type: node.type,
    ...(node.label !== undefined ? { label: node.label } : {}), ...(node.parent ? { parent: node.parent } : {}) });
  const describeEdge = (edge: SuccessorSourceEdge028) => ({ kind: 'relation' as const, id: edge.id,
    ...(edge.type !== undefined ? { type: edge.type } : {}), ...(edge.label !== undefined ? { label: edge.label } : {}),
    first: edge.first.node, second: edge.second.node });
  const changes: PlanChange[] = [];
  const compare = <T extends { id: string }>(before: T[], after: T[], describe: (item: T) => Omit<PlanChange, 'change'>,
    fields: (item: T) => Record<string, unknown>) => {
    const next = new Map(after.map(item => [item.id, item]));
    const prior = new Set(before.map(item => item.id));
    for (const item of before) {
      const successor = next.get(item.id);
      if (!successor) { changes.push({ change: 'removed', ...describe(item) }); continue; }
      const differences = fieldDiff(fields(item), fields(successor));
      if (differences.length) changes.push({ change: 'changed', ...describe(successor), fields: differences });
    }
    for (const item of after) if (!prior.has(item.id)) changes.push({ change: 'added', ...describe(item) });
  };
  compare(preorder(base.nodes), preorder(candidate.nodes), describeNode, nodeFields);
  compare(base.edges, candidate.edges, describeEdge, edge => ({ ...edge }));
  const { nodes: _bn, edges: _be, ...baseDocument } = base;
  const { nodes: _cn, edges: _ce, ...candidateDocument } = candidate;
  const document = fieldDiff(baseDocument, candidateDocument);
  if (document.length) changes.push({ change: 'changed', kind: 'document', id: '', fields: document });
  return changes;
}

/**
 * The candidate with each surviving connector under its base ID, so the diff
 * compares the same connectors. The executor reports renumbered derived IDs
 * and removed connectors; a new connector that reuses a removed or moved base
 * ID is kept apart.
 */
function alignConnectors(capture: PlanCapture, candidate: SuccessorSourceGraph028,
  renumbered: Readonly<Record<string, string>>, removedEdges: readonly string[]): SuccessorSourceGraph028 {
  const back = new Map(Object.entries(renumbered).map(([from, to]) => [to, from]));
  const removed = new Set(removedEdges);
  const base = new Set(capture.graph.edges.map(edge => edge.id));
  const vacated = (id: string) => removed.has(id) || id in renumbered;
  return { ...candidate, edges: candidate.edges.map(edge => {
    const id = back.get(edge.id) ?? (base.has(edge.id) && vacated(edge.id) ? `${edge.id} (new)` : edge.id);
    return id === edge.id ? edge : { ...edge, id };
  }) };
}

let previews = 0;

/**
 * Lay out and draw a candidate with the shared source renderer, returning the
 * layout's warnings with it; the preview worker runs this.
 */
export async function renderPlanPreview(graph: SuccessorSourceGraph028, options: PlanPreviewOptions):
  Promise<{ svg: string; layoutDiagnostics: ResolvedLayoutDiagnostic[] }> {
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
  const direction = options.direction ?? 'RIGHT';
  const svgOptions = options.svgOptions ?? {};
  const laidOut = await layoutGraphForSvg(display, { direction, svgOptions, semanticInterpretations,
    ...(options.spacing?.nodeNode !== undefined ? { nodeSpacing: options.spacing.nodeNode } : {}),
    ...(options.spacing?.layerSpacing !== undefined ? { layerSpacing: options.spacing.layerSpacing } : {}) });
  const svg = renderSvg(laidOut, { ...svgOptions, edgeRoutes: laidOut.edgeRoutes, layoutDirection: direction,
    semanticGraph: display, successorSource: graph, domIdNamespace: `plan-${++previews}` });
  return { svg, layoutDiagnostics: laidOut.layoutDiagnostics028 ?? [] };
}

/** One off-thread task: draw the candidate. */
export interface PlanPreviewRequest { kind: 'preview'; graph: SuccessorSourceGraph028; options: PlanPreviewOptions }
export type PlanPreviewReply = { ok: true; svg: string; layoutDiagnostics: ResolvedLayoutDiagnostic[] } | { ok: false; error: string };

/** Runs one task; the preview worker calls this, as does the bounded main-thread fallback. */
export async function runPlanPreviewTask({ graph, options }: PlanPreviewRequest): Promise<PlanPreviewReply> {
  return { ok: true, ...(await renderPlanPreview(graph, options)) };
}

const aborted = () => Object.assign(new Error('Preview aborted'), { name: 'AbortError' });
const previewWorker: LayoutWorkerFactory = () =>
  new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' }) as unknown as ReturnType<LayoutWorkerFactory>;

/**
 * Run a task off the main thread, as the editor's layout does (runEditorLayout):
 * abort terminates the worker, and without a worker only a diagram of at
 * most 100 nodes is laid out on the main thread.
 */
async function offThread(request: PlanPreviewRequest, signal?: AbortSignal, factory?: LayoutWorkerFactory) {
  const settle = (reply: PlanPreviewReply) => {
    if (!reply.ok) throw new Error(reply.error);
    return reply;
  };
  const mainThread = async () => {
    if (preorder(request.graph.nodes).length > 100) {
      throw new Error('the layout worker is unavailable for a diagram over 100 nodes');
    }
    return settle(await runPlanPreviewTask(request));
  };
  if (signal?.aborted) throw aborted();
  if (!factory && typeof Worker === 'undefined') return mainThread();
  let worker: ReturnType<LayoutWorkerFactory>;
  try { worker = (factory ?? previewWorker)(); } catch { return mainThread(); }
  return new Promise<Extract<PlanPreviewReply, { ok: true }>>((resolve, reject) => {
    const finish = (action: () => void) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      action();
    };
    const onMessage = ((event: MessageEvent<PlanPreviewReply>) => finish(() => {
      try { resolve(settle(event.data)); } catch (error) { reject(error); }
    })) as EventListener;
    const onError = (() => finish(() => { mainThread().then(resolve, reject); })) as EventListener;
    const onAbort = () => finish(() => reject(aborted()));
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    try { worker.postMessage(request); } catch { onError(new Event('error')); }
  });
}

/**
 * Prepare one response for review. `current` reads the live base; it is
 * checked before execution and again after the detached render, so an edit
 * during the request or the render refuses the stage. An aborted signal
 * cancels; a failed render refuses. None of these touches the live document.
 */
export async function stagePlan(capture: PlanCapture, response: PlanResponse, current: () => PlanBase | null,
  options: PlanPreviewOptions & { signal?: AbortSignal; workerFactory?: LayoutWorkerFactory;
    /** Measure a candidate with the canvas's own layout (`canvasGeometry`); spatial plans need it. */
    measure?: MeasurePlanGeometry;
    /** The canvas's graph-absolute rectangles now; every AI edit writes what a fresh layout would move. */
    canvas?: () => ReadonlyMap<string, SpatialRect>;
  } = {}): Promise<PlanStageResult> {
  const { signal, workerFactory, measure, canvas, ...preview } = options;
  if (signal?.aborted) return { status: 'canceled' };
  const base = current();
  if (!base || !planCaptureIsCurrent(capture, base)) return stale();
  const spatial = response.kind === 'plan' && response.operations.some(op => op.op.startsWith('layout.'));
  if (spatial && (!measure || !canvas)) {
    return { status: 'refused', refusal: { code: 'coral.plan.spatial.measure', message: 'Spatial edits need the canvas layout to measure them.' } };
  }
  // The canvas is passed so that every AI edit keeps what it shows (H3).
  const executed = await executePlanWithGeometry(capture, response, measure ?? (() => Promise.reject(new Error('no measurement'))),
    measure && canvas ? canvas() : undefined);
  if (signal?.aborted) return { status: 'canceled' };
  if (!executed.ok) return { status: 'refused', refusal: executed.refusal };
  const { execution } = executed;
  if (!execution.changed) return { status: 'no-change' };
  const changes = diffPlanDocuments(capture.graph, alignConnectors(capture, execution.graph, execution.renumbered, execution.removedEdges));
  let svg: string;
  let previewDiagnostics: readonly ResolvedLayoutDiagnostic[];
  try {
    const drawn = await offThread({ kind: 'preview', graph: execution.graph, options: preview }, signal, workerFactory);
    svg = drawn.svg;
    previewDiagnostics = drawn.layoutDiagnostics;
  } catch (error) {
    if (signal?.aborted) return { status: 'canceled' };
    return { status: 'refused', refusal: { code: 'coral.plan.preview-failed',
      message: `The proposed diagram could not be drawn: ${error instanceof Error ? error.message : String(error)}` } };
  }
  if (signal?.aborted) return { status: 'canceled' };
  const after = current();
  if (!after || !planCaptureIsCurrent(capture, after)) return stale();
  const removed = (kind: PlanChange['kind']) => changes.filter(item => item.change === 'removed' && item.kind === kind).map(item => item.id);
  const stage: PlanStage = { capture, source: execution.source, graph: execution.graph, changes,
    removed: { nodes: removed('node'), relations: removed('relation') }, allocations: execution.allocations,
    renumbered: execution.renumbered, preview: svg, moved: execution.moved ?? [], anchored: execution.anchored ?? [],
    layoutDiagnostics: previewDiagnostics };
  open.add(stage);
  return { status: 'staged', stage };
}
