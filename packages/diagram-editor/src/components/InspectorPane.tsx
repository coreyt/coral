/**
 * InspectorPane - Right panel with context-driven content
 *
 * Auto-switches based on selection state:
 * - No selection → "Properties" header, renders SettingsPanel
 * - Node selected → "Node: {label}" header with back arrow, renders NodePropertiesPanel
 *
 * Follows Coral Design Standard (M3 compact density).
 */

import type { Edge, Node } from '@xyflow/react';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Tabs } from 'radix-ui';
import {
  SettingsPanel,
  NodePropertiesPanel,
  type DiagramFontSettings,
  type DocumentSettings,
  type LayoutPresetId,
  type PropertyChange,
} from '@coral-viz/viz';

import { UserSymbolArtwork029 } from '@coral-viz/viz';
import type { ResolvedUserSymbol029, SuccessorUserSymbol029 } from '@coral-viz/render';
import { SequenceInspector, type SequenceInspectorProps } from './SequenceInspector';
import { Field029, SymbolEditor029, type SourceFieldCommitState029 } from './SymbolEditor029';

/** One semantic port of the selected node; only `owner: 'node'` ports are authored there. */
export interface InspectorPort029 {
  id: string;
  direction: 'in' | 'out' | 'inout';
  label?: string;
  maxConnections?: number;
  owner: 'node' | 'symbol' | 'catalog';
  /** The defining symbol's name, for ports the node does not author. */
  ownerName?: string;
}

export interface InspectorPaneProps {
  activeTab?: 'selection' | 'diagram';
  onTabChange?: (tab: 'selection' | 'diagram') => void;
  widthPx?: number;
  onWidthChange?: (widthPx: number) => void;
  onClose?: () => void;
  onEscapeRequest?: () => 'consumed' | 'unhandled';
  selectedNode: Node | null;
  selectedEdge?: Edge | null;
  nodeLabelPlacementEditable?: boolean;
  nodeLabelPlacementRevision?: string;
  nodeLabelPlacement?: { side: string; offset?: number };
  onNodeLabelPlacementEdit?: (nodeId: string, placement: { side: string; offset: number }, basis: string) => boolean;
  sourceOwnedEdgeLabels?: boolean;
  edgeLabelEditable?: boolean;
  onEdgeLabelEdit?: (edgeId: string, label: string) => boolean;
  onEdgeLabelRemove?: (edgeId: string) => boolean;
  selectionSummary?: { kind: 'none' | 'node' | 'edge' | 'mixed'; count: number; label?: string };
  onDeselectNode: () => void;
  // Document settings content
  documentSettings: DocumentSettings;
  selectedPreset: LayoutPresetId;
  fontDraft: DiagramFontSettings;
  onFontDraftChange: (settings: DiagramFontSettings) => void;
  documentKey: string | number;
  availableNotations: Array<{ id: string; name: string }>;
  onDocumentSettingsChange: (settings: DocumentSettings) => void;
  onPresetChange: (preset: LayoutPresetId) => void;
  onApplyLayout: () => void;
  onApplyFont?: (settings: DiagramFontSettings) => void;
  // Selection content
  onPropertyChange: (change: PropertyChange) => void;
  onAddProperty: (nodeId: string, key: string, value: unknown) => void;
  onRemoveProperty: (nodeId: string, key: string) => void;
  onPropertyEditSessionStart?: (field: string) => void;
  onPropertyEditSessionEnd?: (field: string) => void;
  onPropertyEditSessionCancel?: (field: string) => void;
  sourceFormat?: 'coral' | 'mermaid' | 'dot' | 'plantuml';
  sourceOwnedImport?: boolean;
  mutationsDisabled?: boolean;
  /** Whether font edits are locked; defaults to the general mutation lock. */
  fontSettingsDisabled?: boolean;
  mutationDisabledReason?: string;
  /** Compact owner label for the header chip, such as `Updating source`. */
  mutationDisabledLabel?: string;
  onToggleNodePin?: (nodeId: string) => void;
  onReleaseNodePosition?: (nodeId: string) => void;
  onConvertToCoral?: () => void;
  theme: Record<string, string>;
  /** A UML sequence document replaces node properties with the sequence inspector. */
  sequence?: SequenceInspectorProps;
  /** Source-owned Coral: the selected node's user symbol (Slice 60 C5). */
  userSymbol029?: { definition: SuccessorUserSymbol029; symbol: ResolvedUserSymbol029; digest?: string };
  /** Source-owned Coral: the selected node's semantic ports. */
  ports029?: InspectorPort029[];
  onPortFieldsEdit029?: (nodeId: string, portId: string,
    fields: { label?: string; maxConnections?: number }) => boolean;
  onSymbolDefinitionEdit029?: (symbolId: string, next: SuccessorUserSymbol029) => boolean;
  /** Whether the accepted source admits these source edits; like label placement, not the GraphIR property lock. */
  sourceEditable029?: boolean;
  sourceCommitState029?: SourceFieldCommitState029;
}

