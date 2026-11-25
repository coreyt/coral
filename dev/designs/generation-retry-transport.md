# Generation retry transport and telemetry

Status: historical C40 implementation record, amended by R-025/R-041/R-042/
R-043 and the 2026-09-14 explicit Fix/retry policy.

Current authority: automatic additional calls are bounded transport replays only.
Candidate rejection returns ordered diagnostics and waits for explicit user
Fix/retry, which starts a new authorized request and budget. The historical
candidate strategy progression, candidate delays, shared candidate/transport
budget, and degraded invalid-candidate success described below are not target
0.2.5 behavior. Slice 47 owns the compatible implementation and mandatory HITL
evidence; retain the remainder as characterization of the existing C40 code.

Implements [REQ-G2](../requirements/system-requirements.md#req-g2-detached-staged-review-single-transaction-apply-and-resource-ceilings) (legacy `R-042`)
and completes issue #61. R-025 remains the released budget/output baseline;
R-041 remains the completed deterministic spatial integration contract.

## Scope and delta

Plan baseline is `3c366b5`; implementation starts from `8d6f033`. Since the
draft, C35 made `useLlmChat` the reference editor generation owner, added an
immutable spatial request, an explicit Mermaid-to-Coral continuation, and a
revision-gated graph/text commit. C40 extends those paths with abort and retry
configuration. It does not change spatial grammar, transforms, preservation,
printing, history, persistence, provider protocols, models, or dependencies.

Assigned production ownership is:

- `llm/types.ts`: additive request/runtime, typed failure, telemetry event, and
  strategy types;
- `llm/providers.ts`: provider-neutral extraction of safe error codes and
  `Retry-After` values;
- `llm/generate.ts`: the single budget loop, failure policy, scheduling,
  strategy progression, result accounting, and telemetry;
- `hooks/useLlmChat.ts`: active `AbortController`, preference pass-through,
  normal and conversion-flow cancellation, and optional local sink;
- `viz/file/schema.ts`, `viz/settings/useSettings.ts`,
  `PreferencesDialog.tsx`, and `App.tsx`: a persisted editor-only integer
  preference constrained to one through three and defaulted to two.

`useGenerate` is not used by the reference editor. C40 deliberately did not
make it a second policy owner. The private diagram-editor hook and its stale
barrel export are removed in 0.2.4 Slice 35 after the live `useLlmChat` path is
verified; this does not change a published package surface. The stale draft
statement about adding pass-through coverage to the legacy hook remains
rejected. Live modules import the C40 types and owners directly after the
private `llm/index.ts` barrel is removed.

## Research decision, checked 2026-09-09

| Source | Relevant contract | Design consequence |
| --- | --- | --- |
| RFC 9110 Retry-After | delay is seconds or HTTP date and states how long to wait | parse both forms against injected wall time; server delay is a minimum |
| WHATWG Fetch and DOM | `RequestInit.signal` carries cancellation and abort has a stable signal/reason | pass one signal through fetch and the scheduler; classify abort separately |
| Anthropic errors/rate limits | 429, connection, and 5xx are transient; 500/529 and valid retry-after are retry cases; auth/request/spend cases need action | status plus stable body code determine terminal override without retaining the raw body |
| OpenAI errors/rate limits | 429 rate/slow-down and 500/503 can retry; billing/spend/credit/quota 429s cannot; follow Retry-After and cancel separately | known terminal codes override status; long server delay is declined, never shortened |
| Google Gemini troubleshooting/rate limits | 408, 429 and 5xx are transient; 400/403 are terminal; exponential backoff and jitter are advised | use the common status table and bounded jitter |
| Mistral limitations/API | 400 context errors are terminal and rate limits produce 429 | use common status behavior; unknown response details never enter output |
| AWS full-jitter reference | full jitter reduces synchronized retry load | `random * capped exponential`, one application-level retry layer |

The direct fetch integration has no SDK retry layer, so C40 does not risk nested
SDK retries. Provider/model inventory from C35 remains unchanged and is not a
C40 compatibility guess.

## Public and internal interfaces

`GenerateRequest` gains optional `signal`, `telemetry`, and `retryRuntime`.
Existing object literals and callers remain valid. `retryRuntime` is a narrow
testable interface:

```ts
interface RetryRuntime {
  now?: () => number;              // monotonic milliseconds
  wallNow?: () => number;          // epoch milliseconds for HTTP dates
  random?: () => number;           // normalized to [0, 1]
  schedule?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}
```

Production defaults use `performance.now` (falling back to `Date.now`),
`Date.now`, `Math.random`, and an abort-aware timer. Configuration constants are
fixed by R-042 rather than exposed as general tuning surface.

`ProviderFailure` carries provider, category (`http`, `network`, `timeout`,
`aborted`, `response`, or `server-delay`), optional status/normalized code/
retry-after milliseconds, and a
boolean retryability decision. It never carries raw response data or the thrown
error. `GenerateResult` stays additive: existing diagnostics and retry count
remain, while provider diagnostics use safe generated messages.
`GenerateResult.failure?: ProviderFailure` is the additive machine-readable
failure surface. Abort also uses diagnostic code `provider.aborted`; callers do
not need to parse `error` or a generic `provider` diagnostic to recognize it.

Error JSON is inspected transiently at these paths only: Anthropic
`error.type`; OpenAI `error.code` then `error.type`; Google `error.status`; and
Mistral `error.code` then `error.type`. Values are mapped to this closed safe
union and otherwise discarded:

```text
authentication | permission | invalid-request | billing | hard-quota |
rate-limit | overloaded | timeout
```

The terminal input allowlist is exact: `authentication_error`,
`invalid_api_key`, `invalid_api_key_error`, `UNAUTHENTICATED`,
`permission_error`, `PERMISSION_DENIED`, `invalid_request_error`,
`bad_request_error`, `INVALID_ARGUMENT`, `request_too_large`, `billing_error`,
`credit_balance_exhausted`, `insufficient_quota`,
`organization_spend_limit_exceeded`, `project_spend_limit_exceeded`,
`organization_usage_limit_exceeded`, `billing_hard_limit_reached`, and
`hard_quota_exceeded`. Known `rate_limit_error`, `RESOURCE_EXHAUSTED`,
`overloaded_error`, `service_unavailable_error`, `server_is_overloaded`, and
`timeout_error` map to retryable normalized classes. Status remains the fallback
when the body is absent, malformed, or unknown. A 2xx JSON or provider extractor
failure is terminal `response`. If the request signal is aborted it takes
precedence over exception names; otherwise `AbortError` is aborted,
`TimeoutError` is retryable timeout, and other fetch rejection is retryable
network.

Telemetry is a discriminated `GenerateTelemetryEvent` union with these exact
variants and allowed fields (all durations/delays are finite non-negative ms):

```text
start       { kind, elapsedMs: 0 }
attempt     { kind, attempt, strategy, elapsedMs }
rejection   { kind, attempt, strategy, rejection, elapsedMs }
failure     { kind, attempt, strategy, category, status?, code?, retryable, elapsedMs }
delay       { kind, attempt, strategy, delayMs, reason, elapsedMs }
success     { kind, attempt, strategy, retries, elapsedMs }
exhausted   { kind, attempt, strategy, retries, elapsedMs }
terminal    { kind, attempt, strategy, retries, category, elapsedMs }
aborted     { kind, attempt, strategy, retries, phase, elapsedMs }
```

`strategy` is `local`, `initial`, `feedback`, `simplified`, or `decomposed`.
`rejection` is one of parse/drift/notation/spatial; `reason` is candidate or
provider; `phase` is before-fetch/fetch/backoff. `terminal.category` uses the
closed outcome union `spatial | provider | response | server-delay`. The sink is synchronous and
isolated in `try/catch`; payload construction is a closed allow-list, not object
spreading from requests, results, errors, or responses.

## Budget and state machine

Normalize `maxRetries` once: absent/non-finite becomes two; negative becomes
zero; otherwise floor. `attempt` is zero for the initial call and increments
immediately before each additional call. Consequently `retries` equals the
largest additional call actually started. Aborting during backoff does not
start or count the next retry; aborting its fetch does.

Provider call `attempt` and `strategyIndex` are separate. Strategy zero is
`initial`, then `feedback`, `simplified`, and `decomposed`; strategy indexes
above three repeat `decomposed`. Candidate rejection increments strategyIndex
and prepares a new request. A transport failure does not increment it: the next
call reuses the identical prepared system prompt, user prompt, and history.
Help has no candidate validator and only transport replay, including identical
history.

Before every additional call, calculate:

```text
fallback = random() * min(8000, 500 * 2^(retryNumber - 1))
delay = max(fallback, retryAfterMs || 0)
```

Random output is normalized as follows: non-finite becomes zero, otherwise it
is clamped to `[0,1]`. `Retry-After` is read through `Headers.get`; an ASCII
digits-only delta is parsed as integer seconds and multiplied by 1000, otherwise
an HTTP date accepted by `Date.parse` becomes `max(0, date - wallNow())`, rounded
up to an integer millisecond. Empty, signed, fractional, non-date, non-finite,
and negative forms are ignored; past dates mean zero. Exactly 60,000 ms is
allowed. A larger minimum is terminal `server-delay`. Provider-specific reset
headers are intentionally ignored because their units and meanings are not
portable; standard Retry-After is the only server timing input.

The scheduler checks the signal before installation and on abort, clears its
timer, removes its listener, and rejects with an abort reason. Fetch receives
the same signal. Abort is terminal and never retried.

## Prompt strategies

Feedback retains the format-specific rejection text and original user request.
Simplified retains the system format/schema contract, existing DSL needed for
modify/fix safety, and the exact rejection, but drops conversation history and
the optional layout prose. Decomposed instructs the provider to reconstruct a
minimal valid result in explicit validation-preserving steps and return one
complete final document; it does not make multiple subrequests or partially
commit output. Spatial plans remain in the system prompt and deterministic
post-validation remains authoritative.

## Failure, privacy, and stale behavior

Retryable statuses are 408, 409, 425, 429, and every status from 500 through
599 (including provider-specific 529).
Network failures and timeout-shaped errors retry. Known auth, permission,
invalid-request, billing, spend, credit, and hard-quota body codes are terminal
even with status 429/5xx. All other 4xx are terminal; unknown 5xx remain
retryable. Malformed bodies classify by status. Provider response extraction
failure is terminal because repeating a successfully returned incompatible
shape is not transport recovery.

Compatibility at candidate exhaustion is explicit. Generate/modify/spatial
exhaustion remains failure with diagnostics and best candidate. Fix preserves
its current successful explanation-only result when every extracted DSL is
invalid, augmented with diagnostics and best candidate. Notation exhaustion
preserves its current degraded success containing the candidate and lint errors
as warnings, augmented with ordered diagnostics. No path silently converts one
of these released outcomes to another.

`useLlmChat` owns a monotonically increasing operation identity and the current
controller. A new submit/confirmation aborts the previous controller, creates a
new identity/controller, and only the current identity may update loading,
controller ownership, chat entries, or conversation history. Hook unmount
aborts the controller. It returns a stable `abortActive()` callback; App stores
that callback in a ref available to both centralized `invalidateEditIntent` and
`invalidateLlmIntent`, which call it before incrementing the revision. The
signal reaches both ordinary and explicit conversion calls. Superseded and
unmounted aborts are silent; an otherwise-current user/document invalidation
preserves the document and may show one generic cancellation entry. Revision
gating remains the final defense against a non-cooperative transport.

The accepting `handleDslFromLlm` path is the deliberate exception: after its
revision equality check succeeds, it advances edit/revision ownership through
`invalidateEditIntent({ abortGeneration: false })` before committing. This
non-aborting option is private to the synchronous accepted-result path; every
user/document invalidation uses the default `true`. The current hook operation
then completes normally and alone clears its controller/loading state. A
component regression test proves successful commit does not abort itself and a
simultaneous external invalidation still wins.

The settings layer owns `normalizeLlmMaxRetries`: non-finite/non-number values
become two; finite values floor then clamp to `[1,3]`. It is applied after
localStorage parsing, after `initialUserPreferences` merges, and to partial
updates before state/persistence. Thus old records acquire two and corrupt or
out-of-range records cannot escape into the editor. The public `generate()`
normalizer remains distinct and continues accepting zero and larger values.

Telemetry is local and opt-in. It excludes prompt/history, DSL/candidates,
GraphIR/layout, API key, URL, request headers/body, response headers/body,
provider messages, and thrown-error text. Sink exceptions are swallowed.

Local spatial success emits `start, success` with attempt zero/strategy local;
a pre-fetch spatial rejection emits `start, terminal` with attempt zero/
strategy local. Provider success emits
`start, attempt, success`. Candidate retry emits
`rejection, delay(candidate), attempt`; transport retry emits
`failure, delay(provider), attempt` with the same strategy. Terminal transport,
response, or long server delay ends in `failure, terminal`. Exhaustion ends in
the last `rejection` or `failure`, then `exhausted`. Abort before/during first
fetch emits `start, attempt, aborted`; abort during delay emits the preceding
rejection/failure and `aborted` without a later attempt. A throwing sink changes
none of these generation transitions. Silent supersession still emits to its
own supplied sink but does not append UI.

## Alternatives rejected

- Separate transport and candidate budgets multiply requests and contradict the
  released shared `maxRetries` accounting.
- Provider SDKs add dependencies and hidden retry layers without improving the
  direct REST adapters.
- Parsing error strings is unstable and risks leaking provider content.
- Unbounded Retry-After stalls the interactive editor; ignoring it violates the
  server minimum.
- A remote telemetry backend exceeds the issue and privacy boundary.
- Decomposition into multiple partial mutations conflicts with atomic editor
  commits and spatial preservation.

## Requirement-to-test traceability

| Requirement | Evidence |
| --- | --- |
| R-042 AC-1 | generate tests for zero/one/two/three/fraction/non-finite/larger budgets; settings normalization and hook pass-through |
| R-042 AC-2 | provider/status/code/malformed/network/timeout classification tables and safe diagnostics |
| R-042 AC-3 | exact injected jitter including NaN/out-of-range random, Retry-After integer/date/invalid/exact-cap/over-cap, ignored vendor reset headers, abort-before-fetch/during-fetch/during-backoff tests |
| R-042 AC-4 | request-body strategy assertions for generate/modify/fix/help and mixed failure sequences |
| R-042 AC-5 | ordered event snapshots, forbidden-value scan, no-sink and throwing-sink equivalence |
| R-042 AC-6 | hook supersession identity, unmount, conversion cancellation, App invalidator bridge, preference migration/update/component, public barrel compile, deterministic Chromium failure-then-success |

Provider tests cover each named extraction path, an unknown code, and a
malformed body. Telemetry tests assert the exact sequences above, forbidden
value absence, and sink-throw equivalence.

The Chromium test uses `page.addInitScript` to replace `Math.random` with a
zero-returning function before App loads. The normal production scheduler then
receives a zero full-jitter delay; no runtime test hook or public UI injection
surface is added.

Focused coverage targets `llm/generate.ts`, `llm/providers.ts`, and
`hooks/useLlmChat.ts`; final evidence includes diagram-editor/viz suites,
coverage, Chromium, and repository `npm run verify` under the exact toolchain.
