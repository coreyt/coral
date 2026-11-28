/**
 * One format detector shared by the editor's Open and the MCP tools (R-064 AC-1).
 *
 * The extension decides first; content is sniffed only when the extension is
 * unknown or absent. The result says how it was decided, so callers never
 * guess silently: a `null` format is unrecognized, and a `fallback` basis is
 * Coral assumed because no other signature matched.
 */

export const SOURCE_FORMATS = [
  'coral', 'mermaid', 'dot', 'plantuml', 'graphir-json', 'coral-document',
] as const;

export type SourceFormat = typeof SOURCE_FORMATS[number];

export interface FormatDetection {
  format: SourceFormat | null;
  basis: 'extension' | 'content' | 'fallback';
  /** Formats considered when `format` is null or `basis` is `fallback`. */
  candidates: SourceFormat[];
}

const EXTENSIONS: Array<[RegExp, SourceFormat]> = [
  [/\.coral$/i, 'coral'],
  [/\.(mmd|mermaid)$/i, 'mermaid'],
  [/\.(dot|gv)$/i, 'dot'],
  [/\.(puml|plantuml|pu)$/i, 'plantuml'],
];

/** File-picker accept list for every extension the detector recognizes. */
export const OPEN_FILE_ACCEPT = [
  '.coral', '.coral.json', '.json', '.mmd', '.mermaid', '.dot', '.gv', '.puml', '.plantuml', '.pu', '.txt',
].join(',');

const JSON_CANDIDATES: SourceFormat[] = ['coral-document', 'graphir-json'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function detectJson(text: string): FormatDetection {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { format: null, basis: 'content', candidates: JSON_CANDIDATES };
  }
  if (isRecord(value) && isRecord(value.content) && typeof value.schemaVersion === 'string') {
    return { format: 'coral-document', basis: 'content', candidates: [] };
  }
  if (isRecord(value) && Array.isArray(value.nodes) && value.version !== undefined) {
    return { format: 'graphir-json', basis: 'content', candidates: [] };
  }
  return { format: null, basis: 'content', candidates: JSON_CANDIDATES };
}

/** Skip leading blank lines, comments, directives, and one front-matter block. */
function skipPreamble(text: string): string {
  let rest = text.trimStart();
  if (/^---\r?\n/.test(rest)) {
    const close = rest.slice(3).search(/\r?\n---(\r?\n|$)/);
    if (close >= 0) rest = rest.slice(3 + close).replace(/^\r?\n---/, '').trimStart();
  }
  for (;;) {
    const next = rest.startsWith('/*') && rest.includes('*/')
      ? rest.slice(rest.indexOf('*/') + 2)
      : rest.startsWith('%%{') && rest.includes('}%%')
        ? rest.slice(rest.indexOf('}%%') + 3)
        : /^(%%|\/\/|#)/.test(rest) ? rest.replace(/^[^\n]*/, '') : null;
    if (next === null) return rest;
    rest = next.trimStart();
  }
}

export function detectFormat(text: string, options: { fileName?: string } = {}): FormatDetection {
  const name = options.fileName ?? '';
  for (const [pattern, format] of EXTENSIONS) {
    if (pattern.test(name)) return { format, basis: 'extension', candidates: [] };
  }
  const trimmed = text.trim();
  if (/\.json$/i.test(name) || trimmed.startsWith('{') || trimmed.startsWith('[')) return detectJson(trimmed);
  if (text.includes('\u0000')) {
    return { format: null, basis: 'content', candidates: [...SOURCE_FORMATS] };
  }
  const head = skipPreamble(trimmed);
  if (/^@(graph|diagram)\b/.test(head)) return { format: 'coral', basis: 'content', candidates: [] };
  if (/^@start/i.test(head)) return { format: 'plantuml', basis: 'content', candidates: [] };
  // Mermaid is checked first: `graph TD` also matches a naive DOT pattern.
  if (/^(flowchart|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|timeline|block(?:-beta)?|packet(?:-beta)?|kanban|architecture-beta|gantt|pie|journey|gitGraph|mindmap|quadrantChart|requirementDiagram|sankey(?:-beta)?|xychart(?:-beta)?|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|zenuml|radar-beta|treemap(?:-beta)?|venn-beta|ishikawa(?:-beta)?|usecase(?:-beta)?|eventmodeling|treeView-beta|cynefin-beta|wardley-beta)(?=[ \t;]|%%|\r?\n|$)/i.test(head)
    || /^graph(?:[ \t]+(?:TB|TD|BT|RL|LR)\b|[ \t]*(?:;[ \t]*)?(?:%%[^\r\n]*)?(?:\r?\n|$))/i.test(head)) {
    return { format: 'mermaid', basis: 'content', candidates: [] };
  }
  if (/^(strict\s+)?(di)?graph\b[^{]*\{/i.test(head)) return { format: 'dot', basis: 'content', candidates: [] };
  return { format: 'coral', basis: 'fallback', candidates: SOURCE_FORMATS.filter((format) => format !== 'coral') };
}