function SymbolSummary029({ value, onEdit, editRef, disabled, describedBy }: {
  value: NonNullable<InspectorPaneProps['userSymbol029']>; onEdit?: () => void;
  editRef: RefObject<HTMLButtonElement | null>; disabled: boolean; describedBy?: string;
}) {
  const { definition, symbol, digest } = value;
  const row = (term: string, detail: ReactNode) => <><dt style={{ fontWeight: 600 }}>{term}</dt>
    <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{detail}</dd></>;
  return <fieldset style={{ margin: '0 0 12px', padding: 10, border: '1px solid var(--coral-border)', borderRadius: 6,
    display: 'grid', gap: 8, fontSize: 12 }}><legend>Symbol</legend>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <UserSymbolArtwork029 symbol={symbol} fit={24} color="currentColor" />
      <span>{definition.name}</span> <code>{definition.symbolId}</code>
    </div>
    <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', margin: 0 }}>
      {row('Description', definition.description ?? 'None')}
      {row('Tags', definition.tags.length ? definition.tags.join(', ') : 'None')}
      {row('Source', definition.source ?? 'Not stated')}
      {row('License', definition.license ?? 'Not stated')}
      {row('Digest', <code style={{ userSelect: 'text' }}>{digest ?? 'Unavailable'}</code>)}
    </dl>
    {onEdit && <button ref={editRef} type="button" className="coral-button coral-button--quiet" disabled={disabled}
      aria-describedby={describedBy} onClick={onEdit} style={{ justifySelf: 'start' }}>Edit symbol</button>}
  </fieldset>;
}

function NodePorts029({ nodeId, ports, onCommit, disabled, describedBy, commitState }: {
  commitState?: SourceFieldCommitState029;
  nodeId: string; ports: InspectorPort029[]; disabled: boolean; describedBy?: string;
  onCommit?: NonNullable<InspectorPaneProps['onPortFieldsEdit029']>;
}) {
  const commit = (port: InspectorPort029, fields: { label?: string; maxConnections?: number }) =>
    onCommit?.(nodeId, port.id, Object.fromEntries(Object.entries(fields).filter(([, item]) => item !== undefined))) ?? false;
  return <fieldset style={{ margin: '0 0 12px', padding: 10, border: '1px solid var(--coral-border)', borderRadius: 6,
    display: 'grid', gap: 8, fontSize: 12 }}><legend>Ports</legend>
    {ports.map((port) => <div key={port.id} style={{ display: 'grid', gap: 4 }}>
      <span><code>{port.id}</code> {port.direction}</span>
      {port.owner === 'node' && onCommit ? <div style={{ display: 'grid', gap: 4, gridTemplateColumns: '1fr 1fr' }}>
        <Field029 label={`Label for port ${port.id}`} name="Label" value={port.label ?? ''} disabled={disabled}
          describedBy={describedBy} commitState={commitState}
          onCommit={(text) => commit(port, { label: text || undefined, maxConnections: port.maxConnections })} />
        <Field029 type="number" label={`Limit for port ${port.id}`} name="Limit" value={String(port.maxConnections ?? '')}
          disabled={disabled} describedBy={describedBy} commitState={commitState} onCommit={(text) => {
            const value = text.trim() === '' ? undefined : Number(text);
            return (value === undefined || Number.isFinite(value)) &&
              commit(port, { label: port.label, maxConnections: value });
          }} />
      </div> : <span>{port.label !== undefined ? `${port.label}; ` : ''}{port.maxConnections !== undefined
        ? `limit ${port.maxConnections}; ` : ''}<span>{`Defined by ${port.ownerName ?? 'its symbol'}`}</span></span>}
    </div>)}
  </fieldset>;
}

