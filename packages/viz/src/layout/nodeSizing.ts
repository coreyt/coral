/**
 * Compatibility exports for deterministic node sizing.
 *
 * The implementation lives in @coral-viz/render so the editor, server-side
 * renderer, exporters, and MCP tools all use the same bundled font metrics.
 */
export {
  applyAdaptiveSizing,
  computeNodeSize,
  computeUniformSizes,
  measureText,
} from '@coral-viz/render';
