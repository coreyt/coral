import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredPages = [
  'docs/index.md', 'docs/embed/index.md', 'docs/contribute/index.md',
  'docs/contribute/get-started.md',
  'docs/contribute/how-to/build-and-preview.md',
  'docs/contribute/how-to/release-and-recover.md',
  ...[
    'architecture', 'testing', 'generated-assets-and-dependencies',
    'documentation-governance', 'language-evolution', 'coverage-baseline', 'performance-budgets',
    'release-compliance-checklist', 'clean-room-process',
  ].map((name) => `docs/contribute/reference/${name}.md`),
  'docs/embed/how-to/render-a-diagram.md',
  'docs/embed/how-to/render-in-a-browser.md',
  'docs/embed/how-to/embed-the-react-editor.md',
  ...[
    'viz-api', 'render-api', 'language-api', 'language-specification-1.3.0', 'mcp-server', 'tree-sitter',
  ].map((name) => `docs/embed/reference/${name}.md`),
  'docs/use/index.md', 'docs/use/get-started.md',
  ...[
    'install-or-use-the-web-app', 'start-from-an-example',
    'place-and-edit-objects', 'connect-and-route-objects',
    'lay-out-and-reflow', 'convert-from-mermaid', 'save-open-and-recover',
    'export-a-diagram', 'generate-with-ai', 'use-voice-input',
    'use-coral-with-the-keyboard', 'edit-with-the-on-device-model',
  ].map((name) => `docs/use/how-to/${name}.md`),
  ...[
    'interface-regions', 'coral-dsl', 'notations', 'capabilities', 'shape-primitives',
    'keyboard-shortcuts', 'preferences', 'file-and-export-formats',
    'conversion-support', 'browser-support', 'troubleshooting',
  ].map((name) => `docs/use/reference/${name}.md`),
  ...[
    'why-coral', 'connection-rules', 'history-and-undo', 'conversion-loss',
    'privacy-and-storage', 'accessibility-status', 'on-device-editing-model',
  ].map((name) => `docs/use/explain/${name}.md`),
];
const requiredFeatures = [
  'install', 'examples', 'create', 'interface', 'edit', 'connect', 'layout',
  'history', 'notations', 'dsl', 'keyboard', 'preferences', 'files',
  'recovery', 'export', 'conversion', 'ai', 'spatial', 'voice', 'privacy',
  'accessibility', 'support', 'browser', 'troubleshooting',
];

const failures = [];
const text = async (path) => readFile(resolve(root, path), 'utf8');
const sha256 = async (path) => createHash('sha256')
  .update(await readFile(resolve(root, path))).digest('hex');
const expectedNotationAnchors = [
  'block', 'flowchart', 'bpmn', 'code', 'architecture', 'aiml',
  'data-engineering', 'sketch', 'uml-class', 'uml-sequence',
];

