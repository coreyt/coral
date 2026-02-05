/**
 * useImageExport Hook
 *
 * Exports diagram elements as PNG or SVG images.
 * Issue #30: CCD-REQ-009 PNG/SVG Image Export
 */

import { useState, useCallback, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ImageFormat = 'png' | 'svg';

export interface ImageExportOptions {
  /** Image format */
  format: ImageFormat;
  /** Scale factor for PNG (1-4) */
  scale: number;
  /** Whether to include background */
  includeBackground: boolean;
  /** Background color (if includeBackground is true) */
  backgroundColor?: string;
}

export interface UseImageExportResult {
  /** Current export options */
  options: ImageExportOptions;
  /** Whether an export is in progress */
  isExporting: boolean;
  /** Error message if export failed */
  error: string | null;

  // Actions
  /** Update export options */
  setOptions: (options: Partial<ImageExportOptions>) => void;
  /** Export element to data URL */
  exportToDataUrl: (element: HTMLElement) => Promise<string>;
  /** Download element as image file */
  download: (element: HTMLElement, filename?: string) => Promise<void>;
  /** Copy element to clipboard as image */
  copyToClipboard: (element: HTMLElement) => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: ImageExportOptions = {
  format: 'png',
  scale: 2,
  includeBackground: true,
  backgroundColor: '#ffffff',
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Clone an element with computed styles inlined
 */
function cloneWithStyles(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;

  // Get all elements including the root
  const originalElements = [element, ...Array.from(element.querySelectorAll('*'))];
  const clonedElements = [clone, ...Array.from(clone.querySelectorAll('*'))];

  // Copy computed styles
  originalElements.forEach((orig, i) => {
    const cloned = clonedElements[i] as HTMLElement;
    if (cloned && orig instanceof HTMLElement) {
      const computed = window.getComputedStyle(orig);
      // Copy essential styles
      cloned.style.cssText = computed.cssText;
    }
  });

  return clone;
}

/**
 * Convert element to SVG string
 */
function elementToSvg(element: HTMLElement, options: ImageExportOptions): string {
  const rect = element.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

  // Check if element contains SVG
  const svgElement = element.querySelector('svg');
  if (svgElement) {
    const svgClone = svgElement.cloneNode(true) as SVGElement;
    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));

    if (options.includeBackground) {
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', options.backgroundColor || '#ffffff');
      svgClone.insertBefore(bgRect, svgClone.firstChild);
    }

    return new XMLSerializer().serializeToString(svgClone);
  }

  // Fallback: wrap HTML in foreignObject
  const clone = cloneWithStyles(element);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      ${options.includeBackground ? `<rect width="100%" height="100%" fill="${options.backgroundColor || '#ffffff'}"/>` : ''}
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${clone.outerHTML}
        </div>
      </foreignObject>
    </svg>
  `;

  return svg;
}

/**
 * Convert element to PNG data URL
 */
async function elementToPng(element: HTMLElement, options: ImageExportOptions): Promise<string> {
  const rect = element.getBoundingClientRect();
  const width = (rect.width || 800) * options.scale;
  const height = (rect.height || 600) * options.scale;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Draw background if needed
  if (options.includeBackground) {
    ctx.fillStyle = options.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  // Get SVG representation
  const svgString = elementToSvg(element, { ...options, includeBackground: false });
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  // Draw SVG to canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.scale(options.scale, options.scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to load SVG for PNG conversion'));
    };
    img.src = svgUrl;
  });
}

/**
 * Convert data URL to Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }

  return new Blob([u8arr], { type: mime });
}

// ============================================================================
// Hook
// ============================================================================

export function useImageExport(): UseImageExportResult {
  const [options, setOptionsState] = useState<ImageExportOptions>(DEFAULT_OPTIONS);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update options (merge)
  const setOptions = useCallback((newOptions: Partial<ImageExportOptions>) => {
    setOptionsState((prev) => ({ ...prev, ...newOptions }));
  }, []);

  // Export to data URL
  const exportToDataUrl = useCallback(
    async (element: HTMLElement): Promise<string> => {
      if (!element) {
        setError('No element provided');
        throw new Error('No element provided');
      }

      setIsExporting(true);
      setError(null);

      try {
        if (options.format === 'svg') {
          const svgString = elementToSvg(element, options);
          const encoded = encodeURIComponent(svgString);
          return `data:image/svg+xml;charset=utf-8,${encoded}`;
        } else {
          return await elementToPng(element, options);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Export failed';
        setError(message);
        throw err;
      } finally {
        setIsExporting(false);
      }
    },
    [options]
  );

  // Download as file
  const download = useCallback(
    async (element: HTMLElement, filename?: string): Promise<void> => {
      const dataUrl = await exportToDataUrl(element);
      const ext = options.format;
      const name = filename || `diagram-${Date.now()}`;

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${name}.${ext}`;
      link.click();
    },
    [exportToDataUrl, options.format]
  );

  // Copy to clipboard
  const copyToClipboard = useCallback(
    async (element: HTMLElement): Promise<void> => {
      const dataUrl = await exportToDataUrl(element);

      if (options.format === 'svg') {
        // For SVG, copy as text
        const svgString = decodeURIComponent(dataUrl.split(',')[1]);
        await navigator.clipboard.writeText(svgString);
      } else {
        // For PNG, copy as image
        const blob = dataUrlToBlob(dataUrl);
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
      }
    },
    [exportToDataUrl, options.format]
  );

  return useMemo(
    () => ({
      options,
      isExporting,
      error,
      setOptions,
      exportToDataUrl,
      download,
      copyToClipboard,
    }),
    [options, isExporting, error, setOptions, exportToDataUrl, download, copyToClipboard]
  );
}
