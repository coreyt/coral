/** One user-symbol definition drawn outside a scene: one `<symbol>` from the
 * admitted model through the C2 escaping writer, never from input bytes, and
 * one decorative `<use>`. Used by the SymbolNode fallback, palette thumbnails,
 * the inspector and the symbol editor preview. */
import { useId, useMemo, type CSSProperties } from 'react';
import { stableSvgId, userSymbolSvgDefinition029, type ResolvedUserSymbol029 } from '@coral-viz/render';

export interface UserSymbolArtwork029Props {
  symbol: Pick<ResolvedUserSymbol029, 'definition' | 'outline' | 'artwork029'>;
  /** Fit the definition frame into a `fit` by `fit` box, keeping its aspect ratio. */
  fit?: number;
  width?: number;
  height?: number;
  /** Tint colour for a `tint stroke` definition. */
  color?: string;
  style?: CSSProperties;
}

export function UserSymbolArtwork029({ symbol, fit, width, height, color, style }: UserSymbolArtwork029Props) {
  const scope = stableSvgId('coral-instance', `artwork-${useId()}`);
  const { definition, outline, artwork029 } = symbol;
  const markup = useMemo(() => artwork029
    ? userSymbolSvgDefinition029(scope, definition.id, artwork029, { tint: definition.tint, outline }) : undefined,
  [artwork029, definition.id, definition.tint, outline, scope]);
  if (!markup) return null;
  const scale = fit !== undefined ? fit / Math.max(outline.width, outline.height) : 1;
  const w = width ?? outline.width * scale;
  const h = height ?? outline.height * scale;
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false" style={style}>
    <defs dangerouslySetInnerHTML={{ __html: markup }} />
    <g data-coral-artwork={definition.symbolId}>
      <use href={`#${scope}-coral-sym-${definition.id}`} x={0} y={0} width={w} height={h} aria-hidden="true"
        color={definition.tint === 'stroke' ? color : undefined} />
    </g>
  </svg>;
}
