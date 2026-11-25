/**
 * LLM Types for Diagram Generation
 *
 * Type definitions for multi-provider LLM integration.
 * Part of issue #46: LLM-powered diagram generation.
 */

import type { GraphIR, Diagnostic } from '@coral-viz/language';
import type { CapturedNodeGeometry, SpatialEvidence } from './spatial/types';

/** Supported LLM providers */
export type LLMProviderId = 'anthropic' | 'openai' | 'google' | 'mistral';

/** Known model definition */
export interface ModelDefinition {
  id: string;
  name: string;
  provider: LLMProviderId;
}

/** LLM provider configuration */
export interface LLMProviderConfig {
  id: LLMProviderId;
  name: string;
  /** Base URL for API calls */
  baseUrl: string;
  /** Known models for this provider */
  models: ModelDefinition[];
}

/**
 * Optional sampling parameters for a request. Every field is additive and
 * optional; omitting the whole profile (or an individual field) preserves
 * today's request bodies exactly. Provider support varies — a field a
 * provider doesn't support is simply not mapped into that provider's wire
 * format.
 */
export interface SamplingProfile {
  temperature?: number;
  topP?: number;
  /** Provider support varies; ignored where unsupported. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/** Runtime LLM configuration (user selections) */
export interface LLMConfig {
  provider: LLMProviderId;
  model: string;
  apiKey: string;
  /** Optional sampling parameters, mapped per-provider by the request builders. */
  sampling?: SamplingProfile;
}

/** Generation mode */
export type GenerateMode = 'generate' | 'adjust';

/** Classified intent from user prompt */
export type LLMIntent = 'generate' | 'modify' | 'help' | 'fix';

/** Request to generate a diagram */
export interface GenerateRequest {
  /** User's natural language prompt */
  prompt: string;
  /** Current DSL text (if adjusting) */
  existingDsl?: string;
  /** LLM configuration */
  config: LLMConfig;
  /** Classified intent (if omitted, inferred from existingDsl) */
  intent?: LLMIntent;
  /** Formatted diagnostic text for context */
  diagnostics?: string;
  /** Conversation history for multi-turn context */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Active notation ID for notation-aware prompt composition */
  notationId?: string;
  /**
   * Where the nodes currently sit, so the model can reason about the diagram
   * spatially. Positions were stripped before the prompt, so "put the cache
   * below the gateway" had nothing to work from.
   */
  layout?: {
    nodes: Array<{ id: string; label?: string; x: number; y: number; pinned?: boolean }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      routingPoints?: Array<{ x: number; y: number }>;
    }>;
  };
  /** Which text format to produce. Defaults to Coral. */
  outputFormat?: OutputFormat;
  /**
   * How many automatic provider/transport replays to allow. Candidate
   * rejection is terminal and requires a new, explicit user request.
   * Defaults to 2.
   */
  maxRetries?: number;
  /** Cancel the operation, including fetch and retry backoff. */
  signal?: AbortSignal;
  /** Optional local, redacted telemetry sink. */
  telemetry?: (event: GenerateTelemetryEvent) => void;
  /** Deterministic timing seam; production callers normally omit this. */
  retryRuntime?: RetryRuntime;
  /** Complete authoritative input for deterministic spatial handling. */
  spatial?: {
    original: GraphIR;
    geometry: readonly CapturedNodeGeometry[];
  };
}

/** Text format the model is asked to emit. */
export type OutputFormat = 'coral' | 'mermaid';

/** Result of a generation attempt */
export interface GenerateResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generated DSL text (on success) */
  dsl?: string;
  /** Error message (on failure) */
  error?: string;
  /** Number of automatic provider/transport replays that started. */
  retries: number;
  /** Which format the returned text is in */
  outputFormat?: OutputFormat;
  /** Whether drift was detected */
  driftDetected: boolean;
  /** Explanation text for help/fix responses */
  explanation?: string;
  /** Echo back the classified intent */
  intent?: LLMIntent;
  /** Internal-only notation findings. Product UI must not surface these. */
  lintWarnings?: string[];
  /** Structured reasons candidates were rejected or degraded. */
  diagnostics?: Array<Partial<Omit<Diagnostic, 'code' | 'message'>> & {
    code: string;
    message: string;
    attempt: number;
    format: OutputFormat;
  }>;
  /** Highest-quality candidate observed when the retry budget is exhausted. */
  bestCandidate?: string;
  /** Lossless sidecar for an accepted spatial result. */
  graph?: GraphIR;
  spatialEvidence?: readonly SpatialEvidence[];
  action?:
    | { kind: 'convert-to-coral'; prompt: string }
    | { kind: 'retry-candidate'; prompt: string };
  /** Machine-readable provider/transport failure, when one ended generation. */
  failure?: ProviderFailure;
}

export type RetryStrategy = 'local' | 'initial' | 'feedback' | 'simplified' | 'decomposed';
export type ProviderFailureCategory =
  | 'http' | 'network' | 'timeout' | 'aborted' | 'response' | 'server-delay';
export type ProviderFailureCode =
  | 'authentication' | 'permission' | 'invalid-request' | 'billing'
  | 'hard-quota' | 'rate-limit' | 'overloaded' | 'timeout';

export interface ProviderFailure {
  provider: LLMProviderId;
  category: ProviderFailureCategory;
  retryable: boolean;
  status?: number;
  code?: ProviderFailureCode;
  retryAfterMs?: number;
}

export interface RetryRuntime {
  now?: () => number;
  wallNow?: () => number;
  random?: () => number;
  schedule?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export type GenerateTelemetryEvent =
  | { kind: 'start'; elapsedMs: number }
  | { kind: 'attempt'; attempt: number; strategy: RetryStrategy; elapsedMs: number }
  | { kind: 'rejection'; attempt: number; strategy: RetryStrategy; rejection: 'parse' | 'drift' | 'notation' | 'spatial'; elapsedMs: number }
  | { kind: 'failure'; attempt: number; strategy: RetryStrategy; category: ProviderFailureCategory; status?: number; code?: ProviderFailureCode; retryable: boolean; elapsedMs: number }
  | { kind: 'delay'; attempt: number; strategy: RetryStrategy; delayMs: number; reason: 'provider'; elapsedMs: number }
  | { kind: 'success'; attempt: number; strategy: RetryStrategy; retries: number; elapsedMs: number }
  | { kind: 'exhausted'; attempt: number; strategy: RetryStrategy; retries: number; elapsedMs: number }
  | { kind: 'terminal'; attempt: number; strategy: RetryStrategy; retries: number; category: 'spatial' | 'provider' | 'response' | 'server-delay'; elapsedMs: number }
  | { kind: 'aborted'; attempt: number; strategy: RetryStrategy; retries: number; phase: 'before-fetch' | 'fetch' | 'backoff'; elapsedMs: number };

/** Provider-specific request adapter output */
export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Extracted text response from provider */
export interface ProviderResponse {
  text: string;
}
