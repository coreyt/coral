/**
 * The AI tab's request field for the on-device editing model (R-066 AC-1,
 * AC-5, AC-8; coralsmol integration plan W-21 to W-26).
 *
 * One exchange at a time. Send checks eligibility, captures the snapshot and
 * locks authored mutation while the model works. A reply is translated,
 * decoded and staged detached through the shared slice 40 boundary; nothing
 * changes before Apply. One clarification is allowed, during which editing is
 * unlocked; an edit makes the exchange stale. Stop, a failure, Discard or
 * leaving the page leaves the document and history unchanged. Wording and
 * layout are proposals until the UI review.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { PlanDecodeError, validatePlanResponse, type PlanResponse } from '../../llm/plan/decode';
import type { CompactSnapshot, PlanCapture, PlanRefusal } from '../../llm/plan/snapshot';
import type { PlanStage, PlanStageResult } from '../../llm/plan/stage';
import type { ExchangeResult } from '../client';
import { compactSnapshot, coralPlan } from '../eligibility';
import type { OnDeviceModel } from '../index';
import { compactMessages, handleTable, readableRefusal, translate, TranslateError, type ChatMessage, type HandleTable } from '../translator';
import { changeCount, describeChanges, describeLayoutWarnings } from './changes';
import { sharedOnDeviceModel } from './sharedModel';

/** What the panel needs from the editor controller. */
export interface OnDeviceHost {
  plan: {
    capture(requestId: string): { ok: true; capture: PlanCapture } | { ok: false; refusal: PlanRefusal };
    stage(capture: PlanCapture, response: PlanResponse, signal?: AbortSignal): Promise<PlanStageResult>;
    apply(stage: PlanStage): Promise<{ ok: true } | { ok: false; refusal: PlanRefusal }>;
    discard(stage: PlanStage): void;
    isCurrent(capture: PlanCapture): 'current' | 'changed' | 'busy';
  };
  /** Locks authored mutation while the model works. */
  setWorking(working: boolean): void;
}

interface Exchange {
  request: string; capture: PlanCapture; snapshot: CompactSnapshot; table: HandleTable;
  messages: ChatMessage[]; asked: boolean;
}
type Phase =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'question'; exchange: Exchange; reply: string; question: string; choices: string[] }
  | { kind: 'review'; stage: PlanStage; request: string }
  | { kind: 'applying' };

export const MESSAGES = {
  stopped: 'Stopped. Nothing was changed.',
  unusable: 'The model\'s reply could not be used. Nothing was changed.',
  missingContext: 'The model could not finish this request. Try naming the items exactly.',
  secondQuestion: 'The model asked a second question. Try a shorter, more exact request.',
  staleQuestion: 'The diagram changed while the question waited. Nothing was changed; ask again.',
  inUse: 'The model is in use in another tab.',
  busy: 'The model is already working on a request.',
  timeout: 'The model took too long and was stopped. Nothing was changed.',
  lost: 'The model stopped. It may have run out of memory. Nothing was changed.',
  notReady: 'Download the model in Preferences first.',
  discarded: 'Discarded. Nothing was changed.',
  applied: 'Applied. Undo reverses it.',
  busyAnswer: 'The editor is still updating. Answer again in a moment.',
  busyApply: 'The editor is still updating. Apply again in a moment.',
  failed: 'Something went wrong. Nothing was changed.',
};

function exchangeFailure(result: Exclude<ExchangeResult, { status: 'ok' }> | 'in-use'): string {
  if (result === 'in-use') return MESSAGES.inUse;
  switch (result.status) {
    case 'cancelled': return MESSAGES.stopped;
    case 'busy': return MESSAGES.busy;
    case 'timeout': return MESSAGES.timeout;
    case 'worker-lost': return MESSAGES.lost;
    case 'truncated': return MESSAGES.unusable;
    case 'error':
      if (result.code === 'input-cap') return result.message;
      if (result.code === 'not-ready') return MESSAGES.notReady;
      if (result.code === 'gpu-lost') return MESSAGES.lost;
      if (result.code === 'gpu-changed') return `${result.message} Choose a GPU in Preferences, then ask again. Nothing was changed.`;
      return `The model stopped: ${result.message} Nothing was changed.`;
    default: return MESSAGES.unusable;
  }
}

const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;

