import { ON_DEVICE_MODEL_AVAILABLE } from './releaseFeatures029';

export const EXPECTED_RELEASE_VERSION = '0.2.17';

/** The Use pages for the on-device editing model; the first owns its facts (R-066 AC-7). */
export const ON_DEVICE_USE_PAGES = {
  explain: { href: '/coral/docs/use/explain/on-device-editing-model', text: 'Understanding the on-device editing model' },
  howTo: { href: '/coral/docs/use/how-to/edit-with-the-on-device-model', text: 'How to edit with the on-device model' },
} as const;

export interface ReleaseIdentity {
  product: 'coral';
  version: string;
  commit: string;
}

declare global {
  var __CORAL_RELEASE_IDENTITY__: ReleaseIdentity | undefined;
}

export type GuidanceBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'steps'; items: readonly string[] }
  | { kind: 'table'; rows: readonly (readonly [string, string])[] }
  | { kind: 'shortcutList'; items: readonly (readonly [string, string])[] }
  | { kind: 'callout'; tone: 'note' | 'tip' | 'warning' | 'danger'; text: string }
  | { kind: 'link'; href: string; text: string };

export interface GuidanceSection {
  id: string;
  title: string;
  blocks: readonly GuidanceBlock[];
}

/** Help for a build with or without the on-device editing model. */
export function helpSections(onDevice: boolean): readonly GuidanceSection[] {
  return [
  {
    id: 'regions', title: 'Interface regions', blocks: [
      { kind: 'paragraph', text: 'Use the DSL editor, diagram canvas, properties panel and diagnostics to inspect and edit one local document.' },
    ],
  },
  {
    id: 'shortcuts', title: 'Keyboard shortcuts', blocks: [
      { kind: 'shortcutList', items: [
        ['Command palette', 'Ctrl/Command+K'], ['Create Node', 'Ctrl/Command+Alt+N'],
        ['Create Edge', 'Ctrl/Command+Alt+E'], ['Save', 'Ctrl/Command+S'],
        ['Undo', 'Ctrl/Command+Z'], ['Redo', 'Ctrl/Command+Shift+Z'],
        ['Reflow layout', 'Ctrl/Command+Shift+L'], ['Preferences', 'Ctrl/Command+,'],
        ['Leave the source editor', 'Escape, then Tab or Shift+Tab'],
      ] },
    ],
  },
  {
    id: 'storage', title: 'Storage, privacy, and network use', blocks: [
      { kind: 'paragraph', text: 'Documents, recovery data and settings stay in this browser or in files you save.' },
      { kind: 'callout', tone: 'warning', text: onDevice
        ? 'Coral is an online-hosted application. The opt-in on-device editing model downloads once and runs in this browser; provider AI features and composer voice input are not available.'
        : 'Coral is an online-hosted application. This build has no AI features or composer voice input.' },
      { kind: 'paragraph', text: 'Coral does not send diagrams to AI providers. Clearing site data removes Coral-owned local storage and recovery data.' },
    ],
  },
  ...(onDevice ? [{
    id: 'on-device', title: 'On-device editing model', blocks: [
      { kind: 'callout', tone: 'note', text: 'The on-device editing model is experimental. It requires a network connection to download. Its requests run in this browser and are not sent anywhere.' },
      { kind: 'paragraph', text: 'Its performance is alpha-level. Its page describes what it can edit, how well it works, privacy, storage, memory and its license.' },
      { kind: 'link', ...ON_DEVICE_USE_PAGES.explain },
      { kind: 'link', ...ON_DEVICE_USE_PAGES.howTo },
    ],
  } satisfies GuidanceSection] : []),
  {
    id: 'accessibility', title: 'Accessibility status', blocks: [
      { kind: 'callout', tone: 'note', text: 'Accessibility support is experimental. Keyboard operation is tested in Chrome; NVDA on Windows and VoiceOver on Safari are experimental, untested compatibility targets.' },
    ],
  },
  {
    id: 'license-support', title: 'License and support', blocks: [
      { kind: 'table', rows: [
        ['License', 'Coral and bundled third-party notices are included with the application.'],
        ['Source', 'GitHub source (requires a network)'],
        ['Support', 'GitHub issues (requires a network)'],
      ] },
    ],
  },
  ];
}

export const HELP_SECTIONS: readonly GuidanceSection[] = helpSections(ON_DEVICE_MODEL_AVAILABLE);

/**
 * Licences About lists beyond Coral's own (R-066 AC-7). The runtimes ship in
 * every build; the model, a separate download, only where the feature is on.
 */
export function aboutLicences(onDevice: boolean): readonly (readonly [string, string])[] {
  return [
    ...(onDevice ? [['On-device editing model (separate download)', 'LFM Open License v1.0, not Apache-2.0'] as const] : []),
    ['Transformers.js', 'Apache-2.0'],
    ['ONNX Runtime Web', 'MIT'],
  ];
}

export function validateReleaseIdentity(value: unknown): ReleaseIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const identity = value as Partial<ReleaseIdentity>;
  if (identity.product !== 'coral' || identity.version !== EXPECTED_RELEASE_VERSION) return null;
  if (typeof identity.commit !== 'string'
    || !/^[0-9a-f]{40}$/.test(identity.commit)
    || /^0{40}$/.test(identity.commit)) return null;
  return identity as ReleaseIdentity;
}

export function readDisplayIdentity(): ReleaseIdentity | null {
  return validateReleaseIdentity(globalThis.__CORAL_RELEASE_IDENTITY__);
}
