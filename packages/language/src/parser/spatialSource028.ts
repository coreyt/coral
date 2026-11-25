import type {
  LayoutOptionsSuccessor,
  SpatialConstraintSuccessor,
  SpatialRectangleReferenceSuccessor,
} from '@graph-ir/core';
import type {
  CandidateToken,
  CandidateStatement,
  CandidateNodeSyntax,
  CandidateEdgeSyntax,
} from './candidate028.js';
import { parseDiagnostic, type ParseDiagnostic } from '../diagnostics.js';
export type RectangleToken028 = CandidateToken & {
  referenceKind?: SpatialRectangleReferenceSuccessor['kind'];
  groupOnly?: boolean;
};
export interface SpatialParameters028 {
  strength?: 'required' | 'preferred';
  gap?: number;
  inset?: number;
  alignment?: 'start' | 'center' | 'end';
  direction?: 'forward' | 'reverse';
}
export interface CandidateConstraintSyntax028 {
  kind: 'constraint';
  id: CandidateToken;
  keyword: CandidateToken;
  qualifiedId?: string;
  scope?: CandidateToken[];
  subject: RectangleToken028;
  target?: RectangleToken028;
  boundaryScope?: RectangleToken028 | 'graph';
  operation: 'relative' | 'boundary';
  relation?: 'above' | 'below' | 'left-of' | 'right-of';
  side?: 'top' | 'bottom' | 'left' | 'right';
  parameters: SpatialParameters028;
}
export interface CandidateLayoutSyntax028 {
  kind: 'layout';
  keyword: CandidateToken;
  options: LayoutOptionsSuccessor;
}
export function spatialIssue028(
  errors: ParseDiagnostic[],
  token: CandidateToken,
  code: string,
  message: string,
  first?: CandidateToken,
): void {
  errors.push(
    parseDiagnostic({
      severity: 'error',
      code,
      message,
      position: token.range.start,
      range: token.range,
      ...(first
        ? {
            related: [
              {
                message: 'First declaration',
                position: first.range.start,
                range: first.range,
              },
            ],
          }
        : {}),
    }),
  );
}
const fail = (
  errors: ParseDiagnostic[],
  token: CandidateToken,
  message: string,
) =>
  spatialIssue028(errors, token, 'coral.constraint.parameter.invalid', message);
const id = (token: CandidateToken | undefined): token is CandidateToken =>
  token?.kind === 'id';
