import { Application, normalizePath, resetReflectionID } from 'typedoc';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pathApi, { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultRepository = resolve(import.meta.dirname, '..');
const workspaces = ['language', 'render', 'browser', 'viz', 'mcp-server', 'tree-sitter-coral'];
const marker = '.coral-api-docs028';
const markerContent = 'Coral generated API documentation 0.2.8\n';
export function isWithinApiPath028(root, path, paths = pathApi) {
  const rel = paths.relative(root, path).split(paths.sep).join('/');
  return rel !== '..' && !rel.startsWith('../') && !paths.isAbsolute(rel);
}
const inside = isWithinApiPath028;

/** Inventory every public entry; declaration-free exports remain visible. */
export async function collectPublicEntries(repository = defaultRepository) {
  const root = resolve(repository), entries = [];
  for (const workspace of workspaces) {
    const directory = join(root, 'packages', workspace);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    if (!manifest.name || manifest.private) throw new Error(`Expected public package ${workspace}`);
    const exports = manifest.exports ?? { '.': { types: manifest.types } };
    for (const [subpath, value] of Object.entries(exports)) {
      if (!subpath.startsWith('.') || subpath.includes('*')) throw new Error(`Unsupported public export ${manifest.name}:${subpath}`);
      const types = typeof value === 'object' && value !== null ? value.types : undefined;
      if (types !== undefined && typeof types !== 'string') throw new Error(`Unsupported types condition ${manifest.name}:${subpath}`);
      const declaration = types ? resolve(directory, types.endsWith('.d.ts') ? types : `${types}/index.d.ts`) : null;
      if (declaration && (!inside(directory, declaration) || !existsSync(declaration))) throw new Error(`Missing or unsafe declaration ${declaration}; build public packages first`);
      entries.push({ name: manifest.name + (subpath === '.' ? '' : subpath.slice(1)),
        version: manifest.version, workspace, subpath,
        declaration: declaration ? relative(root, declaration).replaceAll('\\', '/') : null,
        status: declaration ? 'typed' : 'no-type-entry' });
    }
  }
  if (!entries.some(entry => entry.declaration)) throw new Error('No public declaration entries');
  return entries;
}

async function listFiles(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Symlink in API output: ${entry.name}`);
    return entry.isDirectory() ? listFiles(join(directory, entry.name)) : [join(directory, entry.name)];
  }))).flat();
}

/** Crawl generated links at the Pages prefix, including nested page fragments. */
export async function verifyApiDocs028(output) {
  const root = resolve(output), files = await listFiles(root);
  const pages = new Map(await Promise.all(files.filter(path => path.endsWith('.html')).map(async path => [path, await readFile(path, 'utf8')])));
  const prefix = '/coral/docs/api/', origin = 'https://coral.invalid';
  let links = 0, fragments = 0;
  if (!pages.has(join(root, 'index.html')) || !files.includes(join(root, '.nojekyll'))) throw new Error('Missing API index or .nojekyll');
  for (const [file, html] of pages) for (const match of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    const raw = match[2].replaceAll('&amp;', '&');
    const url = new URL(raw, origin + prefix + relative(root, file).replaceAll('\\', '/'));
    if (url.origin !== origin) {
      if (match[1] === 'src' || /<link[^>]*$/.test(html.slice(0, match.index))) throw new Error(`Remote API asset ${raw}`);
      continue;
    }
    if (raw.startsWith('/') || !url.pathname.startsWith(prefix)) throw new Error(`API link escapes Pages prefix: ${raw}`);
    const target = resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html');
    if (!inside(root, target) || !files.includes(target)) throw new Error(`Missing API link ${raw} in ${relative(root, file)}`);
    if (url.hash && pages.has(target)) {
      if (!pages.get(target).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)) throw new Error(`Missing API fragment ${raw}`);
      fragments++;
    }
    links++;
  }
  for (const file of files.filter(path => path.endsWith('.css'))) {
    const css = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    const urls = [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)]
      .map(match => match[1] ?? match[2] ?? match[3]);
    const imports = [...css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)]
      .map(match => match[1] ?? match[2]);
    for (const raw of [...urls, ...imports]) {
      // Inline data and document-local filters do not fetch a static file.
      if (/^data:/i.test(raw) || raw.startsWith('#')) continue;
      const url = new URL(raw, origin + prefix + relative(root, file).replaceAll('\\', '/'));
      if (url.origin !== origin) throw new Error(`Remote CSS asset ${raw} in ${relative(root, file)}`);
      if (raw.startsWith('/') || !url.pathname.startsWith(prefix)) throw new Error(`CSS asset escapes Pages prefix: ${raw}`);
      const target = resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)));
      if (!inside(root, target) || !files.includes(target)) throw new Error(`Missing CSS asset ${raw} in ${relative(root, file)}`);
      links++;
    }
  }
  return { htmlPages: pages.size, files: files.length, localLinks: links, fragments };
}

async function assertOutput(root, output) {
  if (inside(output, root)) throw new Error('API output cannot contain the repository');
  const defaultOutput = join(root, 'docs/public/api');
  if (inside(root, output) && output !== defaultOutput && !inside(join(root, 'build'), output)) throw new Error('API output must be docs/public/api, under build, or outside the repository');
  let ancestor = output;
  while (true) {
    const status = await lstat(ancestor).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (status) {
      if (status.isSymbolicLink()) throw new Error(`API output has symlink ancestor ${ancestor}`);
      if (await realpath(ancestor) !== resolve(ancestor)) throw new Error(`API output resolves through a symlink ${ancestor}`);
    }
    if (dirname(ancestor) === ancestor) break;
    ancestor = dirname(ancestor);
  }
  if (existsSync(output)) {
    if (!(await lstat(output)).isDirectory()) throw new Error('API output is not a directory');
    if ((await readdir(output)).length && (!existsSync(join(output, marker)) || await readFile(join(output, marker), 'utf8') !== markerContent)) throw new Error('Refusing to replace an unowned API output directory');
  }
}

/** Keep the previous tree recoverable even if publication and rollback both fail. */
export async function publishApiOutput028(rendered, destination, stage, renamePath = rename) {
  const previous = join(stage, 'previous');
  if (existsSync(destination)) await renamePath(destination, previous);
  try { await renamePath(rendered, destination); }
  catch (error) {
    if (existsSync(previous)) {
      try { await renamePath(previous, destination); }
      catch (rollback) {
        const failure = new AggregateError([error, rollback], `API publication and rollback failed; previous output retained at ${previous}`);
        failure.backup = previous;
        throw failure;
      }
    }
    throw error;
  }
}

/** Build from fresh public declarations, publishing output only after validation. */
export async function generateApiDocs028({ repository = defaultRepository, output } = {}) {
  const root = resolve(repository), destination = resolve(output ?? join(root, 'docs/public/api'));
  await assertOutput(root, destination);
  const inventory = await collectPublicEntries(root);
  const typed = inventory.filter(entry => entry.declaration);
  await mkdir(dirname(destination), { recursive: true });
  const stage = await mkdtemp(join(dirname(destination), '.coral-api-docs028-'));
  const config = join(stage, 'tsconfig.json'), rendered = join(stage, 'rendered');
  let preserveStage = false;
  try {
    await writeFile(config, JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
      skipLibCheck: true, noEmit: true, types: [], allowSyntheticDefaultImports: true,
    }, files: typed.map(entry => resolve(root, entry.declaration)) }));
    // TypeDoc takes normalized paths (POSIX separators, upper-case drive) at
    // its API; native paths stay in filesystem, containment and tsconfig use.
    const app = await Application.bootstrap({
      name: `Coral ${inventory[0].version} candidate API`,
      entryPoints: typed.map(entry => normalizePath(resolve(root, entry.declaration))), tsconfig: normalizePath(config),
      displayBasePath: normalizePath(join(root, 'packages')), readme: 'none', disableSources: true,
      githubPages: true, excludeReferences: false, navigation: { includeFolders: false },
      validation: { notExported: true, invalidLink: true, notDocumented: false },
    });
    // TypeDoc IDs otherwise depend on earlier conversions in this process.
    resetReflectionID();
    const project = await app.convert();
    if (!project) throw new Error('TypeDoc conversion failed');
    for (const entry of typed) {
      const original = relative(join(root, 'packages'), resolve(root, entry.declaration)).replaceAll('\\', '/').replace(/\.d\.ts$/, '').replace(/\/index$/, '');
      const module = project.children?.find(child => child.name === original);
      if (!module) throw new Error(`TypeDoc omitted public entry ${entry.name}`);
      module.name = entry.name;
    }
    app.validate(project);
    if (app.logger.hasErrors() || app.logger.hasWarnings()) throw new Error('TypeDoc validation reported errors or warnings');
    await app.generateDocs(project, normalizePath(rendered));
    // Serialize relative to the repository rather than TypeDoc's current cwd.
    const reflection = app.serializer.projectToObject(project, normalizePath(root));
    await writeFile(join(rendered, 'reflection.json'), JSON.stringify(reflection, null, 2) + '\n');
    if (app.logger.hasErrors() || app.logger.hasWarnings()) throw new Error('TypeDoc rendering reported errors or warnings');
    await writeFile(join(rendered, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
    await writeFile(join(rendered, marker), markerContent);
    const verification = await verifyApiDocs028(rendered);
    await assertOutput(root, destination);
    await publishApiOutput028(rendered, destination, stage);
    return { output: destination, inventory, verification };
  } catch (error) {
    preserveStage = Boolean(error.backup);
    throw error;
  } finally { if (!preserveStage) await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await generateApiDocs028({ repository: process.argv[2], output: process.argv[3] });
  console.log(`API docs: ${result.inventory.length} public entries, ${result.verification.htmlPages} HTML pages at ${result.output}`);
}
