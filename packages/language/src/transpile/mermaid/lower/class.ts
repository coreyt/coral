import { normalizeMermaidText } from '../lexer.js';
import type {
  ClassAst,
  ClassMemberLine,
  ClassRelationStmt,
  ClassStmt,
} from '../parsers/class.js';
import type {
  CoralClassAttributeIr,
  CoralClassOperationIr,
  CoralEdgeIr,
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

interface ClassifierRecord {
  rawId: string;
  localCoralId: string;
  qualifiedCoralId: string;
  namespaceKey?: string;
  kind: 'class' | 'interface' | 'enum';
  label?: string;
  genericParam?: string;
  customStereotypes: string[];
  isAbstract: boolean;
  classes: string[];
  rawMembers: ClassMemberLine[];
  range: TranspileSourceRange;
}

interface NamespaceRecord {
  key: string;
  rawId: string;
  coralId: string;
  membersOrder: string[];
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

function sanitizeTypeIdentifier(
  rawType: string,
  diagnostics: TranspileDiagnostic[],
  range: TranspileSourceRange,
): string {
  const trimmed = rawType.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return trimmed;
  // Convert `String[]` -> `String_Array`, `List~Order~` -> `List_Order`, `Map~K, V~` -> `Map_K_V`
  const transformed = trimmed
    .replace(/\[\]/g, '_Array')
    .replace(/~/g, '_')
    .replace(/<|>/g, '_');
  const clean = sanitizeBaseId(transformed);
  diagnostics.push({
    severity: 'warning',
    code: 'mermaid.class.member-type.sanitized',
    message: `Parameterized or non-bare member type "${trimmed}" was sanitized to "${clean}" for Coral 0.2.14 saved source.`,
    range,
  });
  return clean;
}

function parseClassMember(
  line: ClassMemberLine,
  diagnostics: TranspileDiagnostic[],
): { kind: 'attribute'; attr: CoralClassAttributeIr } | { kind: 'operation'; op: CoralClassOperationIr } | null {
  let text = line.rawText.trim();
  if (!text) return null;

  // Strip trailing/inline * (abstract) or $ (static) member classifiers
  let strippedModifier = false;
  while (text.endsWith('*') || text.endsWith('$')) {
    text = text.slice(0, -1).trim();
    strippedModifier = true;
  }

  // Visibility prefix
  let visibility: '+' | '-' | '#' | '~';
  const first = text[0];
  if (first === '+' || first === '-' || first === '#' || first === '~') {
    visibility = first;
    text = text.slice(1).trim();
  } else {
    visibility = '+';
    diagnostics.push({
      severity: 'info',
      code: 'mermaid.class.visibility.defaulted',
      message: `Member "${line.rawText}" omitted visibility and defaulted to "+".`,
      range: line.range,
    });
  }

  // Check for operation `name(...) [returnType]` or `returnType name(...)`
  const parenOpen = text.indexOf('(');
  const parenClose = parenOpen >= 0 ? text.lastIndexOf(')') : -1;
  if (parenOpen > 0 && parenClose > parenOpen) {
    let beforeParen = text.slice(0, parenOpen).trim();
    const paramsRaw = text.slice(parenOpen + 1, parenClose).trim();
    let afterParen = text.slice(parenClose + 1).trim();

    if (afterParen.endsWith('*') || afterParen.endsWith('$')) {
      afterParen = afterParen.slice(0, -1).trim();
      strippedModifier = true;
    }
    if (strippedModifier) {
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.class.member-modifier.dropped',
        message: `Member classifier modifier (* abstract / $ static) on "${line.rawText}" has no Coral 0.2.14 equivalent and was omitted.`,
        range: line.range,
      });
    }

    // Check if return type precedes method name (`Boolean deposit(...)`)
    let returnTypeRaw: string | undefined;
    const beforeParts = beforeParen.split(/\s+/);
    let rawOpName: string;
    if (beforeParts.length >= 2) {
      rawOpName = beforeParts[beforeParts.length - 1]!;
      returnTypeRaw = beforeParts.slice(0, -1).join(' ');
    } else {
      rawOpName = beforeParen;
    }

    if (afterParen) {
      if (afterParen.startsWith(':')) afterParen = afterParen.slice(1).trim();
      if (afterParen) returnTypeRaw = afterParen;
    }

    const opName = sanitizeBaseId(rawOpName);
    const parameters: Array<{ name: string; type: string }> = [];
    if (paramsRaw) {
      for (const rawParam of splitTopLevelComma(paramsRaw)) {
        const p = rawParam.trim();
        if (!p) continue;
        const colonIdx = p.indexOf(':');
        if (colonIdx > 0) {
          const pName = sanitizeBaseId(p.slice(0, colonIdx).trim());
          const pType = sanitizeTypeIdentifier(p.slice(colonIdx + 1).trim(), diagnostics, line.range);
          parameters.push({ name: pName, type: pType });
        } else {
          const parts = p.split(/\s+/);
          if (parts.length >= 2) {
            const pName = sanitizeBaseId(parts[parts.length - 1]!);
            const pType = sanitizeTypeIdentifier(parts.slice(0, -1).join(' '), diagnostics, line.range);
            parameters.push({ name: pName, type: pType });
          } else {
            const pName = sanitizeBaseId(p);
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.class.type.defaulted',
              message: `Untyped parameter "${p}" in operation "${rawOpName}" defaulted to type "Any".`,
              range: line.range,
            });
            parameters.push({ name: pName, type: 'Any' });
          }
        }
      }
    }

    const returnType = returnTypeRaw
      ? sanitizeTypeIdentifier(returnTypeRaw, diagnostics, line.range)
      : undefined;

    return {
      kind: 'operation',
      op: {
        visibility,
        name: opName,
        parameters,
        ...(returnType ? { returnType } : {}),
      },
    };
  }

  if (strippedModifier) {
    diagnostics.push({
      severity: 'warning',
      code: 'mermaid.class.member-modifier.dropped',
      message: `Member classifier modifier (* abstract / $ static) on "${line.rawText}" has no Coral 0.2.14 equivalent and was omitted.`,
      range: line.range,
    });
  }

  // Attribute: either `name: Type` or `Type name` or bare `name`
  const colonIdx = text.indexOf(':');
  let rawAttrName: string;
  let rawAttrType: string | undefined;
  if (colonIdx > 0) {
    rawAttrName = text.slice(0, colonIdx).trim();
    rawAttrType = text.slice(colonIdx + 1).trim();
  } else {
    const parts = splitTypeAndName(text);
    if (parts) {
      rawAttrType = parts.type;
      rawAttrName = parts.name;
    } else {
      rawAttrName = text;
    }
  }

  const attrName = sanitizeBaseId(rawAttrName);
  let attrType: string;
  if (rawAttrType) {
    attrType = sanitizeTypeIdentifier(rawAttrType, diagnostics, line.range);
  } else {
    attrType = 'Any';
    diagnostics.push({
      severity: 'warning',
      code: 'mermaid.class.type.defaulted',
      message: `Untyped attribute "${rawAttrName}" defaulted to type "Any".`,
      range: line.range,
    });
  }

  return {
    kind: 'attribute',
    attr: { visibility, name: attrName, type: attrType },
  };
}

