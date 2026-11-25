import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { admitSvgArtwork029, parseInstalledDocument028 } from '../src/index.js';

// The admission caches hold at most what source reporting needs: no ingress
// refusal, and no refusal longer than the 64 reported failures plus the first
// suppressed one (profile §13.2; C2 code review P2).

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
const flood = (count: number, salt: string) =>
  `${OPEN}<!-- ${salt} --><path d="M0 0H1"${Array.from({ length: count }, (_, index) => ` a${index}=""`).join('')}/></svg>`;
const document = (artwork: string) => '@diagram architecture\n@coralVersion "0.2.9"\n\n@symbol shield {\n  name "Shield"\n' +
  `  size 24 x 24\n  artwork svg """\n${artwork}\n"""\n}\ngate service\n`;

describe('coral.svg-artwork admission caches', () => {
  it('does not cache an ingress refusal', () => {
    const text = `${OPEN}<!--${'x'.repeat(2_100_000)}--></svg>`;
    const first = admitSvgArtwork029(text);
    expect(first.ok).toBe(false);
    expect(admitSvgArtwork029(text)).not.toBe(first);
  });

  it('does not cache a refusal with more failures than source reports', () => {
    const text = flood(66, 'over');
    const first = admitSvgArtwork029(text);
    expect(first.ok ? 0 : first.failures.length).toBe(66);
    expect(admitSvgArtwork029(text)).not.toBe(first);
    const small = flood(65, 'at');
    expect(admitSvgArtwork029(small)).toBe(admitSvgArtwork029(small));
  });

  it('retains far less than the full failure list of a 2 MB flood read from source', () => {
    const attributes: string[] = [];
    for (let length = 0, index = 0; length < 1_900_000; index++) {
      const attribute = ` b${index}=""`;
      attributes.push(attribute);
      length += attribute.length;
    }
    let source: string | undefined = document(`${OPEN}<path d="M0 0H1"${attributes.join('')}/></svg>`);
    gc();
    const before = process.memoryUsage().heapUsed;
    let diagnostics = parseInstalledDocument028(source).syntax.diagnostics.length;
    expect(diagnostics).toBe(65);
    diagnostics = parseInstalledDocument028(source).syntax.diagnostics.length;
    expect(diagnostics).toBe(65);
    source = undefined;
    gc();
    const retained = process.memoryUsage().heapUsed - before;
    expect(retained).toBeLessThan(16 * 1024 * 1024);
  }, 30_000);
});
