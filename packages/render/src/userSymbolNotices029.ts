/** Read-time notices about edition 0.2.9 document symbols. */
import type { DiagnosticRange } from '@coral-viz/language';
import type { InstalledDocument028 } from './installedDocument028.js';
import type { SuccessorSourceGraph028, SuccessorSourceNode028 } from './successorSourceProjection028.js';

export interface UserSymbolNotice029 {
  severity: 'info' | 'warning';
  code: 'coral.symbol.local.unused' | 'coral.symbol.local.conformance-unsupported';
  message: string;
  range: DiagnosticRange;
  /** The unused definition; a document-wide warning has none. */
  subject?: { kind: 'node'; id: string };
}

const selectedSymbols = (graph: Pick<SuccessorSourceGraph028, 'nodes'>): Set<string> => {
  const selected = new Set<string>();
  const visit = (nodes: readonly SuccessorSourceNode028[]): void => nodes.forEach((node) => {
    if (node.symbol !== undefined) selected.add(node.symbol);
    visit(node.children ?? []);
  });
  visit(graph.nodes);
  return selected;
};

/** Author decision 2026-10-30: in 0.2.9 a document in which any node selects a
 * `local.` symbol is not conformance-checked; its effective level is `none`. */
export function selectsUserSymbol029(graph: Pick<SuccessorSourceGraph028, 'nodes'>): boolean {
  return [...selectedSymbols(graph)].some((symbol) => symbol.startsWith('local.'));
}

/** `coral.symbol.local.unused` at the opening line of each definition no node
 * selects, and `coral.symbol.local.conformance-unsupported` at an explicit
 * `typical` or `strict` level in a document that selects a user symbol. */
export function userSymbolNotices029(
  document: Pick<InstalledDocument028, 'definitions' | 'header'>, graph: Pick<SuccessorSourceGraph028, 'nodes'>,
): UserSymbolNotice029[] {
  const selected = selectedSymbols(graph);
  const header = document.header.header;
  const level = header?.conformanceLevelRange029 && header.conformanceLevel !== 'none' &&
    [...selected].some((symbol) => symbol.startsWith('local.')) ? header : undefined;
  return [
    ...(level ? [{ severity: 'warning' as const, code: 'coral.symbol.local.conformance-unsupported' as const,
      message: `@conformanceLevel ${level.conformanceLevel} is not applied: a document whose nodes select ` +
        'user symbols is not conformance-checked in Coral 0.2.9.',
      range: { start: { ...level.conformanceLevelRange029!.start },
        end: { ...level.conformanceLevelRange029!.end } } }] : []),
    ...(document.definitions ?? []).filter((definition) => !selected.has(definition.symbolId))
      .map((definition) => ({ severity: 'info' as const, code: 'coral.symbol.local.unused' as const,
        message: `Symbol ${definition.symbolId} is defined but no node selects it.`,
        range: { start: { ...definition.range.start }, end: { ...definition.range.start } },
        subject: { kind: 'node' as const, id: definition.symbolId } })),
  ];
}
