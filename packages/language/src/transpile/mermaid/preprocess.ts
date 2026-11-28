import type {
  MermaidTop5Kind,
  TranspileDiagnostic,
  TranspileSourcePosition,
  TranspileSourceRange,
} from './types.js';

export interface PhysicalLine {
  /** 1-based line number. */
  number: number;
  /** Text without trailing CR/LF. */
  text: string;
  /** 0-based UTF-16 start offset in original source. */
  start: number;
  /** 0-based UTF-16 end offset (excluding CR/LF). */
  end: number;
}

export interface LineIndex {
  readonly source: string;
  readonly lines: readonly PhysicalLine[];
  positionAt(offset: number): TranspileSourcePosition;
  range(startOffset: number, endOffset: number): TranspileSourceRange;
  lineRange(lineNumber: number, colStart?: number, colEnd?: number): TranspileSourceRange;
}

export function buildLineIndex(source: string): LineIndex {
  const lines: PhysicalLine[] = [];
  let start = 0;
  let number = 1;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    if (ch === 10 /* \n */) {
      const end = i > start && source.charCodeAt(i - 1) === 13 /* \r */ ? i - 1 : i;
      lines.push({ number: number++, text: source.slice(start, end), start, end });
      start = i + 1;
    }
  }
  const tailEnd = source.length > start && source.charCodeAt(source.length - 1) === 13
    ? source.length - 1 : source.length;
  lines.push({ number, text: source.slice(start, tailEnd), start, end: tailEnd });

  const positionAt = (offset: number): TranspileSourcePosition => {
    const clamped = Math.max(0, Math.min(offset, source.length));
    let lo = 0;
    let hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lines[mid]!.start <= clamped) lo = mid;
      else hi = mid - 1;
    }
    const line = lines[lo]!;
    return { line: line.number, column: clamped - line.start, offset: clamped };
  };

  const range = (startOffset: number, endOffset: number): TranspileSourceRange => ({
    start: positionAt(startOffset),
    end: positionAt(Math.max(startOffset, endOffset)),
  });

  const lineRange = (lineNumber: number, colStart = 0, colEnd?: number): TranspileSourceRange => {
    const line = lines[Math.max(0, Math.min(lineNumber - 1, lines.length - 1))]!;
    const s = Math.max(0, Math.min(colStart, line.text.length));
    const e = colEnd === undefined ? line.text.length : Math.max(s, Math.min(colEnd, line.text.length));
    return {
      start: { line: line.number, column: s, offset: line.start + s },
      end: { line: line.number, column: e, offset: line.start + e },
    };
  };

  return { source, lines, positionAt, range, lineRange };
}

export interface BodyLine {
  /** 1-based physical line number in original source. */
  lineNumber: number;
  /** Physical line text with trailing %% comments stripped (outside quotes) when appropriate. */
  text: string;
  /** Start UTF-16 offset of `text` in original source. */
  startOffset: number;
}

export interface PreprocessResult {
  lineIndex: LineIndex;
  diagnostics: TranspileDiagnostic[];
  /** Detected Top-5 kind or unsupported diagram keyword, or null on error/unrecognized. */
  detectedKind: MermaidTop5Kind | string | null;
  supported: boolean;
  /** Flowchart direction token if present on header line (TD|TB|BT|LR|RL). */
  headerDirection?: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  /** Body lines following the diagram header with frontmatter, %%{init}%%, and acc* stripped. */
  bodyLines: BodyLine[];
  /** Preserved plain %% comments (when preserveComments is true). */
  comments: string[];
}

const SUPPORTED_LIST = 'flowchart/graph, sequenceDiagram, classDiagram, erDiagram, stateDiagram-v2';

const UNSUPPORTED_HEADERS: Readonly<Record<string, string>> = {
  journey: 'journey',
  gantt: 'gantt',
  pie: 'pie',
  quadrantchart: 'quadrantChart',
  requirementdiagram: 'requirementDiagram',
  gitgraph: 'gitGraph',
  c4context: 'C4Context',
  c4container: 'C4Container',
  c4component: 'C4Component',
  c4dynamic: 'C4Dynamic',
  c4deployment: 'C4Deployment',
  mindmap: 'mindmap',
  timeline: 'timeline',
  zenuml: 'zenuml',
  sankey: 'sankey',
  'sankey-beta': 'sankey-beta',
  xychart: 'xychart',
  'xychart-beta': 'xychart-beta',
  block: 'block',
  'block-beta': 'block-beta',
  packet: 'packet',
  'packet-beta': 'packet-beta',
  kanban: 'kanban',
  'architecture-beta': 'architecture-beta',
  'radar-beta': 'radar-beta',
  treemap: 'treemap',
  'treemap-beta': 'treemap-beta',
  'venn-beta': 'venn-beta',
  ishikawa: 'ishikawa',
  'ishikawa-beta': 'ishikawa-beta',
  usecase: 'usecase',
  'usecase-beta': 'usecase-beta',
  eventmodeling: 'eventmodeling',
  'treeview-beta': 'treeView-beta',
  'cynefin-beta': 'cynefin-beta',
  'wardley-beta': 'wardley-beta',
};

