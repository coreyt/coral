/**
 * Generate Orchestrator Tests
 *
 * Tests for the generate() function with retry and drift detection.
 * Requirement: Issue #46 (LLM-powered diagram generation)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generate } from '../../src/llm/generate';
import type { LLMConfig } from '../../src/llm/types';
import { geometry, graph } from './spatial/fixtures';
import { printCoralDSL } from '../../src/printer';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const config: LLMConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  apiKey: 'sk-ant-test',
};

/** Helper: build a mock Anthropic response */
function anthropicResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      content: [{ type: 'text', text }],
    }),
  };
}

function providerResponse(provider: LLMConfig['provider'], text: string) {
  if (provider === 'anthropic') return anthropicResponse(text);
  if (provider === 'google') return {
    ok: true, status: 200,
    json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
  return {
    ok: true, status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content: text } }] }),
  };
}

/** Helper: build a mock error response */
function errorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message } }),
    text: () => Promise.resolve(message),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

// ============================================================================
// Successful Generation
// ============================================================================

describe('generate - success cases', () => {
  it('does not turn a disabled Chen source request into another profile', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('@diagram flowchart\na process as "A"'));
    const result = await generate({
      prompt: 'Add an attribute', config, notationId: 'erd',
      existingDsl: '@diagram erd\ncustomer entity as "Customer"',
    });
    expect(result).toMatchObject({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'header.diagram.disabled' })],
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not silently change the saved profile during an AI edit', async () => {
    const source = '@diagram architecture\napi service as "API"';
    const result = await generate({ prompt: 'Add a store', config,
      notationId: 'flowchart', existingDsl: source });
    expect(result).toMatchObject({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'header.diagram.mismatch' })],
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a model response that changes the saved diagram type', async () => {
    const source = '@diagram architecture\napi service as "API"';
    mockFetch.mockResolvedValueOnce(anthropicResponse(
      '@diagram flowchart\napi process as "API"'));

    const result = await generate({ prompt: 'Rename the API', config,
      existingDsl: source });

    expect(result).toMatchObject({ success: false, retries: 0,
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'header.diagram.mismatch', attempt: 0, format: 'coral',
      })]) });
    expect(result.dsl).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a generated candidate outside the requested diagram type', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('@diagram architecture\napi service'));
    const result = await generate({ prompt: 'Create a flow', config, notationId: 'flowchart' });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.mismatch', attempt: 0, format: 'coral',
    }));
    expect(result.dsl).toBeUndefined();
  });

  it('rejects a model response that changes the saved conformance level', async () => {
    const source = '@diagram architecture\n@conformanceLevel strict\napi service';
    mockFetch.mockResolvedValueOnce(anthropicResponse(
      '@diagram architecture\n@conformanceLevel none\napi service'));

    const result = await generate({ prompt: 'Rename the API', config, existingDsl: source });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.conformance.mismatch', attempt: 0, format: 'coral',
    }));
    expect(result.dsl).toBeUndefined();
  });

  it('retains explicit saved catalog and conformance pins in an AI candidate', async () => {
    const source = '@diagram architecture\n@catalogVersion "1.0.0"\n' +
      '@conformanceLevel typical\napi service';
    mockFetch.mockResolvedValueOnce(anthropicResponse('@diagram architecture\napi service'));

    const result = await generate({ prompt: 'Rename the API', config, existingDsl: source });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.edition.mismatch', attempt: 0, format: 'coral',
    }));
    expect(result.dsl).toBeUndefined();
  });

  it('retains an explicit typical conformance declaration even when its value is the default', async () => {
    const source = '@diagram architecture\n@conformanceLevel typical\napi service';
    mockFetch.mockResolvedValueOnce(anthropicResponse('@diagram architecture\napi service'));

    const result = await generate({ prompt: 'Rename the API', config, existingDsl: source });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.conformance.mismatch', attempt: 0, format: 'coral',
    }));
    expect(result.dsl).toBeUndefined();
  });

  it('accepts saved 0.2.8 Coral from the instructed profile without changing its source', async () => {
    const source = '@diagram flowchart\nstart terminal as "Start"\nreview process as "Review"\nstart -> review';
    mockFetch.mockResolvedValueOnce(anthropicResponse(source));

    const result = await generate({ prompt: 'Create a review flow', config, notationId: 'flowchart' });

    expect(result.success).toBe(true);
    expect(result.dsl).toBe(source);
    expect(JSON.stringify(mockFetch.mock.calls[0]?.[1]?.body)).toContain('@diagram flowchart');
  });

  it('retains every candidate parser diagnostic with attempt metadata', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('@diagram architecture\na service\ninvalid first!\ninvalid second!'));
    const result = await generate({ prompt: 'test', config });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.syntax.token.invalid', position: expect.objectContaining({ line: 3 }), attempt: 0, format: 'coral' }),
      expect.objectContaining({ code: 'coral.syntax.token.invalid', position: expect.objectContaining({ line: 4 }), attempt: 0, format: 'coral' }),
    ]));
  });
  it('generates DSL from a prompt', async () => {
    const dsl = '@diagram architecture\napi service as "API"\ndb database as "DB"\napi -> db';
    mockFetch.mockResolvedValueOnce(anthropicResponse(dsl));

    const result = await generate({
      prompt: 'Create an API with database',
      config,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.dsl).toBe(dsl);
    expect(result.retries).toBe(0);
    expect(result.driftDetected).toBe(false);
  });

  it('strips code fences from response', async () => {
    const raw = '```coral\n@diagram architecture\na service as "A"\n```';
    mockFetch.mockResolvedValueOnce(anthropicResponse(raw));

    const result = await generate({
      prompt: 'Create a service',
      config,
    });

    expect(result.success).toBe(true);
    expect(result.dsl).toBe('@diagram architecture\na service as "A"');
  });

  it('calls fetch with correct provider request', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('service "A"'));

    await generate({ prompt: 'test', config });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('anthropic.com');
    expect(options.method).toBe('POST');
    expect(options.headers['x-api-key']).toBe('sk-ant-test');
  });
});

