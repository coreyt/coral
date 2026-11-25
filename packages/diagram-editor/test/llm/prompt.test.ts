/**
 * Prompt Composition Tests
 *
 * Tests for system/user prompt construction.
 * Requirement: Issue #46 (LLM-powered diagram generation)
 */

import { describe, it, expect } from 'vitest';
import { parseInstalledDocument028 } from '@coral-viz/render';
import {
  CORAL_GRAMMAR_REFERENCE,
  MERMAID_GRAMMAR_REFERENCE,
  composeSystemPrompt,
  composeUserPrompt,
  composeHelpSystemPrompt,
  composeFixSystemPrompt,
  composeLayoutContext,
} from '../../src/llm/prompt';
import { validateOutput } from '../../src/llm/validate';

// ============================================================================
// Grammar Reference
// ============================================================================

describe('CORAL_GRAMMAR_REFERENCE', () => {
  it('teaches saved 0.2.8 source with an example accepted by the installed reader', () => {
    expect(CORAL_GRAMMAR_REFERENCE).toContain('@diagram flowchart');
    expect(CORAL_GRAMMAR_REFERENCE).toContain('ID comes first');
    expect(CORAL_GRAMMAR_REFERENCE).not.toContain('IDs are auto-derived from labels');
    expect(CORAL_GRAMMAR_REFERENCE).not.toContain('data {');
    const example = CORAL_GRAMMAR_REFERENCE.match(/## Example\n~~~coral\n([\s\S]*?)\n~~~/)?.[1];
    expect(example).toBeDefined();
    const parsed = parseInstalledDocument028(example!);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.syntax.statements.some((item) => item.kind === 'node')).toBe(true);
    expect(parsed.syntax.statements.some((item) => item.kind === 'edge')).toBe(true);
    expect(validateOutput(example!, 'coral').valid).toBe(true);
  });

  it('states the settled label, edge, and exact-source rules', () => {
    expect(CORAL_GRAMMAR_REFERENCE).toContain('api service as "API"');
    expect(CORAL_GRAMMAR_REFERENCE).toContain('as only for a paired-quoted rendered label');
    expect(CORAL_GRAMMAR_REFERENCE).toContain('api -> store [type: data]');
    expect(CORAL_GRAMMAR_REFERENCE).toContain('api -> store as "reads"');
    expect(CORAL_GRAMMAR_REFERENCE).toContain('Preserve existing IDs, labels, comments, source order');
    expect(CORAL_GRAMMAR_REFERENCE).not.toContain('[dashed]');
    expect(CORAL_GRAMMAR_REFERENCE).not.toContain('[dotted]');
  });

  it('keeps Mermaid instructions separate from saved Coral syntax', () => {
    expect(CORAL_GRAMMAR_REFERENCE).not.toContain('flowchart TD');
    expect(MERMAID_GRAMMAR_REFERENCE).toContain('flowchart TD');
  });
});

// ============================================================================
// System Prompt
// ============================================================================

describe('composeSystemPrompt', () => {
  it('includes grammar reference in generate mode', () => {
    const prompt = composeSystemPrompt('generate');
    expect(prompt).toContain(CORAL_GRAMMAR_REFERENCE);
  });

  it('includes grammar reference in adjust mode', () => {
    const prompt = composeSystemPrompt('adjust', 'service "A"');
    expect(prompt).toContain(CORAL_GRAMMAR_REFERENCE);
  });

  it('includes generate-mode instruction', () => {
    const prompt = composeSystemPrompt('generate');
    expect(prompt.toLowerCase()).toContain('generate');
    // Should NOT contain existing DSL context
    expect(prompt).not.toContain('existing diagram');
  });

  it('includes adjust-mode instruction with existing DSL', () => {
    const existingDsl = 'service "Auth"\nservice "DB"\nauth -> db';
    const prompt = composeSystemPrompt('adjust', existingDsl);
    expect(prompt).toContain(existingDsl);
    // Should contain adjust instructions
    expect(prompt.toLowerCase()).toMatch(/adjust|modify|update/);
  });

  it('treats saved 0.2.8 source as the full authority during adjustment', () => {
    const source = '@diagram architecture\n// keep this comment\napi service as "API"\ndb database as "Store"\napi -> db';
    const prompt = composeSystemPrompt('adjust', source, 'architecture');
    expect(prompt).toContain(source);
    expect(prompt).toContain('Copy every unchanged node and edge declaration EXACTLY as-is.');
    expect(prompt).not.toContain('The existing diagram has these exact nodes');
    expect(prompt).not.toContain('IDs are auto-derived');
  });

  it('does not show a flowchart example as the active architecture profile', () => {
    const prompt = composeSystemPrompt('generate', undefined, 'architecture');
    expect(prompt).toContain('Start saved source with @diagram architecture.');
    expect(prompt).not.toContain('start terminal as "Start"');
  });

  it('instructs to output only Coral DSL', () => {
    const prompt = composeSystemPrompt('generate');
    expect(prompt.toLowerCase()).toMatch(/only.*coral|coral.*only|output.*dsl/);
  });

  it('instructs to not wrap in code fences', () => {
    const prompt = composeSystemPrompt('generate');
    // Should tell model to output raw DSL or mention code fences
    expect(prompt.toLowerCase()).toMatch(/no.*markdown|raw|plain|without.*fence|code.*block/);
  });

  it('uses one unambiguous Mermaid contract when Mermaid is requested', () => {
    const prompt = composeSystemPrompt('generate', undefined, 'flowchart', 'mermaid');
    expect(prompt).toContain(MERMAID_GRAMMAR_REFERENCE);
    expect(prompt).not.toContain(CORAL_GRAMMAR_REFERENCE);
    expect(prompt).not.toMatch(/Output ONLY valid Coral DSL/i);
  });

  it('does not suggest Coral geometry for Mermaid spatial context', () => {
    const context = composeLayoutContext({
      nodes: [{ id: 'a', x: 1, y: 2, pinned: true }], edges: [],
    }, 'mermaid');
    expect(context).toContain('Mermaid cannot encode fixed pixel positions');
    expect(context).not.toContain('@ (');
  });

  it('suggests only a supported Coral arrangement for spatial context', () => {
    const context = composeLayoutContext({ nodes: [{ id: 'cache', x: 1, y: 2 }], edges: [] });
    expect(context).toContain('arrange row: api, cache');
    expect(context).not.toContain('service "Cache" as cache');
  });
});

