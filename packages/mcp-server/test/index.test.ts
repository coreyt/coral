import { describe, it, expect } from 'vitest';
import { generateTool } from '../src/tools/generate.js';
import { validateTool } from '../src/tools/validate.js';
import { convertTool } from '../src/tools/convert.js';
import { explainTool } from '../src/tools/explain.js';
import { layoutTool } from '../src/tools/layout.js';
import { renderTool } from '../src/tools/render.js';
import { conformanceTool } from '../src/tools/conformance.js';

/**
 * The tool surface the server advertises - R-030.
 *
 * R-001 keeps Coral general-purpose, so the absence of codebase-specific tools is
 * asserted, not assumed.
 */

const tools = [generateTool, validateTool, conformanceTool, convertTool, explainTool, layoutTool, renderTool];

describe('MCP tool surface', () => {
  it('advertises exactly the general diagram tools', () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      'coral_check_conformance',
      'coral_convert',
      'coral_explain',
      'coral_generate',
      'coral_layout',
      'coral_render',
      'coral_validate',
    ]);
  });

  it('exposes no codebase-specific tool', () => {
    const names = tools.map((t) => t.name).join(' ');
    expect(names).not.toMatch(/codebase|repository[_-]?(index|search)/i);
  });

  it('gives every tool a description and an object schema with content or description input', () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe('object');
      const props = Object.keys(tool.inputSchema.properties);
      expect(props.some((p) => p === 'content' || p === 'description')).toBe(true);
    }
  });

  it('marks its required inputs', () => {
    for (const tool of tools) {
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      expect(tool.inputSchema.required.length).toBeGreaterThan(0);
    }
  });
});
