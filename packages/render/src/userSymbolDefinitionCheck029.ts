/** Read-time outline geometry and port-anchor checks for one parsed user-symbol
 * definition. A finding withholds the definition, as every C1 finding does. */
import { parseDiagnostic, type ParseDiagnostic, type SymbolDefinitionCheckLines029,
  type UserSymbolDefinition } from '@coral-viz/language';
import { projectPortAnchor028 } from './portAnchorProjection028.js';
import { resolveUserAnchor029 } from './userSymbolGeometry029.js';

export function checkUserSymbolDefinition029(
  definition: Omit<UserSymbolDefinition, 'range'>, lines: SymbolDefinitionCheckLines029,
): ParseDiagnostic[] {
  const diagnostics: ParseDiagnostic[] = [];
  const outline = { symbolId: definition.symbolId, outline: definition.outline,
    width: definition.size.width, height: definition.size.height };
  for (const anchor of definition.anchors) {
    const resolved = resolveUserAnchor029(outline, anchor);
    const range = lines.anchors.get(anchor.id);
    if (resolved.ok || !range) continue;
    diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.symbol.local.anchor.invalid',
      message: resolved.reason === 'outside'
        ? `Interior anchor ${anchor.id} lies outside the ${definition.outline} outline of ${definition.symbolId}.`
        : `Interior anchor ${anchor.id} is on the ${definition.outline} outline of ${definition.symbolId}; ` +
          'its exit must point strictly outward.',
      position: range.start, range }));
  }
  const names = new Set(definition.anchors.map((anchor) => anchor.id));
  for (const port of definition.ports) {
    if (port.anchor === undefined) continue;
    const projected = projectPortAnchor028(port.anchor);
    const range = lines.portAnchors.get(port.id);
    if (projected.kind !== 'symbol' || names.has(projected.id) || !range) continue;
    diagnostics.push(parseDiagnostic({ severity: 'error', code: 'coral.port.anchor.symbol-unknown',
      message: `Symbol ${definition.symbolId} has no named anchor ${projected.id} for port ${port.id}`,
      position: range.start, range }));
  }
  return diagnostics;
}
