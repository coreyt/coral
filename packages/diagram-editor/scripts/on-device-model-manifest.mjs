// Writes the on-device editing model manifest that each Coral build bundles
// (coralsmol integration plan W-11; R-066 AC-3).
//
// The manifest names an explicit Q4 file set with sizes and SHA-256, the
// frozen contract hash, the token caps and the pinned host revision. Every
// file is hashed here, and the export's own coralsmol-lfm-export/1 manifest
// must agree. The FP32 weights in the export directory are never listed.
//
// Usage: node scripts/on-device-model-manifest.mjs --export DIR
//   [--repository OWNER/NAME --revision COMMIT] [--out src/onDeviceModel/model-manifest.json]
// Without a repository and revision the manifest is unpublished: the download
// manager refuses it until P5 publishes the files and pins the revision.
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { COMPACT_VERSION, FROZEN_CONTRACT } from '../src/onDeviceModel/contract.ts';
import { PLAN_PROTOCOL } from '../src/llm/plan/registry.ts';

export const Q4_FILES = ['onnx/model_q4.onnx', 'onnx/model_q4.onnx_data', 'tokenizer.json', 'tokenizer_config.json',
  'config.json', 'generation_config.json', 'chat_template.jinja', 'LICENSE', 'LICENSE.md'];
// The P1 browser condition: up to 2,048 input and 1,024 output tokens.
export const TOKEN_CAPS = { input: 2048, output: 1024 };

const sha256File = path => new Promise((resolvePromise, reject) => {
  const hash = createHash('sha256');
  createReadStream(path).on('data', chunk => hash.update(chunk)).on('error', reject)
    .on('end', () => resolvePromise(hash.digest('hex')));
});

export async function buildManifest({ exportDirectory, repository = null, revision = null }) {
  if ((repository === null) !== (revision === null)) throw new Error('Repository and revision go together');
  if (revision !== null && !/^[0-9a-f]{40}$/.test(revision)) throw new Error('Revision must be a full commit hash');
  const exported = JSON.parse(readFileSync(resolve(exportDirectory, 'manifest.json'), 'utf8'));
  if (exported.schema !== 'coralsmol-lfm-export/1') throw new Error('Unknown export manifest');
  const files = [];
  for (const path of Q4_FILES) {
    const file = { path, bytes: statSync(resolve(exportDirectory, path)).size, sha256: await sha256File(resolve(exportDirectory, path)) };
    const recorded = exported.files.find(f => f.path === path);
    if (!recorded || recorded.bytes !== file.bytes || recorded.sha256 !== file.sha256) {
      throw new Error(`${path} does not match the export manifest`);
    }
    files.push(file);
  }
  return {
    schema: 'coral-on-device-model-manifest/1',
    modelId: 'coralsmol-lfm230-r2f-q4',
    licence: 'LFM Open License v1.0',
    source: { host: 'huggingface.co', repository, revision },
    files,
    totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
    contract: { format: COMPACT_VERSION, plan: PLAN_PROTOCOL,
      sha256: createHash('sha256').update(FROZEN_CONTRACT).digest('hex') },
    tokenCaps: TOKEN_CAPS,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values: v } = parseArgs({ options: { export: { type: 'string' }, repository: { type: 'string' },
    revision: { type: 'string' }, out: { type: 'string', default: 'src/onDeviceModel/model-manifest.json' } } });
  if (!v.export) throw new Error('Required: --export DIR');
  const manifest = await buildManifest({ exportDirectory: v.export, repository: v.repository ?? null, revision: v.revision ?? null });
  writeFileSync(resolve(v.out), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ out: v.out, totalBytes: manifest.totalBytes, files: manifest.files.length }));
}
