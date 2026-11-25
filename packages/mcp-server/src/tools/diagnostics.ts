import {
  parseDot, parseMermaid, parsePlantUml, type Diagnostic, type ParseResult,
} from '@coral-viz/language';
import { readCoralSource028 } from './coralSource028.js';

/** Parse text in a detected source format with its language importer. */
export function parseAs(format: string, content: string): ParseResult {
  switch (format) {
    case 'mermaid': return parseMermaid(content);
    case 'dot': return parseDot(content);
    case 'plantuml': return parsePlantUml(content);
    case 'coral': return readCoralSource028(content).parse;
    default: throw new Error(`Unsupported source format: ${format}`);
  }
}

/** A parser refusal retains its complete channel across shared graph readers. */
export class GraphInputFailure extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(formatDiagnostics(diagnostics));
    this.name = 'GraphInputFailure';
  }
}

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map((diagnostic) => {
    const where = diagnostic.position ? ` (line ${diagnostic.position.line})` : '';
    const column = diagnostic.position ? ` (column ${diagnostic.position.column + 1})` : '';
    const related = diagnostic.related?.map((location) =>
      `  Related (line ${location.position.line}, column ${location.position.column + 1}): ${location.message}`) ?? [];
    const label = diagnostic.severity === 'error' ? '✗ PARSE_ERROR' : diagnostic.severity;
    return [`${label}${where} ${diagnostic.code}: ${diagnostic.message}${column}`,
      ...related, ...(diagnostic.hint ? [`  Hint: ${diagnostic.hint}`] : [])].join('\n');
  }).join('\n');
}

export function inputFailureResponse(error: GraphInputFailure) {
  return {
    content: [{ type: 'text' as const, text: `Could not parse diagram input:\n${error.message}` }],
    structuredContent: { diagnostics: error.diagnostics },
    isError: true as const,
  };
}
