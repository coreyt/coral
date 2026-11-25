/**
 * Tests for AI/ML Symbol Library and Notation (#58)
 *
 * Covers:
 * - New shapes (brain, cube, chip, chat-bubble, shield, neural-net, gear)
 * - AI/ML symbol library (16 symbols)
 * - AI/ML notation (edge styles, graph modes, connection rules, validation)
 */

import { describe, it, expect } from 'vitest';
import {
  shapeRegistry,
  getShape,
  symbolRegistry,
  getSymbol,
  getSymbolsForNotation,
  getAllLibraries,
  getNotation,
  checkGraphConformance028,
} from '../src/index.js';
import type { GraphNode, GraphEdge } from '../src/types.js';

const draftReport = (nodes: GraphNode[], edges: GraphEdge[]) => checkGraphConformance028({
  version: '3.0.0', id: 'aiml-draft', metadata: { notation: 'aiml' }, nodes, edges,
}, { savedLevel: 'typical' });

// ============================================================================
// AI/ML Shape Tests
// ============================================================================

describe('AI/ML Shapes', () => {
  const aimlShapeIds = ['brain', 'cube', 'chip', 'chat-bubble', 'shield', 'neural-net', 'gear'];

  it.each(aimlShapeIds)('shape "%s" exists in registry', (shapeId) => {
    expect(shapeRegistry.has(shapeId)).toBe(true);
  });

  it.each(aimlShapeIds)('shape "%s" has valid SVG path', (shapeId) => {
    const shape = getShape(shapeId)!;
    expect(shape.path).toBeTruthy();
    expect(shape.path).toMatch(/^[MmLlHhVvCcSsQqTtAaZz\s\d.,\-]+$/);
  });

  it.each(aimlShapeIds)('shape "%s" has viewBox, defaultSize, portAnchors, sizing', (shapeId) => {
    const shape = getShape(shapeId)!;
    expect(shape.viewBox).toMatch(/^\d+ \d+ \d+ \d+$/);
    expect(shape.defaultSize.width).toBeGreaterThan(0);
    expect(shape.defaultSize.height).toBeGreaterThan(0);
    expect(shape.portAnchors.length).toBeGreaterThanOrEqual(2);
    expect(shape.sizing).toBeDefined();
    expect(shape.sizing!.textBoundsRatio.x).toBeGreaterThan(0);
    expect(shape.sizing!.minSize.width).toBeGreaterThan(0);
  });

  it('brain shape has compound type for two-hemisphere silhouette', () => {
    const shape = getShape('brain')!;
    expect(shape.type).toBe('path');
    expect(shape.portAnchors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ side: 'NORTH' }),
        expect.objectContaining({ side: 'SOUTH' }),
      ])
    );
  });

  it('chip shape has polygon type with pin notches', () => {
    const shape = getShape('chip')!;
    expect(shape.type).toBe('path');
  });

  it('shield shape has pointed bottom', () => {
    const shape = getShape('shield')!;
    expect(shape.type).toBe('path');
  });
});

// ============================================================================
// AI/ML Symbol Library Tests
// ============================================================================

