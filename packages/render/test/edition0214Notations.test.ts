import { describe, expect, it } from 'vitest';
import { HEADER_MANIFEST_028 } from '@coral-viz/language';
import {
  getAvailableNotations028,
  getAvailableNotations0214,
  notationCatalogIdentity028,
  notationCatalogIdentity0214,
  parseInstalledDocument028,
  prepareSpatialScene028,
  renderSvg,
  parrotfish,
} from '../src/index.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { evaluatePreparedSceneQuality0214 } from '../src/quality/diagramQuality0214.js';

async function render0214(source: string, direction: 'RIGHT' | 'DOWN' = 'RIGHT') {
  const parsed = parseInstalledDocument028(source);
  expect(parsed.header.diagnostics).toEqual([]);
  expect(parsed.syntax.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const graph = parsed.graph ?? parsed.syntax.graph;
  expect(graph).toBeDefined();
  const notation = parsed.header.header!.diagramType;
  const laid = await layoutGraphForSvg(graph, {
    direction,
    svgOptions: { notation, style: 'hifi', layoutDirection: direction },
  });
  const hifi = renderSvg(laid, { notation, style: 'hifi', layoutDirection: direction, edgeRoutes: laid.edgeRoutes });
  const ane = renderSvg(laid, { notation, renderStyle: 'ane', layoutDirection: direction, edgeRoutes: laid.edgeRoutes });
  const sceneHifi = prepareSpatialScene028(laid, { notation, style: 'hifi', layoutDirection: direction, edgeRoutes: laid.edgeRoutes });
  const sceneAne = prepareSpatialScene028(laid, { notation, renderStyle: 'anemone', layoutDirection: direction, edgeRoutes: laid.edgeRoutes });
  return { parsed, laid, hifi, ane, sceneHifi, sceneAne, notation };
}

describe('Coral 0.2.14 notations (block, architecture, infrastructure, erd, N1)', () => {
  it('keeps all 0.2.8 catalog digests immutable and matches every 0.2.14 manifest digest', () => {
    for (const [id, entry] of Object.entries(HEADER_MANIFEST_028['0.2.8']!)) {
      expect(notationCatalogIdentity028(id)?.digest).toBe(entry.catalogs[0]!.digest);
    }
    for (const [id, entry] of Object.entries(HEADER_MANIFEST_028['0.2.14']!)) {
      const got = notationCatalogIdentity0214(id);
      expect(got?.version).toBe(entry.catalogs[0]!.version);
      expect(got?.digest).toBe(entry.catalogs[0]!.digest);
    }
    expect(getAvailableNotations028().map((n) => n.id)).not.toContain('erd');
    expect(getAvailableNotations028().map((n) => n.id)).not.toContain('infrastructure');
    expect(getAvailableNotations0214().map((n) => n.id)).toContain('erd');
    expect(getAvailableNotations0214().map((n) => n.id)).toContain('infrastructure');
  });

  it('Slice 40: renders expanded freeform @diagram block shapes and inline styles in hifi and anemone', async () => {
    const src = [
      '@diagram block',
      '@coralVersion "0.2.14"',
      'input circle as "Sensor Input"',
      'filter rounded as "Noise Filter"',
      'amp triangle [style: "blue"] as "Gain Stage"',
      'alert diamond [style: "red, dashed"] as "Threshold Alert"',
      'store cylinder as "Telemetry Store"',
      'done pill as "Publish"',
      'input -> filter as "raw"',
      'filter -> amp as "clean"',
      'amp -> alert [style: "red, dashed"] as "spike"',
      'amp -> store as "archive"',
      'store -> done',
      '',
    ].join('\n');
    const { hifi, ane, sceneHifi, sceneAne } = await render0214(src, 'RIGHT');
    expect(hifi).toContain('#0000FF');
    expect(hifi).toContain('#FF0000');
    expect(hifi).toContain('6 4');
    expect(ane).toContain('#f8fafc');
    expect(ane).toContain('anemone-shadow-sm');
    expect(evaluatePreparedSceneQuality0214(sceneHifi).tier1.pass).toBe(true);
    expect(evaluatePreparedSceneQuality0214(sceneHifi).livingCompositeScore).toBeGreaterThanOrEqual(85);
    expect(evaluatePreparedSceneQuality0214(sceneAne).tier1.pass).toBe(true);
    expect(evaluatePreparedSceneQuality0214(sceneAne).livingCompositeScore).toBeGreaterThanOrEqual(90);
  });

  it('Slice 50: renders C4-grade @diagram architecture with technology/description in monochrome hifi and anemone', async () => {
    const src = [
      '@diagram architecture',
      '@coralVersion "0.2.14"',
      'shopper person [description: "Buys products online"] as "Shopper"',
      'stripe externalSystem [description: "Card processor"] as "Stripe"',
      'platform systemBoundary as "E-Commerce System" {',
      '  web container [technology: "React SPA", description: "Catalog UI"] as "Web Storefront"',
      '  api container [technology: "Go / gRPC", description: "Orders API"] as "Order Service"',
      '  db database [technology: "PostgreSQL", description: "Orders ledger"] as "Orders DB"',
      '}',
      'shopper -> platform.web [technology: "HTTPS"] as "Browses"',
      'platform.web -> platform.api [technology: "JSON / HTTPS"] as "Submits"',
      'platform.api -> platform.db [data, technology: "SQL"] as "Reads/writes"',
      'platform.api -> stripe [technology: "HTTPS"] as "Charges"',
      '',
    ].join('\n');
    const { hifi, ane, laid } = await render0214(src, 'DOWN');
    expect(hifi).toContain('[React SPA]');
    expect(hifi).toContain('Browses [HTTPS]');
    expect(hifi).toContain('6 3');
    // Default hifi stays monochrome (no anemone palette)
    expect(hifi).not.toContain('#f8fafc');
    expect(hifi).not.toContain('anemone-shadow-sm');
    expect(ane).toContain('#f8fafc');
    expect(ane).toContain('#0e7490');
    expect(ane).toContain('anemone-shadow-sm');
    // Parrotfish custom model preserves exact layout/routes
    const custom = parrotfish(laid, { name: 'brand', extends: 'anemone', nodes: { 'platform.web': { stroke: '#123456' } } },
      { svgOptions: { notation: 'architecture', layoutDirection: 'DOWN', edgeRoutes: laid.edgeRoutes } });
    expect(custom.svg).toContain('#123456');
  });

  it('Slice 55: renders @diagram infrastructure with nested VPC/subnets and AWS/Azure/GCP providers', async () => {
    const src = [
      '@diagram infrastructure',
      '@coralVersion "0.2.14"',
      'users users as "Internet Users"',
      'cf cdn [provider: "aws", technology: "CloudFront"] as "Edge CDN"',
      'vpc vpc [provider: "aws", technology: "10.0.0.0/16"] as "Prod VPC" {',
      '  pub subnet [variant: "public"] as "Public Subnet" {',
      '    alb loadBalancer [provider: "aws", technology: "ALB"] as "Load Balancer"',
      '  }',
      '  priv subnet [variant: "private"] as "Private Subnet" {',
      '    api container [provider: "aws", technology: "ECS Fargate"] as "Orders API"',
      '    db database [provider: "aws", technology: "RDS Aurora"] as "Orders DB"',
      '  }',
      '}',
      'users -> cf [technology: "HTTPS"]',
      'cf -> vpc.pub.alb as "Origin"',
      'vpc.pub.alb -> vpc.priv.api [technology: "HTTP"]',
      'vpc.priv.api -> vpc.priv.db [data, technology: "SQL"]',
      '',
    ].join('\n');
    const { hifi, ane } = await render0214(src, 'RIGHT');
    expect(hifi).toContain('Prod VPC [10.0.0.0/16]');
    expect(hifi).toContain('[ECS Fargate]');
    expect(ane).toContain('#c2410c');
  });

  it('Slice 60: renders Crow\'s Foot @diagram erd entity tables, cardinality markers, and endpoint labels', async () => {
    const src = [
      '@diagram erd',
      '@coralVersion "0.2.14"',
      'users entity as "Users" {',
      '  columns {',
      '    id uuid [pk]',
      '    email varchar(255) [uk, not null]',
      '    bio text [null]',
      '  }',
      '}',
      'orders entity as "Orders" {',
      '  columns {',
      '    id uuid [pk]',
      '    user_id uuid [fk, not null]',
      '    total decimal(10, 2) [not null]',
      '  }',
      '}',
      'items weakEntity as "Order Items" {',
      '  columns {',
      '    id uuid [pk]',
      '    order_id uuid [fk, not null]',
      '    qty int [not null]',
      '  }',
      '}',
      'users ||--o{ orders [firstLabel: "1", secondLabel: "0..*"] as "places"',
      'orders ||--|{ items [firstLabel: "1", secondLabel: "1..*"] as "contains"',
      '',
    ].join('\n');
    const { hifi, ane } = await render0214(src, 'RIGHT');
    expect(hifi).toContain('PK id: uuid');
    expect(hifi).toContain('bio: text?');
    expect(hifi).toContain('M4 5 A3 3');
    expect(hifi).toContain('M7 2 L7 14');
    for (const svg of [hifi, ane]) {
      expect(svg).toContain('markerWidth="14" markerHeight="14"');
      expect(svg).toContain('markerWidth="10" markerHeight="10"');
    }
    expect(ane).toContain('anemone-header-band');
    expect(ane).toContain('#eef2ff');
    expect(ane).toContain('#fffbeb');
  });
});
