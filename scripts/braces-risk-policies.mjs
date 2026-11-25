import { classifyBracesRisk } from './braces-risk.mjs';

/** Historical approval belongs only to the exact 0.2.8 snapshot. */
export const classifyBracesRisk028 = (result, acceptance) => classifyBracesRisk(result, acceptance, {
  releaseVersion: '0.2.8',
});

/** Exact, expiring 0.2.9 decision; no prior release's approval can apply. */
export const classifyBracesRisk029 = (result, acceptance, { now = Date.now() } = {}) =>
  classifyBracesRisk(result, acceptance, { releaseVersion: '0.2.9', expires: true, now });
