/**
 * LLM Provider Tests
 *
 * Tests for provider registry, request adapters, and response extractors.
 * Requirement: Issue #46 (LLM-powered diagram generation)
 */

import { afterEach, describe, it, expect } from 'vitest';
import {
  getProvider,
  getProviders,
  buildRequest,
  buildMultiTurnRequest,
  extractResponse,
  classifyProviderFailure,
  parseRetryAfter,
  type LLMProviderId,
} from '../../src/llm/providers';
import type { ConversationMessage } from '../../src/llm/conversation';

// ============================================================================
// Provider Registry
// ============================================================================

describe('Provider Registry', () => {
  it('returns all four providers', () => {
    const providers = getProviders();
    expect(providers).toHaveLength(4);
    const ids = providers.map((p) => p.id);
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai');
    expect(ids).toContain('google');
    expect(ids).toContain('mistral');
  });

  it('returns a provider by id', () => {
    const provider = getProvider('anthropic');
    expect(provider).toBeDefined();
    expect(provider!.id).toBe('anthropic');
    expect(provider!.name).toBe('Anthropic');
  });

  it('returns undefined for unknown provider', () => {
    expect(getProvider('unknown' as LLMProviderId)).toBeUndefined();
  });

  it('each provider has at least one known model', () => {
    const providers = getProviders();
    for (const p of providers) {
      expect(p.models.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('each provider has a base URL', () => {
    const providers = getProviders();
    for (const p of providers) {
      expect(p.baseUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('provider failure classification', () => {
  it.each([
    ['anthropic', { error: { type: 'authentication_error', message: 'private' } }, 'authentication'],
    ['openai', { error: { code: 'credit_balance_exhausted', message: 'private' } }, 'billing'],
    ['google', { error: { status: 'PERMISSION_DENIED', message: 'private' } }, 'permission'],
    ['mistral', { error: { type: 'invalid_request_error', message: 'private' } }, 'invalid-request'],
  ] as const)('maps closed terminal codes for %s', (provider, body, code) => {
    expect(classifyProviderFailure(provider, 429, body, null, 0)).toEqual({
      provider, category: 'http', status: 429, code, retryable: false,
    });
  });

  it.each([408, 409, 425, 429, 500, 501, 529, 599])('retries status %s', (status) => {
    expect(classifyProviderFailure('anthropic', status, {}, null, 0).retryable).toBe(true);
  });

  it('discards unknown body-controlled codes and classifies by status', () => {
    const failure = classifyProviderFailure('openai', 400,
      { error: { code: 'secret-user-controlled-code', message: 'private' } }, null, 0);
    expect(failure).toEqual({ provider: 'openai', category: 'http', status: 400, retryable: false });
    expect(JSON.stringify(failure)).not.toContain('secret');
  });

  it('skips an unknown code to honor a known terminal type', () => {
    expect(classifyProviderFailure('openai', 503, {
      error: { code: 'vendor_detail', type: 'invalid_request_error' },
    }, null, 0)).toMatchObject({ code: 'invalid-request', retryable: false });
  });

  it.each([
    ['anthropic', { content: [{ type: 'text', text: null }] }],
    ['openai', { choices: [{ message: { content: null } }] }],
    ['google', { candidates: [{ content: { parts: [{ text: 42 }] } }] }],
    ['mistral', { choices: [{ message: { content: {} } }] }],
  ] as const)('rejects malformed successful text for %s', (provider, body) => {
    expect(() => extractResponse(provider, body)).toThrow(/text response/i);
  });

  it('parses only integer seconds or HTTP dates for Retry-After', () => {
    expect(parseRetryAfter('60', 0)).toBe(60_000);
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('Wed, 21 Oct 2015 07:27:59 GMT'))).toBe(1000);
    expect(parseRetryAfter('-1', 0)).toBeUndefined();
    expect(parseRetryAfter('1.5', 0)).toBeUndefined();
    expect(parseRetryAfter('not-a-date', 0)).toBeUndefined();
  });
});

// ============================================================================
// Request Builders
// ============================================================================

describe('buildRequest', () => {
  const systemPrompt = 'You are a diagram generator.';
  const userPrompt = 'Create a flowchart';

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('uses the same-origin controlled provider only for an explicit localhost development session', () => {
    window.history.replaceState({}, '', '/coral/?controlled-provider=1');

    const req = buildRequest(
      { provider: 'openai', model: 'gpt-4o', apiKey: 'fixture-success' },
      systemPrompt,
      userPrompt,
    );

    expect(req.url).toBe(`${window.location.origin}/__coral_controlled_provider/v1/chat/completions`);
  });

  it('keeps the registered live endpoint when the controlled-provider flag is absent', () => {
    window.history.replaceState({}, '', '/coral/');

    const req = buildRequest(
      { provider: 'openai', model: 'gpt-4o', apiKey: 'fixture-success' },
      systemPrompt,
      userPrompt,
    );

    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
  });

  describe('Anthropic', () => {
    it('builds correct request structure', () => {
      const req = buildRequest(
        { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', apiKey: 'sk-ant-test' },
        systemPrompt,
        userPrompt
      );

      expect(req.url).toContain('anthropic.com');
      expect(req.headers['x-api-key']).toBe('sk-ant-test');
      expect(req.headers['anthropic-version']).toBe('2023-06-01');
      expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(req.headers['content-type']).toBe('application/json');

      const body = JSON.parse(req.body);
      expect(body.model).toBe('claude-sonnet-4-5-20250929');
      expect(body.system).toBe(systemPrompt);
      expect(body.messages).toEqual([{ role: 'user', content: userPrompt }]);
      expect(body.max_tokens).toBeDefined();
    });
  });

  describe('OpenAI', () => {
    it('builds correct request structure', () => {
      const req = buildRequest(
        { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test' },
        systemPrompt,
        userPrompt
      );

      expect(req.url).toContain('openai.com');
      expect(req.headers['Authorization']).toBe('Bearer sk-test');
      expect(req.headers['content-type']).toBe('application/json');

      const body = JSON.parse(req.body);
      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toEqual([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
    });
  });

  describe('Google Gemini', () => {
    it('builds correct request structure', () => {
      const req = buildRequest(
        { provider: 'google', model: 'gemini-2.0-flash', apiKey: 'AIza-test' },
        systemPrompt,
        userPrompt
      );

      expect(req.url).toContain('generativelanguage.googleapis.com');
      expect(req.url).toContain('gemini-2.0-flash');
      expect(req.headers['x-goog-api-key']).toBe('AIza-test');
      expect(req.headers['content-type']).toBe('application/json');

      const body = JSON.parse(req.body);
      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toBe(systemPrompt);
      expect(body.contents[0].parts[0].text).toBe(userPrompt);
    });
  });

  describe('Mistral', () => {
    it('builds correct request structure (OpenAI-compatible)', () => {
      const req = buildRequest(
        { provider: 'mistral', model: 'mistral-large-latest', apiKey: 'ms-test' },
        systemPrompt,
        userPrompt
      );

      expect(req.url).toContain('mistral.ai');
      expect(req.headers['Authorization']).toBe('Bearer ms-test');
      expect(req.headers['content-type']).toBe('application/json');

      const body = JSON.parse(req.body);
      expect(body.model).toBe('mistral-large-latest');
      expect(body.messages).toEqual([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
    });
  });

  it('throws for unknown provider', () => {
    expect(() =>
      buildRequest(
        { provider: 'unknown' as LLMProviderId, model: 'x', apiKey: 'k' },
        systemPrompt,
        userPrompt
      )
    ).toThrow(/unsupported provider/i);
  });
});

// ============================================================================
// Response Extractors
// ============================================================================

describe('extractResponse', () => {
  it('extracts text from Anthropic response', () => {
    const raw = {
      content: [{ type: 'text', text: 'service "Hello"' }],
    };
    const result = extractResponse('anthropic', raw);
    expect(result.text).toBe('service "Hello"');
  });

  it('extracts text from OpenAI response', () => {
    const raw = {
      choices: [{ message: { content: 'service "Hello"' } }],
    };
    const result = extractResponse('openai', raw);
    expect(result.text).toBe('service "Hello"');
  });

  it('extracts text from Google Gemini response', () => {
    const raw = {
      candidates: [{ content: { parts: [{ text: 'service "Hello"' }] } }],
    };
    const result = extractResponse('google', raw);
    expect(result.text).toBe('service "Hello"');
  });

  it('extracts text from Mistral response (OpenAI-compatible)', () => {
    const raw = {
      choices: [{ message: { content: 'service "Hello"' } }],
    };
    const result = extractResponse('mistral', raw);
    expect(result.text).toBe('service "Hello"');
  });

  it('throws for empty Anthropic response', () => {
    expect(() => extractResponse('anthropic', { content: [] })).toThrow();
  });

  it('throws for empty OpenAI response', () => {
    expect(() => extractResponse('openai', { choices: [] })).toThrow();
  });

  it('throws for empty Google response', () => {
    expect(() => extractResponse('google', { candidates: [] })).toThrow();
  });

  it('throws for unknown provider', () => {
    expect(() => extractResponse('unknown' as LLMProviderId, {})).toThrow(/unsupported provider/i);
  });
});

// ============================================================================
// Multi-Turn Request Builders
// ============================================================================

describe('buildMultiTurnRequest', () => {
  const SYSTEM = 'You are a diagram assistant.';
  const MESSAGES: ConversationMessage[] = [
    { role: 'user', content: 'Create a login flow' },
    { role: 'assistant', content: 'service "Auth"\nservice "DB"\nauth -> db' },
    { role: 'user', content: 'Add a cache' },
  ];

  describe('Anthropic', () => {
    const config = { provider: 'anthropic' as const, model: 'claude-sonnet-4-5-20250929', apiKey: 'test-key' };

    it('places system prompt in system field', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.system).toBe(SYSTEM);
    });

    it('includes all messages in messages array', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.messages).toHaveLength(3);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'Create a login flow' });
      expect(body.messages[1]).toEqual({ role: 'assistant', content: 'service "Auth"\nservice "DB"\nauth -> db' });
      expect(body.messages[2]).toEqual({ role: 'user', content: 'Add a cache' });
    });

    it('sets correct URL and headers', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      expect(req.url).toContain('/v1/messages');
      expect(req.headers['x-api-key']).toBe('test-key');
    });
  });

  describe('OpenAI', () => {
    const config = { provider: 'openai' as const, model: 'gpt-4o', apiKey: 'test-key' };

    it('prepends system message to messages array', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.messages[0]).toEqual({ role: 'system', content: SYSTEM });
      expect(body.messages).toHaveLength(4);
    });

    it('preserves message order after system', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Create a login flow' });
      expect(body.messages[2]).toEqual({ role: 'assistant', content: 'service "Auth"\nservice "DB"\nauth -> db' });
      expect(body.messages[3]).toEqual({ role: 'user', content: 'Add a cache' });
    });
  });

  describe('Google Gemini', () => {
    const config = { provider: 'google' as const, model: 'gemini-2.0-flash', apiKey: 'test-key' };

    it('places system prompt in systemInstruction', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.systemInstruction.parts[0].text).toBe(SYSTEM);
    });

    it('maps assistant role to model role', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.contents[1].role).toBe('model');
    });

    it('includes all messages in contents', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.contents).toHaveLength(3);
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts[0].text).toBe('Create a login flow');
    });
  });

  describe('Mistral', () => {
    const config = { provider: 'mistral' as const, model: 'mistral-large-latest', apiKey: 'test-key' };

    it('uses same format as OpenAI (system + messages)', () => {
      const req = buildMultiTurnRequest(config, SYSTEM, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.messages[0]).toEqual({ role: 'system', content: SYSTEM });
      expect(body.messages).toHaveLength(4);
    });
  });

  it('works with a single user message', () => {
    const config = { provider: 'anthropic' as const, model: 'claude-sonnet-4-5-20250929', apiKey: 'k' };
    const msgs: ConversationMessage[] = [{ role: 'user', content: 'hello' }];
    const req = buildMultiTurnRequest(config, SYSTEM, msgs);
    const body = JSON.parse(req.body);
    expect(body.messages).toHaveLength(1);
  });

  it('throws for unsupported provider', () => {
    const config = { provider: 'unknown' as any, model: 'x', apiKey: 'k' };
    expect(() => buildMultiTurnRequest(config, SYSTEM, MESSAGES)).toThrow(/unsupported provider/i);
  });
});

