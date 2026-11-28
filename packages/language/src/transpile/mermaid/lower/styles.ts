import type { TranspileDiagnostic, TranspileSourceRange } from '../types.js';
import { normalizeCssColor } from './colors.js';

export interface ParsedCssNodeStyle {
  fill?: string;
  stroke?: string;
  thick?: boolean;
  dashed?: boolean;
}

/**
 * Split CSS declarations separated by `,` or `;` while respecting `rgb(...)` parentheses.
 */
export function splitCssDeclarations(raw: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '(') parenDepth++;
    else if (ch === ')' && parenDepth > 0) parenDepth--;
    else if ((ch === ',' || ch === ';') && parenDepth === 0) {
      parts.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(raw.slice(start));
  return parts;
}

export function parseCssStyleString(
  raw: string,
  diagnostics: TranspileDiagnostic[],
  range?: TranspileSourceRange,
): ParsedCssNodeStyle {
  const result: ParsedCssNodeStyle = {};
  for (const decl of splitCssDeclarations(raw)) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const prop = trimmed.slice(0, colon).trim().toLowerCase();
    const val = trimmed.slice(colon + 1).trim();
    if (!val) continue;

    if (prop === 'fill') {
      const hex = normalizeCssColor(val);
      if (hex) {
        result.fill = hex;
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.style.color.unsupported',
          message: `Unsupported CSS fill color "${val}" cannot map to Coral #RRGGBB and was omitted.`,
          ...(range ? { range } : {}),
        });
      }
    } else if (prop === 'stroke') {
      const hex = normalizeCssColor(val);
      if (hex) {
        result.stroke = hex;
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.style.color.unsupported',
          message: `Unsupported CSS stroke color "${val}" cannot map to Coral #RRGGBB and was omitted.`,
          ...(range ? { range } : {}),
        });
      }
    } else if (prop === 'stroke-width') {
      const numMatch = /^(\d+(?:\.\d+)?)\s*(?:px)?$/i.exec(val);
      if (numMatch && Number(numMatch[1]) >= 3) {
        result.thick = true;
      } else {
        result.thick = false;
      }
    } else if (prop === 'stroke-dasharray') {
      const lower = val.toLowerCase();
      if (lower === 'none' || lower === '0' || /^0(?:\s+0)*$/.test(lower)) {
        result.dashed = false;
      } else if (/[1-9]/.test(lower)) {
        result.dashed = true;
      }
    } else {
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.style.property.dropped',
        message: `CSS property "${prop}" has no Coral saved-source node style equivalent and was omitted.`,
        ...(range ? { range } : {}),
      });
    }
  }
  return result;
}

export function mergeParsedStyles(
  base: ParsedCssNodeStyle | undefined,
  override: ParsedCssNodeStyle,
): ParsedCssNodeStyle {
  return {
    ...(base?.fill !== undefined ? { fill: base.fill } : {}),
    ...(base?.stroke !== undefined ? { stroke: base.stroke } : {}),
    ...(base?.thick !== undefined ? { thick: base.thick } : {}),
    ...(base?.dashed !== undefined ? { dashed: base.dashed } : {}),
    ...(override.fill !== undefined ? { fill: override.fill } : {}),
    ...(override.stroke !== undefined ? { stroke: override.stroke } : {}),
    ...(override.thick !== undefined ? { thick: override.thick } : {}),
    ...(override.dashed !== undefined ? { dashed: override.dashed } : {}),
  };
}

export function formatCoralNodeStyle(style: ParsedCssNodeStyle | undefined): string | undefined {
  if (!style) return undefined;
  const terms: string[] = [];
  if (style.fill) terms.push(`fill: ${style.fill}`);
  if (style.stroke) terms.push(`stroke: ${style.stroke}`);
  if (style.thick) terms.push('thick');
  if (style.dashed) terms.push('dashed');
  return terms.length > 0 ? terms.join('; ') : undefined;
}
