import assert from 'node:assert/strict';

const names = ['braces', 'fast-glob', 'globby', 'markdownlint-cli2', 'micromatch'];
const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const stable = value => JSON.stringify(normalize(value));
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, normalize(value[key])]));
  return value;
}
const projection = entry => ({ name: entry.name, severity: entry.severity,
  isDirect: entry.isDirect, range: entry.range, nodes: [...entry.nodes].sort(),
  via: [...entry.via].sort((a, b) => stable(a).localeCompare(stable(b))) });

/** Validate the report and an exact release-specific HITL disposition. */
export function classifyBracesRisk(result, { approval, version, lock } = {}, {
  releaseVersion, expires = false, now = Date.now(),
} = {}) {
  try {
    assert.ok([0, 1].includes(result.status) && !result.error && !result.signal, 'audit process failed');
    const report = JSON.parse(result.stdout);
    assert.ok(report && !report.error && report.auditReportVersion === 2, 'unreadable audit');
    const entries = report.vulnerabilities;
    assert.ok(entries && typeof entries === 'object' && !Array.isArray(entries), 'missing findings');
    const counts = Object.fromEntries(levels.map(level => [level, 0]));
    for (const [name, entry] of Object.entries(entries)) {
      assert.ok(entry?.name === name && levels.includes(entry.severity), 'invalid finding identity');
      counts[entry.severity]++;
      assert.ok(Array.isArray(entry.nodes) && entry.nodes.every(node => typeof node === 'string')
        && Array.isArray(entry.via) && entry.via.length > 0, 'invalid finding graph');
      for (const cause of entry.via) {
        if (typeof cause === 'string') {
          assert.ok(Object.hasOwn(entries, cause) && levels.indexOf(entry.severity)
            >= levels.indexOf(entries[cause].severity), 'missing or hidden finding');
        } else {
          assert.ok(cause && levels.includes(cause.severity), 'invalid advisory');
          assert.ok(levels.indexOf(entry.severity) >= levels.indexOf(cause.severity), 'hidden advisory');
        }
      }
    }
    for (const level of levels) assert.equal(report.metadata?.vulnerabilities?.[level], counts[level], 'audit count mismatch');
    assert.equal(report.metadata.vulnerabilities.total, Object.keys(entries).length, 'audit total mismatch');
    // npm's peer-dependency graph can contain cycles. Every finding must
    // still reach a real advisory, including through another cycle member.
    const grounded = new Set(Object.keys(entries).filter(name =>
      entries[name].via.some(cause => typeof cause === 'object')));
    let previousSize;
    do {
      previousSize = grounded.size;
      for (const [name, entry] of Object.entries(entries)) {
        if (entry.via.some(cause => typeof cause === 'string' && grounded.has(cause))) grounded.add(name);
      }
    } while (grounded.size !== previousSize);
    assert.equal(grounded.size, Object.keys(entries).length, 'finding has no advisory');
    const high = Object.fromEntries(Object.entries(entries).filter(([, entry]) =>
      ['high', 'critical'].includes(entry.severity)).map(([name, entry]) => [name, projection(entry)]));
    if (Object.keys(high).length === 0) {
      return { valid: true, acceptedRisk: null };
    }
    assert.equal(version, releaseVersion, 'exception release mismatch');
    assert.equal(approval?.releaseVersion, version);
    assert.equal(approval.schemaVersion, 1);
    assert.equal(approval.decision, 'accepted-risk');
    assert.equal(approval.authorization?.kind, 'HITL conversation');
    assert.equal(approval.authorization.auditGateApproval, `Approve the exact ${releaseVersion} audit exception`);
    if (expires) {
      assert.ok(typeof approval.expiresAt === 'string' && Number.isFinite(Date.parse(approval.expiresAt)), 'missing risk expiry');
      assert.ok(Number.isFinite(now) && now <= Date.parse(approval.expiresAt), 'risk acceptance expired');
      // This decision covers one advisory and exactly its five affected entries.
      assert.deepEqual(Object.keys(entries).sort(), names, 'unapproved finding');
    }
    assert.equal(approval.advisory, 'GHSA-vfj7-8cjw-p6xm');
    assert.equal(approval.package, 'braces'); assert.equal(approval.packageVersion, '3.0.3');
    assert.deepEqual(Object.keys(high).sort(), names);
    assert.deepEqual(Object.keys(approval.highFindings).sort(), names);
    const expected = Object.fromEntries(Object.entries(approval.highFindings).map(([name, entry]) => [name, projection(entry)]));
    assert.equal(stable(high), stable(expected), 'unapproved high finding');
    // Inspect every leaf, including lower-severity nodes, before accepting.
    for (const entry of Object.values(entries)) for (const cause of entry.via) {
      if (typeof cause === 'object' && ['high', 'critical'].includes(cause.severity)) {
        assert.equal(cause.source, 1240992); assert.equal(cause.name, 'braces');
        assert.equal(cause.dependency, 'braces'); assert.equal(cause.severity, 'high');
        assert.equal(cause.range, '<=3.0.3');
        assert.equal(cause.url, 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm');
      }
    }
    assert.deepEqual(Object.keys(approval.lockedNodes).sort(), names.map(name => `node_modules/${name}`));
    for (const [node, expectedNode] of Object.entries(approval.lockedNodes)) {
      const actual = lock?.packages?.[node];
      assert.ok(actual && actual.dev === true && expectedNode.dev === true, 'production or missing node');
      for (const key of ['version', 'resolved', 'integrity', 'dev']) assert.equal(actual[key], expectedNode[key], 'locked identity changed');
    }
    assert.equal(lock.packages['node_modules/braces'].version, '3.0.3');
    assert.deepEqual(Object.keys(lock.packages).filter(node => node.endsWith('node_modules/braces')), ['node_modules/braces']);
    for (const entry of Object.values(lock.packages)) if (entry.dev !== true) {
      assert.ok(!entry.dependencies?.braces && !entry.optionalDependencies?.braces, 'production braces usage');
    }
    return { valid: true, acceptedRisk: { id: approval.id, advisory: approval.advisory,
      package: 'braces', version: '3.0.3', releaseVersion: version, highEntries: names,
      ...(expires ? { expiresAt: approval.expiresAt } : {}) } };
  } catch (error) {
    return { valid: false, acceptedRisk: null, reason: error.message };
  }
}
