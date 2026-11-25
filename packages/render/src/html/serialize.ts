import type { GraphEdge, GraphNode } from '../types.js';
import { renderSvg, type SvgOptions } from '../svg/serialize.js';
import { splitFontFaceCss029 } from '../text/fonts.js';

/** Inside a Coral shadow root, the drawing's root SVG sets every inherited
 * painting and text property a host could pass down, so host CSS reaches
 * neither labels nor artwork. No font family, size or weight: the root SVG
 * sets those itself as presentation attributes, which a rule would override. */
export const CORAL_SURFACE_CSS_029 = 'svg{fill:#000000;fill-opacity:1;fill-rule:nonzero;stroke:none;stroke-opacity:1;' +
  'stroke-width:1px;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;' +
  'paint-order:normal;marker:none;clip-rule:nonzero;color-interpolation:sRGB;shape-rendering:auto;text-rendering:auto;' +
  'letter-spacing:normal;word-spacing:normal;direction:ltr;writing-mode:horizontal-tb;font-style:normal;font-variant:normal}';

export interface HtmlOptions extends SvgOptions {
  /** Browser-tab and document title. */
  title?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render a deterministic, self-contained HTML document with print styling;
 * the drawing sits inside a declarative shadow root. */
export function renderHtml(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  options: HtmlOptions = {},
): string {
  const title = options.title ?? 'Coral diagram';
  // The drawing sits in a declarative shadow root, so page CSS cannot restyle
  // it. Face rules only work at document level, so they move to the page; the
  // SVG keeps the rest of its own style (c4-design.md "HTML export").
  let faces = '';
  const svg = renderSvg(graph, options).replace(/<style>([^<]*)<\/style>/, (_match, css: string) => {
    const split = splitFontFaceCss029(css);
    faces = split.faces;
    return `<style>${split.rest}</style>`;
  });

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>html,body{margin:0;min-height:100%;background:#fff}body{display:grid;place-items:center;padding:24px;box-sizing:border-box}.coral-diagram{max-width:100%}@media print{body{display:block;padding:0}@page{margin:12mm}}${faces}</style>`,
    '</head>',
    '<body>',
    `<div class="coral-diagram"><template shadowrootmode="open"><style>${CORAL_SURFACE_CSS_029}svg{max-width:100%;height:auto}</style>${svg}</template></div>`,
    '</body>',
    '</html>',
  ].join('\n');
}
