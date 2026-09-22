import { describe, expect, it } from "vitest";
import { buildReviewDeliveryZip } from "./review-delivery-zip";

function names(bytes: Buffer): string[] {
  const result: string[] = [];
  for (let offset = 0; offset + 46 <= bytes.length;) {
    const signature = bytes.readUInt32LE(offset);
    if (signature === 0x02014b50) { const length = bytes.readUInt16LE(offset + 28); result.push(bytes.subarray(offset + 46, offset + 46 + length).toString("utf8")); offset += 46 + length; }
    else offset += 1;
  }
  return result;
}
describe("deterministic review delivery ZIP", () => {
  const entries = [{ path: "manifest.json", bytes: Buffer.from("{}\n") }, { path: "README.txt", bytes: Buffer.from("readme\n") },
    { path: "pages/000001.png", bytes: Buffer.from([1,2,3]) }];
  it("emits identical stored ZIP bytes and exact central names", () => {
    const first = buildReviewDeliveryZip(entries), second = buildReviewDeliveryZip(entries);
    expect(first).toEqual(second); expect(first.bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(first.bytes.readUInt32LE(first.bytes.length - 22)).toBe(0x06054b50);
    expect(names(first.bytes)).toEqual(entries.map((entry) => entry.path)); expect(first.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });
  it.each([[...entries, entries[2]!], [{ path: "../secret", bytes: Buffer.from("x") }, ...entries.slice(1)],
    [{ path: "manifest.json", bytes: Buffer.alloc(0) }, ...entries.slice(1)]])("rejects duplicate, unsafe, or empty entries", (invalid) => {
    expect(() => buildReviewDeliveryZip(invalid)).toThrow();
  });
});
