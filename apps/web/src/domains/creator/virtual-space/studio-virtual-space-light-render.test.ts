import type * as Phaser from "phaser";
import { describe, expect, it, vi } from "vitest";
import type { ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";
import * as dayNightCycle from "./studio-virtual-space-day-night-cycle";
import {
  createStudioLightFixture,
  type StudioLightFixture,
} from "./studio-virtual-space-lighting";
import {
  buildStudioFixtureLights,
  buildStudioLightGlowSprite,
  buildStudioPropShadows,
  buildStudioScreenLights,
  queueStudioLightTextures,
  selectStudioObjectLights,
  studioLightRenderRealTimeOfDay,
  studioNeonFlicker,
  studioObjectLightBudget,
  studioObjectLightFrame,
  studioPropShadowFrame,
  StudioVirtualLightRenderRuntime,
  STUDIO_LIGHT_GLOW_TEXTURE_KEY,
  STUDIO_NEON_GLOW_PALETTE,
  STUDIO_OBJECT_LIGHT_ALPHA_MAX,
  STUDIO_OBJECT_LIGHT_MAX,
  type StudioObjectLight,
} from "./studio-virtual-space-light-render";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

function fixture(partial: Parameters<typeof createStudioLightFixture>[0]): StudioLightFixture {
  return createStudioLightFixture(partial);
}

/** 테스트 대상이 없으면 즉시 실패하게 하는 조회 헬퍼. */
function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label}가 없습니다.`);
  return value;
}

const LAMP = fixture({ id: "lamp-1", kind: "floor-lamp", position: { x: 200, y: 300 }, dimmer: 0.9 });
const NEON = fixture({ id: "neon-1", kind: "neon-sign", position: { x: 600, y: 200 }, dimmer: 1 });

describe("buildStudioFixtureLights", () => {
  it("켜진 기구만 광원이 되고 종류별 성격이 붙는다", () => {
    const lights = buildStudioFixtureLights([
      LAMP,
      NEON,
      fixture({ id: "off-1", kind: "desk-lamp", position: { x: 10, y: 10 }, on: false }),
      fixture({ id: "dim-0", kind: "desk-lamp", position: { x: 10, y: 10 }, dimmer: 0 }),
      fixture({ id: "strings", kind: "string-lights", position: { x: 50, y: 60 }, dimmer: 0.5 }),
      fixture({ id: "ceil", kind: "ceiling-light", position: { x: 70, y: 80 }, dimmer: 1 }),
      fixture({ id: "spot", kind: "spotlight", position: { x: 90, y: 100 }, dimmer: 1 }),
    ]);
    expect(lights.map((light) => light.id)).toEqual(["lamp-1", "neon-1", "strings", "ceil", "spot"]);
    const byId = new Map(lights.map((light) => [light.id, light]));
    expect(must(byId.get("lamp-1"), "lamp-1").character).toBe("steady");
    expect(must(byId.get("neon-1"), "neon-1").character).toBe("neon");
    expect(must(byId.get("strings"), "strings").character).toBe("twinkle");
    // 천장등은 기본 반경보다 넓게, 스포트라이트는 좁게 퍼진다.
    expect(must(byId.get("ceil"), "ceil").radius).toBeGreaterThan(260);
    expect(must(byId.get("spot"), "spot").radius).toBeLessThan(150);
    // 디머가 세기에 반영된다.
    expect(must(byId.get("strings"), "strings").intensity).toBeCloseTo(0.4);
  });

  it("네온 색상은 id로 결정적으로 정해지고 팔레트 안에 있다", () => {
    const first = must(buildStudioFixtureLights([NEON])[0], "neon light");
    const second = must(buildStudioFixtureLights([NEON])[0], "neon light");
    expect(first.color).toBe(second.color);
    expect(STUDIO_NEON_GLOW_PALETTE).toContain(first.color);
  });

  it("따뜻한 기구는 따뜻한 색, 차가운 기구는 차가운 색을 쓴다", () => {
    const warm = must(buildStudioFixtureLights([fixture({ id: "w", kind: "floor-lamp", position: { x: 0, y: 0 }, warm: true })])[0], "warm light");
    const cool = must(buildStudioFixtureLights([fixture({ id: "c", kind: "floor-lamp", position: { x: 0, y: 0 }, warm: false })])[0], "cool light");
    expect(warm.color).toBe(0xffc384);
    expect(cool.color).toBe(0xd6e7ff);
  });
});

describe("buildStudioScreenLights", () => {
  it("기본 월드의 모니터·터미널·콘솔·상태판에서만 화면 광원이 나온다", () => {
    const lights = buildStudioScreenLights(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(lights.map((light) => light.id).sort()).toEqual([
      "screen:asset-archive-terminal",
      "screen:production-control-board",
      "screen:quality-control-console",
      "screen:release-delivery-console",
      "screen:review-theater-monitor",
      "screen:storyboard-wall",
    ]);
    for (const light of lights) {
      expect(light.character).toBe("screen");
      expect(light.color).toBe(0x93ccff);
      expect(light.intensity).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("studioObjectLightBudget · selectStudioObjectLights (성능 가드)", () => {
  it("dynamicLights가 꺼진 등급에서는 광원이 0개다", () => {
    expect(studioObjectLightBudget({ dynamicLights: false, particleRatio: 1 }).maxLights).toBe(0);
  });

  it("비율에 따라 상한이 스케일되고 절대 상한을 넘지 않는다", () => {
    expect(studioObjectLightBudget({ dynamicLights: true, particleRatio: 0 }).maxLights).toBe(8);
    expect(studioObjectLightBudget({ dynamicLights: true, particleRatio: 1 }).maxLights).toBe(STUDIO_OBJECT_LIGHT_MAX);
    expect(studioObjectLightBudget({ dynamicLights: true, particleRatio: 5 }).maxLights).toBe(STUDIO_OBJECT_LIGHT_MAX);
  });

  it("선택은 상한을 지키고 밝고 가까운 광원을 우선하며 결정적이다", () => {
    const many: StudioObjectLight[] = Array.from({ length: 40 }, (_, index) => ({
      id: `l-${index}`, x: 100 + index * 30, y: 100, radius: 150,
      color: 0xffffff, intensity: 0.4, character: "steady" as const, seed: index,
    }));
    const bright: StudioObjectLight = {
      id: "bright", x: 500, y: 100, radius: 200, color: 0xffffff, intensity: 1, character: "steady", seed: 1,
    };
    const focus = { x: 500, y: 100 };
    const first = selectStudioObjectLights([...many, bright], focus, 10);
    const second = selectStudioObjectLights([...many, bright], focus, 10);
    expect(first).toHaveLength(10);
    expect(must(first[0], "first selected").id).toBe("bright");
    expect(first.map((light) => light.id)).toEqual(second.map((light) => light.id));
    expect(selectStudioObjectLights([bright], focus, 0)).toEqual([]);
  });
});

describe("studioNeonFlicker", () => {
  it("항상 0.5~1 사이에 있고 시간에 따라 변한다", () => {
    const values = new Set<number>();
    for (let t = 0; t < 5000; t += 37) {
      const value = studioNeonFlicker(123, t);
      expect(value).toBeGreaterThanOrEqual(0.5);
      expect(value).toBeLessThanOrEqual(1);
      values.add(Math.round(value * 100));
    }
    expect(values.size).toBeGreaterThan(3);
  });

  it("같은 입력이면 같은 값이다 (결정적)", () => {
    expect(studioNeonFlicker(42, 1234)).toBe(studioNeonFlicker(42, 1234));
    expect(studioNeonFlicker(42, 1234)).not.toBe(studioNeonFlicker(43, 1234));
  });
});

describe("studioObjectLightFrame", () => {
  const lamp = must(buildStudioFixtureLights([LAMP])[0], "lamp light");
  const neon = must(buildStudioFixtureLights([NEON])[0], "neon light");

  it("밤(어두움)에는 낮보다 오브젝트 광원이 도드라진다", () => {
    const day = studioObjectLightFrame(lamp, 1000, { darkness: 0, neonGlow: 0, reducedMotion: false });
    const night = studioObjectLightFrame(lamp, 1000, { darkness: 1, neonGlow: 0, reducedMotion: false });
    expect(night.alpha).toBeGreaterThan(day.alpha);
    expect(day.alpha).toBeGreaterThan(0);
  });

  it("어떤 조합에서도 알파 상한을 넘지 않는다", () => {
    for (const light of [lamp, neon]) {
      for (let t = 0; t < 3000; t += 113) {
        const frame = studioObjectLightFrame(light, t, { darkness: 1, neonGlow: 1, reducedMotion: false });
        expect(frame.alpha).toBeLessThanOrEqual(STUDIO_OBJECT_LIGHT_ALPHA_MAX);
        expect(frame.alpha).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("밤 네온 보정(neonGlow)이 크면 네온이 더 강해진다", () => {
    // 알파 상한(0.8)에 닿지 않는 어두움에서 비교한다.
    const plain = studioObjectLightFrame(neon, 500, { darkness: 0.4, neonGlow: 0, reducedMotion: true });
    const boosted = studioObjectLightFrame(neon, 500, { darkness: 0.4, neonGlow: 1, reducedMotion: true });
    expect(boosted.alpha).toBeGreaterThan(plain.alpha);
  });

  it("reduced-motion이면 플리커·호흡이 멈춰 시간이 지나도 같은 스타일이다", () => {
    const a = studioObjectLightFrame(neon, 100, { darkness: 0.6, neonGlow: 0.4, reducedMotion: true });
    const b = studioObjectLightFrame(neon, 4321, { darkness: 0.6, neonGlow: 0.4, reducedMotion: true });
    expect(a).toEqual(b);
  });
});

describe("가구 블롭 섀도우", () => {
  it("기본 월드에서 바닥 가구(y-sort)만 섀도우를 갖고 벽 prop은 제외된다", () => {
    const shadows = buildStudioPropShadows(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(shadows.map((shadow) => shadow.id).sort()).toEqual([
      "shadow:cafe-community-table",
      "shadow:drawing-atelier-desk",
      "shadow:meeting-room-table",
      "shadow:producer-assistant-desk",
      "shadow:quality-control-console",
      "shadow:team-pod-a",
      "shadow:team-pod-b",
      "shadow:writers-script-desk",
    ]);
    for (const shadow of shadows) {
      expect(shadow.width).toBeGreaterThanOrEqual(44);
      expect(shadow.width).toBeLessThanOrEqual(190);
    }
  });

  it("광원이 없으면 발밑 기본 그림자, 광원이 있으면 반대 방향으로 밀리고 늘어난다", () => {
    const shadow = must(
      buildStudioPropShadows(DEFAULT_STUDIO_WORLD_MANIFEST)
        .find((entry) => entry.id === "shadow:drawing-atelier-desk"),
      "desk shadow",
    );
    const plain = studioPropShadowFrame(shadow, [], 0.5);
    expect(plain.offsetX).toBe(0);
    expect(plain.stretch).toBe(1);
    expect(plain.alpha).toBeGreaterThan(0);

    const leftLight: StudioObjectLight = {
      id: "left", x: shadow.x - 60, y: shadow.y, radius: 200,
      color: 0xffc384, intensity: 1, character: "steady", seed: 1,
    };
    const pushed = studioPropShadowFrame(shadow, [leftLight], 0.5);
    expect(pushed.offsetX).toBeGreaterThan(0); // 왼쪽 광원 → 그림자는 오른쪽으로
    expect(pushed.stretch).toBeGreaterThan(1);
    expect(pushed.alpha).toBeGreaterThan(plain.alpha);
  });
});

describe("전면 틴트 부재 회귀 (이 트랙은 전면 오버레이를 만들지 않는다)", () => {
  it("주야 사이클 모듈은 전면 틴트 알파를 더 이상 산출하지 않는다", () => {
    expect("studioDayNightTintAlpha" in dayNightCycle).toBe(false);
  });
});

describe("buildStudioLightGlowSprite · queueStudioLightTextures", () => {
  function fakeDeps(stops: string[]) {
    const gradient = { addColorStop: (_offset: number, color: string) => { stops.push(color); } };
    const ctx = {
      createRadialGradient: () => gradient,
      fillStyle: "",
      fillRect: vi.fn(),
    };
    const canvas = {
      getContext: () => ctx,
      toDataURL: () => "data:image/png;base64,glow",
    };
    return { createCanvas: () => canvas } as unknown as ProceduralSheetDeps;
  }

  it("중심에서 가장자리로 투명해지는 방사형 그라데이션을 만든다", () => {
    const stops: string[] = [];
    const sprite = buildStudioLightGlowSprite(fakeDeps(stops));
    expect(sprite.dataUrl).toBe("data:image/png;base64,glow");
    expect(sprite.size).toBe(128);
    expect(must(stops[0], "first stop")).toContain("0.85");
    expect(must(stops[stops.length - 1], "last stop")).toContain(", 0)");
  });

  it("로더에 글로우 텍스처를 자체 dataURL로 올린다", () => {
    const stops: string[] = [];
    const loaded: Array<[string, string]> = [];
    queueStudioLightTextures(
      { image: (key: string, url: string) => { loaded.push([key, url]); } },
      fakeDeps(stops),
    );
    expect(loaded).toHaveLength(1);
    const entry = must(loaded[0], "loaded texture");
    expect(entry[0]).toBe(STUDIO_LIGHT_GLOW_TEXTURE_KEY);
    expect(entry[1]).toBe("data:image/png;base64,glow");
  });
});

describe("studioLightRenderRealTimeOfDay", () => {
  it("자정은 0, 정오는 0.5다", () => {
    expect(studioLightRenderRealTimeOfDay(new Date(2026, 9, 2, 0, 0, 0))).toBe(0);
    expect(studioLightRenderRealTimeOfDay(new Date(2026, 9, 2, 12, 0, 0))).toBe(0.5);
  });
});

/* ---------------- 런타임 하네스 ---------------- */

class MockImage {
  x: number; y: number; alpha = 1; visible = true; tint = 0; destroyed = false;
  displayWidth = 0; displayHeight = 0; blendMode = "";
  constructor(x: number, y: number, readonly texture: string) { this.x = x; this.y = y; }
  setDepth() { return this; }
  setBlendMode(mode: string) { this.blendMode = mode; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setTint(tint: number) { this.tint = tint; return this; }
  setDisplaySize(width: number, height: number) { this.displayWidth = width; this.displayHeight = height; return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  setVisible(visible: boolean) { this.visible = visible; return this; }
  destroy() { this.destroyed = true; }
}

class MockEllipse {
  x: number; y: number; alpha = 1; rotation = 0; destroyed = false;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
  setDepth() { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setRotation(rotation: number) { this.rotation = rotation; return this; }
  setScale() { return this; }
  setAlpha(alpha: number) { this.alpha = alpha; return this; }
  destroy() { this.destroyed = true; }
}

function harness() {
  const images: MockImage[] = [];
  const ellipses: MockEllipse[] = [];
  const scene = {
    textures: { exists: () => true },
    add: {
      image: (x: number, y: number, texture: string) => {
        const image = new MockImage(x, y, texture); images.push(image); return image;
      },
      ellipse: (x: number, y: number) => {
        const ellipse = new MockEllipse(x, y); ellipses.push(ellipse); return ellipse;
      },
    },
  };
  return { scene: scene as unknown as Pick<Phaser.Scene, "add" | "textures">, images, ellipses };
}

describe("StudioVirtualLightRenderRuntime", () => {
  const baseInput = {
    time: 1000,
    fixtures: [LAMP],
    ambientLevel: 0.3,
    neonGlow: 0.5,
    focus: { x: 200, y: 300 },
    dynamicLights: true,
    particleRatio: 1,
    reducedMotion: false,
  };

  it("가구 섀도우를 만들고, 램프+화면 광원을 글로우 스프라이트로 동기화한다", () => {
    const { scene, images } = harness();
    const runtime = new StudioVirtualLightRenderRuntime(scene, DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(runtime.shadowCount).toBe(8);
    runtime.update(baseInput);
    // 램프 1 + 화면 6 = 7 (상한 24 안)
    expect(runtime.lightSpriteCount).toBe(7);
    const lampGlow = must(images.find((image) => image.x === 200 && image.y === 300), "lamp glow");
    expect(lampGlow.tint).toBe(0xffc384);
    expect(lampGlow.blendMode).toBe("ADD");
    expect(lampGlow.alpha).toBeGreaterThan(0);
    runtime.destroy();
    expect(images.every((image) => image.destroyed)).toBe(true);
  });

  it("dynamicLights가 꺼지면 광원 스프라이트가 전부 정리된다 (섀도우는 유지)", () => {
    const { scene } = harness();
    const runtime = new StudioVirtualLightRenderRuntime(scene, DEFAULT_STUDIO_WORLD_MANIFEST);
    runtime.update(baseInput);
    expect(runtime.lightSpriteCount).toBe(7);
    runtime.update({ ...baseInput, dynamicLights: false });
    expect(runtime.lightSpriteCount).toBe(0);
    expect(runtime.shadowCount).toBe(8);
    runtime.destroy();
  });

  it("밤에는 낮보다 램프 글로우가 진해진다", () => {
    const { scene, images } = harness();
    const runtime = new StudioVirtualLightRenderRuntime(scene, DEFAULT_STUDIO_WORLD_MANIFEST);
    runtime.update({ ...baseInput, ambientLevel: 1 });
    const dayAlpha = must(images.find((image) => image.x === 200 && image.y === 300), "lamp glow").alpha;
    runtime.update({ ...baseInput, ambientLevel: 0.2 });
    const nightAlpha = must(images.find((image) => image.x === 200 && image.y === 300), "lamp glow").alpha;
    expect(nightAlpha).toBeGreaterThan(dayAlpha);
    runtime.destroy();
  });
});
