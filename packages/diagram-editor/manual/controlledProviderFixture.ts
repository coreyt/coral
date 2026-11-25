import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const FIXTURE_PATH = '/__coral_controlled_provider';
const VALID_CANDIDATE = [
  'Controlled provider returned a valid candidate.',
  '```coral',
  'service "API" as api',
  'database "DB" as db',
  'api -> db as edge_1 [label: "writes"]',
  '```',
].join('\n');
const INVALID_CANDIDATE = [
  'Controlled provider returned an invalid candidate.',
  '```coral',
  'service "API" as api',
  'api -> missing as edge_1',
  '```',
].join('\n');

type FixtureScenario =
  | 'fixture-success'
  | 'fixture-candidate-retry'
  | 'fixture-transient'
  | 'fixture-exhaustion'
  | 'fixture-delay'
  | 'fixture-offline'
  | 'fixture-unfixable';

const SCENARIOS = new Set<FixtureScenario>([
  'fixture-success',
  'fixture-candidate-retry',
  'fixture-transient',
  'fixture-exhaustion',
  'fixture-delay',
  'fixture-offline',
  'fixture-unfixable',
]);

function scenarioFrom(request: IncomingMessage): FixtureScenario | undefined {
  const authorization = Array.isArray(request.headers.authorization)
    ? request.headers.authorization[0]
    : request.headers.authorization;
  const bearer = authorization?.replace(/^Bearer\s+/i, '');
  const apiKey = bearer
    ?? firstHeader(request.headers['x-api-key'])
    ?? firstHeader(request.headers['x-goog-api-key']);
  return SCENARIOS.has(apiKey as FixtureScenario) ? apiKey as FixtureScenario : undefined;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function providerBody(request: IncomingMessage, text: string): unknown {
  const url = request.url ?? '';
  if (url.includes('/v1/messages')) return { content: [{ type: 'text', text }] };
  if (url.includes('/v1beta/models/')) {
    return { candidates: [{ content: { parts: [{ text }] } }] };
  }
  return { choices: [{ message: { content: text } }] };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

/** Development-server-only controlled provider for the Slice 47 hands-on matrix. */
export function controlledProviderFixturePlugin(): Plugin {
  const counts = new Map<FixtureScenario, number>();
  return {
    name: 'coral-controlled-provider-fixture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(FIXTURE_PATH, (request, response) => {
        const scenario = scenarioFrom(request);
        if (!scenario) {
          json(response, 403, { error: { type: 'permission_error' } });
          return;
        }

        const count = (counts.get(scenario) ?? 0) + 1;
        counts.set(scenario, count);
        console.info(`[controlled-provider] scenario=${scenario} request=${count}`);

        if (scenario === 'fixture-offline') {
          response.destroy();
          return;
        }
        if (scenario === 'fixture-exhaustion' || (scenario === 'fixture-transient' && count === 1)) {
          response.setHeader('retry-after', '0');
          json(response, 503, { error: { type: 'overloaded_error' } });
          return;
        }

        const text = scenario === 'fixture-candidate-retry' && count === 1
          ? INVALID_CANDIDATE
          : scenario === 'fixture-unfixable'
            ? 'I could not produce a safe correction. No changes were applied.'
            : VALID_CANDIDATE;
        if (scenario !== 'fixture-delay') {
          json(response, 200, providerBody(request, text));
          return;
        }

        const timer = setTimeout(() => json(response, 200, providerBody(request, text)), 6_000);
        request.once('aborted', () => {
          clearTimeout(timer);
          console.info(`[controlled-provider] scenario=${scenario} request=${count} cancelled`);
        });
      });
    },
  };
}
