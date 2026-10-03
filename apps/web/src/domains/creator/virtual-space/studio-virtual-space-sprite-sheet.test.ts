import { describe, expect, it } from "vitest";

import type { ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";
import {
  customSpriteSheetSkin,
  guessSpriteSheetGrid,
  resolveCustomSpriteSheetImage,
  spriteSheetCell,
  spriteSheetConfigSchema,
  spriteSheetDirectionRow,
  spriteSheetFacingRow,
  spriteSheetIdleCell,
  spriteSheetOrigin,
  spriteSheetPreviewFrame,
  spriteSheetStrideDistance,
  studioCustomSpriteSheetSkinKey,
  studioSpriteSheetPreset,
  studioSpriteSheetPresetConfig,
  STUDIO_SPRITE_SHEET_MAX_FILE_BYTES,
  STUDIO_SPRITE_SHEET_PRESETS,
  validateSpriteSheetFile,
  type StudioSpriteSheetConfig,
} from "./studio-virtual-space-sprite-sheet";

const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function baseConfig(overrides: Partial<StudioSpriteSheetConfig> = {}): StudioSpriteSheetConfig {
  return spriteSheetConfigSchema.parse({
    image: IMAGE,
    frameWidth: 48,
    frameHeight: 48,
    framesPerDirection: 4,
    directionCount: 4,
    ...overrides,
  });
}

function createMockDeps(dataUrl = "data:image/png;base64,MOCK-PRESET"): ProceduralSheetDeps {
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, prop: string | symbol) => {
      if (prop === "canvas") return undefined;
      return (..._args: unknown[]) => undefined;
    },
    set: () => true,
  });
  return {
    createCanvas: (width: number, height: number) =>
      ({ width, height, getContext: () => ctx, toDataURL: () => dataUrl }) as unknown as HTMLCanvasElement,
  };
}

