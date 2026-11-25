import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { verifyPortableSuccessorSource028 } from '../src/successorPortableExport028.js';
import { checkInstalledSuccessorSourceConformance028 } from '../src/successorSourceConformance028.js';
import { checkGraphConformance028 } from '../src/graphConformance028.js';

function fixture(portId = 'outbound') {
  const meaning = projectInstalledSourceToSuccessor028('@diagram architecture\napi service {\n' +
    '  outbound port [direction: out, anchor: E]\n}\nstore database\nrequest = api -> store\n').graph!;
  meaning.edges[0].routeIntent = { waypoints: [{ id: 'bend', placement: { kind: 'relative',
    anchor: { kind: 'port', nodeId: 'api', portId }, offset: { x: 20, y: 0 } } }] };
  return successorSourceDisplayWithSemanticPorts028(meaning);
}
const request = { requestedLevel: 'none' as const, operation: 'check' as const };
const portPath = '/edges/0/routeIntent/waypoints/0/placement/anchor/portId';

describe('successor semantic-route-port staging validation', () => {
  it.each(['outbound', 'out'])('accepts the proven authored/catalog semantic anchor %s', (portId) => {
    const { display, semanticInterpretations } = fixture(portId);
    const report = checkGraphConformance028(display, request, [], undefined, { semanticInterpretations });
    expect(report.findings.filter((finding) => finding.category === 'integrity')).toEqual([]);
  });

  it('retains the exact missing-port error', () => {
    const { display, semanticInterpretations } = fixture('missing');
    const report = checkGraphConformance028(display, request, [], undefined, { semanticInterpretations });
    expect(report.findings).toContainEqual(expect.objectContaining({
      id: 'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE', category: 'integrity', path: portPath,
    }));
  });

  it('does not supersede plain GraphIR3 geometric-port validation without successor evidence', () => {
    const { display } = fixture('out');
    const report = checkGraphConformance028(display, request);
    expect(report.findings).toContainEqual(expect.objectContaining({ id: 'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE', path: portPath }));
  });

  it('does not use a stale interpretation to suppress route findings', () => {
    const { display, semanticInterpretations } = fixture();
    display.nodes[0].symbol = 'arch-database';
    const report = checkGraphConformance028(display, request, [], undefined, { semanticInterpretations });
    expect(report.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE', 'CORAL.SEMANTIC_SIDECAR.MISMATCH',
    ]));
  });

  it('retains independent route errors next to a valid semantic-port anchor', () => {
    const { display, semanticInterpretations } = fixture();
    display.edges[0].routeIntent!.waypoints.push(
      { id: 'missing-port', placement: { kind: 'relative', anchor: { kind: 'port', nodeId: 'api', portId: 'missing' }, offset: { x: 1, y: 0 } } },
      { id: 'missing-node', placement: { kind: 'relative', anchor: { kind: 'port', nodeId: 'absent', portId: 'outbound' }, offset: { x: 1, y: 0 } } },
      { id: 'bend', placement: { kind: 'absolute', position: { x: 10, y: 20 } } },
    );
    const report = checkGraphConformance028(display, request, [], undefined, { semanticInterpretations });
    const integrity = report.findings.filter((finding) => finding.category === 'integrity');
    expect(integrity).not.toContainEqual(expect.objectContaining({ id: 'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE', path: portPath }));
    expect(integrity).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'GRAPHIR.INVALID_ROUTE_PORT_REFERENCE', path: portPath.replace('/0/placement', '/1/placement') }),
      expect.objectContaining({ id: 'GRAPHIR.INVALID_ROUTE_NODE_REFERENCE' }),
      expect.objectContaining({ id: 'GRAPHIR.DUPLICATE_WAYPOINT_ID' }),
    ]));
  });
  it.each([true, false])('exports authored/catalog source port routes with node-local declaration=%s', (authored) => {
    const source = '@diagram architecture\n' + (authored ? 'api service {\n  outbound port [direction: out, anchor: E]\n}\n' : 'api service\n') +
      'store database\nrequest = api -> store\nroute edge request {\n' +
      `  bend = waypoint relative to port api:${authored ? 'outbound' : 'out'} offset (20, 0)\n}\n`;
    const portable = verifyPortableSuccessorSource028(source);
    expect(portable.diagnostics).toEqual([]);
    expect(portable.graph!.edges[0].routeIntent!.waypoints[0].placement).toMatchObject({ kind: 'relative',
      anchor: { kind: 'port', nodeId: 'api', portId: authored ? 'outbound' : 'out' } });
  });

  it('locates the actual missing source route port without a duplicate diagnostic', () => {
    const source = '@diagram architecture\napi service\nstore database\nrequest = api -> store\nroute edge request {\n' +
      '  bend = waypoint relative to port api:absent offset (20, 0)\n}\n';
    const portable = verifyPortableSuccessorSource028(source);
    expect(portable.graph).toBeUndefined();
    expect(portable.diagnostics).toHaveLength(1);
    expect(portable.diagnostics[0].code).toBe('GRAPHIR.INVALID_ROUTE_PORT_REFERENCE');
    const range = portable.diagnostics[0].range!;
    expect(source.slice(range.start.offset, range.end.offset)).toBe('absent');
  });

  it('attributes same-named grouped route waypoints to their own source ports', () => {
    const source = '@diagram architecture\n' + ['first', 'second'].map((id) =>
      `${id} group {\n  api service\n  store database\n  request = api -> store\n  route edge request {\n` +
      `    bend = waypoint relative to port api:${id}Missing offset (20, 0)\n  }\n}\n`).join('');
    const portable = verifyPortableSuccessorSource028(source);
    expect(portable.diagnostics).toHaveLength(2);
    expect(portable.diagnostics.map(({ range }) => source.slice(range!.start.offset, range!.end.offset)))
      .toEqual(['firstMissing', 'secondMissing']);
  });

  it('retains real port-anchor integrity failures when the route ID itself resolves', () => {
    const source = '@diagram architecture\napi service {\n  outbound port [direction: out, anchor: missingPin]\n}\n' +
      'store database\nrequest = api -> store\nroute edge request {\n' +
      '  bend = waypoint relative to port api:outbound offset (20, 0)\n}\n';
    const checked = checkInstalledSuccessorSourceConformance028(source);
    expect(checked.report!.findings).toContainEqual(expect.objectContaining({ id: 'coral.port.anchor.symbol-unknown', category: 'integrity' }));
    expect(verifyPortableSuccessorSource028(source).graph).toBeUndefined();
  });

});
