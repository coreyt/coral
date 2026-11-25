/** Shared shapes for opening a file from any entry point (R-064). */
import type { EditorParseError } from './parsers';

export interface OpenFileInput {
  name: string;
  text: string;
}

/** A blocked open: every reason, shown visibly, with current work unchanged. */
export interface OpenFailure {
  fileName: string;
  reasons: EditorParseError[];
}

/** One reason as a visible line: code, message, then position when known. */
export function describeOpenReason(reason: EditorParseError): string {
  const line = reason.position?.line ?? reason.line;
  const column = reason.position?.column ?? reason.column;
  const where = line ? ` (line ${line}${column !== undefined ? `, column ${column + 1}` : ''})` : '';
  const related = reason.related?.map((location) =>
    `; related line ${location.position.line}: ${location.message}`).join('') ?? '';
  return `${reason.code ? `[${reason.code}] ` : ''}${reason.message}${where}${related}`;
}
