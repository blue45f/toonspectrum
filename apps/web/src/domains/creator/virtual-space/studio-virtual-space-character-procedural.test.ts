import { describe, expect, it } from "vitest";

import {
  buildProceduralCharacterSheet,
  createProceduralCharacterSkin,
  DEFAULT_PROCEDURAL_PARTS,
  drawProceduralCharacterFrame,
  PROCEDURAL_DIRECTION_ROWS,
  PROCEDURAL_FRAME_HEIGHT,
  PROCEDURAL_FRAME_WIDTH,
  PROCEDURAL_IDLE_FRAME_COUNT,
  PROCEDURAL_SHEET_COLUMNS,
  PROCEDURAL_SHEET_HEIGHT,
  PROCEDURAL_SHEET_ROWS,
  PROCEDURAL_SHEET_WIDTH,
  PROCEDURAL_SPRITE_DIRECTIONS,
  PROCEDURAL_WALK_FRAME_COUNT,
  proceduralIdleBlink,
  proceduralIdleBobY,
  proceduralIdleFrameIndex,
  proceduralPaletteFromAvatarProfile,
  proceduralPartsFromAvatarProfile,
  proceduralSheetCell,
  proceduralSheetCellIndex,
  renderProceduralCharacterPreview,
  type ProceduralCharacterPalette,
  type ProceduralCharacterParts,
  type ProceduralSheetDeps,
} from "./studio-virtual-space-character-procedural";

/* ---------- 가짜 캔버스 (node 환경용) ---------- */

interface MockCall {
  readonly name: string;
  readonly args: readonly unknown[];
}

function createMockContext(): { readonly ctx: CanvasRenderingContext2D; readonly calls: MockCall[] } {
  const calls: MockCall[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, prop: string | symbol) => {
      if (prop === "canvas") return undefined;
      return (...args: unknown[]) => {
        calls.push({ name: String(prop), args });
      };
    },
    set: (_target, prop: string | symbol, value: unknown) => {
      calls.push({ name: `set:${String(prop)}`, args: [value] });
      return true;
    },
  });
  return { ctx, calls };
}

function createMockDeps(dataUrl = "data:image/png;base64,PROCEDURAL-TEST"): {
  readonly deps: ProceduralSheetDeps;
  readonly created: { readonly width: number; readonly height: number; readonly calls: MockCall[] }[];
} {
  const created: { width: number; height: number; calls: MockCall[] }[] = [];
  return {
    created,
    deps: {
      createCanvas: (width: number, height: number) => {
        const { ctx, calls } = createMockContext();
        created.push({ width, height, calls });
        return { width, height, getContext: () => ctx, toDataURL: () => dataUrl } as unknown as HTMLCanvasElement;
      },
    },
  };
}

const PALETTE: ProceduralCharacterPalette = Object.freeze({
  skin: "oklch(0.91 0.055 55)",
  hair: "oklch(0.31 0.055 25)",
  hairHighlight: "oklch(0.56 0.12 25)",
  outfit: "oklch(0.63 0.2 300)",
  accent: "oklch(0.78 0.19 335)",
});

const PARTS: ProceduralCharacterParts = Object.freeze({
  hairStyle: "twin",
  outfitStyle: "hoodie",
  accessory: "glasses",
});

function paintedStyles(calls: MockCall[]): string[] {
  return calls
    .filter((call) => call.name === "set:fillStyle" || call.name === "set:strokeStyle")
    .map((call) => String(call.args[0]));
}

