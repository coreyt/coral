/** React projection of the renderer's already-resolved spatial scene.
 * This component must not choose a stencil, measure text, or route an edge. */
import React, { useId, useMemo } from 'react';
import { embeddedFontCssFor, markerId, markerPrimitives, sceneArtworkDefinitions029,
  type PreparedSpatialScene028, type ScenePartRecord028 } from '@coral-viz/render';

export interface SpatialSceneSvg028Props {
  scene: PreparedSpatialScene028;
  /** Distinguishes SVG definitions when multiple diagrams share a page. */
  namespace?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  description?: string;
  /** Hide the drawing from assistive technology when interaction owners supply names. */
  decorative?: boolean;
}

export function SpatialSceneMarkerDefs028({ scene, namespace }: {
  scene: PreparedSpatialScene028;
  namespace: string;
}): React.ReactElement {
  const markers = new Map<string, Extract<ScenePartRecord028['geometry'], { kind: 'marker' }>>();
  for (const part of scene.parts) {
    if (part.geometry.kind !== 'marker') continue;
    markers.set(markerId(part.geometry.marker, part.geometry.stroke), part.geometry);
  }
  return <defs>{[...markers].map(([id, { marker, stroke }]) =>
    <marker key={id} id={`${namespace}-${id}`} viewBox="0 0 16 16"
      refX="14" refY="8" markerWidth="10" markerHeight="10"
      orient="auto-start-reverse" markerUnits="strokeWidth">
      {markerPrimitives(marker).map((primitive, index) =>
        <path key={index} d={primitive.d}
          fill={primitive.filled ? stroke : 'none'}
          stroke={stroke} strokeWidth="1.5" />)}
    </marker>)}</defs>;
}

/** The scene's user-symbol definitions, once per canvas. The text is the SVG
 * serializer's own output, generated from the admitted artwork model by its
 * escaping writer and never from input bytes, so canvas and SVG cannot drift. */
export function SpatialSceneArtworkDefs029({ scene, namespace }: {
  scene: Pick<PreparedSpatialScene028, 'artwork029'>;
  namespace: string;
}): React.ReactElement | null {
  const definitions = scene.artwork029;
  const html = useMemo(() => definitions ? sceneArtworkDefinitions029(definitions, namespace) : '',
    [definitions, namespace]);
  return html ? <defs data-coral-artwork-definitions="" dangerouslySetInnerHTML={{ __html: html }} /> : null;
}

