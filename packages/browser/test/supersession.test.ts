// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const pending = vi.hoisted(() => [] as Array<{ source: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }>);
vi.mock('../src/render.js', () => ({
  render: (source: string) => new Promise((resolve, reject) => pending.push({ source, resolve, reject })),
}));

import { drawnText029, surface029 as surface } from './support/surface029.js';
import { CoralRenderError, renderTo, defineCustomElement, type CoralDiagramElement,
  type CoralRenderOptions } from '../src/index.js';

const SVG = (label: string): string => `<svg xmlns="http://www.w3.org/2000/svg"><title>${label}</title><text>${label}</text></svg>`;
const result = (label: string) => ({ svg: SVG(label), graph: { nodes: [], edges: [] }, diagnostics: [] });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => { pending.length = 0; document.body.replaceChildren(); });

describe('render supersession', () => {
  it('keeps the newest custom-element presentation after late success and failure', async () => {
    defineCustomElement('superseded-options-diagram');
    const element = document.createElement('superseded-options-diagram') as CoralDiagramElement;
    element.source = 'unchanged source';
    document.body.append(element);
    element.renderOptions = { style: 'hifi', theme: 'dark' };
    pending[1].resolve(result('new presentation'));
    await flush();
    pending[0].resolve(result('old presentation'));
    await flush();
    expect(drawnText029(element)).toBe('new presentationnew presentation');
    element.renderOptions = { style: 'lowfi' };
    element.renderOptions = { style: 'hifi' };
    pending[3].resolve(result('latest presentation'));
    await flush();
    pending[2].reject(new Error('old presentation failure'));
    await flush();
    expect(drawnText029(element)).toBe('latest presentationlatest presentation');
    expect(element.shadowRoot?.querySelector('[role="alert"]')).toBeNull();
    expect(element.source).toBe('unchanged source');
  });

  it.each<[string, CoralRenderOptions, CoralRenderOptions]>([
    ['style', { style: 'lowfi' }, { style: 'hifi' }],
    ['theme', { theme: 'light' }, { theme: 'dark' }],
    ['direction', { direction: 'RIGHT' }, { direction: 'DOWN' }],
    ['title', { title: 'Before' }, { title: 'After' }],
  ])('supersedes same-source %s changes, including late failure', async (_name, before, after) => {
    const target = document.createElement('div');
    document.body.append(target);
    const old = renderTo(target, 'same source', before);
    const current = renderTo(target, 'same source', after);
    pending[1].resolve(result('current presentation'));
    await current;
    pending[0].resolve(result('stale presentation'));
    await old;
    expect(drawnText029(target)).toBe('current presentationcurrent presentation');

    const failed = renderTo(target, 'same source', before);
    const newest = renderTo(target, 'same source', after);
    pending[3].resolve(result('newest presentation'));
    await newest;
    pending[2].reject(new Error('late presentation failure'));
    await expect(failed).rejects.toMatchObject({ code: 'coral.browser.render.failed' });
    expect(drawnText029(target)).toBe('newest presentationnewest presentation');
    expect(surface(target).querySelector('[role="alert"]')).toBeNull();
    expect(target.hasAttribute('aria-busy')).toBe(false);
  });

  it('never lets a stale success or failure overwrite a newer render', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const slow = renderTo(target, 'slow');
    const fast = renderTo(target, 'fast');
    pending[1].resolve(result('fast'));
    await fast;
    expect(drawnText029(target)).toBe('fastfast');

    pending[0].resolve(result('slow'));
    await slow;
    expect(drawnText029(target)).toBe('fastfast');

    const staleFailure = renderTo(target, 'broken');
    const newest = renderTo(target, 'newest');
    expect(target.getAttribute('aria-busy')).toBe('true');
    pending[2].reject(new CoralRenderError('coral.browser.input.invalid', 'stale'));
    await expect(staleFailure).rejects.toMatchObject({ code: 'coral.browser.input.invalid' });
    expect(target.getAttribute('aria-busy')).toBe('true');
    expect(target.getAttribute('data-coral-state')).toBe('rendering');
    expect(surface(target).querySelector('[role="alert"]')).toBeNull();
    pending[3].resolve(result('newest'));
    await newest;
    expect(drawnText029(target)).toBe('newestnewest');
    expect(target.hasAttribute('aria-busy')).toBe(false);
  });

  it('refuses SVG that does not parse, with an inline error', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const outcome = renderTo(target, 'bad');
    await flush();
    pending[0].resolve({ ...result('x'), svg: '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>' });
    await expect(outcome).rejects.toMatchObject({ code: 'coral.browser.render.failed' });
    expect(surface(target).querySelector('[role="alert"]')!.getAttribute('data-coral-error-code')).toBe('coral.browser.render.failed');
    expect(surface(target).querySelector('svg')).toBeNull();
  });

  it('wraps an unexpected failure in the public error type', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const outcome = renderTo(target, 'boom');
    pending[0].reject(new TypeError('boom'));
    const error = await outcome.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CoralRenderError);
    expect(error).toMatchObject({ code: 'coral.browser.render.failed', cause: expect.any(TypeError) });
  });
});
