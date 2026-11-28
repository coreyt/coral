import { normalizeMermaidText } from '../lexer.js';
import type { ErAst, ErAttributeAst, ErCardinality, ErRelationStmt } from '../parsers/er.js';
import type {
  CoralEdgeIr,
  CoralErdColumnIr,
  CoralLayoutDirection,
  CoralNodeIr,
  CoralSourceIr,
  TranspileDiagnostic,
  TranspileSourceRange,
} from '../types.js';
import { allocateSanitizedId, createNullMap, sanitizeBaseId } from './ids.js';
import {
  formatCoralNodeStyle,
  mergeParsedStyles,
  parseCssStyleString,
  type ParsedCssNodeStyle,
} from './styles.js';

interface EntityRecord {
  rawId: string;
  coralId: string;
  label?: string;
  attributes: ErAttributeAst[];
  range: TranspileSourceRange;
}

function mapDirection(dir: 'TD' | 'TB' | 'BT' | 'LR' | 'RL'): CoralLayoutDirection {
  switch (dir) {
    case 'TD':
    case 'TB': return 'DOWN';
    case 'BT': return 'UP';
    case 'LR': return 'RIGHT';
    case 'RL': return 'LEFT';
  }
}

function mapLeftCard(c: ErCardinality): string {
  switch (c) {
    case 'one': return '||';
    case 'zero-or-one': return '|o';
    case 'one-or-many': return '}|';
    case 'zero-or-many': return '}o';
  }
}

function mapRightCard(c: ErCardinality): string {
  switch (c) {
    case 'one': return '||';
    case 'zero-or-one': return 'o|';
    case 'one-or-many': return '|{';
    case 'zero-or-many': return 'o{';
  }
}

function sanitizeErColumnType(
  rawType: string,
  diagnostics: TranspileDiagnostic[],
  range: TranspileSourceRange,
): string {
  const trimmed = rawType.trim();
  // M7: Valid Coral ERD type: bare ASCII id, optionally followed by safe `(params)` like `varchar(255)` or `decimal(10, 2)`
  const paramMatch = /^([A-Za-z_][A-Za-z0-9_]*)(\([A-Za-z0-9_,\s.]+\))$/.exec(trimmed);
  if (paramMatch) {
    return `${paramMatch[1]}${paramMatch[2]}`;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return trimmed;
  }
  // Convert `string[]` -> `string_array`, `List~int~` -> `List_int`, `double-precision` -> `double_precision`
  const transformed = trimmed
    .replace(/\[\]/g, '_array')
    .replace(/~/g, '_')
    .replace(/<|>/g, '_');
  const clean = sanitizeBaseId(transformed);
  diagnostics.push({
    severity: 'warning',
    code: 'mermaid.er.column-type.sanitized',
    message: `ER column type "${trimmed}" was sanitized to "${clean}" to satisfy Coral bare-ID column type rules.`,
    range,
  });
  return clean;
}