describe("프로시저럴 시트 기하", () => {
  it("셀 96×112, 8행×10열(걷기 6 + idle 4) 시트를 정의한다", () => {
    expect(PROCEDURAL_FRAME_WIDTH).toBe(96);
    expect(PROCEDURAL_FRAME_HEIGHT).toBe(112);
    expect(PROCEDURAL_WALK_FRAME_COUNT).toBe(6);
    expect(PROCEDURAL_IDLE_FRAME_COUNT).toBe(4);
    expect(PROCEDURAL_SHEET_COLUMNS).toBe(10);
    expect(PROCEDURAL_SHEET_ROWS).toBe(8);
    expect(PROCEDURAL_SHEET_WIDTH).toBe(960);
    expect(PROCEDURAL_SHEET_HEIGHT).toBe(896);
    expect(PROCEDURAL_SPRITE_DIRECTIONS).toHaveLength(8);
  });

  it("방향 행이 sprite.ts의 DIRECTION_ROW 순서와 같다", () => {
    expect(PROCEDURAL_DIRECTION_ROWS).toEqual({
      "down": 0, "down-left": 1, "left": 2, "up-left": 3,
      "up": 4, "up-right": 5, "right": 6, "down-right": 7,
    });
  });

  it("걷기 셀은 열 0~5, idle 셀은 열 6~9를 쓴다", () => {
    expect(proceduralSheetCell("down", 3, "walk")).toEqual({ row: 0, column: 3 });
    expect(proceduralSheetCell("left", 0, "walk")).toEqual({ row: 2, column: 0 });
    expect(proceduralSheetCell("down", 2, "idle")).toEqual({ row: 0, column: 8 });
    expect(proceduralSheetCell("up", 3, "idle")).toEqual({ row: 4, column: 9 });
    expect(proceduralSheetCell("right", 9, "walk")).toEqual({ row: 6, column: 3 });
  });

  it("셀 인덱스가 행*10+열이다", () => {
    expect(proceduralSheetCellIndex("down", 0, "walk")).toBe(0);
    expect(proceduralSheetCellIndex("right", 5, "walk")).toBe(65);
    expect(proceduralSheetCellIndex("up", 0, "idle")).toBe(46);
  });
});

describe("idle 애니메이션 프레임", () => {
  it("2.4초 주기로 0→1→2→3을 순환한다", () => {
    expect(proceduralIdleFrameIndex(0, false)).toBe(0);
    expect(proceduralIdleFrameIndex(599, false)).toBe(0);
    expect(proceduralIdleFrameIndex(600, false)).toBe(1);
    expect(proceduralIdleFrameIndex(1_200, false)).toBe(2);
    expect(proceduralIdleFrameIndex(1_800, false)).toBe(3);
    expect(proceduralIdleFrameIndex(2_400, false)).toBe(0);
  });

  it("reduced-motion·비정상 시간에는 정적 프레임 0이다", () => {
    expect(proceduralIdleFrameIndex(1_200, true)).toBe(0);
    expect(proceduralIdleFrameIndex(-5, false)).toBe(0);
    expect(proceduralIdleFrameIndex(Number.NaN, false)).toBe(0);
  });

  it("2번 프레임에서 눈을 감고 호흡 오프셋을 제공한다", () => {
    expect(proceduralIdleBlink(2)).toBe(true);
    expect(proceduralIdleBlink(0)).toBe(false);
    expect(proceduralIdleBlink(3)).toBe(false);
    expect(proceduralIdleBobY(0)).toBe(0);
    expect(proceduralIdleBobY(1)).toBeLessThan(0);
  });
});

describe("프로필 브리지", () => {
  it("아바타 프로필을 팔레트·파츠로 변환한다", () => {
    const profile = {
      skin: "s", hair: "h", hairHighlight: "hh", outfit: "o", accent: "a",
      hairStyle: "bob", outfitStyle: "dress", accessory: "beret", expression: "smile",
    } as const;
    expect(proceduralPaletteFromAvatarProfile(profile)).toEqual({
      skin: "s", hair: "h", hairHighlight: "hh", outfit: "o", accent: "a",
    });
    expect(proceduralPartsFromAvatarProfile(profile)).toEqual({
      hairStyle: "bob", outfitStyle: "dress", accessory: "beret",
    });
  });

  it("의상 스타일이 없으면 tee로 폴백한다", () => {
    // 객체 리터럴을 직접 넘기면 Pick 매개변수에 대한 초과 속성 검사(TS2353)에 걸리므로
    // 위 테스트와 같이 전체 프로필 변수로 묶어 전달한다.
    const profile = {
      skin: "s", hair: "h", hairHighlight: "hh", outfit: "o", accent: "a",
      hairStyle: "short", accessory: "none", expression: "calm",
    } as const;
    const parts = proceduralPartsFromAvatarProfile(profile);
    expect(parts.outfitStyle).toBe("tee");
  });

  it("기본 파츠가 정의되어 있다", () => {
    expect(DEFAULT_PROCEDURAL_PARTS).toEqual({ hairStyle: "short", outfitStyle: "tee", accessory: "none" });
  });
});

