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

/** Trim editor rails and overlays from the scene analysis copy; retain full-frame metrics too. */
export const BG3D_FRAME_CROP_INSET = 0.25;

/**
 * Largest inter-session framing offset treated as framing rather than a defect, in capture pixels.
 */
export const BG3D_FRAME_MAX_ALIGNMENT_PX = 16;

/** Candidate vertical offsets, in capture pixels. Zero is always offered, so the aligned figure
 * can never exceed the unaligned one. */
export const BG3D_FRAME_ALIGNMENT_OFFSETS_PX: readonly number[] = Array.from(
  { length: BG3D_FRAME_MAX_ALIGNMENT_PX + 1 },
  (_value, index) => index - BG3D_FRAME_MAX_ALIGNMENT_PX / 2,
).map((step) => step * 2);

export interface Bg3dFrameAlignmentCandidate<T extends Bg3dComparableFrame> {
  readonly shiftPx: number;
  readonly frame: T;
}

/**
 * Compare equal-size captures after a bounded vertical translation. The selected offset and
 * unaligned full-frame delta remain in the runtime report so framing changes stay visible.
 */
export function resolveBg3dAlignedComparison<T extends Bg3dComparableFrame>(
  base: T,
  candidates: readonly Bg3dFrameAlignmentCandidate<T>[],
): { readonly alignmentPx: number; readonly peakDelta: number } {
  if (!Number.isInteger(base.width) || !Number.isInteger(base.height)
    || base.width <= 0 || base.height <= 0) {
    throw new Error("Invalid base frame dimensions");
  }
  if (candidates.length === 0) throw new Error("No frame alignment candidates");
  if (base.tiles.length === 0) throw new Error("Empty base frame tile counts");
  if (!candidates.some((candidate) => candidate.shiftPx === 0)) {
    throw new Error("Frame alignment must offer the unaligned comparison");
  }
  let best: { alignmentPx: number; peakDelta: number } | null = null;
  for (const { shiftPx, frame } of candidates) {
    if (!Number.isInteger(shiftPx) || Math.abs(shiftPx) > BG3D_FRAME_MAX_ALIGNMENT_PX) {
      throw new Error(`Frame alignment offset out of range: ${shiftPx}`);
    }
    if (frame.width !== base.width || frame.height !== base.height) {
      throw new Error("Different frame dimensions");
    }
    if (frame.tiles.length !== base.tiles.length) {
      throw new Error("Different frame tile counts");
    }
    let peakDelta = 0;
    for (let index = 0; index < base.tiles.length; index += 1) {
      const here = base.tiles[index];
      const there = frame.tiles[index];
      if (here === undefined || there === undefined
        || !Number.isFinite(here) || !Number.isFinite(there)) {
        throw new Error("Non-finite frame tile");
      }
      peakDelta = Math.max(peakDelta, Math.abs(here - there));
    }
    // Ties keep the smaller offset, so an already-aligned pair reports no drift at all.
    if (best === null || peakDelta < best.peakDelta
      || (peakDelta === best.peakDelta && Math.abs(shiftPx) < Math.abs(best.alignmentPx))) {
      best = { alignmentPx: shiftPx, peakDelta };
    }
  }
  if (best === null) throw new Error("No frame alignment candidates");
  return best;
}
