import { quoteCoralString } from './lexer.js';
import type {
  CoralEdgeIr,
  CoralNodeIr,
  CoralSequenceItemIr,
  CoralSourceIr,
} from './types.js';

function isDashedOperator(op: string): boolean {
  return op.includes('.') && !op.startsWith('<');
}

function formatNode(node: CoralNodeIr, indent: string): string[] {
  const fields: string[] = [];
  if (node.symbol) fields.push(`symbol: ${quoteCoralString(node.symbol)}`);
  if (node.variant) fields.push(`variant: ${quoteCoralString(node.variant)}`);
  if (node.description) fields.push(`description: ${quoteCoralString(node.description)}`);
  if (node.style) fields.push(`style: ${quoteCoralString(node.style)}`);

  let head = `${indent}${node.id} ${node.kind}`;
  if (fields.length > 0) head += ` [${fields.join(', ')}]`;
  if (node.label !== undefined) {
    head += ` as ${quoteCoralString(node.label)}`;
  } else if (node.explicitEmptyLabel) {
    head += ' as ""';
  }

  const hasChildren = node.children !== undefined;
  const hasAttrs = (node.attributes?.length ?? 0) > 0;
  const hasOps = (node.operations?.length ?? 0) > 0;
  const hasCols = (node.columns?.length ?? 0) > 0;

  if (!hasChildren && !hasAttrs && !hasOps && !hasCols) {
    return [head];
  }

  const lines: string[] = [`${head} {`];
  const innerIndent = `${indent}  `;

  if (hasChildren) {
    for (const child of node.children!) {
      lines.push(...formatNode(child, innerIndent));
    }
  }

  if (hasAttrs) {
    lines.push(`${innerIndent}attributes {`);
    for (const a of node.attributes!) {
      lines.push(`${innerIndent}  ${a.visibility} ${a.name}: ${a.type}`);
    }
    lines.push(`${innerIndent}}`);
  }

  if (hasOps) {
    lines.push(`${innerIndent}operations {`);
    for (const op of node.operations!) {
      const params = op.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');
      const ret = op.returnType ? `: ${op.returnType}` : '';
      lines.push(`${innerIndent}  ${op.visibility} ${op.name}(${params})${ret}`);
    }
    lines.push(`${innerIndent}}`);
  }

  if (hasCols) {
    lines.push(`${innerIndent}columns {`);
    for (const col of node.columns!) {
      const flagStr = col.flags.length > 0 ? ` [${col.flags.join(', ')}]` : '';
      lines.push(`${innerIndent}  ${col.name} ${col.type}${flagStr}`);
    }
    lines.push(`${innerIndent}}`);
  }

  lines.push(`${indent}}`);
  return lines;
}

function formatEdge(edge: CoralEdgeIr): string {
  const fields: string[] = [];
  if (edge.relation) fields.push(edge.relation);
  if (edge.firstEnd) fields.push(`firstEnd: ${edge.firstEnd}`);
  if (edge.secondEnd) fields.push(`secondEnd: ${edge.secondEnd}`);
  if (edge.firstLabel !== undefined) fields.push(`firstLabel: ${quoteCoralString(edge.firstLabel)}`);
  if (edge.secondLabel !== undefined) fields.push(`secondLabel: ${quoteCoralString(edge.secondLabel)}`);

  // Guard: never emit dashed inside [style: ...] when operator itself is dashed
  if (edge.style) {
    const terms = edge.style.split(';').map((t) => t.trim()).filter(Boolean);
    const safeTerms = isDashedOperator(edge.operator)
      ? terms.filter((t) => t !== 'dashed')
      : terms;
    if (safeTerms.length > 0) {
      fields.push(`style: ${quoteCoralString(safeTerms.join('; '))}`);
    }
  }

  let line = edge.id
    ? `${edge.id} = ${edge.source} ${edge.operator} ${edge.target}`
    : `${edge.source} ${edge.operator} ${edge.target}`;
  if (fields.length > 0) line += ` [${fields.join(', ')}]`;
  if (edge.label !== undefined) line += ` as ${quoteCoralString(edge.label)}`;
  return line;
}

