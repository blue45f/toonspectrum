/** Split semantic ownership inside an opaque isolated group; apply the silhouette only once. */
export function partitionCharacterPsdCoverage(
  base: Uint8ClampedArray,
  appearance: Uint8ClampedArray,
  masks: readonly Uint8ClampedArray[],
) {
  const parts = masks.map(() => new Uint8ClampedArray(base.length));
  const remainder = new Uint8ClampedArray(base.length);
  const silhouette = new Uint8ClampedArray(base.length);
  let hasRemainder = false;
  for (let i = 0; i < base.length; i += 4) {
    const alpha = appearance[i + 3];
    silhouette[i] = silhouette[i + 1] = silhouette[i + 2] = alpha;
    silhouette[i + 3] = 255;
    if (alpha === 0) continue;
    // Isolated masks contain their own MSAA/translucent coverage. Divide that common
    // silhouette out, then allocate visible contribution in the documented semantic order.
    const coverage = Math.max(base[i + 3], alpha);
    let remaining = 1;
    for (let mask = 0; mask < masks.length; mask += 1) {
      const part = parts[mask];
      const contribution = Math.min(remaining, masks[mask][i + 3] / coverage);
      part[i] = base[i]; part[i + 1] = base[i + 1]; part[i + 2] = base[i + 2];
      // For a layer below existing coverage, source-over contributes alpha * remaining.
      part[i + 3] = remaining > 0 ? 255 * contribution / remaining : 0;
      remaining -= contribution;
    }
    if (remaining > 0) {
      // An opaque bottom remainder also absorbs RGBA8 coverage rounding, so the interior
      // stays opaque. Its parent mask restores the exact captured alpha, including edges.
      remainder[i] = base[i]; remainder[i + 1] = base[i + 1]; remainder[i + 2] = base[i + 2];
      remainder[i + 3] = 255;
      hasRemainder = true;
    }
  }
  return { parts, remainder: hasRemainder ? remainder : null, silhouette };
}
