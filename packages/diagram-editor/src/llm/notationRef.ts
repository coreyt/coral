/**
 * Notation-Aware Prompt Composition
 *
 * Generates notation-specific prompt sections from live @coral-viz/viz definitions.
 * Injected into system prompts so the LLM knows which types and edge styles
 * are valid for the active notation.
 */

import {
  getNotation,
  getSymbolsForNotation,
  type NotationDefinition,
  type SymbolDefinition,
} from '@coral-viz/viz';
import { HEADER_MANIFEST_028 } from '@coral-viz/language';
import {
  getSemanticTypesForNotation,
  advertisedSemanticTypeForSymbol,
  effectiveSymbolId,
  semanticTypeForSymbol,
} from '../notationSemantics';

/**
 * Format a symbol as a DSL type reference line for the LLM prompt.
 */
function formatSymbolLine(
  symbolId: string,
  symbol: SymbolDefinition | undefined,
  notationId: string,
): string | null {
  const dslType = advertisedSemanticTypeForSymbol(symbolId, notationId);
  if (!dslType) return null;

  const desc = symbol?.description || symbol?.name || symbolId;
  return `  ${dslType} — ${desc}`;
}

/**
 * Compose a notation-specific prompt reference section.
 *
 * Returns a prompt section documenting the valid node types, edge styles,
 * and connection guidance for the active notation. Returns empty string
 * for unknown notations.
 */
export function composeNotationReference(notationId: string): string {
  const notation = getNotation(notationId);
  const installed = HEADER_MANIFEST_028['0.2.8']?.[notationId];
  if (!notation || !installed || installed.enabled === false) return '';

  const symbols = getSymbolsForNotation(notationId);
  const symbolMap = new Map<string, SymbolDefinition>();
  for (const s of symbols) {
    symbolMap.set(s.id, s);
  }

  const sections: string[] = [];

  // Header
  sections.push(`## Active Notation: ${notation.name}\n`);
  sections.push(`Start saved source with @diagram ${notationId}.`);

  // Node types
  sections.push('### Node Types for This Notation');
  sections.push('Use these types in your Coral DSL:\n');

  const typeLines: string[] = [];
  for (const symbolId of notation.symbols) {
    const line = formatSymbolLine(symbolId, symbolMap.get(symbolId), notationId);
    if (line) typeLines.push(line);
  }

  // Only promise an automatic symbol when the shared interpreter resolves it.
  const baseTypes = ['service', 'database', 'module', 'external_api', 'actor', 'group'];
  const coveredDslTypes = new Set(typeLines.map(l => l.trim().split(' — ')[0]));
  for (const bt of baseTypes) {
    if (!coveredDslTypes.has(bt) && effectiveSymbolId({ type: bt }, notationId)) {
      typeLines.push(`  ${bt} — (base type, mapped automatically)`);
    }
  }

  sections.push(typeLines.join('\n'));

  if (notationId === 'uml-class') {
    sections.push(`
### Structured UML Classifiers
The saved source begins with @diagram uml-class.
Classes and interfaces may contain attributes and operations blocks. Enums have no literal body in 0.2.8.
Every member has an explicit ID and a named visibility word. Keep each member on its own line:
~~~coral
@diagram uml-class
order class as "Order" {
  attributes {
    orderId = public attribute id: UUID
  }
  operations {
    saveOp = public operation save(): Void
  }
}
~~~
Use public, private, protected, or package. Association, dependency, inheritance, realization, aggregation, and composition are relation terms in edge brackets.`);
  }

  const explicitSymbolLines: string[] = [];
  for (const symbolId of notation.symbols) {
    if (advertisedSemanticTypeForSymbol(symbolId, notationId) !== undefined) continue;
    const type = semanticTypeForSymbol(symbolId, notationId);
    if (!type) continue;
    const symbol = symbolMap.get(symbolId);
    explicitSymbolLines.push(
      `  example ${type} [symbol: "${symbolId}"] as "Label" — ${symbol?.name || symbolId}`,
    );
  }
  if (explicitSymbolLines.length > 0) {
    sections.push('\n### Symbols Selected With a Keyed Field');
    sections.push('These symbols have no type of their own. Choose an explicit ID and write the keyed symbol before as "Label":\n');
    sections.push(explicitSymbolLines.join('\n'));
  }

  // Edge styles
  if (notation.edgeStyles && Object.keys(notation.edgeStyles).length > 0) {
    sections.push('\n### Edge Styles');
    for (const [styleId, style] of Object.entries(notation.edgeStyles)) {
      if (styleId === 'annotation') continue; // skip annotation edges in LLM prompt
      const lineDesc = style.lineStyle === 'dashed' ? 'dashed' : style.lineStyle === 'dotted' ? 'dotted' : 'solid';
      const arrowDesc = style.targetArrow === 'none' ? 'no arrow' : 'arrow';
      const defaultMarker = typeof notation.defaultEdgeStyle === 'string' && notation.defaultEdgeStyle === styleId ? ' [default]' : '';
      sections.push(`  ${style.name} (${lineDesc}, ${arrowDesc})${defaultMarker}`);
    }
  }

  // Connection guidance
  sections.push('\n### Connection Guidance');
  const guidance = buildConnectionGuidance(notation, notationId);
  if (guidance.length > 0) {
    sections.push(guidance.join('\n'));
  } else {
    sections.push('  All node types can connect freely.');
  }

  return sections.join('\n');
}

/**
 * Build human-readable connection guidance from connection rules.
 */
function buildConnectionGuidance(
  notation: NotationDefinition,
  notationId: string,
): string[] {
  const lines: string[] = [];
  for (const rule of notation.connectionRules.slice(0, 8)) {
    const fromType = advertisedSemanticTypeForSymbol(rule.from, notationId);
    if (!fromType) continue;

    const toTypes = rule.to
      .map(t => advertisedSemanticTypeForSymbol(t, notationId))
      .filter(Boolean)
      .slice(0, 4);
    if (toTypes.length === 0) continue;

    const edgeStyleId = rule.edgeStyle || '';
    const edgeStyleName = (edgeStyleId && notation.edgeStyles?.[edgeStyleId]?.name) || edgeStyleId;
    lines.push(`  ${fromType} → ${toTypes.join(', ')} (${edgeStyleName})`);
  }

  return lines;
}

/**
 * Get the valid DSL node types for a given notation.
 * Useful for validation/linting of LLM output.
 */
export function getValidTypesForNotation(notationId: string): Set<string> {
  const installed = HEADER_MANIFEST_028['0.2.8']?.[notationId];
  if (!installed || installed.enabled === false) return new Set();
  return new Set(getSemanticTypesForNotation(notationId));
}