function stripInlineMermaidComment(text: string): { code: string; comment?: string } {
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inDouble) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      continue;
    }
    if (ch === '%' && text[i + 1] === '%') {
      return { code: text.slice(0, i), comment: text.slice(i + 2).trim() };
    }
  }
  return { code: text };
}

function sanitizeCommentText(
  raw: string,
  diagnostics: TranspileDiagnostic[],
  range: TranspileSourceRange,
): string | null {
  let out = '';
  let hasInvalid = false;
  for (let i = 0; i < raw.length; i++) {
    const unit = raw.charCodeAt(i);
    if (unit === 0x09) { out += ' '; continue; }
    if (unit === 0x0d || unit === 0x0a || unit === 0x2028 || unit === 0x2029) {
      out += ' ';
      continue;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = raw.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += raw.slice(i, i + 2);
        i++;
        continue;
      }
      hasInvalid = true;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      hasInvalid = true;
      continue;
    }
    if (unit < 0x20 || (unit >= 0x7f && unit <= 0x9f) || unit === 0xfffe || unit === 0xffff) {
      hasInvalid = true;
      continue;
    }
    out += raw[i]!;
  }
  if (hasInvalid) {
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.text.invalid-scalar',
      message: 'Preserved comment contains prohibited control characters, non-XML-1.0 scalars, or isolated surrogates.',
      range,
    });
    return null;
  }
  return out.trim();
}

function classifyHeader(trimmed: string): {
  kind: MermaidTop5Kind | string | null;
  supported: boolean;
  direction?: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
} {
  // Strip optional trailing semicolon
  const noSemi = trimmed.endsWith(';') ? trimmed.slice(0, -1).trimEnd() : trimmed;
  // Extract first token (letters, digits, hyphens)
  let tokEnd = 0;
  while (tokEnd < noSemi.length) {
    const c = noSemi.charCodeAt(tokEnd);
    const isWord = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45 || c === 95;
    if (!isWord) break;
    tokEnd++;
  }
  const firstToken = noSemi.slice(0, tokEnd);
  const rest = noSemi.slice(tokEnd).trim();
  const lower = firstToken.toLowerCase();

  if (lower === 'flowchart' || lower === 'graph') {
    if (!rest) {
      return { kind: 'flowchart', supported: true };
    }
    const dirUpper = rest.toUpperCase();
    if (dirUpper === 'TD' || dirUpper === 'TB' || dirUpper === 'BT' || dirUpper === 'LR' || dirUpper === 'RL') {
      return { kind: 'flowchart', supported: true, direction: dirUpper };
    }
    // `graph G {` is DOT, not Mermaid
    return { kind: null, supported: false };
  }
  if (lower === 'sequencediagram' && !rest) {
    return { kind: 'sequence', supported: true };
  }
  if ((lower === 'classdiagram' || lower === 'classdiagram-v2') && !rest) {
    return { kind: 'class', supported: true };
  }
  if (lower === 'erdiagram' && !rest) {
    return { kind: 'er', supported: true };
  }
  if ((lower === 'statediagram' || lower === 'statediagram-v2') && !rest) {
    return { kind: 'state', supported: true };
  }

  if (Object.prototype.hasOwnProperty.call(UNSUPPORTED_HEADERS, lower)) {
    return { kind: UNSUPPORTED_HEADERS[lower]!, supported: false };
  }
  return { kind: null, supported: false };
}

