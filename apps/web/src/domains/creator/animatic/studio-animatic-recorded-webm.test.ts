import { describe, expect, it } from "vitest";

import { EBML_ID, ebmlElement, ebmlIdBytes, ebmlUintBytes } from "../studio-webcodecs-webm";
import { finalizeStudioAnimaticRecordedWebm } from "./studio-animatic-recorded-webm";

const join = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));
const uint = (id: number, value: number) => ebmlElement(id, ebmlUintBytes(value));
const text = (id: number, value: string) => ebmlElement(id, new TextEncoder().encode(value));
const unknown = Uint8Array.of(0x01, 255, 255, 255, 255, 255, 255, 255);
function streamingFixture() {
  const header = ebmlElement(EBML_ID.ebml, text(EBML_ID.docType, "webm"));
  const info = ebmlElement(EBML_ID.info, uint(EBML_ID.timestampScale, 1000000));
  const tracks = ebmlElement(EBML_ID.tracks, join(
    ebmlElement(EBML_ID.trackEntry, join(uint(EBML_ID.trackNumber, 1), uint(EBML_ID.trackType, 1), text(EBML_ID.codecId, "V_VP9"))),
    ebmlElement(EBML_ID.trackEntry, join(uint(EBML_ID.trackNumber, 2), uint(EBML_ID.trackType, 2), text(EBML_ID.codecId, "A_OPUS"))),
  ));
  const video = ebmlElement(EBML_ID.simpleBlock, Uint8Array.of(0x81, 0, 0, 0x80, 91, 92, 93));
  const audio = ebmlElement(EBML_ID.simpleBlock, Uint8Array.of(0x82, 0, 0, 0x80, 81, 82, 83));
  const cluster = (at: number) => join(ebmlIdBytes(EBML_ID.cluster), unknown, uint(EBML_ID.timestamp, at), video, audio);
  return { blob: new Blob([join(header, ebmlIdBytes(EBML_ID.segment), unknown, info, tracks, cluster(0), cluster(1000))], { type: "video/webm;codecs=vp9,opus" }), video, audio };
}

describe("finalizing recorded storyboard video", () => {
  it("adds finite duration and a seek index while preserving both media tracks across streaming clusters", async () => {
    const fixture = streamingFixture();
    const output = await finalizeStudioAnimaticRecordedWebm(fixture.blob, 2400);
    const bytes = Buffer.from(await output.arrayBuffer());
    const durationAt = bytes.indexOf(Buffer.from(ebmlIdBytes(EBML_ID.duration)));
    expect(durationAt).toBeGreaterThan(0);
    expect(bytes[durationAt + 2]).toBe(0x88);
    expect(bytes.readDoubleBE(durationAt + 3)).toBe(2400);
    expect(bytes.indexOf(Buffer.from(ebmlIdBytes(EBML_ID.seekHead)))).toBeGreaterThan(0);
    expect(bytes.indexOf(Buffer.from(ebmlIdBytes(EBML_ID.cues)))).toBeGreaterThan(0);
    for (const packet of [fixture.video, fixture.audio]) {
      const first = bytes.indexOf(packet);
      expect(first).toBeGreaterThan(0);
      expect(bytes.indexOf(packet, first + 1)).toBeGreaterThan(first);
      expect(bytes.indexOf(packet, bytes.indexOf(packet, first + 1) + 1)).toBe(-1);
    }
    expect(bytes.includes(Buffer.from("V_VP9"))).toBe(true);
    expect(bytes.includes(Buffer.from("A_OPUS"))).toBe(true);
    expect(output.type).toBe(fixture.blob.type);
    const again = await finalizeStudioAnimaticRecordedWebm(output, 2400);
    expect(Buffer.from(await again.arrayBuffer())).toEqual(bytes);
  });
  it("rejects truncated containers and invalid duration before publishing corrupt exports", async () => {
    const { blob } = streamingFixture();
    await expect(finalizeStudioAnimaticRecordedWebm(blob, Number.NaN)).rejects.toThrow("길이");
    await expect(finalizeStudioAnimaticRecordedWebm(blob.slice(0, -1), 2400)).rejects.toThrow("범위");
    await expect(finalizeStudioAnimaticRecordedWebm(new Blob([new Uint8Array(20)]), 2400)).rejects.toThrow("헤더");
  });
});
