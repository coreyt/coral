import { describe, expect, it } from 'vitest';
import { render, CoralRenderError, type CoralRenderOptions } from '../src/index.js';

describe('public browser saved-source boundary', () => {
  it.each([
    ['headerless current spelling', 'api service'],
    ['retired kind-first spelling', 'service "API" as api'],
    ['retired graph header', '@graph {"id":"old"}\nservice "API" as api'],
    ['comment then headerless source', '// source\napi service'],
    ['empty source', ''],
    ['blank source', '  \n'],
  ])('refuses %s with a located missing-header diagnostic and no result', async (_name, source) => {
    let result: unknown;
    let caught: unknown;
    try { result = await render(source); } catch (error) { caught = error; }
    expect(result).toBeUndefined();
    expect(caught).toBeInstanceOf(CoralRenderError);
    const error = caught as CoralRenderError;
    expect(error.code).toBe('coral.browser.input.invalid');
    expect(error.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'header.diagram.required',
      line: expect.any(Number), column: expect.any(Number),
      range: expect.objectContaining({ start: expect.objectContaining({
        line: expect.any(Number), column: expect.any(Number), offset: expect.any(Number),
      }) }),
    }));
    expect(error).not.toHaveProperty('graph');
    expect(error).not.toHaveProperty('svg');
  });

  it('refuses the retired preview edition option instead of selecting a second reader', async () => {
    await expect(render('@diagram architecture\napi service',
      { edition: '0.2.8-preview' } as unknown as CoralRenderOptions))
      .rejects.toMatchObject({ code: 'coral.browser.option.invalid' });
  });

  it('refuses a literal Unicode paragraph separator inside a quoted label', async () => {
    const source = '@diagram architecture\napi service as "left\u2029right"\n';
    await expect(render(source)).rejects.toMatchObject({
      code: 'coral.browser.input.invalid',
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'coral.syntax.string.control',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('\u2029'),
        }) }),
      })]),
    });
  });

  it('refuses a sequence message before participant creation at its authored endpoint', async () => {
    const source = '@diagram uml-sequence\nclient participant\nworker participant\n' +
      'early = client -> worker\nspawn = client -.-> worker [create]\n';
    await expect(render(source)).rejects.toMatchObject({
      code: 'coral.browser.input.invalid',
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'coral.sequence.message.outside-participant-lifetime',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('worker', source.indexOf('early =')),
        }) }),
      })]),
    });
  });
});