describe("buildProceduralCharacterSheet", () => {
  it("B 트랙 계약 { canvas, frameWidth, frameHeight, directions }을 반환한다", () => {
    const { deps, created } = createMockDeps();
    const sheet = buildProceduralCharacterSheet(PALETTE, PARTS, deps);
    expect(sheet.frameWidth).toBe(96);
    expect(sheet.frameHeight).toBe(112);
    expect(sheet.width).toBe(960);
    expect(sheet.height).toBe(896);
    expect(sheet.dataUrl).toBe("data:image/png;base64,PROCEDURAL-TEST");
    expect(sheet.directions).toEqual(PROCEDURAL_DIRECTION_ROWS);
    expect(created).toHaveLength(1);
    expect(created[0]?.width).toBe(960);
    expect(created[0]?.height).toBe(896);
  });

  it("80개 셀을 모두 그리고 팔레트 색상을 사용한다", () => {
    const { deps, created } = createMockDeps();
    // bun 헤어는 hairHighlight, 드레스는 accent, star 액세서는 accent를 사용해 5개 팔레트 색상을 모두 검증한다.
    const accentParts: ProceduralCharacterParts = { hairStyle: "bun", outfitStyle: "dress", accessory: "star" };
    buildProceduralCharacterSheet(PALETTE, accentParts, deps);
    const calls = created[0]?.calls ?? [];
    const saves = calls.filter((call) => call.name === "save").length;
    const restores = calls.filter((call) => call.name === "restore").length;
    // 셀당 translate용 save/restore + drawProceduralCharacterFrame 내부 save/restore
    expect(saves).toBe(160);
    expect(restores).toBe(saves);
    const styles = paintedStyles(calls);
    for (const color of [PALETTE.skin, PALETTE.hair, PALETTE.hairHighlight, PALETTE.outfit, PALETTE.accent]) {
      expect(styles).toContain(color);
    }
    expect(calls.filter((call) => call.name === "clearRect")).toHaveLength(1);
  });

  it("팔레트 색상이 비면 에러를 던진다", () => {
    const { deps } = createMockDeps();
    expect(() => buildProceduralCharacterSheet({ ...PALETTE, skin: "  " }, PARTS, deps))
      .toThrow("팔레트");
  });

  it("2D 컨텍스트가 없으면 에러를 던진다", () => {
    const deps: ProceduralSheetDeps = {
      createCanvas: (width: number, height: number) =>
        ({ width, height, getContext: () => null, toDataURL: () => "" }) as unknown as HTMLCanvasElement,
    };
    expect(() => buildProceduralCharacterSheet(PALETTE, PARTS, deps)).toThrow("2D 캔버스");
  });
});

