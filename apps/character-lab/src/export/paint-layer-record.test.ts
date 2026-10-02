import { describe, expect, it } from "vitest";

import { bytesEqual } from "../shared/typed-array";

import { base64ToBytes, bytesToBase64, decodePaintLayerRecord, encodePaintLayerRecord } from "./paint-layer-record";

import type { PaintLayer } from "../contracts";

function layerFixture(): PaintLayer {
  const rgba = new Uint8ClampedArray(48 * 40 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = (i / 4) % 251;
    rgba[i + 1] = (i / 8) % 199;
    rgba[i + 2] = 77;
    rgba[i + 3] = i % 12 === 0 ? 0 : 200;
  }
  return { part: "top", width: 48, height: 40, rgba, revision: 3 };
}

describe("paint-layer-record", () => {
  it("base64 왕복과 큰 배열 청크 처리", () => {
    const bytes = new Uint8Array(70000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;
    expect(bytesEqual(base64ToBytes(bytesToBase64(bytes)), bytes)).toBe(true);
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe("aGk=");
  });

  it("레코드 인코드 → 디코드가 바이트 단위로 같고 revision은 0으로 시작한다", async () => {
    const layer = layerFixture();
    const record = await encodePaintLayerRecord(layer);
    expect(record.part).toBe("top");
    expect(record.width).toBe(48);
    expect(record.pngBase64.startsWith("iVBORw0KGgo")).toBe(true);
    const decoded = await decodePaintLayerRecord(record);
    if (!decoded.ok) throw new Error(decoded.failure.reasonKo);
    expect(decoded.layer.part).toBe("top");
    expect(decoded.layer.revision).toBe(0);
    expect(bytesEqual(decoded.layer.rgba, layer.rgba)).toBe(true);
  });

  it("손상 base64·PNG·크기 불일치는 LabFailure로 돌려준다", async () => {
    const record = await encodePaintLayerRecord(layerFixture());
    const badBase64 = await decodePaintLayerRecord({ ...record, pngBase64: "@@@" }, 5);
    expect(!badBase64.ok && badBase64.failure.code).toBe("paint-layer-base64");
    const badPng = await decodePaintLayerRecord({ ...record, pngBase64: bytesToBase64(new Uint8Array([1, 2, 3, 4])) }, 5);
    expect(!badPng.ok && badPng.failure.code).toBe("paint-layer-png");
    const badSize = await decodePaintLayerRecord({ ...record, width: 47 }, 5);
    expect(!badSize.ok && badSize.failure.code).toBe("paint-layer-size");
    expect(!badSize.ok && badSize.failure.at).toBe(5);
  });
});
