/**
 * Scripted stand-in for the on-device model, used only by the dev-server
 * fixture (onDeviceFixture.ts). It replies to the requests the browser
 * keyboard journey types, reading handles from the snapshot it receives.
 */
import type { ExchangeResult } from '../src/onDeviceModel/client';
import type { OnDeviceModel } from '../src/onDeviceModel/index';
import { MODEL_MANIFEST, type StoredModelState } from '../src/onDeviceModel/storage';
import type { ChatMessage } from '../src/onDeviceModel/translator';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const manifest = { ...MODEL_MANIFEST, source: { ...MODEL_MANIFEST.source, repository: 'coral/fixture', revision: 'fixture' } };
const handle = (snapshot: string, test: (line: string) => boolean) => snapshot.split('\n').find(test)?.split(' ')[0];

function scriptedReply(messages: ChatMessage[]): string {
  const request = messages[1].content;
  const snapshot = messages[2].content;
  if (messages.length === 5) {
    const team = /inside "([^"]+)"/.exec(messages[4].content)?.[1];
    const group = handle(snapshot, line => line.includes(` group "${team}" `));
    return `label ${handle(snapshot, line => line.includes(` in ${group} `) && line.endsWith(' id r'))} "Approve"`;
  }
  if (/which/i.test(request)) {
    const reviews = snapshot.split('\n').filter(line => line.includes(' process "Review" ')).map(line => line.split(' ')[0]);
    return `ask ambiguous ${reviews.join(' | ')}`;
  }
  if (/arrow/i.test(request)) return 'delete e1';
  const byLabel = (label: string) => handle(snapshot, line => line.includes(` "${label}" `));
  const place = /^Place "([^"]+)" below "([^"]+)"/.exec(request);
  if (place) return `place ${byLabel(place[1])} below ${byLabel(place[2])} compact`;
  const rename = /^Rename "([^"]+)" to "([^"]+)"/.exec(request);
  if (rename) return `label ${byLabel(rename[1])} "${rename[2]}"`;
  return 'no-change unsupported';
}

let state: StoredModelState = 'none';
let stopped: (() => void) | null = null;
const model: OnDeviceModel = {
  manifest,
  probe: async () => ({ ok: true }),
  gpus: async () => [{ powerPreference: 'high-performance', vendor: 'fixture', architecture: 'scripted', description: '', name: 'Fixture · Scripted' }],
  estimate: async () => ({ ok: true, freeBytes: 10 * manifest.totalBytes, neededBytes: manifest.totalBytes }),
  stored: async () => state,
  storedBytes: async () => (state === 'ready' ? manifest.totalBytes : 0),
  download: async options => {
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      await delay(50);
      if (options?.signal?.aborted) throw new Error('Download cancelled');
      options?.onProgress?.(manifest.totalBytes * fraction, manifest.totalBytes);
    }
    state = 'ready';
  },
  remove: async () => { state = 'none'; },
  run: messages => new Promise<ExchangeResult>(resolve => {
    const timer = setTimeout(() => resolve({ status: 'ok', text: scriptedReply(messages), adapter: { vendor: 'fixture', architecture: 'fixture' } }), 400);
    stopped = () => { clearTimeout(timer); resolve({ status: 'cancelled' }); };
  }),
  stop: () => { stopped?.(); stopped = null; },
};

export function sharedOnDeviceModel(): OnDeviceModel {
  return model;
}
