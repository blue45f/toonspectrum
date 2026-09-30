import { describe, expect, it } from "vitest";

import {
  adaptCatalogItemToSubToolPreset,
  adaptCatalogItemsToSubToolPresets,
  inferSubToolTipShape,
  subToolPresetKey,
  type SubToolCatalogSource,
} from "./subtool-preset-adapter";

function source(overrides: Partial<SubToolCatalogSource> = {}): SubToolCatalogSource {
  return {
    id: "core-ink-pen",
    name: "잉크 펜",
    defaultWidth: 12,
    defaultOpacity: 0.9,
    category: "ink",
    operation: "paint",
    hint: "만화 잉크 선화용 펜",
    ...overrides,
  };
}

describe("inferSubToolTipShape", () => {
  it.each([
    ["네온 브러시", "glow", "neon"],
    ["입자 스프레이", "particle", "particle"],
    ["종이 질감", "texture", "textured"],
    ["납작 붓", "flat", "flat"],
    ["캘리그래피 펜", "calligraphy", "flat"],
    ["기본 원형 브러시", "round", "round"],
  ])("'%s' 카테고리/힌트에서 %s 모양을 추론한다", (name, hint, expected) => {
    expect(inferSubToolTipShape(source({ name, hint }))).toBe(expected);
  });

  it("searchAliases도 추론에 사용한다", () => {
    expect(
      inferSubToolTipShape(source({ name: "브러시", searchAliases: ["sparkle", "별"] })),
    ).toBe("particle");
  });

  it("어떤 키워드도 없으면 round를 반환한다", () => {
    expect(inferSubToolTipShape(source({ name: "???", category: "", hint: "" }))).toBe("round");
  });
});

describe("adaptCatalogItemToSubToolPreset", () => {
  it("카탈로그 id를 baseBrushId로 매핑하고 preset- 접두 id를 부여한다", () => {
    const preset = adaptCatalogItemToSubToolPreset(source());
    expect(preset.id).toBe("preset-core-ink-pen");
    expect(preset.baseBrushId).toBe("core-ink-pen");
    expect(preset.name).toBe("잉크 펜");
    expect(preset.isPreset).toBe(true);
  });

  it("defaultWidth/defaultOpacity를 팁 크기와 불투명도에 반영한다", () => {
    const preset = adaptCatalogItemToSubToolPreset(
      source({ defaultWidth: 36, defaultOpacity: 0.5 }),
    );
    expect(preset.params.tip.size).toBe(36);
    expect(preset.params.blending.opacity).toBe(0.5);
  });

  it("범위를 벗어난 defaultWidth/defaultOpacity를 클램핑한다", () => {
    const preset = adaptCatalogItemToSubToolPreset(
      source({ defaultWidth: 5000, defaultOpacity: 3 }),
    );
    expect(preset.params.tip.size).toBe(200);
    expect(preset.params.blending.opacity).toBe(1);
  });

  it("flat 계열은 각도 45도와 둥글기 0.35를 받는다", () => {
    const preset = adaptCatalogItemToSubToolPreset(
      source({ name: "납작 붓", hint: "flat" }),
    );
    expect(preset.params.tip.shape).toBe("flat");
    expect(preset.params.tip.angle).toBe(45);
    expect(preset.params.tip.roundness).toBe(0.35);
  });

  it("값이 없으면 중립 기본값을 사용한다", () => {
    const preset = adaptCatalogItemToSubToolPreset({
      id: "mystery",
      name: "미스터리 브러시",
    });
    expect(preset.params.tip.shape).toBe("round");
    expect(preset.params.tip.size).toBe(24);
    expect(preset.params.blending.opacity).toBe(1);
    expect(preset.params.dualBrush.enabled).toBe(false);
    expect(preset.params.texture.strength).toBe(0);
  });

  it("빈 id는 예외를 던진다", () => {
    expect(() =>
      adaptCatalogItemToSubToolPreset({ id: "  ", name: "빈 브러시" }),
    ).toThrow();
  });
});

describe("adaptCatalogItemsToSubToolPresets", () => {
  it("목록 전체를 프리셋으로 변환한다", () => {
    const presets = adaptCatalogItemsToSubToolPresets([
      source({ id: "a", name: "A" }),
      source({ id: "b", name: "B", hint: "neon glow" }),
      source({ id: "c", name: "C", defaultWidth: 8 }),
    ]);
    expect(presets).toHaveLength(3);
    expect(presets.map((preset) => preset.baseBrushId)).toEqual(["a", "b", "c"]);
    expect(presets[1]?.params.tip.shape).toBe("neon");
    expect(presets.every((preset) => preset.isPreset)).toBe(true);
  });

  it("중복 id와 잘못된 항목은 건너뛴다", () => {
    const presets = adaptCatalogItemsToSubToolPresets([
      source({ id: "a", name: "A" }),
      source({ id: "a", name: "A 중복" }),
      { id: "", name: "빈 id" },
    ]);
    expect(presets).toHaveLength(1);
    expect(presets[0]?.name).toBe("A");
  });

  it("346종 규모에서도 id 충돌 없이 변환된다", () => {
    const sources = Array.from({ length: 346 }, (_, index) =>
      source({ id: `brush-${index}`, name: `브러시 ${index}` }),
    );
    const presets = adaptCatalogItemsToSubToolPresets(sources);
    expect(presets).toHaveLength(346);
    const ids = new Set(presets.map((preset) => preset.id));
    expect(ids.size).toBe(346);
  });
});

describe("subToolPresetKey", () => {
  it("버전이 포함된 키를 반환한다", () => {
    const preset = adaptCatalogItemToSubToolPreset(source());
    expect(subToolPresetKey(preset)).toBe("v1:preset-core-ink-pen");
  });
});