function splitTopLevelComma(s: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let tildeOpen = false;
  let angleDepth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '~') tildeOpen = !tildeOpen;
    else if (ch === '<') angleDepth++;
    else if (ch === '>' && angleDepth > 0) angleDepth--;
    else if (ch === ',' && !tildeOpen && angleDepth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function splitTypeAndName(text: string): { type: string; name: string } | null {
  // Handle `Map~K, V~ entries` or `String owner` by finding the last whitespace outside ~...~
  let tildeOpen = false;
  let lastSpace = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '~') tildeOpen = !tildeOpen;
    else if (!tildeOpen && (text[i] === ' ' || text[i] === '\t')) lastSpace = i;
  }
  if (lastSpace <= 0) return null;
  const type = text.slice(0, lastSpace).trim();
  const name = text.slice(lastSpace + 1).trim();
  return type && name ? { type, name } : null;
}

export function lowerClassDiagram(
  ast: ClassAst,
  options: { comments: string[] },
  diagnostics: TranspileDiagnostic[],
): { ir: CoralSourceIr; idMap: Record<string, string> } {
  const idMap = createNullMap<string>();
  const classifiers = new Map<string, ClassifierRecord>();
  const namespaces = new Map<string, NamespaceRecord>();
  const rootOrder: Array<{ kind: 'namespace' | 'classifier'; rawId: string }> = [];
  const relations: ClassRelationStmt[] = [];
  const classDefs = new Map<string, ParsedCssNodeStyle>();
  const cssClassAssignments = new Map<string, string[]>();
  const inlineStyles = new Map<string, ParsedCssNodeStyle>();

  const ensureClassifier = (
    rawId: string,
    range: TranspileSourceRange,
    nsKey?: string,
  ): ClassifierRecord => {
    let rec = classifiers.get(rawId);
    if (!rec) {
      rec = {
        rawId,
        localCoralId: '',
        qualifiedCoralId: '',
        ...(nsKey ? { namespaceKey: nsKey } : {}),
        kind: 'class',
        customStereotypes: [],
        isAbstract: false,
        classes: [],
        rawMembers: [],
        range,
      };
      classifiers.set(rawId, rec);
      if (nsKey) {
        namespaces.get(nsKey)!.membersOrder.push(rawId);
      } else {
        rootOrder.push({ kind: 'classifier', rawId });
      }
    } else if (nsKey && !rec.namespaceKey) {
      rec.namespaceKey = nsKey;
      const idx = rootOrder.findIndex((e) => e.kind === 'classifier' && e.rawId === rawId);
      if (idx >= 0) rootOrder.splice(idx, 1);
      namespaces.get(nsKey)!.membersOrder.push(rawId);
    }
    return rec;
  };

  const applyStereotype = (rec: ClassifierRecord, rawStereo: string, range: TranspileSourceRange) => {
    const lower = rawStereo.toLowerCase();
    if (lower === 'interface') {
      rec.kind = 'interface';
    } else if (lower === 'enumeration' || lower === 'enum') {
      rec.kind = 'enum';
    } else if (lower === 'abstract') {
      rec.isAbstract = true;
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.class.modifier.abstract.dropped',
        message: `Classifier modifier "<<abstract>>" on "${rec.rawId}" has no Coral 0.2.14 saved-source equivalent and was omitted.`,
        range,
      });
    } else {
      const cleanStereo = normalizeMermaidText(rawStereo, diagnostics, range, { unquote: false });
      rec.customStereotypes.push(`<<${cleanStereo}>>`);
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.class.stereotype.degraded',
        message: `Custom stereotype "<<${cleanStereo}>>" on "${rec.rawId}" preserved via [description: "<<${cleanStereo}>>"].`,
        range,
      });
    }
  };

  const walk = (stmts: readonly ClassStmt[], nsKey?: string) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'direction':
          break;
        case 'namespace': {
          let ns = namespaces.get(stmt.rawId);
          if (!ns) {
            ns = { key: stmt.rawId, rawId: stmt.rawId, coralId: '', membersOrder: [], range: stmt.range };
            namespaces.set(stmt.rawId, ns);
            rootOrder.push({ kind: 'namespace', rawId: stmt.rawId });
          }
          walk(stmt.body, stmt.rawId);
          break;
        }
        case 'classDecl': {
          const rec = ensureClassifier(stmt.rawId, stmt.range, nsKey);
          if (stmt.rawAlias !== undefined) {
            rec.label = normalizeMermaidText(stmt.rawAlias, diagnostics, stmt.range);
          }
          if (stmt.genericParam) {
            rec.genericParam = stmt.genericParam;
            if (!rec.label) {
              rec.label = normalizeMermaidText(`${stmt.rawId}<${stmt.genericParam}>`, diagnostics, stmt.range, { unquote: false });
            }
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.class.generic.degraded',
              message: `Generic class parameter "~${stmt.genericParam}~" on "${stmt.rawId}" preserved only in display label.`,
              range: stmt.range,
            });
          }
          if (stmt.className && !rec.classes.includes(stmt.className)) {
            rec.classes.push(stmt.className);
          }
          for (const st of stmt.stereotypes) applyStereotype(rec, st, stmt.range);
          for (const m of stmt.members) rec.rawMembers.push(m);
          break;
        }
        case 'stereotype': {
          const rec = ensureClassifier(stmt.rawClassId, stmt.range, nsKey);
          applyStereotype(rec, stmt.stereotype, stmt.range);
          break;
        }
        case 'inlineMember': {
          const rec = ensureClassifier(stmt.rawClassId, stmt.range, nsKey);
          const stereoMatch = /^<<([^>]+)>>$/.exec(stmt.rawText);
          if (stereoMatch) {
            applyStereotype(rec, stereoMatch[1]!.trim(), stmt.range);
          } else {
            rec.rawMembers.push({ rawText: stmt.rawText, range: stmt.range });
          }
          break;
        }
        case 'relation': {
          const leftRec = ensureClassifier(stmt.leftId, stmt.range, nsKey);
          const rightRec = ensureClassifier(stmt.rightId, stmt.range, nsKey);
          if (stmt.leftGeneric && !leftRec.genericParam) {
            leftRec.genericParam = stmt.leftGeneric;
            if (!leftRec.label) {
              leftRec.label = normalizeMermaidText(
                `${stmt.leftId}<${stmt.leftGeneric}>`,
                diagnostics,
                stmt.range,
                { unquote: false },
              );
            }
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.class.generic.degraded',
              message: `Generic class parameter "~${stmt.leftGeneric}~" on "${stmt.leftId}" preserved only in display label.`,
              range: stmt.range,
            });
          }
          if (stmt.rightGeneric && !rightRec.genericParam) {
            rightRec.genericParam = stmt.rightGeneric;
            if (!rightRec.label) {
              rightRec.label = normalizeMermaidText(
                `${stmt.rightId}<${stmt.rightGeneric}>`,
                diagnostics,
                stmt.range,
                { unquote: false },
              );
            }
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.class.generic.degraded',
              message: `Generic class parameter "~${stmt.rightGeneric}~" on "${stmt.rightId}" preserved only in display label.`,
              range: stmt.range,
            });
          }
          relations.push(stmt);
          break;
        }
        case 'note':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.class.note.dropped',
            message: 'Class diagram note has no Coral 0.2.14 saved-source equivalent and was omitted.',
            range: stmt.range,
          });
          break;
        case 'classDef':
          classDefs.set(stmt.name, parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range));
          break;
        case 'cssClass':
          for (const id of stmt.targetIds) {
            const list = cssClassAssignments.get(id) ?? [];
            if (!list.includes(stmt.className)) list.push(stmt.className);
            cssClassAssignments.set(id, list);
          }
          break;
        case 'style': {
          const parsed = parseCssStyleString(stmt.rawStyle, diagnostics, stmt.range);
          inlineStyles.set(stmt.targetId, mergeParsedStyles(inlineStyles.get(stmt.targetId), parsed));
          break;
        }
        case 'link':
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.class.link.dropped',
            message: 'Class diagram link/callback directive has no Coral saved-source equivalent and was omitted.',
            range: stmt.range,
          });
          break;
      }
    }
  };

  walk(ast.body);

  // Allocate Coral IDs per scope
  const rootTaken = new Set<string>();
  for (const entry of rootOrder) {
    if (entry.kind === 'namespace') {
      const ns = namespaces.get(entry.rawId)!;
      const { coralId } = allocateSanitizedId(ns.rawId, rootTaken, diagnostics, ns.range);
      ns.coralId = coralId;
      idMap[coralId] = ns.rawId;

      const nsTaken = new Set<string>();
      for (const clsRawId of ns.membersOrder) {
        const rec = classifiers.get(clsRawId)!;
        const { coralId: localId, renamed } = allocateSanitizedId(rec.rawId, nsTaken, diagnostics, rec.range);
        rec.localCoralId = localId;
        rec.qualifiedCoralId = `${ns.coralId}.${localId}`;
        idMap[rec.qualifiedCoralId] = rec.rawId;
        if (renamed && rec.label === undefined) {
          rec.label = normalizeMermaidText(rec.rawId, diagnostics, rec.range, { unquote: false });
        }
      }
    } else {
      const rec = classifiers.get(entry.rawId)!;
      const { coralId, renamed } = allocateSanitizedId(rec.rawId, rootTaken, diagnostics, rec.range);
      rec.localCoralId = coralId;
      rec.qualifiedCoralId = coralId;
      idMap[coralId] = rec.rawId;
      if (renamed && rec.label === undefined) {
        rec.label = normalizeMermaidText(rec.rawId, diagnostics, rec.range, { unquote: false });
      }
    }
  }

  const buildClassifierNode = (rec: ClassifierRecord): CoralNodeIr => {
    const attributes: CoralClassAttributeIr[] = [];
    const operations: CoralClassOperationIr[] = [];

    if (rec.kind === 'enum') {
      if (rec.rawMembers.length > 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'mermaid.class.enum-literals.dropped',
          message: `Enum literal body on "${rec.rawId}" (${rec.rawMembers.length} entries) is not yet admitted in Coral 0.2.14 saved source and was omitted.`,
          range: rec.rawMembers[0]!.range,
        });
      }
    } else {
      const seenMembers = new Set<string>();
      for (const m of rec.rawMembers) {
        const parsed = parseClassMember(m, diagnostics);
        if (!parsed) continue;
        if (parsed.kind === 'attribute') {
          if (seenMembers.has(parsed.attr.name)) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.class.member.duplicate.dropped',
              message: `Duplicate class member "${parsed.attr.name}" on "${rec.rawId}" was omitted.`,
              range: m.range,
            });
            continue;
          }
          seenMembers.add(parsed.attr.name);
          attributes.push(parsed.attr);
        } else {
          if (seenMembers.has(parsed.op.name)) {
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.class.member.duplicate.dropped',
              message: `Duplicate class member "${parsed.op.name}" on "${rec.rawId}" was omitted.`,
              range: m.range,
            });
            continue;
          }
          seenMembers.add(parsed.op.name);
          operations.push(parsed.op);
        }
      }
    }

    let mergedStyle: ParsedCssNodeStyle | undefined;
    const allClasses = [...rec.classes, ...(cssClassAssignments.get(rec.rawId) ?? [])];
    for (const cls of allClasses) {
      const def = classDefs.get(cls);
      if (def) mergedStyle = mergeParsedStyles(mergedStyle, def);
    }
    const inline = inlineStyles.get(rec.rawId);
    if (inline) mergedStyle = mergeParsedStyles(mergedStyle, inline);
    const styleStr = formatCoralNodeStyle(mergedStyle);

    const description = rec.customStereotypes.length > 0 ? rec.customStereotypes.join(' ') : undefined;
    const label = rec.label !== undefined && rec.label !== rec.localCoralId ? rec.label : undefined;

    return {
      id: rec.localCoralId,
      kind: rec.kind,
      ...(label !== undefined ? { label } : {}),
      ...(description ? { description } : {}),
      ...(styleStr ? { style: styleStr } : {}),
      ...(attributes.length > 0 ? { attributes } : {}),
      ...(operations.length > 0 ? { operations } : {}),
    };
  };

  const nodes: CoralNodeIr[] = [];
  for (const entry of rootOrder) {
    if (entry.kind === 'namespace') {
      const ns = namespaces.get(entry.rawId)!;
      const children = ns.membersOrder.map((rawId) => buildClassifierNode(classifiers.get(rawId)!));
      const label = ns.rawId !== ns.coralId
        ? normalizeMermaidText(ns.rawId, diagnostics, ns.range, { unquote: false }) : undefined;
      nodes.push({
        id: ns.coralId,
        kind: 'group',
        ...(label ? { label } : {}),
        children,
      });
    } else {
      nodes.push(buildClassifierNode(classifiers.get(entry.rawId)!));
    }
  }

  // Lower relationships with canonical polarity
  const edges: CoralEdgeIr[] = [];
  for (const rel of relations) {
    const leftId = classifiers.get(rel.leftId)!.qualifiedCoralId;
    const rightId = classifiers.get(rel.rightId)!.qualifiedCoralId;
    const leftMult = rel.leftMultiplicity !== undefined
      ? normalizeMermaidText(rel.leftMultiplicity, diagnostics, rel.range, { unquote: false }) : undefined;
    const rightMult = rel.rightMultiplicity !== undefined
      ? normalizeMermaidText(rel.rightMultiplicity, diagnostics, rel.range, { unquote: false }) : undefined;
    const label = rel.rawLabel !== undefined
      ? normalizeMermaidText(rel.rawLabel, diagnostics, rel.range) : undefined;

    let source = leftId;
    let target = rightId;
    let firstLabel = leftMult;
    let secondLabel = rightMult;
    let operator = '->';
    let relation: string | undefined = 'association';
    let firstEnd: string | undefined;
    let style: string | undefined;

    const flip = () => {
      source = rightId;
      target = leftId;
      firstLabel = rightMult;
      secondLabel = leftMult;
    };

    switch (rel.operator) {
      case '<|--':
        flip();
        operator = '-|>';
        relation = 'inheritance';
        break;
      case '--|>':
        operator = '-|>';
        relation = 'inheritance';
        break;
      case '<|..':
        flip();
        operator = '-.|>';
        relation = 'realization';
        break;
      case '..|>':
        operator = '-.|>';
        relation = 'realization';
        break;
      case '*--':
        operator = '--';
        relation = 'composition';
        firstEnd = 'filledDiamond';
        break;
      case '--*':
        flip();
        operator = '--';
        relation = 'composition';
        firstEnd = 'filledDiamond';
        break;
      case 'o--':
        operator = '--';
        relation = 'aggregation';
        firstEnd = 'diamond';
        break;
      case '--o':
        flip();
        operator = '--';
        relation = 'aggregation';
        firstEnd = 'diamond';
        break;
      case '-->':
        operator = '->';
        relation = 'association';
        break;
      case '<--':
        flip();
        operator = '->';
        relation = 'association';
        break;
      case '--':
        operator = '--';
        relation = 'association';
        break;
      case '..>':
        operator = '-.->';
        relation = 'dependency';
        break;
      case '<..':
        flip();
        operator = '-.->';
        relation = 'dependency';
        break;
      case '..':
        operator = '-.-';
        relation = 'association';
        break;
      case '<-->':
        operator = '<->';
        relation = 'association';
        break;
      case '<..>':
        operator = '<->';
        relation = 'dependency';
        style = 'dashed';
        break;
      case '<|--|>':
        operator = '-|>';
        relation = 'inheritance';
        firstEnd = 'triangle';
        break;
      case '<|..|>':
        operator = '-.|>';
        relation = 'realization';
        firstEnd = 'triangle';
        break;
      case '*--*':
        operator = '-#<>';
        relation = 'composition';
        firstEnd = 'filledDiamond';
        break;
      case 'o--o':
        operator = '-<>';
        relation = 'aggregation';
        firstEnd = 'diamond';
        break;
      case '()--':
        operator = '--';
        relation = undefined;
        firstEnd = 'circle';
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.class.lollipop.degraded',
          message: 'Lollipop interface connector "()--" normalized to "-- [firstEnd: circle]".',
          range: rel.range,
        });
        break;
      case '--()':
        flip();
        operator = '--';
        relation = undefined;
        firstEnd = 'circle';
        diagnostics.push({
          severity: 'info',
          code: 'mermaid.class.lollipop.degraded',
          message: 'Lollipop interface connector "--()" normalized to "-- [firstEnd: circle]".',
          range: rel.range,
        });
        break;
    }

    edges.push({
      source,
      target,
      operator,
      ...(relation ? { relation } : {}),
      ...(firstEnd ? { firstEnd } : {}),
      ...(firstLabel !== undefined ? { firstLabel } : {}),
      ...(secondLabel !== undefined ? { secondLabel } : {}),
      ...(style ? { style } : {}),
      ...(label !== undefined && label !== '' ? { label } : {}),
    });
  }

  return {
    ir: {
      notation: 'uml-class',
      edition: '0.2.14',
      ...(ast.direction ? { direction: mapDirection(ast.direction) } : {}),
      ...(options.comments.length > 0 ? { comments: options.comments } : {}),
      nodes,
      edges,
    },
    idMap,
  };
}
