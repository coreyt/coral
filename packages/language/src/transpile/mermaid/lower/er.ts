import { normalizeMermaidText } from '../lexer.js';
import type {
  ErAst,
  ErAttributeAst,
  ErCardinality,
  ErRelationStmt,
  ErStmt,
  ErSubgraphStmt,
} from '../parsers/er.js';
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
  localId: string;
  qualifiedId: string;
  parentGroup: ErGroupRecord | null;
  label?: string;
  attributes: ErAttributeAst[];
  range: TranspileSourceRange;
}

interface ErGroupRecord {
  rawId?: string;
  rawTitle?: string;
  localId: string;
  qualifiedId: string;
  takenLocalIds: Set<string>;
  childrenOrder: Array<EntityRecord | ErGroupRecord>;
  range: TranspileSourceRange;
}

function isGroupRecord(item: EntityRecord | ErGroupRecord): item is ErGroupRecord {
  return 'childrenOrder' in item;
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
  const paramMatch = /^([A-Za-z_][A-Za-z0-9_]*)(\([A-Za-z0-9_,\s.]+\))$/.exec(trimmed);
  if (paramMatch) {
    return `${paramMatch[1]}${paramMatch[2]}`;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return trimmed;
  }
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
  const rootTakenIds = new Set<string>();
  const rootOrder: Array<EntityRecord | ErGroupRecord> = [];
  const entitiesByRaw = new Map<string, EntityRecord>();
  const relations: ErRelationStmt[] = [];
  const classDefs = new Map<string, ParsedCssNodeStyle>();
  const classAssignments = new Map<string, string[]>();
  const inlineStyles = new Map<string, ParsedCssNodeStyle>();
  let anonSubgraphCounter = 0;

  const addClassAssignment = (rawId: string, className: string) => {
    const list = classAssignments.get(rawId) ?? [];
    if (!list.includes(className)) list.push(className);
    classAssignments.set(rawId, list);
  };

  const ensureEntity = (
    rawId: string,
    range: TranspileSourceRange,
    parentGroup: ErGroupRecord | null,
    rawAlias?: string,
  ): EntityRecord => {
    let rec = entitiesByRaw.get(rawId);
    const aliasLabel = rawAlias !== undefined ? normalizeMermaidText(rawAlias, diagnostics, range) : undefined;
    if (!rec) {
      const taken = parentGroup ? parentGroup.takenLocalIds : rootTakenIds;
      const { coralId: localId, renamed } = allocateSanitizedId(rawId, taken, diagnostics, range);
      const qualifiedId = parentGroup ? `${parentGroup.qualifiedId}.${localId}` : localId;
      idMap[qualifiedId] = rawId;
      const fallbackLabel = renamed ? normalizeMermaidText(rawId, diagnostics, range, { unquote: false }) : undefined;
      rec = {
        rawId,
        localId,
        qualifiedId,
        parentGroup,
        ...(aliasLabel !== undefined ? { label: aliasLabel } : fallbackLabel !== undefined ? { label: fallbackLabel } : {}),
        attributes: [],
        range,
      };
      entitiesByRaw.set(rawId, rec);
      if (parentGroup) parentGroup.childrenOrder.push(rec);
      else rootOrder.push(rec);
    } else if (aliasLabel !== undefined) {
      rec.label = aliasLabel;
    }
    return rec;
  };

  const createGroup = (stmt: ErSubgraphStmt, parentGroup: ErGroupRecord | null): ErGroupRecord => {
    const taken = parentGroup ? parentGroup.takenLocalIds : rootTakenIds;
    const rawBasis = stmt.rawId ?? stmt.rawTitle ?? `group_${++anonSubgraphCounter}`;
    const { coralId: localId } = allocateSanitizedId(rawBasis, taken, diagnostics, stmt.range);
    const qualifiedId = parentGroup ? `${parentGroup.qualifiedId}.${localId}` : localId;
    if (stmt.rawId ?? stmt.rawTitle) {
      idMap[qualifiedId] = stmt.rawId ?? stmt.rawTitle!;
    }
    const group: ErGroupRecord = {
      ...(stmt.rawId !== undefined ? { rawId: stmt.rawId } : {}),
      ...(stmt.rawTitle !== undefined ? { rawTitle: stmt.rawTitle } : {}),
      localId,
      qualifiedId,
      takenLocalIds: new Set<string>(),
      childrenOrder: [],
      range: stmt.range,
    };
    if (parentGroup) parentGroup.childrenOrder.push(group);
    else rootOrder.push(group);
    return group;
  };

  const walkStatements = (stmts: readonly ErStmt[], parentGroup: ErGroupRecord | null) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'subgraph': {
          const group = createGroup(stmt, parentGroup);
          walkStatements(stmt.statements, group);
          break;
        }
        case 'entity': {
          const rec = ensureEntity(stmt.rawId, stmt.range, parentGroup, stmt.rawAlias);
          for (const attr of stmt.attributes) rec.attributes.push(attr);
          if (stmt.className) addClassAssignment(stmt.rawId, stmt.className);
          break;
        }
        case 'relation': {
          ensureEntity(stmt.leftId, stmt.range, parentGroup);
          ensureEntity(stmt.rightId, stmt.range, parentGroup);
          if (stmt.leftClassName) addClassAssignment(stmt.leftId, stmt.leftClassName);
          if (stmt.rightClassName) addClassAssignment(stmt.rightId, stmt.rightClassName);
          relations.push(stmt);
          break;
        }
        case 'classDef':
          classDefs.set(stmt.name, parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range));
          break;
        case 'class':
          for (const id of stmt.targetIds) {
            addClassAssignment(id, stmt.className);
          }
          break;
        case 'style': {
          const parsed = parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range);
          inlineStyles.set(stmt.targetId, mergeParsedStyles(inlineStyles.get(stmt.targetId), parsed));
          break;
        }
      }
    }
  };

  walkStatements(ast.statements, null);

  const lowerEntityNode = (rec: EntityRecord): CoralNodeIr => {
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

    const label = rec.label !== undefined && rec.label !== rec.localId ? rec.label : undefined;
    return {
      id: rec.localId,
      kind: 'entity',
      ...(label !== undefined ? { label } : {}),
      ...(styleStr ? { style: styleStr } : {}),
      ...(columns.length > 0 ? { columns } : {}),
    };
  };

  const lowerItem = (item: EntityRecord | ErGroupRecord): CoralNodeIr => {
    if (!isGroupRecord(item)) return lowerEntityNode(item);
    const title = item.rawTitle !== undefined
      ? normalizeMermaidText(item.rawTitle, diagnostics, item.range)
      : undefined;
    const label = title !== undefined && title !== item.localId ? title : undefined;
    return {
      id: item.localId,
      kind: 'group',
      ...(label !== undefined ? { label } : {}),
      children: item.childrenOrder.map(lowerItem),
    };
  };

  const nodes: CoralNodeIr[] = rootOrder.map(lowerItem);

  const edges: CoralEdgeIr[] = relations.map((rel) => {
    const source = entitiesByRaw.get(rel.leftId)!.qualifiedId;
    const target = entitiesByRaw.get(rel.rightId)!.qualifiedId;
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