describe("drawProceduralCharacterFrame", () => {
  it("정면·측면·후면 모두 깨지지 않고 그려진다", () => {
    const views = ["front", "side", "back"] as const;
    for (const view of views) {
      const { ctx, calls } = createMockContext();
      drawProceduralCharacterFrame(ctx, {
        palette: PALETTE, parts: PARTS, view, walkPhase: Math.PI / 3, bobY: -1, blink: false,
        mirror: view === "side", tilt: 0,
      });
      expect(calls.length).toBeGreaterThan(10);
    }
  });

  it("깜빡임 프레임은 눈을 선으로 그린다", () => {
    const open = createMockContext();
    drawProceduralCharacterFrame(open.ctx, {
      palette: PALETTE, parts: PARTS, view: "front", walkPhase: null, bobY: 0, blink: false,
      mirror: false, tilt: 0,
    });
    const closed = createMockContext();
    drawProceduralCharacterFrame(closed.ctx, {
      palette: PALETTE, parts: PARTS, view: "front", walkPhase: null, bobY: 0, blink: true,
      mirror: false, tilt: 0,
    });
    // 눈을 감으면 원(arc) 호출이 줄고 선(lineTo) 호출이 는다.
    const arcs = (calls: MockCall[]) => calls.filter((call) => call.name === "arc").length;
    expect(arcs(closed.calls)).toBeLessThan(arcs(open.calls));
  });

  it("12종 헤어·12종 의상·10종 액세서리가 모두 그려진다", () => {
    const hairs = ["bob", "long", "short", "twin", "wave", "crop", "ponytail", "bun", "curly", "braid", "pigtails", "mohawk"] as const;
    const outfits = ["hoodie", "tee", "jacket", "dress", "suit", "sweater", "uniform", "apron", "coat", "sportswear", "cardigan", "overalls"] as const;
    const accessories = ["none", "beret", "bow", "cat", "headphones", "leaf", "star", "glasses", "cap", "headband"] as const;
    for (const hairStyle of hairs) {
      const { ctx, calls } = createMockContext();
      drawProceduralCharacterFrame(ctx, {
        palette: PALETTE, parts: { hairStyle, outfitStyle: "tee", accessory: "none" },
        view: "front", walkPhase: null, bobY: 0, blink: false, mirror: false, tilt: 0,
      });
      expect(calls.length, hairStyle).toBeGreaterThan(10);
    }
    for (const outfitStyle of outfits) {
      const { ctx, calls } = createMockContext();
      drawProceduralCharacterFrame(ctx, {
        palette: PALETTE, parts: { hairStyle: "short", outfitStyle, accessory: "none" },
        view: "front", walkPhase: null, bobY: 0, blink: false, mirror: false, tilt: 0,
      });
      expect(calls.length, outfitStyle).toBeGreaterThan(10);
    }
    for (const accessory of accessories) {
      const { ctx, calls } = createMockContext();
      drawProceduralCharacterFrame(ctx, {
        palette: PALETTE, parts: { hairStyle: "short", outfitStyle: "tee", accessory },
        view: "front", walkPhase: null, bobY: 0, blink: false, mirror: false, tilt: 0,
      });
      expect(calls.length, accessory).toBeGreaterThan(10);
    }
  });
});

describe("renderProceduralCharacterPreview", () => {
  it("96×112 단일 셀 dataURL을 만든다", () => {
    const { deps, created } = createMockDeps("data:image/png;base64,PREVIEW");
    const preview = renderProceduralCharacterPreview(PALETTE, PARTS, deps);
    expect(preview.width).toBe(96);
    expect(preview.height).toBe(112);
    expect(preview.dataUrl).toBe("data:image/png;base64,PREVIEW");
    expect(created[0]?.width).toBe(96);
    expect(created[0]?.height).toBe(112);
    expect(paintedStyles(created[0]?.calls ?? [])).toContain(PALETTE.skin);
  });
});

describe("createProceduralCharacterSkin", () => {
  it("sharedAtlas 스킨을 등록하고 걷기 클립·idle 프레임을 제공한다", () => {
    const { deps } = createMockDeps();
    const skin = createProceduralCharacterSkin(
      { key: "procedural-test", labelKo: "테스트", labelEn: "Test", nativeArtStyle: "webtoon" },
      PALETTE,
      PARTS,
      deps,
    );
    expect(skin.key).toBe("procedural-test");
    expect(skin.sharedAtlas).toBe(true);
    expect(skin.nativeArtStyle).toBe("webtoon");
    const url = skin.directional.down;
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(skin.directional).toEqual({ down: url, right: url, left: url, up: url });

    const down = skin.clips?.["walk-down"];
    expect(down?.start).toBe(0);
    expect(down?.end).toBe(5);
    expect(down?.frameWidth).toBe(96);
    expect(down?.frameHeight).toBe(112);
    expect(down?.atlas).toMatchObject({ width: 960, height: 896, columns: 10, rows: 8 });
    expect(skin.clips?.["walk-right"]?.start).toBe(60);
    expect(skin.clips?.["walk-left"]?.start).toBe(20);
    expect(skin.clips?.["walk-up"]?.start).toBe(40);

    // idle 정지 프레임은 걷기 클립 범위 안에 있어야 studioCharacterStaticAsset이 atlas를 쓴다.
    expect(skin.idleFrames).toEqual({ down: 0, right: 60, left: 20, up: 40 });
    for (const facing of ["down", "right", "left", "up"] as const) {
      const clip = skin.clips?.[`walk-${facing}`];
      const frame = skin.idleFrames?.[facing] ?? -1;
      expect(frame).toBeGreaterThanOrEqual(clip?.start ?? 1);
      expect(frame).toBeLessThanOrEqual(clip?.end ?? -1);
    }

    // talk/draw/review는 idle 호흡 프레임 단일 컷.
    expect(skin.actions?.talk?.down?.start).toBe(6);
    expect(skin.actions?.talk?.down?.end).toBe(6);
    expect(skin.actions?.draw?.left?.start).toBe(26);
  });
});

