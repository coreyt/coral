/** Symbol editor for one user-symbol definition (Slice 60 C5, design item 3).
 * It reads only its props: every committed field hands the next definition to
 * `onCommit`, which the document host turns into one source edit and C6 can
 * turn into a library update. The preview is display-only (author Q-C5-4). */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { userOutlineShape029, type ResolvedUserSymbol029, type SuccessorUserSymbol029 } from '@coral-viz/render';
import { UserSymbolArtwork029 } from '@coral-viz/viz';

type Port = SuccessorUserSymbol029['ports'][number];
type Anchor = SuccessorUserSymbol029['anchors'][number];

const SIDES = ['N', 'E', 'S', 'W'] as const;
const LABELS = ['above', 'below', 'left', 'right', 'center'] as const;
const OUTLINES = ['rectangle', 'rounded', 'ellipse', 'diamond'] as const;
const TINTS = ['none', 'stroke'] as const;
const DIRECTIONS = ['in', 'out', 'inout'] as const;
const GENERIC_PORT_ANCHORS = ['auto', 'side', 'corner', 'N', 'E', 'S', 'W', 'NE', 'NW', 'SE', 'SW'];

const fieldStyle = { display: 'grid', gap: 2, fontSize: 12 } as const;

/** A requested field edit may wait only for its exact source revision. */
export interface SourceFieldCommitState029 {
  revision: number;
  pending: boolean;
  /** Read the actual revision claimed synchronously by a successful commit. */
  readRevision?: () => number;
}

/** Enter/blur commits a field; Escape cancels its draft and deferred request. */
export function Field029({ label, name, value, onCommit, disabled, describedBy, inputRef, type = 'text', commitState }: {
  /** Accessible name; `name` is the shorter visible label. */
  label: string; name?: string; value: string; onCommit: (next: string) => boolean;
  disabled?: boolean; describedBy?: string; inputRef?: RefObject<HTMLInputElement | null>; type?: 'text' | 'number';
  commitState?: SourceFieldCommitState029;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const submitted = useRef<{ text: string; revision?: number } | null>(null);
  const deferred = useRef<{ revision: number; text: string } | null>(null);
  useEffect(() => {
    // A canonical display acknowledgement (e.g. tags spacing) must not
    // overwrite text typed after our submission. Other revisions replace it.
    const own = submitted.current;
    if (own && (!commitState || own.revision === commitState.revision)) {
      setDraft(current => current === own.text ? value : current);
    } else setDraft(value);
    committed.current = value;
    submitted.current = null;
  }, [value]);
  const perform = (text: string) => {
    if (onCommit(text)) {
      committed.current = text;
      submitted.current = { text, ...(commitState
        ? { revision: commitState.readRevision?.() ?? commitState.revision } : {}) };
    } else setDraft(current => current === text ? committed.current : current);
  };
  const commit = () => {
    if (draft === committed.current) { deferred.current = null; return; }
    if (commitState?.pending) {
      deferred.current = { revision: commitState.revision, text: draft };
      return;
    }
    deferred.current = null;
    perform(draft);
  };
  // Run against the latest callback/property model, never the preceding parse's
  // whole symbol definition. This is one field request, not a mutation queue.
  useEffect(() => {
    if (!commitState?.pending) submitted.current = null;
    const request = deferred.current;
    if (!request) return;
    if (!commitState || request.revision !== commitState.revision || disabled) {
      deferred.current = null;
      setDraft(value);
    } else if (!commitState.pending) {
      deferred.current = null;
      perform(request.text);
    }
  });
  return <label className="coral-field" style={fieldStyle}>{name ?? label}
    <input ref={inputRef} className="coral-input" aria-label={label} type={type} step={type === 'number' ? 'any' : undefined}
      value={draft} disabled={disabled} aria-describedby={describedBy}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit(); }
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation();
          deferred.current = null; setDraft(committed.current);
        }
      }} /></label>;
}

function Choice029<T extends string>({ label, name, value, options, onCommit, disabled, describedBy }: {
  label: string; name?: string; value: T; options: readonly T[]; onCommit: (next: T) => void;
  disabled?: boolean; describedBy?: string;
}) {
  return <label className="coral-field" style={fieldStyle}>{name ?? label}
    <select className="coral-input" aria-label={label} value={value} disabled={disabled} aria-describedby={describedBy}
      onChange={(event) => onCommit(event.target.value as T)}>
      {options.map((option) => <option key={option} value={option}>{option === '' ? 'none' : option}</option>)}
    </select></label>;
}

