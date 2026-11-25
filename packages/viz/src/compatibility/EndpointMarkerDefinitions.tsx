/**
 * SVG marker definitions for the endpoint markers used by projected edges.
 * Emits only the descriptors present, keyed by the shared render marker ID.
 */

import { useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import { markerDomId028, markerPrimitives, visualStyle028, type EndpointMarker } from '@coral-viz/render';
import { getEdgeStyleForStatus, type CompatibilityEdgeData } from './CompatibilityEdge.js';

export interface EndpointMarkerDefinitionsProps {
  edges: Edge[];
  markerNamespace028?: string;
}

export function EndpointMarkerDefinitions({ edges, markerNamespace028 = 'canvas' }: EndpointMarkerDefinitionsProps) {
  const definitions = useMemo(() => {
    const out = new Map<string, { marker: EndpointMarker; stroke: string }>();
    for (const edge of edges) {
      const data = edge.data as CompatibilityEdgeData | undefined;
      const visual = visualStyle028(data?.renderStyle028 ?? 'lowfi', data?.renderTheme028 ?? 'light');
      const stroke = String(getEdgeStyleForStatus(data?.compatibilityStatus, {
        ...edge.style, stroke: visual.ink, strokeWidth: visual.strokeWidth,
      }).stroke ?? visual.ink);
      for (const marker of [data?.sourceEndpoint?.marker, data?.targetEndpoint?.marker]) {
        if (marker && marker.kind !== 'none') out.set(markerDomId028(marker, stroke, markerNamespace028), { marker, stroke });
      }
    }
    return [...out.entries()];
  }, [edges, markerNamespace028]);
  if (!definitions.length) return null;
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        {definitions.map(([id, definition]) => (
          <marker key={id} id={id} viewBox="0 0 16 16" refX="14" refY="8" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="strokeWidth">
            {markerPrimitives(definition.marker).map((primitive, index) => (
              <path key={index} d={primitive.d} fill={primitive.filled ? definition.stroke : 'none'} stroke={definition.stroke} strokeWidth="1.5" />
            ))}
          </marker>
        ))}
      </defs>
    </svg>
  );
}
