import { parseMermaid } from '@coral-viz/language';
import { parseCoralDSL, editorDiagnostic, type EditorParseError } from '../parsers';
import type { OutputFormat } from './types';

export type AiFormatValidation = { ok: true } | { ok: false; error: string; diagnostics?: EditorParseError[] };

const SAFE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DISALLOWED_MERMAID = [
  /^\s*(?:subgraph|end|click|classDef|class|style|linkStyle)\b/im,
  /%%\s*\{/,
  /<\/?[A-Za-z][^>]*>/,
  /\(\(|\)\)|\[\[|\]\]|\{\{|\}\}|\[\/|\/\]|\[\\|\\\]|\(\[/,
  /(?:==>|~~~|--o|--x|<--|<-.->|x--|o--)/,
] as const;

/** Closed format gate for model-produced text; import support is intentionally broader. */
export function validateAiFormat(source: string, format: OutputFormat): AiFormatValidation {
  if (format === 'coral') {
    const parsed = parseCoralDSL(source);
    if (parsed.nodes.length === 0 || parsed.errors.length > 0) {
      return { ok: false, error: parsed.errors[0]?.message ?? 'Coral AI output contains no nodes', diagnostics: parsed.diagnostics ?? parsed.errors };
    }
    return { ok: true };
  }

  const lines = source.trim().split(/\r?\n/);
  if (!/^flowchart\s+(?:TD|TB|BT|LR|RL)\s*$/.test(lines[0] ?? '')) {
    return { ok: false, error: 'AI Mermaid output must start with flowchart and a supported direction' };
  }
  for (const pattern of DISALLOWED_MERMAID) {
    if (pattern.test(source)) return { ok: false, error: 'AI Mermaid output uses an unsupported construct' };
  }
  const parsed = parseMermaid(source);
  const errors = parsed.diagnostics.filter((item) => item.severity === 'error' || item.code.endsWith('.unparsed'));
  if (!parsed.success || !parsed.graph || parsed.graph.nodes.length === 0 || errors.length > 0) {
    return { ok: false, error: errors[0]?.message ?? 'Invalid Mermaid flowchart output', diagnostics: parsed.diagnostics.map(editorDiagnostic) };
  }
  const invalidId = flattenNodes(parsed.graph.nodes).find((node) => !SAFE_ID.test(node.id));
  if (invalidId) return { ok: false, error: `Mermaid AI identifier "${invalidId.id}" is not supported` };
  return { ok: true };
}

function flattenNodes(nodes: Array<{ id: string; children?: Array<{ id: string; children?: unknown[] }> }>): Array<{ id: string }> {
  return nodes.flatMap((node) => [node, ...flattenNodes((node.children ?? []) as Array<{ id: string; children?: Array<{ id: string }> }>)]);
}