export function rectangleToken028(
  tokens: CandidateToken[],
  at: number,
  errors: ParseDiagnostic[],
  bare = false,
): { token?: RectangleToken028; next: number } {
  const label =
    tokens[at]?.raw === 'label' &&
    (!bare || ['node', 'edge', 'group'].includes(tokens[at + 1]?.raw ?? ''));
  if (label) at++;
  const role = tokens[at];
  let kind: SpatialRectangleReferenceSuccessor['kind'] = 'node';
  let groupOnly = false;
  if (
    role &&
    ['node', 'group', 'edge'].includes(role.raw) &&
    (!bare || label || id(tokens[at + 1]))
  ) {
    kind = role.value === 'edge' ? 'edge' : 'node';
    groupOnly = role.value === 'group';
    at++;
  } else if (label || !bare) {
    fail(
      errors,
      role ?? tokens[tokens.length - 1]!,
      'Expected a typed rectangle reference',
    );
    return { next: at + 1 };
  }
  const token = tokens[at];
  if (!id(token)) {
    fail(errors, token ?? role!, 'Expected an exact semantic identity');
    return { next: at + 1 };
  }
  if (label && groupOnly) {
    fail(errors, token, 'A label reference names a node or edge');
    return { next: at + 1 };
  }
  return {
    token: {
      ...token,
      referenceKind: label
        ? kind === 'edge'
          ? 'edge-label'
          : 'node-label'
        : kind,
      ...(groupOnly ? { groupOnly } : {}),
    },
    next: at + 1,
  };
}
export function spatialParameters028(
  tokens: CandidateToken[],
  at: number,
  kind: 'relative' | 'boundary' | 'arrangement',
  errors: ParseDiagnostic[],
): SpatialParameters028 {
  const result: SpatialParameters028 = {};
  if (at === tokens.length) return result;
  const seen = new Set<string>();
  if (tokens[at]?.raw !== '[') {
    fail(errors, tokens[at]!, 'Unexpected constraint text');
    return result;
  }
  at++;
  if (tokens[at]?.raw === ']')
    fail(errors, tokens[at]!, 'Constraint parameters cannot be empty');
  while (at < tokens.length && tokens[at]?.raw !== ']') {
    const key = tokens[at++]!;
    let name = key.value;
    let value: CandidateToken | undefined;
    const bareStrength =
      key.kind === 'id' && (name === 'preferred' || name === 'required');
    if (key.kind !== 'id')
      fail(errors, key, 'Parameter keys and strength keywords must be bare');
    if (bareStrength) {
      value = key;
      name = 'strength';
    } else {
      if (tokens[at]?.raw !== ':') {
        fail(errors, key, 'Expected a constraint parameter');
        return result;
      }
      at++;
      value = tokens[at++];
    }
    if (name === 'strength' && !bareStrength)
      fail(errors, key, 'Strength uses a bare required or preferred keyword');
    if (seen.has(name)) {
      fail(errors, key, 'Repeated constraint parameter');
    }
    seen.add(name);
    const allowed = [
      'strength',
      ...(kind === 'boundary' ? ['inset'] : ['gap', 'alignment']),
      ...(kind === 'arrangement' ? ['direction'] : []),
    ];
    if (!allowed.includes(name)) {
      fail(errors, key, 'Unknown or inapplicable constraint parameter');
    } else if (name === 'gap' || name === 'inset') {
      if (
        value?.kind !== 'number' ||
        !Number.isFinite(Number(value.value)) ||
        Number(value.value) < 0
      )
        fail(errors, value ?? key, 'Distance must be finite and nonnegative');
      else Object.assign(result, { [name]: Number(value.value) });
    } else {
      const values =
        name === 'strength'
          ? ['required', 'preferred']
          : name === 'alignment'
            ? ['start', 'center', 'end']
            : ['forward', 'reverse'];
      if (!value || value.kind !== 'id' || !values.includes(value.value))
        fail(errors, value ?? key, 'Invalid constraint parameter value');
      else Object.assign(result, { [name]: value.value });
    }
    if (tokens[at]?.raw === ',') {
      at++;
      if (tokens[at]?.raw === ']')
        fail(errors, tokens[at]!, 'Trailing parameter comma');
    } else if (tokens[at]?.raw !== ']') {
      fail(errors, tokens[at] ?? key, 'Expected comma or closing bracket');
      return result;
    }
  }
  if (tokens[at]?.raw !== ']' || at !== tokens.length - 1)
    fail(
      errors,
      tokens[at] ?? tokens[tokens.length - 1]!,
      'Expected final closing bracket',
    );
  if (result.strength === 'required') delete result.strength;
  if (result.gap === 0) delete result.gap;
  if (result.inset === 0) delete result.inset;
  if (result.alignment === 'center') delete result.alignment;
  if (result.direction === 'forward') delete result.direction;
  return result;
}
export function parseConstraint028(
  tokens: CandidateToken[],
  errors: ParseDiagnostic[],
): CandidateConstraintSyntax028 | undefined {
  const keyword = tokens[0]!,
    identity = tokens[1];
  if (
    !id(identity) ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(identity.value) ||
    tokens[2]?.raw !== ':'
  ) {
    fail(
      errors,
      identity ?? keyword,
      'A constraint needs a local ID and colon',
    );
    return;
  }
  const subject = rectangleToken028(tokens, 3, errors);
  if (!subject.token) return;
  let at = subject.next;
  const relation = tokens[at++];
  if (relation?.raw === 'at') {
    if (tokens[at++]?.raw !== 'the') {
      fail(errors, relation, 'Expected at the side of scope');
      return;
    }
    const side = tokens[at++];
    if (
      !side ||
      side.kind !== 'id' ||
      !['left', 'right', 'top', 'bottom'].includes(side.raw) ||
      tokens[at++]?.raw !== 'of'
    ) {
      fail(errors, side ?? relation, 'Expected a boundary side and scope');
      return;
    }
    let boundaryScope: RectangleToken028 | 'graph' | undefined;
    if (tokens[at]?.raw === 'diagram') {
      boundaryScope = 'graph';
      at++;
    } else {
      const parsed = rectangleToken028(tokens, at, errors);
      boundaryScope = parsed.token;
      at = parsed.next;
    }
    if (!boundaryScope) return;
    return {
      kind: 'constraint',
      id: identity,
      keyword,
      subject: subject.token,
      operation: 'boundary',
      boundaryScope,
      side: side.value as CandidateConstraintSyntax028['side'],
      parameters: spatialParameters028(tokens, at, 'boundary', errors),
    };
  }
  let normalized = relation?.kind === 'id' ? relation.value : undefined;
  if (normalized === 'left' || normalized === 'right') {
    if (tokens[at++]?.raw !== 'of') {
      fail(errors, relation!, 'Expected left of or right of');
      return;
    }
    normalized += '-of';
  }
  if (!['above', 'below', 'left-of', 'right-of'].includes(normalized ?? '')) {
    fail(errors, relation ?? identity, 'Unknown relative relation');
    return;
  }
  const target = rectangleToken028(tokens, at, errors);
  if (!target.token) return;
  return {
    kind: 'constraint',
    id: identity,
    keyword,
    subject: subject.token,
    target: target.token,
    operation: 'relative',
    relation: normalized as CandidateConstraintSyntax028['relation'],
    parameters: spatialParameters028(tokens, target.next, 'relative', errors),
  };
}
export function parseLayout028(
  tokens: CandidateToken[],
  errors: ParseDiagnostic[],
): CandidateLayoutSyntax028 {
  const options: LayoutOptionsSuccessor = {};
  const seen = new Set<string>();
  let at = 2;
  if (tokens[2]?.raw === ']')
    spatialIssue028(
      errors,
      tokens[2],
      'layout.option.invalid',
      'A layout declaration needs at least one option',
    );
  const choices: Record<string, readonly string[]> = {
    algorithm: [
      'layered',
      'mrtree',
      'stress',
      'force',
      'radial',
      'box',
      'fixed',
    ],
    direction: ['UP', 'DOWN', 'LEFT', 'RIGHT'],
    edgeRouting: ['ORTHOGONAL', 'POLYLINE', 'SPLINES'],
  };
  const spacing = ['nodeNode', 'nodeEdge', 'edgeEdge', 'layerSpacing'];
  const failOption = (t: CandidateToken, m: string) =>
    spatialIssue028(errors, t, 'layout.option.invalid', m);
  while (at < tokens.length && tokens[at]?.raw !== ']') {
    const key = tokens[at++]!;
    if (key.kind !== 'id') failOption(key, 'Layout keys must be bare');
    if (tokens[at++]?.raw !== ':') {
      failOption(key, 'Expected layout key: value');
      break;
    }
    const value = tokens[at++];
    if (seen.has(key.value)) failOption(key, 'Repeated layout key');
    seen.add(key.value);
    if (spacing.includes(key.value)) {
      if (
        value?.kind !== 'number' ||
        !Number.isFinite(Number(value.value)) ||
        Number(value.value) <= 0
      )
        failOption(value ?? key, 'Spacing must be finite and positive');
      else
        options.spacing = {
          ...options.spacing,
          [key.value]: Number(value.value),
        };
    } else if (!Object.prototype.hasOwnProperty.call(choices, key.value))
      failOption(key, 'Unknown portable layout key');
    else if (
      !value ||
      value.kind !== 'id' ||
      !choices[key.value]!.includes(value.value)
    )
      failOption(value ?? key, 'Invalid portable layout value');
    else Object.assign(options, { [key.value]: value.value });
    if (tokens[at]?.raw === ',') {
      at++;
      if (tokens[at]?.raw === ']')
        failOption(tokens[at]!, 'Trailing layout comma');
    } else if (tokens[at]?.raw !== ']') {
      failOption(tokens[at] ?? key, 'Expected comma or closing bracket');
      break;
    }
  }
  if (tokens[at]?.raw !== ']' || at !== tokens.length - 1)
    failOption(
      tokens[at] ?? tokens[tokens.length - 1]!,
      'Expected final closing bracket',
    );
  return { kind: 'layout', keyword: tokens[0]!, options };
}
export function resolveSpatial028(
  statements: readonly CandidateStatement[],
  legacyConstraints: SpatialConstraintSuccessor[],
  errors: ParseDiagnostic[],
): SpatialConstraintSuccessor[] {
  const nodes = new Map<string, CandidateNodeSyntax>(),
    edges = new Map<string, CandidateEdgeSyntax>();
  for (const item of statements) {
    if (item.kind === 'node')
      nodes.set(item.qualifiedId ?? item.id.value, item);
    else if (item.kind === 'edge' && item.id)
      edges.set(item.qualifiedId ?? item.id.value, item);
  }
  const resolve = (
    token: RectangleToken028,
    scope?: CandidateToken[],
  ): SpatialRectangleReferenceSuccessor | undefined => {
    const kind = token.referenceKind ?? 'node',
      edge = kind === 'edge' || kind === 'edge-label';
    const map = edge ? edges : nodes;
    const parts = (scope ?? []).map((t) => t.value);
    let resolved: string | undefined;
    if (token.value.includes('.')) {
      if (map.has(token.value)) resolved = token.value;
    } else
      for (let depth = parts.length; depth >= 0; depth--) {
        const candidate = [...parts.slice(0, depth), token.value].join('.');
        if (map.has(candidate)) {
          resolved = candidate;
          break;
        }
      }
    if (!resolved) {
      const other = edge ? nodes : edges;
      const wrong =
        other.has(token.value) ||
        parts.some((_, i) =>
          other.has([...parts.slice(0, i + 1), token.value].join('.')),
        );
      spatialIssue028(
        errors,
        token,
        wrong
          ? 'coral.constraint.reference.kind'
          : 'coral.constraint.reference.unresolved',
        `Unknown ${kind} reference: ${token.value}`,
      );
      return;
    }
    const owner = map.get(resolved)!;
    if (
      token.groupOnly &&
      (owner.kind !== 'node' || owner.nodeKind.value !== 'group')
    ) {
      spatialIssue028(
        errors,
        token,
        'coral.constraint.reference.kind',
        'A group reference requires a group',
      );
      return;
    }
    if (kind.endsWith('-label') && !owner.label?.value) {
      spatialIssue028(
        errors,
        token,
        'coral.constraint.reference.label-missing',
        'Label reference requires explicit nonempty text',
      );
      return;
    }
    return edge
      ? { kind: kind as 'edge' | 'edge-label', edgeId: resolved }
      : { kind: kind as 'node' | 'node-label', nodeId: resolved };
  };
  const result = [...legacyConstraints];
  const reserved = new Set([
    ...legacyConstraints.map((c) => c.id),
    ...statements.flatMap((item) =>
      (item.kind === 'constraint' || item.kind === 'arrangement') && item.id
        ? [item.qualifiedId ?? item.id.value]
        : [],
    ),
  ]);
  let generated = 0;
  const allocate = (scope?: CandidateToken[]) => {
    let value: string;
    do {
      value = [
        ...(scope ?? []).map((t) => t.value),
        `arrangement_${++generated}`,
      ].join('.');
    } while (reserved.has(value));
    reserved.add(value);
    return value;
  };
  const ids = new Map<string, CandidateToken>();
  for (const item of statements) {
    if (item.kind !== 'constraint' && item.kind !== 'arrangement') continue;
    const identity = item.qualifiedId ?? item.id?.value;
    const token = item.id ?? item.keyword;
    if (identity) {
      const first = ids.get(identity);
      if (first) {
        if (
          item.kind === 'arrangement' &&
          !item.parameters &&
          !item.subjects.some((t) => 'referenceKind' in t) &&
          statements.some(
            (previous) =>
              previous.kind === 'arrangement' &&
              (previous.id ?? previous.keyword) === first &&
              !previous.parameters &&
              !previous.subjects.some((t) => 'referenceKind' in t),
          )
        )
          continue;
        spatialIssue028(
          errors,
          token,
          'coral.identity.constraint.duplicate',
          `Duplicate constraint ID: ${identity}`,
          first,
        );
        continue;
      }
      ids.set(identity, token);
    }
    if (item.kind === 'arrangement') {
      // Legacy arrangements already have an exact entry and retain legacy diagnostic behavior.
      if (
        !item.subjects.some(
          (t) => (t as RectangleToken028).referenceKind !== undefined,
        ) &&
        !item.parameters
      )
        continue;
      const subjects = item.subjects.map((t) =>
        resolve(t as RectangleToken028, item.scope),
      );
      const seen = new Map<string, CandidateToken>();
      subjects.forEach((ref, i) => {
        if (!ref) return;
        const key = JSON.stringify(ref);
        const first = seen.get(key);
        if (first)
          spatialIssue028(
            errors,
            item.subjects[i]!,
            'coral.constraint.subjects.invalid',
            'Repeated resolved rectangle',
            first,
          );
        else seen.set(key, item.subjects[i]!);
      });
      if (subjects.every((r): r is SpatialRectangleReferenceSuccessor => !!r))
        result.push({
          id: identity ?? allocate(item.scope),
          kind: 'arrangement',
          axis: item.axis.value as 'row' | 'column',
          subjects,
          ...item.parameters,
        });
      continue;
    }
    const subject = resolve(item.subject, item.scope);
    if (!subject) continue;
    if (item.operation === 'relative') {
      const target = resolve(item.target!, item.scope);
      if (target)
        result.push({
          id: identity!,
          kind: 'relative',
          subject,
          target,
          relation: item.relation!,
          ...item.parameters,
        });
    } else {
      let scope:
        | { kind: 'graph' }
        | { kind: 'node'; nodeId: string }
        | undefined;
      if (item.boundaryScope === 'graph') scope = { kind: 'graph' };
      else if (item.boundaryScope) {
        const checked = resolve(item.boundaryScope, item.scope);
        if (checked?.kind === 'node' && item.boundaryScope.groupOnly)
          scope = checked;
      }
      if (scope?.kind === 'node') {
        const groupId = scope.nodeId;
        const ancestor = (nodeId: string) => nodeId.startsWith(groupId + '.');
        const valid =
          'nodeId' in subject
            ? ancestor(subject.nodeId)
            : (() => {
                const edge = edges.get(subject.edgeId);
                return (
                  !!edge &&
                  ancestor(edge.resolvedSource ?? edge.source.value) &&
                  ancestor(edge.resolvedTarget ?? edge.target.value)
                );
              })();
        if (!valid) scope = undefined;
      }
      if (!scope)
        spatialIssue028(
          errors,
          item.boundaryScope === 'graph'
            ? item.keyword
            : (item.boundaryScope ?? item.keyword),
          'coral.constraint.scope.invalid',
          'Scope must be the diagram or a strict ancestor group',
        );
      else
        result.push({
          id: identity!,
          kind: 'boundary',
          subject,
          scope,
          side: item.side!,
          ...item.parameters,
        });
    }
  }
  return result;
}
