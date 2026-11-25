import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { assertSafeCleanTarget, escapedNodeAddonTarget } from './clean.mjs';

test('escaped node-addon-api cleanup is idempotent when the target is absent', () => {
  assert.doesNotThrow(() => assertSafeCleanTarget(escapedNodeAddonTarget, undefined));
});

test('escaped node-addon-api cleanup accepts only known generated Makefiles', () => {
  assert.doesNotThrow(() => assertSafeCleanTarget(escapedNodeAddonTarget, [
    'node_addon_api.Makefile',
    'node_addon_api_except.target.mk',
  ]));
  assert.throws(
    () => assertSafeCleanTarget(escapedNodeAddonTarget, ['package.json']),
    /unexpected entries: package\.json/,
  );
});

const file = (name) => ({ name, isDirectory: () => false });
const directory = (name) => ({ name, isDirectory: () => true });

test('escaped node-addon-api cleanup accepts the exact Windows MSBuild output', () => {
  const projects = ['node_addon_api', 'node_addon_api_except', 'node_addon_api_except_all', 'node_addon_api_maybe'];
  assert.doesNotThrow(() => assertSafeCleanTarget(escapedNodeAddonTarget, [
    file('node_addon_api.sln'),
    ...projects.flatMap((name) => [file(`${name}.vcxproj`), file(`${name}.vcxproj.filters`)]),
    directory('Release'),
  ]));
  for (const [entry, name] of [
    [file('package.json'), 'package\\.json'],
    [directory('Debug'), 'Debug'],
    [file('Release'), 'Release'],
    [directory('node_addon_api.vcxproj'), 'node_addon_api\\.vcxproj'],
    [file('other.vcxproj'), 'other\\.vcxproj'],
    [file('node_addon_api_other.vcxproj'), 'node_addon_api_other\\.vcxproj'],
    [file('node_addon_api_except.sln'), 'node_addon_api_except\\.sln'],
    [file('node_addon_api.vcxproj.user'), 'node_addon_api\\.vcxproj\\.user'],
    [file('release'), 'release'],
  ]) {
    assert.throws(() => assertSafeCleanTarget(escapedNodeAddonTarget, [directory('Release'), entry]),
      new RegExp(`unexpected entries: ${name}$`), entry.name);
  }
});

test('cleanup refuses a sibling of the escaped node-addon-api target', () => {
  assert.throws(
    () => assertSafeCleanTarget(resolve(escapedNodeAddonTarget, '../node-addon-api-other'), [directory('Release')]),
    /Refusing to clean unexpected target/,
  );
});

test('cleanup rejects an arbitrary target', () => {
  assert.throws(
    () => assertSafeCleanTarget(resolve(import.meta.dirname, '../package.json'), undefined),
    /Refusing to clean unexpected target/,
  );
});
