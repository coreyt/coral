import React from 'react';
import {
  embeddedFontCssFor,
  resolveDiagramFont,
  type FontFaceRequest,
} from '@coral-viz/render';
import {
  normalizeDiagramFontSettings,
  type DiagramFontSettings,
} from '../file/schema.js';

export interface DiagramFontFacesProps {
  settings?: DiagramFontSettings;
}

/** SSR-safe local font-face rules for the active diagram settings. */
export function DiagramFontFaces({ settings }: DiagramFontFacesProps) {
  const normalized = normalizeDiagramFontSettings(settings);
  const resolved = [resolveDiagramFont(normalized)];
  for (const key of Object.keys(normalized.symbolOverrides ?? {})) {
    resolved.push(resolveDiagramFont(normalized, key, key));
  }
  const requests: FontFaceRequest[] = resolved.map(({ id, weight }) => ({ id, weight }));
  const css = embeddedFontCssFor(requests);

  return (
    <style
      data-coral-diagram-font-faces
      // The CSS is generated only from the closed portable registry. Style
      // contents are raw-text in HTML, so escaping here would break hydration.
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
