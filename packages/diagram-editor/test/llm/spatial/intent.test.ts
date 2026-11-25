// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { recognizeSpatialRequest } from '../../../src/llm/spatial/intent';

describe('recognizeSpatialRequest', () => {
  it('recognizes relative, boundary, and arrangement grammar', () => {
    expect(recognizeSpatialRequest('Move Database above api')).toMatchObject({
      classification: 'spatial-only',
      command: { kind: 'relative', subject: { text: 'Database' }, relation: 'above', target: { text: 'api' } },
    });
    expect(recognizeSpatialRequest('put cache on the right side of the diagram')).toMatchObject({
      command: { kind: 'boundary', subject: { text: 'cache' }, side: 'right', scope: { kind: 'diagram' } },
    });
    expect(recognizeSpatialRequest('place worker at the top within "Platform"')).toMatchObject({
      command: { kind: 'boundary', side: 'top', scope: { kind: 'group', reference: { text: 'Platform' } } },
    });
    expect(recognizeSpatialRequest('arrange api, db, and cache in a row right to left')).toMatchObject({
      command: {
        kind: 'arrange',
        members: { kind: 'explicit', references: [{ text: 'api' }, { text: 'db' }, { text: 'cache' }] },
        axis: 'row', direction: 'right-to-left',
      },
    });
    expect(recognizeSpatialRequest('arrange children of platform as a column')).toMatchObject({
      command: { kind: 'arrange', members: { kind: 'group', reference: { text: 'platform' } }, axis: 'column', direction: 'top-to-bottom' },
    });
  });

  it('lexes quoted references and reports exact mixed-clause ranges', () => {
    const text = 'rename C; move "A and B" above api.\n';
    const result = recognizeSpatialRequest(text);
    expect(result.classification).toBe('mixed');
    expect(result.command).toMatchObject({ subject: { text: 'A and B' }, target: { text: 'api' } });
    expect(result.consumedRanges).toEqual([{ start: 10, end: 34 }]);
    expect(text.slice(10, 34)).toBe('move "A and B" above api');
  });

  it('does not guess through prose, compound commands, or malformed quotes', () => {
    for (const text of [
      'move A above B and rename C',
      'move A above B; move C below D',
      'move "unterminated above api',
      'arrange api and db in a row top to bottom',
      'move it above api',
      'arrange api and db and cache in a row',
      'arrange api, and db, and cache in a row',
      'arrange api, db, in a row',
    ]) {
      expect(recognizeSpatialRequest(text)).toMatchObject({
        classification: 'unsupported',
        diagnostics: [{ code: 'spatial.unsupported' }],
      });
    }
    expect(recognizeSpatialRequest('rename the database')).toEqual({
      classification: 'non-spatial', consumedRanges: [], diagnostics: [],
    });
  });

  it('accepts the complete lexical boundary and direction matrix', () => {
    expect(recognizeSpatialRequest('move "A \\"quoted\\" node" to the left of api')).toMatchObject({
      classification: 'spatial-only', command: { subject: { text: 'A "quoted" node' }, relation: 'left-of' },
    });
    expect(recognizeSpatialRequest('put db below api!')).toMatchObject({ command: { relation: 'below' } });
    expect(recognizeSpatialRequest('place db to the right of api')).toMatchObject({ command: { relation: 'right-of' } });
    expect(recognizeSpatialRequest('place db on the bottom')).toMatchObject({ command: { side: 'bottom', scope: { kind: 'diagram' } } });
    expect(recognizeSpatialRequest('arrange api and db into a column bottom to top')).toMatchObject({
      command: { axis: 'column', direction: 'bottom-to-top' },
    });
    expect(recognizeSpatialRequest('arrange api, db, cache as row')).toMatchObject({
      command: { axis: 'row', direction: 'left-to-right' },
    });
    const unicode = '😀 rename;\r\nmove db above api';
    const result = recognizeSpatialRequest(unicode);
    const start = unicode.indexOf('move');
    expect(result).toMatchObject({ classification: 'mixed', consumedRanges: [{ start, end: unicode.length }] });

    for (const verb of ['move', 'put', 'place']) {
      for (const [phrase, relation] of [['above', 'above'], ['below', 'below'], ['left of', 'left-of'], ['to the left of', 'left-of'], ['right of', 'right-of'], ['to the right of', 'right-of']] as const) {
        expect(recognizeSpatialRequest(`${verb} db ${phrase} api`)).toMatchObject({ command: { kind: 'relative', relation } });
      }
    }
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      expect(recognizeSpatialRequest(`put db at the ${side} side of the diagram`)).toMatchObject({ command: { kind: 'boundary', side } });
    }
    for (const separator of [';', '\n', '\r', '\u2028', '\u2029']) {
      expect(recognizeSpatialRequest(`rename api${separator}move db above api`)).toMatchObject({ classification: 'mixed' });
    }
  });
});