// ============================================================================
// User Prompt
// ============================================================================

describe('composeUserPrompt', () => {
  it('includes the user input', () => {
    const prompt = composeUserPrompt('Create a login flow');
    expect(prompt).toContain('Create a login flow');
  });

  it('returns a non-empty string', () => {
    const prompt = composeUserPrompt('hello');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('preserves original intent', () => {
    const input = 'Add a payment service between checkout and shipping';
    const prompt = composeUserPrompt(input);
    expect(prompt).toContain(input);
  });
});

// ============================================================================
// Help System Prompt (Issue #48)
// ============================================================================

describe('composeHelpSystemPrompt', () => {
  it('includes explain instruction', () => {
    const prompt = composeHelpSystemPrompt();
    expect(prompt.toLowerCase()).toMatch(/explain/);
  });

  it('does NOT include "output only Coral DSL"', () => {
    const prompt = composeHelpSystemPrompt();
    expect(prompt).not.toMatch(/output.*only.*coral.*dsl/i);
    expect(prompt).not.toMatch(/output only/i);
  });

  it('instructs not to output DSL', () => {
    const prompt = composeHelpSystemPrompt();
    expect(prompt.toLowerCase()).toMatch(/do not.*dsl|no.*coral dsl|don't.*dsl/);
  });

  it('includes DSL context when provided', () => {
    const dsl = 'service "Auth"\nservice "DB"';
    const prompt = composeHelpSystemPrompt(dsl);
    expect(prompt).toContain(dsl);
  });

  it('includes diagnostics when provided', () => {
    const diagnostics = 'WARNING: Process A → Process B: max connections reached';
    const prompt = composeHelpSystemPrompt(undefined, diagnostics);
    expect(prompt).toContain(diagnostics);
  });

  it('includes both DSL context and diagnostics', () => {
    const dsl = 'service "Auth"';
    const diagnostics = 'ERROR: End → Process: cannot have outgoing';
    const prompt = composeHelpSystemPrompt(dsl, diagnostics);
    expect(prompt).toContain(dsl);
    expect(prompt).toContain(diagnostics);
  });
});

// ============================================================================
// Fix System Prompt (Issue #48)
// ============================================================================

describe('composeFixSystemPrompt', () => {
  it('includes fix instructions', () => {
    const prompt = composeFixSystemPrompt('service "A"', 'WARNING: max connections');
    expect(prompt.toLowerCase()).toMatch(/fix|correct|resolve/);
  });

  it('asks for code-fenced DSL', () => {
    const prompt = composeFixSystemPrompt('service "A"', 'WARNING: max connections');
    expect(prompt).toMatch(/```coral/);
  });

  it('includes the grammar reference', () => {
    const prompt = composeFixSystemPrompt('service "A"', 'WARNING: max connections');
    expect(prompt).toContain(CORAL_GRAMMAR_REFERENCE);
  });

  it('includes the existing DSL', () => {
    const dsl = 'service "Auth"\nservice "DB"\nauth -> db';
    const prompt = composeFixSystemPrompt(dsl, 'WARNING: test');
    expect(prompt).toContain(dsl);
  });

  it('includes the diagnostic messages', () => {
    const diagnostics = 'WARNING: Process A → Process B: max outgoing connections (1)';
    const prompt = composeFixSystemPrompt('service "A"', diagnostics);
    expect(prompt).toContain(diagnostics);
  });

  it('keeps raw source authoritative and labels a deterministic suggestion with provenance', () => {
    const raw = 'service"API" as api';
    const prompt = composeFixSystemPrompt(raw, 'ERROR: parse error', undefined, 'coral', {
      proposedDsl: 'service "API" as api',
      fixes: [{
        defectType: 'missing-space-after-type',
        location: { line: 1, column: 0 },
        description: 'inserted missing node-type whitespace',
      }],
    });

    expect(prompt).toContain(`## Existing Diagram (authoritative captured source)\n\n${raw}`);
    expect(prompt).toContain('## Optional Deterministic Repair Suggestion (not applied)');
    expect(prompt).toContain('service "API" as api');
    expect(prompt).toContain('missing-space-after-type at line 1, column 0');
    expect(prompt).toContain('inserted missing node-type whitespace');
  });

  it('requests and documents Mermaid for a Mermaid fix', () => {
    const prompt = composeFixSystemPrompt('flowchart TD\nA[A]', 'bad edge', undefined, 'mermaid');
    expect(prompt).toContain('```mermaid');
    expect(prompt).toContain(MERMAID_GRAMMAR_REFERENCE);
    expect(prompt).not.toContain(CORAL_GRAMMAR_REFERENCE);
  });
});