/** Paint one typed part. Its coordinates and paint order come from the scene. */
export function SpatialScenePart028({ part, namespace }: {
  part: ScenePartRecord028;
  namespace: string;
}): React.ReactElement {
  const geometry = part.geometry;
  const partId = part.id;
  switch (geometry.kind) {
    case 'route':
      return <path data-coral-part-id={partId} d={geometry.d} fill="none"
        stroke={geometry.stroke} strokeWidth={geometry.strokeWidth}
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={geometry.dash}
        markerStart={geometry.markerStart ? `url(#${namespace}-${geometry.markerStart})` : undefined}
        markerEnd={geometry.markerEnd ? `url(#${namespace}-${geometry.markerEnd})` : undefined} />;
    case 'marker':
      return <g data-coral-part-id={partId}
        data-coral-marker-contact={`${geometry.contact.x},${geometry.contact.y}`}
        aria-hidden="true" />;
    case 'stencil-path': {
      const { x, y, scale } = geometry.transform;
      return <g transform={`translate(${x},${y}) scale(${scale})`}>
        <path data-coral-part-id={partId} d={geometry.d} fill={geometry.fill}
          stroke={geometry.stroke} strokeWidth={Number(geometry.strokeWidth.toFixed(4))}
          strokeLinecap={geometry.strokeLinecap} strokeLinejoin={geometry.strokeLinejoin}
          strokeDasharray={geometry.strokeDasharray} transform={geometry.innerTransform} />
      </g>;
    }
    case 'decoration-path': {
      const { x, y, scaleX, scaleY } = geometry.transform;
      return <g role={part.role === 'glyph' ? undefined : 'img'}
        aria-label={part.role === 'glyph' ? undefined : geometry.name}
        data-coral-symbol-marker={part.role === 'symbol-marker' ? geometry.symbolMarkerId : undefined}
        transform={`translate(${x},${y}) scale(${scaleX},${scaleY})`}>
        {part.role !== 'glyph' && <title>{geometry.name}</title>}
        <path data-coral-part-id={partId} d={geometry.d} fill={geometry.fill}
          stroke={geometry.stroke} strokeWidth={geometry.strokeWidth}
          strokeLinecap="round" strokeLinejoin="round" />
      </g>;
    }
    case 'artwork': {
      const { x, y, width, height } = geometry.frame;
      // The React form of the serializer's decorative <use> (userSymbolSvgInstance029).
      return <g data-coral-part-id={partId} data-coral-artwork={geometry.symbolId}>
        {width > 0 && height > 0 && <use href={`#${namespace}-coral-sym-${geometry.localId}`}
          x={x} y={y} width={width} height={height} aria-hidden="true" color={geometry.tint} />}
      </g>;
    }
    case 'divider':
      return <line data-coral-part-id={partId} data-coral-classifier-separator={partId}
        x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2}
        stroke={geometry.stroke} strokeWidth={geometry.strokeWidth} />;
    case 'text':
      return <>{geometry.background && <rect data-coral-label-background={partId}
        x={geometry.inkBounds.x} y={geometry.inkBounds.y} width={geometry.inkBounds.width}
        height={geometry.inkBounds.height} fill={geometry.background} aria-hidden="true" pointerEvents="none" />}<text data-coral-part-id={partId}
        data-coral-classifier-row={part.role === 'classifier-row' ? geometry.compartmentId ?? '' : undefined}
        data-coral-classifier-name={part.role === 'classifier-name' ? '' : undefined}
        data-coral-classifier-stereotype={part.role === 'classifier-stereotype' ? '' : undefined}
        data-coral-endpoint-label={part.role === 'endpoint-label'
          ? `${geometry.endpoint}:${geometry.endpointLabelKind}` : undefined}
        className="coral-font-text" x={geometry.x} y={geometry.y}
        fontFamily={geometry.fontFamily} fontSize={geometry.fontSize}
        fontWeight={geometry.fontWeight} style={{ lineHeight: geometry.lineHeight }}
        fill={geometry.fill} fontStyle={geometry.fontStyle}
        textDecoration={geometry.textDecoration} textAnchor={geometry.anchor}>
        {geometry.text.includes('\n') ? geometry.text.split('\n').map((line, index) =>
          <tspan key={index} x={geometry.x} y={geometry.y + index * Math.ceil(geometry.fontSize * geometry.lineHeight)}>{line}</tspan>) : geometry.text}
      </text></>;
  }
}

export function SpatialSceneSvg028({ scene, namespace, className, style,
  title, description,
  decorative = false }: SpatialSceneSvg028Props): React.ReactElement {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '_');
  const domNamespace = namespace ?? `coral-scene-${instanceId}`;
  const titleId = `${domNamespace}-title`;
  const descriptionId = `${domNamespace}-description`;
  return <svg xmlns="http://www.w3.org/2000/svg"
    data-coral-scene-revision={scene.revision} data-coral-scene-kind="spatial"
    width={scene.viewport.width} height={scene.viewport.height}
    viewBox={`0 0 ${scene.viewport.width} ${scene.viewport.height}`}
    className={className} style={style} aria-hidden={decorative || undefined}
    role={decorative ? undefined : 'img'}
    aria-labelledby={decorative ? undefined : titleId}
    aria-describedby={decorative || !description ? undefined : descriptionId}>
    {!decorative && <title id={titleId}>{title ?? (scene.id || 'Coral diagram')}</title>}
    {!decorative && description && <desc id={descriptionId}>{description}</desc>}
    <defs><style dangerouslySetInnerHTML={{ __html: embeddedFontCssFor(scene.fontFaces) }} /></defs>
    <SpatialSceneMarkerDefs028 scene={scene} namespace={domNamespace} />
    <SpatialSceneArtworkDefs029 scene={scene} namespace={domNamespace} />
    {scene.parts.map((part) => <SpatialScenePart028 key={part.id} part={part} namespace={domNamespace} />)}
  </svg>;
}
