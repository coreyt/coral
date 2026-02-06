/**
 * Contract Tests: Validate mock server responses against shared JSON Schemas.
 *
 * These tests ensure that Coral's mock Armada server produces responses
 * matching the contracts in graph-ir-tools/ecosystem/contracts/. Armada
 * validates its real responses against the same schemas, so if either side
 * drifts the tests catch it.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import Ajv from 'ajv';
import {
  createMockArmadaServer,
  createEmptyGraphServer,
} from '../utils/mockArmadaServer';

// ---------------------------------------------------------------------------
// Schema loading
// ---------------------------------------------------------------------------

const CONTRACTS_DIR =
  process.env.CONTRACTS_DIR ??
  resolve(__dirname, '../../../../../../graph-ir-tools/ecosystem/contracts');

const schemasAvailable = existsSync(CONTRACTS_DIR);

function loadSchema(name: string): object {
  const filePath = resolve(CONTRACTS_DIR, name);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// AJV setup
// ---------------------------------------------------------------------------

const ajv = new Ajv({ allErrors: true });

function expectValid(schema: object, data: unknown): void {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (!valid) {
    throw new Error(
      `Schema validation failed:\n${JSON.stringify(validate.errors, null, 2)}\n\nData:\n${JSON.stringify(data, null, 2)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: fetch default response from mock server
// ---------------------------------------------------------------------------

async function fetchDefault(endpoint: string): Promise<unknown> {
  const server = createMockArmadaServer();
  const response = await server.fetch(`http://localhost:8765${endpoint}`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const describeContracts = schemasAvailable ? describe : describe.skip;

describeContracts('ATON Contract Tests (mock server vs shared schemas)', () => {
  describe('GET /health', () => {
    it('default health response matches contract', async () => {
      const schema = loadSchema('aton-health.schema.json');
      const data = await fetchDefault('/health');
      expectValid(schema, data);
    });
  });

  describe('GET /api/stats', () => {
    it('default stats response matches contract', async () => {
      const schema = loadSchema('aton-stats.schema.json');
      const data = await fetchDefault('/api/stats');
      expectValid(schema, data);
    });
  });

  describe('GET /api/modes', () => {
    it('default modes response matches contract', async () => {
      const schema = loadSchema('aton-modes.schema.json');
      const data = await fetchDefault('/api/modes');
      expectValid(schema, data);
    });
  });

  describe('GET /api/graph', () => {
    it('default graph response matches contract', async () => {
      const schema = loadSchema('aton-graph.schema.json');
      const data = await fetchDefault('/api/graph');
      expectValid(schema, data);
    });

    it('empty graph response matches contract', async () => {
      const schema = loadSchema('aton-graph.schema.json');
      const server = createEmptyGraphServer();
      const response = await server.fetch('http://localhost:8765/api/graph');
      const data = await response.json();
      expectValid(schema, data);
    });

    it('edges use "label" not "relation"', async () => {
      const data = (await fetchDefault('/api/graph')) as Record<string, any>;
      const edges = data?.content?.graphIR?.edges ?? [];
      for (const edge of edges) {
        expect(edge).not.toHaveProperty('relation');
      }
    });

    it('layout direction is DOWN/UP/LEFT/RIGHT', async () => {
      const data = (await fetchDefault('/api/graph')) as Record<string, any>;
      const direction = data?.settings?.layout?.direction;
      expect(['DOWN', 'UP', 'LEFT', 'RIGHT']).toContain(direction);
    });

    it('spacing uses "nodeNode" not "nodeSpacing"', async () => {
      const data = (await fetchDefault('/api/graph')) as Record<string, any>;
      const spacing = data?.settings?.layout?.spacing ?? {};
      expect(spacing).not.toHaveProperty('nodeSpacing');
    });
  });

  describe('GET /api/symbols', () => {
    it('default symbols response matches contract', async () => {
      const schema = loadSchema('aton-symbols.schema.json');
      const data = await fetchDefault('/api/symbols');
      expectValid(schema, data);
    });
  });

  describe('GET /api/search', () => {
    it('default search response matches contract', async () => {
      const schema = loadSchema('aton-search.schema.json');
      const data = await fetchDefault('/api/search');
      expectValid(schema, data);
    });
  });

  describe('GET /api/branches', () => {
    it('default branches response matches contract', async () => {
      const schema = loadSchema('aton-branches.schema.json');
      const data = await fetchDefault('/api/branches');
      expectValid(schema, data);
    });
  });
});
