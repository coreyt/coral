import { describe, expect, it } from 'vitest';
import { defineCustomElement, renderTo, scan } from '../src/index.js';

describe('DOM helpers without a DOM', () => {
  it('report environment.unsupported', async () => {
    expect(() => defineCustomElement()).toThrow(expect.objectContaining({ code: 'coral.browser.environment.unsupported' }));
    await expect(renderTo('#x')).rejects.toMatchObject({ code: 'coral.browser.environment.unsupported' });
    await expect(scan()).rejects.toMatchObject({ code: 'coral.browser.environment.unsupported' });
  });
});