// ============================================================================
// SamplingProfile
// ============================================================================

describe('SamplingProfile mapping', () => {
  const systemPrompt = 'You are a diagram generator.';
  const userPrompt = 'Create a flowchart';
  const MESSAGES: ConversationMessage[] = [
    { role: 'user', content: 'Create a login flow' },
    { role: 'assistant', content: 'service "Auth"\nservice "DB"\nauth -> db' },
    { role: 'user', content: 'Add a cache' },
  ];

  describe('no sampling supplied: byte-identical to today', () => {
    it('buildRequest: anthropic', () => {
      const config = { provider: 'anthropic' as const, model: 'claude-sonnet-4-5-20250929', apiKey: 'sk-ant-test' };
      const req = buildRequest(config, systemPrompt, userPrompt);
      expect(JSON.parse(req.body)).toEqual({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
    });

    it('buildRequest: openai', () => {
      const config = { provider: 'openai' as const, model: 'gpt-4o', apiKey: 'sk-test' };
      const req = buildRequest(config, systemPrompt, userPrompt);
      expect(JSON.parse(req.body)).toEqual({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
    });

    it('buildRequest: google', () => {
      const config = { provider: 'google' as const, model: 'gemini-2.0-flash', apiKey: 'AIza-test' };
      const req = buildRequest(config, systemPrompt, userPrompt);
      expect(JSON.parse(req.body)).toEqual({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      });
    });

    it('buildRequest: mistral', () => {
      const config = { provider: 'mistral' as const, model: 'mistral-large-latest', apiKey: 'ms-test' };
      const req = buildRequest(config, systemPrompt, userPrompt);
      expect(JSON.parse(req.body)).toEqual({
        model: 'mistral-large-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
    });

    it('buildMultiTurnRequest: anthropic', () => {
      const config = { provider: 'anthropic' as const, model: 'claude-sonnet-4-5-20250929', apiKey: 'test-key' };
      const req = buildMultiTurnRequest(config, systemPrompt, MESSAGES);
      expect(JSON.parse(req.body)).toEqual({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        messages: MESSAGES.map((m) => ({ role: m.role, content: m.content })),
      });
    });

    it('buildMultiTurnRequest: openai', () => {
      const config = { provider: 'openai' as const, model: 'gpt-4o', apiKey: 'test-key' };
      const req = buildMultiTurnRequest(config, systemPrompt, MESSAGES);
      expect(JSON.parse(req.body)).toEqual({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...MESSAGES.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
    });

    it('buildMultiTurnRequest: google', () => {
      const config = { provider: 'google' as const, model: 'gemini-2.0-flash', apiKey: 'test-key' };
      const req = buildMultiTurnRequest(config, systemPrompt, MESSAGES);
      expect(JSON.parse(req.body)).toEqual({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: MESSAGES.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      });
    });

    it('buildMultiTurnRequest: mistral', () => {
      const config = { provider: 'mistral' as const, model: 'mistral-large-latest', apiKey: 'test-key' };
      const req = buildMultiTurnRequest(config, systemPrompt, MESSAGES);
      expect(JSON.parse(req.body)).toEqual({
        model: 'mistral-large-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          ...MESSAGES.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
    });

    it('buildRequest: undefined individual sampling fields produce no keys (anthropic)', () => {
      const config = {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'sk-ant-test',
        sampling: { temperature: undefined, topP: undefined, reasoningEffort: undefined },
      };
      const req = buildRequest(config, systemPrompt, userPrompt);
      const body = JSON.parse(req.body);
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('top_p');
    });
  });

  describe('sampling supplied: maps to provider wire format', () => {
    it('anthropic: temperature/top_p at top level', () => {
      const config = {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'sk-ant-test',
        sampling: { temperature: 0.7, topP: 0.9 },
      };
      const req = buildRequest(config, systemPrompt, userPrompt);
      const body = JSON.parse(req.body);
      expect(body.temperature).toBe(0.7);
      expect(body.top_p).toBe(0.9);
      expect(body.model).toBe('claude-sonnet-4-5-20250929');
      expect(body.max_tokens).toBeDefined();
      expect(body.system).toBe(systemPrompt);
    });

    it('anthropic multi-turn: temperature/top_p at top level', () => {
      const config = {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-5-20250929',
        apiKey: 'test-key',
        sampling: { temperature: 0.3 },
      };
      const req = buildMultiTurnRequest(config, systemPrompt, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.temperature).toBe(0.3);
      expect(body).not.toHaveProperty('top_p');
    });

    it('openai: temperature/top_p, and reasoning_effort when reasoningEffort supplied', () => {
      const config = {
        provider: 'openai' as const,
        model: 'gpt-4o',
        apiKey: 'sk-test',
        sampling: { temperature: 0.5, topP: 0.8, reasoningEffort: 'high' as const },
      };
      const req = buildRequest(config, systemPrompt, userPrompt);
      const body = JSON.parse(req.body);
      expect(body.temperature).toBe(0.5);
      expect(body.top_p).toBe(0.8);
      expect(body.reasoning_effort).toBe('high');
    });

    it('openai: omits reasoning_effort when not supplied', () => {
      const config = {
        provider: 'openai' as const,
        model: 'gpt-4o',
        apiKey: 'sk-test',
        sampling: { temperature: 0.5 },
      };
      const req = buildRequest(config, systemPrompt, userPrompt);
      const body = JSON.parse(req.body);
      expect(body).not.toHaveProperty('reasoning_effort');
    });

    it('openai multi-turn: maps sampling fields', () => {
      const config = {
        provider: 'openai' as const,
        model: 'gpt-4o',
        apiKey: 'test-key',
        sampling: { temperature: 0.2, reasoningEffort: 'low' as const },
      };
      const req = buildMultiTurnRequest(config, systemPrompt, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.temperature).toBe(0.2);
      expect(body.reasoning_effort).toBe('low');
    });

    it('mistral: temperature/top_p mapped, reasoning_effort never emitted', () => {
      const config = {
        provider: 'mistral' as const,
        model: 'mistral-large-latest',
        apiKey: 'ms-test',
        sampling: { temperature: 0.6, topP: 0.95, reasoningEffort: 'medium' as const },
      };
      const req = buildRequest(config, systemPrompt, userPrompt);
      const body = JSON.parse(req.body);
      expect(body.temperature).toBe(0.6);
      expect(body.top_p).toBe(0.95);
      expect(body).not.toHaveProperty('reasoning_effort');
    });

    it('mistral multi-turn: temperature/top_p mapped, reasoning_effort never emitted', () => {
      const config = {
        provider: 'mistral' as const,
        model: 'mistral-large-latest',
        apiKey: 'test-key',
        sampling: { temperature: 0.4, reasoningEffort: 'high' as const },
      };
      const req = buildMultiTurnRequest(config, systemPrompt, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.temperature).toBe(0.4);
      expect(body).not.toHaveProperty('reasoning_effort');
    });

    it('google: nests temperature/topP under generationConfig', () => {
      const config = {
        provider: 'google' as const,
        model: 'gemini-2.0-flash',
        apiKey: 'AIza-test',
        sampling: { temperature: 0.1, topP: 0.99 },
      };
      const req = buildRequest(config, systemPrompt, userPrompt);
      const body = JSON.parse(req.body);
      expect(body.generationConfig).toEqual({ temperature: 0.1, topP: 0.99 });
    });

    it('google: reasoningEffort is ignored (unsupported)', () => {
      const config = {
        provider: 'google' as const,
        model: 'gemini-2.0-flash',
        apiKey: 'AIza-test',
        sampling: { reasoningEffort: 'high' as const },
      };
      const req = buildRequest(config, systemPrompt, userPrompt);
      const body = JSON.parse(req.body);
      expect(body).not.toHaveProperty('generationConfig');
    });

    it('google multi-turn: nests temperature/topP under generationConfig', () => {
      const config = {
        provider: 'google' as const,
        model: 'gemini-2.0-flash',
        apiKey: 'test-key',
        sampling: { topP: 0.5 },
      };
      const req = buildMultiTurnRequest(config, systemPrompt, MESSAGES);
      const body = JSON.parse(req.body);
      expect(body.generationConfig).toEqual({ topP: 0.5 });
    });
  });
});
