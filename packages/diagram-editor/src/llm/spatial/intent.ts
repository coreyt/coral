import type {
  ArrangementAxis,
  ArrangementDirection,
  SpatialCommand,
  SpatialRecognition,
  SpatialReference,
} from './types';

const REFERENCE_SOURCE = String.raw`(?:"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z0-9_.-]*)`;
const relativePattern = new RegExp(
  `^(?:move|put|place)\\s+(${REFERENCE_SOURCE})\\s+` +
  `(above|below|(?:to\\s+the\\s+)?left\\s+of|(?:to\\s+the\\s+)?right\\s+of)\\s+(${REFERENCE_SOURCE})$`,
  'i',
);
const boundaryPattern = new RegExp(
  `^(?:move|put|place)\\s+(${REFERENCE_SOURCE})\\s+(?:at|on)\\s+the\\s+` +
  `(top|bottom|left|right)(?:\\s+side)?(?:\\s+(?:of\\s+the\\s+diagram|(?:inside|within)\\s+(${REFERENCE_SOURCE})))?$`,
  'i',
);
const groupArrangePattern = new RegExp(
  `^arrange\\s+(?:members|children)\\s+of\\s+(${REFERENCE_SOURCE})\\s+` +
  `(?:in|into|as)\\s+(?:a\\s+)?(row|column)(?:\\s+(left\\s+to\\s+right|right\\s+to\\s+left|top\\s+to\\s+bottom|bottom\\s+to\\s+top))?$`,
  'i',
);
const arrangePattern = /^arrange\s+(.+?)\s+(?:in|into|as)\s+(?:a\s+)?(row|column)(?:\s+(left\s+to\s+right|right\s+to\s+left|top\s+to\s+bottom|bottom\s+to\s+top))?$/i;

function unsupported(): SpatialRecognition {
  return {
    classification: 'unsupported',
    consumedRanges: [],
    diagnostics: [{ code: 'spatial.unsupported', message: 'The spatial request is outside grammar version 1' }],
  };
}

function parseReference(raw: string): SpatialReference | undefined {
  if (raw.startsWith('"')) {
    try {
      const text = JSON.parse(raw);
      return typeof text === 'string' && text.length > 0 ? { text } : undefined;
    } catch {
      return undefined;
    }
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(raw) || /^(?:it|them|this|that|these|those)$/i.test(raw)) return undefined;
  return { text: raw };
}

function direction(axis: ArrangementAxis, raw?: string): ArrangementDirection | undefined {
  if (!raw) return axis === 'row' ? 'left-to-right' : 'top-to-bottom';
  const normalized = raw.toLowerCase().replace(/\s+/g, '-');
  if (axis === 'row' && (normalized === 'left-to-right' || normalized === 'right-to-left')) return normalized;
  if (axis === 'column' && (normalized === 'top-to-bottom' || normalized === 'bottom-to-top')) return normalized;
  return undefined;
}

function parseMemberList(raw: string): SpatialReference[] | undefined {
  const refs: SpatialReference[] = [];
  const separators: string[] = [];
  let offset = 0;
  const refPattern = new RegExp(`\\s*(${REFERENCE_SOURCE})`, 'y');
  while (offset < raw.length) {
    refPattern.lastIndex = offset;
    const match = refPattern.exec(raw);
    if (!match) return undefined;
    const ref = parseReference(match[1]);
    if (!ref) return undefined;
    refs.push(ref);
    offset = refPattern.lastIndex;
    const rest = raw.slice(offset);
    if (/^\s*$/.test(rest)) break;
    const separator = rest.match(/^\s*(?:,\s*(?:and\s+)?|and\s+)/i);
    if (!separator) return undefined;
    separators.push(separator[0].trim().toLowerCase().replace(/\s+/g, ' '));
    offset += separator[0].length;
    if (/^\s*$/.test(raw.slice(offset))) return undefined;
  }
  if (refs.length < 2 || separators.length !== refs.length - 1) return undefined;
  if (refs.length === 2) return separators[0] === ',' || separators[0] === 'and' || separators[0] === ', and' ? refs : undefined;
  const earlier = separators.slice(0, -1);
  const last = separators[separators.length - 1];
  return earlier.every((separator) => separator === ',')
    && (last === ',' || last === 'and' || last === ', and') ? refs : undefined;
}

