import { computeDocumentSymbolDigest } from '@graph-ir/core';
import { describe, expect, it } from 'vitest';
import { successorCoreValidationInput029 } from '../src/successorInterpretation028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { printSuccessorSource028 } from '../src/successorSourceWriter028.js';

// Real production admission, retaining unknown-profile refusal coverage.
const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '', '@symbol gate {', '  name "Gate"',
  '  size 40 x 40', '  login port [direction: in, maxConnections: 1]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'g service [symbol: "local.gate"]', 'a service', 'a -> g:login', ''].join('\n');
const exported = () => successorCoreValidationInput029(projectInstalledSourceToSuccessor028(SOURCE).graph!,
  { limits: true }).graph;

describe('GraphIR 4 import of document symbols', () => {
  it('refuses artwork that names unknown profile version 2, at its GraphIR path', () => {
    const graph = exported(); graph.documentCatalog![0]!.artwork.profile.version = '2';
    const digest = computeDocumentSymbolDigest(graph.documentCatalog![0]!);
    expect(digest.ok).toBe(true); if (digest.ok) graph.documentCatalog![0]!.digest = digest.digest;
    expect(printSuccessorSource028(graph)).toEqual({ diagnostics: [expect.objectContaining({ severity: 'error',
      code: 'import.graphir.artwork.profile-unsupported',
      message: expect.stringMatching(/coral\.svg-artwork version 2 at \/documentCatalog\/0\/artwork\/profile$/) })] });
  });

  it('refuses a local ID whose suffix Coral source cannot spell', () => {
    const graph = exported();
    graph.documentCatalog![0]!.id = 'local.gate-1';
    graph.nodes[0]!.symbol = 'local.gate-1';
    expect(printSuccessorSource028(graph).diagnostics).toContainEqual(expect.objectContaining({ severity: 'error',
      code: 'import.graphir.local-symbol.id-unsupported',
      message: expect.stringMatching(/local\.gate-1 .* at \/documentCatalog\/0\/id$/) }));
  });

  it('prints a GraphIR graph without document symbols exactly as before', () => {
    const plain = '@diagram architecture\na service\nb service\na -> b\n';
    const graph = projectInstalledSourceToSuccessor028(plain).graph!;
    expect(printSuccessorSource028(successorCoreValidationInput029(graph, { limits: true }).graph))
      .toEqual(printSuccessorSource028(graph));
  });
});
