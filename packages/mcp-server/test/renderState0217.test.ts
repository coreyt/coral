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

  it('renders 0.2.17 uml-state, non-UML, and sequence diagrams with parrotfish and pf styles', async () => {
    const pfState = await handleRender({ content: source, options: { format: 'svg', style: 'parrotfish', direction: 'DOWN' } });
    expect(pfState.isError).toBeFalsy();
    const pfStateSvg = textOf(pfState);
    expect(pfStateSvg).toContain('fill="#fefece"');
    expect(pfStateSvg).toContain('stroke="#a80036"');
    expect(pfStateSvg).toMatch(/data-coral-part-id="start:outline"[^>]*fill="#222222"/);
    expect(pfStateSvg).toMatch(/data-coral-part-id="done:inner-outline"[^>]*fill="#222222"/);

    const archSource = '@diagram architecture\napi service as "API"\ndb database as "DB"\napi -> db\n';
    const pfArch = await handleRender({ content: archSource, options: { format: 'html', style: 'pf', theme: 'light' } });
    expect(pfArch.isError).toBeFalsy();
    expect(textOf(pfArch)).toContain('<!doctype html>');
    expect(textOf(pfArch)).toContain('fill="#ececff"');

    const seqSource = '@diagram uml-sequence\na participant as "A"\nb participant as "B"\na -> b [sync] as "call"\n';
    const pfSeq = await handleRender({ content: seqSource, options: { format: 'svg', style: 'pf', theme: 'dark' } });
    expect(pfSeq.isError).toBeFalsy();
    expect(textOf(pfSeq)).toContain('fill="#2b2a22"');
    expect(textOf(pfSeq)).toContain('stroke="#d46a84"');
  });
});
