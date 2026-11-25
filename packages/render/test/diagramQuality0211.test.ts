import { describe, expect, it } from 'vitest';
import {
  analyzeNormalizedDiagram0211,
  evaluatePreparedSceneQuality0211,
  type NormalizedDiagram0211,
} from '../src/quality/diagramQuality0211.js';
import { completeSpatialSource029 } from './helpers/spatialQuality029.js';

const DATA_ENG_LARGE = `@diagram data-engineering
web stream [symbol: "data-stream"] as "Web events stream"
cdc cdc [symbol: "data-cdc"] as "Billing DB CDC feed"
crm source [symbol: "data-source"] as "CRM nightly CSV drop"
bronze lake [symbol: "data-lake"] as "Bronze raw landing zone"
schema schema [symbol: "data-schema"] as "Avro schema registry"
enrich transform [symbol: "data-transform"] as "Sessionize & join user IDs"
agg transform [symbol: "data-transform"] as "Hourly revenue rollup"
dq quality [symbol: "data-quality"] as "Freshness & anomaly gate"
silver lake [symbol: "data-lake"] as "Silver conformed tables"
catalog catalog [symbol: "data-catalog"] as "Lineage & governance catalog"
gold warehouse [symbol: "data-warehouse"] as "Gold Snowflake warehouse"
execDash dashboard [symbol: "data-dashboard"] as "Finance & executive BI"
opsDash dashboard [symbol: "data-dashboard"] as "Live SLA operations board"
alerts sink [symbol: "data-sink"] as "PagerDuty webhook sink"
trainSink sink [symbol: "data-sink"] as "ML training parquet export"
e1 = web -> bronze [streamFlow]
e2 = cdc -> bronze [streamFlow]
e3 = crm -> bronze [batchFlow]
e4 = schema -> enrich [quality]
e5 = bronze -> enrich [batchFlow]
e6 = bronze -> agg [batchFlow]
e7 = enrich -> dq [quality]
e8 = agg -> dq [quality]
e9 = dq -> silver [batchFlow]
e10 = silver -> catalog [quality]
e11 = silver -> gold [batchFlow]
e12 = gold -> execDash [batchFlow]
e13 = gold -> opsDash [batchFlow]
e14 = gold -> alerts [streamFlow]
e15 = gold -> trainSink [batchFlow]
`;

const ARCH_LARGE_GROUPED = `@diagram architecture
client actor [symbol: "arch-actor"] as "Browser client"
edge group as "Edge & Ingress" {
  cdn cdn [symbol: "arch-cdn"] as "Edge CDN"
  lb loadBalancer [symbol: "arch-load-balancer"] as "Ingress ALB"
}
core group as "Core Microservices" {
  gw service [symbol: "arch-service"] as "API gateway"
  billing service [symbol: "arch-service"] as "Billing service"
  inventory service [symbol: "arch-service"] as "Inventory service"
  events queue [symbol: "arch-queue"] as "Domain event bus"
  notifier fn [symbol: "arch-function"] as "Webhook worker"
}
storage group as "Data & External" {
  db database [symbol: "arch-database"] as "Orders Postgres"
  s3 storage [symbol: "arch-storage"] as "Audit bucket"
  ext external [symbol: "arch-external-api"] as "Payment gateway"
}
e1 = client -> edge.cdn [calls]
e2 = edge.cdn -> edge.lb [calls]
e3 = edge.lb -> core.gw [calls]
e4 = core.gw -> core.billing [calls]
e5 = core.gw -> core.inventory [calls]
e6 = core.billing -> core.events [publishes]
e7 = core.events -> core.notifier [subscribes]
e8 = core.billing -> storage.db [writes]
e9 = core.inventory -> storage.db [reads]
e10 = core.billing -> storage.ext [calls]
e11 = core.notifier -> storage.s3 [writes]
`;

