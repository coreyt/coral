import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  CDN_URL, DEFAULT_ATTEMPTS, DEFAULT_DELAY_MS, IIFE_ENTRY, readCdn, validateCdnReadback,
} from './cdn-readback.mjs';

const bytes = Buffer.from('window.Coral={};\n');
const expectedSha256 = createHash('sha256').update(bytes).digest('hex');

test('the CDN readback targets the version-pinned IIFE (DRO100-20)', () => {
  assert.equal(CDN_URL, 'https://cdn.jsdelivr.net/npm/@coral-viz/browser@0.2.6/dist/coral-browser.iife.js');
  assert.equal(IIFE_ENTRY, 'package/dist/coral-browser.iife.js');
});

test('CDN bytes must equal the candidate tarball IIFE, retrying only within the window (DRO100-20)', async () => {
  const responses = [
    { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) },
    { ok: true, status: 200, arrayBuffer: async () => bytes },
  ];
  const sleeps = [];
  const readback = await readCdn({
    expectedSha256, attempts: 3, delayMs: 5,
    fetchImpl: async () => responses.shift(), sleep: async ms => { sleeps.push(ms); },
    now: () => '2026-10-01T12:00:00Z',
  });
  assert.equal(readback.sha256, expectedSha256);
  assert.equal(readback.attempts, 2);
  assert.deepEqual(sleeps, [5]);
  assert.deepEqual(validateCdnReadback(readback, { expectedSha256 }), []);

  const wrong = await readCdn({
    expectedSha256, attempts: 2, delayMs: 0,
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('tampered') }),
    sleep: async () => {}, now: () => '2026-10-01T12:00:00Z',
  });
  assert.equal(wrong.attempts, 2);
  assert.match(validateCdnReadback(wrong, { expectedSha256 }).join('\n'), /do not match/);
  const absent = await readCdn({
    expectedSha256, attempts: 2, delayMs: 0,
    fetchImpl: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    sleep: async () => {}, now: () => '2026-10-01T12:00:00Z',
  });
  assert.match(validateCdnReadback(absent, { expectedSha256 }).join('\n'), /HTTP 404/);
  assert.match(validateCdnReadback({ ...readback, url: 'https://unpkg.com/x' }, { expectedSha256 }).join('\n'), /URL/);
});

test('the default CDN propagation window is ten attempts one minute apart (DRO100-20, TRO100-14)', async () => {
  assert.equal(DEFAULT_ATTEMPTS, 10);
  assert.equal(DEFAULT_DELAY_MS, 60_000);
  const sleeps = [];
  let fetches = 0;
  const readback = await readCdn({
    expectedSha256,
    fetchImpl: async () => { fetches += 1; return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }; },
    sleep: async ms => { sleeps.push(ms); }, now: () => '2026-10-01T12:00:00Z',
  });
  assert.equal(fetches, 10);
  assert.equal(readback.attempts, 10);
  assert.deepEqual(sleeps, Array(9).fill(60_000));
});