// ============================================================================
// Explicit retry after candidate rejection
// ============================================================================

describe('generate - explicit retry after candidate rejection', () => {
  it('stops after invalid DSL and returns an explicit Retry action', async () => {
    const invalidDsl = 'this is garbage not valid DSL content';
    mockFetch.mockResolvedValueOnce(anthropicResponse(invalidDsl));

    const result = await generate({
      prompt: 'Create something',
      config,
    });

    expect(result).toMatchObject({
      success: false,
      retries: 0,
      action: { kind: 'retry-candidate', prompt: 'Create something' },
    });
    expect(result.dsl).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not spend the transport budget on candidate repair', async () => {
    const invalid = 'still garbage not valid at all here';
    mockFetch.mockResolvedValueOnce(anthropicResponse(invalid));

    const result = await generate({
      prompt: 'Create something',
      config,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Choose Retry');
    expect(result.retries).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects identically when the transport replay budget is smaller', async () => {
    const invalid = 'still garbage not valid at all here';
    mockFetch.mockResolvedValueOnce(anthropicResponse(invalid));

    const result = await generate({ prompt: 'test', config, maxRetries: 1 });

    expect(result.success).toBe(false);
    expect(result.retries).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry when first attempt is valid', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('@diagram architecture\na service as "A"'));

    const result = await generate({ prompt: 'test', config });

    expect(result.success).toBe(true);
    expect(result.retries).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects notation-invalid output without applying it or calling again', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('@diagram flowchart\na function as "A"'));

    const result = await generate({ prompt: 'make a flow', config, notationId: 'flowchart' });

    expect(result).toMatchObject({
      success: false, retries: 0,
      action: { kind: 'retry-candidate', prompt: 'make a flow' },
      diagnostics: [expect.objectContaining({ code: 'notation.node.unsupported-type' })],
    });
    expect(result.dsl).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a dangling-reference candidate before application or retry', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse([
      '@diagram architecture',
      'present service as "Present"',
      'present -> absent',
    ].join('\n')));

    const result = await generate({ prompt: 'connect the service', config });

    expect(result).toMatchObject({
      success: false,
      retries: 0,
      action: { kind: 'retry-candidate', prompt: 'connect the service' },
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'coral.reference.target.unresolved',
        message: expect.stringContaining('Unresolved target reference: absent'),
        position: expect.objectContaining({ line: 3 }),
      })]),
    });
    expect(result.dsl).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps semantic-only relationship advice internal without retrying', async () => {
    const candidate = [
      '@diagram aiml',
      'dataset dataset as "Data"',
      'guardrail guardrail as "Guard"',
      'unusual = dataset -> guardrail',
    ].join('\n');
    mockFetch.mockResolvedValueOnce(anthropicResponse(candidate));

    const result = await generate({ prompt: 'connect the data', config, notationId: 'aiml' });

    expect(result).toMatchObject({ success: true, dsl: candidate, retries: 0 });
    expect(result.diagnostics).toBeUndefined();
    expect(result.lintWarnings).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps transport replay count when the replay returns an invalid candidate', async () => {
    mockFetch
      .mockResolvedValueOnce({ ...errorResponse(503, 'private'), headers: new Headers() })
      .mockResolvedValueOnce(anthropicResponse('invalid candidate'));

    const result = await generate({
      prompt: 'make it', config, maxRetries: 2,
      retryRuntime: { schedule: async () => undefined },
    });

    expect(result).toMatchObject({
      success: false, retries: 1,
      action: { kind: 'retry-candidate', prompt: 'make it' },
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not progress candidate-repair strategies', async () => {
    mockFetch
      .mockResolvedValueOnce(anthropicResponse('invalid one'));

    const result = await generate({
      prompt: 'make a complex diagram', config, maxRetries: 3,
      retryRuntime: { schedule: async () => undefined },
    });
    expect(result).toMatchObject({ success: false, retries: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('replays an identical request after a typed transient failure', async () => {
    mockFetch
      .mockResolvedValueOnce({ ...errorResponse(503, 'private'), headers: new Headers() })
      .mockResolvedValueOnce(anthropicResponse('@diagram architecture\ndone service as "Done"'));

    const result = await generate({
      prompt: 'make it', config, maxRetries: 2,
      history: [{ role: 'user', content: 'prior turn' }],
      retryRuntime: { schedule: async () => undefined },
    });

    expect(result).toMatchObject({ success: true, retries: 1 });
    expect(mockFetch.mock.calls[1][1].body).toBe(mockFetch.mock.calls[0][1].body);
  });
});

// ============================================================================
// Drift Detection (adjust mode)
// ============================================================================

describe('generate - drift detection', () => {
  it('detects drift when >50% of original nodes are lost', async () => {
    // Original has 4 nodes, new output keeps only 1 => 75% loss
    const existingDsl = [
      '@diagram architecture',
      'a service as "A"',
      'b service as "B"',
      'c service as "C"',
      'd service as "D"',
      'a -> b',
    ].join('\n');

    const newDsl = '@diagram architecture\nx service as "X"\ny service as "Y"'; // completely different

    mockFetch
      .mockResolvedValueOnce(anthropicResponse(newDsl))
      .mockResolvedValueOnce(anthropicResponse(newDsl)); // retry also drifts

    const result = await generate({
      prompt: 'Add a logger',
      existingDsl,
      config,
    });

    expect(result.success).toBe(false);
    expect(result.driftDetected).toBe(true);
  });

  it('allows drift when generating fresh (no existing DSL)', async () => {
    mockFetch.mockResolvedValueOnce(
      anthropicResponse('@diagram architecture\nx service as "X"\ny service as "Y"')
    );

    const result = await generate({
      prompt: 'Create something new',
      config,
    });

    expect(result.success).toBe(true);
    expect(result.driftDetected).toBe(false);
  });

  it('passes when existing nodes are preserved', async () => {
    const existingDsl = '@diagram architecture\na service as "A"\nb service as "B"\na -> b';
    const newDsl = '@diagram architecture\na service as "A"\nb service as "B"\nc service as "C"\na -> b\nb -> c';

    mockFetch.mockResolvedValueOnce(anthropicResponse(newDsl));

    const result = await generate({
      prompt: 'Add service C',
      existingDsl,
      config,
    });

    expect(result.success).toBe(true);
    expect(result.driftDetected).toBe(false);
  });

  it('stops on drift and requires an explicit retry', async () => {
    const existingDsl = '@diagram architecture\na service as "A"\nb service as "B"\nc service as "C"\nd service as "D"';
    const driftedDsl = '@diagram architecture\nx service as "X"'; // 100% loss

    mockFetch.mockResolvedValueOnce(anthropicResponse(driftedDsl));

    const result = await generate({
      prompt: 'Tweak it',
      existingDsl,
      config,
    });

    expect(result.success).toBe(false);
    expect(result.driftDetected).toBe(true);
    expect(result.action?.kind).toBe('retry-candidate');
    expect(result.retries).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('generate - error handling', () => {
  it('handles HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401, 'Invalid API key'));

    const result = await generate({
      prompt: 'test',
      config,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network error'));

    const result = await generate({ prompt: 'test', config, maxRetries: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('network');
    expect(result.error).not.toContain('Network error');
  });

  it('does not auto-retry an untyped provider exception', async () => {
    mockFetch.mockRejectedValueOnce(new Error('unexpected adapter failure'));

    const result = await generate({ prompt: 'test', config, maxRetries: 2 });

    expect(result).toMatchObject({
      success: false, retries: 0,
      failure: { category: 'response', retryable: false },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles empty response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ content: [] }),
    });

    const result = await generate({
      prompt: 'test',
      config,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('retries a typed transient provider failure with injected backoff', async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    mockFetch
      .mockResolvedValueOnce({
        ...errorResponse(503, 'secret provider detail'),
        headers: new Headers({ 'Retry-After': '2' }),
      })
      .mockResolvedValueOnce(anthropicResponse('@diagram architecture\nrecovered service as "Recovered"'));

    const result = await generate({
      prompt: 'recover', config, maxRetries: 1,
      retryRuntime: { random: () => 0.5, schedule, wallNow: () => 0, now: () => 0 },
    });

    expect(result).toMatchObject({ success: true, retries: 1 });
    expect(schedule).toHaveBeenCalledWith(2000, undefined);
    expect(JSON.stringify(result)).not.toContain('secret provider detail');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns a machine-readable aborted failure without retrying', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await generate({ prompt: 'stop', config, signal: controller.signal });

    expect(result.failure).toMatchObject({ category: 'aborted', retryable: false });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'provider.aborted' }));
    expect(result.retries).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('gives abort precedence while consuming a successful response body', async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200, headers: new Headers(),
      json: async () => {
        controller.abort();
        throw new DOMException('private abort reason', 'AbortError');
      },
    });
    const result = await generate({ prompt: 'x', config, signal: controller.signal });
    expect(result.failure).toMatchObject({ category: 'aborted', retryable: false });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'provider.aborted' }));
    expect(JSON.stringify(result)).not.toContain('private abort reason');
  });

  it.each([
    ['timeout', new DOMException('private timeout reason', 'TimeoutError'), 'timeout'],
    ['network', new TypeError('private network reason'), 'network'],
  ] as const)('retries a %s failure while consuming a successful response body', async (_name, error, category) => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), json: async () => { throw error; } })
      .mockResolvedValueOnce(anthropicResponse('@diagram architecture\nrecovered service as "Recovered"'));

    const result = await generate({ prompt: 'x', config, maxRetries: 1,
      retryRuntime: { schedule: async () => undefined } });

    expect(result).toMatchObject({ success: true, retries: 1 });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'provider', message: expect.stringContaining(category),
    }));
    expect(JSON.stringify(result)).not.toContain(`private ${category} reason`);
  });

  it('uses the AbortError name fallback while consuming a non-success response body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 503, headers: new Headers(),
      json: async () => { throw new DOMException('private abort reason', 'AbortError'); },
    });

    const result = await generate({ prompt: 'x', config });

    expect(result.failure).toMatchObject({ category: 'aborted', retryable: false });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private abort reason');
  });

  it('emits ordered redacted telemetry and isolates a throwing sink', async () => {
    const events: unknown[] = [];
    mockFetch
      .mockResolvedValueOnce({
        ...errorResponse(503, 'secret-body-value'), headers: new Headers({ 'Retry-After': '0' }),
      })
      .mockResolvedValueOnce(anthropicResponse('@diagram architecture\nrecovered service as "Recovered"'));

    const result = await generate({
      prompt: 'secret-prompt-value', config, maxRetries: 1,
      retryRuntime: { now: () => 10, schedule: async () => undefined, random: () => 0 },
      telemetry: (event) => { events.push(event); if (event.kind === 'failure') throw new Error('sink'); },
    });

    expect(result).toMatchObject({ success: true, retries: 1 });
    expect(events.map((event: any) => event.kind)).toEqual([
      'start', 'attempt', 'failure', 'delay', 'attempt', 'success',
    ]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('secret-prompt-value');
    expect(serialized).not.toContain('secret-body-value');
    expect(serialized).not.toContain(config.apiKey);
  });

  it('reports terminal candidate rejection without strategy progression', async () => {
    const events: any[] = [];
    mockFetch.mockResolvedValueOnce(anthropicResponse('invalid one'));

    await generate({
      prompt: 'x', config, maxRetries: 1, telemetry: (event) => events.push(event),
      retryRuntime: { schedule: async () => undefined },
    });

    expect(events.at(-1)).toMatchObject({ kind: 'rejection', attempt: 0, strategy: 'initial' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not schedule candidate pacing', async () => {
    const events: any[] = [];
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce(anthropicResponse('invalid'));

    const schedule = vi.fn(async () => { controller.abort(); throw new Error('stop'); });
    const result = await generate({
      prompt: 'x', config, maxRetries: 1, signal: controller.signal,
      telemetry: (event) => events.push(event),
      retryRuntime: { schedule },
    });

    expect(result.action?.kind).toBe('retry-candidate');
    expect(schedule).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ kind: 'rejection', strategy: 'initial' });
  });

  it('clamps jitter input and caps exponential provider backoff', async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    for (let index = 0; index < 7; index++) {
      mockFetch.mockResolvedValueOnce({ ...errorResponse(503, 'private'), headers: new Headers() });
    }

    await generate({ prompt: 'x', config, maxRetries: 6,
      retryRuntime: { schedule, random: () => 2 } });

    expect(schedule.mock.calls.map(([delay]) => delay)).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
  });

  it('interprets an HTTP-date Retry-After when the response is classified', async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    const wallNow = vi.fn().mockReturnValue(5_000);
    mockFetch
      .mockResolvedValueOnce({
        ...errorResponse(503, 'private'),
        headers: new Headers({ 'Retry-After': new Date(10_000).toUTCString() }),
      })
      .mockResolvedValueOnce(anthropicResponse('@diagram architecture\na service as "A"'));

    await generate({ prompt: 'x', config, maxRetries: 1,
      retryRuntime: { schedule, random: () => 0, wallNow } });

    expect(wallNow).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(5_000, undefined);
  });

  it('emits terminal telemetry for a non-retryable provider failure', async () => {
    const events: any[] = [];
    mockFetch.mockResolvedValueOnce({
      ...errorResponse(401, 'private'),
      headers: new Headers(),
    });
    await generate({ prompt: 'x', config, telemetry: (event) => events.push(event) });
    expect(events.at(-1)).toMatchObject({ kind: 'terminal', category: 'provider', strategy: 'initial' });
  });

  it('accepts exactly 60 seconds of Retry-After and rejects a longer server delay', async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    mockFetch
      .mockResolvedValueOnce({ ...errorResponse(429, 'private'), headers: new Headers({ 'Retry-After': '60' }) })
      .mockResolvedValueOnce(anthropicResponse('@diagram architecture\na service as "A"'));
    const accepted = await generate({ prompt: 'x', config, maxRetries: 1,
      retryRuntime: { schedule, random: () => 0 } });
    expect(accepted.success).toBe(true);
    expect(schedule).toHaveBeenCalledWith(60_000, undefined);

    mockFetch.mockReset();
    schedule.mockClear();
    mockFetch.mockResolvedValueOnce({
      ...errorResponse(429, 'private'), headers: new Headers({ 'Retry-After': '61' }),
    });
    const rejected = await generate({ prompt: 'x', config, maxRetries: 1,
      retryRuntime: { schedule, random: () => 0 } });
    expect(rejected.failure).toMatchObject({ category: 'server-delay', retryable: false, retryAfterMs: 61_000 });
    expect(schedule).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('normalizes non-finite random and aborts during backoff without starting a retry', async () => {
    const controller = new AbortController();
    const schedule = vi.fn(async (_delay: number, signal?: AbortSignal) => {
      controller.abort();
      expect(signal?.aborted).toBe(true);
      throw new DOMException('stop', 'AbortError');
    });
    mockFetch.mockResolvedValueOnce({ ...errorResponse(503, 'private'), headers: new Headers() });
    const result = await generate({ prompt: 'x', config, maxRetries: 1, signal: controller.signal,
      retryRuntime: { schedule, random: () => Number.NaN } });
    expect(schedule).toHaveBeenCalledWith(0, controller.signal);
    expect(result.failure).toMatchObject({ category: 'aborted', retryable: false });
    expect(result.retries).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [Number.NaN, 3], [Number.POSITIVE_INFINITY, 3], [-1, 1], [1.9, 2],
  ])('normalizes maxRetries %s to %s total transport calls on exhaustion', async (maxRetries, calls) => {
    for (let index = 0; index < calls; index++) {
      mockFetch.mockResolvedValueOnce({ ...errorResponse(503, 'private'), headers: new Headers() });
    }
    const result = await generate({ prompt: 'x', config, maxRetries,
      retryRuntime: { schedule: async () => undefined } });
    expect(result.success).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(calls);
    expect(result.retries).toBe(calls - 1);
  });
});

