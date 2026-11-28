import { describe, expect, it } from 'vitest';
import { HEADER_MANIFEST_028 } from '@coral-viz/language';
import {
  assertRenderableInterpretation028,
  checkInstalledSuccessorSourceConformance028,
  getAvailableNotations028,
  getAvailableNotations0214,
  getAvailableNotations0217,
  installedCatalogSnapshotForEdition,
  notationCatalogIdentity028,
  notationCatalogIdentity0214,
  notationCatalogIdentity0217,
  parseInstalledDocument028,
  parrotfish,
  prepareSpatialScene028,
  projectInstalledSourceToSuccessor028,
  RenderCapabilityError,
  renderInstalledCharacterPreview028,
  renderSvg,
  resolveRenderScene,
  successorSourceDisplayWithSemanticPorts028,
} from '../src/index.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { evaluatePreparedSceneQuality0214 } from '../src/quality/diagramQuality0214.js';

async function renderState0217(source: string, direction: 'RIGHT' | 'DOWN' = 'RIGHT') {
  const parsed = parseInstalledDocument028(source);
  expect(parsed.header.diagnostics).toEqual([]);
  expect(parsed.syntax.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const projected = projectInstalledSourceToSuccessor028(parsed);
  expect(projected.diagnostics).toEqual([]);
  expect(projected.graph).toBeDefined();
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
  const effDir = (display as { layoutOptions028?: { direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP' } }).layoutOptions028?.direction ?? direction;
  const laidHifi = await layoutGraphForSvg(display, {
    direction: effDir,
    svgOptions: { notation: 'uml-state', style: 'hifi', layoutDirection: effDir },
    semanticInterpretations,
  });
  const laidLowfi = await layoutGraphForSvg(display, {
    direction: effDir,
    svgOptions: { notation: 'uml-state', style: 'lowfi', layoutDirection: effDir },
    semanticInterpretations,
  });
  const hifi = renderSvg(laidHifi, { notation: 'uml-state', style: 'hifi', layoutDirection: effDir, edgeRoutes: laidHifi.edgeRoutes, semanticGraph: display, successorSource: projected.graph });
  const lowfi = renderSvg(laidLowfi, { notation: 'uml-state', style: 'lowfi', layoutDirection: effDir, edgeRoutes: laidLowfi.edgeRoutes, semanticGraph: display, successorSource: projected.graph });
  const aneLight = renderSvg(laidHifi, { notation: 'uml-state', renderStyle: 'anemone', theme: 'light', layoutDirection: effDir, edgeRoutes: laidHifi.edgeRoutes, semanticGraph: display, successorSource: projected.graph });
  const aneDark = renderSvg(laidHifi, { notation: 'uml-state', renderStyle: 'ane', theme: 'dark', layoutDirection: effDir, edgeRoutes: laidHifi.edgeRoutes, semanticGraph: display, successorSource: projected.graph });
  const sceneHifi = prepareSpatialScene028(laidHifi, { notation: 'uml-state', style: 'hifi', layoutDirection: effDir, edgeRoutes: laidHifi.edgeRoutes, semanticGraph: display, successorSource: projected.graph });
  const sceneAne = prepareSpatialScene028(laidHifi, { notation: 'uml-state', renderStyle: 'anemone', theme: 'light', layoutDirection: effDir, edgeRoutes: laidHifi.edgeRoutes, semanticGraph: display, successorSource: projected.graph });
  return { parsed, projected, display, laidHifi, laidLowfi, hifi, lowfi, aneLight, aneDark, sceneHifi, sceneAne, effDir };
}

describe('Edition 0.2.17 UML State visual & hierarchical support', () => {
  it('keeps 0.2.8, 0.2.9, and 0.2.14 digests 100% immutable and pins 0.2.17 uml-state@1.1.0 digest', () => {
    for (const [id, entry] of Object.entries(HEADER_MANIFEST_028['0.2.8']!)) {
      expect(notationCatalogIdentity028(id)?.digest, `0.2.8 ${id}`).toBe(entry.catalogs[0]!.digest);
    }
    for (const [id, entry] of Object.entries(HEADER_MANIFEST_028['0.2.14']!)) {
      const got = notationCatalogIdentity0214(id);
      expect(got?.version, `0.2.14 ${id}`).toBe(entry.catalogs[0]!.version);
      expect(got?.digest, `0.2.14 ${id}`).toBe(entry.catalogs[0]!.digest);
    }
    for (const [id, entry] of Object.entries(HEADER_MANIFEST_028['0.2.17']!)) {
      const got = notationCatalogIdentity0217(id);
      expect(got?.version, `0.2.17 ${id}`).toBe(entry.catalogs[0]!.version);
      expect(got?.digest, `0.2.17 ${id}`).toBe(entry.catalogs[0]!.digest);
    }
    expect(getAvailableNotations028().map((n) => n.id)).not.toContain('uml-state');
    expect(getAvailableNotations0214().map((n) => n.id)).not.toContain('uml-state');
    expect(getAvailableNotations0217().map((n) => n.id)).toContain('uml-state');
    expect(getAvailableNotations0217()).toHaveLength(13);
  });

  it('preserves character-only refusal for 0.2.8 and 0.2.14 uml-state documents', async () => {
    for (const src of [
      '@diagram uml-state\ns initial\nIdle state\nf final\ns -> Idle\nIdle -> f\n',
      '@diagram uml-state\n@coralVersion "0.2.14"\ns initial\nIdle state\nf final\ns -> Idle\nIdle -> f\n',
    ]) {
      const graph = parseInstalledDocument028(src).graph!;
      expect(() => assertRenderableInterpretation028(graph.nodes, 'uml-state')).toThrow(RenderCapabilityError);
      expect(() => resolveRenderScene(graph)).toThrow(/character-only-edition/);
      expect(() => renderSvg(graph)).toThrow(/character-only-edition/);
      await expect(layoutGraphForSvg(graph)).rejects.toThrow(/character-only-edition/);
    }
    // 0.2.17 catalog passes interpretation gate directly
    const snap0217 = installedCatalogSnapshotForEdition('uml-state', '0.2.17');
    expect(snap0217.allowedSymbolIds.size).toBe(8);
    expect(() => assertRenderableInterpretation028([{ id: 's', type: 'initial' }], 'uml-state', undefined, snap0217)).not.toThrow();
  });

  it('renders flat state machine with descriptions, inline styles, self-transition, and pseudostates across lowfi/hifi/anemone', async () => {
    const src = [
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      'layout [direction: DOWN]',
      'start initial',
      'Draft state [description: "Authoring"] as "Draft"',
      'check choice',
      'split fork',
      'Legal state as "Legal Review"',
      'Sec state [style: "indigo"] as "Security Review"',
      'merge join',
      'Approved state as "Approved"',
      'done final',
      'n1 note as "Both checks required"',
      'start -> Draft',
      'Draft -> Draft as "autosave"',
      'Draft -> check as "submit"',
      'check -> split as "[valid]"',
      'check -> Draft as "[invalid]"',
      'split -> Legal',
      'split -> Sec',
      'Legal -> merge',
      'Sec -> merge',
      'merge -> Approved',
      'Approved -> done',
      'n1 -.- merge [annotation]',
      '',
    ].join('\n');

    const { hifi, lowfi, aneLight, aneDark, sceneHifi, sceneAne, laidHifi } = await renderState0217(src, 'DOWN');
    expect(hifi).toContain('<svg');
    expect(lowfi).toContain('<svg');
    expect(hifi).toContain('Authoring');
    expect(hifi).toContain('autosave');
    expect(hifi).toContain('>Both<');
    expect(hifi).toContain('>checks<');
    expect(hifi).toContain('>required<');
    // Unlabeled markers should NOT print their raw IDs inside the dot/bullseye/sync bars/choice diamond
    expect(hifi).not.toContain('>start<');
    expect(hifi).not.toContain('>done<');
    expect(hifi).not.toContain('>split<');
    expect(hifi).not.toContain('>merge<');
    expect(hifi).not.toContain('>check<');
    // Final bullseye renders both outline and inner-outline with filled center
    expect(aneLight).toContain('done:inner-outline');
    expect(aneLight).toContain('#047857'); // emerald start dot
    expect(aneLight).toContain('#be123c'); // rose final bullseye
    expect(aneDark).toContain('#34d399');  // dark emerald start dot
    expect(aneDark).toContain('#fb7185');  // dark rose final bullseye

    // Custom parrotfish stroke on final preserves bullseye center fill
    const custom = parrotfish(laidHifi, { name: 'custom-state', extends: 'anemone', nodes: { done: { stroke: '#7c3aed' } } },
      { svgOptions: { notation: 'uml-state', layoutDirection: 'DOWN', edgeRoutes: laidHifi.edgeRoutes } });
    expect(custom.svg).toMatch(/data-coral-part-id="done:inner-outline"[^>]*fill="#7c3aed"/);

    // RIGHT direction renders vertical 10x72 sync bars and labeled choice diamond
    const rightSrc = [
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      'layout [direction: RIGHT]',
      'start initial',
      'split fork',
      'a state as "A"',
      'b state as "B"',
      'merge join',
      'check choice as "Complete?"',
      'done final',
      'start -> split',
      'split -> a',
      'split -> b',
      'a -> merge',
      'b -> merge',
      'merge -> check',
      'check -> done as "yes"',
      'check -> a as "retry"',
    ].join('\n');
    const rightDoc = parseInstalledDocument028(rightSrc);
    const rightProj = projectInstalledSourceToSuccessor028(rightSrc);
    const { display: rightDisp } = successorSourceDisplayWithSemanticPorts028(rightProj.graph!);
    const rightLaid = await layoutGraphForSvg(rightDisp, { notation: 'uml-state', direction: 'RIGHT', successorSource: rightProj.graph });
    const rightSplit = rightLaid.nodes.find((n) => n.id === 'split')!;
    expect(rightSplit.dimensions).toEqual({ width: 10, height: 72 });
    const rightSvg = renderSvg(rightLaid, { notation: 'uml-state', layoutDirection: 'RIGHT', edgeRoutes: rightLaid.edgeRoutes });
    expect(rightSvg).toContain('Complete?');
    expect(rightDoc.syntax.diagnostics).toEqual([]);

    // Geometry invariance between hifi and anemone
    expect(sceneAne.nodes.map((n) => [n.node.id, n.x, n.y, n.width, n.height]))
      .toEqual(sceneHifi.nodes.map((n) => [n.node.id, n.x, n.y, n.width, n.height]));

    // Quality gate
    const qHifi = evaluatePreparedSceneQuality0214(sceneHifi, { direction: 'DOWN' });
    const qAne = evaluatePreparedSceneQuality0214(sceneAne, { direction: 'DOWN' });
    expect(qHifi.tier1.pass, JSON.stringify(qHifi.tier1)).toBe(true);
    expect(qAne.tier1.pass, JSON.stringify(qAne.tier1)).toBe(true);
    expect(qAne.grokability.roleDifferentiationRatio).toBe(1);
    expect(qAne.livingCompositeScore).toBeGreaterThanOrEqual(85);
  });

  it('renders hierarchical composite states (2 levels deep) with solid rounded frames and cross-boundary transitions', async () => {
    const src = [
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      'layout [direction: DOWN]',
      'start initial',
      'Idle state as "Idle"',
      'Active composite as "Active Session" {',
      '  entry initial',
      '  Auth state as "Authenticating"',
      '  Running composite as "Running" {',
      '    rStart initial',
      '    Stream state [description: "Live frames"] as "Streaming"',
      '    Paused state as "Paused"',
      '    rStart -> Stream',
      '    Stream -> Paused as "pause"',
      '    Paused -> Stream as "resume"',
      '  }',
      '  exit final',
      '  entry -> Auth',
      '  Auth -> Running as "ok"',
      '  Running -> exit as "close"',
      '}',
      'Stopped final',
      'start -> Idle',
      'Idle -> Active as "connect"',
      'Active.Running.Paused -> Idle as "abort"',
      'Active -> Stopped as "shutdown"',
      '',
    ].join('\n');

    const { aneLight, sceneAne } = await renderState0217(src, 'DOWN');
    expect(aneLight).toContain('Active Session');
    expect(aneLight).toContain('Running');
    expect(aneLight).toContain('Live frames');
    // Composite state container should have a solid border (no stroke-dasharray on Active:outline)
    const activeOutline = sceneAne.parts.find((p) => p.id === 'Active:outline');
    expect(activeOutline?.geometry.kind === 'stencil-path' ? activeOutline.geometry.strokeDasharray : undefined).toBeUndefined();
    const q = evaluatePreparedSceneQuality0214(sceneAne, { direction: 'DOWN' });
    expect(q.tier1.pass, JSON.stringify(q.tier1)).toBe(true);
    expect(q.grokability.nestedGroupsDistinguished).toBe(true);
  });

  it('evaluates U2 bounded 0.2.17 UML State ruleset with positive and negative evidence', () => {
    const valid = [
      '@diagram uml-state',
      '@coralVersion "0.2.17"',
      's initial',
      'Idle state',
      'c choice',
      'f fork',
      'a state',
      'b state',
      'j join',
      'e final',
      'n note as "Info"',
      's -> Idle',
      'Idle -> c',
      'c -> f',
      'c -> e',
      'f -> a',
      'f -> b',
      'a -> j',
      'b -> j',
      'j -> e',
      'n -.- e [annotation]',
      '',
    ].join('\n');
    const ok = checkInstalledSuccessorSourceConformance028(valid, { requestedLevel: 'strict' });
    expect(ok.diagnostics).toEqual([]);
    expect(ok.report?.claimStatus).toBe('conformant');
    expect(ok.report?.unverifiedObligations).toEqual([]);
    expect(ok.report?.findings.filter((f) => f.severity === 'error')).toEqual([]);

    const badInitialIncoming = '@diagram uml-state\n@coralVersion "0.2.17"\ns initial\na state\nf final\ns -> a\na -> s\na -> f\n';
    expect(checkInstalledSuccessorSourceConformance028(badInitialIncoming, { requestedLevel: 'strict' }).report?.findings.map((f) => f.id))
      .toContain('CORAL.UML.STATE.INITIAL.NO_INCOMING');

    const badInitialOut = '@diagram uml-state\n@coralVersion "0.2.17"\ns initial\na state\nb state\ns -> a\ns -> b\n';
    expect(checkInstalledSuccessorSourceConformance028(badInitialOut, { requestedLevel: 'strict' }).report?.findings.map((f) => f.id))
      .toContain('CORAL.UML.STATE.INITIAL.OUTGOING_REQUIRED');

    const badFinalOut = '@diagram uml-state\n@coralVersion "0.2.17"\ns initial\na state\nf final\ns -> a\na -> f\nf -> a\n';
    expect(checkInstalledSuccessorSourceConformance028(badFinalOut, { requestedLevel: 'strict' }).report?.findings.map((f) => f.id))
      .toContain('CORAL.UML.STATE.FINAL.NO_OUTGOING');

    const badChoice = '@diagram uml-state\n@coralVersion "0.2.17"\ns initial\nc choice\na state\ns -> c\nc -> a\n';
    expect(checkInstalledSuccessorSourceConformance028(badChoice, { requestedLevel: 'strict' }).report?.findings.map((f) => f.id))
      .toContain('CORAL.UML.STATE.CHOICE.BRANCHES');

    const badForkJoin = '@diagram uml-state\n@coralVersion "0.2.17"\ns initial\nf fork\nj join\na state\ns -> f\nf -> a\na -> j\n';
    const fjIds = checkInstalledSuccessorSourceConformance028(badForkJoin, { requestedLevel: 'strict' }).report?.findings.map((f) => f.id);
    expect(fjIds).toContain('CORAL.UML.STATE.FORK_JOIN.DEGREE');
  });

  it('keeps flat 0.2.17 state chains character-renderable and fails closed with character.state.source-construct on visual-only constructs', async () => {
    const flat0217 = '@diagram uml-state\n@coralVersion "0.2.17"\ns initial\nIdle state\nf final\ns -> Idle\nIdle -> f\n';
    const preview = await renderInstalledCharacterPreview028(flat0217, { columns: 80 });
    expect(preview.text).toContain('CHAR-PREVIEW/1 uml-state');

    const described0217 = '@diagram uml-state\n@coralVersion "0.2.17"\ns initial\nIdle state [description: "Waiting"]\nf final\ns -> Idle\nIdle -> f\n';
    await expect(renderInstalledCharacterPreview028(described0217, { columns: 80 })).rejects.toMatchObject({
      code: 'character.state.source-construct',
    });
  });
});
