/**
 * LLM Provider Registry
 *
 * Multi-provider support for Anthropic, OpenAI, Google Gemini, and Mistral.
 * All calls go directly from the browser via fetch().
 * Part of issue #46: LLM-powered diagram generation.
 */

import type {
  LLMProviderId,
  LLMProviderConfig,
  LLMConfig,
  ProviderRequest,
  ProviderResponse,
  ProviderFailure,
  ProviderFailureCode,
  SamplingProfile,
} from './types';
import type { ConversationMessage } from './conversation';

export type { LLMProviderId };

// ============================================================================
// Sampling parameter mapping
// ============================================================================

/**
 * Map a `SamplingProfile` to Anthropic's top-level request fields.
 * Returns `{}` (contributing no keys once spread) when `sampling` is
 * omitted, or when an individual field is omitted — this is what keeps
 * request bodies byte-identical to today's when no sampling is supplied.
 */
function anthropicSamplingFields(sampling: SamplingProfile | undefined): {
  temperature?: number;
  top_p?: number;
} {
  if (!sampling) return {};
  const fields: { temperature?: number; top_p?: number } = {};
  if (sampling.temperature !== undefined) fields.temperature = sampling.temperature;
  if (sampling.topP !== undefined) fields.top_p = sampling.topP;
  return fields;
}

/**
 * Map a `SamplingProfile` to OpenAI/Mistral's shared chat/completions
 * fields. `reasoning_effort` is OpenAI-only per spec (Mistral doesn't
 * support it), gated on `includeReasoningEffort` rather than any model-ID
 * pattern — provider support for a specific model is left to the provider
 * to reject, not hardcoded here.
 */
function chatCompletionSamplingFields(
  sampling: SamplingProfile | undefined,
  includeReasoningEffort: boolean
): { temperature?: number; top_p?: number; reasoning_effort?: 'low' | 'medium' | 'high' } {
  if (!sampling) return {};
  const fields: { temperature?: number; top_p?: number; reasoning_effort?: 'low' | 'medium' | 'high' } = {};
  if (sampling.temperature !== undefined) fields.temperature = sampling.temperature;
  if (sampling.topP !== undefined) fields.top_p = sampling.topP;
  if (includeReasoningEffort && sampling.reasoningEffort !== undefined) {
    fields.reasoning_effort = sampling.reasoningEffort;
  }
  return fields;
}

/**
 * Map a `SamplingProfile` to Gemini's nested `generationConfig`. Returns
 * `{}` when no mappable field is present, so the key is omitted entirely
 * rather than emitted as an empty object.
 */
function googleGenerationConfigField(
  sampling: SamplingProfile | undefined
): { generationConfig?: { temperature?: number; topP?: number } } {
  if (!sampling) return {};
  const generationConfig: { temperature?: number; topP?: number } = {};
  if (sampling.temperature !== undefined) generationConfig.temperature = sampling.temperature;
  if (sampling.topP !== undefined) generationConfig.topP = sampling.topP;
  return Object.keys(generationConfig).length > 0 ? { generationConfig } : {};
}

const TERMINAL_CODES: Record<string, ProviderFailureCode> = {
  authentication_error: 'authentication', invalid_api_key: 'authentication',
  invalid_api_key_error: 'authentication', UNAUTHENTICATED: 'authentication',
  permission_error: 'permission', PERMISSION_DENIED: 'permission',
  invalid_request_error: 'invalid-request', bad_request_error: 'invalid-request',
  INVALID_ARGUMENT: 'invalid-request', request_too_large: 'invalid-request',
  billing_error: 'billing', credit_balance_exhausted: 'billing',
  insufficient_quota: 'hard-quota', organization_spend_limit_exceeded: 'hard-quota',
  project_spend_limit_exceeded: 'hard-quota', organization_usage_limit_exceeded: 'hard-quota',
  billing_hard_limit_reached: 'hard-quota', hard_quota_exceeded: 'hard-quota',
};

const RETRYABLE_CODES: Record<string, ProviderFailureCode> = {
  rate_limit_error: 'rate-limit', RESOURCE_EXHAUSTED: 'rate-limit',
  overloaded_error: 'overloaded', service_unavailable_error: 'overloaded',
  server_is_overloaded: 'overloaded', timeout_error: 'timeout',
};

// ============================================================================
// Provider Definitions
// ============================================================================

const PROVIDERS: LLMProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
      { id: 'o3-mini', name: 'o3-mini', provider: 'openai' },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', provider: 'google' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', provider: 'google' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral' },
      { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral' },
    ],
  },
];

// ============================================================================
// Registry Functions
// ============================================================================

/** Get all available providers */
export function getProviders(): LLMProviderConfig[] {
  return PROVIDERS;
}

/** Get a provider by ID */
export function getProvider(id: LLMProviderId): LLMProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Route a deliberately flagged localhost development session through the
 * Vite-only controlled provider. This is intentionally not a preference or an
 * arbitrary URL seam: production builds fold `import.meta.env.DEV` to false,
 * while development still requires both a loopback host and the explicit URL
 * flag used by the hands-on verification record.
 */
function requestProvider(id: LLMProviderId): LLMProviderConfig | undefined {
  const provider = getProvider(id);
  if (!provider || !import.meta.env.DEV || typeof window === 'undefined') return provider;
  const loopback = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.hostname === '[::1]';
  if (!loopback || new URLSearchParams(window.location.search).get('controlled-provider') !== '1') {
    return provider;
  }
  return { ...provider, baseUrl: `${window.location.origin}/__coral_controlled_provider` };
}