for (const page of requiredPages) {
  if (!existsSync(resolve(root, page))) {
    failures.push(`missing page: ${page}`);
    continue;
  }
  const source = await text(page);
  const lastH2 = [...source.matchAll(/^## (.+)$/gm)].at(-1)?.[1];
  if (lastH2 !== 'Related') failures.push(`${page}: final H2 must be Related`);
  const related = source.split(/^## Related$/m)[1] ?? '';
  const links = [...related.matchAll(/^- \[[^\]]+\]\([^)]+\)$/gm)];
  if (links.length < 1 || links.length > 5) {
    failures.push(`${page}: Related must contain 1 to 5 Markdown links`);
  }
  if (page.includes('/reference/')) {
    const afterH1 = source.replace(/^# .+\n+/, '');
    const blocks = afterH1.trimStart().split(/\n{2,}/);
    if (!blocks[0] || !blocks[1]?.startsWith('|')) {
      failures.push(`${page}: reference must open with one scope sentence then a table`);
    }
  }
}

const layoutGuide = await text('docs/use/how-to/lay-out-and-reflow.md');
const historyGuide = await text('docs/use/explain/history-and-undo.md');
if (!/Reflow preserves authored route-intent\s+waypoints/.test(historyGuide)) {
  failures.push('history-and-undo.md: missing authored waypoint preservation');
}
if (!historyGuide.includes('Manual Reflow is available for verified spatial Coral source.') ||
    !layoutGuide.includes('Manual Reflow accepts verified spatial Coral source.')) {
  failures.push('Use guides: missing verified source-owned Coral Reflow capability');
}
if (/Reflow (?:deletes|replaces) (?:authored |manual )?waypoints/i.test(historyGuide)
    || /Reflow (?:deletes|replaces) (?:authored |manual )?waypoints/i.test(layoutGuide)) {
  failures.push('Use guides: stale Reflow waypoint-loss claim');
}

if (existsSync(resolve(root, 'docs/user-guide.md'))) {
  failures.push('docs/user-guide.md must be replaced by docs/use/');
}

if (existsSync(resolve(root, 'README.md'))) {
  const readme = await text('README.md');
  if (/^## Packages$/m.test(readme)) failures.push('README.md: package chooser belongs to Slice 65');
  for (const target of ['docs/use/index.md', 'docs/embed/index.md', 'docs/contribute/index.md']) {
    if (!readme.includes(`](${target})`)) failures.push(`README.md: missing audience door ${target}`);
  }
}

for (const page of requiredPages) {
  if (!existsSync(resolve(root, page))) continue;
  const source = await text(page);
  if (/\bobjects? (?:are|can be) created by (?:dragging|dropping)\b/i.test(source)
      || /\bships? (?:a |an )?(?:notation[- ]library )?(?:palette|drag-to-create)\b/i.test(source)) {
    failures.push(`${page}: unsupported palette or drag-to-create claim`);
  }
}

const featureMapPath = 'dev/docs-feature-map.json';
if (!existsSync(resolve(root, featureMapPath))) failures.push(`missing feature map: ${featureMapPath}`);
else {
  const map = JSON.parse(await text(featureMapPath));
  const ids = new Set();
  for (const entry of map.features ?? []) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.page !== 'string'
        || typeof entry.evidence !== 'string' || entry.evidence.length < 3) {
      failures.push(`${featureMapPath}: every feature needs string id, page, and evidence`);
      continue;
    }
    if (ids.has(entry.id)) failures.push(`${featureMapPath}: duplicate feature id ${entry.id}`);
    ids.add(entry.id);
    if (!requiredFeatures.includes(entry.id)) failures.push(`${featureMapPath}: unknown feature id ${entry.id}`);
    if (!requiredPages.includes(entry.page)) failures.push(`${featureMapPath}: unknown page ${entry.page}`);
    else if (!(await text(entry.page)).includes(entry.evidence)) {
      failures.push(`${featureMapPath}: ${entry.id} evidence is absent from ${entry.page}`);
    }
  }
  for (const id of requiredFeatures) if (!ids.has(id)) failures.push(`${featureMapPath}: missing ${id}`);
}

const notations = await text('docs/use/reference/notations.md');
for (const anchor of expectedNotationAnchors) {
  if (!notations.includes(`{#${anchor}}`)) failures.push(`notations.md: missing ${anchor} section`);
}

const manifestPath = 'docs/figures.json';
if (!existsSync(resolve(root, manifestPath))) failures.push(`missing figure manifest: ${manifestPath}`);
else {
  const manifest = JSON.parse(await text(manifestPath));
  const manifestPaths = new Set();
  for (const entry of manifest.figures ?? []) {
    if (entry.class !== 'reviewed-svg' || typeof entry.producer !== 'string') {
      failures.push(`${manifestPath}: reviewed SVG needs class and producer`);
    }
    if (!existsSync(resolve(root, `docs/public/${entry.path}`))) {
      failures.push(`${manifestPath}: missing public figure ${entry.path}`);
    }
    if (!existsSync(resolve(root, entry.source))) {
      failures.push(`${manifestPath}: missing figure source ${entry.source}`);
    }
    manifestPaths.add(entry.path);
    const svg = await text(`docs/public/${entry.path}`);
    if (!/<title(?:\s|>)/.test(svg) || !/<desc(?:\s|>)/.test(svg)) {
      failures.push(`${manifestPath}: ${entry.path} needs SVG title and description`);
    }
    if (entry.sourceSha256 !== await sha256(entry.source)) {
      failures.push(`${manifestPath}: stale source hash for ${entry.source}`);
    }
    if (entry.figureSha256 !== await sha256(`docs/public/${entry.path}`)) {
      failures.push(`${manifestPath}: stale figure hash for ${entry.path}`);
    }
  }
  if ((manifest.figures ?? []).length !== 1) failures.push(`${manifestPath}: expected one reviewed figure`);

  const publishedFigures = [];
  for (const page of requiredPages) {
    if (!existsSync(resolve(root, page))) continue;
    const source = await text(page);
    for (const match of source.matchAll(/!\[([^\]]+)\]\(([^)]+\.svg)\)/g)) {
      if (!match[1].trim()) failures.push(`${page}: figure needs non-empty alt text`);
      const publicRelative = posix.normalize(posix.join(dirname(page), match[2]))
        .replace(/^docs\/public\//, '');
      publishedFigures.push(publicRelative);
      if (!manifestPaths.has(publicRelative)) failures.push(`${page}: unmanifested figure ${publicRelative}`);
      const tail = source.slice(match.index + match[0].length).trimStart();
      if (!tail || tail.startsWith('#')) failures.push(`${page}: figure needs adjacent caption context`);
    }
  }
  for (const path of manifestPaths) {
    if (!publishedFigures.includes(path)) failures.push(`${manifestPath}: unpublished figure ${path}`);
  }
}

if (failures.length) {
  console.error(['Documentation structure failed:', ...failures].join('\n'));
  process.exit(1);
}

console.log(`Documentation structure passes (${requiredPages.length} pages, ${requiredFeatures.length} features).`);
