export interface Bg3dComparableFrame {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly number[];
}

/**
 * Compare original PNG captures through the SAME default-backed decoder. Mixing the CPU-backed
 * convergence sampler with default Canvas2D resampling produced a 2.6 tile delta even when every
 * original PNG pixel was identical. Keep both native captures and the original final oracle;
 * normalize the measurement path, never the captured image or the acceptance threshold.
 */
export async function compareBg3dOriginalFrames<T extends Bg3dComparableFrame>(
  sampledPng: Buffer,
  referencePng: Buffer,
  decode: (png: Buffer, readbackOptimized: boolean) => Promise<T>,
): Promise<{ readonly sampled: T; readonly reference: T; readonly peakDelta: number }> {
  const sampled = await decode(sampledPng, false);
  const reference = await decode(referencePng, false);
  if (!Number.isInteger(sampled.width) || !Number.isInteger(sampled.height)
    || sampled.width <= 0 || sampled.height <= 0
    || sampled.width !== reference.width || sampled.height !== reference.height) {
    throw new Error("Different or invalid original frame dimensions");
  }
  if (sampled.tiles.length === 0 || sampled.tiles.length !== reference.tiles.length) {
    throw new Error("Different or empty original frame tile counts");
  }
  let peakDelta = 0;
  for (let index = 0; index < sampled.tiles.length; index += 1) {
    const left = sampled.tiles[index];
    const right = reference.tiles[index];
    if (left === undefined || right === undefined
      || !Number.isFinite(left) || !Number.isFinite(right)) {
      throw new Error("Non-finite original frame tile");
    }
    peakDelta = Math.max(peakDelta, Math.abs(left - right));
  }
  return { sampled, reference, peakDelta };
}