describe("감정 표정", () => {
  it("감정 없이 그리면 기존 외형 그대로 (z·볼터치 없음)", () => {
    const { ctx, calls } = createMockContext();
    drawProceduralCharacterFrame(ctx, {
      palette: PALETTE, parts: PARTS, view: "front", walkPhase: null, bobY: 0, blink: false,
      mirror: false, tilt: 0,
    });
    const texts = calls.filter((call) => call.name === "fillText");
    expect(texts).toHaveLength(0);
    const blushes = calls.filter((call) => call.name === "set:fillStyle" && call.args[0] === "#f7a8b8");
    expect(blushes).toHaveLength(0);
  });

  it("기쁨은 볼터치, 수면은 Z를 그린다", () => {
    const joy = createMockContext();
    drawProceduralCharacterFrame(joy.ctx, {
      palette: PALETTE, parts: PARTS, view: "front", walkPhase: null, bobY: 0, blink: false,
      mirror: false, tilt: 0, emotion: "joy",
    });
    expect(joy.calls.some((call) => call.name === "set:fillStyle" && call.args[0] === "#f7a8b8")).toBe(true);

    const sleep = createMockContext();
    drawProceduralCharacterFrame(sleep.ctx, {
      palette: PALETTE, parts: PARTS, view: "front", walkPhase: null, bobY: 0, blink: false,
      mirror: false, tilt: 0, emotion: "sleep",
    });
    const zTexts = sleep.calls.filter((call) => call.name === "fillText" && call.args[0] === "z");
    expect(zTexts.length).toBeGreaterThanOrEqual(2);
  });

  it("슬픔은 눈물, 놀람은 땀방울을 그린다", () => {
    const sad = createMockContext();
    drawProceduralCharacterFrame(sad.ctx, {
      palette: PALETTE, parts: PARTS, view: "front", walkPhase: null, bobY: 0, blink: false,
      mirror: false, tilt: 0, emotion: "sadness",
    });
    expect(sad.calls.some((call) => call.name === "ellipse" && call.args[3] === 2.6)).toBe(true);

    const surprised = createMockContext();
    drawProceduralCharacterFrame(surprised.ctx, {
      palette: PALETTE, parts: PARTS, view: "front", walkPhase: null, bobY: 0, blink: false,
      mirror: false, tilt: 0, emotion: "surprise",
    });
    expect(surprised.calls.some((call) => call.name === "ellipse" && call.args[2] === 2 && call.args[3] === 3)).toBe(true);
  });

  it("측면도 감정 표정이 깨지지 않는다", () => {
    for (const emotion of ["joy", "sadness", "surprise", "sleep", "focus", "neutral"] as const) {
      const { ctx, calls } = createMockContext();
      drawProceduralCharacterFrame(ctx, {
        palette: PALETTE, parts: PARTS, view: "side", walkPhase: null, bobY: 0, blink: false,
        mirror: true, tilt: 0, emotion,
      });
      expect(calls.length, emotion).toBeGreaterThan(10);
    }
  });

  it("미리보기에 감정을 지정할 수 있다", () => {
    const { deps } = createMockDeps("data:image/png;base64,EMOTION");
    const preview = renderProceduralCharacterPreview(PALETTE, PARTS, deps, "sleep");
    expect(preview.dataUrl).toBe("data:image/png;base64,EMOTION");
    // 기본 호출(감정 없음)은 neutral과 같은 dataURL을 만든다.
    const neutral = renderProceduralCharacterPreview(PALETTE, PARTS, deps);
    expect(neutral.width).toBe(preview.width);
  });
});