export default function OnDevicePanel({ host, model: given }: { host: OnDeviceHost; model?: OnDeviceModel }) {
  const model = useRef(given ?? null);
  const getModel = () => (model.current ??= sharedOnDeviceModel());
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [request, setRequest] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');
  const requestRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  // Set synchronously, so a second Enter before the next render cannot start a second exchange.
  const inFlight = useRef(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const exchangeToken = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const hostRef = useRef(host);
  hostRef.current = host;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const hintId = useId();
  // Focus moves after the render that shows its target (R-066 AC-8).
  const [focus, setFocus] = useState<{ target: 'review' | 'request' | 'answer' | 'stop' } | null>(null);
  useEffect(() => {
    if (!focus) return;
    ({ review: reviewHeadingRef, request: requestRef, answer: answerRef, stop: stopRef })[focus.target].current?.focus();
    setFocus(null);
  }, [focus]);

  const end = useCallback((message: string, focusRequest = false) => {
    inFlight.current = false;
    hostRef.current.setWorking(false);
    setPhase({ kind: 'idle' });
    setStatus(message);
    if (focusRequest) setFocus({ target: 'request' });
  }, []);

  /** One model turn, then translation, decoding and staging. */
  const ask = useCallback(async (exchange: Exchange, focusStop = false) => {
    const token = ++exchangeToken.current;
    const current = () => token === exchangeToken.current;
    try { await turn(exchange, current, focusStop); } catch {
      if (current()) end(MESSAGES.failed, true);
    }
  }, [end]);

  async function turn(exchange: Exchange, current: () => boolean, focusStop: boolean) {
    hostRef.current.setWorking(true);
    setPhase({ kind: 'working' });
    setStatus('Working. The model loads first, which can take a while.');
    if (focusStop) setFocus({ target: 'stop' });
    const result = await getModel().run(exchange.messages);
    if (!current()) return;
    hostRef.current.setWorking(false);
    if (result === 'in-use' || result.status !== 'ok') return end(exchangeFailure(result));
    let response: PlanResponse;
    try {
      response = validatePlanResponse(translate(result.text, exchange.snapshot, exchange.table), exchange.capture.view);
    } catch (error) {
      if (error instanceof TranslateError || error instanceof PlanDecodeError) return end(MESSAGES.unusable);
      throw error;
    }
    if (response.kind === 'no_change') return end(response.message);
    if (response.kind === 'clarify') {
      if (response.reason === 'missing-context') return end(MESSAGES.missingContext);
      if (exchange.asked) return end(MESSAGES.secondQuestion);
      setPhase({ kind: 'question', exchange, reply: result.text, question: response.question,
        choices: 'choices' in response && response.choices ? response.choices.map(choice => choice.label) : [] });
      setStatus(`Question: ${response.question}`);
      setFocus({ target: 'answer' });
      return;
    }
    setPhase({ kind: 'working' });
    setStatus('Preparing the preview.');
    const controller = abort.current = new AbortController();
    const staged = await hostRef.current.plan.stage(exchange.capture, coralPlan(response), controller.signal);
    if (!current()) {
      if (staged.status === 'staged') hostRef.current.plan.discard(staged.stage);
      return;
    }
    abort.current = null;
    if (staged.status === 'canceled') return end(MESSAGES.stopped);
    if (staged.status === 'no-change') return end('The plan would not change the diagram.');
    if (staged.status === 'refused') {
      return end(`The plan cannot be applied: ${readableRefusal(staged.refusal, exchange.snapshot)} Nothing was changed.`);
    }
    setPhase({ kind: 'review', stage: staged.stage, request: exchange.request });
    setStatus(`Review ready: ${changeCount(staged.stage.changes, staged.stage.anchored)}.`);
    setFocus({ target: 'review' });
  }

  const send = useCallback(async () => {
    const text = request;
    if (!text.trim() || inFlight.current || phaseRef.current.kind !== 'idle') return;
    inFlight.current = true;
    try {
      const requestId = globalThis.crypto.randomUUID();
      const capture = hostRef.current.plan.capture(requestId);
      // The snapshot describes exactly the capture the plan executes against.
      const adapted = compactSnapshot(capture);
      if (!adapted.ok) return end(adapted.refusal.message);
      if (!capture.ok) return end(MESSAGES.failed);
      const table = await handleTable(requestId, adapted.snapshot);
      await ask({ request: text, capture: capture.capture, snapshot: adapted.snapshot, table,
        messages: compactMessages(text, adapted.snapshot, table), asked: false });
    } catch { end(MESSAGES.failed); }
  }, [ask, end, request]);

  const reply = useCallback((text: string) => {
    const current = phaseRef.current;
    if (current.kind !== 'question' || !text.trim()) return;
    const state = hostRef.current.plan.isCurrent(current.exchange.capture);
    if (state === 'busy') return setStatus(MESSAGES.busyAnswer);
    setAnswer('');
    if (state === 'changed') return end(MESSAGES.staleQuestion, true);
    void ask({ ...current.exchange, asked: true, messages: [...current.exchange.messages,
      { role: 'assistant', content: current.reply }, { role: 'user', content: text }] }, true);
  }, [ask, end]);

  const stop = useCallback(() => {
    exchangeToken.current++;
    getModel().stop();
    abort.current?.abort();
    abort.current = null;
    end(MESSAGES.stopped, true);
  }, [end]);

  const apply = useCallback(async () => {
    const current = phaseRef.current;
    if (current.kind !== 'review') return;
    setPhase({ kind: 'applying' });
    setStatus('Applying.');
    let result: Awaited<ReturnType<OnDeviceHost['plan']['apply']>>;
    try { result = await hostRef.current.plan.apply(current.stage); } catch {
      hostRef.current.plan.discard(current.stage);
      return end(MESSAGES.failed, true);
    }
    if (!result.ok && result.refusal.code === 'coral.plan.busy') {
      // The editor is mid-update: keep the proposal under review.
      setPhase(current);
      setStatus(MESSAGES.busyApply);
      return;
    }
    if (!result.ok) hostRef.current.plan.discard(current.stage);
    // An applied request is done; Discard and refusals keep the text to refine.
    else setRequest('');
    end(result.ok ? MESSAGES.applied : `Nothing was applied: ${result.refusal.message}`, true);
  }, [end]);

  const discard = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind === 'review') hostRef.current.plan.discard(current.stage);
    setAnswer('');
    end(current.kind === 'question' ? 'Question closed. Nothing was changed.' : MESSAGES.discarded, true);
  }, [end]);

  // Leaving the page, or turning the feature off, ends the exchange and drops any candidate.
  useEffect(() => () => {
    exchangeToken.current++;
    abort.current?.abort();
    if (phaseRef.current.kind === 'working') model.current?.stop();
    if (phaseRef.current.kind === 'review') hostRef.current.plan.discard(phaseRef.current.stage);
    hostRef.current.setWorking(false);
  }, []);

  const onRequestKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  };
  const busy = phase.kind === 'working' || phase.kind === 'applying';

  return (
    <div className="coral-on-device" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      {/* The question and the review show their own text. */}
      {phase.kind !== 'question' && phase.kind !== 'review' && <p style={{ margin: 0 }}>{status}</p>}
      {/* The live region lives outside the tab, which is hidden while another tab is open. */}
      {createPortal(<div role="status" aria-live="polite" data-testid="on-device-status" style={VISUALLY_HIDDEN}>{status}</div>,
        document.body)}

      {phase.kind === 'question' && (
        <section aria-label="Question from the model">
          <p>{phase.question}</p>
          {phase.choices.map(choice => (
            <button key={choice} type="button" className="coral-button" onClick={() => reply(choice)}>{choice}</button>
          ))}
          <label style={{ display: 'block', marginTop: 6 }}>
            Your answer
            <textarea ref={answerRef} value={answer} onChange={event => setAnswer(event.target.value)} rows={2} style={{ width: '100%' }}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); reply(answer); } }} />
          </label>
          <button type="button" className="coral-button coral-button--primary" onClick={() => reply(answer)} disabled={!answer.trim()}>Answer</button>
          <button type="button" className="coral-button" onClick={discard}>Cancel</button>
        </section>
      )}

      {phase.kind === 'review' && (
        <section aria-labelledby="on-device-review-heading">
          <h3 id="on-device-review-heading" ref={reviewHeadingRef} tabIndex={-1} style={{ fontSize: 13, margin: '0 0 4px' }}>
            Review the proposed change
          </h3>
          <p>Your request: {phase.request}</p>
          <p>{changeCount(phase.stage.changes, phase.stage.anchored)}</p>
          <ul aria-label="Proposed changes" style={{ margin: 0, paddingLeft: 18 }}>
            {describeChanges(phase.stage).map((line, k) => <li key={k}>{line}</li>)}
          </ul>
          {describeLayoutWarnings(phase.stage).length > 0 && (
            <ul aria-label="Layout warnings" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {describeLayoutWarnings(phase.stage).map((line, k) => <li key={k}>Layout warning: {line}</li>)}
            </ul>
          )}
          <p>Check that this is what you asked for. The model can add, drop or invent edits.</p>
          <img alt="Preview of the diagram after the change" style={{ maxWidth: '100%', border: '1px solid var(--coral-border, #ccc)' }}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(phase.stage.preview)}`} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button type="button" className="coral-button coral-button--primary" onClick={() => void apply()}>Apply</button>
            <button type="button" className="coral-button" onClick={discard}>Discard</button>
          </div>
        </section>
      )}

      <label htmlFor="on-device-request">Request</label>
      <textarea id="on-device-request" ref={requestRef} value={request} rows={2} aria-describedby={hintId}
        onChange={event => setRequest(event.target.value)} onKeyDown={onRequestKey}
        readOnly={phase.kind !== 'idle'} style={{ width: '100%' }} />
      <p id={hintId} style={{ margin: 0, color: 'var(--coral-muted)' }}>
        For example: rename Ship to Deliver. Quotes are optional. Requests of one to four edits work best.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        {busy
          ? <button ref={stopRef} type="button" className="coral-button" onClick={stop} disabled={phase.kind === 'applying'}>Stop</button>
          : <button type="button" className="coral-button coral-button--primary" onClick={() => void send()}
            disabled={phase.kind !== 'idle' || !request.trim()}>Send</button>}
      </div>
    </div>
  );
}
