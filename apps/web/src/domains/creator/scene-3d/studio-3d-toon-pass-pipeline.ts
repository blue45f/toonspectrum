export type ToonPassType =
  | "beauty"
  | "line-art"
  | "screentone"
  | "shadow-ao"
  | "depth"
  | "object-id"
  | "normal"
  | "material-id"
  | "rim-light";

export type LayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "color-dodge";

export interface ToonPassConfig {
  passType: ToonPassType;
  enabled: boolean;
  resolutionMultiplier: number; // 1 = 1x, 2 = 2x supersampling
  bitDepth: 8 | 16 | 32;
  channelName: string;
  blendMode: LayerBlendMode;
  opacity: number; // 0.0 ~ 1.0
}

export type ToonRenderQualityPreset = "draft" | "interactive" | "final";

export interface ToonPassTypeUi {
  readonly labelKo: string;
  readonly labelEn: string;
  /** 한 줄 설명(10초 이해용). */
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 호버 툴팁. */
  readonly tooltipKo: string;
  readonly tooltipEn: string;
}

/** 툰 렌더 패스 UI 메타데이터(ko/en, 한줄설명+툴팁). */
export const TOON_PASS_TYPE_UI: Readonly<Record<ToonPassType, ToonPassTypeUi>> =
  Object.freeze({
    beauty: Object.freeze({
      labelKo: "뷰티(완성본)",
      labelEn: "Beauty",
      descriptionKo: "조명·색이 모두 입혀진 최종 화면.",
      descriptionEn: "Final frame with lighting and color.",
      tooltipKo: "뷰티 — 최종 완성 화면. 다른 패스의 합성 기준이 됩니다.",
      tooltipEn: "Beauty — the final frame. Reference for compositing.",
    }),
    "line-art": Object.freeze({
      labelKo: "선화",
      labelEn: "Line art",
      descriptionKo: "외곽선만 뽑은 투명 잉크 레이어.",
      descriptionEn: "Transparent ink layer of outlines only.",
      tooltipKo: "선화 — 깊이·법선 기반 외곽선. 원고 잉크의 핵심.",
      tooltipEn: "Line art — depth/normal outlines. Core of the ink pass.",
    }),
    screentone: Object.freeze({
      labelKo: "스크린톤",
      labelEn: "Screentone",
      descriptionKo: "망점·빗금으로 음영을 찍는 만화 톤.",
      descriptionEn: "Halftone dots and hatching for shading.",
      tooltipKo: "스크린톤 — 망점·빗금·다이아 패턴의 만화식 음영.",
      tooltipEn: "Screentone — manga-style halftone shading.",
    }),
    "shadow-ao": Object.freeze({
      labelKo: "그림자·AO",
      labelEn: "Shadow & AO",
      descriptionKo: "툰 음영과 접촉 음영을 분리한 레이어.",
      descriptionEn: "Separated cel shadow and ambient occlusion.",
      tooltipKo: "그림자·AO — 곱하기 합성용 툰 음영과 접촉부 음영.",
      tooltipEn: "Shadow & AO — multiply-blend cel and contact shadows.",
    }),
    depth: Object.freeze({
      labelKo: "깊이맵",
      labelEn: "Depth",
      descriptionKo: "원근·심도·AI 제어용 거리 정보.",
      descriptionEn: "Distance data for depth and AI control.",
      tooltipKo: "깊이맵 — 대기원근·심도·ControlNet용 선형 깊이.",
      tooltipEn: "Depth — linear depth for atmosphere and ControlNet.",
    }),
    "object-id": Object.freeze({
      labelKo: "오브젝트 ID",
      labelEn: "Object ID",
      descriptionKo: "캐릭터·소품을 다시 선택하는 마스크.",
      descriptionEn: "Mask to reselect characters and props.",
      tooltipKo: "오브젝트 ID — 장면 요소를 안정적으로 다시 고르는 마스크.",
      tooltipEn: "Object ID — stable mask for reselecting scene items.",
    }),
    normal: Object.freeze({
      labelKo: "법선맵",
      labelEn: "Normal",
      descriptionKo: "표면 방향 정보. 리라이팅용.",
      descriptionEn: "Surface direction data. For relighting.",
      tooltipKo: "법선맵 — 후반 리라이팅·노멀 컨트롤용 벡터.",
      tooltipEn: "Normal — vectors for relighting and normal control.",
    }),
    "material-id": Object.freeze({
      labelKo: "재질 ID",
      labelEn: "Material ID",
      descriptionKo: "피부·의상·금속별 보정 선택용 마스크.",
      descriptionEn: "Mask for per-material corrections.",
      tooltipKo: "재질 ID — 피부·의상·금속 등 재질별 보정 선택용.",
      tooltipEn: "Material ID — per-material correction masks.",
    }),
    "rim-light": Object.freeze({
      labelKo: "림라이트",
      labelEn: "Rim light",
      descriptionKo: "역광 하이라이트. 애니메 감성의 핵심.",
      descriptionEn: "Backlight highlights. Anime glow essentials.",
      tooltipKo: "림라이트 — 스크린 합성용 역광·안광 하이라이트.",
      tooltipEn: "Rim light — screen-blend backlight highlights.",
    }),
  });

