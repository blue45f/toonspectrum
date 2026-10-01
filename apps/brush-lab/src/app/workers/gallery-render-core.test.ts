import { describe, expect, it } from "vitest";

import { PRESET_CATALOG, presetById } from "../../engine/presets/catalog";
import { FAMILY_TARGETS } from "../../engine/presets/families";

import { handleGalleryRequest, judgeFamily } from "./gallery-render-core";

import type { GalleryRenderRequestMessage } from "../../platform/worker-client";

const fixedClock = (): (() => number) => {
  let t = 0;
  return () => {
    t += 2.5;
    return t;
  };
};

function request(partial: Partial<GalleryRenderRequestMessage> = {}): GalleryRenderRequestMessage {
  return { type: "render", id: 1, presetId: "pencil-hb", fixtureId: "zigzag", size: 32, ...partial };
}

describe("handleGalleryRequest", () => {
  it("프리셋 1개를 cpu-reference 경로로 렌더해 해시·시간·dab 수·가족 판정을 돌려준다", () => {
    const res = handleGalleryRequest(request(), { now: fixedClock() });
    expect(res.type).toBe("result");
    if (res.type !== "result") return;
    expect(res.id).toBe(1);
    expect(res.presetId).toBe("pencil-hb");
    expect(res.width).toBe(32);
    expect(res.height).toBe(32);
    expect(res.data.length).toBe(32 * 32 * 4);
    expect(res.pixelHash).toMatch(/^[0-9a-f]{16}$/u);
    expect(res.renderMs).toBeCloseTo(2.5, 6);
    expect(res.dabCount).toBeGreaterThan(0);
    expect(res.family.map((f) => f.key)).toEqual(FAMILY_TARGETS.pencil.metrics.map((m) => m.key));
    // 획이 실제로 찍혔다(흰 바탕이 아닌 픽셀 존재)
    let inked = 0;
    for (let i = 0; i < res.data.length; i += 4) if ((res.data[i] ?? 255) < 250) inked += 1;
    expect(inked).toBeGreaterThan(0);
  });

  it("같은 요청은 같은 해시(결정성), 다른 프리셋은 다른 해시다", () => {
    const a = handleGalleryRequest(request({ id: 1 }), { now: fixedClock() });
    const b = handleGalleryRequest(request({ id: 2 }), { now: fixedClock() });
    const c = handleGalleryRequest(request({ id: 3, presetId: "ink-g-pen" }), { now: fixedClock() });
    if (a.type !== "result" || b.type !== "result" || c.type !== "result") throw new Error("렌더 실패");
    expect(a.pixelHash).toBe(b.pixelHash);
    expect(c.pixelHash).not.toBe(a.pixelHash);
  });

  it("알 수 없는 프리셋·fixture·크기는 error 메시지로 돌려준다(throw하지 않는다)", () => {
    const now = fixedClock();
    const preset = handleGalleryRequest(request({ presetId: "없는-프리셋" }), { now });
    expect(preset.type).toBe("error");
    const fixture = handleGalleryRequest(request({ fixtureId: "nope" }), { now });
    expect(fixture).toMatchObject({ type: "error", code: "fixture-unknown" });
    const size = handleGalleryRequest(request({ size: 8 }), { now });
    expect(size).toMatchObject({ type: "error", code: "gallery-size-invalid" });
    const big = handleGalleryRequest(request({ size: 4096 }), { now });
    expect(big).toMatchObject({ type: "error", code: "gallery-size-invalid" });
    const frac = handleGalleryRequest(request({ size: 32.5 }), { now });
    expect(frac).toMatchObject({ type: "error", code: "gallery-size-invalid" });
  });

  it(
    "카탈로그의 모든 프리셋이 작은 썸네일에서 오류 없이 렌더된다",
    () => {
      const now = fixedClock();
      const failures: string[] = [];
      for (const preset of PRESET_CATALOG) {
        const res = handleGalleryRequest(request({ presetId: preset.id, size: 16 }), { now });
        if (res.type === "error") failures.push(`${preset.id}: ${res.code} ${res.message}`);
      }
      expect(failures).toEqual([]);
      expect(presetById("pencil-hb").family).toBe("pencil");
    },
    // 습식·임파스토 프리셋은 CPU 참조 건조 스텝까지 돌리므로 30종 합계가 수 초 걸린다.
    60_000,
  );
});

describe("judgeFamily", () => {
  it("측정값이 없거나 비유한이면 UNAVAILABLE, 있으면 op·threshold로 PASS/FAIL", () => {
    const targets = [
      { key: "grainPressureMonotonicity", op: ">=", threshold: 0.95 },
      { key: "edgeTransitionWidthPx", op: "<=", threshold: 1.2 },
      { key: "taperWidthError", op: "<=", threshold: 0.08 },
      { key: "seamScore", op: "<=", threshold: 0.02 },
    ] as const;
    const out = judgeFamily(targets, {
      grainPressureMonotonicity: 0.97,
      edgeTransitionWidthPx: 2,
      taperWidthError: null,
      seamScore: Number.NaN,
    });
    expect(out.map((o) => [o.key, o.value, o.verdict])).toEqual([
      ["grainPressureMonotonicity", 0.97, "PASS"],
      ["edgeTransitionWidthPx", 2, "FAIL"],
      ["taperWidthError", null, "UNAVAILABLE"],
      ["seamScore", null, "UNAVAILABLE"],
    ]);
  });
});
