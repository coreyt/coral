/**
 * @coral-viz/browser — render Coral source to accessible SVG in an ordinary
 * web page. DOM globals are touched only inside functions: evaluating this
 * module defines no global and registers no element.
 */
export { render, type CoralDirection, type CoralRenderOptions, type CoralRenderResult,
  type CoralSourceGraphView028, type CoralTheme } from './render.js';
export { renderTo, scan, type CoralScanResult } from './dom.js';
export { defineCustomElement, type CoralDiagramElement } from './element.js';
export { CoralRenderError, type CoralDiagnostic, type CoralErrorCode } from './errors.js';
export { version } from './version.js';
export { renderText, type RenderTextOptions, type RenderTextResult } from '@coral-viz/render';
