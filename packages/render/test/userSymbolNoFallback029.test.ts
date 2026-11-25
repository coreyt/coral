import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Slice 60 C3: a `local.` symbol resolves only through its document catalog or
// a carried outline value, never a global registry. This inventory names every
// production global lookup with the reason it cannot see a user symbol, so a new
// lookup fails here until it is reviewed. Core validation of a source projection
// always goes through successorCoreValidationInput029.

const root = join(import.meta.dirname, '..', '..');
const packages = ['render', 'viz', 'diagram-editor', 'mcp-server', 'browser'];
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}
const files = packages.flatMap((name) => sources(join(root, name, 'src')))
  .map((path) => ({ path: relative(root, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }));
const count = (pattern: RegExp) => Object.fromEntries(files.flatMap(({ path, text }) => {
  const found = text.match(pattern)?.length ?? 0;
  return found ? [[path, found]] : [];
}));

describe('no global fallback for user symbols', () => {
  it('reviews every global shape and symbol registry lookup', () => {
    expect(count(/(?:shape|symbol)Registry\.get\(/g)).toEqual({
      // Bundled-only paths: each takes a user symbol branch, a `local.` guard or a catalog first.
      'render/src/catalogLookup029.ts': 3, // the guarded lookups themselves
      'render/src/semanticLayoutPorts028.ts': 4, // bundled branch; user symbols return earlier
      'render/src/scene.ts': 3, // fitClassifierFrame028/fitPlainRectangleInk028 are rectangle-only; no-notation branch
      'render/src/layout/spatial.ts': 1, // BPMN gateway frame only
      'render/src/layout/engine.ts': 1, // skipped when a port carries frameOutline029
      'render/src/drawingPrimitives028.ts': 1, // a user outline is passed as `shape`
      'render/src/visualStyle028.ts': 2, // only for a string shape ID; user outlines pass the shape
      'render/src/text/sizing.ts': 4, // callers size user symbols from `size` and never pass `local.`
      'render/src/shapes/index.ts': 1, // registry implementation
      'render/src/symbols/index.ts': 1, // registry implementation
      'viz/src/compatibility/validateConnection.ts': 1, // guarded by the `local.` prefix
      'viz/src/compatibility/useEdgeCompatibility.ts': 2, // guarded by the `local.` prefix; no-profile branch
      'viz/src/components/SymbolNode.tsx': 1, // generic rectangle only
      'viz/src/layout/elk.ts': 1, // guarded by the `local.` prefix
      'diagram-editor/src/authoringModel.ts': 2, // container checks; user symbols are never containers
      'diagram-editor/src/useEditorController.ts': 1, // symbolProvidedPorts: GraphIR 3 documents only
    });
  });

  it('reviews every resolveNotationNode028 call that may run without a document catalog', () => {
    // The full argument list of each call, by parenthesis matching.
    const argumentsOf = (text: string, start: number): string => {
      let depth = 0;
      for (let index = start; index < text.length; index += 1) {
        if (text[index] === '(') depth += 1;
        else if (text[index] === ')' && --depth === 0) return text.slice(start + 1, index);
      }
      return text.slice(start);
    };
    const withoutCatalog = Object.fromEntries(files.flatMap(({ path, text }) => {
      const calls = [...text.matchAll(/resolveNotationNode028\(/g)]
        .filter((match) => !text.slice(Math.max(0, match.index - 16), match.index).includes('function '))
        .map((match) => argumentsOf(text, match.index + 'resolveNotationNode028'.length))
        .filter((args) => !/catalog|Catalog|Symbols029/.test(args)).length;
      return calls ? [[path, calls]] : [];
    }));
    expect(withoutCatalog).toEqual({
      'render/src/graphConformance028.ts': 3, // GraphIR 3 conformance without a source sidecar
      'render/src/graphPortReferences028.ts': 1, // GraphIR 3 port references without a source sidecar
      'render/src/rulesets/flowchart028.ts': 2, // decision detection; an unresolved user symbol is never a decision
      'diagram-editor/src/hooks/diagramUtils.ts': 1, // interpretationForNode without a sidecar (GraphIR 3)
      'diagram-editor/src/useEditorController.ts': 1, // symbolProvidedPorts: GraphIR 3 documents only
    });
  });

  it('validates every source projection through successorCoreValidationInput029', () => {
    const calls = files.flatMap(({ path, text }) =>
      [...text.matchAll(/validateGraphIRSuccessorWithCatalog\(([^)]*)\)/g)].map((match) => [path, match[1]!]));
    expect(calls.filter(([, args]) => args.replace(/\s/g, '') !== 'core.graph,core.snapshot,core.options'))
      // User-supplied GraphIR 4 JSON keeps its raw input; a source projection passes its own snapshot and
      // options.
      .toEqual([
        // Import validates the given GraphIR form with the interchange admission list.
        ['render/src/successorSourceWriter028.ts', 'graph, snapshot, { artworkAdmission: graphIrArtworkAdmission029 }'],
        ['mcp-server/src/tools/validate.ts', 'value, snapshot, options']]);
    expect(calls.length).toBe(10);
  });
});