function NodeLabelPlacementEditor028({ id, placement, basis, onCommit }: {
  id: string; placement?: { side: string; offset?: number }; basis: string;
  onCommit: NonNullable<InspectorPaneProps['onNodeLabelPlacementEdit']>;
}) {
  const [side, setSide] = useState(placement?.side ?? 'center');
  const [offset, setOffset] = useState(String(placement?.offset ?? 0));
  useEffect(() => { setSide(placement?.side ?? 'center'); setOffset(String(placement?.offset ?? 0)); }, [id, placement?.side, placement?.offset, basis]);
  return <fieldset style={{ margin: '0 0 12px', padding: 10, border: '1px solid var(--coral-border)', borderRadius: 6,
    display: 'grid', gap: 8, fontSize: 12, fontFamily: 'inherit' }}><legend>Label placement</legend>
    <label className="coral-field" style={{ display: 'grid', gap: 4 }}>Label side <select className="coral-input" aria-label="Label side" value={side}
      onChange={(event) => { setSide(event.target.value); if (event.target.value === 'center') setOffset('0'); }}>
      {['center', 'above', 'below', 'left', 'right'].map((value) => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <label className="coral-field" style={{ display: 'grid', gap: 4 }}>Label offset <input className="coral-input" aria-label="Label offset" type="number" min="0" step="any" value={offset}
      disabled={side === 'center'} onChange={(event) => setOffset(event.target.value)} /></label>
    <button type="button" className="coral-button coral-button--quiet" disabled={!offset.trim() || !Number.isFinite(Number(offset)) || Number(offset) < 0}
      onClick={() => onCommit(id, { side, offset: Number(offset) }, basis)}>Apply label placement</button>
  </fieldset>;
}

function EdgeLabelEditor({ edge, editable, onCommit, onRemove, commitState }: {
  commitState?: SourceFieldCommitState029;
  edge: Edge; editable: boolean; onCommit: (edgeId: string, label: string) => boolean;
  onRemove?: (edgeId: string) => boolean;
}) {
  return (
    <div style={{ padding: '8px' }}>
      <Field029 label="Connector label" value={typeof edge.label === 'string' ? edge.label : ''}
        disabled={!editable} commitState={commitState} onCommit={text => onCommit(edge.id, text)} />
      {typeof edge.label === 'string' && onRemove && <button type="button"
        aria-label="Remove connector label" disabled={!editable || commitState?.pending}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onRemove(edge.id);
        }}>
        Remove label
      </button>}
    </div>
  );
}

