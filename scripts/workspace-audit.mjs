import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { RELEASE_PACKAGES, recordRegistryAudit } from './release-registry.mjs';
import { npmCommand } from './npm-command.mjs';
import { classifyBracesRisk028, classifyBracesRisk029 } from './braces-risk-policies.mjs';

// CRO100-16: publish.yml's workspace audit. Before any package is published
// (registry start-index 0) a high or critical advisory, or an audit that
// cannot be read, blocks publication. Once a published prefix exists, the
// set is partly immutable, so an advisory disclosed since then is recorded
// in ordinary job output rather than blocking the
// remaining packages. An unknown start index is treated as a fresh publish.
// Only an exact, release-specific owner-approved braces snapshot receives accepted-risk;
// the full raw report and original severity counts remain visible.
export function workspaceAuditDecision({ startIndex, result, riskAcceptance, now = Date.now() }) {
  const index = /^\d+$/.test(String(startIndex ?? '')) ? Number(startIndex) : NaN;
  const known = Number.isSafeInteger(index) && index <= RELEASE_PACKAGES.length;
  const audit = recordRegistryAudit(result);
  const blocking = !known || index === 0;
  // Validation applies even when no release has an accepted-risk record. Counts
  // alone cannot establish a clean audit: errors and hidden findings may carry
  // zero metadata counts. Each classifier validates the full process/report/graph
  // before considering its release-specific approval. 0.2.9 also requires expiry.
  const disposition = riskAcceptance?.version === '0.2.9'
    ? classifyBracesRisk029(result, riskAcceptance, { now })
    : classifyBracesRisk028(result, riskAcceptance);
  const clean = audit.highOrCritical === 0 && disposition.valid;
  const acceptedRisk = known ? disposition?.acceptedRisk : null;
  return {
    schemaVersion: 1, startIndex: known ? index : null, blocking, exitStatus: audit.exitStatus,
    vulnerabilities: audit.vulnerabilities, highOrCritical: audit.highOrCritical,
    outcome: clean ? 'pass' : acceptedRisk ? 'accepted-risk' : blocking ? 'blocked' : 'recorded',
    ...(riskAcceptance ? { acceptedRisk, ...(disposition.reason ? { reason: disposition.reason } : {}) } : {}),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const npm = npmCommand(['audit', '--json']);
  const result = spawnSync(npm.command, npm.args, { encoding: 'utf8', stdio: 'pipe' });
  // Preserve every advisory and the original counts in ordinary local/CI output,
  // including on refusal and immutable-prefix resume.
  process.stdout.write(result.stdout || '');
  if (result.stdout && !result.stdout.endsWith('\n')) process.stdout.write('\n');
  if (result.stderr) process.stderr.write(result.stderr);
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  let riskAcceptance;
  try {
    const version = read('package.json').version;
    riskAcceptance = ['0.2.8', '0.2.9'].includes(version)
      ? { version, lock: read('package-lock.json'),
        approval: read(version === '0.2.9'
          ? 'scripts/fixtures/audit/braces-risk-acceptance-0.2.9.json'
          : 'scripts/fixtures/audit/braces-risk-acceptance-0.2.8.json') }
      : { version };
  } catch {
    riskAcceptance = {}; // No approval can be applied; preserve existing resume recording.
  }
  const decision = workspaceAuditDecision({ startIndex: process.argv.includes('--ci') ? '0' : process.env.REGISTRY_START_INDEX, result, riskAcceptance });
  console.log(JSON.stringify(decision));
  if (decision.outcome === 'blocked') {
    throw new Error('Workspace audit blocks publication: a high or critical advisory, or no readable audit, before any package is published');
  }
  if (decision.outcome === 'accepted-risk') {
    console.log(`::warning::HITL accepted existing braces risk for Coral ${decision.acceptedRisk.releaseVersion}: ${JSON.stringify(decision.acceptedRisk)}`);
  }
  if (decision.outcome === 'recorded') {
    console.log(`::warning::Recorded workspace audit after partial publication (not blocking): ${JSON.stringify(decision)}`);
  }
}
