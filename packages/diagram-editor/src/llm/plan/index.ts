/**
 * The shared `coral-plan/1` boundary (0.2.10 plan slices 10 to 40): the
 * operation registry, strict decoder, source snapshot and capability
 * adapter (slices 10 and 20), executor (30) and detached staging (40). The
 * editor controller's `plan` surface commits staged plans; the on-device
 * model (R-066) composes the rest.
 */
export * from './registry';
export * from './decode';
export * from './snapshot';
export * from './execute';
export * from './stage';
export * from './spatial';