export interface ToonRenderQualityPresetUi {
  readonly labelKo: string;
  readonly labelEn: string;
  readonly tooltipKo: string;
  readonly tooltipEn: string;
}

/** 렌더 품질 프리셋 UI 메타데이터(ko/en 라벨+툴팁). */
export const TOON_RENDER_QUALITY_PRESET_UI: Readonly<
  Record<ToonRenderQualityPreset, ToonRenderQualityPresetUi>
> = Object.freeze({
  draft: Object.freeze({
    labelKo: "초안",
    labelEn: "Draft",
    tooltipKo: "초안 — 빠르게 확인하는 저해상도 미리보기.",
    tooltipEn: "Draft — fast low-res preview.",
  }),
  interactive: Object.freeze({
    labelKo: "작업용",
    labelEn: "Interactive",
    tooltipKo: "작업용 — 편집 중 실시간으로 쓰는 표준 품질.",
    tooltipEn: "Interactive — standard quality for live editing.",
  }),
  final: Object.freeze({
    labelKo: "최종",
    labelEn: "Final",
    tooltipKo: "최종 — 2배 슈퍼샘플링의 출판용 고해상도.",
    tooltipEn: "Final — 2x supersampled print quality.",
  }),
});

export interface Studio3DToonPipelineProfile {
  id: string;
  name: string;
  quality: ToonRenderQualityPreset;
  passes: Record<ToonPassType, ToonPassConfig>;
  outlineThickness: number;
  creaseAngleThreshold: number;
  shadowBands: number; // 카툰 섀도우 단수 (예: 2 = 2단 툰 섀딩)
  depthFogEnabled: boolean;
  rimLightIntensity: number;
  screentoneFrequency: number;
}

export function createDefaultToonPipelineProfile(
  id = "toon-standard",
  name = "웹툰 표준 카툰 렌더 프로필",
  quality: ToonRenderQualityPreset = "interactive",
): Studio3DToonPipelineProfile {
  return {
    id,
    name,
    quality,
    outlineThickness: 1.5,
    creaseAngleThreshold: 35,
    shadowBands: 2,
    depthFogEnabled: true,
    rimLightIntensity: 0.7,
    screentoneFrequency: 60,
    passes: {
      beauty: {
        passType: "beauty",
        enabled: true,
        resolutionMultiplier: quality === "final" ? 2 : 1,
        bitDepth: 8,
        channelName: "RGB Color",
        blendMode: "normal",
        opacity: 1.0,
      },
      "line-art": {
        passType: "line-art",
        enabled: true,
        resolutionMultiplier: quality === "final" ? 2 : 1,
        bitDepth: 8,
        channelName: "Line Ink Layer",
        blendMode: "multiply",
        opacity: 1.0,
      },
      screentone: {
        passType: "screentone",
        enabled: false,
        resolutionMultiplier: quality === "final" ? 2 : 1,
        bitDepth: 8,
        channelName: "Manga Screentone",
        blendMode: "multiply",
        opacity: 0.8,
      },
      "shadow-ao": {
        passType: "shadow-ao",
        enabled: true,
        resolutionMultiplier: 1,
        bitDepth: 8,
        channelName: "Toon Shadow & AO",
        blendMode: "multiply",
        opacity: 0.85,
      },
      depth: {
        passType: "depth",
        enabled: true,
        resolutionMultiplier: 1,
        bitDepth: 16,
        channelName: "Linear Depth Map",
        blendMode: "normal",
        opacity: 1.0,
      },
      "object-id": {
        passType: "object-id",
        enabled: true,
        resolutionMultiplier: 1,
        bitDepth: 8,
        channelName: "Object Mask ID",
        blendMode: "normal",
        opacity: 1.0,
      },
      normal: {
        passType: "normal",
        enabled: false,
        resolutionMultiplier: 1,
        bitDepth: 16,
        channelName: "World Normal",
        blendMode: "normal",
        opacity: 1.0,
      },
      "material-id": {
        passType: "material-id",
        enabled: false,
        resolutionMultiplier: 1,
        bitDepth: 8,
        channelName: "Material Mask ID",
        blendMode: "normal",
        opacity: 1.0,
      },
      "rim-light": {
        passType: "rim-light",
        enabled: true,
        resolutionMultiplier: 1,
        bitDepth: 8,
        channelName: "Anime Rim Light",
        blendMode: "screen",
        opacity: 0.75,
      },
    },
  };
}

