import { describe, expect, it } from 'vitest';
import { getAvailableNotations028, notationRegistry } from '../src/notations/index.js';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplay028 } from '../src/successorSourceDisplay028.js';
import { resolveSuccessorGraphNodes028 } from '../src/successorInterpretation028.js';
import { checkInstalledSuccessorSourceConformance028 } from '../src/successorSourceConformance028.js';
import { verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';
import { assertRenderableInterpretation028, RenderCapabilityError, resolveRenderScene } from '../src/scene.js';
import { renderSvg } from '../src/svg/serialize.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { sourceSpatialFailureDiagnostics028 } from '../src/sourceSpatialFailureDiagnostics028.js';

const source = '@diagram uml-state\nstart initial\nIdle state\nfinish final\na = start -> Idle\nb = Idle -> finish\n';
const code = 'render.capability.character-only-edition';

describe('Slice 35 state visual capability isolation', () => {
  it('keeps the installed state source edition out of visual creation choices', () => {
    expect(notationRegistry.has('uml-state')).toBe(true);
    const offered = getAvailableNotations028().map(({ id }) => id);
    expect(offered).toHaveLength(10);
    expect(offered).not.toContain('uml-state');
    expect(offered).not.toContain('erd');
    expect(offered).toContain('uml-class');
    expect(offered).toContain('uml-sequence');
  });

  it('refuses state at every shared SVG scene boundary with a typed capability', async () => {
    const graph = parseInstalledDocument028(source).graph!;
    const refusal = { diagnostics: [expect.objectContaining({ code })] };
    for (const render of [
      () => assertRenderableInterpretation028(graph.nodes, 'uml-state'),
      () => resolveRenderScene(graph),
      () => renderSvg(graph),
    ]) {
      expect(render).toThrow(RenderCapabilityError);
      expect(render).toThrow(expect.objectContaining(refusal));
    }
    await expect(layoutGraphForSvg(graph)).rejects.toMatchObject(refusal);
  });

  it('locates source-based SVG capability failures at the state edition token', () => {
    const parsed = parseInstalledDocument028(source);
    const cause = new RenderCapabilityError([{ code, message: 'State is character-only.' }]);
    expect(sourceSpatialFailureDiagnostics028(cause, parsed)).toEqual([
      expect.objectContaining({ code, severity: 'error',
        range: parsed.header.diagramTypeRange, position: parsed.header.diagramTypeRange?.start }),
    ]);
  });

  it('retains state semantic carriers, paired U1, partial U2 and portable source', () => {
    const parsed = parseInstalledDocument028(source);
    const projected = projectInstalledSourceToSuccessor028(parsed);
    expect(projected.diagnostics).toEqual([]);
    const graph = projected.graph!;
    const before = structuredClone(graph);
    const display = successorSourceDisplay028(graph);
    expect(display.nodes).toEqual(parsed.graph?.nodes);
    expect(display.metadata).toEqual({ notation: 'uml-state' });
    expect(display.edges.map(({ id, source, target, type }) => ({ id, source, target, type })))
      .toEqual(parsed.graph?.edges.map(({ id, source, target, type }) => ({ id, source, target, type })));
    expect([...resolveSuccessorGraphNodes028(graph).values()].every(({ status }) => status === 'generic')).toBe(true);
    const checked = checkInstalledSuccessorSourceConformance028(source, { requestedLevel: 'strict' });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.report?.findings.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(checked.report?.claimStatus).toBe('unverified');
    expect(checked.report?.unverifiedObligations.length).toBeGreaterThan(0);
    expect(verifyPortableSuccessorSource028(source)).toMatchObject({ graph, diagnostics: [] });
    expect(graph).toEqual(before);
    expect(parsed.header.source).toBe(source);
  });
});
