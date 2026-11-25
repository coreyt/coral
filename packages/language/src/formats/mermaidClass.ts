import type { GraphEdge, GraphNode, ParseResult } from '../types.js';
import { finishParse, parseDiagnostic, type ParseDiagnostic } from '../diagnostics.js';
import { UML_CLASS_NOTATION, UML_CLASS_PROFILE, classifierFor, umlSymbolForKind } from '../uml.js';

const visibility = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' } as const;

export function parseMermaidClass(
  lines: string[],
  options: { graphId?: string; graphName?: string; headerIndex?: number } = {},
): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const explicit = new Set<string>();
  const memberRuns = new Map<string, { current?: string; closed: Set<string> }>();
  const stereotypeSeen = new Set<string>();
  const diagnostics: ParseDiagnostic[] = [];
  let edgeCounter = 0;
  let current: GraphNode | undefined;

  const lineOffsets: number[] = [];
  let nextLineOffset = 0;
  for (const sourceLine of lines) {
    lineOffsets.push(nextLineOffset);
    nextLineOffset += sourceLine.length + 1;
  }
  const report = (line: number, code: string, message: string, source: string,
    severity: 'error' | 'warning' = 'error', exactColumn?: number) => {
    const raw = lines[line - 1] ?? '';
    const found = raw.indexOf(source);
    const column = exactColumn ?? (found >= 0 ? found : Math.max(0, raw.search(/\S/)));
    diagnostics.push(parseDiagnostic({ severity, code, message, source,
      position: { line, column, offset: (lineOffsets[line - 1] ?? 0) + column } }));
  };
  const ensure = (id: string): GraphNode => {
    let node = nodeMap.get(id);
    if (!node) {
      node = {
        id, type: 'class', symbol: umlSymbolForKind('class'), label: id,
        classifier: classifierFor('class', id, undefined, false),
      };
      nodeMap.set(id, node);
      nodes.push(node);
    }
    return node;
  };
  const parseMultiplicity = (raw: string | undefined, line: number, exactColumn?: number) => {
    if (!raw) return undefined;
    const match = raw.match(/^(\d+)(?:\.\.(\d+|\*))?$/);
    if (!match || (match[2] !== '*' && match[2] !== undefined && Number(match[1]) > Number(match[2]))) {
      report(line, 'mermaid.class.multiplicity.invalid', `Invalid multiplicity "${raw}"`, raw, 'error', exactColumn);
      return undefined;
    }
    return { lower: Number(match[1]), upper: match[2] === '*' ? '*' as const : Number(match[2] ?? match[1]) };
  };
  const addMember = (node: GraphNode, kind: 'attributes' | 'operations' | 'literals', item: any, line: number, source: string) => {
    const state = memberRuns.get(node.id) ?? { closed: new Set<string>() };
    if (state.current !== kind) {
      if (state.closed.has(kind)) {
        report(line, 'mermaid.class.member.interleaved', `The ${kind} members must form one contiguous run`, source);
        return;
      }
      if (state.current) state.closed.add(state.current);
      state.current = kind;
      memberRuns.set(node.id, state);
    }
    const classifier = node.classifier!;
    let part = classifier.compartments.find((candidate) => candidate.kind === kind) as any;
    if (!part) {
      part = { id: kind, kind, items: [] };
      classifier.compartments.push(part);
    }
    item.id = `${item.kind}-${part.items.length + 1}`;
    part.items.push(item);
  };

  for (let index = (options.headerIndex ?? 0) + 1; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line || line.startsWith('%%')) continue;
    if (/^direction\s+(TB|BT|LR|RL)$/.test(line)) {
      report(lineNumber, 'mermaid.class.direction.dropped', 'Mermaid class direction is not preserved', line, 'warning');
      continue;
    }
    if (current) {
      if (line === '}') { current = undefined; continue; }
      const classifier = current.classifier!;
      const stereotype = line.match(/^<<(interface|enumeration|enum|abstract)>>$/);
      if (stereotype) {
        if (stereotypeSeen.has(current.id) || classifier.compartments.length !== 1
            || memberRuns.has(current.id) || classifier.modifiers?.length) {
          report(lineNumber, 'mermaid.class.stereotype.position.invalid', 'A stereotype must be the first body line', line);
        } else {
          stereotypeSeen.add(current.id);
          if (stereotype[1] === 'abstract') classifier.modifiers = ['abstract'];
          else {
            const kind = stereotype[1] === 'interface' ? 'interface' : 'enum';
            current.type = kind;
            current.symbol = umlSymbolForKind(kind);
            current.classifier = classifierFor(kind, current.label ?? current.id, undefined, false);
          }
        }
        continue;
      }
      const operation = line.match(/^([+\-#~])?\s*([A-Za-z_][\w-]*)\s*\(([^)]*)\)(?:\s*:\s*([^\s*$<>,]+))?(\*)?(\$)?$/);
      if (operation) {
        const params = operation[3].trim() ? operation[3].split(',').map((text) => {
          const match = text.trim().match(/^([A-Za-z_][\w-]*)(?:\s*:\s*([^\s<>,]+))?$/);
          return match ? { name: match[1], ...(match[2] ? { type: match[2] } : {}) } : null;
        }) : [];
        if (params.some((value) => !value)) report(lineNumber, 'mermaid.class.member.invalid', 'Invalid operation parameter', line);
        else addMember(current, 'operations', {
          kind: 'operation', ...(operation[1] ? { visibility: visibility[operation[1] as keyof typeof visibility] } : {}),
          name: operation[2], parameters: params,
          ...(operation[4] ? { returnType: operation[4] } : {}),
          ...(operation[5] || operation[6] ? { modifiers: [...(operation[5] ? ['abstract'] : []), ...(operation[6] ? ['static'] : [])] } : {}),
        }, lineNumber, line);
        continue;
      }
      if (classifier.kind === 'enum') {
        const literal = line.match(/^([A-Za-z_][\w-]*)(?:\s*=\s*"((?:[^"\\]|\\.)*)")?$/);
        if (literal) {
          let value: string | undefined;
          if (literal[2] !== undefined) {
            try { value = JSON.parse(`"${literal[2]}"`) as string; }
            catch {
              report(lineNumber, 'mermaid.class.member.invalid', 'Enum literal value must use valid JSON string escapes', line);
              continue;
            }
          }
          addMember(current, 'literals', { kind: 'literal', name: literal[1],
            ...(value !== undefined ? { value } : {}) }, lineNumber, line);
          continue;
        }
      }
      const attribute = line.match(/^([+\-#~])?\s*(?:([A-Za-z_][\w-]*)\s*:\s*(\S+?)|(\S+)\s+([A-Za-z_][\w-]*))(\$)?$/);
      if (attribute && classifier.kind !== 'enum') {
        const type = attribute[3] ?? attribute[4];
        if (/[<>,]/.test(type)) {
          report(lineNumber, 'mermaid.class.member.invalid', 'Template or generic member types are not supported', line);
          continue;
        }
        addMember(current, 'attributes', {
          kind: 'attribute', ...(attribute[1] ? { visibility: visibility[attribute[1] as keyof typeof visibility] } : {}),
          name: attribute[2] ?? attribute[5], type,
          ...(attribute[6] ? { modifiers: ['static'] } : {}),
        }, lineNumber, line);
        continue;
      }
      report(lineNumber, 'mermaid.class.member.invalid', 'Unsupported UML class member', line);
      continue;
    }

    const body = line.match(/^class\s+(\w+)(?:\["([^"]+)"\])?\s*\{$/);
    if (body) {
      const [, id, alias] = body;
      if (explicit.has(id)) report(lineNumber, 'mermaid.class.declaration.duplicate', `Class ${id} is declared more than once`, line);
      else {
        current = ensure(id);
        current.label = alias ?? id;
        current.classifier = classifierFor('class', current.label, undefined, false);
        explicit.add(id);
      }
      continue;
    }
    const declaration = line.match(/^class\s+(\w+)(?:\["([^"]+)"\])?$/);
    if (declaration) {
      const [, id, alias] = declaration;
      if (explicit.has(id)) report(lineNumber, 'mermaid.class.declaration.duplicate', `Class ${id} is declared more than once`, line);
      else {
        const node = ensure(id);
        node.label = alias ?? id;
        node.classifier = classifierFor('class', node.label, undefined, false);
        explicit.add(id);
      }
      continue;
    }

    const relation = line.match(/^(?:"([^"]+)"\s+)?(\w+)\s*(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|-->|--|\.\.>|<\.\.)\s*(?:"([^"]+)"\s+)?(\w+)(?:\s*:\s*(.+))?$/);
    if (relation) {
      const [, leftMultiplicity, left, operator, rightMultiplicity, right, label] = relation;
      ensure(left); ensure(right);
      const pointsLeft = operator.startsWith('<');
      const source = pointsLeft ? right : left;
      const target = pointsLeft ? left : right;
      const rawLine = lines[lineNumber - 1] ?? '';
      const leftQuote = leftMultiplicity ? rawLine.indexOf(`"${leftMultiplicity}"`) : -1;
      const operatorColumn = rawLine.indexOf(operator, Math.max(0, leftQuote));
      const rightQuote = rightMultiplicity
        ? rawLine.indexOf(`"${rightMultiplicity}"`, operatorColumn + operator.length)
        : -1;
      const leftEnd: any = leftMultiplicity
        ? { multiplicity: parseMultiplicity(leftMultiplicity, lineNumber, leftQuote >= 0 ? leftQuote + 1 : undefined) }
        : {};
      const rightEnd: any = rightMultiplicity
        ? { multiplicity: parseMultiplicity(rightMultiplicity, lineNumber, rightQuote >= 0 ? rightQuote + 1 : undefined) }
        : {};
      const sourceEnd = pointsLeft ? rightEnd : leftEnd;
      const targetEnd = pointsLeft ? leftEnd : rightEnd;
      let type = 'association';
      if (operator.includes('|')) { type = operator.includes('..') ? 'realization' : 'inheritance'; targetEnd.marker = { kind: 'triangle', fill: 'open' }; }
      else if (operator.includes('*')) {
        type = 'composition';
        (operator.startsWith('*') ? sourceEnd : targetEnd).marker = { kind: 'diamond', fill: 'filled' };
        if (!operator.startsWith('*')) sourceEnd.marker = { kind: 'none', fill: 'unspecified' };
      }
      else if (operator.includes('o')) {
        type = 'aggregation';
        (operator.startsWith('o') ? sourceEnd : targetEnd).marker = { kind: 'diamond', fill: 'open' };
        if (!operator.startsWith('o')) sourceEnd.marker = { kind: 'none', fill: 'unspecified' };
      }
      else if (operator.includes('..')) { type = operator === '..' ? 'association' : 'dependency'; if (operator !== '..') targetEnd.marker = { kind: 'arrow', fill: 'open' }; }
      else if (operator.includes('>')) targetEnd.marker = { kind: 'arrow', fill: 'open' };
      edges.push({
        id: `rel_${++edgeCounter}`, source, target, type,
        ...(label ? { label } : {}),
        ...(Object.keys(sourceEnd).length ? { sourceEnd } : {}),
        ...(Object.keys(targetEnd).length ? { targetEnd } : {}),
        ...(operator.includes('..') ? { style: { lineStyle: 'dashed' as const } } : {}),
      });
      continue;
    }
    report(lineNumber, 'mermaid.class.syntax.unsupported', 'Unsupported Mermaid class syntax', line);
  }
  if (current) report(lines.length, 'mermaid.class.brace.unclosed', 'Unclosed class body', current.id);

  for (const node of nodes) {
    if (node.classifier?.kind === 'enum' && !node.classifier.compartments.some((part) => part.kind === 'literals')) {
      node.classifier.compartments.push({ id: 'literals', kind: 'literals', items: [] });
    }
  }
  return finishParse(diagnostics, {
    version: '3.0.0', id: options.graphId || 'mermaid-class', name: options.graphName,
    nodes, edges, metadata: { notation: UML_CLASS_NOTATION }, profile: UML_CLASS_PROFILE,
  });
}
