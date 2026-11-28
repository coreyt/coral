import { describe, expect, it } from 'vitest';
import { handleRender } from '../src/tools/render.js';
import { handleValidate } from '../src/tools/validate.js';

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

describe('@coral-viz/mcp-server edition 0.2.17 UML State visual rendering', () => {
  const source = [
    '@diagram uml-state',
    '@coralVersion "0.2.17"',
    'layout [direction: DOWN]',
    'start initial',
    'Idle state [description: "Waiting"] as "Idle"',
    'Active composite as "Active" {',
    '  entry initial',
    '  Work state as "Working"',
    '  exit final',
    '  entry -> Work',
    '  Work -> Work as "tick"',
    '  Work -> exit',
    '}',
    'done final',
    'start -> Idle',
    'Idle -> Active as "go"',
    'Active -> done as "finish"',
  ].join('\n');

  it('validates and renders 0.2.17 uml-state to SVG and HTML in anemone and hifi', async () => {
    const val = await handleValidate({ content: source });
    expect(val.isError).toBeFalsy();

    const svgRes = await handleRender({ content: source, options: { format: 'svg', style: 'anemone', direction: 'DOWN' } });
    expect(svgRes.isError).toBeFalsy();
    const svgText = textOf(svgRes);
    expect(svgText).toContain('<svg');
    expect(svgText).toContain('Active');
    expect(svgText).toContain('tick');

    const htmlRes = await handleRender({ content: source, options: { format: 'html', style: 'hifi', direction: 'DOWN' } });
    expect(htmlRes.isError).toBeFalsy();
    const htmlText = textOf(htmlRes);
    expect(htmlText.toLowerCase()).toContain('<!doctype html>');
    expect(htmlText).toContain('<svg');
  });
});
