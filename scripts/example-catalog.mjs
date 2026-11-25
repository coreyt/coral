import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateExampleCatalog, exampleHref, createExampleDocument } from '../packages/diagram-editor/src/exampleCatalog.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

/** The same manifest and exact authored bytes consumed by the editor. */
export async function loadExampleCatalog({ repository = repositoryRoot, runtimeVersion } = {}) {
  const root = join(repository, 'packages/diagram-editor/src/example-sources');
  const catalog = validateExampleCatalog(JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8')));
  const runtime = runtimeVersion ?? JSON.parse(await readFile(join(repository, 'package.json'), 'utf8')).version;
  if (runtime !== catalog.runtimeVersion) throw new Error(`Example catalog requires runtime ${catalog.runtimeVersion}; received ${runtime}`);
  const entries = await Promise.all(catalog.entries.map(async entry => {
    const source = await readFile(join(root, entry.sourceFile), 'utf8');
    if (!source.startsWith(`@diagram ${entry.notation}\n`)) throw new Error(`Example source notation mismatch: ${entry.id}`);
    return { ...entry, source };
  }));
  return { ...catalog, entries };
}

/** Build-only projection; a rendered display graph is never a download master. */
export async function generateExampleGallery({ repository = repositoryRoot, output, runtimeVersion } = {}) {
  if (!output) throw new Error('Example gallery output is required');
  const catalog = await loadExampleCatalog({ repository, runtimeVersion });
  const { render } = await import(pathToFileURL(join(repository, 'packages/browser/dist/coral-browser.js')).href);
  const entries = [];
  // Validate and render all entries before writing any output.
  for (const entry of catalog.entries) {
    const result = await render(entry.source, { ...entry.preview, title: entry.name });
    if (!result.sourceGraph || result.diagnostics.some(item => item.severity === 'error')) {
      throw new Error(`Example cannot render without loss of source ownership: ${entry.id}`);
    }
    const document = createExampleDocument(catalog, entry.id, entry.source);
    entries.push({ ...entry, svg: result.svg, document,
      sourceSha256: digest(entry.source), previewSha256: digest(result.svg),
      previewInputSha256: digest(json({ source: entry.source, preview: entry.preview,
        title: entry.name, runtimeVersion: catalog.runtimeVersion })),
      diagnostics: result.diagnostics, editorHref: exampleHref(catalog, entry.id) });
  }
  await mkdir(output, { recursive: true });
  for (const entry of entries) {
    await writeFile(join(output, `${entry.id}.coral`), entry.source);
    await writeFile(join(output, `${entry.id}.coral.json`), json(entry.document));
    await writeFile(join(output, `${entry.id}.svg`), entry.svg);
  }
  const manifest = { ...catalog, entries: entries.map(entry => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'svg' && key !== 'document'))) };
  await writeFile(join(output, 'catalog.json'), json(manifest));
  const cards = entries.map(entry => `<article id="${entry.id}"><h2>${escapeHtml(entry.name)}</h2>
<p>${escapeHtml(entry.description)}</p><img loading="lazy" src="${entry.id}.svg" alt="${escapeHtml(entry.name)} diagram">
<p>${escapeHtml(entry.notation)} · ${escapeHtml(entry.limitations.join(' '))}</p>
${entry.diagnostics.length ? `<p>${escapeHtml(entry.diagnostics.map(item => item.message).join(' '))}</p>` : ''}
<p><a href="${escapeHtml(entry.editorHref)}">Open ${escapeHtml(entry.name)} in Coral</a></p>
<p>Download <a download href="${entry.id}.coral">Coral source</a> · <a download href="${entry.id}.coral.json">Coral document</a> · <a download href="${entry.id}.svg">SVG</a></p></article>`).join('\n');
  await writeFile(join(output, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coral examples</title>
<style>body{font:1rem/1.6 system-ui,sans-serif;margin:0;background:#f5f7f8;color:#183234}main{max-width:76rem;margin:auto;padding:2rem}a{color:#075f67}article{background:white;border:1px solid #ccdada;border-radius:.6rem;padding:1.5rem;margin:1rem 0}img{display:block;width:100%;max-height:28rem;object-fit:contain}h1,h2{line-height:1.2}a:focus-visible{outline:3px solid #b44a17;outline-offset:3px}</style></head>
<body><main><nav><a href="../">Coral editor</a> · <a href="../docs/">Help and documentation</a></nav>
<h1>Start with an example</h1><p>Preview a diagram, download its source, or open a local copy in Coral. The editor asks you to open the selected example; your current work stays yours.</p>
<p>Catalog ${escapeHtml(catalog.catalogVersion)} · Coral ${escapeHtml(catalog.runtimeVersion)} · Language ${escapeHtml(catalog.languageVersion)} · default source edition ${escapeHtml(catalog.sourceEdition)}; entries may explicitly select 0.2.9.</p>
<p>These examples demonstrate supported subsets. They do not claim full notation standards or structured sequence editing. ERD examples are not supported.</p>
${cards}</main></body></html>\n`);
  return manifest;
}

// Static builds isolate browser instance namespaces without changing the runtime API.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await generateExampleGallery({ output: process.argv[2], runtimeVersion: process.argv[3] });
}
