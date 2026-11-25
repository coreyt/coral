import { describe, expect, it } from 'vitest';
import {
  SHAPE_SIDE_SPANS_0211,
  allocateSidePortSlots0211,
  auditCatalogPortContracts0211,
  preferredFlowSides0211,
  shapePortCapacity0211,
} from '../src/layout/portSlotAllocator0211.js';
import { shapeRegistry } from '../src/shapes/index.js';
import { symbolRegistry } from '../src/symbols/index.js';
import { resolveNotationNode028 } from '../src/notations/index.js';
import { semanticLayoutPorts028 } from '../src/semanticLayoutPorts028.js';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';

describe('Slice 40: Stencil, Symbol, Port & Anchor Contract (portSlotAllocator0211)', () => {
  it('verifies all 32 catalog shapes have explicit spans and finite in-frame contour slots on all 4 sides', () => {
    const audit = auditCatalogPortContracts0211();
    expect(audit.totalShapes).toBe(32);
    expect(audit.shapesWithValidSpans).toBe(32);
    for (const shape of shapeRegistry.getAll()) {
      expect(SHAPE_SIDE_SPANS_0211[shape.id], shape.id).toBeDefined();
    }
    for (const row of audit.shapeRows) {
      expect(row.allSlotsValid, row.shapeId).toBe(true);
      expect(row.cleanCapacity.NORTH, `${row.shapeId}:N`).toBeGreaterThanOrEqual(2);
      expect(row.cleanCapacity.SOUTH, `${row.shapeId}:S`).toBeGreaterThanOrEqual(2);
      expect(row.cleanCapacity.EAST, `${row.shapeId}:E`).toBeGreaterThanOrEqual(2);
      expect(row.cleanCapacity.WEST, `${row.shapeId}:W`).toBeGreaterThanOrEqual(2);
    }
  });

  it('allocates symmetric multi-slot contour points with >= 12 px pitch within capacity and flags overflow', () => {
    // Cylinder 100x80 glyph inside 100x114 composite (glyph + 34px caption) fits 4 clean slots on EAST.
    const cap = shapePortCapacity0211('cylinder', 'EAST', 100, 80, 12);
    expect(cap).toBeGreaterThanOrEqual(4);
    const alloc3 = allocateSidePortSlots0211('cylinder', 'EAST', 3, 100, 114, { notationId: 'architecture', symbolId: 'arch-database' });
    expect(alloc3.slots).toHaveLength(3);
    expect(alloc3.exceedsPreferredCapacity).toBe(false);
    expect(alloc3.pitchPx).toBeGreaterThanOrEqual(12);
    expect(alloc3.spillSides).toEqual(['NORTH']); // bottom-captioned in architecture => SOUTH excluded (DRQ-16)
    // Monotonic Y ordering along EAST side with >= 12 px vertical separation.
    expect(alloc3.slots[1]!.localPoint.y - alloc3.slots[0]!.localPoint.y).toBeGreaterThanOrEqual(11.9);
    expect(alloc3.slots[2]!.localPoint.y - alloc3.slots[1]!.localPoint.y).toBeGreaterThanOrEqual(11.9);

    // 6 incoming edges on a 50px-tall parallelogram exceed clean capacity and compress cleanly >= 4 px floor.
    const alloc6 = allocateSidePortSlots0211('parallelogram', 'WEST', 6, 100, 84, { notationId: 'architecture', symbolId: 'arch-queue' });
    expect(alloc6.slots).toHaveLength(6);
    expect(alloc6.exceedsPreferredCapacity).toBe(true);
    expect(alloc6.pitchPx).toBeGreaterThanOrEqual(4);
  });

  it('enforces DRQ-16: free/auto ports avoid caption sides in RIGHT (bottom caption) and DOWN (right caption)', () => {
    expect(preferredFlowSides0211('DOWN', 'source', true)).not.toContain('SOUTH');
    expect(preferredFlowSides0211('UP', 'target', true)).not.toContain('SOUTH');
    expect(preferredFlowSides0211('DOWN', 'source', false, true)).not.toContain('EAST');
    expect(preferredFlowSides0211('DOWN', 'source', false, true)[0]).toBe('SOUTH');
    expect(preferredFlowSides0211('DOWN', 'source', false)[0]).toBe('SOUTH');

    // Domain icon (aiml-model / brain): right-side caption in DOWN allows straight SOUTH exit while avoiding EAST;
    // bottom caption in RIGHT avoids SOUTH.
    const modelInterp = resolveNotationNode028({ id: 'm', type: 'model', symbol: 'aiml-model', label: 'Model' }, 'aiml');
    const modelSym = symbolRegistry.get('aiml-model');
    const modelDown = semanticLayoutPorts028(modelInterp, modelSym, undefined, 'DOWN');
    expect(modelDown.ports.find((p) => p.id === 'out')?.side).toBe('SOUTH');
    expect(modelDown.ports.every((p) => p.side !== 'EAST')).toBe(true);
    const modelRight = semanticLayoutPorts028(modelInterp, modelSym, undefined, 'RIGHT');
    expect(modelRight.ports.every((p) => p.side !== 'SOUTH')).toBe(true);

    // Open-interior flowchart process keeps SOUTH in DOWN.
    const procInterp = resolveNotationNode028({ id: 'p', type: 'process', symbol: 'flowchart-process', label: 'Build' }, 'flowchart');
    const procSym = symbolRegistry.get('flowchart-process');
    const procDown = semanticLayoutPorts028(procInterp, procSym, undefined, 'DOWN');
    expect(procDown.ports.find((p) => p.id === 'out')?.side).toBe('SOUTH');
  });

  it('cloud shape projects finite contour slots on all 4 sides while preserving frozen catalog digest', () => {
    for (const side of ['NORTH', 'SOUTH', 'EAST', 'WEST'] as const) {
      const alloc = allocateSidePortSlots0211('cloud', side, 3, 120, 80);
      expect(alloc.slots).toHaveLength(3);
      for (const slot of alloc.slots) {
        expect(Number.isFinite(slot.localPoint.x), `${side}:${slot.index}:x`).toBe(true);
        expect(Number.isFinite(slot.localPoint.y), `${side}:${slot.index}:y`).toBe(true);
      }
    }
  });

  it('preserves authored semantic ports end-to-end across SuccessorSource -> GraphIR -> layout -> PreparedSpatialScene', async () => {
    const source = [
      '@diagram architecture',
      'svc service [symbol: "arch-service"] as "Orders API"',
      'db database [symbol: "arch-database"] as "Orders Postgres"',
      'e1 = svc -> db [writes]',
      '',
    ].join('\n');
    const proj = projectInstalledSourceToSuccessor028(source);
    expect(proj.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const successor = proj.graph!;
    successor.nodes[0]!.semanticPorts = [{ id: 'dbOut', direction: 'out', anchor: 'E' }];
    successor.nodes[1]!.semanticPorts = [{ id: 'sql', direction: 'in', anchor: 'W' }];
    successor.edges[0]!.first.port = 'dbOut';
    successor.edges[0]!.second.port = 'sql';
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(successor);
    expect(display.edges[0]?.sourcePort).toBe('dbOut');
    expect(display.edges[0]?.targetPort).toBe('sql');
    const laid = await layoutGraphForSvg(display, { direction: 'RIGHT', svgOptions: { style: 'hifi' }, semanticInterpretations });
    const scene = prepareSpatialScene028(laid, {
      style: 'hifi',
      layoutDirection: 'RIGHT',
      edgeRoutes: laid.edgeRoutes,
      semanticGraph: display,
      successorSource: successor,
    });
    expect(scene.status).toBe('complete');
    expect(scene.portContacts['svc']?.['dbOut']).toBeDefined();
    expect(scene.portContacts['db']?.['sql']).toBeDefined();
  });
});
