/** One fail-closed source boundary for MCP consumers of Coral 0.2.8 text. */
import {
  finishParse, parseDiagnostic,
  type HeaderDiagnostic028, type ParseDiagnostic, type ParseResult,
  type ResolvedHeader028,
} from '@coral-viz/language';
import { parseInstalledDocument028, projectInstalledSourceToSuccessor028 } from '@coral-viz/render';

type InstalledDocument028 = ReturnType<typeof parseInstalledDocument028>;

function headerDiagnostic(item: HeaderDiagnostic028): ParseDiagnostic {
  // The header and body parsers share one zero-based UTF-16 column contract.
  const range = item.range;
  return parseDiagnostic({ severity: 'error', code: item.code, message: item.message,
    position: range.start, range,
    ...(item.related ? { related: item.related.map((related) => {
      const relatedRange = related.range;
      return { message: related.message, position: relatedRange.start, range: relatedRange };
    }) } : {}),
  });
}

export function installedSourceDiagnostics028(document: InstalledDocument028): ParseDiagnostic[] {
  return [...document.header.diagnostics.map(headerDiagnostic), ...document.syntax.diagnostics];
}

export function readCoralSource028(source: string): {
  source: string;
  header?: ResolvedHeader028;
  parse: ParseResult;
} {
  const document = parseInstalledDocument028(source);
  const sourceDiagnostics = installedSourceDiagnostics028(document);
  const projected = sourceDiagnostics.some((item) => item.severity === 'error')
    ? undefined : projectInstalledSourceToSuccessor028(document);
  // A graph-wide projection failure has no exact body token; anchor it to the
  // diagram type rather than inventing a source span inside an authored line.
  const graphPosition = document.header.diagramTypeRange?.start ?? { line: 1, column: 0, offset: 0 };
  const projectionDiagnostics = projected?.diagnostics.map((item) => parseDiagnostic({
    severity: 'error', code: item.code, message: item.message,
    position: item.range?.start ?? graphPosition,
    ...(item.range ? { range: item.range } : {}),
    ...(item.related ? { related: item.related.map((related) => ({
      message: related.message, position: related.range.start, range: related.range,
    })) } : {}),
  })) ?? [];
  const parse = finishParse([...sourceDiagnostics, ...projectionDiagnostics],
    projected?.graph ? document.graph : undefined);
  return { source, ...(document.header.header ? { header: document.header.header } : {}), parse };
}
