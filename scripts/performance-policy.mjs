import { cpus, totalmem } from 'node:os';

export const NOT_MEASURED = 'PERFORMANCE BENCHMARKS NOT MEASURED';

export function performanceHost() {
  const processors = cpus();
  return { node: process.version, platform: process.platform, arch: process.arch,
    cpu: processors[0]?.model, logicalCpus: processors.length, memoryBytes: totalmem() };
}

/** A profile is an explicit comparison target, never inferred from runner labels. */
export function benchmarkEnvironment({ env = process.env, host = performanceHost(), browserVersion,
  warn = (message) => console.warn(message) } = {}) {
  let profile;
  if (env.CORAL_PERFORMANCE_PROFILE) {
    try { profile = JSON.parse(env.CORAL_PERFORMANCE_PROFILE); }
    catch { throw new Error('Invalid CORAL_PERFORMANCE_PROFILE JSON'); }
    if (!profile || typeof profile !== 'object' || profile.isolation !== 'exclusive') {
      throw new Error('Performance profile must declare isolation: exclusive');
    }
    for (const key of ['node', 'platform', 'arch', 'cpu', 'logicalCpus', 'memoryBytes']) {
      if (profile[key] !== host[key] || profile[key] === undefined) {
        throw new Error(`Performance profile mismatch: ${key}`);
      }
    }
    if (browserVersion !== undefined && profile.browserVersion !== browserVersion) {
      throw new Error('Performance profile mismatch: browserVersion');
    }
  }
  if (env.CORAL_PERFORMANCE_PROVENANCE && env.CORAL_PERFORMANCE_PROVENANCE !== 'unknown') {
    throw new Error('Unsupported CORAL_PERFORMANCE_PROVENANCE; use an explicit performance profile');
  }
  if (env.CORAL_PERFORMANCE_PROVENANCE === 'unknown' && env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Unknown performance provenance is only valid in GitHub Actions');
  }
  // A declared controlled profile is a claim of an isolated, comparable
  // machine. A shared GitHub-hosted runner, or a profile alongside an unknown
  // provenance, contradicts that claim and fails instead of downgrading.
  if (profile && env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT !== 'self-hosted') {
    throw new Error('Performance profile requires a self-hosted runner; shared GitHub-hosted runners are never controlled');
  }
  if (profile && env.CORAL_PERFORMANCE_PROVENANCE === 'unknown') {
    throw new Error('Performance profile contradicts unknown performance provenance');
  }
  if (env.GITHUB_ACTIONS === 'true' && !profile) {
    const reason = `${NOT_MEASURED}: shared or unclassified GitHub environment; run strict benchmarks locally or on an explicitly profiled, isolated self-hosted runner.`;
    warn(`::warning::${reason}`);
    return { measure: false, reason };
  }
  return { measure: true, reason: 'Strict local or explicitly controlled benchmark' };
}

/** Validate warmups and component timings before floors or ratios can hide errors. */
export function validatePerformanceSamples(name, samples, expectedSamples) {
  if (!Number.isInteger(expectedSamples) || expectedSamples < 1 || !Array.isArray(samples) ||
      samples.length !== expectedSamples || samples.some((value) => typeof value !== 'number' ||
        !Number.isFinite(value) || value < 0)) {
    throw new Error(`Invalid performance measurements: ${name}`);
  }
}

/** Validate every sample before calculating a budget; missing data never passes. */
export function assertPerformanceBudget({ name, samples, expectedSamples, limit,
  percentile = 1, comparison = 'lte' }) {
  validatePerformanceSamples(name, samples, expectedSamples);
  if (!Number.isFinite(limit) || limit <= 0 ||
      !Number.isFinite(percentile) || percentile <= 0 || percentile > 1 ||
      !['lt', 'lte'].includes(comparison)) {
    throw new Error(`Invalid performance measurements or budget: ${name}`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const value = sorted[Math.ceil(sorted.length * percentile) - 1];
  if (comparison === 'lt' ? value >= limit : value > limit) {
    throw new Error(`PERFORMANCE BENCHMARKS FAILED: ${name}: ${value} ${comparison === 'lt' ? '>=' : '>'} ${limit}`);
  }
  return value;
}
