/** Explicit, read-only U2 check; ordinary validation and save do not claim conformance. */
import type { GraphIR } from '@graph-ir/core';
import { validateIR } from '@graph-ir/core';
import { detectFormat, type Diagnostic } from '@coral-viz/language';
import {
  checkGraphConformance028, checkInstalledSuccessorSourceConformance028,
  type ConformanceLevel,
  type ConformanceReport,
  type NotificationLevel,
} from '@coral-viz/render';
import { z } from 'zod';
import { installedSourceDiagnostics028 } from './coralSource028.js';

export const conformanceTool = {
  name: 'coral_check_conformance',
  description: 'Run an explicit, read-only 0.2.8 profile-rule check. Returns full findings and unverified obligations; partial rule cards never certify conformance. A 0.2.9 document in which a node selects a local. user symbol is reported as not checked.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: { type: 'string', description: 'Coral source or GraphIR 3 JSON to inspect' },
      level: { type: 'string', enum: ['none', 'typical', 'strict'],
        description: 'Optional one-off level. Coral source uses its saved level when omitted; GraphIR 3 defaults to typical.' },
      notificationLevel: { type: 'string', enum: ['error', 'warning', 'info', 'debug'],
        description: 'Notice threshold, separate from full findings; default error' },
    },
    required: ['content'],
  },
};

const Args = z.object({
  content: z.string(),
  level: z.enum(['none', 'typical', 'strict']).optional(),
  notificationLevel: z.enum(['error', 'warning', 'info', 'debug']).default('error'),
}).strict();

type InputDiagnostic = Diagnostic & { path?: string };

function inputFailure(diagnostics: readonly InputDiagnostic[]) {
  return {
    content: [{ type: 'text' as const,
      text: `Could not check Coral conformance:\n${diagnostics.map((item) => `${item.code}: ${item.message}`).join('\n')}` }],
    structuredContent: { diagnostics },
    isError: true as const,
  };
}

function readGraphIR(content: string): GraphIR | ReturnType<typeof inputFailure> {
  let value: unknown;
  try { value = JSON.parse(content); }
  catch (error) { return inputFailure([{ severity: 'error', code: 'INVALID_JSON',
    message: error instanceof Error ? error.message : String(error) }]); }
  const schema = validateIR(value, { mode: 'schema' });
  if (!schema.valid) return inputFailure(schema.errors.map((item) => ({
    severity: 'error', code: item.code, message: item.message, path: item.path,
  })));
  return value as GraphIR;
}

function conformanceText(report: ConformanceReport, diagnostics: readonly InputDiagnostic[] = []): string {
  return [
    `Conformance check: ${report.claimStatus}`,
    `Evaluated level: ${report.evaluatedLevel}`,
    ...(report.ruleset?.scope === 'coral-bounded-profile'
      ? ['Coral bounded profile; full external-standard conformance is not claimed.'] : []),
    `Findings: ${report.findings.length}; notices: ${report.notices.length}; unverified obligations: ${report.unverifiedObligations.length}`,
    ...report.notices.map((finding) => `${finding.severity.toUpperCase()} ${finding.id}: ${finding.message}`),
    ...report.unverifiedObligations.map((obligation) => `UNVERIFIED ${obligation.id}: ${obligation.message}`),
    ...diagnostics.map((diagnostic) => `CAPABILITY ${diagnostic.code}: ${diagnostic.message}`),
  ].join('\n');
}

export async function handleConformanceCheck(args: unknown) {
  const { content, level, notificationLevel } = Args.parse(args);
  const { format } = detectFormat(content);
  let report: ConformanceReport;
  let sourceDiagnostics: InputDiagnostic[] = [];
  if (format === 'coral') {
    const checked = checkInstalledSuccessorSourceConformance028(content, {
      ...(level ? { requestedLevel: level as ConformanceLevel } : {}),
      notificationLevel: notificationLevel as NotificationLevel,
    });
    if (!checked.report) return inputFailure(checked.diagnostics.length
      ? checked.diagnostics.map((item) => ({ severity: 'error' as const,
        code: item.code, message: item.message,
        ...(item.range ? { position: item.range.start, range: item.range } : {}) }))
      : installedSourceDiagnostics028(checked.document));
    // Author decision 2026-10-30: a 0.2.9 document that selects a user symbol
    // is not conformance-checked; say so rather than return an empty pass.
    if (checked.notChecked029) {
      const diagnostics = checked.diagnostics.map((item) => ({ severity: 'error' as const,
        code: item.code, message: item.message,
        ...(item.range ? { position: item.range.start, range: item.range } : {}) }));
      return { content: [{ type: 'text' as const, text: [`Conformance check: ${checked.notChecked029.message}`,
        ...diagnostics.map((diagnostic) => `CAPABILITY ${diagnostic.code}: ${diagnostic.message}`)].join('\n') }],
      structuredContent: { notChecked: checked.notChecked029, source: content,
        ...(diagnostics.length ? { diagnostics } : {}) },
      ...(diagnostics.length ? { isError: true as const } : {}) };
    }
    report = checked.report;
    sourceDiagnostics = checked.diagnostics.map((item) => ({ severity: 'error',
      code: item.code, message: item.message,
      ...(item.range ? { position: item.range.start, range: item.range } : {}) }));
  } else if (format === 'graphir-json') {
    const graph = readGraphIR(content);
    if ('structuredContent' in graph) return graph;
    report = checkGraphConformance028(graph, {
      requestedLevel: (level ?? 'typical') as ConformanceLevel,
      notificationLevel: notificationLevel as NotificationLevel,
      operation: 'check',
    });
  } else return inputFailure([{ severity: 'error', code: 'CORAL.CONFORMANCE.INPUT.UNSUPPORTED',
    message: 'Pass Coral source or GraphIR 3 JSON; other formats require an explicit import first.' }]);
  return { content: [{ type: 'text' as const, text: conformanceText(report, sourceDiagnostics) }],
    structuredContent: { conformance: report, ...(format === 'coral' ? { source: content } : {}),
      ...(sourceDiagnostics.length ? { diagnostics: sourceDiagnostics } : {}) },
    ...(report.findings.some((finding) => finding.severity === 'error') || sourceDiagnostics.length
      ? { isError: true as const } : {}) };
}