function parseCommand(text: string): SpatialCommand | undefined {
  let match = relativePattern.exec(text);
  if (match) {
    const subject = parseReference(match[1]);
    const target = parseReference(match[3]);
    if (!subject || !target) return undefined;
    const relationText = match[2].toLowerCase().replace(/\s+/g, ' ');
    const relation = relationText === 'above' || relationText === 'below'
      ? relationText
      : relationText.includes('left') ? 'left-of' : 'right-of';
    return { kind: 'relative', subject, relation, target };
  }

  match = boundaryPattern.exec(text);
  if (match) {
    const subject = parseReference(match[1]);
    if (!subject) return undefined;
    const scopeRef = match[3] ? parseReference(match[3]) : undefined;
    if (match[3] && !scopeRef) return undefined;
    return {
      kind: 'boundary',
      subject,
      side: match[2].toLowerCase() as 'top' | 'bottom' | 'left' | 'right',
      scope: scopeRef ? { kind: 'group', reference: scopeRef } : { kind: 'diagram' },
    };
  }

  match = groupArrangePattern.exec(text);
  if (match) {
    const reference = parseReference(match[1]);
    const axis = match[2].toLowerCase() as ArrangementAxis;
    const resolvedDirection = direction(axis, match[3]);
    if (!reference || !resolvedDirection) return undefined;
    return { kind: 'arrange', members: { kind: 'group', reference }, axis, direction: resolvedDirection };
  }

  match = arrangePattern.exec(text);
  if (match) {
    const members = parseMemberList(match[1]);
    const axis = match[2].toLowerCase() as ArrangementAxis;
    const resolvedDirection = direction(axis, match[3]);
    if (!members || !resolvedDirection) return undefined;
    return { kind: 'arrange', members: { kind: 'explicit', references: members }, axis, direction: resolvedDirection };
  }
  return undefined;
}

function segments(text: string): Array<{ start: number; end: number; text: string }> | undefined {
  const result: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (index < text.length && quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (index === text.length || char === ';' || char === '\n' || char === '\r' || char === '\u2028' || char === '\u2029') {
      let left = start;
      let right = index;
      while (left < right && /\s/.test(text[left])) left++;
      while (right > left && /\s/.test(text[right - 1])) right--;
      while (right > left && /[.!?]/.test(text[right - 1])) right--;
      while (right > left && /\s/.test(text[right - 1])) right--;
      if (left < right) result.push({ start: left, end: right, text: text.slice(left, right) });
      start = index + 1;
      if (char === '\r' && text[index + 1] === '\n') start++;
    }
  }
  return quoted || escaped ? undefined : result;
}

function hasSpatialTrigger(text: string): boolean {
  let masked = '';
  let quoted = false;
  let escaped = false;
  for (const char of text) {
    if (quoted) {
      masked += ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
      masked += ' ';
    } else masked += char;
  }
  return /\b(?:move|put|place|arrange|above|below|left|right|row|column)\b/i.test(masked);
}

export function recognizeSpatialRequest(text: string): SpatialRecognition {
  const clauses = segments(text);
  if (!clauses) return unsupported();
  const parsed = clauses.map((clause) => ({ clause, command: parseCommand(clause.text) }));
  const commands = parsed.filter((entry): entry is typeof entry & { command: SpatialCommand } => Boolean(entry.command));
  if (commands.length !== 1) {
    return commands.length > 1 || hasSpatialTrigger(text)
      ? unsupported()
      : { classification: 'non-spatial', consumedRanges: [], diagnostics: [] };
  }
  const invalidSpatialSegment = parsed.some((entry) => !entry.command && hasSpatialTrigger(entry.clause.text));
  if (invalidSpatialSegment) return unsupported();
  const { clause, command } = commands[0];
  return {
    classification: clauses.length === 1 ? 'spatial-only' : 'mixed',
    command,
    consumedRanges: [{ start: clause.start, end: clause.end }],
    diagnostics: [],
  };
}