describe('AI/ML Symbol Library', () => {
  it('library is registered with id "aiml"', () => {
    const libraries = getAllLibraries();
    expect(libraries.some((l) => l.id === 'aiml')).toBe(true);
  });

  it('has 17 symbols', () => {
    const symbols = getSymbolsForNotation('aiml');
    expect(symbols.length).toBe(17);
  });

  it('all symbols have aiml- prefix', () => {
    const symbols = getSymbolsForNotation('aiml');
    for (const s of symbols) {
      expect(s.id).toMatch(/^aiml-/);
    }
  });

  it('all symbols reference valid shapes', () => {
    const symbols = getSymbolsForNotation('aiml');
    for (const s of symbols) {
      expect(shapeRegistry.has(s.shape)).toBe(true);
    }
  });

  it('all symbols have tags', () => {
    const symbols = getSymbolsForNotation('aiml');
    for (const s of symbols) {
      expect(s.tags.length).toBeGreaterThan(0);
    }
  });

  describe('specific symbols', () => {
    it('aiml-model uses brain shape with variants', () => {
      const s = getSymbol('aiml-model')!;
      expect(s.shape).toBe('brain');
      expect(s.variants?.foundation).toBeDefined();
      expect(s.variants?.['fine-tuned']).toBeDefined();
      expect(s.variants?.classifier).toBeDefined();
      expect(s.variants?.regression).toBeDefined();
    });

    it('aiml-llm uses brain shape with chat/completion/multimodal variants', () => {
      const s = getSymbol('aiml-llm')!;
      expect(s.shape).toBe('brain');
      expect(s.variants?.chat).toBeDefined();
      expect(s.variants?.completion).toBeDefined();
      expect(s.variants?.multimodal).toBeDefined();
    });

    it('aiml-dataset uses cylinder shape', () => {
      const s = getSymbol('aiml-dataset')!;
      expect(s.shape).toBe('cylinder');
      expect(s.variants?.training).toBeDefined();
      expect(s.variants?.validation).toBeDefined();
      expect(s.variants?.test).toBeDefined();
    });

    it('aiml-vector-store uses cube shape', () => {
      const s = getSymbol('aiml-vector-store')!;
      expect(s.shape).toBe('cube');
    });

    it('aiml-embedding uses neural-net shape', () => {
      const s = getSymbol('aiml-embedding')!;
      expect(s.shape).toBe('neural-net');
    });

    it('aiml-gpu uses chip shape', () => {
      const s = getSymbol('aiml-gpu')!;
      expect(s.shape).toBe('chip');
      expect(s.variants?.gpu).toBeDefined();
      expect(s.variants?.tpu).toBeDefined();
      expect(s.variants?.cluster).toBeDefined();
    });

    it('aiml-agent uses actor shape', () => {
      const s = getSymbol('aiml-agent')!;
      expect(s.shape).toBe('actor');
    });

    it('aiml-prompt uses chat-bubble shape', () => {
      const s = getSymbol('aiml-prompt')!;
      expect(s.shape).toBe('chat-bubble');
      expect(s.variants?.template).toBeDefined();
      expect(s.variants?.chain).toBeDefined();
    });

    it('aiml-guardrail uses shield shape', () => {
      const s = getSymbol('aiml-guardrail')!;
      expect(s.shape).toBe('shield');
      expect(s.variants?.input).toBeDefined();
      expect(s.variants?.output).toBeDefined();
    });

    it('aiml-tool uses gear shape', () => {
      const s = getSymbol('aiml-tool')!;
      expect(s.shape).toBe('gear');
    });

    it('aiml-retriever uses parallelogram shape', () => {
      const s = getSymbol('aiml-retriever')!;
      expect(s.shape).toBe('parallelogram');
    });

    it('aiml-memory uses cylinder shape', () => {
      const s = getSymbol('aiml-memory')!;
      expect(s.shape).toBe('cylinder');
      expect(s.variants?.['short-term']).toBeDefined();
      expect(s.variants?.['long-term']).toBeDefined();
    });

    it('aiml-evaluator uses diamond shape', () => {
      const s = getSymbol('aiml-evaluator')!;
      expect(s.shape).toBe('diamond');
    });

    it('aiml-training uses rectangle shape', () => {
      const s = getSymbol('aiml-training')!;
      expect(s.shape).toBe('rectangle');
    });

    it('aiml-inference uses hexagon shape', () => {
      const s = getSymbol('aiml-inference')!;
      expect(s.shape).toBe('hexagon');
    });

    it('aiml-feature-store uses cylinder shape', () => {
      const s = getSymbol('aiml-feature-store')!;
      expect(s.shape).toBe('cylinder');
    });
  });
});

// ============================================================================
// AI/ML Notation Tests
// ============================================================================

