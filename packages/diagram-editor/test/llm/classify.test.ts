/**
 * Intent Classifier Tests
 *
 * Tests for classifyIntent() heuristic function.
 * Requirement: Issue #48 (LLM-Assisted Diagnostics)
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/llm/classify';

describe('classifyIntent', () => {
  // ============================================================================
  // Fix intent: imperative fix commands + active diagnostics
  // ============================================================================

  describe('fix intent', () => {
    it('"fix the errors" + hasDiagnostics → fix', () => {
      expect(classifyIntent('fix the errors', true, true)).toBe('fix');
    });

    it('"get rid of the warning" + hasDiagnostics → fix', () => {
      expect(classifyIntent('get rid of the warning', true, true)).toBe('fix');
    });

    it('"resolve the issues" + hasDiagnostics → fix', () => {
      expect(classifyIntent('resolve the issues', true, true)).toBe('fix');
    });

    it('"fix it" + NO diagnostics → modify (fallback)', () => {
      expect(classifyIntent('fix it', true, false)).toBe('modify');
    });

    it('"remove the warning" + hasDiagnostics → fix', () => {
      expect(classifyIntent('remove the warning', true, true)).toBe('fix');
    });

    it('"clear the errors" + hasDiagnostics → fix', () => {
      expect(classifyIntent('clear the errors', true, true)).toBe('fix');
    });
  });

  // ============================================================================
  // Help intent: questions and explanation requests
  // ============================================================================

  describe('help intent', () => {
    it('"why is this edge red?" → help', () => {
      expect(classifyIntent('why is this edge red?', true, true)).toBe('help');
    });

    it('"what does this mean?" → help', () => {
      expect(classifyIntent('what does this mean?', true, true)).toBe('help');
    });

    it('"how do I fix this?" → help (asking how, not asking to fix)', () => {
      expect(classifyIntent('how do I fix this?', true, true)).toBe('help');
    });

    it('"explain the warnings" → help', () => {
      expect(classifyIntent('explain the warnings', true, true)).toBe('help');
    });

    it('"what does max connections mean?" → help', () => {
      expect(classifyIntent('what does max connections mean?', true, true)).toBe('help');
    });

    it('"why am I getting this error?" → help', () => {
      expect(classifyIntent('why am I getting this error?', true, true)).toBe('help');
    });
  });

  // ============================================================================
  // Directive patterns: action requests phrased as questions
  // ============================================================================

  describe('directive patterns (soften classifier)', () => {
    it('"Can you add a load balancer?" + hasExisting → modify', () => {
      expect(classifyIntent('Can you add a load balancer?', true, false)).toBe('modify');
    });

    it('"Could you remove the database?" + hasExisting → modify', () => {
      expect(classifyIntent('Could you remove the database?', true, false)).toBe('modify');
    });

    it('"Would you rename Auth to Authentication?" + hasExisting → modify', () => {
      expect(classifyIntent('Would you rename Auth to Authentication?', true, false)).toBe('modify');
    });

    it('"What if we added a cache?" + hasExisting → modify', () => {
      expect(classifyIntent('What if we added a cache?', true, false)).toBe('modify');
    });

    it('"Let\'s add a queue between them" + hasExisting → modify', () => {
      expect(classifyIntent("Let's add a queue between them", true, false)).toBe('modify');
    });

    it('"Please add a monitoring service" + hasExisting → modify', () => {
      expect(classifyIntent('Please add a monitoring service', true, false)).toBe('modify');
    });

    it('"Make the edges dashed" + hasExisting → modify', () => {
      expect(classifyIntent('Make the edges dashed', true, false)).toBe('modify');
    });

    it('"Add a payment service?" + hasExisting → modify', () => {
      expect(classifyIntent('Add a payment service?', true, false)).toBe('modify');
    });

    it('"Can you create a microservices diagram?" + no existing → generate', () => {
      expect(classifyIntent('Can you create a microservices diagram?', false, false)).toBe('generate');
    });

    it('"Show me an auth flow?" + no existing → generate', () => {
      expect(classifyIntent('Show me an auth flow?', false, false)).toBe('generate');
    });
  });

  // ============================================================================
  // Modify intent: changes to existing diagram
  // ============================================================================

  describe('modify intent', () => {
    it('"add a payment service" + hasExisting → modify', () => {
      expect(classifyIntent('add a payment service', true, false)).toBe('modify');
    });

    it('"remove the database node" + hasExisting → modify', () => {
      expect(classifyIntent('remove the database node', true, false)).toBe('modify');
    });

    it('"rename Auth to Authentication" + hasExisting → modify', () => {
      expect(classifyIntent('rename Auth to Authentication', true, false)).toBe('modify');
    });
  });

  // ============================================================================
  // Generate intent: fresh diagram creation
  // ============================================================================

  describe('generate intent', () => {
    it('"create an auth flow" + no existing → generate', () => {
      expect(classifyIntent('create an auth flow', false, false)).toBe('generate');
    });

    it('"make a microservices diagram" + no existing → generate', () => {
      expect(classifyIntent('make a microservices diagram', false, false)).toBe('generate');
    });
  });

  // ============================================================================
  // Priority ordering
  // ============================================================================

  describe('priority ordering', () => {
    it('help takes priority over fix keywords when phrased as a question', () => {
      // "how do I fix" contains "fix" but starts with "how" — should be help
      expect(classifyIntent('how do I fix the warnings?', true, true)).toBe('help');
    });

    it('fix takes priority over modify when diagnostics are present', () => {
      // "fix it" with diagnostics should be fix, not modify
      expect(classifyIntent('fix it', true, true)).toBe('fix');
    });
  });
});
