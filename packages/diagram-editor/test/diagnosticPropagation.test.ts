import { describe, expect, it } from 'vitest';
import { editorDiagnostic, parseCoralDSL } from '../src/parsers';
import type { Diagnostic } from '@coral-viz/language';

describe('complete editor diagnostic channel', () => {
  it.each(['error', 'warning', 'info'] as const)('retains %s diagnostic metadata when adapting a reader diagnostic', (severity) => {
    const position = { line: 1, column: 0, offset: 0 };
    const diagnostic = {
      severity, code: `test.${severity}`, message: severity, position,
      source: 'source', hint: 'hint', subject: { kind: 'node', id: 'a' },
      related: [{ message: 'other', position: { line: 2, column: 1, offset: 8 } }],
    } as unknown as Diagnostic;
    expect(editorDiagnostic(diagnostic)).toMatchObject({ ...diagnostic, ...position });
  });

  it('keeps current-source warnings in diagnostics while errors remains error-only', () => {
    const warningSource = '@diagram bpmn\narea group [symbol: "bpmn-pool"] {\n  work task\n}\n';
    const warned = parseCoralDSL(warningSource);
    expect(warned.errors).toEqual([]);
    expect(warned.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning', code: 'render.capability.bpmn-scope',
    }));

    const errorSource = '@diagram architecture\na service\nb service\na -> b [flow, type: calls]';
    const errored = parseCoralDSL(errorSource);
    const blocking = errored.diagnostics?.find((item) => item.code === 'coral.syntax.type.duplicate');
    expect(blocking).toMatchObject({ severity: 'error', line: 4 });
    expect(errorSource.slice(blocking!.range!.start.offset, blocking!.range!.end.offset)).toBe('type: calls');
    expect(errored.errors).toEqual(errored.diagnostics?.filter((item) => item.severity === 'error'));
  });
});