describe("spriteSheetConfigSchema", () => {
  it("유효한 설정을 파싱하고 기본값을 채운다", () => {
    const parsed = spriteSheetConfigSchema.parse({
      image: IMAGE,
      frameWidth: 48,
      frameHeight: 48,
      framesPerDirection: 4,
      directionCount: 4,
    });
    expect(parsed.anchorX).toBe(0.5);
    expect(parsed.anchorY).toBe(0.95);
    expect(parsed.offsetX).toBe(0);
    expect(parsed.frameRate).toBe(8);
    expect(parsed.displayHeight).toBe(128);
  });

  it("잘못된 값을 거부한다", () => {
    const invalid = [
      { frameWidth: 0 },
      { frameHeight: 7 },
      { framesPerDirection: 17 },
      { directionCount: 6 },
      { anchorX: 1.5 },
      { frameRate: 0 },
      { displayHeight: 512 },
      { image: "" },
    ];
    for (const patch of invalid) {
      expect(spriteSheetConfigSchema.safeParse({ ...baseConfig(), ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });

  it("걷기 프레임 수가 방향당 프레임 수를 넘으면 거부한다", () => {
    const result = spriteSheetConfigSchema.safeParse({ ...baseConfig(), walkFrames: 5 });
    expect(result.success).toBe(false);
  });

  it("walkFrames 생략 시 방향당 전체 열을 걷기로 쓴다", () => {
    const parsed = baseConfig();
    expect(parsed.walkFrames).toBeUndefined();
  });
});

describe("방향 → 시트 행 매핑", () => {
  it("4방향 시트는 RPG Maker 행 순서를 쓴다 (down, left, right, up)", () => {
    const config = baseConfig();
    expect(spriteSheetFacingRow(config, "down")).toBe(0);
    expect(spriteSheetFacingRow(config, "left")).toBe(1);
    expect(spriteSheetFacingRow(config, "right")).toBe(2);
    expect(spriteSheetFacingRow(config, "up")).toBe(3);
  });

  it("8방향 시트는 down부터 시계 방향 행 순서를 쓴다", () => {
    const config = baseConfig({ directionCount: 8 });
    expect(spriteSheetDirectionRow(config, "down")).toBe(0);
    expect(spriteSheetDirectionRow(config, "down-left")).toBe(1);
    expect(spriteSheetDirectionRow(config, "left")).toBe(2);
    expect(spriteSheetDirectionRow(config, "up-right")).toBe(5);
    expect(spriteSheetDirectionRow(config, "down-right")).toBe(7);
  });

  it("4방향 시트에 대각선을 물으면 가장 가까운 facing 행으로 접는다", () => {
    const config = baseConfig();
    expect(spriteSheetDirectionRow(config, "down-left")).toBe(0);
    expect(spriteSheetDirectionRow(config, "up-right")).toBe(3);
    expect(spriteSheetDirectionRow(config, "left")).toBe(1);
  });
});

describe("spriteSheetCell", () => {
  it("방향·프레임을 행/열/Phaser 프레임 인덱스로 바꾼다", () => {
    const config = baseConfig();
    // 4방향, 방향당 4열: left는 1행 → 프레임 인덱스 4 + 열
    expect(spriteSheetCell(config, "left", 2)).toEqual({ row: 1, column: 2, frameIndex: 6 });
    expect(spriteSheetCell(config, "up", 0)).toEqual({ row: 3, column: 0, frameIndex: 12 });
  });

  it("프레임 범위를 걷기 프레임 수 안으로 클램프한다", () => {
    const config = baseConfig({ walkFrames: 3 });
    expect(spriteSheetCell(config, "down", 99).column).toBe(2);
    expect(spriteSheetCell(config, "down", -5).column).toBe(0);
  });

  it("정지 셀은 걷기 프레임 뒤 첫 열을 쓴다", () => {
    const config = baseConfig({ walkFrames: 3 });
    expect(spriteSheetIdleCell(config, "right")).toEqual({ row: 2, column: 3, frameIndex: 11 });
  });

  it("걷기가 행 전체를 쓰면 정지 셀은 0열이다", () => {
    const config = baseConfig();
    expect(spriteSheetIdleCell(config, "down").column).toBe(0);
  });
});

describe("spriteSheetOrigin", () => {
  it("앵커와 오프셋을 origin으로 합친다", () => {
    const origin = spriteSheetOrigin({ anchorX: 0.5, anchorY: 0.95, offsetX: 4, offsetY: -8, frameWidth: 48, frameHeight: 48 });
    expect(origin.originX).toBeCloseTo(0.5 - 4 / 48);
    expect(origin.originY).toBeCloseTo(0.95 + 8 / 48);
  });
});

describe("spriteSheetPreviewFrame", () => {
  it("경과 시간으로 걷기 사이클 프레임을 구한다", () => {
    expect(spriteSheetPreviewFrame(0, 8, 6, false)).toBe(0);
    expect(spriteSheetPreviewFrame(125, 8, 6, false)).toBe(1);
    expect(spriteSheetPreviewFrame(750, 8, 6, false)).toBe(0);
  });

  it("reducedMotion이면 항상 0이다", () => {
    expect(spriteSheetPreviewFrame(1000, 8, 6, true)).toBe(0);
  });
});

describe("validateSpriteSheetFile", () => {
  it("PNG만 허용한다", () => {
    expect(validateSpriteSheetFile({ type: "image/jpeg", size: 1000 })).toEqual({ ok: false, reason: "type" });
    expect(validateSpriteSheetFile({ type: "image/png", size: 1000 })).toEqual({ ok: true });
  });

  it("용량 상한을 검사한다", () => {
    expect(validateSpriteSheetFile({ type: "image/png", size: STUDIO_SPRITE_SHEET_MAX_FILE_BYTES + 1 }))
      .toEqual({ ok: false, reason: "size" });
    expect(validateSpriteSheetFile({ type: "image/png", size: 0 })).toEqual({ ok: false, reason: "size" });
    expect(validateSpriteSheetFile({ type: "image/png", size: STUDIO_SPRITE_SHEET_MAX_FILE_BYTES }).ok).toBe(true);
  });
});

describe("guessSpriteSheetGrid", () => {
  it("RPG Maker식 192×192 4방향 시트를 48×48 4열로 추측한다", () => {
    expect(guessSpriteSheetGrid(192, 192, 4)).toEqual({ frameWidth: 48, frameHeight: 48, framesPerDirection: 4 });
  });

  it("방향 수로 나누어떨어지지 않으면 null이다", () => {
    expect(guessSpriteSheetGrid(192, 190, 4)).toBeNull();
  });

  it("비정상 크기는 null이다", () => {
    expect(guessSpriteSheetGrid(0, 192, 4)).toBeNull();
    expect(guessSpriteSheetGrid(4096, 192, 4)).toBeNull();
  });
});

describe("내장 프리셋 팩", () => {
  it("3종 프리셋이 있고 설정이 스키마를 통과한다", () => {
    expect(STUDIO_SPRITE_SHEET_PRESETS).toHaveLength(3);
    for (const preset of STUDIO_SPRITE_SHEET_PRESETS) {
      expect(preset.labelKo.length).toBeGreaterThan(0);
      const config = studioSpriteSheetPresetConfig(preset);
      expect(spriteSheetConfigSchema.safeParse(config).success).toBe(true);
      expect(config.image).toBe(`preset:${preset.key}`);
      // 프로시저럴 시트 10열 중 앞 6열이 걷기
      expect(config.framesPerDirection).toBe(10);
      expect(config.walkFrames).toBe(6);
      expect(config.directionCount).toBe(8);
    }
  });

  it("프리셋 이미지를 런타임에 생성하고 캐시한다", () => {
    const deps = createMockDeps();
    const config = studioSpriteSheetPresetConfig(studioSpriteSheetPreset("pixel-warrior")!);
    const first = resolveCustomSpriteSheetImage(config, deps);
    const second = resolveCustomSpriteSheetImage(config, deps);
    expect(first).toBe("data:image/png;base64,MOCK-PRESET");
    expect(second).toBe(first);
  });

  it("알 수 없는 프리셋 키는 오류를 낸다", () => {
    expect(() => resolveCustomSpriteSheetImage({ image: "preset:no-such" }, createMockDeps())).toThrow();
  });

  it("업로드 data URL은 그대로 반환한다", () => {
    expect(resolveCustomSpriteSheetImage({ image: IMAGE }, createMockDeps())).toBe(IMAGE);
  });
});

describe("spriteSheetStrideDistance", () => {
  it("기준 높이 131px에서 표준 보폭 84가 되고 표시 높이에 비례한다", () => {
    expect(spriteSheetStrideDistance({ displayHeight: 131 })).toBe(84);
    expect(spriteSheetStrideDistance({ displayHeight: 262 })).toBe(160);
    expect(spriteSheetStrideDistance({ displayHeight: 65.5 })).toBe(48);
  });

  it("비정상 높이는 표준 보폭으로 떨어지고 걷기 클립에 실제로 실린다", () => {
    expect(spriteSheetStrideDistance({ displayHeight: Number.NaN })).toBe(84);
    const config = baseConfig();
    const skin = customSpriteSheetSkin(config);
    expect(skin.clips?.["walk-down"]?.distancePerCycle).toBe(spriteSheetStrideDistance(config));
    expect(skin.clips?.["walk-up"]?.distancePerCycle).toBe(spriteSheetStrideDistance(config));
  });
});

describe("customSpriteSheetSkin", () => {
  it("4방향 걷기 클립이 행 단위 프레임 범위를 가진다", () => {
    const skin = customSpriteSheetSkin(baseConfig({ walkFrames: 3 }));
    expect(skin.sharedAtlas).toBe(true);
    const down = skin.clips?.["walk-down"];
    const left = skin.clips?.["walk-left"];
    const up = skin.clips?.["walk-up"];
    expect(down).toMatchObject({ start: 0, end: 2, frameWidth: 48, frameHeight: 48, frameRate: 8, repeat: -1 });
    expect(left).toMatchObject({ start: 4, end: 6 });
    expect(up).toMatchObject({ start: 12, end: 14 });
    expect(down?.textureUrl).toBe(IMAGE);
    // 걷기 3열 + 정지 1열 → 정지 프레임은 3열
    expect(skin.idleFrames).toEqual({ down: 3, left: 7, right: 11, up: 15 });
    // atlas 격자는 실제 이미지 크기와 정확히 맞아야 한다
    expect(down?.atlas).toMatchObject({ width: 192, height: 192, slicing: "rounded-grid", columns: 4, rows: 4 });
  });

  it("설정이 바뀌면 스킨 키(텍스처 키)가 바뀐다", () => {
    const first = studioCustomSpriteSheetSkinKey(baseConfig());
    const second = studioCustomSpriteSheetSkinKey(baseConfig({ frameRate: 12 }));
    expect(first).not.toBe(second);
    expect(studioCustomSpriteSheetSkinKey(baseConfig())).toBe(first);
  });

  it("같은 설정은 캐시된 스킨을 돌려준다", () => {
    const config = baseConfig();
    expect(customSpriteSheetSkin(config)).toBe(customSpriteSheetSkin(config));
  });

  it("프리셋 스킨은 8방향 10열 격자를 쓴다", () => {
    const preset = studioSpriteSheetPreset("chibi-mage")!;
    const skin = customSpriteSheetSkin(studioSpriteSheetPresetConfig(preset), createMockDeps());
    const down = skin.clips?.["walk-down"];
    expect(down).toMatchObject({ start: 0, end: 5, frameWidth: 96, frameHeight: 112 });
    expect(down?.atlas).toMatchObject({ width: 960, height: 896, slicing: "rounded-grid", columns: 10, rows: 8 });
    // 정지 프레임은 6열(첫 idle 열)
    expect(skin.idleFrames?.down).toBe(6);
  });
});
