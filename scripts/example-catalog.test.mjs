import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadExampleCatalog, generateExampleGallery } from './example-catalog.mjs';

test('catalog resolves exact source and rejects incompatible runtime', async () => {
  const catalog = await loadExampleCatalog();
  assert.equal(catalog.entries.length, 12);
  assert.equal(new Set(catalog.entries.map(e => e.id)).size, 12);
  assert(!catalog.entries.some(e => e.id === 'erd'));
  assert(catalog.entries.some(e => e.id === 'order-service'));
  await assert.rejects(() => loadExampleCatalog({ runtimeVersion: '0.2.8' }), /runtime|edition/i);
});

test('fresh gallery derives exact source, documents, previews and versioned links', async t => {
  const out = await mkdtemp(join(tmpdir(), 'coral-example-gallery-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  const catalog = await loadExampleCatalog();
  await generateExampleGallery({ output: out });
  const html = await readFile(join(out, 'index.html'), 'utf8');
  const generated = JSON.parse(await readFile(join(out, 'catalog.json'), 'utf8'));
  assert.equal(generated.catalogVersion, catalog.catalogVersion);
  assert.equal(generated.entries.length, catalog.entries.length);
  for (const entry of catalog.entries) {
    const source = await readFile(join(out, `${entry.id}.coral`), 'utf8');
    assert.equal(source, entry.source);
    const document = JSON.parse(await readFile(join(out, `${entry.id}.coral.json`), 'utf8'));
    assert.deepEqual(document.content, { format: 'dsl', dslType: 'coral', text: source });
    assert.equal(document.metadata.name, entry.name);
    assert.equal(document.settings.notation, entry.notation);
    assert.equal(document.settings.renderStyle028, entry.preview.style);
    assert.equal(document.settings.layout.direction, entry.preview.direction);
    const svg = await readFile(join(out, `${entry.id}.svg`), 'utf8');
    assert.match(svg, /<svg/);
    assert(html.includes(`example=${entry.id}&amp;catalog=${catalog.catalogVersion}`));
    const item = generated.entries.find(e => e.id === entry.id);
    assert.equal(item.sourceSha256, createHash('sha256').update(source).digest('hex'));
    assert.equal(item.previewSha256, createHash('sha256').update(svg).digest('hex'));
    assert.match(item.previewSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(item.preview, entry.preview);
  }
});


test('website admission refuses missing files, mismatched notation and invalid source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'coral-example-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sources = join(root, 'packages/diagram-editor/src/example-sources');
  await cp(new URL('../packages/diagram-editor/src/example-sources/', import.meta.url), sources, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.2.15', type: 'module' }));
  const file = join(sources, 'block.coral');
  const original = await readFile(file, 'utf8');
  await rm(file);
  await assert.rejects(() => loadExampleCatalog({ repository: root }), /ENOENT/);
  await writeFile(file, '@diagram erd\n');
  await assert.rejects(() => loadExampleCatalog({ repository: root }), /notation mismatch/);
  await mkdir(join(root, 'packages/browser/dist'), { recursive: true });
  await cp(new URL('../packages/browser/dist/coral-browser.js', import.meta.url), join(root, 'packages/browser/dist/coral-browser.js'));
  await writeFile(file, original + '\nthis is not valid coral !@#$\n');
  await assert.rejects(() => generateExampleGallery({ repository: root, output: join(root, 'gallery') }));
  await assert.rejects(() => readFile(join(root, 'gallery/index.html')), /ENOENT/);
});
