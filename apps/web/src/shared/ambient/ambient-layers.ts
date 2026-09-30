/**
 * 배경 효과 카탈로그: 장면(비·눈·햇살…)을 캔버스 레이어 명세로 바꾸는 순수 함수.
 *
 * - 개수는 기준 화면(1440×900)의 vivid 값을 정해 두고, 그리는 넓이에 비례시킨다
 *   (전체 화면과 설정 미리보기의 밀도가 같아 보이도록).
 * - subtle(기본)은 희박하게, 저사양이면 다시 절반.
 * - 색은 자연물(빗줄기·눈·꽃잎·낙엽·햇빛)의 색을 어두운/밝은 바탕에 맞춰 한곳(PALETTES)에 둔다.
 *   화면 전체를 덮는 반투명 막은 만들지 않는다. 구름도 틈이 있는 실루엣으로만 그린다.
 */

import type { AmbientScene, AmbientSceneKind } from "./ambient-engine";
import type { AmbientTimePhase } from "./ambient-time";

/** 바탕 밝기. 테마의 dark/light 모드를 따른다. */
export type AmbientTone = "dark" | "light";

export interface AmbientRange {
  readonly min: number;
  readonly max: number;
}

export type AmbientParticleStyle = "streak" | "flake" | "petal" | "leaf" | "glow" | "star" | "mote";

/** 파티클이 생기는 세로 영역. */
export type AmbientParticleRegion = "full" | "upper" | "lower";

export interface AmbientParticleLayerSpec {
  readonly type: "particles";
  readonly style: AmbientParticleStyle;
  readonly count: number;
  /** 세로 속도(px/s). 음수면 위로 떠오른다. */
  readonly fall: AmbientRange;
  /** 가로 속도(px/s). 바람 방향. */
  readonly drift: AmbientRange;
  /** 크기(px). 빗줄기는 길이, 나머지는 지름 기준. */
  readonly size: AmbientRange;
  readonly opacity: AmbientRange;
  /** 좌우 흔들림 폭(px). */
  readonly sway: AmbientRange;
  readonly colors: readonly string[];
  /** 반짝임 속도(초당 주기). null이면 반짝이지 않는다. */
  readonly twinkle: AmbientRange | null;
  readonly region: AmbientParticleRegion;
  /** 밝게 더해 그릴지(어두운 바탕의 빛 효과). */
  readonly additive: boolean;
  /** 가끔 지나가는 별똥별(맑은 밤·화려하게). */
  readonly shootingStars: AmbientRange | null;
}

export interface AmbientSunRaysLayerSpec {
  readonly type: "sunrays";
  readonly corner: "top-left" | "top-right";
  readonly beams: number;
  /** "r, g, b" */
  readonly rgb: string;
  /** 줄기 시작점의 최대 알파. */
  readonly opacity: number;
  readonly additive: boolean;
}

export interface AmbientCloudLayerSpec {
  readonly type: "clouds";
  readonly count: number;
  readonly rgb: string;
  readonly opacity: AmbientRange;
  /** 가로 흐름 속도(px/s). */
  readonly speed: AmbientRange;
  /** 구름이 머무는 상단 영역 비율(0~1). */
  readonly band: number;
  /** 구름 크기 배율(기준 폭 대비). */
  readonly scale: AmbientRange;
}

export interface AmbientFlashLayerSpec {
  readonly type: "flash";
  /** 번쩍임 사이 최소 간격(초). 광과민 안전 기준상 8초 이상. */
  readonly minIntervalSeconds: number;
  readonly maxIntervalSeconds: number;
  /** 최대 알파. 낮게 유지한다. */
  readonly peakOpacity: number;
  readonly rgb: string;
}

export type AmbientLayerSpec =
  | AmbientParticleLayerSpec
  | AmbientSunRaysLayerSpec
  | AmbientCloudLayerSpec
  | AmbientFlashLayerSpec;

/** 광과민 안전 기준: 번쩍임은 8초에 최대 1회, 알파는 이 값 이하. */
export const AMBIENT_FLASH_MIN_INTERVAL_SECONDS = 8;
export const AMBIENT_FLASH_MAX_OPACITY = 0.12;

/** 기준 화면 넓이(1440×900). 레이어 개수는 이 넓이의 vivid 값이다. */
export const AMBIENT_REFERENCE_AREA = 1440 * 900;
const SUBTLE_DENSITY = 0.45;
const LOW_POWER_DENSITY = 0.5;
/** vivid 자동 모드에서 곁들이는 계절 효과의 상대 밀도. */
const ACCENT_DENSITY = 0.4;
/** 너무 작은 영역(미리보기)에서도 효과를 알아볼 수 있는 최소 개수. */
const MIN_PARTICLES = 3;

export interface AmbientLayerContext {
  readonly tone: AmbientTone;
  readonly lowPower: boolean;
  /** 그릴 영역 넓이(CSS px²). */
  readonly area: number;
}

type LayerScene = Pick<AmbientScene, "kind" | "accent" | "intensity" | "timePhase">;