describe('AI/ML Notation', () => {
  it('notation is registered with id "aiml"', () => {
    const notation = getNotation('aiml');
    expect(notation).toBeDefined();
    expect(notation!.id).toBe('aiml');
    expect(notation!.name).toBe('AI/ML Diagram');
  });

  it('has 17 symbol references', () => {
    const notation = getNotation('aiml')!;
    expect(notation.symbols.length).toBe(17);
  });

  it('all symbol references are valid', () => {
    const notation = getNotation('aiml')!;
    for (const symbolId of notation.symbols) {
      expect(symbolRegistry.has(symbolId)).toBe(true);
    }
  });

  describe('edge styles', () => {
    it('has 6 edge styles', () => {
      const notation = getNotation('aiml')!;
      expect(Object.keys(notation.edgeStyles!).length).toBe(6);
    });

    it('has data-flow as default edge style', () => {
      const notation = getNotation('aiml')!;
      expect(notation.defaultEdgeStyle).toBe('data-flow');
    });

    it.each(['data-flow', 'training', 'inference', 'embedding', 'tool-use'])(
      'has "%s" edge style',
      (style) => {
        const notation = getNotation('aiml')!;
        expect(notation.edgeStyles![style]).toBeDefined();
        expect(notation.edgeStyles![style].name).toBeTruthy();
        expect(notation.edgeStyles![style].stroke).toBeTruthy();
      }
    );
  });

  describe('graph modes', () => {
    it('has 4 graph modes', () => {
      const notation = getNotation('aiml')!;
      expect(Object.keys(notation.graphModes!).length).toBe(4);
    });

    it.each(['training-pipeline', 'inference-pipeline', 'rag-pipeline', 'agent-architecture'])(
      'has "%s" graph mode',
      (mode) => {
        const notation = getNotation('aiml')!;
        expect(notation.graphModes![mode]).toBeDefined();
        expect(notation.graphModes![mode].name).toBeTruthy();
        expect(notation.graphModes![mode].primarySymbols.length).toBeGreaterThan(0);
      }
    );
  });

  describe('connection rules', () => {
    it('has connection rules defined', () => {
      const notation = getNotation('aiml')!;
      expect(notation.connectionRules.length).toBeGreaterThan(0);
    });

    it('agent can connect to llm, tool, memory', () => {
      const notation = getNotation('aiml')!;
      const agentRule = notation.connectionRules.find((r) => r.from === 'aiml-agent');
      expect(agentRule).toBeDefined();
      expect(agentRule!.to).toContain('aiml-llm');
      expect(agentRule!.to).toContain('aiml-tool');
      expect(agentRule!.to).toContain('aiml-memory');
    });

    it('prompt connects to llm', () => {
      const notation = getNotation('aiml')!;
      const promptRule = notation.connectionRules.find((r) => r.from === 'aiml-prompt');
      expect(promptRule).toBeDefined();
      expect(promptRule!.to).toContain('aiml-llm');
    });

    it('retriever connects to vector-store', () => {
      const notation = getNotation('aiml')!;
      const retrieverRule = notation.connectionRules.find((r) => r.from === 'aiml-retriever');
      expect(retrieverRule).toBeDefined();
      expect(retrieverRule!.to).toContain('aiml-vector-store');
    });
  });

  describe('validation', () => {
    it('does not enforce the unreviewed guardrail branch rule in typical mode', () => {
      const nodes: GraphNode[] = [
        { id: 'guard', type: 'aiml-guardrail' },
        { id: 'llm', type: 'aiml-llm' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'guard', target: 'llm' },
      ];

      const report = draftReport(nodes, edges);
      const guardError = report.findings.find((finding) => finding.id === 'guardrail-branches');
      expect(guardError).toBeUndefined();
      expect(report.unverifiedObligations).toEqual([]);
      expect(report.claimStatus).toBe('not-claimed');
    });

    it('guardrail with 2 outgoing passes', () => {
      const nodes: GraphNode[] = [
        { id: 'guard', type: 'aiml-guardrail' },
        { id: 'llm', type: 'aiml-llm' },
        { id: 'reject', type: 'aiml-model' },
      ];
      const edges: GraphEdge[] = [
        { id: 'e1', source: 'guard', target: 'llm' },
        { id: 'e2', source: 'guard', target: 'reject' },
      ];

      const report = draftReport(nodes, edges);
      const guardError = report.findings.find((finding) => finding.id === 'guardrail-branches');
      expect(guardError).toBeUndefined();
    });

    it('does not emit unreviewed disconnected-model advice in typical mode', () => {
      const nodes: GraphNode[] = [
        { id: 'model', type: 'aiml-model' },
      ];
      const edges: GraphEdge[] = [];

      const report = draftReport(nodes, edges);
      const warning = report.findings.find((finding) => finding.subject?.id === 'model');
      expect(warning).toBeUndefined();
    });

    it('does not emit unreviewed disconnected-retriever advice in typical mode', () => {
      const nodes: GraphNode[] = [
        { id: 'ret', type: 'aiml-retriever' },
      ];
      const edges: GraphEdge[] = [];

      const report = draftReport(nodes, edges);
      const warning = report.findings.find((finding) => finding.subject?.id === 'ret');
      expect(warning).toBeUndefined();
    });
  });
});
