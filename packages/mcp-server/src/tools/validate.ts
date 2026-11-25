/** Validate Coral DSL or Graph-IR with the shared 0.2 contracts. */
import { validateGraphIRSuccessor, validateGraphIRSuccessorWithCatalog, validateIR,
  type SuccessorValidationOptions, type ValidationError as CoreValidationError } from '@graph-ir/core';
import { detectFormat, type Diagnostic } from '@coral-viz/language';
import { checkInstalledSuccessorSourceConformance028, graphIrArtworkAdmission029, parseInstalledDocument028,
  projectInstalledSourceToSuccessor028, successorCatalogSnapshot028, successorCoreValidationInput029,
  verifyPortableSuccessorSource028 } from '@coral-viz/render';
import { formatDiagnostics, parseAs } from './diagnostics.js';
import { installedSourceDiagnostics028 } from './coralSource028.js';
import { migrateGraphJson } from './layout.js';
import { z } from 'zod';

export const validateTool = {
  name: 'coral_validate',
  description: 'Validate Coral DSL or Graph-IR JSON for syntax, schema, and reference errors.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: { type: 'string', description: 'Coral DSL or Graph-IR JSON to validate' },
      strict: { type: 'boolean', description: 'Treat warnings as errors', default: false },
    },
    required: ['content'],
  },
};

const Args = z.object({ content: z.string(), strict: z.boolean().default(false) });

function formatIssue(issue: CoreValidationError): string {
  return `${issue.severity === 'warning' ? '⚠' : '✗'} ${issue.code}: ${issue.message}`;
}

/** `snapshot` and `options` are supplied for a source projection, already in its GraphIR form;
 * user-supplied GraphIR is admitted with the interchange list. */
function checkSuccessorModel(value: unknown, locatedRoutePortPaths: ReadonlySet<string> = new Set(),
  sourceSnapshot?: ReturnType<typeof successorCatalogSnapshot028>,
  options: SuccessorValidationOptions = { artworkAdmission: graphIrArtworkAdmission029 }): {
  diagnostics: Diagnostic[];
  nodes: number;
  edges: number;
} {
  try {
    const structural = validateGraphIRSuccessor(value, options);
    let model = structural;
    if (structural.errors.length === 0) {
      let snapshot: ReturnType<typeof successorCatalogSnapshot028>;
      try {
        snapshot = sourceSnapshot ?? successorCatalogSnapshot028(value as Parameters<typeof successorCatalogSnapshot028>[0]);
      } catch (error) {
        return { diagnostics: [{ severity: 'error', code: 'coral.validate.successor-catalog.unavailable',
          message: error instanceof Error ? error.message : 'The exact installed successor catalog is unavailable.' }],
        nodes: structural.stats?.nodes ?? 0, edges: structural.stats?.edges ?? 0 };
      }
      model = validateGraphIRSuccessorWithCatalog(value, snapshot, options);
    }
    // A source-located route-port finding already explains this exact model
    // cause. Keep every other model error and all JSON-only validation intact.
    const diagnostics: Diagnostic[] = [...model.errors, ...model.warnings].filter((issue) =>
      issue.code !== 'UNKNOWN_ROUTE_SEMANTIC_PORT' || !locatedRoutePortPaths.has(issue.path)).map((issue) => ({
      severity: issue.severity, code: issue.code,
      message: `${issue.message} (GraphIR path ${issue.path})`,
    }));
    if (!model.valid && model.errors.length === 0) diagnostics.push({
      severity: 'error', code: 'coral.validate.successor.invalid',
      message: 'The installed GraphIR successor validator rejected the portable model.',
    });
    if (!model.errors.length && (!model.verification.complete ||
      model.verification.scope !== 'full')) diagnostics.push({
      severity: 'warning', code: 'coral.validate.successor-portability.unverified',
      message: model.verification.obligations.length
        ? `GraphIR successor verification has open obligations: ${model.verification.obligations.map(
          ({ code, path }) => `${code} at ${path}`).join(', ')}.`
        : 'The installed GraphIR successor validator did not establish complete portable verification.',
    });
    return { diagnostics, nodes: model.stats?.nodes ?? 0, edges: model.stats?.edges ?? 0 };
  } catch (error) {
    return { diagnostics: [{ severity: 'error', code: 'coral.validate.successor-validator.unavailable',
      message: error instanceof Error ? error.message : 'The installed GraphIR successor validator failed.' }],
    nodes: 0, edges: 0 };
  }
}