// ============================================================================
// Help Intent (Issue #48)
// ============================================================================

describe('generate - help intent', () => {
  it('returns explanation without DSL', async () => {
    const explanation = 'The edge is red because the source node has exceeded its maximum outgoing connections.';
    mockFetch.mockResolvedValueOnce(anthropicResponse(explanation));

    const result = await generate({
      prompt: 'why is this edge red?',
      config,
      intent: 'help',
      existingDsl: 'service "A"',
      diagnostics: 'WARNING: max connections',
    });

    expect(result.success).toBe(true);
    expect(result.explanation).toBe(explanation);
    expect(result.dsl).toBeUndefined();
    expect(result.intent).toBe('help');
  });

  it('handles API error for help intent', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, 'Server error'));

    const result = await generate({
      prompt: 'explain this',
      config,
      intent: 'help',
      maxRetries: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
    expect(result.intent).toBe('help');
  });

  it('retries transport for help with the identical request', async () => {
    mockFetch
      .mockResolvedValueOnce({ ...errorResponse(500, 'private'), headers: new Headers() })
      .mockResolvedValueOnce(anthropicResponse('Recovered explanation'));

    const result = await generate({
      prompt: 'explain', config, intent: 'help', maxRetries: 1,
      history: [{ role: 'user', content: 'prior' }],
      retryRuntime: { schedule: async () => undefined },
    });

    expect(result).toMatchObject({ success: true, retries: 1, explanation: 'Recovered explanation' });
    expect(mockFetch.mock.calls[1][1].body).toBe(mockFetch.mock.calls[0][1].body);
  });
});

