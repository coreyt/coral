import { notationRegistry } from '@coral-viz/render';
import type { LayoutProfileOverrides, LayoutSettings } from './schema.js';

export interface LayoutProfileDiagnostic {
  code: 'layout.profile.unsupported' | 'layout.option.invalid';
  message: string;
}

export interface ResolvedLayoutProfile {
  settings: LayoutSettings;
  diagnostics: LayoutProfileDiagnostic[];
}

export function resolveNotationLayout(
  notationId: string,
  legacy: LayoutSettings,
): ResolvedLayoutProfile {
  if (legacy.profile === undefined) return { settings: legacy, diagnostics: [] };
  if ((legacy.profile as string) !== 'notation') return unsupported(legacy, 'Unknown layout profile');
  const profile = notationRegistry.get(notationId)?.layoutProfile;
  if (!profile) return unsupported(legacy, 'No layout profile is registered for this notation');
  const overrides = legacy.profileOverrides;
  if (!validOverrides(overrides)) return invalid(legacy);

  const elkOptions: Record<string, string | number | boolean> = {
    'elk.edgeRouting': profile.edgeRouting,
    ...profile.elkOptions,
    ...overrides?.elkOptions,
  };
  if (overrides?.edgeRouting) elkOptions['elk.edgeRouting'] = overrides.edgeRouting;
  return {
    diagnostics: [],
    settings: {
      ...legacy,
      algorithm: overrides?.algorithm ?? profile.algorithm,
      direction: overrides?.direction ?? profile.direction,
      spacing: { ...profile.spacing, ...withoutUndefined(overrides?.spacing) },
      elkOptions,
    },
  };
}

const ALGORITHMS = new Set(['layered', 'mrtree', 'tree', 'stress', 'force', 'radial', 'box', 'fixed']);
const DIRECTIONS = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);
const ROUTING = new Set(['ORTHOGONAL', 'POLYLINE', 'SPLINES']);
const OVERRIDE_FIELDS = new Set(['algorithm', 'direction', 'spacing', 'edgeRouting', 'elkOptions']);
const SPACING_FIELDS = new Set(['nodeNode', 'edgeNode', 'layerSpacing']);
const ELK_FIELDS = new Set([
  'elk.layered.considerModelOrder.strategy',
  'elk.layered.crossingMinimization.forceNodeModelOrder',
]);

function withoutUndefined<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function validOverrides(value: LayoutProfileOverrides | undefined): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const candidate = value as LayoutProfileOverrides;
  if (Object.keys(candidate).some((key) => !OVERRIDE_FIELDS.has(key))) return false;
  if (candidate.algorithm !== undefined && !ALGORITHMS.has(candidate.algorithm)) return false;
  if (candidate.direction !== undefined && !DIRECTIONS.has(candidate.direction)) return false;
  if (candidate.edgeRouting !== undefined && !ROUTING.has(candidate.edgeRouting)) return false;
  if (candidate.spacing !== undefined) {
    if (!isRecord(candidate.spacing)) return false;
    if (Object.keys(candidate.spacing).some((key) => !SPACING_FIELDS.has(key))) return false;
    if (Object.values(candidate.spacing).some((item) => item !== undefined
      && (typeof item !== 'number' || !Number.isFinite(item) || item <= 0))) return false;
  }
  if (candidate.elkOptions !== undefined) {
    if (!isRecord(candidate.elkOptions)) return false;
    if (Object.keys(candidate.elkOptions).some((key) => !ELK_FIELDS.has(key))) return false;
    const strategy = candidate.elkOptions['elk.layered.considerModelOrder.strategy'];
    if (strategy !== undefined && strategy !== 'NODES_AND_EDGES') return false;
    const force = candidate.elkOptions['elk.layered.crossingMinimization.forceNodeModelOrder'];
    if (force !== undefined && typeof force !== 'boolean') return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unsupported(settings: LayoutSettings, message: string): ResolvedLayoutProfile {
  return { settings, diagnostics: [{ code: 'layout.profile.unsupported', message }] };
}

function invalid(settings: LayoutSettings): ResolvedLayoutProfile {
  return { settings, diagnostics: [{ code: 'layout.option.invalid', message: 'Invalid layout profile override' }] };
}