export function lowerErDiagram(
  ast: ErAst,
  options: { comments: string[] },
  diagnostics: TranspileDiagnostic[],
): { ir: CoralSourceIr; idMap: Record<string, string> } {
  const idMap = createNullMap<string>();
  const takenIds = new Set<string>();
  const entitiesByRaw = new Map<string, EntityRecord>();
  const entityOrder: EntityRecord[] = [];
  const relations: ErRelationStmt[] = [];
  const classDefs = new Map<string, ParsedCssNodeStyle>();
  const classAssignments = new Map<string, string[]>();
  const inlineStyles = new Map<string, ParsedCssNodeStyle>();

  const ensureEntity = (rawId: string, range: TranspileSourceRange, rawAlias?: string): EntityRecord => {
    let rec = entitiesByRaw.get(rawId);
    const aliasLabel = rawAlias !== undefined ? normalizeMermaidText(rawAlias, diagnostics, range) : undefined;
    if (!rec) {
      const { coralId, renamed } = allocateSanitizedId(rawId, takenIds, diagnostics, range);
      idMap[coralId] = rawId;
      const fallbackLabel = renamed ? normalizeMermaidText(rawId, diagnostics, range, { unquote: false }) : undefined;
      rec = {
        rawId,
        coralId,
        ...(aliasLabel !== undefined ? { label: aliasLabel } : fallbackLabel !== undefined ? { label: fallbackLabel } : {}),
        attributes: [],
        range,
      };
      entitiesByRaw.set(rawId, rec);
      entityOrder.push(rec);
    } else if (aliasLabel !== undefined) {
      rec.label = aliasLabel;
    }
    return rec;
  };

  for (const stmt of ast.statements) {
    switch (stmt.kind) {
      case 'entity': {
        const rec = ensureEntity(stmt.rawId, stmt.range, stmt.rawAlias);
        for (const attr of stmt.attributes) rec.attributes.push(attr);
        break;
      }
      case 'relation': {
        ensureEntity(stmt.leftId, stmt.range);
        ensureEntity(stmt.rightId, stmt.range);
        relations.push(stmt);
        break;
      }
      case 'classDef':
        classDefs.set(stmt.name, parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range));
        break;
      case 'class':
        for (const id of stmt.targetIds) {
          const list = classAssignments.get(id) ?? [];
          if (!list.includes(stmt.className)) list.push(stmt.className);
          classAssignments.set(id, list);
        }
        break;
      case 'style': {
        const parsed = parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range);
        inlineStyles.set(stmt.targetId, mergeParsedStyles(inlineStyles.get(stmt.targetId), parsed));
        break;
      }
    }
  }

  const nodes: CoralNodeIr[] = entityOrder.map((rec) => {
    const columns: CoralErdColumnIr[] = [];
    const seenCols = new Set<string>();
    for (const attr of rec.attributes) {
      const colName = sanitizeBaseId(attr.rawName);
      if (colName !== attr.rawName) {
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.id.normalized',
          message: `ER column name "${attr.rawName}" was normalized to "${colName}".`,
          range: attr.range,
        });
      }
      if (seenCols.has(colName)) {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.er.column.duplicate.dropped',
          message: `Duplicate ER column "${colName}" on entity "${rec.rawId}" was omitted.`,
          range: attr.range,
        });
        continue;
      }
      seenCols.add(colName);
      const colType = sanitizeErColumnType(attr.rawType, diagnostics, attr.range);
      if (attr.rawComment !== undefined) {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.er.column-comment.dropped',
          message: `ER column comment "${attr.rawComment}" on "${rec.rawId}.${colName}" has no Coral saved-source equivalent and was omitted.`,
          range: attr.range,
        });
      }
      const flags: string[] = [];
      for (const k of attr.keys) {
        const lower = k.toLowerCase();
        if ((lower === 'pk' || lower === 'fk' || lower === 'uk') && !flags.includes(lower)) {
          flags.push(lower);
        }
      }
      columns.push({ name: colName, type: colType, flags });
    }

    let mergedStyle: ParsedCssNodeStyle | undefined;
    for (const cls of classAssignments.get(rec.rawId) ?? []) {
      const def = classDefs.get(cls);
      if (def) mergedStyle = mergeParsedStyles(mergedStyle, def);
    }
    const inline = inlineStyles.get(rec.rawId);
    if (inline) mergedStyle = mergeParsedStyles(mergedStyle, inline);
    const styleStr = formatCoralNodeStyle(mergedStyle);

    const label = rec.label !== undefined && rec.label !== rec.coralId ? rec.label : undefined;
    return {
      id: rec.coralId,
      kind: 'entity',
      ...(label !== undefined ? { label } : {}),
      ...(styleStr ? { style: styleStr } : {}),
      ...(columns.length > 0 ? { columns } : {}),
    };
  });

  const edges: CoralEdgeIr[] = relations.map((rel) => {
    const source = entitiesByRaw.get(rel.leftId)!.coralId;
    const target = entitiesByRaw.get(rel.rightId)!.coralId;
    const operator = `${mapLeftCard(rel.leftCard)}${rel.identifying ? '--' : '..'}${mapRightCard(rel.rightCard)}`;
    const label = rel.rawLabel !== undefined
      ? normalizeMermaidText(rel.rawLabel, diagnostics, rel.range)
      : undefined;
    return {
      source,
      target,
      operator,
      ...(label !== undefined && label !== '' ? { label } : {}),
    };
  });

  return {
    ir: {
      notation: 'erd',
      edition: '0.2.14',
      ...(ast.direction ? { direction: mapDirection(ast.direction) } : {}),
      ...(options.comments.length > 0 ? { comments: options.comments } : {}),
      nodes,
      edges,
    },
    idMap,
  };
}
