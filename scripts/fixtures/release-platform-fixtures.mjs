import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Shared synthetic evidence for the release ledger tests.
// Nothing here is real platform evidence.
export const productSha = 'a'.repeat(40);
export const manifestSha256 = '9'.repeat(64);
export const versionSha256 = 'e'.repeat(64);
export const hostedUrl = 'https://coreyt.github.io/coral/';
export const deployedAt = '2026-09-01T10:03:00Z';

const journeys = [
  'version-identity', 'hosted-startup', 'local-open-save-export',
  'notation-profile', 'online-only',
];
const host = (os, version, arch) => ({ os, version, arch });

// One record per closed coverage row: native rows are pre-mutation candidate
// evidence; web rows are post-deployment production acceptance.
export function coverageRecords(sha = productSha) {
  const web = (platform, product) => ({
    kind: 'web', productVersion: '0.2.6', candidateSha: sha,
    observedAt: '2026-09-01T12:00:00Z', observer: 'fixture', host: platform,
    result: 'pass', notes: '',
    browser: { product, version: '1', engine: product === 'Safari' ? 'WebKit' : 'engine' },
    origin: hostedUrl, evidenceKind: 'real-browser', journeys, acceptance: true,
    hostedVersionSha256: versionSha256,
  });
  const native = (platform, node, command = 'npm run smoke:native', smokeTarget = 'load-and-parse') => ({
    kind: 'native', productVersion: '0.2.6', candidateSha: sha,
    observedAt: '2026-09-01T08:00:00Z', observer: 'fixture', host: platform,
    result: 'pass', notes: '', runtime: { node, npm: '12.0.2' },
    toolchain: 'fixture', command, artifact: `candidate-manifest.json@sha256:${manifestSha256}`,
    smokeTarget,
  });
  return {
    'linux-x64-chrome': web(host('Linux', '6', 'x64'), 'Chrome'),
    'windows-x64-chrome': web(host('Windows', '11 24H2', 'x64'), 'Chrome'),
    'windows-x64-edge': web(host('Windows', '11 24H2', 'x64'), 'Edge'),
    'macos14-arm64-chrome': web(host('macOS', '14.7', 'arm64'), 'Chrome'),
    'macos14-arm64-safari': web(host('macOS', '14.7', 'arm64'), 'Safari'),
    'firefox-desktop': web(host('Linux', '6', 'x64'), 'Firefox'),
    'linux-x64-native': native(host('Linux', '6', 'x64'), '26.8.2'),
    'windows-x64-native': native(host('Windows', '11 24H2', 'x64'), '26.8.2'),
    'macos14-arm64-native': native(host('macOS', '14.7', 'arm64'), '26.8.2'),
    'windows11-x64-vm-consumer-node24': native(
      host('Windows', '11 24H2', 'x64'), '24.19.0', 'npm run smoke:consumer', 'six-package-consumer',
    ),
    'windows11-x64-vm-consumer-node26': native(
      host('Windows', '11 24H2', 'x64'), '26.8.2', 'npm run smoke:consumer', 'six-package-consumer',
    ),
  };
}

export async function writeCoverage(root, records) {
  const references = [];
  for (const [coverage, record] of Object.entries(records)) {
    const path = `dev/releases/0.2.6/slice-100/platform/${coverage}.json`;
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
    references.push({
      path, kind: record.kind, coverage,
      phase: record.kind === 'web' ? 'post-deployment' : 'pre-mutation',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return references;
}

export const platformContext = root => ({
  productSha, hostedUrl, hostedVersionSha256: versionSha256, deployedAt,
  candidateManifestSha256: manifestSha256, evidenceRoot: root,
  checkedAt: '2026-09-02T00:00:00Z',
});