const finite = (text: string): number | undefined => {
  const value = text.trim() === '' ? Number.NaN : Number(text);
  return Number.isFinite(value) ? value : undefined;
};
/** Optional string member: empty text removes it. */
function withText<T extends object, K extends string>(object: T, key: K, text: string): T {
  const rest = Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
  return (text.trim() ? { ...rest, [key]: text } : rest) as T;
}
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export interface SymbolEditor029Props {
  definition: SuccessorUserSymbol029;
  symbol: Pick<ResolvedUserSymbol029, 'definition' | 'outline' | 'artwork029' | 'anchors'>;
  onCommit: (next: SuccessorUserSymbol029) => boolean;
  onBack: () => void;
  disabled?: boolean;
  describedBy?: string;
  commitState?: SourceFieldCommitState029;
}

export function SymbolEditor029({ definition, symbol, onCommit, onBack, disabled, describedBy, commitState }: SymbolEditor029Props) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [newPort, setNewPort] = useState('');
  useEffect(() => { nameRef.current?.focus(); }, []);
  const common = { disabled, describedBy, commitState };
  const set = (next: SuccessorUserSymbol029) => onCommit(next);
  const setAnchor = (index: number, anchor: Anchor) =>
    set({ ...definition, anchors: definition.anchors.map((item, at) => at === index ? anchor : item) });
  const setPort = (index: number, port: Port) =>
    set({ ...definition, ports: definition.ports.map((item, at) => at === index ? port : item) });
  const unit = (text: string, apply: (value: number) => boolean) => {
    const value = finite(text);
    return value !== undefined && value >= 0 && value <= 1 && apply(value);
  };
  const addAnchor = (kind: Anchor['kind']) => {
    let n = 1;
    while (definition.anchors.some((anchor) => anchor.id === `anchor${n}`)) n += 1;
    set({ ...definition, anchors: [...definition.anchors, kind === 'boundary'
      ? { kind, id: `anchor${n}`, side: 'N', at: 0.5 } : { kind, id: `anchor${n}`, x: 0.5, y: 0.5, exit: 'S' }] });
  };
  const { width: W, height: H } = definition.size;
  const scale = 200 / Math.max(W, H);
  const anchors = [...symbol.anchors.values()];

  return <section aria-label="Symbol editor" style={{ display: 'grid', gap: 10, padding: 8 }}>
    <button type="button" className="coral-button coral-button--quiet" onClick={onBack} style={{ justifySelf: 'start' }}>
      Back to node</button>
    <h2 style={{ fontSize: 13, margin: 0 }}>Symbol: {definition.name}</h2>
    <div style={{ fontSize: 12 }}><code>{definition.symbolId}</code></div>

    <fieldset style={{ display: 'grid', gap: 6 }}><legend>Details</legend>
      <Field029 label="Name" value={definition.name} inputRef={nameRef} {...common}
        onCommit={(text) => Boolean(text.trim()) && set({ ...definition, name: text })} />
      <Field029 label="Description" value={definition.description ?? ''} {...common}
        onCommit={(text) => set(withText(definition, 'description', text))} />
      <Field029 label="Tags" value={definition.tags.join(', ')} {...common}
        onCommit={(text) => set({ ...definition, tags: text.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
      <Field029 label="Source" value={definition.source ?? ''} {...common}
        onCommit={(text) => set(withText(definition, 'source', text))} />
      <Field029 label="License" value={definition.license ?? ''} {...common}
        onCommit={(text) => set(withText(definition, 'license', text))} />
    </fieldset>

    <fieldset style={{ display: 'grid', gap: 6 }}><legend>Frame</legend>
      {(['width', 'height'] as const).map((axis) => <Field029 key={axis} type="number"
        label={axis === 'width' ? 'Width' : 'Height'} value={String(definition.size[axis])} {...common}
        onCommit={(text) => { const value = finite(text);
          return value !== undefined && value > 0 && set({ ...definition, size: { ...definition.size, [axis]: value } }); }} />)}
      <Choice029 label="Label side" value={definition.label} options={LABELS} {...common}
        onCommit={(label) => set({ ...definition, label })} />
      <Choice029 label="Outline" value={definition.outline} options={OUTLINES} {...common}
        onCommit={(outline) => set({ ...definition, outline })} />
      <Choice029 label="Tint" value={definition.tint} options={TINTS} {...common}
        onCommit={(tint) => set({ ...definition, tint })} />
    </fieldset>

    <fieldset style={{ display: 'grid', gap: 6 }}><legend>Anchors</legend>
      <div role="img" aria-label={`Preview of ${definition.name}: ${plural(definition.anchors.length, 'anchor')}, ${
        plural(definition.ports.length, 'port')}`} style={{ position: 'relative', width: W * scale, height: H * scale }}>
        <UserSymbolArtwork029 symbol={symbol} width={W * scale} height={H * scale}
          style={{ position: 'absolute', inset: 0 }} />
        <svg aria-hidden="true" width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', color: 'var(--coral-accent, #0066ff)' }}>
          <path d={userOutlineShape029(symbol.outline).path} fill="none" stroke="currentColor"
            strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          {anchors.map((anchor) => <g key={anchor.id} data-coral-anchor={anchor.id}>
            {anchor.interior && <line data-coral-exit-ray="" x1={anchor.interior.x * W} y1={anchor.interior.y * H}
              x2={anchor.attachment.x * W} y2={anchor.attachment.y * H} stroke="currentColor"
              vectorEffect="non-scaling-stroke" />}
            {anchor.interior && <circle cx={anchor.interior.x * W} cy={anchor.interior.y * H} r={3 / scale}
              fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" />}
            <circle cx={anchor.attachment.x * W} cy={anchor.attachment.y * H} r={3 / scale} fill="currentColor" />
          </g>)}
        </svg>
      </div>
      {definition.anchors.map((anchor, index) => <div key={anchor.id} style={{ display: 'grid', gap: 4,
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', alignItems: 'end' }}>
        <span style={{ fontSize: 12, gridColumn: '1 / -1' }}><code>{anchor.id}</code> {anchor.kind}</span>
        {anchor.kind === 'boundary' ? <>
          <Choice029 label={`Side for anchor ${anchor.id}`} name="Side" value={anchor.side} options={SIDES} {...common}
            onCommit={(side) => setAnchor(index, { ...anchor, side })} />
          <Field029 type="number" label={`At for anchor ${anchor.id}`} name="At" value={String(anchor.at)} {...common}
            onCommit={(text) => unit(text, (at) => setAnchor(index, { ...anchor, at }))} />
        </> : <>
          <Field029 type="number" label={`X for anchor ${anchor.id}`} name="X" value={String(anchor.x)} {...common}
            onCommit={(text) => unit(text, (x) => setAnchor(index, { ...anchor, x }))} />
          <Field029 type="number" label={`Y for anchor ${anchor.id}`} name="Y" value={String(anchor.y)} {...common}
            onCommit={(text) => unit(text, (y) => setAnchor(index, { ...anchor, y }))} />
          <Choice029 label={`Exit for anchor ${anchor.id}`} name="Exit" value={anchor.exit} options={SIDES} {...common}
            onCommit={(exit) => setAnchor(index, { ...anchor, exit })} />
        </>}
        <button type="button" className="coral-button coral-button--quiet" disabled={disabled}
          aria-label={`Remove anchor ${anchor.id}`}
          onClick={() => set({ ...definition, anchors: definition.anchors.filter((_, at) => at !== index) })}>
          Remove</button>
      </div>)}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="coral-button coral-button--quiet" disabled={disabled}
          onClick={() => addAnchor('boundary')}>Add boundary anchor</button>
        <button type="button" className="coral-button coral-button--quiet" disabled={disabled}
          onClick={() => addAnchor('interior')}>Add interior anchor</button>
      </div>
    </fieldset>

    <fieldset style={{ display: 'grid', gap: 6 }}><legend>Ports</legend>
      {definition.ports.map((port, index) => <div key={port.id} style={{ display: 'grid', gap: 4,
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', alignItems: 'end' }}>
        <span style={{ fontSize: 12, gridColumn: '1 / -1' }}><code>{port.id}</code></span>
        <Choice029 label={`Direction for port ${port.id}`} name="Direction" value={port.direction} options={DIRECTIONS}
          {...common} onCommit={(direction) => setPort(index, { ...port, direction })} />
        <Choice029 label={`Anchor for port ${port.id}`} name="Anchor" value={port.anchor ?? ''} {...common}
          options={['', ...GENERIC_PORT_ANCHORS, ...definition.anchors.map((anchor) => anchor.id)]}
          onCommit={(anchor) => setPort(index, withText(port, 'anchor', anchor))} />
        <Field029 label={`Label for port ${port.id}`} name="Label" value={port.label ?? ''} {...common}
          onCommit={(text) => setPort(index, withText(port, 'label', text))} />
        <Field029 type="number" label={`Limit for port ${port.id}`} name="Limit" value={String(port.maxConnections ?? '')}
          {...common} onCommit={(text) => {
            const rest = withText(port, 'maxConnections', '');
            if (!text.trim()) return setPort(index, rest);
            const value = finite(text);
            return value !== undefined && Number.isInteger(value) && value > 0 &&
              setPort(index, { ...rest, maxConnections: value });
          }} />
        <button type="button" className="coral-button coral-button--quiet" disabled={disabled}
          aria-label={`Remove port ${port.id}`}
          onClick={() => set({ ...definition, ports: definition.ports.filter((_, at) => at !== index) })}>Remove</button>
      </div>)}
      <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
        <label className="coral-field" style={fieldStyle}>New port ID
          <input className="coral-input" aria-label="New port ID" value={newPort} disabled={disabled}
            onChange={(event) => setNewPort(event.target.value)} /></label>
        <button type="button" className="coral-button coral-button--quiet" disabled={disabled || !newPort.trim()}
          onClick={() => {
            if (set({ ...definition, ports: [...definition.ports, { id: newPort.trim(), direction: 'inout' }] })) setNewPort('');
          }}>Add port</button>
      </div>
    </fieldset>
  </section>;
}
