import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ShapeRenderer, UserSymbolArtwork029 } from '@coral-viz/viz';
import {
  searchSymbolPaletteEntries029,
  type AuthoringNodeOption,
  type AuthoringPortOption,
  type CreateAuthoringEdgeInput,
  type CreateAuthoringNodeInput,
  type SymbolPaletteEntry029,
} from './authoringModel';
import type { SourceOwnedNodeDraft028 } from './sourceOwnedEdits028';
import { CoralDialog } from './ui/CoralDialog';

export interface AuthoringDialogTheme {
  overlayBg: string;
  bg: string;
  border: string;
  text: string;
  mutedText: string;
  inputBg: string;
  inputText: string;
  buttonBg: string;
  buttonText: string;
}

export interface AuthoringEndpointOption extends AuthoringNodeOption {
  sourcePorts: AuthoringPortOption[];
  targetPorts: AuthoringPortOption[];
  portless: boolean;
  /** Saved-header Coral may leave a semantic port unspecified for layout to resolve. */
  allowAutomaticAttachment?: boolean;
}

type SubmitResult = { ok: true } | { ok: false; error: string };

export interface AuthoringDialogProps {
  kind: 'node' | 'edge';
  invoker: HTMLElement | null;
  nodeOptions: AuthoringNodeOption[];
  parentOptions: AuthoringNodeOption[];
  endpoints: AuthoringEndpointOption[];
  sourceOwnedNode028?: boolean;
  /** Source-owned Symbol list; omitted where the document offers no symbol choice. */
  symbolEntries029?: SymbolPaletteEntry029[];
  sourceOwnedEdge028?: boolean;
  positionedSequenceEdge028?: boolean;
  onSubmitNode: (input: CreateAuthoringNodeInput | SourceOwnedNodeDraft028) => SubmitResult;
  onSubmitEdge: (input: CreateAuthoringEdgeInput) => SubmitResult;
  onCancel: () => void;
  theme: AuthoringDialogTheme;
  themeName?: 'light' | 'dark';
}

const fieldStyle = (theme: AuthoringDialogTheme) => ({
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '8px 10px',
  border: `1px solid ${theme.border}`,
  borderRadius: 4,
  color: theme.inputText,
  background: theme.inputBg,
});