interface TonePalette {
  readonly rain: readonly string[];
  readonly snow: readonly string[];
  readonly petal: readonly string[];
  readonly leaf: readonly string[];
  readonly firefly: readonly string[];
  readonly star: readonly string[];
  readonly mote: readonly string[];
  readonly sunrays: Readonly<Record<Exclude<AmbientTimePhase, "night">, string>>;
  readonly sunraysOpacity: number;
  readonly cloud: string;
  readonly cloudOpacity: AmbientRange;
  /** 밝은 바탕에서는 번쩍임이 거의 보이지 않아 그리지 않는다(null). */
  readonly flash: string | null;
  /** 어두운 바탕에서는 빛을 더해(lighter) 그린다. */
  readonly additiveLight: boolean;
  readonly rainOpacity: AmbientRange;
  readonly snowOpacity: AmbientRange;
}

const PALETTES: Readonly<Record<AmbientTone, TonePalette>> = {
  dark: {
    rain: ["#a9c3e8", "#c6d7f2"],
    snow: ["#ffffff", "#e6eeff"],
    petal: ["#ffc6da", "#ffb2cc", "#ffdbe7"],
    leaf: ["#f0a04b", "#e2733c", "#f2c14e", "#c95a3f"],
    firefly: ["#f4f79a", "#e9f58c"],
    star: ["#ffffff", "#dde6ff", "#fff0c4"],
    mote: ["#fff2c7", "#ffe2a0"],
    sunrays: {
      dawn: "255, 196, 150",
      morning: "255, 234, 196",
      day: "255, 243, 214",
      evening: "255, 188, 122",
    },
    sunraysOpacity: 0.16,
    cloud: "188, 200, 232",
    cloudOpacity: { min: 0.1, max: 0.17 },
    flash: "206, 220, 255",
    additiveLight: true,
    rainOpacity: { min: 0.22, max: 0.48 },
    snowOpacity: { min: 0.45, max: 0.9 },
  },
  light: {
    rain: ["#5a7aa3", "#7390b6"],
    snow: ["#9cb3d2", "#b6c8e1"],
    petal: ["#f08bb2", "#f5a3c3", "#ec7aa5"],
    leaf: ["#d9822b", "#c2562a", "#cf9a1f", "#a8452f"],
    firefly: ["#d99a0b", "#e0a91c"],
    star: ["#8a7fd0", "#b88f2a"],
    mote: ["#e3a93c", "#f0c35e"],
    sunrays: {
      dawn: "255, 170, 110",
      morning: "255, 198, 108",
      day: "255, 204, 118",
      evening: "255, 160, 92",
    },
    sunraysOpacity: 0.22,
    cloud: "118, 136, 168",
    cloudOpacity: { min: 0.1, max: 0.16 },
    flash: null,
    additiveLight: false,
    rainOpacity: { min: 0.3, max: 0.55 },
    snowOpacity: { min: 0.55, max: 0.9 },
  },
};

function range(min: number, max: number): AmbientRange {
  return { min, max };
}

/** 밀도 배율: 강도 × 저사양 × 넓이. */
export function ambientDensityScale(
  intensity: LayerScene["intensity"],
  context: AmbientLayerContext,
): number {
  const areaScale = Math.min(Math.max(context.area / AMBIENT_REFERENCE_AREA, 0), 1.6);
  return (
    (intensity === "vivid" ? 1 : SUBTLE_DENSITY)
    * (context.lowPower ? LOW_POWER_DENSITY : 1)
    * areaScale
  );
}

function scaledCount(base: number, scale: number, minimum = MIN_PARTICLES): number {
  return Math.max(minimum, Math.round(base * scale));
}

interface ParticleRecipe extends Omit<AmbientParticleLayerSpec, "type" | "count" | "shootingStars"> {
  /** 기준 화면 vivid 개수. */
  readonly baseCount: number;
}

function particleLayer(
  recipe: ParticleRecipe,
  scale: number,
  shootingStars: AmbientRange | null = null,
): AmbientParticleLayerSpec {
  const { baseCount, ...rest } = recipe;
  return { type: "particles", ...rest, count: scaledCount(baseCount, scale), shootingStars };
}

function rainRecipe(palette: TonePalette, storm: boolean): ParticleRecipe {
  return {
    style: "streak",
    baseCount: storm ? 210 : 170,
    fall: storm ? range(780, 1060) : range(620, 900),
    drift: storm ? range(120, 190) : range(50, 110),
    size: range(14, 26),
    opacity: palette.rainOpacity,
    sway: range(0, 0),
    colors: palette.rain,
    twinkle: null,
    region: "full",
    additive: false,
  };
}

function snowRecipe(palette: TonePalette): ParticleRecipe {
  return {
    style: "flake",
    baseCount: 110,
    fall: range(26, 70),
    drift: range(-12, 18),
    size: range(3, 8),
    opacity: palette.snowOpacity,
    sway: range(8, 26),
    colors: palette.snow,
    twinkle: null,
    region: "full",
    additive: false,
  };
}