export function preprocessMermaid(
  source: string,
  options: { maxInputLength?: number; preserveComments?: boolean } = {},
): PreprocessResult {
  const maxLen = options.maxInputLength ?? 524_288;
  const lineIndex = buildLineIndex(source);
  const diagnostics: TranspileDiagnostic[] = [];
  const comments: string[] = [];

  if (source.length > maxLen) {
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.input.too-large',
      message: `Mermaid input exceeds maximum allowed length of ${maxLen} characters (${source.length}).`,
      range: lineIndex.range(0, Math.min(source.length, 1)),
    });
    return { lineIndex, diagnostics, detectedKind: null, supported: false, bodyLines: [], comments };
  }

  if (!source.trim()) {
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.input.empty',
      message: 'Mermaid input is empty.',
      range: lineIndex.lineRange(1, 0, 0),
    });
    return { lineIndex, diagnostics, detectedKind: null, supported: false, bodyLines: [], comments };
  }

  const lines = lineIndex.lines;
  let idx = 0;

  // Skip leading blank lines
  while (idx < lines.length && lines[idx]!.text.trim() === '') idx++;

  // 1. Optional YAML frontmatter (--- ... ---)
  if (idx < lines.length && lines[idx]!.text.trim() === '---') {
    const fmStartIdx = idx;
    let fmCloseIdx = -1;
    for (let j = idx + 1; j < lines.length; j++) {
      if (lines[j]!.text.trim() === '---') {
        fmCloseIdx = j;
        break;
      }
    }
    if (fmCloseIdx > fmStartIdx) {
      let inConfig = false;
      let reportedConfig = false;
      for (let j = fmStartIdx + 1; j < fmCloseIdx; j++) {
        const line = lines[j]!;
        const trimmed = line.text.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const indent = line.text.length - line.text.trimStart().length;
        if (indent === 0) {
          inConfig = false;
          if (/^title\s*:/.test(trimmed)) {
            diagnostics.push({
              severity: 'info',
              code: 'mermaid.frontmatter.title.dropped',
              message: 'YAML frontmatter title has no Coral saved-source equivalent and was omitted.',
              range: lineIndex.lineRange(line.number, 0, line.text.length),
              source: trimmed,
            });
          } else if (/^config\s*:/.test(trimmed)) {
            inConfig = true;
            if (!reportedConfig) {
              reportedConfig = true;
              diagnostics.push({
                severity: 'warning',
                code: 'mermaid.frontmatter.config.dropped',
                message: 'YAML frontmatter config has no Coral saved-source equivalent and was omitted.',
                range: lineIndex.lineRange(line.number, 0, line.text.length),
                source: trimmed,
              });
            }
          } else if (!reportedConfig) {
            reportedConfig = true;
            diagnostics.push({
              severity: 'warning',
              code: 'mermaid.frontmatter.config.dropped',
              message: `YAML frontmatter entry "${trimmed.split(':')[0] ?? trimmed}" was omitted.`,
              range: lineIndex.lineRange(line.number, 0, line.text.length),
              source: trimmed,
            });
          }
        } else if (!inConfig && !reportedConfig) {
          reportedConfig = true;
          diagnostics.push({
            severity: 'warning',
            code: 'mermaid.frontmatter.config.dropped',
            message: 'YAML frontmatter config has no Coral saved-source equivalent and was omitted.',
            range: lineIndex.lineRange(line.number, 0, line.text.length),
            source: trimmed,
          });
        }
      }
      idx = fmCloseIdx + 1;
    }
  }

  // 2. Scan preamble comments and %%{...}%% directives (single- and multi-line) up to diagram header
  let headerIdx = -1;
  let detectedKind: MermaidTop5Kind | string | null = null;
  let supported = false;
  let headerDirection: 'TD' | 'TB' | 'BT' | 'LR' | 'RL' | undefined;

  while (idx < lines.length) {
    const line = lines[idx]!;
    const trimmed = line.text.trim();
    if (!trimmed) { idx++; continue; }

    if (trimmed.startsWith('%%{')) {
      const startLine = line;
      const startCol = line.text.indexOf('%%{');
      let endLine = line;
      let closePos = line.text.indexOf('}%%', startCol + 3);
      while (closePos < 0 && idx + 1 < lines.length) {
        idx++;
        endLine = lines[idx]!;
        closePos = endLine.text.indexOf('}%%');
      }
      const endOffset = closePos >= 0 ? endLine.start + closePos + 3 : endLine.end;
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.directive.init.dropped',
        message: 'Mermaid %%{init:...}%% directive has no Coral saved-source equivalent and was omitted.',
        range: lineIndex.range(startLine.start + startCol, endOffset),
        source: trimmed,
      });
      // If there's code after }%% on the same line, check it as header
      if (closePos >= 0) {
        const after = endLine.text.slice(closePos + 3).trim();
        if (after && !after.startsWith('%%')) {
          const { code } = stripInlineMermaidComment(after);
          const classified = classifyHeader(code.trim());
          headerIdx = idx;
          detectedKind = classified.kind;
          supported = classified.supported;
          headerDirection = classified.direction;
          idx++;
          break;
        }
      }
      idx++;
      continue;
    }

    if (trimmed.startsWith('%%')) {
      if (options.preserveComments) {
        const text = sanitizeCommentText(trimmed.slice(2).trim(), diagnostics, lineIndex.lineRange(line.number, 0, line.text.length));
        if (text) comments.push(text);
      }
      idx++;
      continue;
    }

    const { code } = stripInlineMermaidComment(trimmed);
    const classified = classifyHeader(code.trim());
    headerIdx = idx;
    detectedKind = classified.kind;
    supported = classified.supported;
    headerDirection = classified.direction;
    idx++;
    break;
  }

  if (headerIdx < 0) {
    diagnostics.push({
      severity: 'error',
      code: 'mermaid.diagram.unrecognized',
      message: `No Mermaid diagram header found. Supported types: ${SUPPORTED_LIST}.`,
      range: lineIndex.lineRange(1, 0, lines[0]!.text.length),
    });
    return { lineIndex, diagnostics, detectedKind: null, supported: false, bodyLines: [], comments };
  }

  const headerLine = lines[headerIdx]!;
  if (!supported) {
    if (detectedKind) {
      diagnostics.push({
        severity: 'error',
        code: 'mermaid.diagram.unsupported',
        message: `Mermaid diagram type "${detectedKind}" is not supported for Coral transpilation. Supported types: ${SUPPORTED_LIST}.`,
        range: lineIndex.lineRange(headerLine.number, 0, headerLine.text.length),
        source: headerLine.text.trim(),
      });
    } else {
      diagnostics.push({
        severity: 'error',
        code: 'mermaid.diagram.unrecognized',
        message: `Unrecognized Mermaid diagram header "${headerLine.text.trim()}". Supported types: ${SUPPORTED_LIST}.`,
        range: lineIndex.lineRange(headerLine.number, 0, headerLine.text.length),
        source: headerLine.text.trim(),
      });
    }
    return { lineIndex, diagnostics, detectedKind, supported: false, bodyLines: [], comments };
  }

  // 3. Collect body lines, consuming in-body %%{init}%% directives, %% comments, and accTitle/accDescr
  const bodyLines: BodyLine[] = [];
  let inAccDescrBlock = false;
  for (; idx < lines.length; idx++) {
    const line = lines[idx]!;
    const trimmed = line.text.trim();
    if (inAccDescrBlock) {
      if (trimmed.includes('}')) {
        inAccDescrBlock = false;
      }
      continue;
    }
    if (!trimmed) continue;

    if (trimmed.startsWith('%%{')) {
      const startLine = line;
      const startCol = line.text.indexOf('%%{');
      let endLine = line;
      let closePos = line.text.indexOf('}%%', startCol + 3);
      while (closePos < 0 && idx + 1 < lines.length) {
        idx++;
        endLine = lines[idx]!;
        closePos = endLine.text.indexOf('}%%');
      }
      const endOffset = closePos >= 0 ? endLine.start + closePos + 3 : endLine.end;
      diagnostics.push({
        severity: 'warning',
        code: 'mermaid.directive.init.dropped',
        message: 'Mermaid %%{init:...}%% directive has no Coral saved-source equivalent and was omitted.',
        range: lineIndex.range(startLine.start + startCol, endOffset),
        source: trimmed,
      });
      continue;
    }

    if (trimmed.startsWith('%%')) {
      if (options.preserveComments) {
        const text = sanitizeCommentText(trimmed.slice(2).trim(), diagnostics, lineIndex.lineRange(line.number, 0, line.text.length));
        if (text) comments.push(text);
      }
      continue;
    }

    if (/^accTitle\s*:/.test(trimmed)) {
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.accessibility.dropped',
        message: 'Mermaid accessibility directive accTitle has no Coral saved-source equivalent and was omitted.',
        range: lineIndex.lineRange(line.number, 0, line.text.length),
        source: trimmed,
      });
      continue;
    }

    if (/^accDescr\s*:/.test(trimmed)) {
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.accessibility.dropped',
        message: 'Mermaid accessibility directive accDescr has no Coral saved-source equivalent and was omitted.',
        range: lineIndex.lineRange(line.number, 0, line.text.length),
        source: trimmed,
      });
      continue;
    }

    if (/^accDescr\s*\{/.test(trimmed)) {
      diagnostics.push({
        severity: 'info',
        code: 'mermaid.accessibility.dropped',
        message: 'Mermaid accessibility directive accDescr block has no Coral saved-source equivalent and was omitted.',
        range: lineIndex.lineRange(line.number, 0, line.text.length),
        source: trimmed,
      });
      if (!trimmed.includes('}')) {
        inAccDescrBlock = true;
      }
      continue;
    }

    // For sequence/class/state/er/flowchart, strip trailing %% comment outside quotes
    const { code, comment } = stripInlineMermaidComment(line.text);
    if (comment && options.preserveComments) {
      const clean = sanitizeCommentText(comment, diagnostics, lineIndex.lineRange(line.number, 0, line.text.length));
      if (clean) comments.push(clean);
    }
    if (code.trim() === '') continue;
    bodyLines.push({
      lineNumber: line.number,
      text: code,
      startOffset: line.start,
    });
  }

  return {
    lineIndex,
    diagnostics,
    detectedKind,
    supported: true,
    ...(headerDirection ? { headerDirection } : {}),
    bodyLines,
    comments,
  };
}
