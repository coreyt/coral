import { describe, expect, it } from 'vitest';
import manifest from '../src/example-sources/catalog.json';
import { validateExampleCatalog, resolveExample, exampleHref, createExampleDocument } from '../src/exampleCatalog.mjs';

describe('canonical example catalog', () => {
  it('validates the catalog and resolves stable versioned links', () => {
    expect(validateExampleCatalog(manifest)).toBe(manifest);
    expect(manifest.entries).toHaveLength(12);
    expect(resolveExample(manifest, '1.0.0', 'order-service').notation).toBe('architecture');
    expect(exampleHref(manifest, 'order-service', '/coral/')).toBe('/coral/?example=order-service&catalog=1.0.0');
    expect(manifest.retired.some(entry => entry.id === 'erd')).toBe(true);
  });
  it('creates a source-owned document with the same options as the preview', () => {
    const source = '@diagram architecture\napi service\n';
    const document = createExampleDocument(manifest, 'order-service', source);
    expect(document.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
    expect(document.settings).toEqual({ notation: 'architecture', renderStyle028: 'hifi',
      layout: { algorithm: 'layered', direction: 'RIGHT' } });
    expect(document).toEqual(createExampleDocument(manifest, 'order-service', source));
    expect(() => createExampleDocument(manifest, 'order-service', '@diagram flowchart\n')).toThrow(/notation mismatch/);
  });
  it.each([undefined, '', '0.0.0'])('rejects missing/wrong version %s', version => {
    expect(() => resolveExample(manifest, version, 'architecture')).toThrow(/catalog version/i);
  });
  it.each(['unknown', 'erd', '', undefined])('rejects invalid or retired identity %s', id => {
    expect(() => resolveExample(manifest, '1.0.0', id)).toThrow(/example/i);
  });
  it.each([undefined, null])('rejects non-string active and retired IDs: %s', id => {
    for (const section of ['entries', 'retired'] as const) {
      const input = structuredClone(manifest);
      Object.assign(input[section][0]!, { id });
      expect(() => validateExampleCatalog(input)).toThrow(/identity|retired/);
    }
  });
  it('rejects duplicate IDs, unsafe sources, unsupported preview/claims and source editions', () => {
    const bad = () => structuredClone(manifest);
    let input = bad(); input.entries.push(input.entries[0]!);
    expect(() => validateExampleCatalog(input)).toThrow(/duplicate/i);
    input = bad(); input.entries[0]!.sourceFile = '../secret.coral';
    expect(() => validateExampleCatalog(input)).toThrow(/source/i);
    input = bad(); input.entries[0]!.preview.style = 'invented';
    expect(() => validateExampleCatalog(input)).toThrow(/preview/i);
    input = bad(); input.entries[0]!.preview.direction = 'invented';
    expect(() => validateExampleCatalog(input)).toThrow(/preview/i);
    input = bad(); input.entries[0]!.capabilities.push('invented');
    expect(() => validateExampleCatalog(input)).toThrow(/capabilit/i);
    input = bad(); input.sourceEdition = '9.9.9';
    expect(() => validateExampleCatalog(input)).toThrow(/edition/i);
  });
});
