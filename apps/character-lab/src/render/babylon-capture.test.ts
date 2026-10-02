/**
 * 멀티패스 캡처·썸네일 — NullEngine 하네스.
 * - readback이 없는 NullEngine 레인: 파츠 AABB를 투영한 합성 래스터 + provenance.synthetic=true·backend="null".
 * - 모의 readback(`installFakeReadback`)을 꽂은 webgl2/webgpu 레인: 행 뒤집기·premultiply 해제·깊이 디코드 **배선**만 검증한다
 *   (실제 GPU readPixels 행 순서·셰이더 출력은 브라우저 미검증, docs/parity/render.md).
 */
import { afterEach, describe, expect, it } from "vitest";

import { CAPTURE_PROFILE_ID, DEFAULT_FRAMING, RENDER_PASS_IDS, decodeIdPixel, encodeIdPixel } from "../contracts";
import { decodeDepth, toTopDownStraight } from "../export/raster-convert";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { packDepthRgba8 } from "./readback";
import { createNullEngineHarness, installFakeReadback } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { CaptureRequest, CapturedRaster, RenderPassId } from "../contracts";
import type { ReadbackLane } from "./readback";
import type { NullEngineHarness } from "./testing/null-engine-harness";

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

async function makeHarness(lane?: ReadbackLane): Promise<NullEngineHarness> {
  const harness = await createNullEngineHarness({ ...(lane ? { lane } : {}), now: () => 9_000 });
  cleanups.push(() => harness.dispose());
  await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  return harness;
}

function request(overrides: Partial<CaptureRequest> = {}): CaptureRequest {
  return { width: 32, height: 32, passes: [...RENDER_PASS_IDS], transparentBackground: true, settleSteps: 0, ...overrides };
}

function pixel(raster: CapturedRaster, x: number, y: number): [number, number, number, number] {
  const i = (y * raster.width + x) * 4;
  return [raster.rgba[i] ?? 0, raster.rgba[i + 1] ?? 0, raster.rgba[i + 2] ?? 0, raster.rgba[i + 3] ?? 0];
}

