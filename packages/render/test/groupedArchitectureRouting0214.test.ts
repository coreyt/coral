import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { successorSourceDisplayWithSemanticPorts028 } from '../src/successorSourceDisplay028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { prepareSpatialScene028 } from '../src/svg/serialize.js';
import { evaluatePreparedSceneQuality0211 } from '../src/quality/diagramQuality0211.js';

// Grouped C4 benchmark: caption-aware repairs must survive final validation.
const source = `@diagram architecture
@coralVersion "0.2.14"
edge boundary as "Edge Tier" {
  web person as "Web Client"
  mobile person as "Mobile Client"
  gw gateway [technology: "Envoy"] as "API Gateway"
}
core boundary as "Core Services" {
  auth container [technology: "Go"] as "Auth Service"
  catalog container [technology: "Go"] as "Catalog Service"
  checkout container [technology: "Go"] as "Checkout Service"
  bus queue [technology: "Kafka"] as "Event Bus"
}
data boundary as "Data Tier" {
  pg database [technology: "PostgreSQL"] as "Primary Postgres"
  redis database [technology: "Redis"] as "Redis Cache"
  s3 storage [technology: "Object Store"] as "Asset Bucket"
}
edge.web -> edge.gw [technology: "HTTPS"]
edge.mobile -> edge.gw [technology: "HTTPS"]
edge.gw -> core.auth [technology: "gRPC"]
edge.gw -> core.catalog [technology: "gRPC"]
edge.gw -> core.checkout [technology: "gRPC"]
core.catalog -> data.redis as "GET/SET"
core.catalog -> data.s3 as "Fetch media"
core.checkout -> data.pg as "Write order"
core.checkout -> core.bus as "Publish"
core.auth -> data.pg as "Verify user"
`;

describe('grouped architecture routing in edition 0.2.14', () => {
  it.each(['hifi', 'anemone'] as const)(
    'clears captions, cylinder approaches, and container borders in %s',
    async (renderStyle) => {
      const projected = projectInstalledSourceToSuccessor028(source);
      expect(projected.diagnostics).toEqual([]);
      const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(projected.graph!);
      const laid = await layoutGraphForSvg(display, {
        direction: 'RIGHT', semanticInterpretations, svgOptions: { renderStyle },
      });
      const scene = prepareSpatialScene028(laid, {
        renderStyle, edgeRoutes: laid.edgeRoutes, layoutDirection: 'RIGHT',
        semanticGraph: display, successorSource: projected.graph!,
      });
      expect(scene.status).toBe('complete');
      const report = evaluatePreparedSceneQuality0211(scene, { direction: 'RIGHT' });
      expect(report.tier1.findings).toEqual([]);
      expect(report.tier1.pass).toBe(true);
      expect(report.tier2.compositeScore).toBeGreaterThanOrEqual(90);
    },
  );
});