export function AuthoringDialog({
  kind,
  invoker,
  nodeOptions,
  parentOptions,
  endpoints,
  sourceOwnedNode028 = false,
  symbolEntries029,
  sourceOwnedEdge028 = false,
  positionedSequenceEdge028 = false,
  onSubmitNode,
  onSubmitEdge,
  onCancel,
  theme,
  themeName,
}: AuthoringDialogProps) {
  const initialRef = useRef<HTMLSelectElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const sourceEndpoints = endpoints.filter((endpoint) => endpoint.portless || endpoint.allowAutomaticAttachment || endpoint.sourcePorts.length > 0);
  const targetEndpoints = endpoints.filter((endpoint) => endpoint.portless || endpoint.allowAutomaticAttachment || endpoint.targetPorts.length > 0);
  const initialSourceId = sourceEndpoints[0]?.id ?? '';
  const initialTargetId = targetEndpoints.find((endpoint) => endpoint.id !== initialSourceId)?.id
    ?? targetEndpoints[0]?.id
    ?? '';
  const hasViableEdgePair = sourceEndpoints.some((sourceEndpoint) => targetEndpoints
    .some((targetEndpoint) => targetEndpoint.id !== sourceEndpoint.id));
  const [error, setError] = useState('');
  const [symbolId, setSymbolId] = useState(nodeOptions[0]?.id ?? '');
  const [nodeId, setNodeId] = useState('');
  const [nodeType, setNodeType] = useState(nodeOptions[0]?.id ?? '');
  const [symbolQuery, setSymbolQuery] = useState('');
  const [userSymbol, setUserSymbol] = useState<SymbolPaletteEntry029>();
  const symbolListId = useId();
  const [hideNodeLabel, setHideNodeLabel] = useState(false);
  const [label, setLabel] = useState('');
  const [parentId, setParentId] = useState('');
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [targetId, setTargetId] = useState(initialTargetId);
  const [edgeId, setEdgeId] = useState('');
  const [edgeType, setEdgeType] = useState('');
  const source = endpoints.find((endpoint) => endpoint.id === sourceId);
  const target = endpoints.find((endpoint) => endpoint.id === targetId);
  const [sourcePortId, setSourcePortId] = useState(source?.allowAutomaticAttachment ? '' : source?.sourcePorts[0]?.id ?? '');
  const [targetPortId, setTargetPortId] = useState(target?.allowAutomaticAttachment ? '' : target?.targetPorts[0]?.id ?? '');

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  const cancel = () => onCancel();

  const accept = (result: SubmitResult) => {
    if (!result.ok) setError(result.error);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (kind === 'node') {
      accept(onSubmitNode(sourceOwnedNode028
        ? { id: nodeId.trim(), type: nodeType.trim(),
          ...(userSymbol?.symbol ? { symbol: userSymbol.symbol } : {}),
          ...(userSymbol?.definition ? { definition: userSymbol.definition } : {}),
          ...(hideNodeLabel ? { label: '' } : label.trim() ? { label: label.trim() } : {}),
          ...(parentId ? { parentId } : {}) }
        : { symbolId, label: label.trim(), ...(parentId ? { parentId } : {}) }));
    } else {
      if (positionedSequenceEdge028 && !edgeId.trim()) {
        setError('Give this inserted message an ID so existing message identities stay unchanged.');
        return;
      }
      accept(onSubmitEdge({ sourceId, sourcePortId, targetId, targetPortId,
        ...(sourceOwnedEdge028 && edgeId.trim() ? { id: edgeId.trim() } : {}),
        ...(sourceOwnedEdge028 && edgeType.trim() ? { type: edgeType.trim() } : {}),
        ...(label !== '' ? { label } : {}),
      }));
    }
  };

  const labelStyle = { display: 'grid', gap: 4, color: theme.text, fontSize: 13 };
  const title = kind === 'node' ? 'Create node' : 'Create edge';

  return (
    <CoralDialog
      themeName={themeName}
      open
      title={title}
      closeLabel={`Close ${title}`}
      onClose={cancel}
      initialFocus="first"
      restoreFocusTo={invoker}
    >
        <form aria-label={`${title} form`} onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          {kind === 'node' ? (
            <>
              {sourceOwnedNode028 ? <>
                <label style={labelStyle}>
                  Node ID
                  <input data-initial-focus aria-label="Node ID" value={nodeId}
                    onChange={(event) => { setNodeId(event.target.value); setError(''); }}
                    style={fieldStyle(theme)} />
                </label>
                <label style={labelStyle}>
                  Node type
                  <input aria-label="Node type" list="coral-node-type-028" value={nodeType}
                    onChange={(event) => { setNodeType(event.target.value); setError(''); }}
                    style={fieldStyle(theme)} />
                  <datalist id="coral-node-type-028">
                    {nodeOptions.map((option) => <option key={option.id} value={option.id} />)}
                  </datalist>
                </label>
              </> : <label style={labelStyle}>
                Node type or symbol
                <select
                  ref={initialRef}
                  data-initial-focus
                  aria-label="Node type or symbol"
                  value={symbolId}
                  onChange={(event) => { setSymbolId(event.target.value); setError(''); }}
                  style={fieldStyle(theme)}
                >
                  {nodeOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label} ({option.id})</option>
                  ))}
                </select>
              </label>}
              <label style={labelStyle}>
                Node label {sourceOwnedNode028 ? '(optional; defaults to ID)' : ''}
                <input
                  aria-label="Node label"
                  value={label}
                  disabled={sourceOwnedNode028 && hideNodeLabel}
                  onChange={(event) => { setLabel(event.target.value); setError(''); }}
                  style={fieldStyle(theme)}
                />
              </label>
              {sourceOwnedNode028 && <label style={{ ...labelStyle, display: 'flex', alignItems: 'center' }}>
                <input type="checkbox" aria-label="Hide node label" checked={hideNodeLabel}
                  onChange={(event) => { setHideNodeLabel(event.target.checked); setError(''); }} />
                Hide node label (writes as "")
              </label>}
              <label style={labelStyle}>
                Parent container
                <select
                  aria-label="Parent container"
                  value={parentId}
                  onChange={(event) => { setParentId(event.target.value); setError(''); }}
                  style={fieldStyle(theme)}
                >
                  <option value="">No parent</option>
                  {parentOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              {symbolEntries029 && <SymbolList029 entries={symbolEntries029} query={symbolQuery}
                onQuery={setSymbolQuery} idPrefix={symbolListId} theme={theme}
                checkedKey={userSymbol?.key ?? symbolEntries029.find((entry) =>
                  entry.typeWord !== undefined && entry.typeWord === nodeType.trim())?.key}
                onChoose={(entry) => {
                  setError('');
                  if (entry.typeWord !== undefined) { setUserSymbol(undefined); setNodeType(entry.typeWord); }
                  else setUserSymbol(entry);
                }} />}
            </>
          ) : (
            <>
              {sourceOwnedEdge028 && <>
                <label style={labelStyle}>
                  Edge ID {positionedSequenceEdge028 ? '(required for insertion)' : '(optional)'}
                  <input aria-label="Edge ID" value={edgeId}
                    onChange={(event) => { setEdgeId(event.target.value); setError(''); }}
                    style={fieldStyle(theme)} />
                </label>
                <label style={labelStyle}>
                  Connector type (optional)
                  <input aria-label="Connector type" value={edgeType}
                    onChange={(event) => { setEdgeType(event.target.value); setError(''); }}
                    style={fieldStyle(theme)} />
                </label>
              </>}
              <label style={labelStyle}>
                Source node
                <select
                  ref={initialRef}
                  data-initial-focus
                  aria-label="Source node"
                  value={sourceId}
                  onChange={(event) => {
                    const next = endpoints.find((endpoint) => endpoint.id === event.target.value);
                    setSourceId(event.target.value);
                    setSourcePortId(next?.allowAutomaticAttachment ? '' : next?.sourcePorts[0]?.id ?? '');
                    setError('');
                  }}
                  style={fieldStyle(theme)}
                >
                  {sourceEndpoints.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.label}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Source port
                <select
                  aria-label="Source port"
                  value={sourcePortId}
                  onChange={(event) => { setSourcePortId(event.target.value); setError(''); }}
                  style={fieldStyle(theme)}
                >
                  {(source?.portless || source?.allowAutomaticAttachment) && <option value="">Automatic attachment</option>}
                  {(source?.sourcePorts ?? []).map((port) => (
                    <option key={port.id} value={port.id}>{port.label}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Target node
                <select
                  aria-label="Target node"
                  value={targetId}
                  onChange={(event) => {
                    const next = endpoints.find((endpoint) => endpoint.id === event.target.value);
                    setTargetId(event.target.value);
                    setTargetPortId(next?.allowAutomaticAttachment ? '' : next?.targetPorts[0]?.id ?? '');
                    setError('');
                  }}
                  style={fieldStyle(theme)}
                >
                  {targetEndpoints.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.label}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Target port
                <select
                  aria-label="Target port"
                  value={targetPortId}
                  onChange={(event) => { setTargetPortId(event.target.value); setError(''); }}
                  style={fieldStyle(theme)}
                >
                  {(target?.portless || target?.allowAutomaticAttachment) && <option value="">Automatic attachment</option>}
                  {(target?.targetPorts ?? []).map((port) => (
                    <option key={port.id} value={port.id}>{port.label}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Edge label
                <input
                  aria-label="Edge label"
                  value={label}
                  onChange={(event) => { setLabel(event.target.value); setError(''); }}
                  style={fieldStyle(theme)}
                />
              </label>
            </>
          )}

          <div
            ref={errorRef}
            role={error ? 'alert' : 'status'}
            aria-live="assertive"
            aria-atomic="true"
            tabIndex={error ? -1 : undefined}
            style={{ minHeight: 18, color: error ? 'var(--coral-error)' : theme.mutedText, fontSize: 13 }}
          >
            {error || (kind === 'node' && nodeOptions.length === 0
              ? 'No symbols are available for the current notation.'
              : kind === 'edge' && !hasViableEdgePair
                ? 'No distinct source and target with compatible attachments are available.'
                : '')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="coral-button" type="button" onClick={cancel}>Cancel</button>
            <button
              className="coral-button coral-button--primary"
              type="submit"
              disabled={kind === 'node' ? nodeOptions.length === 0 : !hasViableEdgePair}
            >
              {title}
            </button>
          </div>
        </form>
    </CoralDialog>
  );
}

/** Native radios under a whole-tag search (c5-design.md "Dialog"). */
function SymbolList029({ entries, query, onQuery, checkedKey, onChoose, idPrefix, theme }: {
  entries: SymbolPaletteEntry029[]; query: string; onQuery: (query: string) => void;
  checkedKey?: string; onChoose: (entry: SymbolPaletteEntry029) => void; idPrefix: string;
  theme: AuthoringDialogTheme;
}) {
  const shown = searchSymbolPaletteEntries029(entries, query);
  const checked = entries.find((entry) => entry.key === checkedKey);
  return <fieldset style={{ margin: 0, padding: 8, border: `1px solid ${theme.border}`, borderRadius: 4,
    display: 'grid', gap: 6, color: theme.text, fontSize: 13 }}>
    <legend>{checked ? `Symbol: ${checked.name}` : 'Symbol'}</legend>
    <input type="search" aria-label="Search symbols" value={query} style={fieldStyle(theme)}
      onChange={(event) => onQuery(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} />
    <div role="status" style={{ color: theme.mutedText, fontSize: 12 }}>
      {shown.length ? `${Math.min(100, shown.length)} of ${entries.length} symbols${shown.length > 100 ? "; refine your search" : ""}` : 'No symbols match'}
    </div>
    <div style={{ display: 'grid', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
      {shown.slice(0, 100).map((entry, index) => {
        const describedBy = `${idPrefix}-${index}`;
        const shape = entry.user ? undefined : entry.shape;
        const scale = shape ? 24 / Math.max(shape.defaultSize.width, shape.defaultSize.height) : 1;
        return <label key={entry.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="radio" name={`${idPrefix}-symbol`} value={entry.key} checked={entry.key === checkedKey}
            aria-label={entry.name} aria-describedby={describedBy} onChange={() => onChoose(entry)} />
          <span data-coral-symbol-thumbnail="" aria-hidden="true" style={{ width: 24, height: 24,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {entry.user ? <UserSymbolArtwork029 symbol={entry.user} fit={24} color={theme.text} />
              : shape && <ShapeRenderer shape={shape} width={shape.defaultSize.width * scale}
                height={shape.defaultSize.height * scale} fill="none" stroke={theme.text} strokeWidth={1} />}
          </span>
          <span>{entry.name}</span>
          <span id={describedBy} style={{ color: theme.mutedText, fontSize: 12 }}>
            {entry.typeWord !== undefined ? `bundled, type ${entry.typeWord}`
              : `${entry.kind === 'library' ? 'My Icons' : 'document'} symbol ${entry.symbol}`}
          </span>
        </label>;
      })}
    </div>
  </fieldset>;
}
