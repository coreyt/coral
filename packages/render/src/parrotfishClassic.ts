/**
 * Built-in Parrotfish classic presentation preset (strictly separate from Anemone).
 * Kept in its own module so browser embeds that only expose monochrome/anemone
 * styles tree-shake it cleanly.
 */
import type {
  ParrotfishEdgeContext,
  ParrotfishModel,
  ParrotfishNodeContext,
  ParrotfishPalette,
  ParrotfishPaletteContext,
} from './parrotfishCore.js';

function isUmlNotation0215(notationId?: string): boolean {
  const id = (notationId ?? '').toLowerCase();
  return id === 'uml' || id.startsWith('uml-');
}

const PARROTFISH_CLASSIC_LIGHT: ParrotfishPalette = Object.freeze({
  background: '#ffffff',
  paper: '#ececff',
  ink: '#333333',
  softInk: '#555555',
  edge: '#333333',
  containerFill: '#ffffde',
  containerNestedFill: '#ffffea',
  containerStroke: '#aaaa33',
  containerDasharray: '',
  containerLabelColor: '#333333',
  edgeLabelBackground: '#e8e8e8',
});

const PARROTFISH_CLASSIC_DARK: ParrotfishPalette = Object.freeze({
  background: '#1f2020',
  paper: '#1f2020',
  ink: '#e0dfdf',
  softInk: '#b8b8b8',
  edge: '#cccccc',
  containerFill: '#2b2b2b',
  containerNestedFill: '#333333',
  containerStroke: '#81b1db',
  containerDasharray: '',
  containerLabelColor: '#e0dfdf',
  edgeLabelBackground: '#333333',
});

const PARROTFISH_UML_LIGHT: ParrotfishPalette = Object.freeze({
  background: '#ffffff',
  paper: '#fefece',
  ink: '#000000',
  softInk: '#333333',
  edge: '#a80036',
  containerFill: '#ffffff',
  containerNestedFill: '#fafafa',
  containerStroke: '#000000',
  containerDasharray: '',
  containerLabelColor: '#000000',
  edgeLabelBackground: '#ffffff',
});

const PARROTFISH_UML_DARK: ParrotfishPalette = Object.freeze({
  background: '#1b1b1b',
  paper: '#2b2a22',
  ink: '#f1f1eb',
  softInk: '#c8c6ba',
  edge: '#d46a84',
  containerFill: '#1f1f1f',
  containerNestedFill: '#262626',
  containerStroke: '#d46a84',
  containerDasharray: '',
  containerLabelColor: '#f1f1eb',
  edgeLabelBackground: '#1b1b1b',
});

const mkNode = (fill: string, stroke: string, textColor: string, secondaryTextColor: string, glyph: string, strokeWidth = 1.5) => ({
  fill, stroke, strokeWidth, textColor, secondaryTextColor, glyphStroke: glyph, glyphFill: glyph, accentPosition: 'none' as const,
});

export const PARROTFISH_MODEL_0215: ParrotfishModel = Object.freeze<ParrotfishModel>({
  name: 'parrotfish',
  light: PARROTFISH_CLASSIC_LIGHT,
  dark: PARROTFISH_CLASSIC_DARK,
  resolvePalette(ctx: ParrotfishPaletteContext) {
    if (isUmlNotation0215(ctx.notationId)) {
      return ctx.theme === 'dark' ? PARROTFISH_UML_DARK : PARROTFISH_UML_LIGHT;
    }
    return ctx.theme === 'dark' ? PARROTFISH_CLASSIC_DARK : PARROTFISH_CLASSIC_LIGHT;
  },
  resolveNode(ctx: ParrotfishNodeContext) {
    if (ctx.container) return undefined;
    const notation = (ctx.notationId ?? '').toLowerCase();
    const sym = (ctx.symbolId ?? '').toLowerCase();
    const type = (ctx.type ?? '').toLowerCase();
    const key = `${sym} ${type}`;
    const dark = ctx.theme === 'dark';
    const isNote = /\b(note|annotation|callout|comment)\b/.test(key);
    if (isUmlNotation0215(notation)) {
      if (sym === 'uml-state-initial' || sym === 'uml-state-fork' || sym === 'uml-state-join') {
        const solid = dark ? '#d46a84' : '#222222';
        return { fill: solid, stroke: solid, strokeWidth: 1.5, accentPosition: 'none' };
      }
      if (sym === 'uml-state-final') {
        const ring = dark ? '#d46a84' : '#222222';
        return { fill: dark ? '#1b1b1b' : '#ffffff', stroke: ring, strokeWidth: 1.5, accentPosition: 'none' };
      }
      if (isNote) {
        return dark
          ? mkNode('#3d3816', '#d46a84', '#f5f2d0', '#dcd8b0', '#d46a84')
          : mkNode('#fbfb77', '#a80036', '#000000', '#333333', '#a80036');
      }
      return dark
        ? mkNode('#2b2a22', '#d46a84', '#f1f1eb', '#c8c6ba', '#d46a84')
        : mkNode('#fefece', '#a80036', '#000000', '#333333', '#a80036');
    }
    if (notation === 'sketch' && (sym.includes('label') || type === 'label')) {
      return {
        fill: 'none',
        stroke: 'none',
        textColor: dark ? '#e0dfdf' : '#333333',
        secondaryTextColor: dark ? '#b8b8b8' : '#555555',
        accentPosition: 'none',
      };
    }
    if (isNote) {
      return dark
        ? mkNode('#3c361a', '#aaaa33', '#f5f2d0', '#dcd8b0', '#aaaa33', 1.4)
        : mkNode('#fff5ad', '#aaaa33', '#333333', '#555555', '#333333', 1.4);
    }
    if (/\b(external|externalsystem|thirdparty)\b/.test(key) || key.includes('arch-external')) {
      return dark
        ? mkNode('#2a2d30', '#7a8288', '#e0dfdf', '#b8b8b8', '#e0dfdf', 1.4)
        : mkNode('#f4f4f4', '#999999', '#333333', '#555555', '#333333', 1.4);
    }
    const strokeWidth = notation === 'bpmn' && (sym.includes('end') || type === 'end') ? 3 : 1.5;
    return dark
      ? mkNode('#1f2020', '#81b1db', '#e0dfdf', '#b8b8b8', '#e0dfdf', strokeWidth)
      : mkNode('#ececff', '#9370db', '#333333', '#555555', '#333333', strokeWidth);
  },
  resolveEdge(ctx: ParrotfishEdgeContext) {
    const dark = ctx.theme === 'dark';
    const notation = (ctx.notationId ?? '').toLowerCase();
    const rel = (ctx.relationType ?? '').toLowerCase();
    if (isUmlNotation0215(notation)) {
      const dash = notation === 'uml-state' && rel === 'annotation' ? '4 3' : undefined;
      return dark
        ? { stroke: '#d46a84', strokeWidth: 1.4, ...(dash ? { dash } : {}), markerColor: '#d46a84', labelColor: '#f1f1eb', labelBackground: '#1b1b1b' }
        : { stroke: '#a80036', strokeWidth: 1.4, ...(dash ? { dash } : {}), markerColor: '#a80036', labelColor: '#000000', labelBackground: '#ffffff' };
    }
    return dark
      ? { stroke: '#cccccc', strokeWidth: 1.5, markerColor: '#cccccc', labelColor: '#e0dfdf', labelBackground: '#333333' }
      : { stroke: '#333333', strokeWidth: 1.5, markerColor: '#333333', labelColor: '#333333', labelBackground: '#e8e8e8' };
  },
});
