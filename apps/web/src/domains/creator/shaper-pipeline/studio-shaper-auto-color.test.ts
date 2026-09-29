import { describe, expect, it } from "vitest";

import {
  STUDIO_AUTO_COLOR_BUDGET_MS,
  buildStudioAutoColorJobSpec,
} from "./studio-shaper-auto-color";

import type { StudioAutoColorLineArt, StudioAutoColorPalette } from "./studio-shaper-auto-color";

const LINE_ART: StudioAutoColorLineArt = {
  lineArtRef: "line-art-ep12",
  widthPx: 1024,
  heightPx: 1536,
  regionIds: ["피부", "머리카락", "교복 상의", "배경"],
};

const PALETTE: StudioAutoColorPalette = {
  paletteId: "palette-hero-a",
  characterId: "model-1",
  swatches: [
    { regionName: "피부", baseColor: "#ffd9c0", shadowColor: "#e8a583", highlightColor: "#fff0e0" },
    { regionName: "머리카락", baseColor: "#3a2a20", shadowColor: "#241a13", highlightColor: "#6b4f38" },
    { regionName: "교복 상의", baseColor: "#2b4a7a", shadowColor: "#1d3355", highlightColor: "#4a6fa5" },
  ],
};

describe("STUDIO_AUTO_COLOR_BUDGET_MS", () => {
  it("30초 예산 상수입니다", () => {
    expect(STUDIO_AUTO_COLOR_BUDGET_MS).toBe(30_000);
  });
});

describe("buildStudioAutoColorJobSpec", () => {
  it("결과가 선화와 분리된 별도 레이어로 구성됩니다", () => {
    const spec = buildStudioAutoColorJobSpec(LINE_ART, PALETTE, {
      shadows: true,
      highlights: true,
      estimatedMs: 10_000,
    });
    const kinds = spec.layers.map((layer) => layer.kind);
    expect(kinds).toEqual(["line", "fill", "shadow", "highlight"]);
    const lineLayer = spec.layers.find((layer) => layer.kind === "line");
    expect(lineLayer?.editable).toBe(false);
    for (const layer of spec.layers.filter((layer) => layer.kind !== "line")) {
      expect(layer.editable).toBe(true);
    }
    expect(spec.fallbackApplied).toBe(false);
  });

  it("팔레트 매핑이 영역별로 적용됩니다", () => {
    const spec = buildStudioAutoColorJobSpec(LINE_ART, PALETTE, {
      shadows: true,
      highlights: true,
      estimatedMs: 10_000,
    });
    const fill = spec.layers.find((layer) => layer.kind === "fill");
    expect(fill?.fills["피부"]).toBe("#ffd9c0");
    expect(fill?.fills["머리카락"]).toBe("#3a2a20");
    const shadow = spec.layers.find((layer) => layer.kind === "shadow");
    expect(shadow?.fills["피부"]).toBe("#e8a583");
    const highlight = spec.layers.find((layer) => layer.kind === "highlight");
    expect(highlight?.fills["교복 상의"]).toBe("#4a6fa5");
  });

  it("팔레트에 없는 영역은 unmappedRegions에 보고됩니다", () => {
    const spec = buildStudioAutoColorJobSpec(LINE_ART, PALETTE, {
      shadows: false,
      highlights: false,
      estimatedMs: 5_000,
    });
    expect(spec.unmappedRegions).toEqual(["배경"]);
  });

  it("예산 초과 시 그림자/하이라이트를 생략한 폴백을 적용합니다", () => {
    const spec = buildStudioAutoColorJobSpec(LINE_ART, PALETTE, {
      shadows: true,
      highlights: true,
      estimatedMs: 45_000,
    });
    expect(spec.fallbackApplied).toBe(true);
    const kinds = spec.layers.map((layer) => layer.kind);
    expect(kinds).toEqual(["line", "fill"]);
    const fill = spec.layers.find((layer) => layer.kind === "fill");
    expect(fill?.fills["피부"]).toBe("#ffd9c0");
  });

  it("예산 경계값에서는 폴백이 적용되지 않습니다", () => {
    const spec = buildStudioAutoColorJobSpec(LINE_ART, PALETTE, {
      shadows: true,
      highlights: false,
      estimatedMs: STUDIO_AUTO_COLOR_BUDGET_MS,
    });
    expect(spec.fallbackApplied).toBe(false);
    expect(spec.layers.map((layer) => layer.kind)).toEqual(["line", "fill", "shadow"]);
  });

  it("동일 입력은 동일 jobId를 생성합니다", () => {
    const options = { shadows: true, highlights: true, estimatedMs: 10_000 };
    const first = buildStudioAutoColorJobSpec(LINE_ART, PALETTE, options);
    const second = buildStudioAutoColorJobSpec(LINE_ART, PALETTE, options);
    expect(second.jobId).toBe(first.jobId);
  });
});