// ============================================================================
// Fix Intent (Issue #48)
// ============================================================================

describe('generate - fix intent', () => {
  it('rejects a Fix candidate that changes the saved diagram type', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse(
      'Fixed:\n\n```coral\n@diagram flowchart\napi process\n```'));
    const result = await generate({ prompt: 'Fix the label', config, intent: 'fix',
      existingDsl: '@diagram architecture\napi service as "API"' });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'header.diagram.mismatch', attempt: 0, format: 'coral',
    }));
    expect(result.dsl).toBeUndefined();
  });

  it('returns explanation and DSL from fix response', async () => {
    const fixed = '@diagram architecture\na service as "A"\nb service as "B"\na -> b';
    const fixResponse = `The issue is that Process A has too many outgoing connections.\n\n\`\`\`coral\n${fixed}\n\`\`\``;
    mockFetch.mockResolvedValueOnce(anthropicResponse(fixResponse));

    const result = await generate({
      prompt: 'fix the warning',
      config,
      intent: 'fix',
      existingDsl: 'service "A"\nservice "B"\nservice "C"\na -> b\na -> c',
      diagnostics: 'WARNING: max outgoing connections',
    });

    expect(result.success).toBe(true);
    expect(result.explanation).toBeTruthy();
    expect(result.dsl).toBe(fixed);
    expect(result.intent).toBe('fix');
  });

  it('returns explanation only when fix response has no DSL', async () => {
    const textOnly = 'I cannot fix this issue automatically because it requires architectural changes.';
    mockFetch.mockResolvedValueOnce(anthropicResponse(textOnly));

    const result = await generate({
      prompt: 'fix it',
      config,
      intent: 'fix',
      existingDsl: 'service "A"',
      diagnostics: 'ERROR: bad thing',
    });

    expect(result.success).toBe(true);
    expect(result.explanation).toBe(textOnly);
    expect(result.dsl).toBeUndefined();
    expect(result.intent).toBe('fix');
  });

  it('requires explicit Retry when fix DSL is invalid', async () => {
    const badFix = 'Here is the fix:\n\n```coral\ngarbage not valid dsl at all\n```';
    mockFetch.mockResolvedValueOnce(anthropicResponse(badFix));

    const result = await generate({
      prompt: 'fix the errors',
      config,
      intent: 'fix',
      existingDsl: 'service "A"',
      diagnostics: 'ERROR: parse error',
    });

    expect(result).toMatchObject({
      success: false, retries: 0,
      action: { kind: 'retry-candidate', prompt: 'fix the errors' },
    });
    expect(result.dsl).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid Mermaid Fix output without spending the transport budget', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Bad:\n\n```mermaid\nnot mermaid\n```'));

    const result = await generate({
      prompt: 'fix it', config, intent: 'fix', outputFormat: 'mermaid', maxRetries: 1,
      existingDsl: 'flowchart TD\nA[Alpha]', diagnostics: 'bad edge',
    });

    const sent = JSON.stringify(JSON.parse(mockFetch.mock.calls[0][1].body as string));
    expect(sent).toContain('Mermaid');
    expect(sent).not.toContain('Coral DSL Specification');
    expect(result).toMatchObject({
      success: false, outputFormat: 'mermaid', retries: 0,
      action: { kind: 'retry-candidate', prompt: 'fix it' },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // Pre-flight deterministic repair (Slice 49 local S49-AC4)
  // ==========================================================================

  it('keeps raw source authoritative and provides a labelled safe repair suggestion', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('```coral\n@diagram architecture\na service as "A"\nb service as "B"\na -> b\n```'));

    const raw = 'service"A" as a\nservice "B" as b\na -> b';

    await generate({
      prompt: 'fix it',
      config,
      intent: 'fix',
      existingDsl: raw,
      diagnostics: 'ERROR: parse error',
    });

    const sentSystemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body as string).system as string;
    expect(sentSystemPrompt).toContain(`## Existing Diagram (authoritative captured source)\n\n${raw}`);
    expect(sentSystemPrompt).toContain('## Optional Deterministic Repair Suggestion (not applied)');
    expect(sentSystemPrompt).toContain('service "A" as a\nservice "B" as b\na -> b');
    expect(sentSystemPrompt).toContain('missing-space-after-type at line 1');
  });

  it('preserves a parser-valid near-match node type for provider Fix', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('```coral\nservice "A"\nservice "B"\na -> b\n```'));

    await generate({
      prompt: 'fix it',
      config,
      intent: 'fix',
      existingDsl: 'servics "A"\nservice "B"\na -> b',
      diagnostics: 'ERROR: unknown type',
    });

    const sentSystemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body as string).system as string;
    expect(sentSystemPrompt).toContain('servics "A"\nservice "B"\na -> b');
    expect(sentSystemPrompt).not.toContain('service "A"\nservice "B"');
  });

  it('does not apply an ambiguous deterministic repair before provider Fix', async () => {
    const ambiguous = 'service "A"\nservice "B"\na -> b [Yes]';
    mockFetch.mockResolvedValueOnce(anthropicResponse('```coral\nservice "A"\nservice "B"\na -> b\n```'));

    await generate({ prompt: 'fix it', config, intent: 'fix', existingDsl: ambiguous, diagnostics: 'ERROR: ambiguous edge attribute' });

    const sentSystemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body as string).system as string;
    expect(sentSystemPrompt).toContain(ambiguous);
    expect(sentSystemPrompt).not.toContain('Optional Deterministic Repair Suggestion');
    expect(sentSystemPrompt).not.toContain('label: "Yes"');
  });

  it('forwards a mixed repairable-plus-unresolved source byte-exact', async () => {
    const mixed = 'service"A" as a\nservice "B" as b\na ->  [label: "uses"]';
    mockFetch.mockResolvedValueOnce(anthropicResponse('```coral\nservice "A" as a\nservice "B" as b\na -> b\n```'));

    await generate({ prompt: 'fix it', config, intent: 'fix', existingDsl: mixed, diagnostics: 'ERROR: invalid source' });

    const sentSystemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body as string).system as string;
    expect(sentSystemPrompt).toContain(mixed);
    expect(sentSystemPrompt).not.toContain('Optional Deterministic Repair Suggestion');
    expect(sentSystemPrompt).not.toContain('_missing_target');
  });

  it('preserves a parser-valid case-variant custom type for provider Fix', async () => {
    const custom = 'Service "API" as api';
    mockFetch.mockResolvedValueOnce(anthropicResponse('```coral\nservice "API" as api\n```'));

    await generate({ prompt: 'fix it', config, intent: 'fix', existingDsl: custom, diagnostics: 'ERROR: unsupported type' });

    const sentSystemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body as string).system as string;
    expect(sentSystemPrompt).toContain(custom);
  });

  it('still calls the LLM even when pre-flight repair fully resolves every syntax/vocabulary defect (no short-circuit)', async () => {
    // Regression test for a design bug caught by review: an earlier draft of
    // this contract skipped the LLM call whenever the repaired text re-parsed
    // with zero errors, which silently no-ops on the (far more common in
    // production) case where the fix request was actually about an
    // edge-compatibility diagnostic the deterministic repair has no idea
    // about. The corrected contract never skips the network call.
    mockFetch.mockResolvedValueOnce(anthropicResponse('```coral\n@diagram architecture\na service as "A"\nb service as "B"\na -> b\n```'));

    const result = await generate({
      prompt: 'fix it',
      config,
      intent: 'fix',
      existingDsl: 'service"A" as a\nservice "B" as b\na -> b', // fully repairable
      diagnostics: 'WARNING: incompatible edge (not a syntax problem repair can see)',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.dsl).toBe('@diagram architecture\na service as "A"\nb service as "B"\na -> b');
  });

  it('leaves an already-clean existingDsl completely unaffected', async () => {
    const clean = 'service "A"\nservice "B"\nservice "C"\na -> b\na -> c';
    mockFetch.mockResolvedValueOnce(anthropicResponse('The issue is X.\n\n```coral\nservice "A"\nservice "B"\na -> b\n```'));

    await generate({ prompt: 'fix the warning', config, intent: 'fix', existingDsl: clean, diagnostics: 'WARNING: x' });

    const sentSystemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body as string).system as string;
    expect(sentSystemPrompt).toContain(clean);
  });

  it('never runs deterministic repair on Mermaid-format existingDsl', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Fixed:\n\n```mermaid\nflowchart TD\nA[Alpha] --> B[Beta]\n```'));

    // Deliberately not valid Coral (it's Mermaid) -- repairCoralDsl must
    // never be run against it, or it could corrupt Mermaid-specific syntax.
    const mermaidExisting = 'flowchart TD\nA[Alpha] --> B[Beta';
    await generate({
      prompt: 'fix it', config, intent: 'fix', outputFormat: 'mermaid',
      existingDsl: mermaidExisting, diagnostics: 'bad edge',
    });

    const sentSystemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body as string).system as string;
    expect(sentSystemPrompt).toContain(mermaidExisting);
    expect(sentSystemPrompt).not.toContain('Optional Deterministic Repair Suggestion');
  });

  it('handles an absent existingDsl without attempting repair', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Explanation only, no prior diagram.'));

    const result = await generate({ prompt: 'fix it', config, intent: 'fix', diagnostics: 'ERROR: x' });

    expect(result.success).toBe(true);
    expect(result.explanation).toBe('Explanation only, no prior diagram.');
  });

  it('defaults to existing behavior when no intent specified', async () => {
    const dsl = '@diagram architecture\napi service as "API"\ndb database as "DB"\napi -> db';
    mockFetch.mockResolvedValueOnce(anthropicResponse(dsl));

    const result = await generate({
      prompt: 'Create an API',
      config,
    });

    expect(result.success).toBe(true);
    expect(result.dsl).toBe(dsl);
    expect(result.intent).toBeUndefined();
  });
});

