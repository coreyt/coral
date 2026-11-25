import { describe, expect, it, vi } from 'vitest';
import { resolveSpatialLayout } from '@coral-viz/render/layout';
import { readGraph, handleLayout } from '../src/tools/layout.js';
import { handleRender } from '../src/tools/render.js';
import { handleExplain } from '../src/tools/explain.js';
import { handleValidate } from '../src/tools/validate.js';
import { GraphInputFailure, formatDiagnostics, inputFailureResponse } from '../src/tools/diagnostics.js';
import type { Diagnostic } from '@coral-viz/language';

vi.mock('@coral-viz/render/layout', async (original) => ({ ...await original<object>(), resolveSpatialLayout: vi.fn() }));

describe('MCP diagnostic propagation', () => {
  it.each([
    ['no-break space', '\u00a0'],
    ['em space', '\u2003'],
    ['word joiner', '\u2060'],
    ['supplementary variation selector', '\u{E0100}'],
  ])('returns the exact %s spacing diagnostic from saved Coral source', async (_name, separator) => {
    const content = '@diagram architecture\nfirst service\n' +
      `skipped${separator}service\nlast service\n`;
    const response = await handleValidate({ content });
    const diagnostic = response.structuredContent.diagnostics.find(
      (item) => item.code === 'coral.syntax.spacing.invalid',
    );

    expect(response.isError).toBe(true);
    expect(response.structuredContent.diagnostics.map((item) => item.code))
      .not.toContain('header.diagram.required');
    expect(diagnostic?.range?.start.offset).toBe(content.indexOf(separator));
    expect(diagnostic?.range?.end.offset).toBe(content.indexOf(separator) + separator.length);
    expect(content.slice(diagnostic?.range?.start.offset, diagnostic?.range?.end.offset)).toBe(separator);
    expect(diagnostic?.position).toMatchObject({ line: 3, column: 7 });
  });

  it('refuses a malformed sequence continuation without rendering its rejected branch', async () => {
    const content = '@diagram uml-sequence\na participant\nb participant\n' +
      'alt "yes" {\n  first = a -> b\n}\u00a0else "no" {\n  hidden = b -> a\n}\n' +
      'after = a -> b\n';
    const validated = await handleValidate({ content });
    const spacing = validated.structuredContent.diagnostics.find(
      (item) => item.code === 'coral.syntax.spacing.invalid');
    expect(validated.isError).toBe(true);
    expect(content.slice(spacing?.range?.start.offset, spacing?.range?.end.offset)).toBe('\u00a0');
    const rendered = await handleRender({ content });
    expect(rendered.isError).toBe(true);
    expect(rendered.structuredContent.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.syntax.spacing.invalid',
    }));
    expect(resolveSpatialLayout).not.toHaveBeenCalled();
  });

  it('locates a literal Unicode line separator in quoted source and refuses projection', async () => {
    const content = '@diagram architecture\napi service as "left\u2028right"\n';
    const validated = await handleValidate({ content });
    const finding = validated.structuredContent.diagnostics.find(
      (item) => item.code === 'coral.syntax.string.control');
    expect(validated.isError).toBe(true);
    expect(content.slice(finding?.range?.start.offset, finding?.range?.end.offset)).toBe('\u2028');
    expect(await handleRender({ content })).toMatchObject({ isError: true,
      structuredContent: { diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'coral.syntax.string.control' }),
      ]) } });
    expect(resolveSpatialLayout).not.toHaveBeenCalled();
  });

  it('retains typed reader failures and never lays out a partial parse', async () => {
    const content = '@diagram architecture\na service as "A"\n!!!invalid!!!';
    expect(() => readGraph(content)).toThrow(GraphInputFailure);
    for (const handler of [handleLayout, handleRender, handleExplain]) {
      expect(await handler({ content })).toMatchObject({ isError: true,
        structuredContent: { diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: 'coral.syntax.token.invalid' }),
        ]) } });
    }
    expect(resolveSpatialLayout).not.toHaveBeenCalled();
  });

  it('formats every severity and related location while leaving print losses unpositioned', () => {
    const diagnostics: Diagnostic[] = [
      { code: 'test.error', severity: 'error', message: 'error', position: { line: 2, column: 3, offset: 8 },
        related: [{ message: 'other spelling', position: { line: 4, column: 0, offset: 15 } }], source: 'source', hint: 'hint', subject: { kind: 'node', id: 'a' } },
      { code: 'test.warning', severity: 'warning', message: 'warning' },
      { code: 'test.info', severity: 'info', message: 'info' },
    ];
    const text = formatDiagnostics(diagnostics);
    expect(text).toContain('column 4');
    expect(text).toContain('Related (line 4, column 1): other spelling');
    expect(text).toContain('warning test.warning: warning');
    expect(text).toContain('info test.info: info');
    // Slice 52 test review T52-8: a hint is its own indented line.
    expect(text.split('\n')).toContain('  Hint: hint');
    expect(text).not.toContain('line 0');
    expect(inputFailureResponse(new GraphInputFailure(diagnostics)).structuredContent.diagnostics).toEqual(diagnostics);
  });

  it('returns every GraphIR schema and graph issue as structured schemaIssues (T52-8)', async () => {
    const content = JSON.stringify({ version: '3.0.0', id: 'g', nodes: [{ id: 'a', type: 'service', position: { x: 'left', y: 0 } }], edges: [], bogus: true });
    const response = await handleValidate({ content });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toEqual({
      diagnostics: [],
      schemaIssues: [
        { code: 'SCHEMA_VIOLATION', path: '/bogus', message: 'must NOT have additional properties', severity: 'error' },
        { code: 'SCHEMA_VIOLATION', path: '/nodes/0/position/x', message: 'must be number', severity: 'error' },
        { code: 'ORPHAN_NODE', path: '/nodes/0', message: 'Node "a" has no connections', severity: 'warning' },
      ],
    });
    expect(response.content[0].text).toContain('✗ SCHEMA_VIOLATION: must be number');
  });
});
