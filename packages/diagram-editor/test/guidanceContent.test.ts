import { describe, expect, it } from 'vitest';
import {
  EXPECTED_RELEASE_VERSION,
  HELP_SECTIONS,
  aboutLicences,
  helpSections,
  readDisplayIdentity,
  validateReleaseIdentity,
} from '../src/guidanceContent';

describe('guidance content', () => {
  it('covers every required in-app Help fact through typed blocks', () => {
    const text = JSON.stringify(HELP_SECTIONS);
    for (const fact of [
      'Create Node', 'DSL editor', 'diagram canvas', 'properties', 'diagnostics',
      'local', 'recovery', 'online-hosted', 'AI', 'privacy', 'license',
      'support', 'NVDA', 'VoiceOver', 'experimental', 'untested',
    ]) expect(text.toLowerCase()).toContain(fact.toLowerCase());
    expect(text).not.toContain('deferred to 0.2.10');
    expect(HELP_SECTIONS.flatMap((section) => section.blocks)
      .every((block) => ['paragraph', 'steps', 'table', 'shortcutList', 'callout', 'link'].includes(block.kind)))
      .toBe(true);
  });

  it('links the on-device Use pages and states the model\'s status only in a build that has it (R-066 AC-7)', () => {
    const off = JSON.stringify(helpSections(false));
    expect(off).toContain('This build has no AI features or composer voice input.');
    expect(off).not.toContain('on-device');
    const on = helpSections(true);
    const section = on.find((item) => item.id === 'on-device')!;
    expect(section.blocks).toEqual(expect.arrayContaining([
      { kind: 'callout', tone: 'note', text: 'The on-device editing model is experimental. It requires a network connection to download. Its requests run in this browser and are not sent anywhere.' },
      { kind: 'link', href: '/coral/docs/use/explain/on-device-editing-model', text: 'Understanding the on-device editing model' },
      { kind: 'link', href: '/coral/docs/use/how-to/edit-with-the-on-device-model', text: 'How to edit with the on-device model' },
    ]));
    expect(aboutLicences(false)).toEqual([['Transformers.js', 'Apache-2.0'], ['ONNX Runtime Web', 'MIT']]);
    expect(aboutLicences(true)[0]).toEqual(['On-device editing model (separate download)', 'LFM Open License v1.0, not Apache-2.0']);
  });

  it('accepts only canonical display identity for this release', () => {
    const valid = { product: 'coral', version: EXPECTED_RELEASE_VERSION, commit: 'a'.repeat(40) };
    expect(validateReleaseIdentity(valid)).toEqual(valid);
    for (const value of [
      undefined,
      { ...valid, product: 'other' },
      { ...valid, version: '0.2.4' },
      { ...valid, commit: '0'.repeat(40) },
      { ...valid, commit: 'ABC' },
    ]) expect(validateReleaseIdentity(value)).toBeNull();
  });

  it('never guesses a missing or conflicting display identity', () => {
    const previous = globalThis.__CORAL_RELEASE_IDENTITY__;
    try {
      delete globalThis.__CORAL_RELEASE_IDENTITY__;
      expect(readDisplayIdentity()).toBeNull();
      globalThis.__CORAL_RELEASE_IDENTITY__ = {
        product: 'coral', version: '0.2.4', commit: 'a'.repeat(40),
      };
      expect(readDisplayIdentity()).toBeNull();
    } finally {
      globalThis.__CORAL_RELEASE_IDENTITY__ = previous;
    }
  });
});