// ============================================================================
// Spatial feedback and output format (R-025)
// ============================================================================

describe('spatial context', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('tells the model where the nodes currently are', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('service "A"'));

    await generate({
      prompt: 'put the cache below the gateway',
      config,
      layout: {
        nodes: [
          { id: 'gateway', label: 'Gateway', x: 100, y: 40, pinned: true },
          { id: 'cache', label: 'Cache', x: 320, y: 40 },
        ],
        edges: [
          { id: 'e', source: 'gateway', target: 'cache', routingPoints: [{ x: 220, y: 90 }] },
        ],
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const sent = JSON.stringify(body);
    expect(sent).toContain('gateway');
    expect(sent).toContain('(100, 40)');
    expect(sent).toContain('Current positions');
    expect(sent).toContain('pinned');
    expect(sent).toContain('Current edge routes');
    expect(sent).toContain('(220, 90)');
  });

  it('sends no spatial section when there is no layout', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('service "A"'));

    await generate({ prompt: 'make something', config });

    const sent = JSON.stringify(JSON.parse(mockFetch.mock.calls[0][1].body as string));
    expect(sent).not.toContain('Current positions');
  });
});

describe('output format', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('defaults to Coral', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('service "A"'));

    const result = await generate({ prompt: 'test', config });

    expect(result.outputFormat).toBe('coral');
  });

  it('asks for Mermaid and validates it with the Mermaid parser', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('flowchart TD\n  A[Alpha] --> B[Beta]'));

    const result = await generate({ prompt: 'test', config, outputFormat: 'mermaid' });

    const sent = JSON.stringify(JSON.parse(mockFetch.mock.calls[0][1].body as string));
    expect(sent).toContain('Mermaid');
    expect(result.success).toBe(true);
    expect(result.outputFormat).toBe('mermaid');
    expect(result.dsl).toContain('flowchart TD');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('blocks unsupported existing Mermaid before provider dispatch for ordinary edits', async () => {
    const result = await generate({
      prompt: 'add a node', config, outputFormat: 'mermaid',
      existingDsl: 'flowchart TD\nsubgraph cluster\nA[Alpha]\nend',
    });

    expect(result).toMatchObject({
      success: false, retries: 0,
      diagnostics: [expect.objectContaining({ code: 'format', format: 'mermaid' })],
    });
    expect(result.error).toContain('Use explicit Fix');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('preserves every existing Mermaid parser diagnostic before provider dispatch', async () => {
    const result = await generate({
      prompt: 'add a node', config, outputFormat: 'mermaid',
      existingDsl: 'flowchart TD\nA[ok]\n??\n!!',
    });

    expect(result).toMatchObject({
      success: false, retries: 0,
      diagnostics: [
        expect.objectContaining({ severity: 'info', code: 'mermaid.line.unparsed', source: '??', line: 3, column: 0, offset: 0,
          position: { line: 3, column: 0, offset: 0 }, attempt: 0, format: 'mermaid' }),
        expect.objectContaining({ severity: 'info', code: 'mermaid.line.unparsed', source: '!!', line: 4, column: 0, offset: 0,
          position: { line: 4, column: 0, offset: 0 }, attempt: 0, format: 'mermaid' }),
      ],
    });
    expect(result.diagnostics?.some((diagnostic) => diagnostic.code === 'format')).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows explicit Fix to dispatch against unsupported existing Mermaid', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse(
      'Fixed:\n\n```mermaid\nflowchart TD\nA[Alpha]\n```',
    ));

    const result = await generate({
      prompt: 'fix this source', config, intent: 'fix', outputFormat: 'mermaid',
      existingDsl: 'flowchart TD\nsubgraph cluster\nA[Alpha]\nend',
    });

    expect(result).toMatchObject({ success: true, retries: 0, outputFormat: 'mermaid' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('requires explicit Retry for invalid Mermaid', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('not a mermaid diagram'));

    const result = await generate({ prompt: 'test', config, outputFormat: 'mermaid' });

    expect(result).toMatchObject({
      success: false, retries: 0,
      action: { kind: 'retry-candidate', prompt: 'test' },
      diagnostics: [expect.objectContaining({ code: 'mermaid.diagram.unparsed', attempt: 0, format: 'mermaid' })],
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not apply invalid Mermaid even with transport budget available', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('not a mermaid diagram'));

    const result = await generate({
      prompt: 'test', config, outputFormat: 'mermaid', maxRetries: 1,
    });

    expect(result).toMatchObject({
      success: false,
      outputFormat: 'mermaid',
      retries: 0,
    });
    expect(result.dsl).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0]).toMatchObject({ code: 'mermaid.diagram.unparsed', format: 'mermaid' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns structured diagnostics and the rejected candidate for inspection', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('@diagram architecture\npartial service as "Partial"\ninvalid text!'));

    const result = await generate({ prompt: 'test', config, maxRetries: 1 });

    expect(result.success).toBe(false);
    expect(result.bestCandidate).toContain('Partial');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'coral.syntax.token.invalid', line: 3 }),
    ]));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('deterministic spatial generation integration', () => {
  const spatial = { original: graph, geometry };

  it.each([
    'move db above api',
    'move db above api; rename the database',
  ])('refuses a graph-print spatial result over authored 0.2.8 source: %s', async (prompt) => {
    const source = '@diagram architecture\napi service as "API"\ndb database as "DB"\napi -> db';
    const result = await generate({ prompt, existingDsl: source, config, spatial,
      notationId: 'architecture' });

    expect(result).toMatchObject({ success: false, retries: 0,
      diagnostics: [expect.objectContaining({ code: 'spatial.source-ownership' })] });
    expect(result.dsl).toBeUndefined();
    expect(result.graph).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('applies a spatial-only command locally without trusting or calling a provider', async () => {
    const events: any[] = [];
    const result = await generate({
      prompt: 'move db above api', existingDsl: printCoralDSL(graph), config, spatial,
      telemetry: (event) => events.push(event),
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.graph?.nodes[1].position).toEqual({ x: 110, y: -4 });
    expect(result.dsl).toContain('@ (110, -4)');
    expect(result.spatialEvidence?.every((item) => item.satisfied)).toBe(true);
    expect(result.diagnostics).toBeUndefined();
    expect(events.map((event) => event.kind)).toEqual(['start', 'success']);
    expect(events.at(-1)).toMatchObject({ strategy: 'local', retries: 0 });
  });

  it('surfaces a remaining printer loss from local spatial generation', async () => {
    const lossyGraph = structuredClone(graph);
    lossyGraph.nodes[0].sourceInfo = { range: { start: 0, end: 1 } };

    const result = await generate({
      prompt: 'move db above api', existingDsl: printCoralDSL(lossyGraph), config,
      spatial: { original: lossyGraph, geometry },
    });

    expect(result.success).toBe(true);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'coral.node.source-info.dropped', severity: 'warning', subject: { kind: 'node', id: 'api' } }));
  });

  it('uses the provider only for the non-spatial clause of a mixed request', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse([
      'service "API" as api @ (100, 100)',
      'database "Renamed DB" as db @ (999, 999) pinned',
      'group "Platform" as platform @ (500, 100) {',
      '  service "Cache" as cache @ (40, 50)',
      '  service "Worker" as worker',
      '}',
      'api -> db as "api-db" via (230, 140)',
    ].join('\n')));

    const result = await generate({
      prompt: 'move db above api; rename the database',
      existingDsl: printCoralDSL(graph), config, spatial,
    });

    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1].body).toContain('Resolved spatial plan');
    expect(result.graph?.nodes[1]).toMatchObject({ label: 'Renamed DB', position: { x: 110, y: -4 } });
    expect(result.graph?.edges[0].routeIntent).toEqual(graph.edges[0].routeIntent);
  });

  it('refuses a saved-source candidate in a GraphIR interchange spatial request', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse(
      '@diagram architecture\napi service as "API"\ndb database as "DB"\napi -> db'));

    const result = await generate({
      prompt: 'move db above api; rename the database',
      existingDsl: printCoralDSL(graph), config, spatial,
    });

    expect(result.success).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.dsl).toBeUndefined();
    expect(result.action?.kind).toBe('retry-candidate');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('fails unsupported spatial-looking text before fetch', async () => {
    const result = await generate({
      prompt: 'move db near api', existingDsl: printCoralDSL(graph), config, spatial,
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics?.[0].code).toBe('spatial.unsupported');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('offers explicit conversion instead of claiming Mermaid positions', async () => {
    const result = await generate({
      prompt: 'move db above api', existingDsl: 'flowchart TD\napi[API] --> db[DB]',
      outputFormat: 'mermaid', config, spatial,
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics?.[0].code).toBe('spatial.unencodable');
    expect(result.action).toEqual({ kind: 'convert-to-coral', prompt: 'move db above api' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    'put api at the left side of the diagram',
    'arrange api and db in a row',
    'arrange api and db in a column bottom to top',
  ])('runs the representative operation locally: %s', async (prompt) => {
    const result = await generate({ prompt, existingDsl: printCoralDSL(graph), config, spatial });
    expect(result.success).toBe(true);
    expect(result.spatialEvidence?.length).toBeGreaterThan(0);
    expect(result.spatialEvidence?.every((item) => item.satisfied)).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('preserves the original when a mixed candidate is rejected', async () => {
    const destructive = 'service "API" as api @ (100, 100)';
    mockFetch.mockResolvedValueOnce(anthropicResponse(destructive));

    const result = await generate({
      prompt: 'move db above api; rename the database',
      existingDsl: printCoralDSL(graph), config, spatial, maxRetries: 1,
    });

    expect(result.success).toBe(false);
    expect(result.graph).toBeUndefined();
    expect(result.retries).toBe(0);
    expect(result.action?.kind).toBe('retry-candidate');
    expect(result.diagnostics).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls.every((call) =>
      String(call[1].body).includes('Resolved spatial plan'))).toBe(true);
  });

  it.each([
    ['anthropic', 'claude-sonnet-4-5-20250929'],
    ['openai', 'gpt-4o'],
    ['google', 'gemini-3.6-flash'],
    ['mistral', 'mistral-large-latest'],
  ] as const)('keeps the resolved plan in the %s multi-turn system prompt', async (provider, model) => {
    const candidate = [
      'service "API" as api @ (100, 100)',
      'database "Renamed DB" as db @ (999, 999) pinned',
      'group "Platform" as platform @ (500, 100) {',
      '  service "Cache" as cache @ (40, 50)',
      '  service "Worker" as worker',
      '}',
      'api -> db as "api-db" via (230, 140)',
    ].join('\n');
    mockFetch.mockResolvedValueOnce(providerResponse(provider, candidate));

    const result = await generate({
      prompt: 'move db above api; rename the database',
      existingDsl: printCoralDSL(graph),
      config: { provider, model, apiKey: 'test-key' },
      history: [{ role: 'user', content: 'move db above api; rename the database' }],
      spatial,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(JSON.stringify(body)).toContain('Resolved spatial plan');
    expect(JSON.stringify(body)).toContain('Do not calculate, change, or certify coordinates');
    expect(result.success).toBe(true);
  });
});
