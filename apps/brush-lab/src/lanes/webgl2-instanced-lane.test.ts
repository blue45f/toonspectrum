import { describe, expect, it } from "vitest";

import { LaneUnavailableError } from "../engine/core/errors";
import { presetById } from "../engine/presets/catalog";
import { splitFrames } from "../engine/raster/reference-renderer";
import { lineStroke } from "../engine/testing/synthetic-strokes";
import { createMockWebgl2, createMockWebgl2Canvas } from "../engine/webgl2/testing/mock-webgl2";

import { createWebgl2InstancedLane, WEBGL2_INSTANCED_LANE } from "./webgl2-instanced-lane";

import type { LaneEnvironment } from "./lane";
import type { MockWebgl2 } from "../engine/webgl2/testing/mock-webgl2";

function envWith(mock: MockWebgl2 | null): LaneEnvironment {
  let t = 0;
  return {
    clock: { now: () => (t += 1) },
    createCanvas: (w, h) => createMockWebgl2Canvas(mock, w, h),
  };
}

describe("webgl2-instanced 레인", () => {
  it("createCanvas 없음·webgl2 없음 → webgl2-unavailable, 확장 없음 → feature-missing", async () => {
    const lane = createWebgl2InstancedLane();
    expect(lane.id).toBe(WEBGL2_INSTANCED_LANE.id);
    expect((await lane.probe({ clock: { now: () => 0 } })).reasons).toEqual(["webgl2-unavailable"]);
    expect((await lane.probe(envWith(null))).reasons).toEqual(["webgl2-unavailable"]);
    const noExt = createMockWebgl2({ extensions: [] });
    expect((await lane.probe(envWith(noExt))).reasons).toEqual(["feature-missing"]);
    await expect(lane.init(envWith(noExt), { width: 8, height: 8, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(LaneUnavailableError);
    await expect(lane.init(envWith(null), { width: 8, height: 8, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "webgl2-unavailable" });
  });

  it("모의 WebGL2로 fixture를 돌리면 프레임당 drawArraysInstanced 1회·영수증·readback", async () => {
    const mock = createMockWebgl2();
    const lane = createWebgl2InstancedLane();
    const env = envWith(mock);
    const report = await lane.probe(env);
    expect(report.status).toBe("supported");
    expect(report.features).toEqual(["EXT_color_buffer_float"]);
    await lane.init(env, { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 2 });
    lane.beginStroke(presetById("ink-g-pen"), 2);
    const frames = splitFrames(lineStroke(4, 4, 60, 60, 0.6, { durationMs: 100 }));
    const receipts = frames.map((f) => lane.addSamples(f));
    const nonEmpty = receipts.filter((r) => r.dabCount > 0).length;
    expect(mock.drawArraysInstanced.length).toBe(nonEmpty);
    expect(receipts.every((r) => r.submitCount === 1 && r.inputToSubmitMs !== null)).toBe(true);
    const receipt = await lane.endStroke();
    expect(receipt.dabCount).toBeGreaterThan(0);
    expect(receipt.timingSource).toBe("performance-now");
    expect(lane.stats()).toMatchObject({ strokes: 1, dabs: receipt.dabCount });
    const img = await lane.readback();
    expect(img.data.length).toBe(64 * 64 * 4);
    expect((await lane.readbackLinear())?.length).toBe(64 * 64 * 4);
    lane.dispose();
  });

  it("probe는 WEBGL_debug_renderer_info로 어댑터 정보를 채우고 소프트웨어 렌더러(SwiftShader)를 표시한다; 정보가 없으면 null(하드웨어라고 단정하지 않는다)", async () => {
    const lane = createWebgl2InstancedLane();
    const software = createMockWebgl2({
      debugRenderer: { vendor: "Google Inc. (Google)", renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" },
    });
    const sw = await lane.probe(envWith(software));
    expect(sw.status).toBe("supported");
    expect(sw.adapterInfo).toMatchObject({ vendor: "Google Inc. (Google)", architecture: "webgl2", description: "WebGL 2.0 (mock)" });
    expect(sw.adapterInfo?.device).toContain("SwiftShader");
    expect(sw.softwareRenderer).toBe(true);

    const hardware = createMockWebgl2({ debugRenderer: { vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce RTX 4070/PCIe/SSE2" } });
    const hw = await createWebgl2InstancedLane().probe(envWith(hardware));
    expect(hw.softwareRenderer).toBe(false);

    const hidden = await createWebgl2InstancedLane().probe(envWith(createMockWebgl2()));
    expect(hidden.adapterInfo).toBeNull();
    expect(hidden.softwareRenderer).toBeNull();
  });

  it("smudge 프리셋은 beginStroke에서 not-implemented로 거부한다(무음 대체 없음)", async () => {
    const mock = createMockWebgl2();
    const lane = createWebgl2InstancedLane();
    const env = envWith(mock);
    await lane.init(env, { width: 16, height: 16, dpr: 1, tileSize: 16, seed: 1 });
    expect(() => lane.beginStroke(presetById("smudge-blend"), 1)).toThrow(LaneUnavailableError);
  });
});
