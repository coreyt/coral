import { HEADER_MANIFEST_028, parse } from '@coral-viz/language';

const trustedDigests = Object.fromEntries(
  Object.values(HEADER_MANIFEST_028['0.2.8']).flatMap((edition) =>
    edition.catalogs.map((catalog) => [`${catalog.id}@${catalog.version}`, catalog.digest])));

export function readCoralSource(source) {
  return parse(source, {
    manifest: HEADER_MANIFEST_028, currentVersion: '0.2.8', trustedDigests,
  });
}

const result = readCoralSource('@diagram architecture\napi service as "API"\n');
if (result.header.diagnostics.length || result.syntax.diagnostics.length) {
  throw new Error('Inspect the located source diagnostics before semantic use.');
}