export function createMangaMonochromeProfile(): Studio3DToonPipelineProfile {
  const profile = createDefaultToonPipelineProfile("toon-manga-mono", "흑백 출판 만화 잉크 & 톤", "final");
  profile.outlineThickness = 2.0;
  profile.shadowBands = 1;
  profile.passes.screentone.enabled = true;
  profile.passes.beauty.enabled = false;
  profile.passes["rim-light"].enabled = false;
  return profile;
}

export function createCinematicActionProfile(): Studio3DToonPipelineProfile {
  const profile = createDefaultToonPipelineProfile("toon-action-noir", "시네마틱 액션 노아르", "final");
  profile.outlineThickness = 2.5;
  profile.shadowBands = 3;
  profile.rimLightIntensity = 1.2;
  profile.passes["rim-light"].enabled = true;
  profile.passes.normal.enabled = true;
  return profile;
}

export class Studio3DToonPassPipeline {
  private profile: Studio3DToonPipelineProfile;

  constructor(profile = createDefaultToonPipelineProfile()) {
    this.profile = profile;
  }

  public getProfile(): Studio3DToonPipelineProfile {
    return this.profile;
  }

  public setQuality(quality: ToonRenderQualityPreset): void {
    this.profile.quality = quality;
    const mult = quality === "final" ? 2 : 1;
    this.profile.passes.beauty.resolutionMultiplier = mult;
    this.profile.passes["line-art"].resolutionMultiplier = mult;
    this.profile.passes.screentone.resolutionMultiplier = mult;
  }

  public setOutlineThickness(thickness: number): void {
    this.profile.outlineThickness = Math.max(0.1, Math.min(10, thickness));
  }

  public setShadowBands(bands: number): void {
    this.profile.shadowBands = Math.max(1, Math.min(5, Math.round(bands)));
  }

  public setRimLightIntensity(intensity: number): void {
    this.profile.rimLightIntensity = Math.max(0, Math.min(3, intensity));
  }

  public togglePass(passType: ToonPassType, enabled?: boolean): void {
    if (this.profile.passes[passType]) {
      this.profile.passes[passType].enabled = enabled ?? !this.profile.passes[passType].enabled;
    }
  }

  public setPassOpacity(passType: ToonPassType, opacity: number): void {
    if (this.profile.passes[passType]) {
      this.profile.passes[passType].opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  public getActivePassTypes(): ToonPassType[] {
    return (Object.keys(this.profile.passes) as ToonPassType[]).filter(
      (key) => this.profile.passes[key].enabled,
    );
  }

  public generatePsdLayerManifest(): Array<{
    name: string;
    type: ToonPassType;
    bitDepth: number;
    blendMode: LayerBlendMode;
    opacity: number;
  }> {
    return this.getActivePassTypes().map((passType) => {
      const cfg = this.profile.passes[passType];
      return {
        name: cfg.channelName,
        type: passType,
        bitDepth: cfg.bitDepth,
        blendMode: cfg.blendMode,
        opacity: cfg.opacity,
      };
    });
  }
}
