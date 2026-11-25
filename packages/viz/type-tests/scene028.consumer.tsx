/** External React consumer: the viz package only projects renderer-owned
 * geometry and accepts the same typed scene as the SVG serializer. */
import type { GraphIR } from '@graph-ir/core';
import { prepareSpatialScene028 } from '@coral-viz/render';
import { SpatialSceneSvg028 } from '@coral-viz/viz';

declare const laidOutGraph: GraphIR;

const scene = prepareSpatialScene028(laidOutGraph, { style: 'lowfi' });
export const diagram = <SpatialSceneSvg028 scene={scene} decorative />;
