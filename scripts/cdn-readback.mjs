import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// DRO100-20: the browser README and embed guide advertise this version-pinned
// CDN URL. Release closure proves the CDN serves exactly the IIFE bytes of the
// retained candidate tarball before release.yml creates the tag.
export const CDN_URL = 'https://cdn.jsdelivr.net/npm/@coral-viz/browser@0.2.6/dist/coral-browser.iife.js';
export const IIFE_ENTRY = 'package/dist/coral-browser.iife.js';
export const DEFAULT_ATTEMPTS = 10;
export const DEFAULT_DELAY_MS = 60_000;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Retries cover CDN propagation within one bounded window. A persistent
// mismatch is a post-publication failure; release.yml may be re-dispatched
// within the design's 24-hour propagation window.
export async function readCdn({
  url = CDN_URL, expectedSha256, attempts = DEFAULT_ATTEMPTS, delayMs = DEFAULT_DELAY_MS,
  fetchImpl = fetch, sleep = ms => new Promise(done => setTimeout(done, ms)),
  now = () => new Date().toISOString(),
}) {
  let last = { status: 0, sha256: null };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchImpl(url, { cache: 'no-store' });
    const bytes = response.ok ? Buffer.from(await response.arrayBuffer()) : null;
    last = { status: response.status, sha256: bytes ? sha256(bytes) : null };
    if (last.sha256 === expectedSha256 || attempt === attempts) {
      return { url, status: last.status, sha256: last.sha256, attempts: attempt, observedAt: now() };
    }
    await sleep(delayMs);
  }
  return { url, ...last, attempts, observedAt: now() };
}

export function validateCdnReadback(readback, { expectedSha256 }) {
  const errors = [];
  if (readback?.url !== CDN_URL) errors.push('CDN readback URL is not the advertised version-pinned URL');
  if (readback?.status !== 200) errors.push(`CDN readback failed with HTTP ${readback?.status}`);
  else if (readback.sha256 !== expectedSha256) {
    errors.push('CDN IIFE bytes do not match the retained candidate tarball');
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tarball = process.argv[2] ?? 'candidate-artifacts/coral-viz-browser-0.2.6.tgz';
  const extracted = spawnSync('tar', ['-xOzf', tarball, IIFE_ENTRY], { maxBuffer: 64 * 1024 * 1024 });
  if (extracted.status !== 0) throw new Error(`Cannot read ${IIFE_ENTRY} from ${tarball}`);
  const expectedSha256 = sha256(extracted.stdout);
  const readback = { ...(await readCdn({ expectedSha256 })), tarballEntrySha256: expectedSha256 };
  const errors = validateCdnReadback(readback, { expectedSha256 });
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync('cdn-readback.json', `${JSON.stringify(readback, null, 2)}\n`);
  console.log(JSON.stringify(readback));
}
