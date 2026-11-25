import { describe, expect, it } from 'vitest';
import { prepareSpatialScene028, projectInstalledSourceToSuccessor028, successorSourceDisplayWithSemanticPorts028, visualStyle028 } from '@coral-viz/render';
import { authoredEdgeLabelBox028 } from '../../render/src/edgeLabelPlacement028.js';
import { layoutNodes } from '../src/hooks/diagramUtils.js';
import { DEFAULT_LAYOUT_SETTINGS, DEFAULT_DIAGRAM_FONT_SETTINGS } from '@coral-viz/viz';

describe('editor worker authored label geometry', () => {
  it.each((['lowfi', 'hifi'] as const).flatMap(style =>
    (['default', 'explicit'] as const).map(fontPolicy => ({ style, fontPolicy }))))(
    'reserves authored label space in $style with $fontPolicy fonts', async ({ style, fontPolicy }) => {
      const source = '@diagram architecture\napi service as "API" label below offset 12\nstore database\n' +
        'request = api -> store as "Request" label above at 0.25 offset 8\n';
      const meaning = projectInstalledSourceToSuccessor028(source).graph!;
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
      const original = structuredClone(display);
      const visual = visualStyle028(style);
      const styleFontSettings = { ...DEFAULT_DIAGRAM_FONT_SETTINGS, default: { family: visual.fontFamily,
        size: visual.labelSize, weight: style === 'hifi' ? 600 : 500, lineHeight: 1.4 } };
      const fontSettings = fontPolicy === 'default' ? DEFAULT_DIAGRAM_FONT_SETTINGS : styleFontSettings;
      // The controller maps legacy defaults to the current visual font for paint.
      const paintFontSettings = styleFontSettings;
      const result = await layoutNodes(display.nodes, display.edges, 'architecture', DEFAULT_LAYOUT_SETTINGS,
        true, fontSettings, undefined, [], 'load', semanticInterpretations, undefined, style);
      const drawing = { ...display, nodes: display.nodes.map((node) => {
        const laid = result.nodes.find((item) => item.id === node.id)!;
        return { ...node, position: laid.position, dimensions: { width: laid.width!, height: laid.height! } };
      }) };
      const scene = prepareSpatialScene028(drawing, { style, layoutDirection: 'DOWN', fontSettings: paintFontSettings,
        edgeRoutes: new Map([...result.edgeRouting].map(([id, route]) => [id, [route]])) });
      const caption = scene.parts.find((part) => part.id === 'api:label:1')!;
      const label = scene.parts.find((part) => part.id === 'request:label')!;
      const shaft = scene.parts.find((part) => part.id === 'request:shaft')!;
      const api = scene.nodes.find((node) => node.node.id === 'api')!;
      expect(caption.bounds.y).toBeCloseTo(api.y + scene.viewport.shiftY + api.height + 12);
      expect(shaft.geometry.kind).toBe('route');
      if (shaft.geometry.kind !== 'route') throw new Error('Expected generated connector geometry');
      expect(label.bounds).toEqual(authoredEdgeLabelBox028(shaft.geometry.points,
        { side: 'above', at: .25, offset: 8 }, label.bounds.width, label.bounds.height));
      expect(label.geometry).toMatchObject({ kind: 'text',
        labelPlacement: { side: 'above', at: .25, offset: 8 } });
      const apiBody = { x: api.x + scene.viewport.shiftX, y: api.y + scene.viewport.shiftY,
        width: api.width, height: api.height };
      expect(label.bounds.x < apiBody.x + apiBody.width && label.bounds.x + label.bounds.width > apiBody.x &&
        label.bounds.y < apiBody.y + apiBody.height && label.bounds.y + label.bounds.height > apiBody.y,
      'Request label overlaps the API body').toBe(false);
      expect(display.edges[0].routeIntent).toBeUndefined();
      expect(display).toEqual(original);
    });
});
