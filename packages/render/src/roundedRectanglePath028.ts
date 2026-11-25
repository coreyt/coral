/** The quadratic-cornered rectangle the renderer draws for `cornerRadius`;
 * user-symbol `rounded` outlines use the same commands. */
export function roundedRectanglePath028(width: number, height: number, radius: number): string {
  return `M ${radius},0 L ${width - radius},0 Q ${width},0 ${width},${radius} L ${width},${height - radius} Q ${width},${height} ${width - radius},${height} L ${radius},${height} Q 0,${height} 0,${height - radius} L 0,${radius} Q 0,0 ${radius},0 Z`;
}
