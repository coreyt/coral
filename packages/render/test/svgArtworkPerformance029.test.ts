import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { assertPerformanceBudget, benchmarkEnvironment } from '../../../scripts/performance-policy.mjs';
import { admitSvgArtwork029 } from '../src/index.js';

// Performance limits of coral.svg-artwork 1 admission (c2-design.md
// "Performance limits"). Every run asserts the targets with a factor-of-four
// margin; a strict local or controlled benchmark asserts the exact targets.

const benchmark = benchmarkEnvironment();
const MARGIN = benchmark.measure ? 1 : 4;
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';

/** Time one admission of a text the cache has not seen. */
function time(text: string): { elapsed: number; failures: number } {
  const started = performance.now();
  const result = admitSvgArtwork029(text);
  return { elapsed: performance.now() - started, failures: result.ok ? 0 : result.failures.length };
}
const budget = (name: string, value: number, target: number) => assertPerformanceBudget({
  name, samples: [value], expectedSamples: 1, limit: target * MARGIN, comparison: 'lt' });

describe('coral.svg-artwork 1 admission performance', () => {
  it('admits a typical icon in under 2 ms after warm-up', () => {
    const icon = (index: number) => `${OPEN}<!-- ${index} --><defs><linearGradient id="g"><stop offset="0" stop-color="#2f6f4f"/>` +
      '<stop offset="1" stop-color="#1b4030"/></linearGradient></defs><g transform="translate(1 1)" opacity="0.9">' +
      '<path d="M12 0L24 4V14C24 21 18 26 12 28C6 26 0 21 0 14V4Z" fill="url(#g)" stroke="#fff" stroke-width=".5"/>' +
      '<circle cx="12" cy="12" r="3" fill="#fff"/><rect x="11" y="13" width="2" height="6" rx="1"/></g></svg>';
    for (let index = 0; index < 50; index++) time(icon(-index - 1));
    const samples = Array.from({ length: 200 }, (_, index) => time(icon(index)).elapsed).sort((a, b) => a - b);
    budget('typical icon median', samples[100]!, 2);
  });

  it('admits Detailed artwork at its segment limit in under 250 ms', () => {
    const { elapsed, failures } = time(`${OPEN}<path d="M0 0${' L1.5 2.25'.repeat(16_383)}"/></svg>`);
    expect(failures).toBe(0);
    budget('Detailed at limit', elapsed, 250);
  });

  it('handles a 2 MiB input at the ingress ceiling in under 1,500 ms', () => {
    const text = `${OPEN}<!--${'x'.repeat(2_097_061)}--><path d="M0 0H1"/></svg>`;
    budget('2 MiB input', time(text).elapsed, 1_500);
  });

  it('refuses a 2 MB attribute flood with one failure per attribute in under 1,500 ms', () => {
    const attributes: string[] = [];
    for (let length = 0, index = 0; length < 2_000_000; index++) {
      const attribute = ` a${index}=""`;
      attributes.push(attribute);
      length += attribute.length;
    }
    const { elapsed, failures } = time(`${OPEN}<path d="M0 0H1"${attributes.join('')}/></svg>`);
    expect(failures).toBe(attributes.length);
    budget('attribute flood', elapsed, 1_500);
  });
});
