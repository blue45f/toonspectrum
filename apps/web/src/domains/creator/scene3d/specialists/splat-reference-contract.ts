import { SpecialistError } from "./specialist-contract";

export const SPLAT_REFERENCE_MAX_COUNT = 2_000_000;
/** Native .splat rows: center f32x3, scale f32x3, RGBA u8x4, quaternion u8x4. */
export function inspectNativeSplat(bytes: Uint8Array): {
  readonly count: number;
  readonly center: readonly [number, number, number];
  readonly radius: number;
} {
  if (
    !bytes.length ||
    bytes.length % 32 ||
    bytes.length / 32 > SPLAT_REFERENCE_MAX_COUNT
  )
    throw new SpecialistError(
      "budget",
      "Use a native .splat file with 1 to 2,000,000 rows of 32 bytes.",
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let visible = 0;
  for (let offset = 0; offset < bytes.length; offset += 32) {
    for (let axis = 0; axis < 3; axis++) {
      const center = view.getFloat32(offset + axis * 4, true);
      const scale = view.getFloat32(offset + 12 + axis * 4, true);
      if (
        !Number.isFinite(center) ||
        Math.abs(center) > 10000 ||
        !Number.isFinite(scale) ||
        scale <= 0 ||
        scale > 1000
      )
        throw new SpecialistError(
          "invalid-input",
          "Non-finite or unsupported splat center/scale.",
        );
      min[axis] = Math.min(min[axis]!, center - 3 * scale);
      max[axis] = Math.max(max[axis]!, center + 3 * scale);
    }
    if (bytes[offset + 27]! > 0) visible++;
    if (
      bytes.subarray(offset + 28, offset + 32).every((value) => value === 128)
    )
      throw new SpecialistError(
        "invalid-input",
        "Degenerate splat quaternion.",
      );
  }
  if (!visible)
    throw new SpecialistError(
      "invalid-input",
      "This splat file is fully transparent.",
    );
  const center = min.map((value, index) => (value + max[index]!) / 2) as [
    number,
    number,
    number,
  ];
  return {
    count: bytes.length / 32,
    center,
    radius: Math.max(
      0.01,
      Math.hypot(...max.map((value, index) => value - min[index]!)) / 2,
    ),
  };
}
