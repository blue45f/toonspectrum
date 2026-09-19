import { SpecialistError } from "./specialist-contract";

export const SPLAT_REFERENCE_MAX_COUNT = 2_000_000;
export const SPLAT_INSPECTION_BATCH_ROWS = 8192;
export interface NativeSplatInspection {
  readonly count: number;
  readonly center: readonly [number, number, number];
  readonly radius: number;
}
function inspector(bytes: Uint8Array) {
  if (
    !bytes.length ||
    bytes.length % 32 ||
    bytes.length / 32 > SPLAT_REFERENCE_MAX_COUNT
  ) {
    throw new SpecialistError(
      "budget",
      "Use a native .splat file with 1 to 2,000,000 rows of 32 bytes.",
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let visible = 0;
  return {
    inspect(first: number, end: number): void {
      for (let row = first; row < end; row++) {
        const offset = row * 32;
        for (let axis = 0; axis < 3; axis++) {
          const center = view.getFloat32(offset + axis * 4, true);
          const scale = view.getFloat32(offset + 12 + axis * 4, true);
          if (
            !Number.isFinite(center) ||
            Math.abs(center) > 10000 ||
            !Number.isFinite(scale) ||
            scale <= 0 ||
            scale > 1000
          ) {
            throw new SpecialistError(
              "invalid-input",
              "Non-finite or unsupported splat center/scale.",
            );
          }
          min[axis] = Math.min(min[axis]!, center - 3 * scale);
          max[axis] = Math.max(max[axis]!, center + 3 * scale);
        }
        if (bytes[offset + 27]! > 0) visible++;
        // Do not create a new typed-array view for every one of two million rows.
        if (
          bytes[offset + 28] === 128 &&
          bytes[offset + 29] === 128 &&
          bytes[offset + 30] === 128 &&
          bytes[offset + 31] === 128
        ) {
          throw new SpecialistError(
            "invalid-input",
            "Degenerate splat quaternion.",
          );
        }
      }
    },
    finish(): NativeSplatInspection {
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
    },
  };
}
export function inspectNativeSplat(bytes: Uint8Array): NativeSplatInspection {
  const current = inspector(bytes);
  current.inspect(0, bytes.length / 32);
  return current.finish();
}
/** Yield between bounded batches so cancellation and UI input remain responsive. */
export async function inspectNativeSplatAsync(
  bytes: Uint8Array,
  options: {
    readonly signal?: AbortSignal;
    readonly yieldControl?: () => Promise<void>;
  } = {},
): Promise<NativeSplatInspection> {
  const check = () => {
    if (options.signal?.aborted)
      throw new SpecialistError("cancelled", "Cancelled.");
  };
  check();
  const current = inspector(bytes);
  const count = bytes.length / 32;
  const yieldControl =
    options.yieldControl ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (let first = 0; first < count; first += SPLAT_INSPECTION_BATCH_ROWS) {
    check();
    current.inspect(
      first,
      Math.min(count, first + SPLAT_INSPECTION_BATCH_ROWS),
    );
    if (first + SPLAT_INSPECTION_BATCH_ROWS < count) await yieldControl();
  }
  check();
  return current.finish();
}
