import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '../src/theme';

describe('Slice 46 semantic theme contract', () => {
  it('uses the approved quiet-workbench surface and accent roles', () => {
    expect(lightTheme.headerBg).toBe('#ffffff');
    expect(lightTheme.selectionPrimary).toBe('#b94835');
    expect(darkTheme.headerBg).toBe('#1e242b');
    expect(darkTheme.selectionPrimary).toBe('#e07a66');
  });
});