function petalRecipe(palette: TonePalette): ParticleRecipe {
  return {
    style: "petal",
    baseCount: 38,
    fall: range(26, 58),
    drift: range(12, 40),
    size: range(7, 12),
    opacity: range(0.6, 0.95),
    sway: range(14, 34),
    colors: palette.petal,
    twinkle: null,
    region: "full",
    additive: false,
  };
}

function leafRecipe(palette: TonePalette): ParticleRecipe {
  return {
    style: "leaf",
    baseCount: 26,
    fall: range(30, 64),
    drift: range(-10, 30),
    size: range(10, 17),
    opacity: range(0.65, 0.95),
    sway: range(18, 42),
    colors: palette.leaf,
    twinkle: null,
    region: "full",
    additive: false,
  };
}

function fireflyRecipe(palette: TonePalette, baseCount: number): ParticleRecipe {
  return {
    style: "glow",
    baseCount,
    fall: range(-9, 9),
    drift: range(-14, 14),
    size: range(2, 3.6),
    opacity: range(0.55, 1),
    sway: range(4, 12),
    colors: palette.firefly,
    twinkle: range(0.25, 0.7),
    region: "lower",
    additive: palette.additiveLight,
  };
}

function starRecipe(palette: TonePalette): ParticleRecipe {
  return {
    style: "star",
    baseCount: 120,
    fall: range(0, 0),
    drift: range(-1.5, 1.5),
    size: range(1.2, 3.4),
    opacity: range(0.35, 0.95),
    sway: range(0, 0),
    colors: palette.star,
    twinkle: range(0.15, 0.55),
    region: "upper",
    additive: palette.additiveLight,
  };
}

function moteRecipe(palette: TonePalette): ParticleRecipe {
  return {
    style: "mote",
    baseCount: 34,
    fall: range(-14, -4),
    drift: range(-6, 10),
    size: range(2.4, 5.6),
    opacity: range(0.35, 0.8),
    sway: range(6, 18),
    colors: palette.mote,
    twinkle: range(0.2, 0.55),
    region: "upper",
    additive: palette.additiveLight,
  };
}

/** 아침 해는 왼쪽 위, 한낮·저녁 해는 오른쪽 위에서 비춘다. */
function sunCorner(phase: AmbientTimePhase): AmbientSunRaysLayerSpec["corner"] {
  return phase === "dawn" || phase === "morning" ? "top-left" : "top-right";
}

function sceneLayers(
  kind: AmbientSceneKind,
  intensity: LayerScene["intensity"],
  phase: AmbientTimePhase,
  palette: TonePalette,
  scale: number,
): AmbientLayerSpec[] {
  const vivid = intensity === "vivid";
  switch (kind) {
    case "rain":
      return [particleLayer(rainRecipe(palette, false), scale)];
    case "thunderstorm": {
      const layers: AmbientLayerSpec[] = [];
      if (palette.flash) {
        layers.push({
          type: "flash",
          minIntervalSeconds: 9,
          maxIntervalSeconds: 20,
          peakOpacity: vivid ? 0.1 : 0.07,
          rgb: palette.flash,
        });
      }
      layers.push(particleLayer(rainRecipe(palette, true), scale));
      return layers;
    }
    case "snow":
      return [particleLayer(snowRecipe(palette), scale)];
    case "petals":
      return [particleLayer(petalRecipe(palette), scale)];
    case "leaves":
      return [particleLayer(leafRecipe(palette), scale)];
    case "fireflies":
      return [particleLayer(fireflyRecipe(palette, 34), scale)];
    case "sunny": {
      const light = phase === "night" ? "day" : phase;
      return [
        {
          type: "sunrays",
          corner: sunCorner(phase),
          beams: vivid ? 6 : 4,
          rgb: palette.sunrays[light],
          opacity: palette.sunraysOpacity * (vivid ? 1 : 0.65),
          additive: palette.additiveLight,
        },
        particleLayer(moteRecipe(palette), scale),
      ];
    }
    case "clear-night":
      return [
        particleLayer(starRecipe(palette), scale, vivid ? range(10, 22) : null),
        particleLayer(fireflyRecipe(palette, 8), scale),
      ];
    case "cloudy":
      return [
        {
          type: "clouds",
          count: vivid ? 6 : 4,
          rgb: palette.cloud,
          opacity: palette.cloudOpacity,
          speed: range(6, 16),
          band: 0.38,
          scale: range(0.8, 1.35),
        },
      ];
  }
}

/**
 * 장면 → 레이어 목록(그리는 순서대로: 번쩍임·구름·햇살이 뒤, 파티클이 앞).
 */
export function buildAmbientLayers(scene: LayerScene, context: AmbientLayerContext): AmbientLayerSpec[] {
  const palette = PALETTES[context.tone];
  const scale = ambientDensityScale(scene.intensity, context);
  const layers = sceneLayers(scene.kind, scene.intensity, scene.timePhase, palette, scale);
  if (scene.accent) {
    const accent = sceneLayers(scene.accent, scene.intensity, scene.timePhase, palette, scale * ACCENT_DENSITY)
      .filter((layer): layer is AmbientParticleLayerSpec => layer.type === "particles");
    layers.push(...accent);
  }
  return layers;
}
