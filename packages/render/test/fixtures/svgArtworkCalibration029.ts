// Calibration artworks and documents for coral.svg-artwork 1 budgets
// (dev/releases/0.2.9/slice-60/calibration-design.md). Every value is
// deterministic, so the render benchmark and the browser benchmark draw the
// same pictures.

const OPEN = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`;

/** A typical small icon: a group, a gradient, a path, a circle and a rect. */
export function typicalArtwork029(variant = 0): string {
  return `${OPEN(24)}<defs><linearGradient id="g"><stop offset="0" stop-color="#2f6f4f"/>` +
    `<stop offset="1" stop-color="#${(0x1b4030 + variant).toString(16).padStart(6, '0')}"/></linearGradient></defs>` +
    '<g transform="translate(1 1)" opacity="0.9"><path d="M12 0L24 4V14C24 21 18 26 12 28C6 26 0 21 0 14V4Z" ' +
    'fill="url(#g)" stroke="#ffffff" stroke-width=".5"/><circle cx="12" cy="12" r="3" fill="#ffffff"/>' +
    '<rect x="11" y="13" width="2" height="6" rx="1"/></g></svg>';
}

/**
 * Artwork exactly at a tier's element and segment limits: the root plus
 * `elements - 1` closed filled polygons of 16 segments, the first one longer
 * to reach `segments`. Points are integers on a 64-unit view box.
 */
function limitArtwork029(elements: number, segments: number, variant: number): string {
  const paths = elements - 1;
  const first = segments - 16 * (paths - 1);
  let seed = 1 + variant;
  const next = () => { seed = (seed * 48_271) % 2_147_483_647; return seed % 64; };
  const parts = [OPEN(64)];
  for (let index = 0; index < paths; index++) {
    const lines = (index ? 16 : first) - 2;
    let d = `M${next()} ${next()}`;
    for (let line = 0; line < lines; line++) d += `L${next()} ${next()}`;
    const color = ((index * 2_654_435_761 + variant) >>> 8) & 0xffffff;
    parts.push(`<path d="${d}Z" fill="#${color.toString(16).padStart(6, '0')}" fill-opacity="0.6"/>`);
  }
  return `${parts.join('')}</svg>`;
}

export const standardLimitArtwork029 = (variant = 0) => limitArtwork029(256, 4_096, variant);
export const detailedLimitArtwork029 = (variant = 0) => limitArtwork029(1_024, 16_384, variant);

export const CALIBRATION_ARTWORKS_029 = {
  typical: typicalArtwork029,
  standard: standardLimitArtwork029,
  detailed: detailedLimitArtwork029,
} as const;
export type CalibrationArtwork029 = keyof typeof CALIBRATION_ARTWORKS_029;

/**
 * A 0.2.9 document with one definition per artwork text and `instances`
 * pinned nodes in a 25-column grid, spread round-robin over the definitions.
 * `salt` adds a comment to every artwork so that a new text misses the
 * admission cache without changing the canonical text.
 */
export function calibrationDocument029(artworks: readonly string[], instances: number, salt = ''): string {
  const lines = ['@diagram architecture', '@coralVersion "0.2.9"', ''];
  artworks.forEach((artwork, index) => {
    const text = salt ? artwork.replace('>', `><!-- ${salt} -->`) : artwork;
    lines.push(`@symbol art${index} {`, `  name "Artwork ${index}"`, '  size 64 x 64', '  label below',
      '  outline rectangle', '  artwork svg """', text, '"""', '}');
  });
  for (let index = 0; index < instances; index++) {
    lines.push(`n${index} service [symbol: "local.art${index % artworks.length}"] @ (${(index % 25) * 120}, ` +
      `${Math.floor(index / 25) * 120}) pinned`);
  }
  return `${lines.join('\n')}\n`;
}
