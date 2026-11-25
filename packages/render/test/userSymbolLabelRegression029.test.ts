import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderSvg } from '../src/index.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';

// C4 revision 5 regression proof (c4-design.md "Reservation in layout", rule
// 8): documents without a reserved user-symbol label keep byte-identical SVG.
// The digests were recorded from the renderer before the reservation landed
// (sequence and ERD fixtures take other display paths and are covered elsewhere).

const fixtures = new URL('../../browser/test/fixtures/acceptance028/', import.meta.url);
const CENTER_ONLY = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  size 60 x 40', '  label center', '  outline ellipse', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'p service', 'a service [symbol: "local.probe"] as "Auth gateway"', 'q service', 'p -> a', 'a -> q',
  'p -> q', ''].join('\n');

const SOURCES029: ReadonlyArray<readonly [string, string]> = [
  ...readdirSync(fixtures).filter((name) => name.endsWith('.coral') && !name.startsWith('uml-sequence') && !name.startsWith('erd-'))
    .sort().map((name) => [name, readFileSync(new URL(name, fixtures), 'utf8')] as const),
  ['center-only-user-symbol', CENTER_ONLY],
];

async function digest029(source: string, direction: 'RIGHT' | 'DOWN'): Promise<string> {
  try {
    const graph = projectInstalledSourceToSuccessor028(source).graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
    const laidOut = await layoutGraphForSvg(display, { direction, semanticInterpretations });
    const svg = renderSvg(laidOut, { edgeRoutes: laidOut.edgeRoutes, layoutDirection: direction,
      semanticGraph: display, successorSource: graph });
    return createHash('sha256').update(svg).digest('hex').slice(0, 16);
  } catch (error) {
    return `error: ${(error as Error).message.slice(0, 80)}`;
  }
}

const RECORDED: Record<string, string> = {
  // 0.2.11 ADR D1.1: deterministic BRANDES_KOEPF + compact hifi/DOWN side-captions + batchRouter0211 baseline.
  'architecture-ports.coral RIGHT': '16c65a414d9d649e',
  'architecture-ports.coral DOWN': '3ce89624ff1648c0',
  'block-branch.coral RIGHT': '25804fb1665b829c',
  'block-branch.coral DOWN': '493b928b73fa9007',
  'block-cycle.coral RIGHT': '3151f9cd5f461fde',
  'block-cycle.coral DOWN': 'b08adae332ec43d8',
  'block-idle-anchors.coral RIGHT': '610a38120cc3b865',
  'block-idle-anchors.coral DOWN': '610a38120cc3b865',
  'block-ports.coral RIGHT': '3a2df3d736967465',
  'block-ports.coral DOWN': '44ed46b0575ee119',
  'bpmn-branch.coral RIGHT': '80e7c712a5064fba',
  'bpmn-branch.coral DOWN': 'aa15147422fa4ee2',
  'bpmn-event.coral RIGHT': 'ddab4f633854eae9',
  'bpmn-event.coral DOWN': '0ecf2392552025ed',
  'bpmn-loop.coral RIGHT': '3afce7ff2e0b81e5',
  'bpmn-loop.coral DOWN': 'e6c597effcd3a3d7',
  'flowchart-branch.coral RIGHT': '125d67fd150b3353',
  'flowchart-branch.coral DOWN': '316975542c33cdf4',
  'flowchart-cycle.coral RIGHT': 'd07ce60977320aa2',
  'flowchart-cycle.coral DOWN': '3944b8848a51298f',
  'flowchart-draft.coral RIGHT': '2545dbcbed50ab51',
  'flowchart-draft.coral DOWN': '49ba660b50f55a75',
  'flowchart-proximity.coral RIGHT': '8675d6570db39957',
  'flowchart-proximity.coral DOWN': '2eb9834ed8c3bc36',
  'uml-class-chain.coral RIGHT': '8c43e8ebe074a40e',
  'uml-class-chain.coral DOWN': '8679c3285d00fcaa',
  'uml-class-crowded.coral RIGHT': 'error: Classifier Document EAST side needs 140px for 6 open triangle heads; has 120px',
  'uml-class-crowded.coral DOWN': '5d2012a246e91a0e',
  'uml-class-fork.coral RIGHT': '703c9631d1c2f634',
  'uml-class-fork.coral DOWN': '6c628d5293796e54',
  'uml-class-mixed-anchors.coral RIGHT': '794a0b62a34c264b',
  'uml-class-mixed-anchors.coral DOWN': '685c1c14b72e796f',
  'uml-class-named.coral RIGHT': '0f903df38fb9266d',
  'uml-class-named.coral DOWN': 'e6087f57e4504bbb',
  'center-only-user-symbol RIGHT': '0f571f84ca9038c6',
  'center-only-user-symbol DOWN': '80928f1541a7d654',
};

describe('documents without a reserved user-symbol label are unchanged', () => {
  it.each(SOURCES029.flatMap(([name, source]) => (['RIGHT', 'DOWN'] as const)
    .map((direction) => [`${name} ${direction}`, source, direction] as const)))('%s', async (key, source, direction) => {
    expect(await digest029(source, direction)).toBe(RECORDED[key]);
  });
});
