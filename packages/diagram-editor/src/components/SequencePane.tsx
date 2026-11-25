/**
 * Canvas pane for UML sequence documents (Slice 70). It replaces the generic
 * React Flow canvas: the shared sequence scene is the only geometry, so there
 * is no dragging, connecting, or reflow.
 */

import { SequenceDiagram, type DiagramFontSettings, type SequenceSelection } from '@coral-viz/viz';
import { caveatFontCss028, type RenderStyle028 } from '@coral-viz/render';
import type { GraphIR } from '../printer';
import type { CanvasUpdateStatus } from './CanvasPane';

export interface SequencePaneProps {
  renderStyle028: RenderStyle028;
  onRenderStyle028Change: (style: RenderStyle028) => void;
  graph: GraphIR;
  selected: SequenceSelection | null;
  error: string | null;
  onSelect: (selection: SequenceSelection | null) => void;
  theme?: Record<string, string>;
  themeMode?: 'light' | 'dark';
  /** The document font, resolved exactly as SVG export resolves it. */
  fontSettings?: DiagramFontSettings;
  /** The live update owner, displayed exactly as the generic canvas displays it. */
  updateStatus?: CanvasUpdateStatus | null;
}

export function SequencePane({ graph, selected, error, onSelect, theme, themeMode, fontSettings,
  renderStyle028, onRenderStyle028Change, updateStatus = null }: SequencePaneProps) {
  return (
    <section
      className="coral-sequence-pane"
      aria-label="Sequence diagram canvas"
      style={{ width: '100%', height: '100%', overflow: 'auto', background: theme?.canvasBg }}
      onClick={(event) => { if (event.target === event.currentTarget) onSelect(null); }}
    >
      <style>{caveatFontCss028()}</style>
      <label style={{ position: 'sticky', top: 8, left: 8, zIndex: 1,
        display: 'inline-block', padding: '4px 6px', background: theme?.controlBg ?? '#fff' }}>
        Style{' '}
        <select aria-label="Diagram style" value={renderStyle028}
          onChange={(event) => onRenderStyle028Change(event.target.value as RenderStyle028)}>
          <option value="lowfi">Lowfi</option><option value="hifi">Hifi</option>
        </select>
      </label>
      {updateStatus && (
        <div
          data-testid="visible-update-status"
          data-update-kind={updateStatus.kind}
          // Display only: selection and scrolling beneath it stay available.
          style={{ position: 'sticky', top: 8, left: 8, zIndex: 2, display: 'inline-block', marginLeft: 8,
            padding: '4px 8px', pointerEvents: 'none', borderRadius: 4, background: theme?.floatingToolbarBg,
            color: theme?.controlText, fontSize: 12 }}
        >
          {updateStatus.message}
        </div>
      )}
      {error && <div role="status" className="coral-sequence-pane__status" style={{ padding: 8, fontSize: 12 }}>{error}</div>}
      <SequenceDiagram graph={graph} selected={selected} onSelect={onSelect}
        themeMode={themeMode} fontSettings={fontSettings} renderStyle028={renderStyle028} />
    </section>
  );
}
