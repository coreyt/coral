/**
 * SequenceDiagram - canvas surface for UML sequence documents (Slice 70).
 *
 * Draws the shared `sequencePrimitives` of the render package's sequence
 * scene, so canvas and SVG export show the same elements and geometry. It
 * computes no geometry and never uses React Flow or ELK.
 */

import { createElement, useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import {
  prepareSequenceScene028,
  type SequenceGraph,
  type SequencePrimitive,
  type SequenceTheme,
  visualStyle028,
  type RenderStyle028,
} from '@coral-viz/render';
import { normalizeDiagramFontSettings, type DiagramFontSettings } from '../file/schema.js';

export type SequenceSelectionKind = 'participant' | 'message' | 'activation' | 'note' | 'fragment' | 'operand' | 'region' | 'group';
export interface SequenceSelection { kind: SequenceSelectionKind; id: string; }

export interface SequenceDiagramProps {
  renderStyle028?: RenderStyle028;
  graph: SequenceGraph;
  theme?: SequenceTheme;
  themeMode?: 'light' | 'dark';
  /** Document font settings; the same resolution as SVG export (R-033). */
  fontSettings?: DiagramFontSettings;
  fontSize?: number;
  fontFamily?: string;
  selected?: SequenceSelection | null;
  onSelect?: (selection: SequenceSelection) => void;
}

const SELECTABLE = ['participant', 'message', 'activation', 'note', 'fragment', 'operand', 'region', 'group'] as const;

function reactName(name: string): string {
  if (name === 'class') return 'className';
  return name.startsWith('data-') || name.startsWith('aria-') ? name : name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function SequenceDiagram({ graph, theme, themeMode = 'light', fontSettings, fontSize, fontFamily,
  renderStyle028 = 'lowfi', selected, onSelect }: SequenceDiagramProps) {
  const visual = visualStyle028(renderStyle028, themeMode);
  const layout = useMemo(() => {
    try {
      return { prepared: prepareSequenceScene028(graph, {
        style: renderStyle028, theme: themeMode,
        fontSize: fontSize ?? (fontSettings ? undefined : visual.labelSize),
        fontFamily: fontFamily ?? (fontSettings ? undefined : visual.fontFamily),
        lineHeight: fontSettings ? undefined : 1.4,
        ...(fontSettings ? { fontSettings: normalizeDiagramFontSettings(fontSettings) } : {}),
      }, theme ? { ...theme, fill: visual.paper, stroke: visual.ink,
        text: visual.ink, edge: visual.ink } : undefined) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [graph, fontSettings, fontSize, fontFamily, renderStyle028, themeMode, theme, visual]);

  if (!layout.prepared) {
    return <div role="alert" className="coral-sequence-error">{layout.error}</div>;
  }
  const { scene, parts } = layout.prepared;

  const draw = (primitive: SequencePrimitive, key: string): ReactNode => {
    const props: Record<string, unknown> = { key };
    for (const [name, value] of Object.entries(primitive.attrs)) props[reactName(name)] = value;
    const kind = SELECTABLE.find((candidate) => `data-coral-sequence-${candidate}` in primitive.attrs);
    const frameId = primitive.attrs['data-coral-fragment-frame'];
    const selection: SequenceSelection | undefined = frameId !== undefined
      ? { kind: 'fragment', id: String(frameId) }
      : kind && kind !== 'fragment'
        ? { kind, id: String(primitive.attrs[`data-coral-sequence-${kind}`]) }
        : undefined;
    if (primitive.tag === 'g' && kind === 'fragment') props.role = 'group';
    if (primitive.tag === 'g' && selection) {
      const isSelected = selected?.kind === selection.kind && selected.id === selection.id;
      Object.assign(props, {
        role: 'button',
        tabIndex: 0,
        style: { cursor: onSelect ? 'pointer' : undefined, outline: 'none' },
        ...(isSelected ? { 'aria-current': 'true', filter: 'drop-shadow(0 0 2px #2563eb)' } : {}),
        onClick: (event: MouseEvent) => { event.stopPropagation(); onSelect?.(selection); },
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onSelect?.(selection);
          }
        },
      });
    }
    const children = [
      ...(selection && onSelect ? (() => {
        const { kind: selectionKind, id } = selection;
        // Lifelines paint above shaded fragments/operands so vertical lines stay
        // uninterrupted; emit separate header and 12px lifeline hit rects for
        // participants so clicks on either the header or lifeline hit cleanly
        // without creating a full-width transparent curtain over operands.
        if (selectionKind === 'participant') {
          const participant = scene.participants.find((item) => item.id === id);
          if (participant) {
            return [
              createElement('rect', { key: `${key}.hit`,
                'data-coral-interaction-hit': id,
                x: participant.header.x, y: participant.header.y,
                width: participant.header.width, height: participant.header.height,
                fill: 'transparent', pointerEvents: 'all' }),
              createElement('rect', { key: `${key}.hit.lifeline`,
                'data-coral-interaction-hit': `${id}:lifeline`,
                x: participant.lifeline.x - 6, y: participant.lifeline.y1,
                width: 12, height: Math.max(0, participant.lifeline.y2 - participant.lifeline.y1),
                fill: 'transparent', pointerEvents: 'all' }),
            ];
          }
        }
        const hit = layout.prepared!.ownerLookup.hitBounds[`${selectionKind}:${id}`];
        return hit ? [createElement('rect', { key: `${key}.hit`,
          'data-coral-interaction-hit': id,
          x: hit.x, y: hit.y, width: hit.width, height: hit.height,
          fill: 'transparent', pointerEvents: 'all' })] : [];
      })() : []),
      ...(primitive.text !== undefined ? [primitive.text] : []),
      ...(primitive.children ?? []).map((child, index) => draw(child, `${key}.${index}`)),
    ];
    return createElement(primitive.tag, props, ...children);
  };

  return (
    <svg
      className="coral-sequence-diagram"
      xmlns="http://www.w3.org/2000/svg"
      width={scene.width}
      height={scene.height}
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      // Not role="img": its descendants would become presentational and hide
      // the selectable elements from assistive technology (CR70-6).
      role="group"
      aria-label={scene.title}
      fontFamily={scene.font.cssFamily ?? fontFamily}
    >
      <title>{scene.title}</title>
      <desc>{scene.description}</desc>
      {parts.map((primitive, index) => draw(primitive, String(index)))}
    </svg>
  );
}
