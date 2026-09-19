import { describe, expect, it } from "vitest";
import { inspectNativeSplat } from "./splat-reference-contract";

function fixture() {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  for (let axis = 0; axis < 3; axis++)
    view.setFloat32(12 + axis * 4, 0.1, true);
  bytes.set([200, 120, 90, 255, 255, 128, 128, 128], 24);
  return bytes;
}
describe("local splat reference input", () => {
  it("measures valid native splat centers and bounds", () => {
    const bytes = fixture();
    expect(inspectNativeSplat(bytes)).toMatchObject({
      count: 1,
      center: [0, 0, 0],
    });
    expect(inspectNativeSplat(bytes).radius).toBeGreaterThan(0);
  });
  it.each([0, 31, 33])("rejects malformed native row sizes %i", (size) => {
    expect(() => inspectNativeSplat(new Uint8Array(size))).toThrow();
  });
  it("rejects non-finite geometry, empty opacity and invalid orientation", () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setFloat32(0, NaN, true);
    expect(() => inspectNativeSplat(bytes)).toThrow();
    const hidden = fixture();
    hidden[27] = 0;
    expect(() => inspectNativeSplat(hidden)).toThrow();
    const rotation = fixture();
    rotation.fill(128, 28);
    expect(() => inspectNativeSplat(rotation)).toThrow();
  });
});