describe("NullEngine 레인(합성 래스터)", () => {
  it("6개 패스를 모두 만들고 provenance가 합성·null 레인을 정직하게 표시한다", async () => {
    const { engine } = await makeHarness();
    engine.applyPlan(applyPlanFixture({ revision: 4 }));
    const result = await engine.renderPasses(request({ settleSteps: 3 }));
    expect(result.profile).toBe(CAPTURE_PROFILE_ID);
    expect([result.width, result.height]).toEqual([32, 32]);
    expect(Object.keys(result.passes).sort()).toEqual(["flat", "lit", "material-id", "normal", "part-id"]);
    expect(result.depth).toMatchObject({ width: 32, height: 32 });
    expect(result.provenance).toMatchObject({ backend: "null", synthetic: true, physicsProvider: "builtin-pbd", settleSteps: 3 });
    expect(result.provenance.recipeDigest).toMatch(/^plan-4-/u);
    expect(result.partIdPalette[1]).toMatchObject({ role: "head" });
    for (const raster of Object.values(result.passes)) expect(raster?.rgba).toHaveLength(32 * 32 * 4);
  });

  it("part-id 패스는 보이는 파츠의 ID를 인코딩하고 숨긴 파츠는 나타나지 않는다", async () => {
    const { engine } = await makeHarness();
    engine.applyPlan(applyPlanFixture({ parts: [{ partId: 3, visible: false, materialPreset: "hair-aniso" }] }));
    const result = await engine.renderPasses(request({ width: 64, height: 64, passes: ["part-id", "material-id"] }));
    const raster = result.passes["part-id"];
    expect(raster).toBeDefined();
    if (!raster) return;
    const seen = new Set<number>();
    for (let i = 0; i < raster.rgba.length; i += 4) {
      if ((raster.rgba[i + 3] ?? 0) === 0) continue;
      const decoded = decodeIdPixel(raster.rgba[i] ?? 0, raster.rgba[i + 1] ?? 0, raster.rgba[i + 2] ?? 0);
      seen.add(decoded.partId);
      // 파츠 materialId는 모델(1:1)과 일치한다
      expect(decoded.materialId).toBe(decoded.partId - 1);
    }
    expect(seen.has(2) || seen.has(4) || seen.has(1)).toBe(true);
    expect(seen.has(3)).toBe(false);
    // 배경은 완전 투명
    expect(pixel(raster, 0, 0)[3]).toBe(0);
    // material-id 패스도 같은 인코딩이다(partId·materialId 모두 보존)
    const material = result.passes["material-id"];
    expect(material && pixel(material, 32, 32)).toEqual(raster && pixel(raster, 32, 32));
  });

  it("깊이는 배경 1(far), 캐릭터 영역은 0..1 안이며 near/far가 카메라 값이다", async () => {
    const { engine } = await makeHarness();
    const result = await engine.renderPasses(request({ width: 64, height: 64, passes: ["depth"] }));
    const depth = result.depth;
    expect(depth).toBeDefined();
    if (!depth) return;
    expect(depth.near).toBeCloseTo(0.05, 6);
    expect(depth.far).toBeCloseTo(50, 6);
    expect(depth.depth[0]).toBe(1);
    const covered = Array.from(depth.depth).filter((value) => value < 1);
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it("뷰포트 카메라와 렌더 설정을 건드리지 않고(캡처 전용 카메라), 캡처 RTT를 장면에 남기지 않는다", async () => {
    const { engine } = await makeHarness();
    engine.setCamera({ ...DEFAULT_FRAMING, mode: "bust" });
    const before = engine.viewportCamera();
    const textures = engine.inspectScene().textureCount;
    await engine.renderPasses(request({ camera: { ...DEFAULT_FRAMING, mode: "face", yawDeg: 45 } }));
    expect(engine.viewportCamera()).toEqual(before);
    expect(engine.currentFraming().mode).toBe("bust");
    expect(engine.inspectScene().textureCount).toBe(textures);
  });

  it("카메라 프레이밍에 따라 합성 영역이 달라진다(얼굴은 전신보다 더 크게 채운다)", async () => {
    const { engine } = await makeHarness();
    const coverage = async (mode: "full-body" | "face"): Promise<number> => {
      const result = await engine.renderPasses(request({ width: 64, height: 64, passes: ["flat"], camera: { ...DEFAULT_FRAMING, mode } }));
      const flat = result.passes.flat;
      let filled = 0;
      for (let i = 3; i < (flat?.rgba.length ?? 0); i += 4) if ((flat?.rgba[i] ?? 0) > 0) filled += 1;
      return filled;
    };
    expect(await coverage("face")).toBeGreaterThan(await coverage("full-body"));
  });

  it("잘못된 크기는 코드가 있는 LabFailure로 거부한다", async () => {
    const { engine, nullEngine } = await makeHarness();
    await expect(engine.renderPasses(request({ width: 0 }))).rejects.toMatchObject({ code: "capture-size-invalid" });
    await expect(engine.renderPasses(request({ height: 12.5 }))).rejects.toMatchObject({ code: "capture-size-invalid" });
    const max = nullEngine.getCaps().maxTextureSize;
    await expect(engine.renderPasses(request({ width: max + 1, height: 8 }))).rejects.toMatchObject({ code: "capture-size-exceeds-texture" });
  });
});

describe("썸네일", () => {
  it("요청 크기의 정사각 래스터를 돌려주고 이후 플랜·가시성을 원래대로 되돌린다", async () => {
    const { engine } = await makeHarness();
    const previous = applyPlanFixture({ revision: 2, parts: [{ partId: 3, visible: false, materialPreset: "hair-aniso" }], morphWeights: { "param:eyeSize:+": 0.25 } });
    engine.applyPlan(previous);
    const digest = engine.planDigest();
    for (const size of [96, 128, 192] as const) {
      const raster = await engine.renderThumbnail({
        presetId: "hair/soft-bob",
        plan: applyPlanFixture({ revision: 9, parts: [{ partId: 3, visible: true, materialPreset: "hair-aniso" }], morphWeights: { "param:eyeSize:+": 1 } }),
        size,
        framing: DEFAULT_FRAMING,
      });
      expect([raster.width, raster.height]).toEqual([size, size]);
      expect(raster.rgba).toHaveLength(size * size * 4);
      // 합성이라도 캐릭터 영역에 불투명 픽셀이 있어야 한다
      expect(Array.from(raster.rgba).some((value, index) => index % 4 === 3 && value === 255)).toBe(true);
    }
    // 썸네일 중 켠 헤어·morph가 현재 상태로 새지 않는다
    const rig = engine.inspectRig();
    expect(rig?.parts.find((part) => part.partId === 3)?.visible).toBe(false);
    expect(rig?.morphInfluences["param:eyeSize:+"]).toBeCloseTo(0.25, 6);
    expect(engine.planDigest()).toBe(digest);
  });

  it("마지막 플랜이 없어도 썸네일 플랜(morph·가시성·색)은 스냅샷으로 정확히 되돌아간다", async () => {
    const { engine } = await makeHarness();
    const before = engine.inspectRig();
    await engine.renderThumbnail({
      presetId: "eyes/round",
      plan: applyPlanFixture({
        morphWeights: { "param:eyeSize:+": 1 },
        boneRotations: { head: [0, 0.5, 0, 0.866] },
        parts: [{ partId: 3, visible: false, materialPreset: "cloth-silk", color: "#123456" }],
      }),
      size: 96,
      framing: DEFAULT_FRAMING,
    });
    expect(engine.planDigest()).toBe("no-plan");
    expect(engine.inspectRig()).toEqual(before);
    expect(engine.readBone("head")?.localRotation).toEqual([0, 0, 0, 1]);
  });
});

describe("모의 readback 레인(변환 배선 검증)", () => {
  const WIDTH = 8;
  const HEIGHT = 6;

  /** 행마다 다른 값을 가진 RGBA 패턴(행 뒤집기를 확인) */
  function rowPattern(alpha: number, pass: RenderPassId): Uint8Array {
    const out = new Uint8Array(WIDTH * HEIGHT * 4);
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const i = (y * WIDTH + x) * 4;
        if (pass === "depth") {
          out.set(packDepthRgba8(y / (HEIGHT - 1)), i);
        } else {
          out[i] = 10 + y * 20;
          out[i + 1] = 50 + x;
          out[i + 2] = 200 - y;
          out[i + 3] = alpha;
        }
      }
    }
    return out;
  }

  for (const lane of ["webgl2", "webgpu"] as const) {
    it(`${lane}: flat·lit은 뒤집고 premultiply를 해제하며 ID·법선은 알파를 건드리지 않는다`, async () => {
      cleanups.push(installFakeReadback((pass) => rowPattern(pass === "flat" || pass === "lit" ? 128 : 255, pass)));
      const { engine } = await makeHarness(lane);
      const result = await engine.renderPasses(request({ width: WIDTH, height: HEIGHT, passes: ["flat", "lit", "normal", "part-id", "depth"] }));
      expect(result.provenance).toMatchObject({ backend: lane, synthetic: false });

      const flat = result.passes.flat;
      expect(flat).toBeDefined();
      if (!flat) return;
      // 배선 일치: 레인 상수(flipY·premultiplied)로 변환한 결과와 같다
      expect(Array.from(flat.rgba)).toEqual(Array.from(toTopDownStraight(rowPattern(128, "flat"), WIDTH, HEIGHT, { flipY: true, premultiplied: true })));
      // 첫 출력 행 = 마지막 입력 행(bottom-up → top-down), 알파 128 premultiplied R(=10+5*20)이 straight로 커진다
      const lastRowRed = 10 + (HEIGHT - 1) * 20;
      expect(pixel(flat, 0, 0)[3]).toBe(128);
      expect(pixel(flat, 0, 0)[0]).toBeGreaterThan(lastRowRed);
      expect(pixel(flat, 0, HEIGHT - 1)[0]).toBeGreaterThan(10);

      const normal = result.passes.normal;
      expect(normal && Array.from(normal.rgba)).toEqual(Array.from(toTopDownStraight(rowPattern(255, "normal"), WIDTH, HEIGHT, { flipY: true, premultiplied: false })));
      // ID 패스: 값이 그대로 보존되고 행만 뒤집힌다
      const id = result.passes["part-id"];
      expect(id && pixel(id, 0, 0)).toEqual([lastRowRed, 50, 200 - (HEIGHT - 1), 255]);
      expect(id && pixel(id, 0, HEIGHT - 1)).toEqual([10, 50, 200, 255]);
    });
  }

  it("깊이: RGBA8 패킹을 디코드하고 행을 뒤집는다(첫 행 = 입력 마지막 행 = far)", async () => {
    cleanups.push(installFakeReadback((pass) => rowPattern(255, pass)));
    const { engine } = await makeHarness("webgl2");
    const result = await engine.renderPasses(request({ width: WIDTH, height: HEIGHT, passes: ["depth"] }));
    const depth = result.depth;
    expect(depth).toBeDefined();
    if (!depth) return;
    const expected = decodeDepth(rowPattern(255, "depth"), WIDTH, HEIGHT, { near: depth.near, far: depth.far, flipY: true, encoding: "rgba-packed" });
    expect(Array.from(depth.depth)).toEqual(Array.from(expected.depth));
    expect(depth.depth[0]).toBeCloseTo(1, 5);
    expect(depth.depth[(HEIGHT - 1) * WIDTH]).toBeCloseTo(0, 5);
  });

  it("일부 패스만 readback이 없으면(null) 그 패스는 합성으로 채우고 provenance가 합성임을 표시한다", async () => {
    cleanups.push(installFakeReadback((pass) => (pass === "lit" ? null : rowPattern(255, pass))));
    const { engine } = await makeHarness("webgl2");
    const result = await engine.renderPasses(request({ width: WIDTH, height: HEIGHT, passes: ["flat", "lit"] }));
    expect(result.provenance.synthetic).toBe(true);
    expect(result.passes.lit?.rgba).toHaveLength(WIDTH * HEIGHT * 4);
  });

  it("RGBA8이 아닌 readback 타입(Float32Array)은 capture-readback-type 오류로 거부한다(무음 손상 금지)", async () => {
    cleanups.push(installFakeReadback(() => new Float32Array(WIDTH * HEIGHT * 4) as unknown as Uint8Array));
    const { engine } = await makeHarness("webgl2");
    await expect(engine.renderPasses(request({ width: WIDTH, height: HEIGHT, passes: ["flat"] }))).rejects.toMatchObject({ code: "capture-readback-type" });
  });

  it("encodeIdPixel 규약: partId 300(>255)·materialId는 R/G/B에 나뉘어 담긴다", () => {
    const [r, g, b, a] = encodeIdPixel(300, 7);
    expect([r, g, b, a]).toEqual([44, 1, 7, 255]);
  });
});