function formatSequenceItem(item: CoralSequenceItemIr, indent: string): string[] {
  switch (item.kind) {
    case 'message': {
      let line = `${indent}${item.id} = ${item.source} ${item.operator} ${item.target}`;
      if (item.relation) line += ` [${item.relation}]`;
      if (item.label !== undefined) line += ` as ${quoteCoralString(item.label)}`;
      return [line];
    }
    case 'note':
      return [`${indent}note ${quoteCoralString(item.text)} on ${item.targets.join(', ')}`];
    case 'activation': {
      const lines = [`${indent}activation ${item.participant} {`];
      for (const child of item.items) lines.push(...formatSequenceItem(child, `${indent}  `));
      lines.push(`${indent}}`);
      return lines;
    }
    case 'region': {
      const open = item.label !== undefined
        ? `${indent}region ${quoteCoralString(item.label)} {`
        : `${indent}region {`;
      const lines = [open];
      for (const child of item.items) lines.push(...formatSequenceItem(child, `${indent}  `));
      lines.push(`${indent}}`);
      return lines;
    }
    case 'fragment': {
      const lines: string[] = [];
      item.operands.forEach((op, idx) => {
        if (idx === 0) {
          const guardPart = op.guard !== undefined ? ` ${quoteCoralString(op.guard)}` : '';
          lines.push(`${indent}${item.fragmentKind}${guardPart} {`);
        } else {
          const sep = item.fragmentKind === 'par' ? 'and' : 'else';
          const guardPart = op.guard !== undefined ? ` ${quoteCoralString(op.guard)}` : '';
          lines.push(`${indent}} ${sep}${guardPart} {`);
        }
        for (const child of op.items) lines.push(...formatSequenceItem(child, `${indent}  `));
      });
      lines.push(`${indent}}`);
      return lines;
    }
  }
}

/**
 * Emit canonical Coral saved-source text from CoralSourceIr.
 * Guarantees 2-space indent, LF newlines, and idempotency under `formatDocument028`.
 */
export function emitCoralSource(ir: CoralSourceIr): string {
  const sections: string[][] = [];

  // Section 1: Header + optional layout
  const headerLines: string[] = [`@diagram ${ir.notation}`];
  if (ir.edition !== '0.2.8') {
    headerLines.push(`@coralVersion ${quoteCoralString(ir.edition)}`);
  }
  if (ir.direction) {
    headerLines.push(`layout [direction: ${ir.direction}]`);
  }
  sections.push(headerLines);

  // Optional preserved comments (defensively strip line breaks & controls)
  if (ir.comments && ir.comments.length > 0) {
    sections.push(ir.comments.map((c) => `// ${c.replace(/[\r\n\u2028\u2029]+/g, ' ')}`));
  }

  if (ir.sequence) {
    if (ir.sequence.participants.length > 0) {
      sections.push(
        ir.sequence.participants.map((p) =>
          p.label !== undefined
            ? `${p.id} ${p.kind} as ${quoteCoralString(p.label)}`
            : `${p.id} ${p.kind}`,
        ),
      );
    }
    if (ir.sequence.groups.length > 0) {
      sections.push(
        ir.sequence.groups.map((g) => {
          const labelPart = g.label !== undefined ? ` [label: ${quoteCoralString(g.label)}]` : '';
          return `${g.id} = participants ${g.members.join(', ')}${labelPart}`;
        }),
      );
    }
    if (ir.sequence.items.length > 0) {
      const timelineLines: string[] = [];
      for (const item of ir.sequence.items) {
        timelineLines.push(...formatSequenceItem(item, ''));
      }
      sections.push(timelineLines);
    }
  } else {
    if (ir.nodes && ir.nodes.length > 0) {
      const nodeLines: string[] = [];
      for (const node of ir.nodes) {
        nodeLines.push(...formatNode(node, ''));
      }
      sections.push(nodeLines);
    }
    if (ir.edges && ir.edges.length > 0) {
      sections.push(ir.edges.map(formatEdge));
    }
  }

  return sections.map((sec) => sec.join('\n')).join('\n\n');
}
