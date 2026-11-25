/**
 * Every generate() site that copies stage diagnostics into the result keeps
 * all of them, each tagged with the attempt and output format (Slice 52 test
 * review T52-6). Real spatial stages return one diagnostic at a time, so the
 * stages are stubbed here to return two.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as spatialStages from '../../src/llm/spatial';
import { generate, tagAttemptDiagnostics } from '../../src/llm/generate';
import type { LLMConfig } from '../../src/llm/types';
import { printCoralDSL } from '../../src/printer';
import { geometry, graph } from './spatial/fixtures';

const { mockLanguageParse } = vi.hoisted(() => ({
  mockLanguageParse: vi.fn<(typeof import('@coral-viz/language/parser'))['parse']>(),
}));
vi.mock('@coral-viz/language/parser', async (original) => {
  const actual = await original<typeof import('@coral-viz/language/parser')>();
  mockLanguageParse.mockImplementation(actual.parse);
  return { ...actual, parse: mockLanguageParse };
});
vi.mock('../../src/llm/spatial', async (original) => {
  const actual = await original<typeof import('../../src/llm/spatial')>();
  return {
    ...actual,
    recognizeSpatialRequest: vi.fn(actual.recognizeSpatialRequest),
    resolveSpatialPlan: vi.fn(actual.resolveSpatialPlan),
    finalizeSpatialCandidate: vi.fn(actual.finalizeSpatialCandidate),
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch;
const config: LLMConfig = { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', apiKey: 'sk-ant-test' };
const spatial = { original: graph, geometry };
const existingDsl = printCoralDSL(graph);
const spatialOnly = 'move db above api';
const mixed = 'move db above api; rename the database';
const mixedCandidate = [
  'service "API" as api @ (100, 100)',
  'database "Renamed DB" as db @ (999, 999) pinned',
  'group "Platform" as platform @ (500, 100) {',
  '  service "Cache" as cache @ (40, 50)',
  '  service "Worker" as worker',
  '}',
  'api -> db as "api-db" via (230, 140)',
].join('\n');

const two = [
  { code: 'spatial.unsupported', message: 'first stage problem', entityIds: ['api'] },
  { code: 'spatial.outcome.unsatisfied', message: 'second stage problem', entityIds: ['db'] },
] as const;
const tagged = (items: readonly object[], attempt: number) =>
  items.map((item) => ({ ...item, attempt, format: 'coral' }));

function respond(text: string) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ content: [{ type: 'text', text }] }) });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

describe('tagAttemptDiagnostics', () => {
  it('copies every diagnostic in order with the attempt and format, leaving inputs unchanged', () => {
    const items = [
      { code: 'a', message: 'first', severity: 'error' as const },
      { code: 'b', message: 'second', entityIds: ['x'] },
      { code: 'c', message: 'third' },
    ];
    const snapshot = structuredClone(items);
    const result = tagAttemptDiagnostics(items, 2, 'mermaid');
    expect(result).toEqual(items.map((item) => ({ ...item, attempt: 2, format: 'mermaid' })));
    expect(result[0]).not.toBe(items[0]);
    expect(items).toEqual(snapshot);
    expect(tagAttemptDiagnostics([], 0, 'coral')).toEqual([]);
  });
  // Code review C52-3: a fallback code fills only a missing code.
  it('fills a missing code from fallbackCode and keeps an existing one', () => {
    const items: { code?: string; message: string; line?: number }[] = [
      { message: 'no code', line: 3 },
      { code: 'coral.x', message: 'has code' },
      { code: undefined, message: 'explicit undefined' },
    ];
    const snapshot = structuredClone(items);
    expect(tagAttemptDiagnostics(items, 1, 'coral', 'parse')).toEqual([
      { code: 'parse', message: 'no code', line: 3, attempt: 1, format: 'coral' },
      { code: 'coral.x', message: 'has code', attempt: 1, format: 'coral' },
      { code: 'parse', message: 'explicit undefined', attempt: 1, format: 'coral' },
    ]);
    expect(items).toEqual(snapshot);
  });
});

describe('generate copies every stage diagnostic with attempt tags', () => {
  it('keeps every unsupported-recognition diagnostic', async () => {
    vi.mocked(spatialStages.recognizeSpatialRequest).mockReturnValueOnce({
      classification: 'unsupported', consumedRanges: [], diagnostics: two,
    } as unknown as ReturnType<typeof spatialStages.recognizeSpatialRequest>);
    const result = await generate({ prompt: spatialOnly, existingDsl, config, spatial });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(tagged(two, 0));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps every plan-resolution diagnostic', async () => {
    vi.mocked(spatialStages.resolveSpatialPlan).mockReturnValueOnce({ success: false, diagnostics: two });
    const result = await generate({ prompt: spatialOnly, existingDsl, config, spatial });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(tagged(two, 0));
  });

  it('keeps every local spatial-only final diagnostic', async () => {
    vi.mocked(spatialStages.finalizeSpatialCandidate).mockReturnValueOnce({ success: false, diagnostics: two } as unknown as ReturnType<typeof spatialStages.finalizeSpatialCandidate>);
    const result = await generate({ prompt: spatialOnly, existingDsl, config, spatial });
    expect(result.success).toBe(false);
    expect(result.error).toBe('first stage problem');
    expect(result.diagnostics).toEqual(tagged(two, 0));
  });

  it('keeps every local spatial-only printer diagnostic on success', async () => {
    const actual = vi.mocked(spatialStages.finalizeSpatialCandidate).getMockImplementation()!;
    const printed = [
      { severity: 'warning', code: 'coral.print.first', message: 'first loss' },
      { severity: 'warning', code: 'coral.print.second', message: 'second loss' },
    ];
    vi.mocked(spatialStages.finalizeSpatialCandidate).mockImplementationOnce((...args) =>
      ({ ...actual(...args), printDiagnostics: printed }) as ReturnType<typeof spatialStages.finalizeSpatialCandidate>);
    const result = await generate({ prompt: spatialOnly, existingDsl, config, spatial });
    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual(tagged(printed, 0));
  });

  it('keeps every spatial candidate parse diagnostic', async () => {
    const actual = mockLanguageParse.getMockImplementation()!;
    const position = { line: 1, column: 0, offset: 0 };
    const parsed = [
      { severity: 'error', code: 'coral.test.first', message: 'first parse problem', position },
      { severity: 'error', code: 'coral.test.second', message: 'second parse problem', position },
    ];
    mockLanguageParse.mockImplementation((source, options) => options?.graphId === graph.id
      ? { success: false, diagnostics: parsed, errors: parsed } as unknown as ReturnType<(typeof import('@coral-viz/language/parser'))['parse']>
      : actual(source, options));
    try {
      respond(mixedCandidate);
      const result = await generate({ prompt: mixed, existingDsl, config, spatial, maxRetries: 1 });
      expect(result.success).toBe(false);
      expect(result.diagnostics?.filter((item) => item.code.startsWith('coral.test.'))).toEqual(
        tagged(parsed.map((item) => ({ ...item, ...position })), 0));
    } finally {
      mockLanguageParse.mockImplementation(actual);
    }
  });

  it('keeps every mixed candidate final diagnostic', async () => {
    vi.mocked(spatialStages.finalizeSpatialCandidate).mockReturnValueOnce({ success: false, diagnostics: two } as unknown as ReturnType<typeof spatialStages.finalizeSpatialCandidate>);
    respond(mixedCandidate);
    const result = await generate({ prompt: mixed, existingDsl, config, spatial, maxRetries: 1 });
    expect(result.success).toBe(false);
    expect(result.diagnostics?.filter((item) => item.code.startsWith('spatial.'))).toEqual(tagged(two, 0));
  });

  it('keeps every mixed candidate printer diagnostic on success', async () => {
    const actual = vi.mocked(spatialStages.finalizeSpatialCandidate).getMockImplementation()!;
    const printed = [
      { severity: 'warning', code: 'coral.print.first', message: 'first loss' },
      { severity: 'warning', code: 'coral.print.second', message: 'second loss' },
    ];
    vi.mocked(spatialStages.finalizeSpatialCandidate).mockImplementationOnce((...args) =>
      ({ ...actual(...args), printDiagnostics: printed }) as ReturnType<typeof spatialStages.finalizeSpatialCandidate>);
    respond(mixedCandidate);
    const result = await generate({ prompt: mixed, existingDsl, config, spatial });
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.diagnostics?.filter((item) => item.code.startsWith('coral.print.'))).toEqual(tagged(printed, 0));
  });
});
