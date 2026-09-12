import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildMatrixTrcIccProfile, SRGB_ICC_BUILD_OPTIONS } from "../render/studio-canvaskit-icc-profile";
import { calculateStudioCrc32 } from "../studio-crc32";
import { studioPageToCrdtPage, validateStudioCrdtPagePayload, hasSameStudioCrdtPageMetadata } from "../live/studio-crdt-page-payload";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../studio-project-file";
import { importStudioColorProofProfile, loadStudioColorProofProfile, transformStudioColorProofPixels } from "./studio-rgb-icc-transform";
import { encodeStudioColorProofPng } from "./studio-color-proof-png";
import { parseStudioColorProofDocument } from "./studio-color-proof-document";

const profile = (gamma = 1) => buildMatrixTrcIccProfile({ ...SRGB_ICC_BUILD_OPTIONS, description: "Linear RGB test", gamma });
const page = { id: "page", bg: "#fff", bgGrad: null, canvasH: 1080, elements: [] };

describe("RGB ICC product transform and persistence", () => {
  it("converts actual sRGB samples to a linear RGB profile and reconstructs its appearance", async () => {
    const bytes = profile(); const copy = Uint8Array.from(bytes);
    const { document, transform } = await importStudioColorProofProfile(bytes, "linear.icc", true);
    const result = transform.convertRgb([128, 128, 128]);
    // Independent IEC formula: ((128/255+.055)/1.055)^2.4 *255 =55.044... .
    expect(result.target).toEqual([55, 55, 55]); expect(result.proof).toEqual([128, 128, 128]);
    expect(result.outOfGamut).toBe(false); expect(bytes).toEqual(copy);
    expect([...atob(document.profile.base64)].map(c => c.charCodeAt(0))).toEqual([...bytes]);
    const restored = await loadStudioColorProofProfile(JSON.parse(JSON.stringify(document)));
    expect(restored.convertRgb([255, 0, 0]).proof).toEqual([255, 0, 0]);
  });
  it("warns on actual target gamut overflow and clips only the output, preserving source and alpha", async () => {
    const m = SRGB_ICC_BUILD_OPTIONS.matrix;
    const narrow = m.map(row => row.map(x => x * 0.5 + row.reduce((a, b) => a + b, 0) / 6));
    const { transform } = await importStudioColorProofProfile(buildMatrixTrcIccProfile({ ...SRGB_ICC_BUILD_OPTIONS, matrix: narrow, gamma: 1 }), "narrow.icc", true);
    const input = new Uint8ClampedArray([255, 0, 0, 1, 128, 128, 128, 255, 234, 199, 4, 0]);
    const before = Uint8ClampedArray.from(input); const result = await transformStudioColorProofPixels(input, transform);
    expect(result.outOfGamutPixels).toBe(1); expect(result.visiblePixels).toBe(2);
    expect([...result.gamut.slice(0, 4)]).toEqual([255, 0, 255, 1]);
    expect(result.proof[3]).toBe(1); expect([...result.target.slice(8)]).toEqual([0, 0, 0, 0]);
    expect(input).toEqual(before); expect(result.target.slice(0, 3)).not.toEqual(input.slice(0, 3));
  });
  it("keeps original profile bytes and identity through actual project JSON and CRDT page carriers", async () => {
    const { document } = await importStudioColorProofProfile(profile(), "source.icc", true);
    const authored = { ...page, colorProof: document };
    const project = { version: 2, pagesList: [authored] };
    const serialized = serializeStudioProjectFile(project); const decoded = parseStudioProjectFile(serialized);
    expect(decoded.pagesList[0]!.colorProof).toEqual(document);
    const payload = studioPageToCrdtPage(authored).payload;
    expect(validateStudioCrdtPagePayload(JSON.parse(JSON.stringify(payload))).props.colorProof).toEqual(document);
    expect(hasSameStudioCrdtPageMetadata(page, authored)).toBe(false);
    expect(hasSameStudioCrdtPageMetadata(authored, { ...authored, elements: [] })).toBe(true);
    expect(studioPageToCrdtPage({ ...authored, colorProof: undefined }).payload.props).not.toHaveProperty("colorProof");
    await expect(loadStudioColorProofProfile({ ...document, profile: { ...document.profile, sha256: "0".repeat(64) } })).rejects.toThrow("SHA-256");
  });
  it("rejects malformed/future settings and aggregate metadata overflow without dropping source", async () => {
    const { document } = await importStudioColorProofProfile(profile(), "valid.icc", true);
    expect(parseStudioColorProofDocument({ ...document, version: 2 })).toBeNull();
    expect(() => serializeStudioProjectFile({ version: 2, pagesList: [{ ...page, colorProof: { ...document, sourceSpace: "hdr" } }] })).toThrow("ICC");
    expect(() => studioPageToCrdtPage({ ...page, note: "한".repeat(2700), colorProof: document })).toThrow("8KiB");
  });
  it("rejects unauthorized, oversized, noninvertible and non-normalized profiles", async () => {
    await expect(importStudioColorProofProfile(profile(), "x.icc", false)).rejects.toThrow("권한");
    await expect(importStudioColorProofProfile(new Uint8Array(4097), "large.icc", true)).rejects.toThrow("4KiB");
    await expect(importStudioColorProofProfile(buildMatrixTrcIccProfile({ ...SRGB_ICC_BUILD_OPTIONS, matrix: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }), "bad.icc", true)).rejects.toThrow("가역");
    await expect(importStudioColorProofProfile(profile(0), "zero.icc", true)).rejects.toThrow("감마");
  });
  it("cancels pending pixel work before a result can be presented or exported", async () => {
    const { transform } = await importStudioColorProofProfile(profile(), "x.icc", true);
    const controller = new AbortController(); const promise = transformStudioColorProofPixels(new Uint8ClampedArray(131072), transform, controller.signal);
    controller.abort(); await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("ICC PNG output", () => {
  it("encodes raw target samples, exact ICC bytes, valid CRCs and no conflicting sRGB metadata", async () => {
    const bytes = profile(); const { transform } = await importStudioColorProofProfile(bytes, "linear.icc", true);
    const result = await transformStudioColorProofPixels(new Uint8ClampedArray([128, 128, 128, 1, 0, 0, 0, 0]), transform);
    const blob = await encodeStudioColorProofPng({ rgba: result.target, width: 2, height: 1, profileBytes: transform.bytes });
    const png = new Uint8Array(await blob.arrayBuffer()); expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const chunks = new Map<string, Uint8Array>(); const view = new DataView(png.buffer);
    for (let p = 8; p < png.length;) {
      const len = view.getUint32(p); const name = new TextDecoder().decode(png.slice(p + 4, p + 8));
      expect(view.getUint32(p + 8 + len)).toBe(calculateStudioCrc32(png.subarray(p + 4, p + 8 + len)));
      chunks.set(name, png.slice(p + 8, p + 8 + len)); p += 12 + len;
    }
    expect([...chunks.keys()]).toEqual(["IHDR", "iCCP", "IDAT", "IEND"]);
    const iccp = chunks.get("iCCP")!; const nul = iccp.indexOf(0); expect(iccp[nul + 1]).toBe(0);
    expect(new Uint8Array(inflateSync(iccp.slice(nul + 2)))).toEqual(bytes);
    expect([...inflateSync(chunks.get("IDAT")!)]).toEqual([0, 55, 55, 55, 1, 0, 0, 0, 0]);
  });
  it("does not return an artifact after cancellation or invalid dimensions", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(encodeStudioColorProofPng({ rgba: new Uint8ClampedArray(4), width: 1, height: 1, profileBytes: profile(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await expect(encodeStudioColorProofPng({ rgba: new Uint8ClampedArray(4), width: 2, height: 1, profileBytes: profile() })).rejects.toThrow("크기");
  });
});