// ============================================================================
// Request Builders
// ============================================================================

/** Build a provider-specific HTTP request */
export function buildRequest(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): ProviderRequest {
  const provider = requestProvider(config.provider);
  if (!provider) {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  switch (config.provider) {
    case 'anthropic':
      return buildAnthropicRequest(provider, config, systemPrompt, userPrompt);
    case 'openai':
      return buildOpenAIRequest(provider, config, systemPrompt, userPrompt);
    case 'google':
      return buildGoogleRequest(provider, config, systemPrompt, userPrompt);
    case 'mistral':
      return buildMistralRequest(provider, config, systemPrompt, userPrompt);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/** Build a provider-specific HTTP request with multi-turn message history */
export function buildMultiTurnRequest(
  config: LLMConfig,
  systemPrompt: string,
  messages: ConversationMessage[],
): ProviderRequest {
  const provider = requestProvider(config.provider);
  if (!provider) {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  switch (config.provider) {
    case 'anthropic':
      return {
        url: `${provider.baseUrl}/v1/messages`,
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          ...anthropicSamplingFields(config.sampling),
        }),
      };

    case 'openai':
    case 'mistral': {
      const baseUrl = provider.baseUrl;
      return {
        url: `${baseUrl}/v1/chat/completions`,
        headers: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          ...chatCompletionSamplingFields(config.sampling, config.provider === 'openai'),
        }),
      };
    }

    case 'google':
      return {
        url: `${provider.baseUrl}/v1beta/models/${config.model}:generateContent`,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': config.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          ...googleGenerationConfigField(config.sampling),
        }),
      };

    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

function buildAnthropicRequest(
  provider: LLMProviderConfig,
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): ProviderRequest {
  return {
    url: `${provider.baseUrl}/v1/messages`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      ...anthropicSamplingFields(config.sampling),
    }),
  };
}

function buildOpenAIRequest(
  provider: LLMProviderConfig,
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): ProviderRequest {
  return {
    url: `${provider.baseUrl}/v1/chat/completions`,
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...chatCompletionSamplingFields(config.sampling, true),
    }),
  };
}

function buildGoogleRequest(
  provider: LLMProviderConfig,
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): ProviderRequest {
  return {
    url: `${provider.baseUrl}/v1beta/models/${config.model}:generateContent`,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      ...googleGenerationConfigField(config.sampling),
    }),
  };
}

function buildMistralRequest(
  provider: LLMProviderConfig,
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string
): ProviderRequest {
  return {
    url: `${provider.baseUrl}/v1/chat/completions`,
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...chatCompletionSamplingFields(config.sampling, false),
    }),
  };
}

// ============================================================================
// Response Extractors
// ============================================================================

/** Extract text from a provider-specific response */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractResponse(provider: LLMProviderId, raw: any): ProviderResponse {
  let response: ProviderResponse;
  switch (provider) {
    case 'anthropic':
      response = extractAnthropicResponse(raw);
      break;
    case 'openai':
    case 'mistral':
      response = extractOpenAIResponse(raw);
      break;
    case 'google':
      response = extractGoogleResponse(raw);
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
  if (typeof response.text !== 'string') {
    throw new Error('Invalid provider text response');
  }
  return response;
}

/** Classify an HTTP failure without retaining provider-controlled text. */
export function classifyProviderFailure(
  provider: LLMProviderId,
  status: number,
  raw: unknown,
  retryAfter: string | null,
  wallNow: number,
): ProviderFailure {
  const rawCodes = providerErrorCodes(provider, raw);
  const terminalCode = rawCodes.map((candidate) => TERMINAL_CODES[candidate]).find(Boolean);
  const retryableCode = rawCodes.map((candidate) => RETRYABLE_CODES[candidate]).find(Boolean);
  const code = terminalCode ?? retryableCode;
  const retryableStatus = status === 408 || status === 409 || status === 425
    || status === 429 || (status >= 500 && status <= 599);
  const retryAfterMs = parseRetryAfter(retryAfter, wallNow);
  return {
    provider,
    category: 'http',
    retryable: terminalCode ? false : Boolean(retryableCode || retryableStatus),
    status,
    ...(code ? { code } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

export function parseRetryAfter(value: string | null, wallNow: number): number | undefined {
  if (!value) return undefined;
  if (/^[0-9]+$/.test(value)) {
    const milliseconds = Number(value) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return undefined;
  const date = Date.parse(value);
  if (!Number.isFinite(date) || !Number.isFinite(wallNow)) return undefined;
  return Math.ceil(Math.max(0, date - wallNow));
}

function providerErrorCodes(provider: LLMProviderId, raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const error = (raw as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return [];
  const record = error as Record<string, unknown>;
  const candidates = provider === 'anthropic'
    ? [record.type]
    : provider === 'google'
      ? [record.status]
      : [record.code, record.type];
  return candidates.filter((value): value is string => typeof value === 'string');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAnthropicResponse(raw: any): ProviderResponse {
  const content = raw?.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('Empty response from Anthropic');
  }
  const textBlock = content.find((b: { type: string }) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text content in Anthropic response');
  }
  return { text: textBlock.text };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractOpenAIResponse(raw: any): ProviderResponse {
  const choices = raw?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('Empty response from OpenAI/Mistral');
  }
  return { text: choices[0].message.content };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGoogleResponse(raw: any): ProviderResponse {
  const candidates = raw?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Empty response from Google Gemini');
  }
  return { text: candidates[0].content.parts[0].text };
}
