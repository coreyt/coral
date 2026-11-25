import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { checkInstalledSuccessorSourceConformance028 } from '../src/successorSourceConformance028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { userSymbolNotices029 } from '../src/userSymbolNotices029.js';

// Author decision 2026-10-30: in 0.2.9 a document in which any node selects a
// `local.` symbol is not conformance-checked; its effective level is `none`.

const ARTWORK = ['  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""'];
const DEFINITION = ['@symbol gate {', '  name "Gate"', '  size 40 x 40', ...ARTWORK, '}'];
/** A strict flowchart failure: the decision has one exit. */
const flowchart = (level: string | undefined, selects: boolean) => ['@diagram flowchart', '@coralVersion "0.2.9"',
  ...(level ? [`@conformanceLevel ${level}`] : []), ...DEFINITION,
  selects ? 'g process [symbol: "local.gate"]' : 'g process', 'd decision', 'b process', 'g -> d', 'd -> b', ''].join('\n');
const notices = (source: string) => userSymbolNotices029(parseInstalledDocument028(source),
  projectInstalledSourceToSuccessor028(source).graph!);

describe('conformance of documents whose nodes select user symbols', () => {
  it('evaluates the whole document at level none and says it was not checked', () => {
    for (const requestedLevel of [undefined, 'strict', 'typical'] as const) {
      const checked = checkInstalledSuccessorSourceConformance028(flowchart('strict', true),
        requestedLevel ? { requestedLevel } : {});
      expect(checked.diagnostics).toEqual([]);
      expect(checked.report).toMatchObject({ evaluatedLevel: 'none', claimStatus: 'not-claimed' });
      expect(checked.report!.findings.filter((finding) => finding.category === 'notation')).toEqual([]);
      expect(checked.notChecked029).toEqual({ reason: 'user-symbols',
        message: 'not checked: document uses user symbols' });
    }
  });

  it('keeps normal conformance when definitions are only unused', () => {
    const checked = checkInstalledSuccessorSourceConformance028(flowchart('strict', false));
    expect(checked.notChecked029).toBeUndefined();
    expect(checked.report).toMatchObject({ evaluatedLevel: 'strict', claimStatus: 'failed' });
    expect(checked.report!.findings.map((finding) => finding.id)).toContain('CORAL.FLOWCHART.DECISION.ALTERNATIVES');
  });
});

describe('explicit conformance level in a user-symbol document', () => {
  it.each(['typical', 'strict'])('warns at an explicit @conformanceLevel %s', (level) => {
    expect(notices(flowchart(level, true))).toEqual([expect.objectContaining({
      severity: 'warning', code: 'coral.symbol.local.conformance-unsupported',
      range: { start: { line: 3, column: 0, offset: 41 }, end: { line: 3, column: 17, offset: 58 } },
      message: expect.stringContaining(`@conformanceLevel ${level}`) })]);
  });

  it('reports nothing for an omitted or none level, or for unused definitions only', () => {
    expect(notices(flowchart(undefined, true))).toEqual([]);
    expect(notices(flowchart('none', true))).toEqual([]);
    expect(notices(flowchart('strict', false)).map((item) => item.code)).toEqual(['coral.symbol.local.unused']);
  });

  it('never rewrites the header and still projects the document', () => {
    const source = flowchart('strict', true);
    const projected = projectInstalledSourceToSuccessor028(source);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.conformanceLevel).toBe('strict');
  });
});

describe('consumer diagnostic fixtures in the conformance corpus', () => {
  const corpus = join(import.meta.dirname, '../../language/spec/conformance');
  const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8')) as { cases: Array<{
    id: string; source: string; expectedConsumerDiagnostics?: Array<{ code: string; line: number; column: number }> }> };
  const cases = manifest.cases.filter((item) => item.expectedConsumerDiagnostics);

  it('cites both user-symbol notices', () => {
    expect(new Set(cases.flatMap((item) => item.expectedConsumerDiagnostics!.map(({ code }) => code))))
      .toEqual(new Set(['coral.symbol.local.conformance-unsupported', 'coral.symbol.local.unused']));
  });

  it.each(cases.map((item) => [item.id, item] as const))('%s reports its consumer diagnostics on read', (_id, item) => {
    const source = readFileSync(join(corpus, item.source), 'utf8');
    expect(notices(source).map(({ code, range }) => ({ code, line: range.start.line, column: range.start.column })))
      .toEqual(item.expectedConsumerDiagnostics);
  });
});