export async function handleValidate(args: unknown) {
  const { content, strict } = Args.parse(args);
  const { format, candidates } = detectFormat(content);
  if (format === 'coral-document') {
    return result(false, 'coral-document', 0, 0, [{
      severity: 'error', code: 'mcp.input.coral-document',
      message: 'A Coral document was given; pass its content.graphIR or the source text, not a Coral document.',
    }]);
  }
  if (format === null) {
    return result(false, 'unrecognized', 0, 0, [{
      severity: 'error', code: 'mcp.input.unrecognized',
      message: `The input matches no supported format; expected one of: ${candidates.join(', ')}.`,
    }]);
  }
  if (format === 'graphir-json') {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch (error) {
      return result(false, 'graph-ir-json', 0, 0, [{
        severity: 'error', code: 'INVALID_JSON',
        message: error instanceof Error ? error.message : String(error),
      }]);
    }
    if (value && typeof value === 'object' && (value as { version?: string }).version === '1.0') {
      value = { ...(value as Record<string, unknown>), version: '1.0.0' };
    }
    if (value && typeof value === 'object' && (value as { version?: string }).version === '4.0.0') {
      const checked = checkSuccessorModel(value);
      return result(!checked.diagnostics.some((issue) => issue.severity === 'error' ||
        (strict && issue.severity === 'warning')),
      'graph-ir-json', checked.nodes, checked.edges, checked.diagnostics);
    }
    // GraphIR 2 migrates as it does for every graph reader; 1.x stays a reported
    // schema failure at this boundary.
    let notes: string[] = [];
    let migrationDiagnostics: Diagnostic[] = [];
    try {
      if ((value as { version?: string } | null)?.version === '2.0.0') {
        ({ graph: value, notes, diagnostics: migrationDiagnostics } = migrateGraphJson(value));
      }
    } catch (error) {
      const diagnostics = error instanceof Error && 'diagnostics' in error
        ? (error as { diagnostics: Diagnostic[] }).diagnostics
        : [{ severity: 'error' as const, code: 'MIGRATION_FAILED', message: error instanceof Error ? error.message : String(error) }];
      return result(false, 'graph-ir-json', 0, 0, diagnostics);
    }
    const validation = validateIR(value, { strict });
    const valid = validation.valid
      && !(strict && migrationDiagnostics.some((diagnostic) => diagnostic.severity === 'warning'));
    return result(valid, 'graph-ir-json', validation.stats?.nodes ?? 0,
      validation.stats?.edges ?? 0,
      migrationDiagnostics, [...validation.errors, ...validation.warnings], notes);
  }

  // Every Coral source candidate uses the installed saved-document reader.
  // A missing or retired header is a located source finding, not a second
  // grammar path through the format importers below.
  if (format === 'coral') {
    const document = parseInstalledDocument028(content);
    const sourceDiagnostics = installedSourceDiagnostics028(document);
    if (sourceDiagnostics.some((item) => item.severity === 'error')) {
      return result(false, 'coral-dsl', 0, 0, sourceDiagnostics);
    }
    const projected = projectInstalledSourceToSuccessor028(content);
    const diagnostics: Diagnostic[] = projected.diagnostics.map((item) => ({
      severity: 'error', code: item.code, message: item.message,
      ...(item.range ? { position: item.range.start, range: item.range } : {}),
    }));
    if (diagnostics.length || !projected.graph) {
      return result(false, 'coral-dsl', 0, 0, diagnostics.length ? diagnostics : [{
        severity: 'error', code: 'coral.validate.successor.projection',
        message: 'The saved Coral source cannot be projected without loss.',
      }]);
    }
    // Semantic endpoint ports and written endpoint order belong to source,
    // not to the GraphIR 3 display schema. Check the shared source meaning
    // before reporting whether this saved document is valid.
    const checked = checkInstalledSuccessorSourceConformance028(content, { requestedLevel: 'none' });
    if (!checked.report) {
      const capability = checked.diagnostics.map((item) => ({
        severity: 'error' as const, code: item.code, message: item.message,
        ...(item.range ? { range: item.range, position: item.range.start } : {}),
      }));
      const portable = verifyPortableSuccessorSource028(content).diagnostics
        .filter((item) => !capability.some((existing) => existing.code === item.code &&
          existing.range?.start.offset === item.range?.start.offset))
        .map((item) => ({ severity: 'error' as const, code: item.code, message: item.message,
          ...(item.range ? { range: item.range, position: item.range.start } : {}),
        }));
      return result(false, 'coral-dsl', projected.graph.nodes.length, projected.graph.edges.length,
        capability.length || portable.length ? [...capability, ...portable] : [{
          severity: 'error', code: 'coral.validate.successor.display',
          message: 'The saved Coral display projection failed.',
        }]);
    }
    const sourceIssues: Diagnostic[] = checked.report.findings
      .filter((finding) => finding.category === 'integrity' || finding.category === 'capability')
      .map((finding) => ({ severity: finding.severity === 'error' ? 'error' : 'warning',
        code: finding.id, message: finding.message,
        ...(finding.subject?.kind === 'node'
          ? { subject: { kind: 'node' as const, id: finding.subject.id } } : {}),
        ...(finding.range ? { range: finding.range, position: finding.range.start } : {}),
      }));
    const capability: Diagnostic[] = checked.diagnostics.map((item) => ({
      severity: 'error', code: item.code, message: item.message,
      ...(item.range ? { range: item.range, position: item.range.start } : {}),
    }));
    const portable = verifyPortableSuccessorSource028(content).diagnostics
      .filter((item) => ![...sourceIssues, ...capability].some((existing) =>
        existing.code === item.code && existing.range?.start.offset === item.range?.start.offset))
      .map((item) => ({ severity: 'error' as const, code: item.code, message: item.message,
        ...(item.range ? { range: item.range, position: item.range.start } : {}),
      }));
    const locatedRoutePortPaths = new Set(checked.report.findings.flatMap((finding) =>
      finding.id === 'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE' && finding.range && finding.path ? [finding.path] : []));
    const core = successorCoreValidationInput029(projected.graph);
    const model = checkSuccessorModel(core.graph, locatedRoutePortPaths, core.snapshot, core.options);
    const allIssues = [...model.diagnostics, ...sourceIssues, ...capability, ...portable];
    return result(!allIssues.some((issue) => issue.severity === 'error' ||
      (strict && issue.severity === 'warning')),
    'coral-dsl', projected.graph.nodes.length, projected.graph.edges.length, allIssues);
  }

  const sourceFormat = format;
  const label = String(sourceFormat);
  const parsed = parseAs(sourceFormat, content);
  if (!parsed.success || !parsed.graph) {
    return result(false, label, 0, 0, parsed.diagnostics);
  }
  const validation = validateIR(parsed.graph, { strict });
  return result(validation.valid, label, validation.stats?.nodes ?? 0,
    validation.stats?.edges ?? 0,
    parsed.diagnostics, [...validation.errors, ...validation.warnings]);
}

function result(
  valid: boolean,
  format: string,
  nodes: number,
  edges: number,
  diagnostics: Diagnostic[] = [],
  schemaIssues: CoreValidationError[] = [],
  notes: string[] = [],
) {
  const issues = [
    ...notes,
    ...(diagnostics.length ? [formatDiagnostics(diagnostics)] : []),
    ...schemaIssues.map(formatIssue),
  ];
  const text = [
    `Validation: ${valid ? 'valid' : 'invalid'} ${format}`,
    `Summary: ${nodes} nodes, ${edges} edges`,
    ...issues,
  ].join('\n');
  return { content: [{ type: 'text' as const, text }], structuredContent: { diagnostics, schemaIssues }, ...(valid ? {} : { isError: true }) };
}
