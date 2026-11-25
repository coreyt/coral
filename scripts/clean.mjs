import { existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const escapedNodeAddonTarget = resolve(
  import.meta.dirname, '../packages/node_modules/node-addon-api',
);

// node-gyp output for node-addon-api: Makefiles on Unix; on Windows an MSBuild
// solution, the projects with their filters, and the Release build directory.
const generatedNodeAddonFiles = /^(?:node_addon_api\.sln|node_addon_api(?:_(?:except|except_all|maybe))?(?:\.Makefile|\.target\.mk|\.vcxproj|\.vcxproj\.filters))$/;
const generatedNodeAddonDirectories = new Set(['Release']);

/** Entries are names (always files) or directory entries from readdirSync. */
export function assertSafeCleanTarget(target, generatedEntries) {
  if (target === escapedNodeAddonTarget) {
    if (generatedEntries === undefined) return;
    const unexpected = generatedEntries.map((entry) => typeof entry === 'string'
      ? { name: entry, directory: false } : { name: entry.name, directory: entry.isDirectory() })
      .filter(({ name, directory }) => directory
        ? !generatedNodeAddonDirectories.has(name) : !generatedNodeAddonFiles.test(name))
      .map(({ name }) => name);
    if (unexpected.length) {
      throw new Error(`Refusing to clean node-gyp target with unexpected entries: ${unexpected.join(', ')}`);
    }
    return;
  }
  if (!['dist', 'coverage', 'build'].includes(basename(target))) {
    throw new Error(`Refusing to clean unexpected target: ${target}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.cwd(), process.argv[2] ?? '');
  const generatedEntries = target === escapedNodeAddonTarget && existsSync(target)
    ? readdirSync(target, { encoding: 'utf8', withFileTypes: true })
    : undefined;
  assertSafeCleanTarget(target, generatedEntries);
  rmSync(target, { recursive: true, force: true });
}
