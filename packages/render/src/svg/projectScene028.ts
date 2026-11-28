/** Pure SVG projection of typed scene parts. No layout or text measurement. */
import type { ScenePartRecord028 } from '../renderScene028.js';
import { userSymbolSvgInstance029 } from '../artwork/svgArtworkSymbol029.js';

const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function serializeScenePart028(part: ScenePartRecord028, domNamespace: string): string {
  const geometry = part.geometry;
  const partId = ` data-coral-part-id="${esc(part.id)}"`;
  switch (geometry.kind) {
    case 'route':
      return `<path${partId} d="${esc(geometry.d)}" fill="none" stroke="${esc(geometry.stroke)}" stroke-width="${geometry.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${geometry.dash ? ` stroke-dasharray="${esc(geometry.dash)}"` : ''}${geometry.markerStart ? ` marker-start="url(#${domNamespace}-${esc(geometry.markerStart)})"` : ''}${geometry.markerEnd ? ` marker-end="url(#${domNamespace}-${esc(geometry.markerEnd)})"` : ''}/>`;
    case 'marker':
      // Contour ink lives in the scoped <marker> definition. This record
      // retains the semantic marker part and exact route contact in the DOM.
      return `<g${partId} data-coral-marker-contact="${geometry.contact.x},${geometry.contact.y}" aria-hidden="true"/>`;
    case 'stencil-path': {
      const { x, y, scale } = geometry.transform;
      const filterAttr = geometry.filterId ? ` filter="url(#${domNamespace}-${geometry.filterId})"` : '';
      return `<g transform="translate(${x},${y}) scale(${scale})"${filterAttr}><path${partId} d="${esc(geometry.d)}" fill="${esc(geometry.fill)}" stroke="${esc(geometry.stroke)}" stroke-width="${Number(geometry.strokeWidth.toFixed(4))}" stroke-linecap="${geometry.strokeLinecap}" stroke-linejoin="${geometry.strokeLinejoin}"${geometry.strokeDasharray ? ` stroke-dasharray="${esc(geometry.strokeDasharray)}"` : ''}${geometry.innerTransform ? ` transform="${esc(geometry.innerTransform)}"` : ''}/></g>`;
    }
    case 'decoration-path': {
      const transform = geometry.transform;
      const path = `<path${partId} d="${esc(geometry.d)}" fill="${esc(geometry.fill)}" stroke="${esc(geometry.stroke)}" stroke-width="${geometry.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
      // The caller groups all glyph strokes into one accessible image. A
      // separate image for each stroke repeats the name to screen readers.
      if (part.role === 'glyph') return `<g transform="translate(${transform.x},${transform.y}) scale(${transform.scaleX},${transform.scaleY})">${path}</g>`;
      const attributes = part.role === 'symbol-marker' && geometry.symbolMarkerId
        ? ` data-coral-symbol-marker="${esc(geometry.symbolMarkerId)}"` : '';
      return `<g role="img" aria-label="${esc(geometry.name)}"${attributes} transform="translate(${transform.x},${transform.y}) scale(${transform.scaleX},${transform.scaleY})"><title>${esc(geometry.name)}</title>${path}</g>`;
    }
    case 'artwork':
      // One decorative <use> of the definition's <symbol>, written once in <defs>.
      return `<g${partId} data-coral-artwork="${esc(geometry.symbolId)}">${userSymbolSvgInstance029(domNamespace,
        geometry.localId, geometry.frame, geometry.tint ? { color: geometry.tint } : {})}</g>`;
    case 'divider':
      return `<line${partId} data-coral-classifier-separator="${esc(part.id)}" x1="${geometry.x1}" y1="${geometry.y1}" x2="${geometry.x2}" y2="${geometry.y2}" stroke="${esc(geometry.stroke)}" stroke-width="${geometry.strokeWidth}"/>`;
    case 'text': {
      const role = part.role === 'classifier-row' ? ` data-coral-classifier-row="${esc(geometry.compartmentId ?? '')}"`
        : part.role === 'classifier-name' ? ' data-coral-classifier-name=""'
          : part.role === 'classifier-stereotype' ? ' data-coral-classifier-stereotype=""'
            : part.role === 'endpoint-label' ? ` data-coral-endpoint-label="${geometry.endpoint}:${geometry.endpointLabelKind}"`
              : '';
      const text = `<text${partId}${role} class="coral-font-text" x="${geometry.x}" y="${geometry.y}" font-family="${esc(geometry.fontFamily)}" font-size="${geometry.fontSize}" font-weight="${geometry.fontWeight}" line-height="${geometry.lineHeight}" fill="${esc(geometry.fill)}"${geometry.fontStyle ? ` font-style="${geometry.fontStyle}"` : ''}${geometry.textDecoration ? ` text-decoration="${geometry.textDecoration}"` : ''} text-anchor="${geometry.anchor}">${geometry.text.includes('\n') ? geometry.text.split('\n').map((line, index) => `<tspan x="${geometry.x}" y="${geometry.y + index * Math.ceil(geometry.fontSize * geometry.lineHeight)}">${esc(line)}</tspan>`).join('') : esc(geometry.text)}</text>`;
      const bounds = part.owner.kind === 'edge' ? geometry.inkBounds : part.bounds;
      if (!geometry.background) return text;
      const padX = geometry.backgroundPadX ?? 0;
      const padY = geometry.backgroundPadY ?? 0;
      const rx = geometry.backgroundRadius;
      const bgStroke = geometry.backgroundStroke;
      return `<rect data-coral-label-background="${esc(part.id)}" x="${Number((bounds.x - padX).toFixed(2))}" y="${Number((bounds.y - padY).toFixed(2))}" width="${Number((bounds.width + padX * 2).toFixed(2))}" height="${Number((bounds.height + padY * 2).toFixed(2))}"${rx ? ` rx="${rx}" ry="${rx}"` : ''} fill="${esc(geometry.background)}"${bgStroke ? ` stroke="${esc(bgStroke)}" stroke-width="0.9"` : ''} aria-hidden="true" pointer-events="none"/>${text}`;
    }
  }
}
