import { describe, expect, it } from 'vitest';
import { render, CoralRenderError } from '../src/index.js';

describe('@coral-viz/browser edition 0.2.17 UML State visual rendering', () => {
  it('renders 0.2.17 composite & pseudostate uml-state in hifi and anemone', async () => {
    const source = [
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      'layout [direction: DOWN]',
      'start initial',
      'Idle state [description: "Waiting"] as "Idle"',
      'Active composite as "Active" {',
      '  entry initial',
      '  Run state as "Running"',
      '  exit final',
      '  entry -> Run',
      '  Run -> Run as "tick"',
      '  Run -> exit as "stop"',
      '}',
      'check choice',
      'done final',
      'n1 note as "Lifecycle note"',
      'start -> Idle',
      'Idle -> check as "go"',
      'check -> Active as "[ok]"',
      'check -> done as "[abort]"',
      'Active -> done',
      'n1 -.- Active [annotation]',
    ].join('\n');

    const hifi = await render(source, { style: 'hifi' });
    const ane = await render(source, { style: 'anemone' });
    expect(hifi.svg).toContain('<svg');
    expect(hifi.svg).toContain('Active');
    expect(hifi.svg).toContain('tick');
    expect(hifi.svg).toContain('>Lifecycle<');
    expect(hifi.svg).toContain('>note<');
    expect(ane.svg).toContain('#047857');
    expect(ane.svg).toContain('#be123c');
  });

  it('still refuses 0.2.8 uml-state with render.capability.character-only-edition', async () => {
    const legacy = '@diagram uml-state\ns initial\nIdle state\nf final\ns -> Idle\nIdle -> f\n';
    await expect(render(legacy)).rejects.toThrow(CoralRenderError);
  });
});