export function InspectorPane({
  activeTab = 'selection',
  onTabChange,
  widthPx = 320,
  onWidthChange,
  onClose,
  onEscapeRequest,
  selectedNode,
  selectedEdge,
  nodeLabelPlacementEditable = false,
  nodeLabelPlacementRevision,
  nodeLabelPlacement,
  onNodeLabelPlacementEdit,
  sourceOwnedEdgeLabels = false,
  edgeLabelEditable = false,
  onEdgeLabelEdit,
  onEdgeLabelRemove,
  selectionSummary = selectedNode ? { kind: 'node', count: 1 } : { kind: 'none', count: 0 },
  onDeselectNode,
  documentSettings,
  selectedPreset,
  fontDraft,
  onFontDraftChange,
  documentKey,
  availableNotations,
  onDocumentSettingsChange,
  onPresetChange,
  onApplyLayout,
  onApplyFont,
  onPropertyChange,
  onAddProperty,
  onRemoveProperty,
  onPropertyEditSessionStart,
  onPropertyEditSessionEnd,
  onPropertyEditSessionCancel,
  sourceFormat = 'coral',
  sourceOwnedImport = false,
  mutationsDisabled = false,
  fontSettingsDisabled,
  mutationDisabledReason,
  mutationDisabledLabel,
  onToggleNodePin,
  onReleaseNodePosition,
  onConvertToCoral,
  theme,
  sequence,
  userSymbol029,
  ports029,
  onPortFieldsEdit029,
  onSymbolDefinitionEdit029,
  sourceEditable029 = true,
  sourceCommitState029,
}: InspectorPaneProps) {
  const [editingSymbol, setEditingSymbol] = useState(false);
  const editSymbolRef = useRef<HTMLButtonElement>(null);
  const returnToEdit = useRef(false);
  useEffect(() => { setEditingSymbol(false); }, [selectedNode?.id]);
  useEffect(() => {
    if (!editingSymbol && returnToEdit.current) { returnToEdit.current = false; editSymbolRef.current?.focus(); }
  }, [editingSymbol]);
  const panelRef = useRef<HTMLElement>(null);
  const lockReasonId = useId();
  const showLockReason = mutationsDisabled && Boolean(mutationDisabledReason);
  const lockDescription = showLockReason ? lockReasonId : undefined;
  const pointerResize = useRef<{ startX: number; startWidth: number } | null>(null);
  const escapeAfterCancel = useRef(false);
  const [effectiveSize, setEffectiveSize] = useState({ width: widthPx, maximum: 440 });
  const showSelection = selectionSummary.kind !== 'none';
  // Authored geometry is parent-local source data, not the resolved display
  // coordinate; the canonical projection deliberately omits it (R-053 AC-2).
  const authoredPosition = (selectedNode?.data as { authoredPosition?: { x: number; y: number } } | undefined)
    ?.authoredPosition;
  const selectedPinned = (selectedNode?.data as { pinned?: boolean } | undefined)?.pinned === true;
  const nodeLabel = selectedNode
    ? ((selectedNode.data as any).label || selectedNode.id)
    : selectionSummary.kind === 'edge' && selectedEdge
      ? (typeof selectedEdge.label === 'string' && selectedEdge.label || selectedEdge.id)
    : selectionSummary.label ?? '';
  const truncatedLabel = nodeLabel.length > 20
    ? nodeLabel.slice(0, 20) + '...'
    : nodeLabel;

  useEffect(() => {
    const panel = panelRef.current;
    const stage = panel?.parentElement;
    if (!panel || !stage) return undefined;

    const update = () => {
      const measuredWidth = panel.getBoundingClientRect().width;
      const availableWidth = stage.getBoundingClientRect().width;
      const maximum = availableWidth > 0
        ? Math.max(280, Math.min(440, availableWidth - 250))
        : 440;
      setEffectiveSize({
        width: measuredWidth > 0 ? measuredWidth : Math.min(widthPx, maximum),
        maximum,
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    observer.observe(stage);
    update();
    return () => observer.disconnect();
  }, [widthPx]);

  return (
    <aside
      ref={panelRef}
      aria-label="Properties panel"
      className="coral-properties"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        const consumed = event.defaultPrevented || onEscapeRequest?.() === 'consumed';
        if (consumed && !escapeAfterCancel.current) {
          escapeAfterCancel.current = true;
          return;
        }
        escapeAfterCancel.current = false;
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
      }}
      style={{
        width: `${widthPx}px`,
        flexShrink: 0,
        background: theme.inspectorBg,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${theme.inspectorBorder}`,
      }}
    >
      <div
        role="separator"
        aria-label="Resize Properties"
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={Math.round(effectiveSize.maximum)}
        aria-valuenow={Math.round(effectiveSize.width)}
        tabIndex={0}
        className="coral-properties__separator"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const step = event.shiftKey ? 4 : 16;
          const direction = event.key === 'ArrowLeft' ? 1 : -1;
          onWidthChange?.(Math.max(280, Math.min(effectiveSize.maximum, effectiveSize.width + direction * step)));
        }}
        onPointerDown={(event) => {
          pointerResize.current = { startX: event.clientX, startWidth: effectiveSize.width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!pointerResize.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          onWidthChange?.(Math.max(280, Math.min(effectiveSize.maximum,
            pointerResize.current.startWidth + pointerResize.current.startX - event.clientX)));
        }}
        onPointerUp={(event) => {
          pointerResize.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: theme.inspectorHeaderBg,
          borderBottom: `1px solid ${theme.inspectorBorder}`,
          minHeight: '36px',
        }}
      >
        {showSelection && (
          <button
            onClick={onDeselectNode}
            aria-label="Back to properties"
            title="Back to properties"
            style={{
              background: 'none',
              border: 'none',
              color: theme.tabActiveText,
              fontSize: '14px',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '3px',
              lineHeight: 1,
            }}
          >
            ←
          </button>
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: '12px',
            fontWeight: 600,
            color: theme.tabActiveText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {selectionSummary.kind === 'node' ? `Node: ${truncatedLabel}`
            : selectionSummary.kind === 'edge' ? `Edge: ${truncatedLabel}`
              : selectionSummary.kind === 'mixed' ? `${selectionSummary.count} objects selected`
                : 'Properties'}
        </span>
        {/* Displayed, not announced (Slice 94 design §5.4, §8.3): a refused
            attempt announces once through the shell guidance region. The
            chip sits in the existing header row, so a lock that toggles while
            the user types adds no row (CR94-C2-F1). The title takes the free
            space, so the chip and Close stay right-anchored and only the
            title truncates (CR94-C3-F1). The full reason is the locked
            controls' description. */}
        {showLockReason && (
          <>
            {mutationDisabledLabel && <span
              aria-hidden="true"
              title={mutationDisabledReason}
              style={{
                flexShrink: 0,
                fontSize: '9px',
                padding: '1px 4px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                backgroundColor: 'transparent',
                color: theme.warningText,
                border: `1px solid ${theme.warningText}`,
              }}
            >
              {mutationDisabledLabel}
            </span>}
            <span
              id={lockReasonId}
              style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
                overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
            >
              {mutationDisabledReason}
            </span>
          </>
        )}
        {onClose && <button type="button" className="coral-button coral-button--quiet" aria-label="Close panel" onClick={onClose}>×</button>}
      </div>

      <Tabs.Root
        value={activeTab}
        activationMode="manual"
        onValueChange={(value) => onTabChange?.(value as 'selection' | 'diagram')}
        className="coral-properties__tabs"
      >
        <Tabs.List aria-label="Properties views" className="coral-tab-list">
          <Tabs.Trigger value="selection" className="coral-tab">Selection</Tabs.Trigger>
          <Tabs.Trigger value="diagram" className="coral-tab">Diagram</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="selection" forceMount className="coral-properties__content">
          {sequence ? (
            <SequenceInspector {...sequence} />
          ) : selectionSummary.kind === 'node' && selectedNode && editingSymbol && userSymbol029 &&
            onSymbolDefinitionEdit029 ? (
            <SymbolEditor029 key={selectedNode?.id} commitState={sourceCommitState029} definition={userSymbol029.definition} symbol={userSymbol029.symbol}
              disabled={!sourceEditable029}
              onCommit={(next) => onSymbolDefinitionEdit029(userSymbol029.definition.symbolId, next)}
              onBack={() => { returnToEdit.current = true; setEditingSymbol(false); }} />
          ) : selectionSummary.kind === 'node' && selectedNode ? (
            <div className="coral-node-properties" style={{ padding: '8px' }}>
              <div aria-label="Position constraints" style={{ marginBottom: '10px' }}>
                {sourceFormat === 'coral' ? (
                  <>
                    <div style={{ fontSize: '12px', marginBottom: '6px', color: theme.inspectorText }}>
                      {authoredPosition
                        ? `Exact position @ ${Math.round(authoredPosition.x)}, ${Math.round(authoredPosition.y)}`
                        : 'Position is layout-managed'}
                    </div>
                    <button
                      type="button"
                      className="coral-button coral-button--quiet"
                      disabled={mutationsDisabled}
                      aria-describedby={lockDescription}
                      aria-pressed={selectedPinned}
                      onClick={() => onToggleNodePin?.(selectedNode.id)}
                    >
                      {selectedPinned ? 'Unpin' : 'Pin'}
                    </button>
                    {authoredPosition && (
                      <button
                        type="button"
                        className="coral-button coral-button--quiet"
                        disabled={mutationsDisabled}
                        aria-describedby={lockDescription}
                        onClick={() => onReleaseNodePosition?.(selectedNode.id)}
                      >
                        Release position
                      </button>
                    )}
                  </>
                ) : sourceFormat === 'mermaid' && !sourceOwnedImport ? (
                  <button
                    type="button"
                    className="coral-button coral-button--quiet"
                    disabled={mutationsDisabled}
                    aria-describedby={lockDescription}
                    onClick={onConvertToCoral}
                  >
                    Convert to Coral to edit Exact position
                  </button>
                ) : (
                  <div style={{ fontSize: '12px', color: theme.inspectorText }}>
                    Edit the {sourceFormat === 'dot' ? 'DOT' : sourceFormat === 'plantuml' ? 'PlantUML' : 'Mermaid'} text to change this diagram.
                  </div>
                )}
              </div>
              {nodeLabelPlacementEditable && nodeLabelPlacementRevision && onNodeLabelPlacementEdit &&
                <NodeLabelPlacementEditor028 id={selectedNode.id} placement={nodeLabelPlacement}
                  basis={nodeLabelPlacementRevision} onCommit={onNodeLabelPlacementEdit} />}
              {userSymbol029 && <SymbolSummary029 value={userSymbol029} editRef={editSymbolRef}
                disabled={!sourceEditable029}
                onEdit={onSymbolDefinitionEdit029 ? () => setEditingSymbol(true) : undefined} />}
              {ports029 && ports029.length > 0 && <NodePorts029 key={selectedNode.id} commitState={sourceCommitState029} nodeId={selectedNode.id} ports={ports029}
                onCommit={onPortFieldsEdit029} disabled={!sourceEditable029} />}
              <div aria-disabled={mutationsDisabled} style={mutationsDisabled ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
                <NodePropertiesPanel
                  selectedNode={selectedNode as any}
                  onPropertyChange={onPropertyChange}
                  onAddProperty={onAddProperty}
                  onRemoveProperty={onRemoveProperty}
                  onEditSessionStart={onPropertyEditSessionStart}
                  onEditSessionEnd={onPropertyEditSessionEnd}
                  onEditSessionCancel={onPropertyEditSessionCancel}
                  disabled={mutationsDisabled}
                />
              </div>
            </div>
          ) : selectionSummary.kind === 'edge' && sourceOwnedEdgeLabels && selectedEdge && onEdgeLabelEdit ? (
            <EdgeLabelEditor key={selectedEdge.id} commitState={sourceCommitState029} edge={selectedEdge} editable={edgeLabelEditable}
              onCommit={onEdgeLabelEdit} onRemove={onEdgeLabelRemove} />
          ) : selectionSummary.kind === 'edge' ? (
            <div className="coral-empty-state">
              <strong>Edge selected</strong>
              <span>Edge properties are read-only in this release.</span>
            </div>
          ) : selectionSummary.kind === 'mixed' ? (
            <div className="coral-empty-state">
              <strong>{selectionSummary.count} objects selected</strong>
              <span>Select one object to inspect its properties.</span>
            </div>
          ) : (
            <div className="coral-empty-state">
              <strong>No selection</strong>
              <span>Select a node or edge on the canvas to inspect it.</span>
            </div>
          )}
        </Tabs.Content>
        <Tabs.Content value="diagram" forceMount className="coral-properties__content">
          <SettingsPanel
            documentSettings={documentSettings}
            selectedPreset={selectedPreset}
            notations={availableNotations}
            onDocumentSettingsChange={onDocumentSettingsChange}
            onPresetChange={onPresetChange}
            onApplyLayout={onApplyLayout}
            fontDraft={fontDraft}
            onFontDraftChange={onFontDraftChange}
            onFontCommit={onApplyFont}
            fontDisabled={fontSettingsDisabled ?? mutationsDisabled}
            disabled={mutationsDisabled}
            documentKey={documentKey}
            theme={{
              bg: theme.inspectorBg,
              text: theme.inspectorText,
              labelText: theme.tabInactiveText,
              mutedText: theme.controlTextMuted || theme.tabInactiveText,
              inputBg: theme.controlBg,
              inputText: theme.inspectorText,
              inputBorder: theme.inspectorBorder,
              divider: theme.inspectorBorder,
              accentText: theme.tabActiveIndicator,
            }}
          />
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
