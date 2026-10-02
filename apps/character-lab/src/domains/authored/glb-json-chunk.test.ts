import { describe, expect, it } from "vitest";

import { buildMinimalGlb } from "../../testing/minimal-glb";

import { isGlbBytes, readGlbJsonChunk } from "./glb-json-chunk";

describe("authored/glb-json-chunk", () => {
  it("최소 GLB의 JSON 청크를 읽는다", () => {
    const glb = buildMinimalGlb({ nodeName: "Root", extraNodeNames: ["mixamorig:Hips"] });
    expect(isGlbBytes(glb)).toBe(true);
    const result = readGlbJsonChunk(glb);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version).toBe(2);
      const nodes = result.json.nodes as Array<{ name: string }>;
      expect(nodes.map((node) => node.name)).toEqual(["Root", "mixamorig:Hips"]);
    }
  });

  it("magic·길이·청크 손상은 한글 사유로 거부한다(throw 없음)", () => {
    expect(readGlbJsonChunk(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, reasonKo: "GLB magic(glTF)이 아닙니다." });
    const glb = buildMinimalGlb();
    const truncated = glb.subarray(0, 40);
    const truncatedResult = readGlbJsonChunk(truncated);
    expect(truncatedResult.ok).toBe(false);
    if (!truncatedResult.ok) expect(truncatedResult.reasonKo).toMatch(/GLB/u);
    const corrupted = new Uint8Array(glb);
    corrupted[20] = 0x7b; // JSON 첫 바이트를 깨뜨린다('{' 유지) → 두 번째 바이트를 깨뜨림
    corrupted[21] = 0x00;
    const corruptedResult = readGlbJsonChunk(corrupted);
    expect(corruptedResult.ok).toBe(false);
    if (!corruptedResult.ok) expect(corruptedResult.reasonKo).toMatch(/파싱하지 못했습니다/u);
    const offsetView = new Uint8Array(glb.byteLength + 8);
    offsetView.set(glb, 8);
    expect(readGlbJsonChunk(offsetView.subarray(8)).ok).toBe(true);
  });
});
