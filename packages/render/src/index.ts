/**
 * @coral-viz/render — shape, symbol and notation definitions with no browser or
 * React dependency, plus deterministic text measurement and SVG output.
 */

export * from './types.js';
export * from './shapes/index.js';
export * from './symbols/index.js';
export * from './glyphs/index.js';
export * from './scene.js';
export * from './visualStyle028.js';
export * from './drawingPrimitives028.js';
export * from './bpmnEventVisual028.js';
export * from './bpmnGatewayVisual028.js';
export * from './renderScene028.js';
export * from './text/caveat028.js';
export * from './conformance028.js';
export * from './graphConformance028.js';
export * from './graphPortReferences028.js';
export * from './successorSourcePortReferences028.js';
export * from './successorSourcePortDeclarations028.js';
export * from './successorSourceIntegrity028.js';
export * from './sourceSemanticCapabilities028.js';
export * from './graphNotation028.js';
export * from './interpretation028.js';
export * from './semanticPorts028.js';
export * from './successorInterpretation028.js';
export * from './successorSourceProjection028.js';
export type { SourceEdgeDirection028 } from './sourceDirection028.js';
export * from './sourceLayoutCapabilities028.js';
export * from './successorSequenceDisplay028.js';
export * from './successorSourceDisplay028.js';
export * from './successorSourceConformance028.js';
export * from './successorPortableExport028.js';
export * from './successorConformance028.js';
export * from './portReferences028.js';
export * from './portAttachment028.js';
export * from './semanticLayoutPorts028.js';
export * from './stencilAnchorGeometry028.js';
export {
  CANONICAL_GLYPH_BOX_0210,
  CAPTION_GAP_029,
  CAPTION_PAD_X_029,
  CAPTION_PAD_Y_029,
  DEFAULT_CAPTION_WRAP_WIDTH_029,
  captionedStencilFrame029,
  stencilCaptionHeight028,
  type CaptionedStencilFrame029,
  type CaptionedStencilFrameOptions029,
  type StencilCaptionContext0210,
} from './stencilLabelGeometry028.js';
export * from './installedDocument028.js';
export * from './installedSourceWriter028.js';
export * from './notations/index.js';
export * from './text/metrics.js';
export * from './text/fonts.js';
export * from './text/sizing.js';
export * from './text/inter.js';
export * from './svg/serialize.js';
export * from './html/serialize.js';
export * from './sequence.js';
export * from './characters028.js';

export { mergeAuthoredLayoutOptions028, verifySpatialConstraints028, spatialReferenceKey028 } from './layout/typedSpatial028.js';
export type { SpatialSidecar028, SpatialConstraint028, SpatialReference028 } from './layout/typedSpatial028.js';
export { sourceSpatialFailureDiagnostics028 } from './sourceSpatialFailureDiagnostics028.js';
export { printSuccessorSource028, printUserSymbolDefinition029, printSourcePortLine029, type SuccessorSourceWrite028,
  type SuccessorSourceWriteOptions028 } from './successorSourceWriter028.js';
export { spatialValidationGraph028 } from './successorSourceDisplay028.js';
export * from './characterPreview028.js';
export * from './characterDebugView028.js';

export { containerStencilShape028, isContainerNode028 } from './containerGeometry028.js';

export { admitSvgArtwork029, admitSvgArtworkBytes029 } from './artwork/svgArtworkAdmission029.js';
export { admitSourceArtwork029, SVG_ARTWORK_CODES_029 } from './artwork/svgArtworkSource029.js';
export {
  svgArtworkTintsStroke029, userSymbolSvgDefinition029, userSymbolSvgId029, userSymbolSvgInstance029,
} from './artwork/svgArtworkSymbol029.js';
export { documentSymbolDefinition029, graphIrArtworkAdmission029 } from './graphIrDocumentSymbols029.js';
export {
  SVG_ARTWORK_BUDGETS_029, SVG_ARTWORK_PROFILE_029, type AdmittedSvgArtwork029, type SvgArtworkAdmission029,
  type SvgArtworkBudget029, type SvgArtworkCode029, type SvgArtworkDiscard029, type SvgArtworkFailure029,
  type SvgArtworkModel029, type SvgArtworkPhase029, type SvgClipGeometry029, type SvgClipPath029,
  type SvgGeometry029, type SvgGroup029, type SvgLength029, type SvgLinearGradient029, type SvgPaint029,
  type SvgPaintServer029, type SvgPaintValue029, type SvgPathCommand029, type SvgPrimitive029,
  type SvgRadialGradient029, type SvgRenderNode029, type SvgStop029, type SvgTransform029, type SvgViewBox029,
} from './artwork/svgArtworkModel029.js';

// Slice 60 C3: document catalog, user-symbol frame geometry and read notices.
export { documentCatalog029, catalogForInterpretations029, type DocumentCatalog029, type ResolvedUserSymbol029,
  type UserSymbolDefinitionView029 } from './documentCatalog029.js';
export { catalogShape029, catalogSymbol029, escapeOffsets029, portEscapeOffset029, sceneNodeShape029,
  type EscapeOffset029 } from './catalogLookup029.js';
export { artworkPlacement029, frameFitPoint029, isUserOutlineShape029, resolveUserAnchor029,
  userBoundaryAnchorPoint029, userCornerAnchorPoint029, userOutlineExitPoint029, userOutlineRegion029,
  userOutlineShape029, type ResolvedUserAnchor029, type UserOutline029 } from './userSymbolGeometry029.js';
export { selectsUserSymbol029, userSymbolNotices029, type UserSymbolNotice029 } from './userSymbolNotices029.js';
export * from './parrotfish.js';