describe('Slice 10: Mechanical Diagram Rendering Quality Gate (DRQ-01..DRQ-23)', () => {
  it('scores a clean aligned 2-node diagram with 0 hard defects and high composite score', () => {
    const clean: NormalizedDiagram0211 = {
      id: 'clean-chain',
      direction: 'RIGHT',
      viewport: { width: 420, height: 160 },
      groups: [],
      nodes: [
        { id: 'a', glyphBBox: { x: 40, y: 40, width: 100, height: 80 }, fullBBox: { x: 40, y: 40, width: 100, height: 80 } },
        { id: 'b', glyphBBox: { x: 280, y: 40, width: 100, height: 80 }, fullBBox: { x: 280, y: 40, width: 100, height: 80 } },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', polyline: [{ x: 140, y: 80 }, { x: 280, y: 80 }], orthogonal: true },
      ],
      texts: [
        { id: 'a:t', text: 'Source', bbox: { x: 60, y: 70, width: 60, height: 20 }, ownerKind: 'node', ownerId: 'a' },
        { id: 'b:t', text: 'Target', bbox: { x: 300, y: 70, width: 60, height: 20 }, ownerKind: 'node', ownerId: 'b' },
      ],
    };
    const report = analyzeNormalizedDiagram0211(clean);
    expect(report.tier1.pass).toBe(true);
    expect(report.tier1.totalHardDefects).toBe(0);
    expect(report.tier2.straightEdgeRatio).toBe(1);
    expect(report.tier2.globalAlignmentMedianPx).toBe(0);
    expect(report.tier2.compositeScore).toBeGreaterThanOrEqual(95);
  });

  it('catches coincident parallel edge spans, colliding port arrivals, and intra-group misalignment', () => {
    const defective: NormalizedDiagram0211 = {
      id: 'synthetic-defects',
      direction: 'RIGHT',
      viewport: { width: 520, height: 340 },
      groups: [{ id: 'g1', bbox: { x: 280, y: 20, width: 200, height: 300 } }],
      nodes: [
        { id: 'src', glyphBBox: { x: 40, y: 120, width: 100, height: 80 }, fullBBox: { x: 40, y: 120, width: 100, height: 80 } },
        { id: 't1', glyphBBox: { x: 310, y: 40, width: 100, height: 80 }, fullBBox: { x: 310, y: 40, width: 100, height: 80 }, groupId: 'g1' },
        { id: 't2', glyphBBox: { x: 340, y: 200, width: 100, height: 80 }, fullBBox: { x: 340, y: 200, width: 100, height: 80 }, groupId: 'g1' },
      ],
      edges: [
        // Both edges overlap vertically along x = 220 AND share nearly the same departure point on src.
        { id: 'e1', sourceId: 'src', targetId: 't1', polyline: [{ x: 140, y: 158 }, { x: 220, y: 158 }, { x: 220, y: 80 }, { x: 310, y: 80 }], orthogonal: true },
        { id: 'e2', sourceId: 'src', targetId: 't2', polyline: [{ x: 140, y: 162 }, { x: 220, y: 162 }, { x: 220, y: 120 }, { x: 220, y: 240 }, { x: 340, y: 240 }], orthogonal: true },
      ],
      texts: [],
    };
    const report = analyzeNormalizedDiagram0211(defective);
    expect(report.tier1.pass).toBe(false);
    expect(report.tier1.coincidentEdgeSpans).toBeGreaterThanOrEqual(1);
    expect(report.tier1.collidingPortContacts).toBeGreaterThanOrEqual(1);
    expect(report.tier2.intraGroupAlignmentMaxPx).toBeCloseTo(30, 1);
    expect(report.tier2.intraGroupMisalignedGroups).toContain('g1');
  });

  it('Slice 50 gate: Data Engineering RIGHT (render 4) passes Tier-1 with straight Billing->Bronze and separated Gold fan-out', async () => {
    const { scene } = await completeSpatialSource029(DATA_ENG_LARGE, 'hifi', 'RIGHT');
    const report = evaluatePreparedSceneQuality0211(scene, { id: 'data-eng-large-right', direction: 'RIGHT', orthogonal: true });
    expect(report.tier1.pass).toBe(true);
    expect(report.tier1.coincidentEdgeSpans).toBe(0);
    expect(report.tier1.collidingPortContacts).toBe(0);
    expect(report.tier2.avoidableJogEdgeIds).not.toContain('e2');
  });

  it('Slice 50 gate: Data Engineering DOWN (render 5) passes Tier-1 with separated Gold fan-out stems', async () => {
    const { scene } = await completeSpatialSource029(DATA_ENG_LARGE, 'hifi', 'DOWN');
    const report = evaluatePreparedSceneQuality0211(scene, { id: 'data-eng-large-down', direction: 'DOWN', orthogonal: true });
    expect(report.tier1.pass).toBe(true);
    expect(report.tier1.coincidentEdgeSpans).toBe(0);
    expect(report.tier1.collidingPortContacts).toBe(0);
  });

  it('Slice 60 gate: Grouped Architecture RIGHT (render 7) passes Tier-1 with 0 overlaps, 0 port collisions, 0 diagonals, and aligned Data & External column', async () => {
    const { scene } = await completeSpatialSource029(ARCH_LARGE_GROUPED, 'hifi', 'RIGHT');
    const report = evaluatePreparedSceneQuality0211(scene, { id: 'arch-large-grouped-right', direction: 'RIGHT', orthogonal: true });
    expect(report.tier1.pass).toBe(true);
    expect(report.tier1.coincidentEdgeSpans).toBe(0);
    expect(report.tier1.collidingPortContacts).toBe(0);
    expect(report.tier1.nonOrthogonalSegments).toBe(0);
    expect(report.tier2.intraGroupAlignmentMaxPx).toBeLessThanOrEqual(1);
    expect(report.tier2.intraGroupMisalignedGroups).toEqual([]);
  });
});
